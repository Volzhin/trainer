import { APP_STATE_ID, db, currentUserId, type ClientTask } from './db'
import { setVolume, weekStart } from '../lib/calc'
import { localDate } from '../lib/tdee'

/**
 * Счёт работы: неделя, серия, ступень и знаки.
 *
 * Одно правило, из которого выведено всё остальное: **считается только то,
 * что человек действительно сделал и что лежит в базе**. Ни очков за
 * открытие приложения, ни отметок настроения, ни ежедневных галочек — всё,
 * что можно накрутить, не подойдя к штанге, приложение показывать не будет.
 * Иначе счёт начинает жить отдельно от работы, и человек играет вместо того,
 * чтобы тренироваться.
 *
 * Отсюда и место этого модуля: он ничего не пишет и не заводит своих таблиц —
 * только читает. Знаки не хранятся, а выводятся; на любом устройстве при тех
 * же данных получится тот же ответ, и синхронизировать нечего. На устройстве
 * остаётся единственная отметка — какие знаки человеку уже показали, чтобы
 * не поздравлять его дважды (см. seenMarks ниже).
 */

const WEEK = 7 * 86400_000

/* ------------------------------- неделя -------------------------------- */

export type WeekState = {
  /** Завершённых тренировок с понедельника. */
  done: number
  /** План на неделю. null — программа не назначена, плана нет. */
  target: number | null
  /** Дней с записями в дневнике питания. */
  nutritionDays: number
  /** Пн–вс: была ли в этот день тренировка. */
  days: boolean[]
}

/* ------------------------------- серия --------------------------------- */

export type StreakState = {
  /** Сколько недель подряд план выполнен. */
  weeks: number
  /**
   * Серия стоит на паузе: последняя неделя пустая, но счёт не сброшен.
   *
   * Пустая неделя не обнуляет серию намеренно. Обычный стрик наказывает за
   * болезнь и командировку: пропустил — потерял двенадцать недель — удалил
   * приложение. Здесь пропуск ставит счёт на паузу, и человек возвращается
   * к своей же цифре, а не к нулю.
   */
  paused: boolean
}

/* ------------------------------ ступень -------------------------------- */

/**
 * Ступени по числу проведённых тренировок.
 *
 * Границы редкие и растущие: между «Стартом» и «Базой» десять тренировок —
 * это месяц работы, между «Формой» и «Опорой» сорок. Ступень должна
 * отмечать пройденный путь, а не выдаваться каждую неделю, иначе она
 * перестаёт что-либо значить.
 */
export const STAGES = [
  { name: 'Старт', from: 0 },
  { name: 'База', from: 10 },
  { name: 'Ритм', from: 30 },
  { name: 'Форма', from: 60 },
  { name: 'Опора', from: 100 },
] as const

export type StageState = {
  index: number
  name: string
  /** Всего проведённых тренировок. */
  workouts: number
  /** Суммарный тоннаж, кг. */
  tonnage: number
  /** Сколько тренировок до следующей ступени. null — это последняя. */
  toNext: number | null
  nextName: string | null
  /** Доля пути до следующей ступени, 0…1. */
  progress: number
}

/* -------------------------------- знаки -------------------------------- */

export type Mark = {
  id: string
  title: string
  /** Чем он заслужен — короткой строкой, тем же языком, что и задание. */
  hint: string
  done: boolean
  /** Медный — только рекорды: второй цветовой голос приложения. */
  copper?: boolean
  /** Сколько уже есть из скольких нужно. Для выданного не показывается. */
  have: number
  need: number
}

export type GameState = {
  week: WeekState
  streak: StreakState
  stage: StageState
  marks: Mark[]
  /** Ближайший невыданный знак — тот, до которого меньше всего осталось. */
  next: Mark | null
  /** Тренировки по неделям за год — для полосы года. */
  year: { weekStart: number; sessions: number }[]
}

/**
 * Всё разом, одним проходом по данным.
 *
 * Одной выборкой, а не пятью хуками по экрану: тренировки нужны и неделе, и
 * серии, и ступени, и полосе года. Пять независимых запросов читали бы одну
 * и ту же таблицу пять раз при каждой перерисовке.
 */
export async function loadGame(userId = currentUserId()): Promise<GameState> {
  const sessions = (await db.sessions.where('user_id').equals(userId).toArray()).filter(
    (s) => s.is_completed === 1,
  )
  const times = sessions.map((s) => s.start_time).sort((a, b) => a - b)

  const monday = weekStart(Date.now())
  const assignment = await db.assignments
    .where('client_id')
    .equals(userId)
    .and((a) => a.status === 'ACTIVE')
    .first()
  const target = assignment?.schedule?.length ?? assignment?.weekly_target ?? null

  /* --- неделя --- */
  const days = Array.from({ length: 7 }, () => false)
  let doneThisWeek = 0
  for (const at of times) {
    if (at < monday) continue
    doneThisWeek++
    const i = Math.floor((at - monday) / 86400_000)
    if (i >= 0 && i < 7) days[i] = true
  }

  const from = localDate(monday)
  const to = localDate(Date.now())
  const logs = await db.foodLogs
    .where('[user_id+date]')
    .between([userId, from], [userId, to], true, true)
    .toArray()
  const nutritionDays = new Set(logs.map((l) => l.date)).size

  /* --- серия --- */
  const streak = countStreak(times, monday, target)

  /* --- ступень --- */
  const sets = await db.sets
    .where('workout_session_id')
    .anyOf(sessions.map((s) => s.id))
    .toArray()
  const tonnage = Math.round(sets.reduce((acc, s) => acc + (s.is_done ? setVolume(s) : 0), 0))
  const stage = stageOf(sessions.length, tonnage)

  /* --- знаки --- */
  const metrics = await db.bodyMetrics.where('user_id').equals(userId).toArray()
  const tasks = await db.tasks.where('client_id').equals(userId).toArray()
  const prs = sets.filter((s) => s.is_pr === 1).length
  const marks = buildMarks({ sessions: sessions.length, tonnage, prs, metrics, tasks, streak })

  /* --- полоса года --- */
  const yearFrom = weekStart(Date.now() - 51 * WEEK)
  const buckets = new Map<number, number>()
  for (let w = yearFrom; w <= monday; w += WEEK) buckets.set(w, 0)
  for (const at of times) {
    if (at < yearFrom) continue
    const w = weekStart(at)
    buckets.set(w, (buckets.get(w) ?? 0) + 1)
  }
  const year = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([weekStart_, sessions_]) => ({ weekStart: weekStart_, sessions: sessions_ }))

  const pending = marks.filter((m) => !m.done)
  const next =
    pending.sort((a, b) => b.have / b.need - a.have / a.need)[0] ?? null

  return {
    week: { done: doneThisWeek, target, nutritionDays, days },
    streak,
    stage,
    marks,
    next,
    year,
  }
}

/**
 * Сколько недель подряд выполнен план.
 *
 * Считаем назад от прошлой недели: текущая ещё идёт, и записывать её в серию
 * до воскресенья было бы обещанием за человека. Неделя без единой тренировки
 * не ломает счёт, а пропускается — см. StreakState.paused. Неделя, в которую
 * работа была, но плана не хватило, счёт останавливает: иначе «серия»
 * перестаёт что-либо означать.
 *
 * Без назначенной программы планом считается одна тренировка: сравнивать не
 * с чем, а полностью отключать серию у человека без тренера — значит наказать
 * его за то, чего он не выбирал.
 */
function countStreak(times: number[], monday: number, target: number | null): StreakState {
  const need = target ?? 1
  const perWeek = new Map<number, number>()
  for (const at of times) {
    const w = weekStart(at)
    perWeek.set(w, (perWeek.get(w) ?? 0) + 1)
  }

  // Текущая неделя идёт в счёт только когда план уже выполнен: тогда это
  // факт, а не аванс.
  let weeks = (perWeek.get(monday) ?? 0) >= need ? 1 : 0
  let paused = false

  for (let w = monday - WEEK; ; w -= WEEK) {
    const count = perWeek.get(w) ?? 0
    if (count >= need) {
      weeks++
      continue
    }
    if (count === 0) {
      // Пустая неделя: пропускаем её, но только пока есть что продолжать.
      // Иначе счёт уходил бы в бесконечность по пустой истории.
      if (weeks === 0) break
      paused = true
      // Дальше десяти пустых недель подряд не идём: это уже не пауза, а
      // другая жизнь, и продолжать ту серию нечестно.
      if (monday - w > 10 * WEEK) break
      continue
    }
    break
  }

  return { weeks, paused: paused && weeks > 0 }
}

function stageOf(workouts: number, tonnage: number): StageState {
  let index = 0
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (workouts >= STAGES[i].from) {
      index = i
      break
    }
  }
  const next = STAGES[index + 1]
  const base = STAGES[index].from
  return {
    index,
    name: STAGES[index].name,
    workouts,
    tonnage,
    toNext: next ? next.from - workouts : null,
    nextName: next ? next.name : null,
    progress: next ? Math.min(1, (workouts - base) / (next.from - base)) : 1,
  }
}

/** Замер с обхватами — то, что клиент сдаёт как «замеры», а не как вес. */
const isGirth = (m: { waist_cm?: number; hip_cm?: number; chest_cm?: number; thigh_cm?: number }) =>
  m.waist_cm != null || m.hip_cm != null || m.chest_cm != null || m.thigh_cm != null

function buildMarks(input: {
  sessions: number
  tonnage: number
  prs: number
  metrics: { source?: string; logged_at: number; waist_cm?: number; hip_cm?: number; chest_cm?: number; thigh_cm?: number }[]
  tasks: ClientTask[]
  streak: StreakState
}): Mark[] {
  const inbody = input.metrics.filter((m) => m.source === 'inbody').length
  const girthWeeks = new Set(
    input.metrics.filter(isGirth).map((m) => weekStart(m.logged_at)),
  ).size
  const photos = input.tasks.filter((t) => t.kind === 'photos' && t.status === 'done').length

  const mark = (
    id: string,
    title: string,
    hint: string,
    have: number,
    need: number,
    copper?: boolean,
  ): Mark => ({ id, title, hint, have: Math.min(have, need), need, done: have >= need, copper })

  return [
    mark('first-workout', 'Первая тренировка', 'Начало есть', input.sessions, 1),
    mark('w10', '10 тренировок', 'Привычка складывается', input.sessions, 10),
    mark('w50', '50 тренировок', 'Это уже стаж', input.sessions, 50),
    mark('inbody', 'Первый InBody', 'Состав тела известен', inbody, 1),
    mark('measures4', 'Месяц замеров', 'Обхваты за четыре недели', girthWeeks, 4),
    mark('photos', 'Фото до/после', 'Точка отсчёта снята', photos, 1),
    mark('month-plan', 'Месяц по плану', 'Четыре недели подряд', input.streak.weeks, 4),
    mark('pr5', 'Пять рекордов', 'Вес растёт', input.prs, 5, true),
    mark('ton100', 'Сто тонн', 'Суммарно поднято', input.tonnage, 100_000),
  ]
}

/* --------------------- какие знаки уже показывали ---------------------- */

/**
 * Отметка о показе живёт на устройстве, а не в данных человека.
 *
 * Сам знак выводится из тренировок и замеров и на любом устройстве
 * посчитается одинаково — хранить его незачем. А вот «мы уже поздравили» —
 * это про экран, а не про работу: приезжать к тренеру ему не нужно, в обмене
 * ему делать нечего, и своей таблицы ради одной строки он не стоит.
 */
export async function seenMarks(): Promise<string[]> {
  const state = await db.appState.get(APP_STATE_ID)
  return state?.seen_marks ?? []
}

/** Знаки, выданные с прошлого захода. Первый заход ничего не празднует. */
export async function freshMarks(marks: Mark[]): Promise<Mark[]> {
  const state = await db.appState.get(APP_STATE_ID)
  const seen = state?.seen_marks
  const done = marks.filter((m) => m.done)

  // У кого отметки ещё нет, тот пришёл с историей: поздравлять его разом за
  // полгода работы — значит вывалить шесть знаков подряд. Записываем молча.
  if (!seen) {
    await rememberMarks(done.map((m) => m.id))
    return []
  }
  return done.filter((m) => !seen.includes(m.id))
}

export async function rememberMarks(ids: string[]) {
  const state = await db.appState.get(APP_STATE_ID)
  if (!state) return
  const seen = new Set([...(state.seen_marks ?? []), ...ids])
  await db.appState.update(APP_STATE_ID, { seen_marks: [...seen] })
}
