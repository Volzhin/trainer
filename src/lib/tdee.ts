/**
 * Расчёт суточного расхода энергии.
 *
 * Статические формулы врут: у пятой части людей ошибка превышает 500 ккал,
 * а при длительном дефиците расход падает вслед за метаболической адаптацией,
 * тогда как формула продолжает считать по первому дню. Поэтому формула нужна
 * только чтобы стартовать, а дальше расход выводится из факта: сколько
 * человек ел и как менялся его вес.
 */

/** Энергетическая ценность килограмма массы тела, ккал. */
export const KCAL_PER_KG = 7700

/** Сколько дней нужно накопить, прежде чем доверять расчёту по факту. */
export const MIN_DAYS_FOR_ADAPTIVE = 14

/** Окно анализа: короче — шумит, длиннее — не замечает адаптацию. */
export const ANALYSIS_WINDOW_DAYS = 28

export type Sex = 'м' | 'ж'

/** Базовый обмен по Миффлину — Сан Жеору. */
export function bmr(input: {
  weightKg: number
  heightCm: number
  age: number
  sex: Sex
}): number {
  const base = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age
  return Math.round(base + (input.sex === 'м' ? 5 : -161))
}

/** Коэффициенты активности для стартовой оценки. */
export const ACTIVITY_LEVELS: { value: number; label: string; hint: string }[] = [
  { value: 1.2, label: 'Сидячий', hint: 'Работа за столом, тренировок нет' },
  { value: 1.375, label: 'Лёгкий', hint: '1–3 тренировки в неделю' },
  { value: 1.55, label: 'Средний', hint: '3–5 тренировок в неделю' },
  { value: 1.725, label: 'Высокий', hint: '6–7 тренировок в неделю' },
  { value: 1.9, label: 'Очень высокий', hint: 'Физический труд или две тренировки в день' },
]

/** Экспоненциальное сглаживание: вес и еда шумят слишком сильно для сырых чисел. */
export function ema(values: number[], alpha = 0.25): number[] {
  const out: number[] = []
  let acc = values[0]
  for (const v of values) {
    acc = alpha * v + (1 - alpha) * acc
    out.push(acc)
  }
  return out
}

/** Наклон прямой по методу наименьших квадратов: изменение за единицу x. */
export function slope(points: { x: number; y: number }[]): number {
  const n = points.length
  if (n < 2) return 0
  const mx = points.reduce((a, p) => a + p.x, 0) / n
  const my = points.reduce((a, p) => a + p.y, 0) / n
  let num = 0
  let den = 0
  for (const p of points) {
    num += (p.x - mx) * (p.y - my)
    den += (p.x - mx) ** 2
  }
  return den === 0 ? 0 : num / den
}

export type DayPoint = {
  /** Локальная дата, YYYY-MM-DD. */
  date: string
  /** Съедено за день, ккал. Отсутствует, если день не заполнен. */
  kcal?: number
  /** Взвешивание за день, кг. Отсутствует, если не взвешивался. */
  weightKg?: number
}

export type ExpenditureResult = {
  /** Расчётный расход, ккал в сутки. */
  tdee: number
  /** Откуда взята цифра: формула или наблюдение за фактом. */
  source: 'formula' | 'adaptive'
  /** Сколько дней с заполненной едой попало в расчёт. */
  daysUsed: number
  /** Тренд веса, кг в неделю. Отрицательный — снижение. */
  weeklyChangeKg?: number
  /** Насколько можно доверять: 0..1, растёт с плотностью данных. */
  confidence: number
}

/**
 * Считает расход по закону сохранения энергии: съеденное минус изменение
 * запасов тела. Вес и потребление сглаживаются, иначе стакан воды двигал бы
 * цель на сотни килокалорий.
 */
export function estimateExpenditure(
  days: DayPoint[],
  fallback: number,
): ExpenditureResult {
  const window = days.slice(-ANALYSIS_WINDOW_DAYS)
  const eaten = window.filter((d) => typeof d.kcal === 'number' && d.kcal! > 0)
  const weights = window.filter((d) => typeof d.weightKg === 'number')

  // Без пары взвешиваний и достаточной истории еды считать нечего.
  if (eaten.length < MIN_DAYS_FOR_ADAPTIVE || weights.length < 2) {
    return {
      tdee: fallback,
      source: 'formula',
      daysUsed: eaten.length,
      confidence: Math.min(0.4, eaten.length / MIN_DAYS_FOR_ADAPTIVE / 2.5),
    }
  }

  const smoothedWeights = ema(weights.map((d) => d.weightKg!))
  const points = weights.map((d, i) => ({
    x: dayNumber(d.date),
    y: smoothedWeights[i],
  }))

  // Наклон тренда веса в кг за сутки → сколько энергии ушло в запасы или из них.
  const perDayKg = slope(points)
  const avgIntake = eaten.reduce((a, d) => a + d.kcal!, 0) / eaten.length
  const storedKcalPerDay = perDayKg * KCAL_PER_KG

  const tdee = Math.round(avgIntake - storedKcalPerDay)

  // Плотность данных: чем больше заполненных дней в окне, тем выше доверие.
  const density = eaten.length / Math.min(window.length || 1, ANALYSIS_WINDOW_DAYS)
  const spanDays = points.length > 1 ? points[points.length - 1].x - points[0].x : 0
  const spanFactor = Math.min(1, spanDays / ANALYSIS_WINDOW_DAYS)

  return {
    tdee: clamp(tdee, 1000, 6000),
    source: 'adaptive',
    daysUsed: eaten.length,
    weeklyChangeKg: Math.round(perDayKg * 7 * 100) / 100,
    confidence: Math.round(Math.min(1, density * 0.6 + spanFactor * 0.4) * 100) / 100,
  }
}

/** Целевая калорийность: расход плюс поправка на желаемую скорость изменения. */
export function targetKcal(tdee: number, weeklyChangeKg: number): number {
  const daily = (weeklyChangeKg * KCAL_PER_KG) / 7
  // Ниже 1200 ккал уходить нельзя даже при агрессивной цели.
  return clamp(Math.round(tdee + daily), 1200, 8000)
}

/** Целевые граммы макронутриентов из калорийности и долей. */
export function macroTargets(
  kcal: number,
  split: { protein: number; fat: number; carbs: number },
) {
  return {
    protein: Math.round((kcal * split.protein) / 4),
    fat: Math.round((kcal * split.fat) / 9),
    carbs: Math.round((kcal * split.carbs) / 4),
  }
}

/** Пресеты распределения макронутриентов под цель. */
export const MACRO_PRESETS: Record<
  string,
  { label: string; split: { protein: number; fat: number; carbs: number } }
> = {
  balanced: { label: 'Сбалансированно', split: { protein: 0.3, fat: 0.3, carbs: 0.4 } },
  cutting: { label: 'Сушка', split: { protein: 0.4, fat: 0.25, carbs: 0.35 } },
  bulking: { label: 'Набор массы', split: { protein: 0.25, fat: 0.25, carbs: 0.5 } },
  lowcarb: { label: 'Мало углеводов', split: { protein: 0.35, fat: 0.45, carbs: 0.2 } },
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** Порядковый номер дня — чтобы считать наклон по календарной шкале. */
function dayNumber(date: string): number {
  return Math.round(new Date(`${date}T12:00:00`).getTime() / 86400_000)
}

/** Локальная дата в формате YYYY-MM-DD: день считается по часам пользователя. */
export function localDate(ts: number = Date.now()): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
