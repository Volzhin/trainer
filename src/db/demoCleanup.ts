import {
  db,
  deleteManySynced,
  now,
  currentUserId,
  type BodyMetric,
  type UserProfile,
  type WorkoutSession,
} from './db'
import { deleteAttachment } from './files'
import { authUser } from '../lib/backend'
import { t } from '../lib/i18n'

/**
 * Уборка за демо-режимом. **Модуль временный — см. условие снятия ниже.**
 *
 * Режим убран из приложения целиком (коммит «Демо-режим убран целиком»), но
 * удалился только код, который данные заводил. Сами строки остались там, куда
 * он их положил: у занимающегося — десять недель выдуманных тренировок и
 * переписанный профиль, у тренера — пятеро выдуманных клиентов.
 *
 * Почему это не разовый скрипт, а код в приложении: строки лежат в локальной
 * базе на чужом устройстве. Дотянуться туда снаружи нельзя ни админкой, ни
 * туннелем, а почистить один сервер мало — в своей истории человек продолжит
 * видеть выдуманные тренировки, наверх они не переспрашиваются. Убрать строку
 * из чужого IndexedDB может только код, который выполнится на этом устройстве.
 *
 * **Когда удалять.** Как только раздел перестал появляться у всех, кто demo
 * включал (он показывается, только если есть что убирать). Удалить нужно:
 * этот файл, `DemoLeftovers` в `src/pages/Settings.tsx` вместе с импортом и
 * вызовом, и раздел «уборка за демо-режимом» в `src/lib/i18n.ts`. Файл
 * `src/db/files.ts` при этом остаётся — им пользуются задания и кабинет.
 *
 * Убирается это двумя разными способами, и путать их нельзя:
 *
 * — Своё (тренировки, замеры, профиль) уехало на сервер и удаляется через
 *   deleteManySynced. Прямой delete означал бы «у себя пропало, у тренера
 *   осталось, на новом телефоне вернулось»: выгрузка знает об удалении
 *   только по очереди мутаций.
 * — Выдуманные клиенты наверх не уезжали никогда и уехать не могли: их
 *   владелец — несуществующий человек, и выгрузка такие строки придерживает
 *   (см. `held` в `push`). Стирать их надо именно молча, без записей об
 *   удалении: сервер отклонил бы тумбстоун на чужого владельца, а очередь
 *   копила бы отказы и дёргала бы их каждым проходом.
 */

/**
 * Значения, которые демо вписывало в профиль вместо настоящих: «Алексей»,
 * мужчина, 182 см. Сверяем поле за полем, а не «профиль целиком демошный»:
 * человек мог с тех пор поправить свой рост руками, и стирать его правку
 * заодно с выдумкой нельзя.
 */
const DEMO_PROFILE = {
  name: 'Алексей',
  gender: 'м',
  height_cm: 182,
  neck_cm: 38,
  goal_weight_kg: 78,
  experience: 'Средний',
} as const

type DemoField = keyof typeof DEMO_PROFILE

/** Что человеку показать в списке — по-русски, а не именами полей базы. */
const FIELD_LABELS: Record<DemoField, string> = {
  name: 'имя',
  gender: 'пол',
  height_cm: 'рост',
  neck_cm: 'обхват шеи',
  goal_weight_kg: 'целевой вес',
  experience: 'уровень',
}

/** Имена выдуманных клиентов, которых заводил тренерский демо-набор. */
const DEMO_CLIENT_NAMES = ['Марина К.', 'Дмитрий Р.', 'Ольга В.', 'Артём С.', 'Ксения Л.']

export type DemoTrace = {
  sessions: WorkoutSession[]
  /** Подходы всех найденных тренировок — их больше всего, показываем числом. */
  setIds: string[]
  metrics: BodyMetric[]
  /** Поля профиля, в которых до сих пор стоит демо-значение. */
  fields: DemoField[]
  /** Выдуманные клиенты в кабинете тренера. */
  clients: UserProfile[]
  /** Имя из учётной записи на сервере — им и заменим выдуманное. */
  realName?: string
}

export const hasDemoTrace = (trace: DemoTrace): boolean =>
  trace.sessions.length > 0 ||
  trace.metrics.length > 0 ||
  trace.fields.length > 0 ||
  trace.clients.length > 0

/**
 * Человеческий перечень найденного — он же текст подтверждения.
 *
 * Собирается здесь, а не на экране: подтверждение обязано говорить ровно то
 * же, что и карточка, и два списка в разных файлах разъехались бы при первой
 * же правке.
 */
export function describeDemoTrace(trace: DemoTrace): string[] {
  const out: string[] = []
  if (trace.sessions.length) {
    out.push(
      `${t('Тренировок')}: ${trace.sessions.length} · ${t('подходов в них')}: ${trace.setIds.length}`,
    )
  }
  if (trace.metrics.length) out.push(`${t('Замеров')}: ${trace.metrics.length}`)
  if (trace.fields.length) {
    out.push(`${t('В профиле')}: ${trace.fields.map((f) => t(FIELD_LABELS[f])).join(', ')}`)
  }
  // Клиентов называем поимённо: список короткий, а тренер по нему сразу
  // видит, что это не его люди, — числу «пятеро клиентов» он бы не поверил.
  if (trace.clients.length) {
    out.push(`${t('Выдуманные клиенты')}: ${trace.clients.map((c) => c.name).join(', ')}`)
  }
  return out
}

/** Все завершённые тренировки человека выглядят сгенерированными? */
const onlyGeneratedSessions = (rows: WorkoutSession[]): boolean =>
  rows.every((s) => s.is_completed !== 1 || s.updated_at === s.start_time)

/**
 * Ищет следы демо у одного аккаунта.
 *
 * Тренировку узнаём по метке правки, равной времени начала. Совпасть это
 * может только у сгенерированной строки: настоящую завершает finishSession,
 * а он ставит метку моментом завершения — то есть заведомо позже начала.
 * Ни один другой путь в приложении завершённых тренировок не создаёт.
 *
 * Замер — по тройке «отчёт биоимпеданса, показатели выведены расчётом, метка
 * правки равна дате замера». Одного расчётного признака мало: повторный
 * импорт настоящего PDF за тот же день переписывает строку, не трогая эту
 * пометку, — и настоящий отчёт стал бы выглядеть выдуманным. Метка правки
 * при таком импорте съезжает на момент загрузки и выдаёт его.
 */
export async function findDemoTrace(userId = currentUserId()): Promise<DemoTrace> {
  const sessions = await db.sessions
    .where('user_id')
    .equals(userId)
    .and((s) => s.is_completed === 1 && s.updated_at === s.start_time)
    .toArray()
  sessions.sort((a, b) => b.start_time - a.start_time)

  const sessionIds = new Set(sessions.map((s) => s.id))
  const setIds = sessionIds.size
    ? ((await db.sets
        .filter((s) => sessionIds.has(s.workout_session_id))
        .primaryKeys()) as string[])
    : []

  const metrics = await db.bodyMetrics
    .where('user_id')
    .equals(userId)
    .and((m) => m.source === 'inbody' && m.derived === 1 && m.updated_at === m.logged_at)
    .toArray()
  metrics.sort((a, b) => b.logged_at - a.logged_at)

  const clients = await findDemoClients(userId)
  const profile = await db.profile.get(userId)

  /*
   * Профиль судим только тогда, когда демо в этом аккаунте точно крутили.
   *
   * Сами по себе «мужчина» и «Средний» — обычные ответы анкеты, их у демо
   * ровно два и три возможных значения. Без такой оговорки раздел «у вас
   * демо-данные» показался бы каждому мужчине, заполнившему анкету, а
   * нажатие стёрло бы ему пол и уровень — восстановить их неоткуда.
   *
   * Признаком, что демо было, служит либо имя (его приложение придумать не
   * могло больше нигде), либо найденные выдуманные тренировки и замеры.
   */
  const ranHere =
    profile?.name === DEMO_PROFILE.name ||
    sessions.length > 0 ||
    metrics.length > 0 ||
    clients.length > 0

  const fields =
    profile && ranHere
      ? (Object.keys(DEMO_PROFILE) as DemoField[]).filter((f) => profile[f] === DEMO_PROFILE[f])
      : []

  // Настоящее имя уцелело: демо переписывало профиль в местной базе, а
  // учётную запись на сервере не трогало — там как записались, так и лежит.
  const account = authUser()
  const realName = account?.id === userId ? account.name?.trim() || undefined : undefined

  return { sessions, setIds, metrics, fields, clients, realName }
}

/**
 * Выдуманные клиенты этого тренера.
 *
 * Сверяем по имени из набора и требуем, чтобы у человека не нашлось ни одной
 * настоящей тренировки: имя вроде «Ольга В.» может носить и живой клиент, а
 * вот живого клиента с одними только сгенерированными тренировками не бывает.
 */
async function findDemoClients(trainerId: string): Promise<UserProfile[]> {
  const links = await db.links.where('trainer_id').equals(trainerId).toArray()
  if (!links.length) return []

  const out: UserProfile[] = []
  for (const link of links) {
    const client = await db.profile.get(link.client_id)
    if (!client || !DEMO_CLIENT_NAMES.includes(client.name)) continue
    const rows = await db.sessions.where('user_id').equals(client.id).toArray()
    if (onlyGeneratedSessions(rows)) out.push(client)
  }
  return out
}

/**
 * Убирает найденное. Возвращает то же описание, что показывали до нажатия, —
 * чтобы в подтверждении говорилось ровно о сделанном, а не о задуманном.
 *
 * Подписка (`plan`) намеренно не трогается: у занимающегося она ни на что не
 * влияет, а у тренера её сброс отобрал бы право набирать клиентов — цена
 * ошибки здесь несопоставима с выигрышем.
 */
export async function removeDemoTrace(userId = currentUserId()): Promise<DemoTrace> {
  const trace = await findDemoTrace(userId)

  // Владельца подходов передаём явно: он выводится из тренировки, а её к
  // моменту выгрузки уже не будет.
  await deleteManySynced('sets', trace.setIds, userId)

  const sessionIds = trace.sessions.map((s) => s.id)
  if (sessionIds.length) await removeSessionTails(userId, sessionIds)

  await deleteManySynced('sessions', sessionIds)
  await deleteManySynced(
    'bodyMetrics',
    trace.metrics.map((m) => m.id),
  )

  if (trace.fields.length) await clearDemoProfile(userId, trace)
  for (const client of trace.clients) await removeDemoClient(userId, client.id)

  return trace
}

/**
 * Всё, что повисло на выдуманной тренировке.
 *
 * Отчёт по ней остался бы в кабинете тренера ссылкой в пустоту, а разбор
 * упражнения — у снаряда: `CoachHint` ищет его по упражнению, а не по
 * тренировке, и «прибавить вес», сказанное о выдуманном подходе, висело бы
 * вечно. Вложения не открывались бы больше ниоткуда.
 */
async function removeSessionTails(userId: string, sessionIds: string[]) {
  const ids = new Set(sessionIds)

  const reports = await db.workoutReports
    .where('user_id')
    .equals(userId)
    .and((r) => ids.has(r.session_id))
    .toArray()
  // Ключ ответа тренера у тренировки — сам отчёт, поэтому список один.
  const reportIds = reports.map((r) => r.id)
  await deleteManySynced('reportReplies', reportIds, userId)
  await deleteManySynced('workoutReports', reportIds, userId)

  const notes = await db.feedback.filter((f) => ids.has(f.session_id)).primaryKeys()
  await deleteManySynced('feedback', notes as string[], userId)

  const files = await db.attachments
    .filter((a) => !!a.session_id && ids.has(a.session_id))
    .primaryKeys()
  for (const id of files as string[]) await deleteAttachment(id)
}

/**
 * Стирает выдуманного клиента целиком — молча, без записей об удалении.
 *
 * Именно молча: на сервере этого человека нет и не было, туда его строки не
 * уезжали (выгрузка придерживает их как чужие). Тумбстоун на несуществующего
 * владельца сервер отклонит, а очередь будет носить его вечно, дёргая сеть
 * каждым проходом. Здесь прямой delete — единственный правильный вариант, и
 * это ровно тот случай, ради которого стоит оговорка в `deleteSynced`.
 */
async function removeDemoClient(trainerId: string, clientId: string) {
  const sessions = await db.sessions.where('user_id').equals(clientId).primaryKeys()
  const sessionIds = new Set(sessions as string[])
  const setIds = await db.sets.filter((s) => sessionIds.has(s.workout_session_id)).primaryKeys()
  await db.sets.bulkDelete(setIds as string[])
  await db.sessions.bulkDelete(sessions as string[])

  await db.bodyMetrics.where('user_id').equals(clientId).delete()
  await db.assignments.where('client_id').equals(clientId).delete()
  await db.feedback.where('client_id').equals(clientId).delete()
  await db.trainerNotes.where('[trainer_id+client_id]').equals([trainerId, clientId]).delete()
  await db.chat.where('thread_id').equals(`${trainerId}::${clientId}`).delete()
  await db.tasks.where('client_id').equals(clientId).delete()

  // Программы, скопированные под выдуманного клиента при назначении, — вместе
  // с днями и упражнениями: без них в списке программ остаются копии, которые
  // не отличить от настоящих.
  const programs = await db.programs.where('client_id').equals(clientId).toArray()
  for (const program of programs) {
    const routines = await db.routines.where('program_id').equals(program.id).primaryKeys()
    for (const routineId of routines as string[]) {
      await db.templateItems.where('routine_id').equals(routineId).delete()
    }
    await db.routines.bulkDelete(routines as string[])
  }
  await db.programs.bulkDelete(programs.map((p) => p.id))

  await db.links.where('[trainer_id+client_id]').equals([trainerId, clientId]).delete()
  await db.profile.delete(clientId)
}

/**
 * Возвращает профиль к «не заполнено».
 *
 * Правильных значений взять неоткуда — их знает только сам человек, поэтому
 * поля не подменяются правдоподобными, а освобождаются: пустой рост
 * приложение спросит, а чужие 182 см оно молча подставит в расчёт процента
 * жира и суточного расхода. Имя — исключение: оно уцелело в учётной записи.
 *
 * Пишем put, а не update: строку нужно оставить без этих ключей вовсе, и
 * собрать её целиком честнее, чем полагаться на то, что update поймёт
 * undefined как «удали поле».
 */
async function clearDemoProfile(userId: string, trace: DemoTrace) {
  const profile = await db.profile.get(userId)
  if (!profile) return

  const next: UserProfile = { ...profile, updated_at: now() }
  for (const field of trace.fields) {
    if (field === 'name') {
      next.name = trace.realName ?? 'Без имени'
      continue
    }
    delete next[field]
  }
  await db.profile.put(next)
}
