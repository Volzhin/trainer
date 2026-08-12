import {
  db,
  enqueue,
  uid,
  now,
  currentUserId,
  setActiveUser,
  type Assignment,
  type Attachment,
  type ClientMode,
  type Consent,
  type ConsentKind,
  type Contact,
  type ContactKind,
  type Feedback,
  type Role,
  type ScheduleSlot,
  type TrainerLink,
  type UserProfile,
  type WorkoutSession,
} from './db'
import { issueRequiredTasks } from './reports'
import { estimate1RM, startOfDay, weekStart } from '../lib/calc'
import {
  createInvite as remoteCreateInvite,
  deleteRemoteAttachment,
  isAuthed,
  redeemInvite as remoteRedeemInvite,
  updateAccount,
} from '../lib/backend'

/**
 * Операции кабинета тренера и связки тренер↔клиент.
 *
 * Все проверки прав здесь клиентские — это прототип без сервера.
 * В проде каждая из этих функций становится запросом к API, а доступ
 * тренера к данным клиента ограничивается на уровне бэкенда.
 */

/* ------------------------------ аккаунты ------------------------------ */

export async function listAccounts(): Promise<UserProfile[]> {
  return db.profile.toArray()
}

export async function createAccount(input: {
  name: string
  role: Role
  specialization?: string
}): Promise<string> {
  const id = uid()
  await db.profile.add({
    id,
    name: input.name.trim() || (input.role === 'TRAINER' ? 'Тренер' : 'Клиент'),
    role: input.role,
    specialization: input.specialization,
    plan: 'FREE',
    default_rest_seconds: 90,
    haptics_enabled: 1,
    sound_enabled: 1,
    updated_at: now(),
  })
  return id
}

export async function switchAccount(userId: string) {
  const profile = await db.profile.get(userId)
  if (!profile) throw new Error('Аккаунт не найден')
  await setActiveUser(userId)
}

/* ---------------------------- подписка -------------------------------- */

/**
 * Подписка есть только у тренера — клиенту приложение бесплатно целиком.
 *
 * Платит тот, кто зарабатывает: тренер ведёт клиентов и получает за это
 * деньги. Брать с клиента за то, чтобы он мог отчитаться перед тренером,
 * значит продавать ему обязанность, а не возможность.
 */
export async function hasSubscription(trainerId = currentUserId()): Promise<boolean> {
  const profile = await db.profile.get(trainerId)
  return profile?.role === 'TRAINER' && profile.plan === 'PRO'
}

/**
 * Ворота на платные действия тренера. Проверка живёт здесь, а не только в
 * кнопках: набор клиентов и назначение программ вызываются из разных мест,
 * и правило должно быть одно.
 */
async function requireSubscription(trainerId = currentUserId()) {
  if (!(await hasSubscription(trainerId))) {
    throw new Error('Нужна подписка: без неё нельзя набирать клиентов и назначать им программы')
  }
}

/* ------------------------- приглашения и связь ------------------------ */

/**
 * Идентификатор связи выводится из пары, а не выдаётся случайно.
 *
 * Связь заводят обе стороны — клиент кодом приглашения, тренер при обмене с
 * сервером. Со случайными идентификаторами это две разные строки об одном и
 * том же, и клиент видел бы одного тренера дважды.
 */
export const linkId = (trainerId: string, clientId: string) => `link-${trainerId}-${clientId}`

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // без похожих символов
const INVITE_TTL_MS = 7 * 86400_000

function makeCode(): string {
  let out = ''
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length]
  return out
}

/**
 * Тренер выпускает код приглашения; клиент вводит его у себя в профиле.
 *
 * Код обязан уехать на сервер сразу: клиент вводит его на другом телефоне и
 * в локальной базе тренера ничего найти не может. Пока связи с сервером нет,
 * код остаётся только здесь — и об этом честно сообщается вызывающему коду.
 */
export async function createInvite(trainerId = currentUserId()): Promise<string> {
  const trainer = await db.profile.get(trainerId)
  if (trainer?.role !== 'TRAINER') throw new Error('Приглашения выпускает только тренер')
  await requireSubscription(trainerId)

  let code = makeCode()
  while (await db.invites.get(code)) code = makeCode()

  await db.invites.add({
    code,
    trainer_id: trainerId,
    created_at: now(),
    expires_at: now() + INVITE_TTL_MS,
  })

  if (isAuthed()) {
    await remoteCreateInvite(code, trainerId).catch(() => {
      throw new Error('Код не сохранился на сервере — проверьте связь и попробуйте снова')
    })
  }
  return code
}

export async function listActiveInvites(trainerId = currentUserId()) {
  const all = await db.invites.where('trainer_id').equals(trainerId).toArray()
  return all
    .filter((i) => !i.used_by && i.expires_at > now())
    .sort((a, b) => b.created_at - a.created_at)
}

export async function revokeInvite(code: string) {
  await db.invites.delete(code)
}

/**
 * Погашение кода.
 *
 * Подписи прикладываются, если тренер приложил документы. Требовать их
 * безусловно нельзя: документы у каждого тренера свои, и у того, кто
 * ничего не приложил, подписывать нечего — связь бы просто не заводилась.
 * Что подписано, хранится вместе с идентификатором файла: заменив
 * документ, тренер получает другой, и прежняя подпись к нему не относится.
 */
export async function redeemInvite(
  code: string,
  clientId = currentUserId(),
  consents: Consent[] = [],
) {
  const clean = code.trim().toUpperCase()
  let invite = await db.invites.get(clean)

  // Код гасит сервер: список приглашений закрыт, и найти чужой код по
  // перебору нельзя. В ответ приезжает карточка тренера — имя и способы
  // связи, без которых клиенту не с кем разговаривать.
  if (!invite && isAuthed()) {
    const trainer = await remoteRedeemInvite(clean)
    invite = {
      code: clean,
      trainer_id: trainer.id,
      created_at: now(),
      expires_at: now() + INVITE_TTL_MS,
    }
    await db.invites.put(invite)

    const known = await db.profile.get(trainer.id)
    const card = {
      name: trainer.name?.trim() || 'Тренер',
      contacts: trainer.contacts as Contact[] | undefined,
      preferred_contact: trainer.preferred_contact as ContactKind | undefined,
      updated_at: now(),
    }
    if (known) {
      await db.profile.update(trainer.id, card)
    } else {
      await db.profile.add({
        id: trainer.id,
        role: 'TRAINER',
        plan: 'PRO',
        default_rest_seconds: 90,
        haptics_enabled: 1,
        sound_enabled: 1,
        ...card,
      })
    }
  }

  if (!invite) throw new Error('Код не найден')
  if (invite.used_by) throw new Error('Код уже использован')
  if (invite.expires_at < now()) throw new Error('Срок действия кода истёк')
  if (invite.trainer_id === clientId) throw new Error('Нельзя пригласить самого себя')

  /*
   * Тренер у клиента ровно один.
   *
   * Проверять только связь с этим же тренером было мало: код второго
   * тренера заводил вторую связь, и дальше всё зависело от того, какую из
   * них вернёт база первой. Отчёты, комментарии и назначения расходились
   * между двумя кабинетами непредсказуемо, а на сервере поле trainer у
   * клиента одно — та связь молча переписывала другую.
   */
  const links = await db.links.where('client_id').equals(clientId).toArray()
  const active = links.filter((l) => l.status !== 'PAUSED')

  if (active.some((l) => l.trainer_id === invite.trainer_id))
    throw new Error('Вы уже работаете с этим тренером')
  if (active.length)
    throw new Error('У вас уже есть тренер — отключите его, прежде чем подключать другого')

  const existing = links.find((l) => l.trainer_id === invite.trainer_id)

  const ts = now()
  const signed = consents.map((c) => ({ ...c, signed_at: c.signed_at || ts }))

  if (existing) {
    // Возобновляя работу, человек подписывает актуальные редакции заново —
    // за время паузы текст мог смениться, а прежняя подпись относилась к
    // прежней редакции.
    await db.links.update(existing.id, { status: 'ACTIVE', consents: signed, updated_at: ts })
  } else {
    await db.links.add({
      id: linkId(invite.trainer_id, clientId),
      trainer_id: invite.trainer_id,
      client_id: clientId,
      status: 'ACTIVE',
      initiated_by: 'TRAINER',
      consents: signed,
      created_at: ts,
      updated_at: ts,
    })
  }
  await db.invites.update(invite.code, { used_by: clientId, used_at: ts })

  // Анкета, эссе и первые замеры — то, с чего начинается работа, поэтому
  // выдаются вместе со связкой, а не ждут, пока тренер о них вспомнит.
  // Повторная привязка ничего не дублирует — см. issueRequiredTasks.
  await issueRequiredTasks(clientId, invite.trainer_id)

  const trainer = await db.profile.get(invite.trainer_id)
  return trainer?.name ?? 'Тренер'
}

export async function setLinkStatus(linkId: string, status: TrainerLink['status']) {
  await db.links.update(linkId, { status, updated_at: now() })
}

/**
 * Режим работы с клиентом выбирает тренер — от него зависит, просит ли
 * приложение видео-отчёт. Клиент себе его не меняет: это условие работы,
 * а не настройка интерфейса.
 */
export async function setLinkMode(linkId: string, mode: ClientMode) {
  await db.links.update(linkId, { mode, updated_at: now() })
}

/**
 * Даты оплаты ведёт тренер: приложение денег не принимает и о платежах
 * узнаёт только с его слов. Пустое значение стирает дату — «не помню, когда
 * платил» честнее задним числом выдуманного числа.
 */
export async function setLinkPayment(
  linkId: string,
  input: { paidAt?: number; nextPaymentAt?: number },
) {
  await db.links.update(linkId, {
    paid_at: input.paidAt,
    next_payment_at: input.nextPaymentAt,
    updated_at: now(),
  })
}

/** Разрыв связи доступен обеим сторонам. Данные клиента при этом остаются у клиента. */
export async function removeLink(linkId: string) {
  const link = await db.links.get(linkId)
  if (!link) return
  const assignments = await db.assignments
    .where('client_id')
    .equals(link.client_id)
    .and((a) => a.trainer_id === link.trainer_id && a.status === 'ACTIVE')
    .toArray()
  for (const a of assignments) {
    await db.assignments.update(a.id, {
      status: 'CANCELLED',
      updated_at: now(),
    })
  }
  await db.links.delete(linkId)

  /*
   * Снимаем связь и на сервере — иначе она останется там навсегда.
   *
   * Поле trainer лежит в записи клиента, и править её вправе только он
   * сам. Поэтому отключение с его стороны отвязывает по-настоящему, а
   * отключение со стороны тренера убирает клиента из его кабинета, но
   * серверную связь не рвёт: у тренера нет прав на чужую запись. Клиент
   * доотвяжется, когда откроет приложение и нажмёт «Отключить тренера».
   */
  if (link.client_id === currentUserId() && isAuthed()) {
    await updateAccount({ trainer: '' }).catch(() => {
      /* сеть подождёт: местная связь уже снята, экраны это увидят */
    })
  }
}

/**
 * Тренер клиента.
 *
 * Берём самую свежую связь, а не первую попавшуюся: порядок выдачи у базы
 * свой, и при двух связях (например, оставшейся от прежнего тренера)
 * приложение показывало бы то одного, то другого между перезагрузками.
 */
export async function trainerOfClient(clientId = currentUserId()) {
  const links = await db.links
    .where('client_id')
    .equals(clientId)
    .and((l) => l.status !== 'PAUSED')
    .toArray()
  const link = links.sort((a, b) => b.created_at - a.created_at)[0]
  if (!link) return null
  const trainer = await db.profile.get(link.trainer_id)
  return trainer ? { link, trainer } : null
}

/* ----------------------------- аналитика ------------------------------ */

export type ClientSummary = {
  link: TrainerLink
  client: UserProfile
  lastSession?: WorkoutSession
  /** Дней с последней тренировки; null — тренировок ещё не было. */
  daysSinceLast: number | null
  sessionsThisWeek: number
  totalSessions: number
  weeklyTarget: number
  assignment?: Assignment
  assignedProgramName?: string
  /** Рекорды за последние 14 дней. */
  unreadFeedback: number
}

/** Сводка по всем клиентам тренера — основа списка и дашборда. */
export async function loadClientSummaries(
  trainerId = currentUserId(),
): Promise<ClientSummary[]> {
  const links = await db.links.where('trainer_id').equals(trainerId).toArray()
  if (!links.length) return []

  const profiles = await db.profile.bulkGet(links.map((l) => l.client_id))
  const assignments = await db.assignments.where('trainer_id').equals(trainerId).toArray()
  const programs = await db.programs.toArray()
  const programMap = new Map(programs.map((p) => [p.id, p]))

  const thisWeek = weekStart(Date.now())

  const out: ClientSummary[] = []
  for (const [i, link] of links.entries()) {
    const client = profiles[i]
    if (!client) continue

    const sessions = await db.sessions
      .where('user_id')
      .equals(client.id)
      .and((s) => s.is_completed === 1)
      .toArray()
    sessions.sort((a, b) => b.start_time - a.start_time)

    const lastSession = sessions[0]
    const assignment = assignments.find(
      (a) => a.client_id === client.id && a.status === 'ACTIVE',
    )

    const unread = await db.feedback
      .where('[trainer_id+client_id]')
      .equals([trainerId, client.id])
      .and((f) => f.is_read === 0)
      .count()

    out.push({
      link,
      client,
      lastSession,
      daysSinceLast: lastSession
        ? Math.floor((startOfDay(Date.now()) - startOfDay(lastSession.start_time)) / 86400_000)
        : null,
      sessionsThisWeek: sessions.filter((s) => s.start_time >= thisWeek).length,
      totalSessions: sessions.length,
      weeklyTarget: assignment?.weekly_target ?? 3,
      assignment,
      assignedProgramName: assignment ? programMap.get(assignment.program_id)?.name : undefined,
      unreadFeedback: unread,
    })
  }

  // Сначала те, кто выпал из графика: тренеру нужны они, а не отличники.
  return out.sort((a, b) => (b.daysSinceLast ?? 999) - (a.daysSinceLast ?? 999))
}

export type ClientDetail = {
  client: UserProfile
  sessions: WorkoutSession[]
  volumeByWeek: { label: string; value: number }[]
  records: { name: string; score: number }[]
}

/** Полная выборка по одному клиенту для карточки в кабинете тренера. */
export async function loadClientDetail(clientId: string): Promise<ClientDetail | null> {
  const client = await db.profile.get(clientId)
  if (!client) return null

  const sessions = await db.sessions
    .where('user_id')
    .equals(clientId)
    .and((s) => s.is_completed === 1)
    .toArray()
  sessions.sort((a, b) => b.start_time - a.start_time)

  const sessionIds = new Set(sessions.map((s) => s.id))
  const sets = (await db.sets.toArray()).filter(
    (s) => s.is_done === 1 && sessionIds.has(s.workout_session_id),
  )
  const sessionById = new Map(sessions.map((s) => [s.id, s]))
  const exercises = await db.exercises.toArray()
  const exMap = new Map(exercises.map((e) => [e.id, e]))

  const thisMonday = weekStart(Date.now())
  const buckets = Array(8).fill(0) as number[]
  const labels = Array.from({ length: 8 }, (_, i) =>
    new Date(thisMonday - (7 - i) * 7 * 86400_000).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'numeric',
    }),
  )

  const best = new Map<string, number>()
  for (const s of sets) {
    if (!s.weight_kg || !s.reps_completed) continue
    const session = sessionById.get(s.workout_session_id)
    if (!session) continue

    const idx = 7 - Math.round((thisMonday - weekStart(session.start_time)) / (7 * 86400_000))
    if (idx >= 0 && idx < 8) buckets[idx] += s.weight_kg * s.reps_completed

    const score = estimate1RM(s.weight_kg, s.reps_completed)
    best.set(s.exercise_id, Math.max(best.get(s.exercise_id) ?? 0, score))
  }

  return {
    client,
    sessions,
    volumeByWeek: buckets.map((value, i) => ({ label: labels[i], value })),
    records: [...best.entries()]
      .map(([exId, score]) => ({ name: exMap.get(exId)?.name ?? '—', score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6),
  }
}

/* ---------------------- назначения и обратная связь -------------------- */

export async function assignProgram(input: {
  clientId: string
  programId: string
  weeklyTarget?: number
  /** Какой день программы на какой день недели. */
  schedule?: ScheduleSlot[]
  /** Сколько недель программа актуальна. */
  weeks?: number
  note?: string
  trainerId?: string
}) {
  const trainerId = input.trainerId ?? currentUserId()
  await requireSubscription(trainerId)
  // Активное назначение всегда одно: новое отменяет предыдущее — и своё, и
  // чужое. Раньше снимались только назначения того же автора, и план, который
  // человек составил себе сам, продолжал жить рядом с назначением тренера;
  // какой из двух покажется, решал порядок строк в базе.
  const active = await db.assignments
    .where('client_id')
    .equals(input.clientId)
    .and((a) => a.status === 'ACTIVE')
    .toArray()
  for (const a of active) {
    await db.assignments.update(a.id, {
      status: 'CANCELLED',
      updated_at: now(),
    })
  }

  const id = uid()
  const startAt = now()
  const weeks = input.weeks
  const schedule = input.schedule?.length ? input.schedule : undefined

  await db.assignments.add({
    id,
    trainer_id: trainerId,
    client_id: input.clientId,
    program_id: input.programId,
    // Расписание само задаёт недельный объём — дублировать его руками незачем.
    weekly_target: schedule?.length ?? input.weeklyTarget ?? 3,
    schedule,
    weeks,
    note: input.note,
    start_at: startAt,
    // Срок считаем от понедельника недели старта: неделя плана — календарная.
    end_at: weeks ? weekStart(startAt) + weeks * 7 * 86400_000 : undefined,
    status: 'ACTIVE',
    updated_at: startAt,
  })
  return id
}

/**
 * План, который человек составляет себе сам.
 *
 * Технически это то же назначение, только тренер в нём — он сам. Отдельная
 * сущность ничего бы не дала: календарь, счётчик за неделю и «что сегодня»
 * уже умеют читать назначение, и вторая ветка в каждом из этих мест означала
 * бы два способа сломаться вместо одного.
 */
export async function planProgramMyself(input: {
  programId: string
  schedule: ScheduleSlot[]
  weeks?: number
}) {
  const me = currentUserId()
  const current = await db.assignments
    .where('client_id')
    .equals(me)
    .and((a) => a.status === 'ACTIVE')
    .first()

  // План тренера человек себе не переписывает — за этим он к тренеру и
  // пришёл. Снять такое назначение может только сам тренер.
  if (current && current.trainer_id !== me) {
    throw new Error('Программу назначил тренер — свой план поверх неё не ставится')
  }

  return assignProgram({
    clientId: me,
    programId: input.programId,
    schedule: input.schedule,
    weeks: input.weeks,
    trainerId: me,
  })
}

/** Снимает свой план. Назначение тренера этим не трогается. */
export async function cancelMyPlan(): Promise<boolean> {
  const me = currentUserId()
  const mine = await db.assignments
    .where('client_id')
    .equals(me)
    .and((a) => a.status === 'ACTIVE' && a.trainer_id === me)
    .toArray()

  for (const a of mine) {
    await db.assignments.update(a.id, { status: 'CANCELLED', updated_at: now() })
  }
  return mine.length > 0
}

/**
 * Что запланировано на конкретную дату: день программы из расписания,
 * если дата попадает в срок назначения. Без расписания плана на дату нет —
 * старые назначения работают только счётчиком за неделю.
 */
export async function plannedForDate(date: number, clientId = currentUserId()) {
  const assignment = await db.assignments
    .where('client_id')
    .equals(clientId)
    .and((a) => a.status === 'ACTIVE')
    .first()
  if (!assignment?.schedule?.length) return null

  const day = startOfDay(date)
  if (day < weekStart(assignment.start_at)) return null
  if (assignment.end_at && day >= assignment.end_at) return null

  const weekday = (new Date(day).getDay() + 6) % 7
  const slot = assignment.schedule.find((s) => s.weekday === weekday)
  if (!slot) return null

  const routine = await db.routines.get(slot.routine_id)
  if (!routine) return null

  const program = await db.programs.get(assignment.program_id)
  return { assignment, routine, program }
}

/** Даты плановых тренировок в диапазоне — для маркеров календаря. */
export async function plannedDates(
  from: number,
  to: number,
  clientId = currentUserId(),
): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  const assignment = await db.assignments
    .where('client_id')
    .equals(clientId)
    .and((a) => a.status === 'ACTIVE')
    .first()
  if (!assignment?.schedule?.length) return out

  const routines = await db.routines.bulkGet(assignment.schedule.map((s) => s.routine_id))
  const nameByWeekday = new Map<number, string>()
  assignment.schedule.forEach((slot, i) => {
    const r = routines[i]
    if (r) nameByWeekday.set(slot.weekday, r.name)
  })

  const begin = Math.max(startOfDay(from), weekStart(assignment.start_at))
  const finish = assignment.end_at
    ? Math.min(startOfDay(to), assignment.end_at - 86400_000)
    : startOfDay(to)

  for (let d = begin; d <= finish; d += 86400_000) {
    const name = nameByWeekday.get((new Date(d).getDay() + 6) % 7)
    if (name) out.set(d, name)
  }
  return out
}

/**
 * Персональная программа под клиента: сразу создаётся с первым днём и
 * назначается — тренеру остаётся наполнить её упражнениями.
 */
export async function createPersonalProgram(input: {
  clientId: string
  name?: string
  weeklyTarget?: number
  trainerId?: string
}) {
  const trainerId = input.trainerId ?? currentUserId()
  await requireSubscription(trainerId)
  const client = await db.profile.get(input.clientId)
  const ts = now()

  const programId = uid()
  await db.programs.add({
    id: programId,
    name: input.name?.trim() || `Программа · ${client?.name ?? 'клиент'}`,
    description: `Персональная программа от тренера`,
    author_id: trainerId,
    client_id: input.clientId,
    goal: 'Гипертрофия',
    level: client?.experience ?? 'Средний',
    is_public: 0,
    updated_at: ts,
  })
  await db.routines.add({
    id: uid(),
    program_id: programId,
    name: 'День 1',
    day_order: 1,
    updated_at: ts,
  })
  await assignProgram({
    clientId: input.clientId,
    programId,
    weeklyTarget: input.weeklyTarget ?? 3,
    trainerId,
  })
  return programId
}

/** Персональные программы, собранные тренером под этого клиента. */
export async function personalProgramsFor(clientId: string, trainerId = currentUserId()) {
  const rows = await db.programs.where('client_id').equals(clientId).toArray()
  return rows.filter((p) => p.author_id === trainerId)
}

/**
 * Удаляет персональную программу клиента вместе с днями и упражнениями.
 * Активное назначение на неё снимается: иначе у клиента останется план,
 * ведущий в никуда.
 */
export async function deletePersonalProgram(programId: string) {
  const assignments = await db.assignments.where('program_id').equals(programId).toArray()
  for (const a of assignments) {
    if (a.status === 'ACTIVE') {
      await db.assignments.update(a.id, {
        status: 'CANCELLED',
        updated_at: now(),
      })
    }
  }

  const routines = await db.routines.where('program_id').equals(programId).toArray()
  for (const r of routines) {
    const items = await db.templateItems.where('routine_id').equals(r.id).toArray()
    await db.templateItems.bulkDelete(items.map((i) => i.id))
  }
  await db.routines.bulkDelete(routines.map((r) => r.id))
  await db.programs.delete(programId)
}

export async function cancelAssignment(assignmentId: string) {
  await db.assignments.update(assignmentId, {
    status: 'CANCELLED',
    updated_at: now(),
  })
}

/** Активное назначение клиента — показывается у него на главной. */
export async function activeAssignmentFor(clientId = currentUserId()) {
  const assignment = await db.assignments
    .where('client_id')
    .equals(clientId)
    .and((a) => a.status === 'ACTIVE')
    .first()
  if (!assignment) return null

  const [program, trainer] = await Promise.all([
    db.programs.get(assignment.program_id),
    db.profile.get(assignment.trainer_id),
  ])
  if (!program) return null

  const routines = await db.routines.where('program_id').equals(program.id).sortBy('day_order')
  const doneThisWeek = await db.sessions
    .where('user_id')
    .equals(clientId)
    .and((s) => s.is_completed === 1 && s.start_time >= weekStart(Date.now()))
    .count()

  const weeksLeft = assignment.end_at
    ? Math.max(0, Math.ceil((assignment.end_at - Date.now()) / (7 * 86400_000)))
    : undefined

  return {
    assignment,
    program,
    trainer,
    routines,
    doneThisWeek,
    weeksLeft,
    // План, составленный самому себе. Называть его «программой от тренера»
    // значит врать человеку, а прятать за ним каталог — запирать его в
    // выборе, который он сделал сам и вправе поменять.
    isSelfPlan: assignment.trainer_id === clientId,
  }
}

export async function addFeedback(input: {
  clientId: string
  sessionId: string
  text: string
  /** Задан — комментарий относится к конкретному упражнению, обычно к видео. */
  exerciseId?: string
  trainerId?: string
}) {
  await db.feedback.add({
    id: uid(),
    trainer_id: input.trainerId ?? currentUserId(),
    client_id: input.clientId,
    session_id: input.sessionId,
    exercise_id: input.exerciseId,
    text: input.text.trim(),
    created_at: now(),
    is_read: 0,
    updated_at: now(),
  })
}

/* --------------------------- видео техники ---------------------------- */

/** Ограничение размера: IndexedDB не резиновая, а тренеру нужен короткий клип. */
export const MAX_VIDEO_BYTES = 60 * 1024 * 1024

export async function addAttachment(input: {
  sessionId: string
  exerciseId: string
  file: File
  userId?: string
}) {
  if (input.file.size > MAX_VIDEO_BYTES) {
    throw new Error('Файл больше 60 МБ — снимите ролик покороче')
  }
  const kind: Attachment['kind'] = input.file.type.startsWith('image/') ? 'photo' : 'video'
  const attachment: Attachment = {
    id: uid(),
    user_id: input.userId ?? currentUserId(),
    session_id: input.sessionId,
    exercise_id: input.exerciseId,
    kind,
    blob: input.file,
    mime: input.file.type || (kind === 'photo' ? 'image/jpeg' : 'video/mp4'),
    size: input.file.size,
    created_at: now(),
    updated_at: now(),
  }
  await db.attachments.add(attachment)
  return attachment.id
}

/**
 * Скриншот дневника питания за день.
 *
 * Кладём в ту же таблицу, что и видео техники: у неё есть свой путь
 * выгрузки файлов, а обычная синхронизация возит json и Blob не увезёт.
 */
export async function addNutritionShot(input: {
  date: string
  blob: Blob
  userId?: string
}): Promise<string> {
  const id = uid()
  const ts = now()
  await db.attachments.add({
    id,
    user_id: input.userId ?? currentUserId(),
    nutrition_date: input.date,
    kind: 'photo',
    blob: input.blob,
    mime: input.blob.type || 'image/jpeg',
    size: input.blob.size,
    created_at: ts,
    updated_at: ts,
  })
  return id
}

export async function nutritionShots(
  date: string,
  userId = currentUserId(),
): Promise<Attachment[]> {
  const rows = await db.attachments.where('nutrition_date').equals(date).toArray()
  return rows.filter((a) => a.user_id === userId).sort((a, b) => a.created_at - b.created_at)
}

/* ---------------------------- документы -------------------------------- */

/**
 * Документы тренера: оферта и согласие на обработку данных.
 *
 * Свои у каждого — тренеры работают по разным договорам, и общий текст
 * подошёл бы не всем. Не прикрепил ни одного — клиенту нечего подписывать,
 * и шаг с галочками ему не показывают вовсе.
 */
export async function trainerDocs(trainerId = currentUserId()): Promise<Attachment[]> {
  const rows = await db.attachments.where('user_id').equals(trainerId).toArray()
  return rows.filter((a) => a.kind === 'document')
}

/** Прикрепить документ. Одного вида может быть только один: новый заменяет. */
export async function setTrainerDoc(input: {
  kind: ConsentKind
  blob: Blob
  fileName: string
  trainerId?: string
}): Promise<string> {
  const trainerId = input.trainerId ?? currentUserId()
  const existing = (await trainerDocs(trainerId)).filter((a) => a.doc_kind === input.kind)
  for (const old of existing) await deleteAttachment(old.id)

  const id = uid()
  const ts = now()
  await db.attachments.add({
    id,
    user_id: trainerId,
    doc_kind: input.kind,
    kind: 'document',
    blob: input.blob,
    mime: input.blob.type || 'application/pdf',
    size: input.blob.size,
    remote_file: undefined,
    created_at: ts,
    updated_at: ts,
  })
  return id
}

export async function attachmentsForSession(sessionId: string): Promise<Attachment[]> {
  const rows = await db.attachments.where('session_id').equals(sessionId).toArray()
  return rows.sort((a, b) => a.created_at - b.created_at)
}

export async function deleteAttachment(id: string) {
  const row = await db.attachments.get(id)
  await db.attachments.delete(id)

  // Файл на сервере надо снести отдельно: иначе видео, которое человек у
  // себя удалил, продолжит лежать в хранилище и показываться тренеру.
  if (row?.remote_id && isAuthed()) {
    await deleteRemoteAttachment(row.remote_id).catch(() => {})
    await enqueue('attachments', id, 'delete', row)
  }
}

export async function feedbackForSession(sessionId: string): Promise<Feedback[]> {
  const rows = await db.feedback.where('session_id').equals(sessionId).toArray()
  return rows.sort((a, b) => a.created_at - b.created_at)
}

export async function markFeedbackRead(sessionId: string) {
  const rows = await db.feedback.where('session_id').equals(sessionId).toArray()
  for (const r of rows) {
    if (r.is_read === 0) await db.feedback.update(r.id, { is_read: 1, updated_at: now() })
  }
}

/* ------------------------- заметки о клиенте --------------------------- */

export async function addTrainerNote(
  clientId: string,
  text: string,
  trainerId = currentUserId(),
) {
  await db.trainerNotes.add({
    id: uid(),
    trainer_id: trainerId,
    client_id: clientId,
    text: text.trim(),
    created_at: now(),
    updated_at: now(),
  })
}

export async function listTrainerNotes(clientId: string, trainerId = currentUserId()) {
  const rows = await db.trainerNotes
    .where('[trainer_id+client_id]')
    .equals([trainerId, clientId])
    .toArray()
  return rows.sort((a, b) => b.created_at - a.created_at)
}

export async function deleteTrainerNote(noteId: string) {
  await db.trainerNotes.delete(noteId)
}
