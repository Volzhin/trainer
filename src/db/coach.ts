import {
  db,
  uid,
  now,
  currentUserId,
  setActiveUser,
  type Assignment,
  type Attachment,
  type Feedback,
  type Role,
  threadId,
  type TrainerLink,
  type UserProfile,
  type WorkoutSession,
} from './db'
import { estimate1RM, startOfDay } from '../lib/calc'

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
    plan: input.role === 'TRAINER' ? 'PRO' : 'FREE',
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

/* ------------------------- приглашения и связь ------------------------ */

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // без похожих символов
const INVITE_TTL_MS = 7 * 86400_000

function makeCode(): string {
  let out = ''
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length]
  return out
}

/** Тренер выпускает код приглашения; клиент вводит его у себя в профиле. */
export async function createInvite(trainerId = currentUserId()): Promise<string> {
  const trainer = await db.profile.get(trainerId)
  if (trainer?.role !== 'TRAINER') throw new Error('Приглашения выпускает только тренер')

  let code = makeCode()
  while (await db.invites.get(code)) code = makeCode()

  await db.invites.add({
    code,
    trainer_id: trainerId,
    created_at: now(),
    expires_at: now() + INVITE_TTL_MS,
  })
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
 * Клиент активирует код тренера. Связь создаётся сразу активной:
 * клиент сам ввёл код, то есть согласие уже выражено.
 */
export async function redeemInvite(code: string, clientId = currentUserId()) {
  const invite = await db.invites.get(code.trim().toUpperCase())
  if (!invite) throw new Error('Код не найден')
  if (invite.used_by) throw new Error('Код уже использован')
  if (invite.expires_at < now()) throw new Error('Срок действия кода истёк')
  if (invite.trainer_id === clientId) throw new Error('Нельзя пригласить самого себя')

  const existing = await db.links
    .where('[trainer_id+client_id]')
    .equals([invite.trainer_id, clientId])
    .first()
  if (existing && existing.status !== 'PAUSED') throw new Error('Вы уже работаете с этим тренером')

  const ts = now()
  if (existing) {
    await db.links.update(existing.id, { status: 'ACTIVE', updated_at: ts })
  } else {
    await db.links.add({
      id: uid(),
      trainer_id: invite.trainer_id,
      client_id: clientId,
      status: 'ACTIVE',
      initiated_by: 'TRAINER',
      created_at: ts,
      updated_at: ts,
    })
  }
  await db.invites.update(invite.code, { used_by: clientId, used_at: ts })

  const trainer = await db.profile.get(invite.trainer_id)
  return trainer?.name ?? 'Тренер'
}

export async function setLinkStatus(linkId: string, status: TrainerLink['status']) {
  await db.links.update(linkId, { status, updated_at: now() })
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
    await db.assignments.update(a.id, { status: 'CANCELLED', updated_at: now() })
  }
  await db.links.delete(linkId)
}

export async function trainerOfClient(clientId = currentUserId()) {
  const link = await db.links
    .where('client_id')
    .equals(clientId)
    .and((l) => l.status !== 'PAUSED')
    .first()
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
  recentPRs: number
  unreadFeedback: number
  unreadChat: number
}

function weekStart(ts: number) {
  const day = startOfDay(ts)
  return day - ((new Date(day).getDay() + 6) % 7) * 86400_000
}

/** Сводка по всем клиентам тренера — основа списка и дашборда. */
export async function loadClientSummaries(trainerId = currentUserId()): Promise<ClientSummary[]> {
  const links = await db.links.where('trainer_id').equals(trainerId).toArray()
  if (!links.length) return []

  const profiles = await db.profile.bulkGet(links.map((l) => l.client_id))
  const assignments = await db.assignments.where('trainer_id').equals(trainerId).toArray()
  const programs = await db.programs.toArray()
  const programMap = new Map(programs.map((p) => [p.id, p]))

  const thisWeek = weekStart(Date.now())
  const prCutoff = Date.now() - 14 * 86400_000

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

    // Рекорды считаем только по свежим сессиям — тренеру важно недавнее.
    let recentPRs = 0
    for (const s of sessions) {
      if (s.start_time < prCutoff) break
      const rows = await db.sets.where('workout_session_id').equals(s.id).toArray()
      recentPRs += rows.filter((r) => r.is_pr === 1).length
    }

    const unread = await db.feedback
      .where('[trainer_id+client_id]')
      .equals([trainerId, client.id])
      .and((f) => f.is_read === 0)
      .count()

    // Непрочитанные сообщения клиента — тренеру важно ответить, а не только
    // посмотреть тренировки, поэтому счётчик едет в ту же сводку.
    const unreadChat = await db.chat
      .where('thread_id')
      .equals(threadId(trainerId, client.id))
      .and((m) => m.is_read === 0 && m.author_id !== trainerId)
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
      recentPRs,
      unreadFeedback: unread,
      unreadChat,
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
  weightPoints: { x: number; y: number }[]
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

  const metrics = await db.bodyMetrics.where('user_id').equals(clientId).sortBy('logged_at')

  return {
    client,
    sessions,
    volumeByWeek: buckets.map((value, i) => ({ label: labels[i], value })),
    records: [...best.entries()]
      .map(([exId, score]) => ({ name: exMap.get(exId)?.name ?? '—', score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6),
    weightPoints: metrics
      .filter((m) => m.weight_kg != null)
      .map((m) => ({ x: m.logged_at, y: m.weight_kg! })),
  }
}

/* ---------------------- назначения и обратная связь -------------------- */

export async function assignProgram(input: {
  clientId: string
  programId: string
  weeklyTarget: number
  note?: string
  trainerId?: string
}) {
  const trainerId = input.trainerId ?? currentUserId()
  // Активное назначение всегда одно: новое отменяет предыдущее.
  const active = await db.assignments
    .where('client_id')
    .equals(input.clientId)
    .and((a) => a.trainer_id === trainerId && a.status === 'ACTIVE')
    .toArray()
  for (const a of active) {
    await db.assignments.update(a.id, { status: 'CANCELLED', updated_at: now() })
  }

  const id = uid()
  await db.assignments.add({
    id,
    trainer_id: trainerId,
    client_id: input.clientId,
    program_id: input.programId,
    weekly_target: input.weeklyTarget,
    note: input.note,
    start_at: now(),
    status: 'ACTIVE',
    updated_at: now(),
  })
  return id
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

export async function cancelAssignment(assignmentId: string) {
  await db.assignments.update(assignmentId, { status: 'CANCELLED', updated_at: now() })
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

  return { assignment, program, trainer, routines, doneThisWeek }
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

export async function attachmentsForSession(sessionId: string): Promise<Attachment[]> {
  const rows = await db.attachments.where('session_id').equals(sessionId).toArray()
  return rows.sort((a, b) => a.created_at - b.created_at)
}

export async function deleteAttachment(id: string) {
  await db.attachments.delete(id)
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

export async function addTrainerNote(clientId: string, text: string, trainerId = currentUserId()) {
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
