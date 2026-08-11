import {
  db,
  uid,
  now,
  currentUserId,
  type ClientTask,
  type DailyActivity,
  type NutritionDay,
  type NutritionTarget,
  type Progression,
  type ReportStatus,
  type ReviewTarget,
  type WorkoutReport,
  type TaskKind,
} from './db'
import { localDate } from '../lib/tdee'
import { weekStart } from '../lib/calc'

/**
 * Отчётность: тренировки, дни питания, недельные цели, шаги со сном и
 * задания клиенту.
 *
 * Отчёт клиента знает про себя два состояния — сдан и не сдан. Проверка
 * тренером сюда не примешивается: это отдельная запись ReportReview,
 * принадлежащая тренеру, и на устройство клиента она не приезжает вовсе.
 * Поэтому «не показать клиенту стадию проверки» здесь не требует
 * дисциплины на каждом экране — показывать просто нечего.
 */

/* --------------------------- отчёт о тренировке ------------------------ */

/**
 * Отчёт заводится лениво — в момент сдачи, а не при завершении тренировки.
 * Строка «не сдан» на каждую тренировку ничего не добавляет: тренировка без
 * отчёта и так означает ровно это, зато у клиента без тренера такие строки
 * копились бы и уезжали наверх без всякой пользы.
 */
export async function ensureWorkoutReport(
  sessionId: string,
  userId = currentUserId(),
): Promise<WorkoutReport> {
  const existing = await db.workoutReports.where('session_id').equals(sessionId).first()
  if (existing) return existing

  const report: WorkoutReport = {
    id: uid(),
    user_id: userId,
    session_id: sessionId,
    status: 'not_submitted',
    updated_at: now(),
  }
  await db.workoutReports.add(report)
  return report
}

/** Клиент сдаёт тренировку. Комментарий необязателен. */
export async function submitWorkoutReport(sessionId: string, comment?: string) {
  const report = await ensureWorkoutReport(sessionId)
  const ts = now()
  await db.workoutReports.update(report.id, {
    status: 'submitted',
    client_comment: comment?.trim() || undefined,
    submitted_at: ts,
    updated_at: ts,
  })
}

/** Что о своём отчёте знает клиент. Больше знать и нечего. */
export async function myWorkoutReportState(sessionId: string): Promise<ReportStatus> {
  const report = await db.workoutReports.where('session_id').equals(sessionId).first()
  return report?.status ?? 'not_submitted'
}

/** Отчёты клиента для кабинета тренера. Проверены ли они — см. reviewedRefs. */
export async function workoutReportsOf(clientId: string): Promise<WorkoutReport[]> {
  const rows = await db.workoutReports.where('user_id').equals(clientId).toArray()
  return rows.sort((a, b) => (b.submitted_at ?? 0) - (a.submitted_at ?? 0))
}

/* ---------------------------- день питания ----------------------------- */

const dayId = (userId: string, date: string) => `${userId}:${date}`

/** День дневника. Заводится лениво — пустых дней в базе быть не должно. */
export async function ensureNutritionDay(
  date = localDate(),
  userId = currentUserId(),
): Promise<NutritionDay> {
  const id = dayId(userId, date)
  const existing = await db.nutritionDays.get(id)
  if (existing) return existing

  const day: NutritionDay = {
    id,
    user_id: userId,
    date,
    status: 'not_submitted',
    updated_at: now(),
  }
  await db.nutritionDays.add(day)
  return day
}

/** Оценка сытости за день: 5 — сытый, 1 — очень голодный. */
export async function setSatiety(date: string, satiety: NutritionDay['satiety']) {
  const day = await ensureNutritionDay(date)
  await db.nutritionDays.update(day.id, { satiety, updated_at: now() })
}

export async function submitNutritionDay(date: string, comment?: string) {
  const day = await ensureNutritionDay(date)
  const ts = now()
  await db.nutritionDays.update(day.id, {
    status: 'submitted',
    comment: comment?.trim() || undefined,
    submitted_at: ts,
    updated_at: ts,
  })
}

export async function myNutritionDayState(date: string): Promise<ReportStatus> {
  const day = await db.nutritionDays.get(dayId(currentUserId(), date))
  return day?.status ?? 'not_submitted'
}

/**
 * Дни, за которые есть что сдавать: те, где человек что-то записал в
 * дневник. Пустой день отчётом не является, и предлагать сдать его —
 * значит просить отчитаться о том, чего не было.
 */
export async function loggedNutritionDates(
  from: string,
  to: string,
  userId = currentUserId(),
): Promise<string[]> {
  const logs = await db.foodLogs
    .where('[user_id+date]')
    .between([userId, from], [userId, to], true, true)
    .toArray()
  return [...new Set(logs.map((l) => l.date))].sort((a, b) => b.localeCompare(a))
}

/**
 * Сданные дни питания клиента — лента разбора у тренера. Без окна по датам
 * намеренно: счётчик непроверенного считает всё сданное, и лента, которая
 * показывала бы только свежее, с ним бы расходилась.
 */
export async function submittedNutritionDays(clientId: string): Promise<NutritionDay[]> {
  const rows = await db.nutritionDays
    .where('[user_id+status]')
    .equals([clientId, 'submitted'])
    .toArray()
  return rows.sort((a, b) => b.date.localeCompare(a.date))
}

/** Дни питания клиента для календаря тренера — со стадиями. */
export async function nutritionDaysOf(clientId: string, from: string, to: string) {
  const rows = await db.nutritionDays
    .where('[user_id+date]')
    .between([clientId, from], [clientId, to], true, true)
    .toArray()
  return rows.sort((a, b) => a.date.localeCompare(b.date))
}

/* --------------------------- проверка тренером ------------------------- */

/**
 * Отметить отчёт проверенным и ответить клиенту.
 *
 * Пишет в две строки, и это не дублирование: комментарий адресован клиенту
 * и потому ложится на его отчёт, откуда он его и прочитает. Отметка о
 * проверке остаётся у тренера и к клиенту не едет — ему незачем знать,
 * дошли ли до него руки.
 *
 * Идентификатор отметки выводится из цели, а не выдаётся случайно: проверка
 * одного отчёта — одна запись, сколько бы раз тренер её ни открывал.
 */
export async function reviewReport(input: {
  clientId: string
  target: ReviewTarget
  /** id отчёта о тренировке или день питания (YYYY-MM-DD). */
  ref: string
  comment?: string
  trainerId?: string
}) {
  const trainerId = input.trainerId ?? currentUserId()
  const ts = now()
  const id = `${trainerId}:${input.target}:${input.ref}`

  await db.reviews.put({
    id,
    trainer_id: trainerId,
    client_id: input.clientId,
    target: input.target,
    ref: input.ref,
    reviewed_at: ts,
    updated_at: ts,
  })

  const comment = input.comment?.trim()
  if (comment) {
    if (input.target === 'workout') {
      await db.workoutReports.update(input.ref, { trainer_comment: comment, updated_at: ts })
    } else {
      await db.nutritionDays.update(`${input.clientId}:${input.ref}`, {
        trainer_comment: comment,
        updated_at: ts,
      })
    }
  }
  return id
}

/** Проверенные цели по одному клиенту — для календарей в кабинете тренера. */
export async function reviewedRefs(
  clientId: string,
  target: ReviewTarget,
): Promise<Set<string>> {
  const rows = await db.reviews.where('[client_id+target]').equals([clientId, target]).toArray()
  return new Set(rows.map((r) => r.ref))
}

/* ------------------------- недельные рекомендации ---------------------- */

/**
 * Выдать цели на неделю.
 *
 * Пустые поля не сохраняются: отсутствие цели — это осмысленное состояние,
 * а не ноль. Приложение по такой метрике покажет только факт.
 */
export async function setWeeklyTargets(input: {
  clientId: string
  kcal?: number
  protein?: number
  fat?: number
  carbs?: number
  steps?: number
  note?: string
  trainerId?: string
  week?: number
}) {
  const trainerId = input.trainerId ?? currentUserId()
  const week = weekStart(input.week ?? Date.now())
  const id = `${input.clientId}:${week}`
  const ts = now()

  const target: NutritionTarget = {
    id,
    client_id: input.clientId,
    trainer_id: trainerId,
    week_start: week,
    kcal: input.kcal,
    protein: input.protein,
    fat: input.fat,
    carbs: input.carbs,
    steps: input.steps,
    note: input.note?.trim() || undefined,
    created_at: ts,
    updated_at: ts,
  }
  await db.nutritionTargets.put(target)
  return id
}

/** Действующие цели: последние выданные на эту неделю или раньше. */
export async function currentTargets(
  clientId = currentUserId(),
): Promise<NutritionTarget | null> {
  const rows = await db.nutritionTargets.where('client_id').equals(clientId).toArray()
  const week = weekStart(Date.now())
  const past = rows
    .filter((t) => t.week_start <= week)
    .sort((a, b) => b.week_start - a.week_start)
  return past[0] ?? null
}

/* ----------------------------- шаги и сон ------------------------------ */

export async function setDailyActivity(input: {
  date?: string
  steps?: number
  sleepMinutes?: number
  userId?: string
}) {
  const userId = input.userId ?? currentUserId()
  const date = input.date ?? localDate()
  const id = dayId(userId, date)
  const existing = await db.dailyActivity.get(id)

  const row: DailyActivity = {
    id,
    user_id: userId,
    date,
    steps: input.steps ?? existing?.steps,
    sleep_minutes: input.sleepMinutes ?? existing?.sleep_minutes,
    source: 'manual',
    updated_at: now(),
  }
  await db.dailyActivity.put(row)
}

/** Шаги и сон за конкретный день — то, что уже введено в форме. */
export async function activityFor(date = localDate(), userId = currentUserId()) {
  return db.dailyActivity.get(dayId(userId, date))
}

export async function activityRange(clientId: string, from: string, to: string) {
  const rows = await db.dailyActivity
    .where('[user_id+date]')
    .between([clientId, from], [clientId, to], true, true)
    .toArray()
  return rows.sort((a, b) => a.date.localeCompare(b.date))
}

/* ------------------------------- задания ------------------------------- */

/** Обязательные задания, которые выдаются при привязке к тренеру. */
const REQUIRED_TASKS: { kind: TaskKind; title: string; description?: string }[] = [
  {
    kind: 'intake',
    title: 'Стартовая анкета',
    description: 'Рост, вес, замеры и опыт тренировок — с этого начинается работа.',
  },
  {
    kind: 'essay',
    title: 'Зачем мне это',
    description:
      'Ответь себе письменно: зачем я хочу изменить тело и привычки и как изменится моя ' +
      'жизнь, когда получится? Сохрани и отправь нам — будем возвращаться к этому в ' +
      'трудные моменты.',
  },
  { kind: 'measurements', title: 'Первые замеры', description: 'Дальше — еженедельно.' },
  {
    kind: 'inbody',
    title: 'Анализ состава тела InBody',
    description: 'Дальше — еженедельно.',
  },
]

/**
 * Выдаёт обязательные задания. Повторный вызов ничего не дублирует: связь
 * могут переоформить, а заново просить анкету у человека, который её уже
 * заполнил, — верный способ его потерять.
 */
export async function issueRequiredTasks(clientId: string, trainerId: string) {
  const existing = await db.tasks.where('client_id').equals(clientId).toArray()
  const have = new Set(existing.filter((t) => t.required === 1).map((t) => t.kind))
  const ts = now()

  const fresh = REQUIRED_TASKS.filter((t) => !have.has(t.kind)).map<ClientTask>((t) => ({
    id: uid(),
    client_id: clientId,
    trainer_id: trainerId,
    kind: t.kind,
    title: t.title,
    description: t.description,
    status: 'open',
    required: 1,
    created_at: ts,
    updated_at: ts,
  }))

  if (fresh.length) await db.tasks.bulkAdd(fresh)
  return fresh.length
}

/** Дополнительное задание от тренера: название, описание, срок. */
export async function addTask(input: {
  clientId: string
  title: string
  description?: string
  dueAt?: number
  trainerId?: string
}) {
  const id = uid()
  const ts = now()
  await db.tasks.add({
    id,
    client_id: input.clientId,
    trainer_id: input.trainerId ?? currentUserId(),
    kind: 'custom',
    title: input.title.trim(),
    description: input.description?.trim() || undefined,
    due_at: input.dueAt,
    status: 'open',
    required: 0,
    created_at: ts,
    updated_at: ts,
  })
  return id
}

export async function completeTask(taskId: string, answer?: string) {
  const ts = now()
  await db.tasks.update(taskId, {
    status: 'done',
    answer: answer?.trim() || undefined,
    completed_at: ts,
    updated_at: ts,
  })
}

/** Невыполненные задания клиента — они висят у него на главной. */
export async function openTasks(clientId = currentUserId()): Promise<ClientTask[]> {
  const rows = await db.tasks.where('[client_id+status]').equals([clientId, 'open']).toArray()
  // Обязательные сверху: они блокируют начало работы, а не просто висят.
  return rows.sort((a, b) => b.required - a.required || a.created_at - b.created_at)
}

export async function tasksOf(clientId: string): Promise<ClientTask[]> {
  const rows = await db.tasks.where('client_id').equals(clientId).toArray()
  return rows.sort((a, b) => b.created_at - a.created_at)
}

/* ------------------- статистика для недельных целей -------------------- */

const DAY = 86400_000

export type WeeklyStats = {
  /** Вес за две последние недели — точками для графика. */
  weightPoints: { x: number; y: number }[]
  /** Среднее за каждую из двух недель и разница в процентах по среднему. */
  weightAvgPrev: number | null
  weightAvgLast: number | null
  weightDeltaPct: number | null
  /** Процент жира: стартовый замер, предпоследний и последний. */
  fatStart: number | null
  fatPrev: number | null
  fatLast: number | null
  /** Средние за последнюю неделю. null — данных нет, а не ноль. */
  avgSteps: number | null
  avgSleepMinutes: number | null
  avgSatiety: number | null
}

const mean = (xs: number[]): number | null =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null

/**
 * Цифры, по которым тренер назначает цели на неделю (пункт 5.6).
 *
 * Считается одним проходом и отдаётся экрану целиком: раньше эти числа
 * были разбросаны по разным блокам кабинета, и тренер выставлял калории,
 * не видя ни веса, ни сытости.
 *
 * Везде, где данных не хватает, возвращается null, а не ноль: «шагов не
 * вводили» и «прошёл ноль шагов» — разные утверждения, и второе из них
 * приложение придумывать не вправе.
 */
export async function weeklyStats(clientId: string): Promise<WeeklyStats> {
  const now_ = Date.now()
  const weekAgo = now_ - 7 * DAY
  const twoWeeksAgo = now_ - 14 * DAY

  const metrics = await db.bodyMetrics.where('user_id').equals(clientId).sortBy('logged_at')

  const weights = metrics.filter((m) => m.weight_kg != null)
  const inWindow = weights.filter((m) => m.logged_at >= twoWeeksAgo)
  const lastWeek = inWindow.filter((m) => m.logged_at >= weekAgo)
  const prevWeek = inWindow.filter((m) => m.logged_at < weekAgo)

  const weightAvgLast = mean(lastWeek.map((m) => m.weight_kg!))
  const weightAvgPrev = mean(prevWeek.map((m) => m.weight_kg!))

  // Разница считается по средним, а не по крайним точкам: вес за сутки
  // гуляет на килограмм от одной воды, и два случайных взвешивания дали бы
  // цифру, к динамике отношения не имеющую.
  const weightDeltaPct =
    weightAvgPrev != null && weightAvgLast != null && weightAvgPrev !== 0
      ? Math.round(((weightAvgLast - weightAvgPrev) / weightAvgPrev) * 1000) / 10
      : null

  const fats = metrics.filter((m) => m.body_fat_pct != null)
  const fatStart = fats.length ? fats[0].body_fat_pct! : null
  const fatLast = fats.length ? fats[fats.length - 1].body_fat_pct! : null
  const fatPrev = fats.length > 1 ? fats[fats.length - 2].body_fat_pct! : null

  const from = localDate(weekAgo)
  const to = localDate(now_)

  const activity = await db.dailyActivity
    .where('[user_id+date]')
    .between([clientId, from], [clientId, to], true, true)
    .toArray()

  const days = await db.nutritionDays
    .where('[user_id+date]')
    .between([clientId, from], [clientId, to], true, true)
    .toArray()

  const avgSteps = mean(activity.filter((a) => a.steps != null).map((a) => a.steps!))
  const avgSleep = mean(
    activity.filter((a) => a.sleep_minutes != null).map((a) => a.sleep_minutes!),
  )
  const avgSatiety = mean(days.filter((d) => d.satiety != null).map((d) => d.satiety!))

  return {
    weightPoints: inWindow.map((m) => ({ x: m.logged_at, y: m.weight_kg! })),
    weightAvgPrev: weightAvgPrev == null ? null : Math.round(weightAvgPrev * 10) / 10,
    weightAvgLast: weightAvgLast == null ? null : Math.round(weightAvgLast * 10) / 10,
    weightDeltaPct,
    fatStart,
    fatPrev,
    fatLast,
    avgSteps: avgSteps == null ? null : Math.round(avgSteps),
    avgSleepMinutes: avgSleep == null ? null : Math.round(avgSleep),
    avgSatiety: avgSatiety == null ? null : Math.round(avgSatiety * 10) / 10,
  }
}

/* ------------------------- рекомендации по весу ------------------------ */

/**
 * Разбор упражнения: комментарий и что делать с весом дальше.
 *
 * Пишется в ту же таблицу, что и остальные комментарии тренера, — это тот
 * же разговор об одной тренировке, просто с пометкой про вес.
 */
export async function setExerciseProgression(input: {
  clientId: string
  sessionId: string
  exerciseId: string
  progression: Progression
  text?: string
  trainerId?: string
}) {
  const trainerId = input.trainerId ?? currentUserId()
  const existing = await db.feedback
    .where('[session_id+exercise_id]')
    .equals([input.sessionId, input.exerciseId])
    .first()

  const ts = now()
  if (existing) {
    await db.feedback.update(existing.id, {
      progression: input.progression,
      text: input.text?.trim() ?? existing.text,
      is_read: 0,
      updated_at: ts,
    })
    return existing.id
  }

  const id = uid()
  await db.feedback.add({
    id,
    trainer_id: trainerId,
    client_id: input.clientId,
    session_id: input.sessionId,
    exercise_id: input.exerciseId,
    text: input.text?.trim() ?? '',
    progression: input.progression,
    created_at: ts,
    is_read: 0,
    updated_at: ts,
  })
  return id
}

/** Последняя рекомендация по упражнению — её клиент видит на тренировке. */
export async function progressionFor(
  exerciseId: string,
  clientId = currentUserId(),
): Promise<{ progression: Progression; text?: string } | null> {
  const rows = await db.feedback
    .where('exercise_id')
    .equals(exerciseId)
    .and((f) => f.client_id === clientId && !!f.progression)
    .toArray()
  if (!rows.length) return null

  const last = rows.sort((a, b) => b.created_at - a.created_at)[0]
  return { progression: last.progression!, text: last.text || undefined }
}

/* ------------------------------ сводка --------------------------------- */

/** Сколько отчётов ждёт проверки — бейдж в списке клиентов у тренера. */
export async function pendingReviewCount(clientId: string): Promise<number> {
  const workouts = await db.workoutReports
    .where('[user_id+status]')
    .equals([clientId, 'submitted'])
    .toArray()
  const days = await db.nutritionDays
    .where('[user_id+status]')
    .equals([clientId, 'submitted'])
    .toArray()

  const [seenWorkouts, seenDays] = await Promise.all([
    reviewedRefs(clientId, 'workout'),
    reviewedRefs(clientId, 'nutrition'),
  ])

  // Считаем непроверенное, а не сданное: тренеру важно, сколько ещё
  // предстоит разобрать, а не сколько клиент прислал за всё время.
  return (
    workouts.filter((r) => !seenWorkouts.has(r.id)).length +
    days.filter((d) => !seenDays.has(d.date)).length
  )
}
