import {
  db,
  deleteSynced,
  uid,
  now,
  currentUserId,
  type ClientTask,
  type ReportReply,
  type DailyActivity,
  type Feedback,
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

/** Через сколько напомнить о несданном отчёте. */
const REPORT_REMINDER_MS = 4 * 3600_000

/**
 * Отложить сдачу: тренировка остаётся несданной и ждёт в «Отчётах».
 *
 * Время напоминания храним от момента отказа, а не от конца тренировки:
 * человек мог открыть шторку через час после зала, и напоминание,
 * отсчитанное от тренировки, пришло бы почти сразу.
 */
export async function postponeWorkoutReport(sessionId: string) {
  const report = await ensureWorkoutReport(sessionId)
  await db.workoutReports.update(report.id, {
    remind_at: now() + REPORT_REMINDER_MS,
    updated_at: now(),
  })
}

/**
 * Отчёт, о котором пора напомнить, — для показа при открытии приложения.
 *
 * Браузерное приложение не может разбудить себя через четыре часа при
 * закрытой вкладке, поэтому напоминание ждёт возвращения человека, а не
 * приходит уведомлением. Обещать второе значило бы обещать несбыточное.
 */
export async function dueReportReminder(
  userId = currentUserId(),
): Promise<WorkoutReport | undefined> {
  const ts = now()
  const rows = await db.workoutReports.where('user_id').equals(userId).toArray()
  return rows
    .filter((r) => r.status === 'not_submitted' && r.remind_at != null && r.remind_at <= ts)
    .sort((a, b) => (a.remind_at ?? 0) - (b.remind_at ?? 0))[0]
}

/** С какого часа напоминаем о несданном дне питания. */
const NUTRITION_REMINDER_HOUR = 22

/**
 * Пора ли напомнить про сегодняшний день питания.
 *
 * Час проверяем при открытии приложения, а не будим себя в 22:00: вкладка
 * к этому времени закрыта, а обещать уведомление, которого браузер не даст,
 * нельзя. Напоминаем только когда в дневнике что-то есть: просить отчитаться
 * о дне, в котором ничего не записано, значит просить выдумать.
 */
export async function nutritionReminderDue(userId = currentUserId()): Promise<boolean> {
  if (new Date().getHours() < NUTRITION_REMINDER_HOUR) return false

  const date = localDate()
  const day = await db.nutritionDays.get(dayId(userId, date))
  if (day?.status === 'submitted') return false

  const logged = await db.foodLogs.where('[user_id+date]').equals([userId, date]).count()
  return logged > 0 || (!!day && isManualDay(day))
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

/** Итог дня, введённый рукой: четыре числа вместо разбора по продуктам. */
export async function setManualNutrition(
  date: string,
  manual: NutritionDay['manual'],
  userId = currentUserId(),
) {
  const day = await ensureNutritionDay(date, userId)
  await db.nutritionDays.update(day.id, { manual, updated_at: now() })
}

/**
 * День, сданный итогом из стороннего счётчика.
 *
 * Такой отчёт разбирать нечем: тренер видит четыре числа и скриншоты, а
 * разговор о них идёт в чате. Поэтому он не ждёт отметки — ни в календаре,
 * ни в счётчике непроверенного.
 */
export const isManualDay = (day: Pick<NutritionDay, 'manual'>): boolean => {
  const m = day.manual
  return !!m && (m.kcal != null || m.protein != null || m.fat != null || m.carbs != null)
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
  const id = await markReportReviewed({ ...input, trainerId })
  await setReportReply({ ...input, trainerId })
  return id
}

/**
 * Поставить отметку о разборе, не трогая ответ клиенту.
 *
 * Тренировку тренер разбирает по упражнениям: комментарии и вес он оставляет
 * там, а не одним текстом на весь отчёт. Звать здесь `reviewReport` нельзя —
 * он передаёт ответ дальше, и пустой ответ снял бы тот, что тренер написал
 * во вкладке «Отчёты».
 */
export async function markReportReviewed(input: {
  clientId: string
  target: ReviewTarget
  ref: string
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

/** Сохранённый ответ по одной цели разбора. */
export async function replyFor(
  clientId: string,
  target: ReviewTarget,
  ref: string,
): Promise<ReportReply | undefined> {
  return db.reportReplies.get(replyId(clientId, target, ref))
}

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

/* --------------------------- шаблоны заданий --------------------------- */

export async function listTaskTemplates(trainerId = currentUserId()) {
  const rows = await db.taskTemplates.where('trainer_id').equals(trainerId).toArray()
  return rows.sort((a, b) => b.created_at - a.created_at)
}

export async function saveTaskTemplate(input: {
  title: string
  description?: string
  dueDays?: number
  trainerId?: string
}) {
  const id = uid()
  const ts = now()
  await db.taskTemplates.add({
    id,
    trainer_id: input.trainerId ?? currentUserId(),
    title: input.title.trim(),
    description: input.description?.trim() || undefined,
    due_days: input.dueDays,
    created_at: ts,
    updated_at: ts,
  })
  return id
}

export async function deleteTaskTemplate(id: string) {
  await db.taskTemplates.delete(id)
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

/* ------------------------- лента сданного ------------------------------ */

export type SubmittedEntry = {
  id: string
  kind: 'weight' | 'measure' | 'inbody' | 'activity'
  at: number
  title: string
  detail: string
}

/**
 * Что клиент уже сдал — коротко и с возможностью удалить.
 *
 * Удаление здесь не про «передумал», а про опечатку: лишний ноль в весе
 * перекашивает и график, и расчёт расхода, и рекомендации тренера. Пока
 * исправить это было нельзя, человеку оставалось смотреть на сломанную
 * статистику или чистить всю историю целиком.
 */
export async function submittedEntries(
  userId = currentUserId(),
  limit = 40,
): Promise<SubmittedEntry[]> {
  const metrics = await db.bodyMetrics.where('user_id').equals(userId).toArray()
  const activity = await db.dailyActivity.where('user_id').equals(userId).toArray()

  const fromMetrics = metrics.map<SubmittedEntry>((m) => {
    const girths = [
      m.waist_cm != null && `талия ${m.waist_cm}`,
      m.chest_cm != null && `грудь ${m.chest_cm}`,
      m.hip_cm != null && `бёдра ${m.hip_cm}`,
    ].filter(Boolean)

    // Взвешивание отличаем от замера по тому, что в нём есть кроме веса:
    // «сдал вес» и «сдал замеры» — разные обещания тренеру.
    const kind: SubmittedEntry['kind'] =
      m.source === 'inbody'
        ? 'inbody'
        : girths.length || m.body_fat_pct != null
          ? 'measure'
          : 'weight'

    return {
      id: m.id,
      kind,
      at: m.logged_at,
      title: kind === 'inbody' ? 'InBody' : kind === 'measure' ? 'Замеры' : 'Вес',
      detail: [
        m.weight_kg != null && `${m.weight_kg} кг`,
        m.body_fat_pct != null && `жир ${m.body_fat_pct}%`,
        ...girths,
      ]
        .filter(Boolean)
        .join(' · '),
    }
  })

  const fromActivity = activity
    .filter((a) => a.steps != null || a.sleep_minutes != null)
    .map<SubmittedEntry>((a) => ({
      id: a.id,
      kind: 'activity',
      at: new Date(`${a.date}T12:00:00`).getTime(),
      title: 'Шаги и сон',
      detail: [
        a.steps != null && `${a.steps} шагов`,
        a.sleep_minutes != null && `сон ${Math.floor(a.sleep_minutes / 60)} ч`,
      ]
        .filter(Boolean)
        .join(' · '),
    }))

  return [...fromMetrics, ...fromActivity].sort((a, b) => b.at - a.at).slice(0, limit)
}

/** Удалить сданную запись. Тип решает, из какой таблицы её убирать. */
export async function deleteSubmittedEntry(entry: SubmittedEntry) {
  if (entry.kind === 'activity') await db.dailyActivity.delete(entry.id)
  else await db.bodyMetrics.delete(entry.id)
}

/* --------------------------- сводка недели ----------------------------- */

export type WeekProgress = {
  /** Завершённых тренировок с понедельника. */
  sessionsDone: number
  /** План на неделю из назначения. null — программа не назначена. */
  sessionsTarget: number | null
  /** Дней, за которые клиент что-то записал в дневник питания. */
  nutritionDays: number
}

/**
 * Насколько клиент держится недели: тренировки и дневник питания.
 *
 * Считается от понедельника, а не за последние семь дней: клиент и тренер
 * договариваются про неделю как календарную, и «4 из 7» в среду означало бы
 * четыре дня из трёх прошедших.
 *
 * Дни питания считаем по записям еды, а не по сданным отчётам: человек мог
 * вести дневник и не сдать его — это разные упущения, и мешать их в одно
 * число значит не понять, о чём говорить.
 */
export async function weekProgress(clientId: string): Promise<WeekProgress> {
  const monday = weekStart(Date.now())

  const sessions = await db.sessions
    .where('user_id')
    .equals(clientId)
    .and((s) => s.is_completed === 1 && s.start_time >= monday)
    .count()

  const assignment = await db.assignments
    .where('client_id')
    .equals(clientId)
    .and((a) => a.status === 'ACTIVE')
    .first()

  const from = localDate(monday)
  const to = localDate(Date.now())
  const logs = await db.foodLogs
    .where('[user_id+date]')
    .between([clientId, from], [clientId, to], true, true)
    .toArray()

  // День считается заполненным и тогда, когда он собран из продуктов, и
  // тогда, когда итог перенесён рукой из стороннего счётчика. Для клиента
  // это одна и та же работа, и делить её на «настоящую» и нет незачем.
  const days = await db.nutritionDays
    .where('[user_id+date]')
    .between([clientId, from], [clientId, to], true, true)
    .toArray()
  const filled = new Set(logs.map((l) => l.date))
  for (const d of days) {
    const m = d.manual
    if (m && (m.kcal != null || m.protein != null || m.fat != null || m.carbs != null)) {
      filled.add(d.date)
    }
  }

  return {
    sessionsDone: sessions,
    sessionsTarget: assignment?.schedule?.length ?? assignment?.weekly_target ?? null,
    nutritionDays: filled.size,
  }
}

/**
 * Стадия разбора по виду отчётов. Ровно три состояния, как и в календарях:
 * ничего не сдано, сдано и ждёт разбора, всё разобрано.
 */
export type ReviewStage = 'none' | 'pending' | 'reviewed'

export type WeekStatus = WeekProgress & {
  workouts: ReviewStage
  nutrition: ReviewStage
}

/**
 * Строка клиента в списке тренера: сколько сделано за неделю и есть ли по
 * этому непрочитанная работа.
 *
 * Стадия считается по всему сданному, а не только по недельному: отчёт,
 * пролежавший неделю, не перестаёт ждать разбора оттого, что началась
 * новая. Счётчик при этом недельный — по нему судят о текущем темпе.
 * Две разные вещи, и мешать их в одно число нельзя.
 */
export async function weekStatus(clientId: string): Promise<WeekStatus> {
  const base = await weekProgress(clientId)

  const workoutReports = await db.workoutReports
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

  const stage = (total: number, unreviewed: number): ReviewStage =>
    total === 0 ? 'none' : unreviewed > 0 ? 'pending' : 'reviewed'

  return {
    ...base,
    workouts: stage(
      workoutReports.length,
      workoutReports.filter((r) => !seenWorkouts.has(r.id)).length,
    ),
    nutrition: stage(days.length, days.filter((d) => !seenDays.has(d.date)).length),
  }
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
  /**
   * Процент жира за две последние недели — то же окно, что у веса.
   *
   * Стартовый замер отсюда убран: цели выдают на неделю, и цифра
   * полугодовой давности к этому решению отношения не имеет, а рядом с
   * двумя свежими читается как часть той же динамики.
   */
  fatPoints: { at: number; value: number }[]
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

  const fatPoints = metrics
    .filter((m) => m.body_fat_pct != null && m.logged_at >= twoWeeksAgo)
    .map((m) => ({ at: m.logged_at, value: m.body_fat_pct! }))

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
    fatPoints,
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

/**
 * Последний разбор упражнения от тренера — текст и рекомендация по весу.
 *
 * Раньше комментарий доставался только вместе с рекомендацией: выборка
 * отбирала строки, где progression заполнен. Тренер, написавший «пауза
 * внизу» и не тронувший вес, разговаривал сам с собой.
 */
/**
 * Вся переписка тренера по одному упражнению, свежее сверху.
 *
 * Последнего указания мало: «прибавить» имеет смысл рядом с тем, что тренер
 * говорил про технику неделю назад, а без истории каждое указание читается
 * как первое.
 */
export async function coachNotesFor(
  exerciseId: string,
  clientId = currentUserId(),
): Promise<Feedback[]> {
  const rows = await db.feedback
    .where('exercise_id')
    .equals(exerciseId)
    .and((f) => f.client_id === clientId && (!!f.progression || !!f.text.trim()))
    .toArray()
  return rows.sort((a, b) => b.created_at - a.created_at)
}

export async function coachNoteFor(
  exerciseId: string,
  clientId = currentUserId(),
): Promise<{ progression?: Progression; text?: string; at: number } | null> {
  const rows = await db.feedback
    .where('exercise_id')
    .equals(exerciseId)
    .and((f) => f.client_id === clientId && (!!f.progression || !!f.text.trim()))
    .toArray()
  if (!rows.length) return null

  // Вес и техника живут в разных строках: рекомендация уходит нажатием на
  // переключатель, комментарий — отдельной кнопкой. Брать поля одной
  // последней строки нельзя — написанный следом комментарий гасил бы
  // «прибавить», и человек у снаряда оставался без указания по весу.
  const sorted = rows.sort((a, b) => b.created_at - a.created_at)
  const lastWeight = sorted.find((r) => r.progression)
  const lastText = sorted.find((r) => r.text.trim())
  return {
    progression: lastWeight?.progression,
    text: lastText?.text.trim() || undefined,
    at: sorted[0].created_at,
  }
}

/* ------------------------------ сводка --------------------------------- */

/**
 * Сколько ждёт разбора, по видам отдельно.
 *
 * Раздельно, потому что разбирают их в разных вкладках: одно общее число
 * говорит «где-то есть работа», но не куда идти.
 */
export async function pendingByTarget(
  clientId: string,
): Promise<{ workouts: number; nutrition: number }> {
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

  return {
    workouts: workouts.filter((r) => !seenWorkouts.has(r.id)).length,
    nutrition: days.filter((d) => !seenDays.has(d.date)).length,
  }
}

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
    days.filter((d) => !isManualDay(d) && !seenDays.has(d.date)).length
  )
}
