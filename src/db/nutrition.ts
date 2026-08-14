import {
  db,
  deleteSynced,
  uid,
  now,
  currentUserId,
  type FoodItem,
  type FoodLog,
  type MealSlot,
  type NutritionProfile,
  type Nutrients,
} from './db'
import { scaleNutrients } from '../lib/foodApi'
import { trainerOfClient } from './coach'
import { currentTargets } from './reports'
import {
  ACTIVITY_LEVELS,
  bmr,
  estimateExpenditure,
  localDate,
  macroTargets,
  targetKcal,
  type DayPoint,
  type ExpenditureResult,
} from '../lib/tdee'

/** Настройки питания по умолчанию: удержание веса, средняя активность. */
const DEFAULT_PROFILE: Omit<NutritionProfile, 'id' | 'updated_at'> = {
  goal: 'maintain',
  activity: 1.375,
  macro_split: { protein: 0.3, fat: 0.3, carbs: 0.4 },
  weekly_change_kg: 0,
}

/**
 * Только читает. Записи может не быть — тогда возвращаются значения по
 * умолчанию. Создавать её здесь нельзя: функция вызывается из живых
 * запросов, а запись внутри читающего запроса роняет подписку.
 */
export async function getNutritionProfile(userId = currentUserId()): Promise<NutritionProfile> {
  const existing = await db.nutritionProfile.get(userId)
  return existing ?? { id: userId, ...DEFAULT_PROFILE, updated_at: 0 }
}

export async function updateNutritionProfile(
  patch: Partial<NutritionProfile>,
  userId = currentUserId(),
) {
  const current = await getNutritionProfile(userId)
  await db.nutritionProfile.put({ ...current, ...patch, id: userId, updated_at: now() })
}

/* ------------------------------ дневник ------------------------------- */

export async function logFood(input: {
  food: FoodItem
  amount: number
  slot: MealSlot
  date?: string
  userId?: string
}): Promise<string> {
  const userId = input.userId ?? currentUserId()
  const id = uid()
  const ts = now()

  await db.foodLogs.add({
    id,
    user_id: userId,
    date: input.date ?? localDate(ts),
    // Часовой пояс записи: без него перелёт сдвинет приёмы пищи в чужой день.
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    slot: input.slot,
    food_id: input.food.id,
    name: input.food.name,
    brand: input.food.brand,
    amount: input.amount,
    unit: input.food.unit,
    // Слепок: рецептуры меняются, история пользователя меняться не должна.
    nutrients: scaleNutrients(input.food.per100, input.amount),
    logged_at: ts,
    updated_at: ts,
  })

  await rememberFood(input.food)
  return id
}

/** Быстрая запись без продукта из базы — когда known только калорийность. */
export async function logQuick(input: {
  name: string
  nutrients: Nutrients
  slot: MealSlot
  date?: string
  userId?: string
}) {
  const userId = input.userId ?? currentUserId()
  const ts = now()
  await db.foodLogs.add({
    id: uid(),
    user_id: userId,
    date: input.date ?? localDate(ts),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    slot: input.slot,
    name: input.name.trim() || 'Приём пищи',
    amount: 1,
    unit: 'шт',
    nutrients: input.nutrients,
    logged_at: ts,
    updated_at: ts,
  })
}

export async function deleteFoodLog(id: string) {
  await deleteSynced('foodLogs', id)
}

export async function updateFoodAmount(id: string, amount: number) {
  const log = await db.foodLogs.get(id)
  if (!log || !log.food_id) return
  const food = await db.foods.get(log.food_id)
  if (!food) return
  await db.foodLogs.update(id, {
    amount,
    nutrients: scaleNutrients(food.per100, amount),
    updated_at: now(),
  })
}

export async function logsForDate(date: string, userId = currentUserId()): Promise<FoodLog[]> {
  const rows = await db.foodLogs.where('[user_id+date]').equals([userId, date]).toArray()
  return rows.sort((a, b) => a.logged_at - b.logged_at)
}

/** Суммы за день. Считаем на лету: записей за сутки единицы, не тысячи. */
export function sumNutrients(logs: FoodLog[]): Nutrients {
  return logs.reduce<Nutrients>(
    (acc, l) => ({
      kcal: acc.kcal + l.nutrients.kcal,
      protein: round1(acc.protein + l.nutrients.protein),
      fat: round1(acc.fat + l.nutrients.fat),
      carbs: round1(acc.carbs + l.nutrients.carbs),
      fiber: round1((acc.fiber ?? 0) + (l.nutrients.fiber ?? 0)),
      sugar: round1((acc.sugar ?? 0) + (l.nutrients.sugar ?? 0)),
      sodium: Math.round((acc.sodium ?? 0) + (l.nutrients.sodium ?? 0)),
    }),
    { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0, sugar: 0, sodium: 0 },
  )
}

const round1 = (v: number) => Math.round(v * 10) / 10

/* ---------------------------- кеш продуктов ---------------------------- */

/** Найденный продукт кладём в базу: поиск не должен требовать сети дважды. */
export async function rememberFood(food: FoodItem) {
  await db.foods.put({ ...food, used_at: now(), updated_at: now() })
}

/** Чужие «свои» продукты в выдачу не попадают: аккаунты живут в одной базе. */
const visibleTo = (userId: string) => (f: FoodItem) =>
  f.source !== 'manual' || !f.creator_id || f.creator_id === userId

/** Недавние продукты — самый быстрый путь записи: люди едят одно и то же. */
export async function recentFoods(limit = 20, userId = currentUserId()): Promise<FoodItem[]> {
  const rows = await db.foods.toArray()
  return rows
    .filter(visibleTo(userId))
    .sort((a, b) => b.used_at - a.used_at)
    .slice(0, limit)
}

/** Локальный поиск по кешу — работает офлайн и мгновенно. */
export async function searchCachedFoods(
  query: string,
  userId = currentUserId(),
): Promise<FoodItem[]> {
  const term = query.trim().toLowerCase()
  if (!term) return recentFoods(20, userId)
  const rows = await db.foods.toArray()
  return (
    rows
      .filter(visibleTo(userId))
      .filter((f) => `${f.name} ${f.brand ?? ''}`.toLowerCase().includes(term))
      // Свои продукты вперёд: их создавали как раз потому, что базы не хватило.
      .sort(
        (a, b) =>
          Number(b.source === 'manual') - Number(a.source === 'manual') ||
          b.used_at - a.used_at,
      )
      .slice(0, 25)
  )
}

/* -------------------------- свои продукты ----------------------------- */

export type CustomFoodInput = {
  name: string
  brand?: string
  unit: 'г' | 'мл'
  /** Нутриенты на 100 г / 100 мл — как на упаковке. */
  per100: Nutrients
  /** Типичная порция: «одна котлета — 85 г». */
  serving_size?: number
  serving_label?: string
  barcode?: string
}

/**
 * Свой продукт: домашнее блюдо, местный бренд, добавка — всё, чего нет
 * во внешней базе. Живёт в той же таблице, что и кеш, поэтому попадает
 * и в поиск, и в недавние, и переиспользуется как обычный продукт.
 */
export async function saveCustomFood(
  input: CustomFoodInput,
  userId = currentUserId(),
): Promise<FoodItem> {
  const ts = now()
  const food: FoodItem = {
    id: `my-${uid()}`,
    name: input.name.trim(),
    brand: input.brand?.trim() || undefined,
    barcode: input.barcode?.trim() || undefined,
    per100: input.per100,
    unit: input.unit,
    serving_size: input.serving_size,
    serving_label: input.serving_label,
    source: 'manual',
    creator_id: userId,
    used_at: ts,
    updated_at: ts,
  }
  await db.foods.put(food)
  return food
}

export async function updateCustomFood(id: string, patch: Partial<CustomFoodInput>) {
  const food = await db.foods.get(id)
  if (!food || food.source !== 'manual')
    throw new Error('Редактировать можно только свои продукты')
  await db.foods.put({ ...food, ...patch, id, updated_at: now() })
}

export async function deleteCustomFood(id: string) {
  const food = await db.foods.get(id)
  if (!food || food.source !== 'manual') throw new Error('Удалять можно только свои продукты')
  // Записи в дневнике держат слепок нутриентов, поэтому история не пострадает.
  await deleteSynced('foods', id)
}

/** Свои продукты — отдельным списком для управления и быстрого выбора. */
export async function myFoods(userId = currentUserId()): Promise<FoodItem[]> {
  const rows = await db.foods.toArray()
  return rows
    .filter((f) => f.source === 'manual' && (!f.creator_id || f.creator_id === userId))
    .sort((a, b) => b.used_at - a.used_at)
}

/** Сколько раз продукт попадал в дневник — показываем в списке своих. */
export async function foodUsageCount(
  foodId: string,
  userId = currentUserId(),
): Promise<number> {
  return db.foodLogs
    .where('user_id')
    .equals(userId)
    .and((l) => l.food_id === foodId)
    .count()
}

/* --------------------------- расчёт расхода ---------------------------- */

/**
 * Собирает историю дней: сколько съедено и сколько весил человек.
 * Вес берём из замеров тела — отдельного дневника взвешиваний не нужно.
 */
export async function buildDayPoints(userId = currentUserId()): Promise<DayPoint[]> {
  const logs = await db.foodLogs.where('user_id').equals(userId).toArray()
  const metrics = await db.bodyMetrics.where('user_id').equals(userId).toArray()

  const byDate = new Map<string, DayPoint>()
  const touch = (date: string) => {
    const found = byDate.get(date)
    if (found) return found
    const created: DayPoint = { date }
    byDate.set(date, created)
    return created
  }

  for (const l of logs) {
    const day = touch(l.date)
    day.kcal = (day.kcal ?? 0) + l.nutrients.kcal
  }
  for (const m of metrics) {
    if (m.weight_kg == null) continue
    const day = touch(localDate(m.logged_at))
    // За день может быть несколько взвешиваний — берём последнее.
    day.weightKg = m.weight_kg
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export type NutritionPlan = {
  profile: NutritionProfile
  expenditure: ExpenditureResult
  /**
   * Целевая калорийность. null означает «цели нет» — так бывает, когда
   * человек работает с тренером, а тот норму по калориям не выдал. Ноль
   * сюда подставлять нельзя: экран тогда объявит превышением любую еду.
   */
  target: number | null
  /** Цели по макронутриентам. Каждая отдельно необязательна по той же причине. */
  macros: { protein: number | null; fat: number | null; carbs: number | null }
  /** Оценка по формуле — показываем, пока не набралось данных. */
  formula: number
  /** Норму поставил тренер, а не алгоритм. */
  fromCoach: boolean
}

/**
 * Среднее число шагов за последнюю неделю.
 *
 * Среднее, а не вчерашнее: один выходной на диване не повод срезать норму,
 * а один поход в горы — не повод её поднимать.
 */
async function weeklyStepsAverage(userId: string): Promise<number> {
  const from = localDate(Date.now() - 6 * 86400_000)
  const rows = await db.dailyActivity
    .where('[user_id+date]')
    .between([userId, from], [userId, localDate()], true, true)
    .toArray()
  const withSteps = rows.filter((r) => r.steps != null)
  if (!withSteps.length) return 0
  return Math.round(withSteps.reduce((acc, r) => acc + (r.steps ?? 0), 0) / withSteps.length)
}

/**
 * Текущий план: расход, цель и макросы. Пока фактических данных мало,
 * опирается на формулу; дальше — на наблюдаемый баланс энергии.
 */
export async function loadPlan(userId = currentUserId()): Promise<NutritionPlan> {
  const profile = await getNutritionProfile(userId)
  const user = await db.profile.get(userId)
  const days = await buildDayPoints(userId)

  const metrics = await db.bodyMetrics.where('user_id').equals(userId).sortBy('logged_at')
  const lastWeight = [...metrics].reverse().find((m) => m.weight_kg != null)?.weight_kg

  const age = user?.birth_year ? new Date().getFullYear() - user.birth_year : 30
  const base = bmr({
    weightKg: lastWeight ?? 75,
    heightCm: user?.height_cm ?? 175,
    age,
    sex: user?.gender ?? 'м',
  })
  /*
   * Шаги добавляются к формуле, а не заменяют коэффициент активности.
   *
   * Коэффициент описывает образ жизни целиком — работу, дорогу, быт; шаги
   * из них видны лишь частью. Заменять им коэффициент значит считать, что
   * человек без телефона в кармане лежит. Поэтому берём среднее за неделю и
   * прибавляем только то, что выходит за обычные три тысячи шагов, по
   * привычной оценке в 0,04 ккал на шаг на килограмм веса.
   */
  const stepsAvg = await weeklyStepsAverage(userId)
  const extraSteps = Math.max(0, stepsAvg - 3000)
  const stepsKcal = Math.round(extraSteps * 0.04 * ((lastWeight ?? 75) / 70))
  const formula = Math.round(base * profile.activity) + stepsKcal

  const expenditure = estimateExpenditure(days, formula)
  const tdee = expenditure.tdee + (profile.manual_offset ?? 0)

  /*
   * Откуда берётся цель.
   *
   * Если человек работает с тренером, целями считается только то, что тренер
   * выдал сам, — недельные рекомендации (setWeeklyTargets). Пустая метрика
   * так и остаётся пустой: приложение не подставляет вместо неё свой расчёт,
   * иначе клиент принял бы формулу за назначение тренера и ел бы по ней.
   *
   * Поля coach_* — прежний способ назначать норму, читаются как запасной,
   * чтобы у клиентов со старыми данными цель не пропала.
   *
   * Без тренера цель считается формулой: спорить не с кем, а дневник без
   * ориентира превращается в список съеденного.
   */
  const link = await trainerOfClient(userId)
  const weekly = link ? await currentTargets(userId) : null
  const fromCoach = !!link

  const target = fromCoach
    ? (weekly?.kcal ?? profile.coach_kcal ?? null)
    : targetKcal(tdee, profile.weekly_change_kg ?? 0)

  const fallbackMacros = macroTargets(target ?? formula, profile.macro_split)
  const macros = fromCoach
    ? {
        protein: weekly?.protein ?? profile.coach_macros?.protein ?? null,
        fat: weekly?.fat ?? profile.coach_macros?.fat ?? null,
        carbs: weekly?.carbs ?? profile.coach_macros?.carbs ?? null,
      }
    : fallbackMacros

  return {
    profile,
    expenditure: { ...expenditure, tdee },
    target,
    macros,
    formula,
    fromCoach,
  }
}

/** Сводка питания за период — то, что тренер смотрит у клиента. */
export type NutritionSummary = {
  daysLogged: number
  daysTotal: number
  avgKcal: number
  avgProtein: number
  avgFat: number
  avgCarbs: number
  /** Отклонение среднего от цели, ккал. null — цели не задано. */
  deviation: number | null
  points: { x: number; y: number }[]
  target: number | null
  plan: NutritionPlan
}

export async function nutritionSummary(
  userId: string,
  daysBack = 14,
): Promise<NutritionSummary> {
  const plan = await loadPlan(userId)
  const logs = await db.foodLogs.where('user_id').equals(userId).toArray()

  // Окно режем по той же дате, по которой группируем: запись, внесённая
  // сегодня задним числом, иначе прошла бы фильтр и создала «день» за
  // пределами периода, перекосив средние.
  const from = localDate(Date.now() - daysBack * 86400_000)
  const byDate = new Map<string, { kcal: number; p: number; f: number; c: number }>()

  for (const l of logs) {
    if (l.date < from) continue
    const acc = byDate.get(l.date) ?? { kcal: 0, p: 0, f: 0, c: 0 }
    acc.kcal += l.nutrients.kcal
    acc.p += l.nutrients.protein
    acc.f += l.nutrients.fat
    acc.c += l.nutrients.carbs
    byDate.set(l.date, acc)
  }

  const entries = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const n = entries.length || 1
  const sum = entries.reduce(
    (a, [, v]) => ({ kcal: a.kcal + v.kcal, p: a.p + v.p, f: a.f + v.f, c: a.c + v.c }),
    { kcal: 0, p: 0, f: 0, c: 0 },
  )

  return {
    daysLogged: entries.length,
    daysTotal: daysBack,
    avgKcal: Math.round(sum.kcal / n),
    avgProtein: Math.round(sum.p / n),
    avgFat: Math.round(sum.f / n),
    avgCarbs: Math.round(sum.c / n),
    // Без цели отклонять не от чего — «на 1500 больше нормы» без нормы
    // значит ровно ничего.
    deviation: plan.target == null ? null : Math.round(sum.kcal / n - plan.target),
    points: entries.map(([date, v]) => ({
      x: new Date(`${date}T12:00:00`).getTime(),
      y: v.kcal,
    })),
    target: plan.target,
    plan,
  }
}

/*
 * Прежний способ назначать норму КБЖУ (поля coach_* в профиле питания)
 * удалён вместе со своим экраном: цели тренера теперь одни — недельные
 * рекомендации, см. setWeeklyTargets в db/reports.ts.
 *
 * Сами поля coach_* остаются в модели и читаются loadPlan запасным
 * вариантом: у клиентов, которым норму назначили старым способом, она
 * должна продолжать работать, пока тренер не выдаст новую.
 */

/** Точки для графика тренда расхода — как менялся метаболизм по неделям. */
export async function expenditureTrend(userId = currentUserId()) {
  const days = await buildDayPoints(userId)
  const out: { x: number; y: number }[] = []

  // Скользящее окно: каждая точка — расчёт по данным, доступным на тот день.
  for (let i = 14; i < days.length; i += 3) {
    const slice = days.slice(0, i + 1)
    const res = estimateExpenditure(slice, 0)
    if (res.source !== 'adaptive') continue
    out.push({ x: new Date(`${days[i].date}T12:00:00`).getTime(), y: res.tdee })
  }
  return out
}

export { ACTIVITY_LEVELS }
