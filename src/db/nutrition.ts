import {
  db,
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
export async function getNutritionProfile(
  userId = currentUserId(),
): Promise<NutritionProfile> {
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
  await db.foodLogs.delete(id)
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

/** Недавние продукты — самый быстрый путь записи: люди едят одно и то же. */
export async function recentFoods(limit = 20): Promise<FoodItem[]> {
  const rows = await db.foods.toArray()
  return rows.sort((a, b) => b.used_at - a.used_at).slice(0, limit)
}

/** Локальный поиск по кешу — работает офлайн и мгновенно. */
export async function searchCachedFoods(query: string): Promise<FoodItem[]> {
  const term = query.trim().toLowerCase()
  if (!term) return recentFoods()
  const rows = await db.foods.toArray()
  return rows
    .filter((f) => `${f.name} ${f.brand ?? ''}`.toLowerCase().includes(term))
    .sort((a, b) => b.used_at - a.used_at)
    .slice(0, 25)
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
  /** Целевая калорийность с учётом цели по скорости изменения веса. */
  target: number
  macros: { protein: number; fat: number; carbs: number }
  /** Оценка по формуле — показываем, пока не набралось данных. */
  formula: number
  /** Норму поставил тренер, а не алгоритм. */
  fromCoach: boolean
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
  const formula = Math.round(base * profile.activity)

  const expenditure = estimateExpenditure(days, formula)
  const tdee = expenditure.tdee + (profile.manual_offset ?? 0)

  // Норма тренера главнее расчёта: спорить с ним внутри приложения нельзя.
  const fromCoach = profile.coach_kcal != null
  const target = fromCoach ? profile.coach_kcal! : targetKcal(tdee, profile.weekly_change_kg ?? 0)
  const macros =
    fromCoach && profile.coach_macros ? profile.coach_macros : macroTargets(target, profile.macro_split)

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
  /** Отклонение среднего от цели, ккал. */
  deviation: number
  points: { x: number; y: number }[]
  target: number
  plan: NutritionPlan
}

export async function nutritionSummary(
  userId: string,
  daysBack = 14,
): Promise<NutritionSummary> {
  const plan = await loadPlan(userId)
  const logs = await db.foodLogs.where('user_id').equals(userId).toArray()

  const from = Date.now() - daysBack * 86400_000
  const byDate = new Map<string, { kcal: number; p: number; f: number; c: number }>()

  for (const l of logs) {
    if (l.logged_at < from) continue
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
    deviation: Math.round(sum.kcal / n - plan.target),
    points: entries.map(([date, v]) => ({
      x: new Date(`${date}T12:00:00`).getTime(),
      y: v.kcal,
    })),
    target: plan.target,
    plan,
  }
}

/** Тренер назначает норму КБЖУ. Пустое значение снимает назначение. */
export async function setCoachTargets(
  clientId: string,
  targets: { kcal?: number; protein?: number; fat?: number; carbs?: number; note?: string } | null,
  coachId: string,
) {
  if (!targets?.kcal) {
    await updateNutritionProfile(
      { coach_kcal: undefined, coach_macros: undefined, coach_id: undefined, coach_note: undefined },
      clientId,
    )
    return
  }
  await updateNutritionProfile(
    {
      coach_kcal: targets.kcal,
      coach_macros: {
        protein: targets.protein ?? 0,
        fat: targets.fat ?? 0,
        carbs: targets.carbs ?? 0,
      },
      coach_id: coachId,
      coach_note: targets.note,
    },
    clientId,
  )
}

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
