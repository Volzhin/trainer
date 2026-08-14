import type { ExerciseSet } from '../db/db'
import { decimal, getLang, locale, pluralEn, t } from './i18n'

/** Оценка одноповторного максимума по формуле Эпли. */
export function estimate1RM(weight: number, reps: number): number {
  if (!weight || !reps) return 0
  if (reps === 1) return weight
  return Math.round(weight * (1 + reps / 30) * 10) / 10
}

/** Тоннаж подхода: вес × повторения. */
export function setVolume(s: ExerciseSet): number {
  if (!s.weight_kg || !s.reps_completed) return 0
  return s.weight_kg * s.reps_completed
}

export function totalVolume(sets: ExerciseSet[]): number {
  return sets.reduce((acc, s) => acc + (s.is_done ? setVolume(s) : 0), 0)
}

export function bestSet(sets: ExerciseSet[]): ExerciseSet | undefined {
  let best: ExerciseSet | undefined
  let bestScore = 0
  for (const s of sets) {
    if (!s.is_done || !s.weight_kg || !s.reps_completed) continue
    const score = estimate1RM(s.weight_kg, s.reps_completed)
    if (score > bestScore) {
      bestScore = score
      best = s
    }
  }
  return best
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export function formatClock(seconds: number): string {
  const m = Math.floor(Math.max(0, seconds) / 60)
  const s = Math.max(0, seconds) % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Крупный тоннаж читается в тоннах, мелкий — в килограммах. */
export function formatTonnage(kg: number): string {
  if (kg >= 1000) return `${decimal((kg / 1000).toFixed(1))} ${t('т')}`
  return `${Math.round(kg)} ${t('кг')}`
}

export function formatWeight(kg?: number): string {
  if (kg == null) return '—'
  return Number.isInteger(kg) ? `${kg}` : decimal(kg.toFixed(1))
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(locale(), { day: 'numeric', month: 'long' })
}

export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString(locale(), {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function plural(n: number, forms: [string, string, string]): string {
  // Английский считает по-другому: одна форма для единицы, вторая для
  // всего остального. Нет пары в словаре — оставляем русскую: лучше
  // «2 подхода» посреди английского, чем пустое место.
  if (getLang() === 'en') {
    const en = pluralEn(n, forms[0])
    if (en) return en
  }

  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return forms[2]
  if (last > 1 && last < 5) return forms[1]
  if (last === 1) return forms[0]
  return forms[2]
}

export function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Понедельник недели, в которую попадает дата. Неделя тут календарная. */
export function weekStart(ts: number): number {
  const day = startOfDay(ts)
  return day - ((new Date(day).getDay() + 6) % 7) * 86400_000
}

/**
 * Цель по повторам: одно число или диапазон.
 *
 * Формат один на все экраны — тренер задаёт «8-12», и ровно это должен
 * увидеть клиент у снаряда. Верхняя граница, равная нижней, диапазоном не
 * считается: «10-10» читается как ошибка ввода.
 */
export function formatReps(min?: number, max?: number): string | null {
  if (!min) return null
  return max && max > min ? `${min}–${max}` : String(min)
}
