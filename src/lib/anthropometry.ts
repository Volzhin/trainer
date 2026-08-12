/**
 * Оценка состава тела по обхватам.
 *
 * Используется калиперная методика ВМФ США (Hodgdon — Beckett): она
 * работает по обхватам и росту, без оборудования. Погрешность порядка
 * трёх-четырёх процентов против гидростатического взвешивания, поэтому
 * результат — оценка, а не замер, и в интерфейсе он помечается как
 * расчётный. Биоимпедансный отчёт всегда точнее и имеет приоритет.
 */

export type Sex = 'м' | 'ж'

export type Girths = {
  /** Обхваты в сантиметрах. */
  neck?: number
  waist?: number
  hip?: number
  chest?: number
  thigh?: number
}

export type Derived = {
  bodyFatPct?: number
  fatMassKg?: number
  leanMassKg?: number
  bmi?: number
  /** Отношение талии к росту: выше 0.5 — повод обратить внимание. */
  waistToHeight?: number
  /** Отношение талии к бёдрам — тип распределения жира. */
  waistToHip?: number
}

const log10 = (v: number) => Math.log(v) / Math.LN10
const round1 = (v: number) => Math.round(v * 10) / 10

/**
 * Процент жира по обхватам. Мужчинам нужны шея и талия, женщинам —
 * дополнительно бёдра: у них жир распределяется иначе, и без этого
 * обхвата формула систематически занижает результат.
 */
export function bodyFatFromGirths(
  girths: Girths,
  heightCm: number,
  sex: Sex,
): number | undefined {
  const { neck, waist, hip } = girths
  if (!neck || !waist || !heightCm) return undefined

  if (sex === 'м') {
    const inner = waist - neck
    if (inner <= 0) return undefined
    const value = 495 / (1.0324 - 0.19077 * log10(inner) + 0.15456 * log10(heightCm)) - 450
    return clampPct(value)
  }

  if (!hip) return undefined
  const inner = waist + hip - neck
  if (inner <= 0) return undefined
  const value = 495 / (1.29579 - 0.35004 * log10(inner) + 0.221 * log10(heightCm)) - 450
  return clampPct(value)
}

/**
 * Полный расчёт состава из веса, роста и обхватов.
 *
 * Доли безжировой массы сверены с реальным отчётом биоимпеданса: вода
 * 73.2%, белок 20%, минералы 6.75% — вместе дают ровно единицу. Скелетные
 * мышцы составили 57.5% безжировой массы; средние из литературы (около 50%)
 * занижали результат на пять килограммов. Это всё равно усреднение, а не
 * индивидуальный замер, поэтому значения подписаны как расчётные.
 */
export function deriveComposition(input: {
  weightKg?: number
  heightCm?: number
  sex: Sex
  girths: Girths
  /** Если процент жира известен точнее — берём его, а не формулу. */
  knownBodyFatPct?: number
}): Derived {
  const { weightKg, heightCm, sex, girths } = input
  const out: Derived = {}

  if (weightKg && heightCm) {
    out.bmi = round1(weightKg / (heightCm / 100) ** 2)
  }
  if (girths.waist && heightCm) {
    out.waistToHeight = Math.round((girths.waist / heightCm) * 100) / 100
  }
  if (girths.waist && girths.hip) {
    out.waistToHip = Math.round((girths.waist / girths.hip) * 100) / 100
  }

  // Введённый руками процент проходит то же ограничение, что и расчётный:
  // значение больше ста даёт отрицательную безжировую массу, а она уходит в
  // базу и на графики как настоящий замер.
  const pct =
    input.knownBodyFatPct != null
      ? clampPct(input.knownBodyFatPct)
      : heightCm
        ? bodyFatFromGirths(girths, heightCm, sex)
        : undefined
  if (pct == null) return out
  out.bodyFatPct = round1(pct)

  if (!weightKg) return out

  const fat = (weightKg * pct) / 100
  const lean = weightKg - fat

  /*
   * Жировая и безжировая масса — арифметика от процента жира: вес минус
   * жир. Оценка, но честная: она следует из того, что измерили лентой.
   *
   * Скелетные мышцы, воду, белок и минералы отсюда не выводим, хотя
   * формулы для этого есть и раньше стояли: это одна и та же безжировая
   * масса, умноженная на четыре постоянных коэффициента. Никакого нового
   * знания в них нет, а выглядели они в приложении как показатели
   * биоимпеданса — с нормами, динамикой и сегментами. Тренер принимал бы
   * решения по числам, которых никто не измерял.
   */
  out.fatMassKg = round1(fat)
  out.leanMassKg = round1(lean)

  return out
}

/** Правдоподобные границы процента жира: за ними расчёт теряет смысл. */
export const BODY_FAT_RANGE = { min: 3, max: 60 }

/** Ограничение диапазона: формула за его пределами теряет смысл. */
function clampPct(value: number): number | undefined {
  if (!Number.isFinite(value)) return undefined
  return Math.min(BODY_FAT_RANGE.max, Math.max(BODY_FAT_RANGE.min, value))
}
