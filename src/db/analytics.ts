import {
  db,
  currentUserId,
  type Assignment,
  type Exercise,
  type Program,
  type WorkoutRoutine,
} from './db'
import { estimate1RM, startOfDay } from '../lib/calc'

/**
 * Аналитика прогресса клиента. Считается одним проходом, чтобы экран
 * показывал план, упражнения и объёмы за один и тот же период — раньше
 * каждый блок жил в своих границах (8 недель, 30 дней, «всё время»),
 * и цифры между собой не сходились.
 */

const DAY = 86400_000

export const PERIODS = [
  { key: '4w', label: '4 недели', days: 28 },
  { key: '12w', label: '12 недель', days: 84 },
  { key: 'all', label: 'Всё время', days: null },
] as const

export type PeriodKey = (typeof PERIODS)[number]['key']

/** Понедельник недели, в которую попадает дата. */
export function weekStart(ts: number): number {
  const day = startOfDay(ts)
  return day - ((new Date(day).getDay() + 6) % 7) * DAY
}

export type ExerciseProgress = {
  exercise: Exercise
  /** Упражнение входит в назначенную программу. */
  inProgram: boolean
  /** Дни программы, где оно встречается, — «Push», «Низ · сила». */
  routineNames: string[]
  sessions: number
  sets: number
  lastDate?: number
  lastWeight?: number
  lastReps?: number
  /** Расчётный 1ПМ в первой и последней тренировке периода. */
  first1rm?: number
  last1rm?: number
  best1rm?: number
  deltaKg?: number
  deltaPct?: number
  points: { x: number; y: number }[]
}

export type PlanProgress = {
  assignment: Assignment
  program: Program
  trainerName?: string
  /** Дни недели с тренировками по расписанию, 0 — понедельник. */
  weekdays: number[]
  /** Сколько тренировок должно было пройти за период и сколько прошло. */
  planned: number
  done: number
  adherence: number
  /** Выполнение по дням программы: план и факт по названию дня. */
  byRoutine: { routine: WorkoutRoutine; planned: number; done: number }[]
  doneThisWeek: number
  weeklyTarget: number
}

export type ProgressReport = {
  from: number
  /** Тренировок завершено за период. */
  sessions: number
  volume: number
  sets: number
  /** Среднее число тренировок в неделю за период. */
  perWeek: number
  plan: PlanProgress | null
  exercises: ExerciseProgress[]
  weekly: { label: string; value: number }[]
  muscles: { group: string; sets: number }[]
  records: { exerciseId: string; name: string; score: number; date: number }[]
}

export async function loadProgress(
  userId = currentUserId(),
  days: number | null = 28,
): Promise<ProgressReport> {
  const today = startOfDay(Date.now())
  const from = days == null ? 0 : today - (days - 1) * DAY

  const sessions = (
    await db.sessions
      .where('user_id')
      .equals(userId)
      .and((s) => s.is_completed === 1 && s.start_time >= from)
      .toArray()
  ).sort((a, b) => a.start_time - b.start_time)

  const sessionById = new Map(sessions.map((s) => [s.id, s]))
  const allSets = sessions.length
    ? await db.sets
        .where('workout_session_id')
        .anyOf(sessions.map((s) => s.id))
        .toArray()
    : []
  const doneSets = allSets.filter((s) => s.is_done === 1)

  /* --------------------------- назначенная программа -------------------- */

  const assignment = await db.assignments
    .where('client_id')
    .equals(userId)
    .and((a) => a.status === 'ACTIVE')
    .first()

  const program = assignment ? await db.programs.get(assignment.program_id) : undefined
  const routines = program
    ? await db.routines.where('program_id').equals(program.id).sortBy('day_order')
    : []
  const routineById = new Map(routines.map((r) => [r.id, r]))
  const templateItems = routines.length
    ? await db.templateItems
        .where('routine_id')
        .anyOf(routines.map((r) => r.id))
        .toArray()
    : []

  // Упражнение → дни программы, в которых оно стоит.
  const routinesByExercise = new Map<string, string[]>()
  for (const item of templateItems) {
    const name = routineById.get(item.routine_id)?.name
    if (!name) continue
    const list = routinesByExercise.get(item.exercise_id) ?? []
    if (!list.includes(name)) list.push(name)
    routinesByExercise.set(item.exercise_id, list)
  }

  let plan: PlanProgress | null = null
  if (assignment && program) {
    const schedule = assignment.schedule ?? []
    const weekdays = [...new Set(schedule.map((s) => s.weekday))].sort((a, b) => a - b)

    // План считаем по расписанию: сколько плановых дней выпало на период.
    const begin = Math.max(from, startOfDay(assignment.start_at))
    const finish = assignment.end_at ? Math.min(today, assignment.end_at - DAY) : today
    const plannedByRoutine = new Map<string, number>()
    let planned = 0
    for (let d = begin; d <= finish; d += DAY) {
      const wd = (new Date(d).getDay() + 6) % 7
      for (const slot of schedule) {
        if (slot.weekday !== wd) continue
        planned++
        plannedByRoutine.set(slot.routine_id, (plannedByRoutine.get(slot.routine_id) ?? 0) + 1)
      }
    }
    // Расписания может не быть у старых назначений — тогда план из недельной цели.
    if (!schedule.length && assignment.weekly_target) {
      const weeks = Math.max(1, Math.round((finish - begin) / (7 * DAY)))
      planned = weeks * assignment.weekly_target
    }

    const doneByRoutine = new Map<string, number>()
    for (const s of sessions) {
      if (!s.routine_id) continue
      doneByRoutine.set(s.routine_id, (doneByRoutine.get(s.routine_id) ?? 0) + 1)
    }

    const trainer = await db.profile.get(assignment.trainer_id)
    const thisWeek = weekStart(Date.now())

    plan = {
      assignment,
      program,
      trainerName: trainer?.name,
      weekdays,
      planned,
      done: sessions.length,
      adherence: planned ? Math.round((sessions.length / planned) * 100) : 0,
      byRoutine: routines.map((routine) => ({
        routine,
        planned: plannedByRoutine.get(routine.id) ?? 0,
        done: doneByRoutine.get(routine.id) ?? 0,
      })),
      doneThisWeek: sessions.filter((s) => s.start_time >= thisWeek).length,
      weeklyTarget: schedule.length || assignment.weekly_target,
    }
  }

  /* ---------------------------- по упражнениям -------------------------- */

  // Веса и повторы сводим по тренировкам: точка графика — одна тренировка.
  type Agg = {
    sessions: Map<string, { date: number; best: number; topWeight: number; reps?: number }>
    sets: number
  }
  const agg = new Map<string, Agg>()

  for (const s of doneSets) {
    const session = sessionById.get(s.workout_session_id)
    if (!session) continue
    const entry = agg.get(s.exercise_id) ?? { sessions: new Map(), sets: 0 }
    entry.sets++

    const cur = entry.sessions.get(session.id) ?? {
      date: session.start_time,
      best: 0,
      topWeight: 0,
      reps: undefined as number | undefined,
    }
    if (s.weight_kg && s.reps_completed) {
      cur.best = Math.max(cur.best, estimate1RM(s.weight_kg, s.reps_completed))
      if (s.weight_kg >= cur.topWeight) {
        cur.topWeight = s.weight_kg
        cur.reps = s.reps_completed
      }
    }
    entry.sessions.set(session.id, cur)
    agg.set(s.exercise_id, entry)
  }

  // В список попадают и упражнения программы без единого подхода: клиенту
  // важно видеть, что именно из плана он ещё не трогал.
  const ids = [...new Set([...agg.keys(), ...routinesByExercise.keys()])]
  const catalog = await db.exercises.bulkGet(ids)
  const exerciseById = new Map(
    catalog.filter(Boolean).map((e) => [e!.id, e!] as [string, Exercise]),
  )

  const exercises = ids
    // Тип возврата задан явно: без него ветка с null ломает вывод и предикат.
    .map((id): ExerciseProgress | null => {
      const exercise = exerciseById.get(id)
      if (!exercise) return null

      const entry = agg.get(id)
      const history = entry
        ? [...entry.sessions.values()].filter((h) => h.best > 0).sort((a, b) => a.date - b.date)
        : []
      const last = history[history.length - 1]
      const first = history[0]
      const first1rm = first?.best
      const last1rm = last?.best
      const deltaKg =
        first1rm != null && last1rm != null && history.length > 1
          ? Math.round((last1rm - first1rm) * 10) / 10
          : undefined

      return {
        exercise,
        inProgram: routinesByExercise.has(id),
        routineNames: routinesByExercise.get(id) ?? [],
        sessions: history.length,
        sets: entry?.sets ?? 0,
        lastDate: last?.date,
        lastWeight: last?.topWeight || undefined,
        lastReps: last?.reps,
        first1rm,
        last1rm,
        best1rm: history.length ? Math.max(...history.map((h) => h.best)) : undefined,
        deltaKg,
        deltaPct:
          deltaKg != null && first1rm ? Math.round((deltaKg / first1rm) * 100) : undefined,
        points: history.map((h) => ({ x: h.date, y: Math.round(h.best * 10) / 10 })),
      }
    })
    .filter((x): x is ExerciseProgress => !!x)
    // Сначала то, что в программе и где есть движение, потом остальное.
    .sort((a, b) => {
      if (a.inProgram !== b.inProgram) return a.inProgram ? -1 : 1
      return (b.lastDate ?? 0) - (a.lastDate ?? 0)
    })

  /* ------------------------------ сводные ------------------------------- */

  const firstDay = sessions.length ? startOfDay(sessions[0].start_time) : today
  const startWeek = weekStart(days == null ? firstDay : from)
  const weeksCount = Math.max(1, Math.round((weekStart(today) - startWeek) / (7 * DAY)) + 1)
  const buckets = new Array(Math.min(weeksCount, 12)).fill(0) as number[]
  const firstBucketWeek = weekStart(today) - (buckets.length - 1) * 7 * DAY

  let volume = 0
  const muscles = new Map<string, number>()

  for (const s of doneSets) {
    const session = sessionById.get(s.workout_session_id)
    if (!session) continue

    if (s.weight_kg && s.reps_completed) {
      const v = s.weight_kg * s.reps_completed
      volume += v
      const idx = Math.round((weekStart(session.start_time) - firstBucketWeek) / (7 * DAY))
      if (idx >= 0 && idx < buckets.length) buckets[idx] += v
    }

    const group = exerciseById.get(s.exercise_id)?.muscle_group
    if (group) muscles.set(group, (muscles.get(group) ?? 0) + 1)
  }

  const weekly = buckets.map((value, i) => ({
    label: new Date(firstBucketWeek + i * 7 * DAY).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'numeric',
    }),
    value,
  }))

  const records = exercises
    .filter((e) => e.best1rm != null)
    .map((e) => ({
      exerciseId: e.exercise.id,
      name: e.exercise.name,
      score: e.best1rm!,
      date: e.lastDate ?? 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)

  const spanWeeks = Math.max(1, (today - (days == null ? firstDay : from)) / (7 * DAY))

  return {
    from,
    sessions: sessions.length,
    volume,
    sets: doneSets.length,
    perWeek: Math.round((sessions.length / spanWeeks) * 10) / 10,
    plan,
    exercises,
    weekly,
    muscles: [...muscles.entries()]
      .map(([group, sets]) => ({ group, sets }))
      .sort((a, b) => b.sets - a.sets),
    records,
  }
}
