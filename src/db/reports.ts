import {
  db,
  deleteSynced,
  uid,
  now,
  currentUserId,
  type ClientTask,
  type ReportReply,
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
 * Разбирает ли тренер дни питания.
 *
 * Раздел питания снят с интерфейса клиента (см. закомментированные маршруты
 * в App.tsx), и прочитать ответ на день питания ему негде. Пока это так, дни
 * не попадают ни в очередь разбора, ни в счётчик непроверенного: тренер
 * писал бы разбор в пустоту и считал, что ответил. Вернётся раздел —
 * достаточно поменять здесь.
 */
export const NUTRITION_REVIEW_ENABLED = false

/**
 * Ключ ответа. Для тренировки это сам отчёт, для дня питания — клиент и дата:
 * день определяется парой, а не датой самой по себе.
 */
const replyId = (clientId: string, target: ReviewTarget, ref: string) =>
  target === 'workout' ? ref : `${clientId}:${ref}`

/**
 * Отметить отчёт проверенным и ответить клиенту.
 *
 * Пишет в две строки, и это не дублирование: отметка о проверке остаётся у
 * тренера и к клиенту не едет — ему незачем знать, дошли ли до него руки, —
 * а ответ адресован клиенту и уезжает к нему.
 *
 * Идентификаторы выводятся из цели, а не выдаются случайно: разбор одного
 * отчёта — одна запись, сколько бы раз тренер её ни открывал. Клиент входит
 * в ключ отметки, потому что у дня питания ref — это просто дата: без него
 * разбор дня одного клиента затирал бы отметку по другому за то же число, и
 * его отчёт снова оказывался бы неразобранным.
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
  const id = `${trainerId}:${input.clientId}:${input.target}:${input.ref}`

  await db.reviews.put({
    id,
    trainer_id: trainerId,
    client_id: input.clientId,
    target: input.target,
    ref: input.ref,
    reviewed_at: ts,
    updated_at: ts,
  })

  await setReportReply({ ...input, trainerId })
  return id
}

/**
 * Ответ тренера на отчёт. Пустой текст ответ снимает: тренер, стёрший его и
 * нажавший кнопку, вправе ожидать, что клиент больше ничего не увидит.
 */
export async function setReportReply(input: {
  clientId: string
  target: ReviewTarget
  ref: string
  comment?: string
  trainerId?: string
}) {
  const trainerId = input.trainerId ?? currentUserId()
  const id = replyId(input.clientId, input.target, input.ref)
  const text = input.comment?.trim()
  const existing = await db.reportReplies.get(id)
  const ts = now()

  if (!text) {
    // Ответы, написанные до переезда в отдельную таблицу, лежат в самой строке
    // отчёта, а её тренер больше не правит — просто удалить строку ответа
    // мало, старый текст снова стал бы виден. Пустой ответ его перекрывает.
    const legacy = await legacyComment(input.clientId, input.target, input.ref)
    if (!legacy) {
      if (existing) await deleteSynced('reportReplies', id)
      return
    }
    await db.reportReplies.put({
      id,
      client_id: input.clientId,
      trainer_id: trainerId,
      target: input.target,
      text: '',
      created_at: existing?.created_at ?? ts,
      updated_at: ts,
    })
    return
  }
  await db.reportReplies.put({
    id,
    client_id: input.clientId,
    trainer_id: trainerId,
    target: input.target,
    text,
    created_at: existing?.created_at ?? ts,
    updated_at: ts,
  })
}

/** Ответ прежних версий — он лежит в самой строке отчёта. */
async function legacyComment(
  clientId: string,
  target: ReviewTarget,
  ref: string,
): Promise<string | undefined> {
  if (target === 'workout') return (await db.workoutReports.get(ref))?.trainer_comment
  return (await db.nutritionDays.get(`${clientId}:${ref}`))?.trainer_comment
}

/**
 * Текст ответа или ничего, если ответа нет.
 *
 * Пустая строка — это снятый ответ, а не отсутствующий: она специально
 * перекрывает то, что осталось в самой строке отчёта от прежних версий.
 */
export const replyText = (reply?: ReportReply, legacy?: string): string | undefined =>
  reply ? reply.text || undefined : legacy

/** Ответы тренера по клиенту, по ключу ответа — для списков и календарей. */
export async function repliesOf(clientId: string): Promise<Map<string, ReportReply>> {
  const rows = await db.reportReplies.where('client_id').equals(clientId).toArray()
  return new Map(rows.map((r) => [r.id, r]))
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
 * Неделя как календарная дата понедельника.
 *
 * Ключом служит она, а не метка времени: полночь понедельника у тренера в
 * Москве и у клиента во Владивостоке — разные моменты, и цели, выданные в
 * одном поясе, в другом считались бы выданными на неделю вперёд. Клиент
 * восточнее тренера не видел бы их всю текущую неделю.
 */
const weekKey = (ts: number): string => localDate(weekStart(ts))

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
  const at = input.week ?? Date.now()
  const week = weekStart(at)
  const id = `${input.clientId}:${weekKey(at)}`
  const ts = now()

  const target: NutritionTarget = {
    id,
    client_id: input.clientId,
    trainer_id: trainerId,
    week_start: week,
    week_key: weekKey(at),
    kcal: input.kcal,
    protein: input.protein,
    fat: input.fat,
    carbs: input.carbs,
    steps: input.steps,
    note: input.note?.trim() || undefined,
    created_at: ts,
    updated_at: ts,
  }
  // Цели на эту же неделю, выданные до перехода на календарный ключ, лежат
  // под идентификатором из метки времени. Без их снятия на неделю приходится
  // две строки, и какая из них «действующая», решает порядок в базе — то есть
  // тренер правит цели, а обе стороны продолжают видеть прежние цифры.
  const legacyId = `${input.clientId}:${week}`
  if (legacyId !== id) await db.nutritionTargets.delete(legacyId)

  await db.nutritionTargets.put(target)
  return id
}

/** Действующие цели: последние выданные на эту неделю или раньше. */
export async function currentTargets(
  clientId = currentUserId(),
): Promise<NutritionTarget | null> {
  const rows = await db.nutritionTargets.where('client_id').equals(clientId).toArray()
  const week = weekKey(Date.now())
  const keyOf = (t: NutritionTarget) => t.week_key ?? localDate(t.week_start)
  // При совпадении недели побеждает выданное позже: строки за одну неделю
  // могли остаться от разных версий ключа, и порядок в базе тут не указ.
  const past = rows
    .filter((t) => keyOf(t) <= week)
    .sort((a, b) => keyOf(b).localeCompare(keyOf(a)) || b.updated_at - a.updated_at)
  return past[0] ?? null
}

/* ----------------------------- шаги и сон ------------------------------ */

/**
 * Шаги и сон за день.
 *
 * Пропуск и очистка — разные намерения, поэтому и значения разные: undefined
 * оставляет прежнее, null стирает. Без этого различия стереть однажды
 * введённое число было невозможно в принципе — форма показывала пустое поле,
 * а в базе оставалось старое значение.
 */
export async function setDailyActivity(input: {
  date?: string
  steps?: number | null
  sleepMinutes?: number | null
  userId?: string
}) {
  const userId = input.userId ?? currentUserId()
  const date = input.date ?? localDate()
  const id = dayId(userId, date)
  const existing = await db.dailyActivity.get(id)

  const keep = <T>(next: T | null | undefined, prev: T | undefined) =>
    next === undefined ? prev : (next ?? undefined)

  const row: DailyActivity = {
    id,
    user_id: userId,
    date,
    steps: keep(input.steps, existing?.steps),
    sleep_minutes: keep(input.sleepMinutes, existing?.sleep_minutes),
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
  const pendingDays = NUTRITION_REVIEW_ENABLED
    ? days.filter((d) => !seenDays.has(d.date)).length
    : 0

  return workouts.filter((r) => !seenWorkouts.has(r.id)).length + pendingDays
}
