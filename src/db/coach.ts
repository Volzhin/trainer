import {
  db,
  deleteManySynced,
  deleteSynced,
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
  type WorkoutRoutine,
  type WorkoutSession,
} from './db'
import { deleteAttachment } from './files'
import { issueRequiredTasks } from './reports'
import { shrinkVideo } from '../lib/video'
import { syncCatalogPrograms } from './seed'
import { estimate1RM, startOfDay, weekStart } from '../lib/calc'
import { locale, t } from '../lib/i18n'
import {
  createInvite as remoteCreateInvite,
  isAuthed,
  redeemInvite as remoteRedeemInvite,
  revokeInvite as remoteRevokeInvite,
  unlinkClient,
} from '../lib/backend'

/**
 * Операции кабинета тренера и связки тренер↔клиент.
 *
 * Все проверки прав здесь клиентские — это прототип без сервера.
 * В проде каждая из этих функций становится запросом к API, а доступ
 * тренера к данным клиента ограничивается на уровне бэкенда.
 */

/** За сколько дней до даты тренер должен о ней узнать. */
const BIRTHDAY_AHEAD_DAYS = 7

/**
 * Сколько дней до дня рождения — или null, если он дальше недели.
 *
 * Считаем по ближайшему повторению даты, а не по самой дате рождения: в
 * декабре ближайший день рождения января наступает уже в следующем году, и
 * простая разница дала бы почти минус год.
 */
export function daysToBirthday(birthDate?: string): number | null {
  if (!birthDate) return null
  const born = new Date(`${birthDate}T12:00:00`)
  if (Number.isNaN(born.getTime())) return null

  const today = startOfDay(Date.now())
  const year = new Date(today).getFullYear()
  let next = new Date(year, born.getMonth(), born.getDate(), 12).getTime()
  if (startOfDay(next) < today) {
    next = new Date(year + 1, born.getMonth(), born.getDate(), 12).getTime()
  }

  const days = Math.round((startOfDay(next) - today) / 86400_000)
  return days <= BIRTHDAY_AHEAD_DAYS ? days : null
}

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
  if (!profile) throw new Error(t('Аккаунт не найден'))
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
    throw new Error(t('Нужна подписка: без неё нельзя набирать клиентов и назначать им программы'))
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
  if (trainer?.role !== 'TRAINER') throw new Error(t('Приглашения выпускает только тренер'))
  await requireSubscription(trainerId)

  let code = makeCode()
  while (await db.invites.get(code)) code = makeCode()

  const expiresAt = now() + INVITE_TTL_MS

  // Сервер идёт первым: код, который есть только здесь, клиент на своём
  // телефоне погасить не сможет, а тренер уже прочитает его вслух.
  if (isAuthed()) {
    await remoteCreateInvite(code, trainerId, expiresAt).catch(() => {
      throw new Error(t('Код не сохранился на сервере — проверьте связь и попробуйте снова'))
    })
  }

  await db.invites.add({
    code,
    trainer_id: trainerId,
    created_at: now(),
    expires_at: expiresAt,
  })
  return code
}

export async function listActiveInvites(trainerId = currentUserId()) {
  const all = await db.invites.where('trainer_id').equals(trainerId).toArray()
  return all
    .filter((i) => !i.used_by && i.expires_at > now())
    .sort((a, b) => b.created_at - a.created_at)
}

/**
 * Отзывает код. Сервер идёт первым и по той же причине, что при выпуске:
 * гасит код он, и запись, стёртая только здесь, продолжает исправно
 * привязывать людей к тренеру, который считает, что отозвал приглашение.
 */
export async function revokeInvite(code: string) {
  if (isAuthed()) {
    await remoteRevokeInvite(code).catch(() => {
      throw new Error(t('Код не отозвался на сервере — проверьте связь и попробуйте снова'))
    })
  }
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

  if (!invite) throw new Error(t('Код не найден'))
  if (invite.used_by) throw new Error(t('Код уже использован'))
  if (invite.expires_at < now()) throw new Error(t('Срок действия кода истёк'))
  if (invite.trainer_id === clientId) throw new Error(t('Нельзя пригласить самого себя'))

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
    throw new Error(t('Вы уже работаете с этим тренером'))
  if (active.length)
    throw new Error(t('У вас уже есть тренер — отключите его, прежде чем подключать другого'))

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
  // Через deleteSynced: строка связи уезжает на сервер как все остальные, и
  // без тумбстоуна она вернулась бы обратно первым же приёмом данных.
  await deleteSynced('links', linkId)

  /*
   * Снимаем связь и на сервере — иначе она останется там навсегда: у
   * клиента он числился бы за прежним тренером и не смог бы подключить
   * нового, а тренер продолжал бы видеть его данные.
   *
   * Рвут обе стороны через один обработчик: поле лежит в записи клиента,
   * и открывать её на запись всем ради этого нельзя — сервер сам решает,
   * кому можно.
   */
  if (isAuthed()) {
    const iAmClient = link.client_id === currentUserId()
    await unlinkClient(iAmClient ? undefined : link.client_id).catch(() => {
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
    new Date(thisMonday - (7 - i) * 7 * 86400_000).toLocaleDateString(locale(), {
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

/**
 * Что именно получит клиент по назначению.
 *
 * Каталог одинаков у всех и приезжает при первом запуске — на него довольно
 * сослаться. А собранную тренером программу клиент не увидел бы никогда: она
 * не принадлежит никому лично (client_id пуст), поэтому не выгружается вовсе,
 * и до клиента доезжало назначение без программы — ни плана, ни отметок в
 * календаре, при том что тренер уверен, что всё назначил. Такую копируем под
 * клиента: копия принадлежит ему, уезжает обычным обменом и заодно не меняется
 * под ним, когда тренер правит исходный шаблон.
 */
async function programForClient(
  programId: string,
  clientId: string,
  trainerId: string,
): Promise<{ programId: string; routineMap: Map<string, string> }> {
  const keep = { programId, routineMap: new Map<string, string>() }

  const program = await db.programs.get(programId)
  if (!program) return keep
  // Свой план поверх каталога копировать незачем — программа уже на устройстве.
  if (clientId === trainerId) return keep
  if (program.client_id === clientId) return keep

  /*
   * Программу каталога копируем наравне с остальными.
   *
   * Раньше её не копировали: каталог одинаков у всех, а назначение ссылалось
   * на выведенный идентификатор («prog-5»), и лишние строки казались тратой.
   * На деле каталог одинаков только у одинаковых сборок: у клиента с версией
   * постарше нужной программы нет вовсе, ссылка ведёт в пустоту, и человек
   * видит пустой календарь, пока тренер видит «назначено». Проверить это со
   * стороны тренера невозможно — на его устройстве всё сходится.
   *
   * Копия стоит десятка строк на назначение и снимает зависимость от того,
   * какая версия приложения стоит у клиента.
   */

  // Тот же шаблон тому же клиенту переназначают не раз — при паузе, смене
  // расписания, продлении. Копию на это заводим одну: иначе в кабинете
  // копится вереница одинаковых программ, которые ничем не отличить.
  const made = await db.programs
    .where('client_id')
    .equals(clientId)
    .and((p) => p.source_id === programId && p.author_id === trainerId)
    .first()

  if (made) {
    const [origin, copies] = await Promise.all([
      db.routines.where('program_id').equals(programId).sortBy('day_order'),
      db.routines.where('program_id').equals(made.id).sortBy('day_order'),
    ])
    const byDay = new Map(copies.map((r) => [r.day_order, r.id]))
    const routineMap = new Map<string, string>()
    for (const routine of origin) {
      const copy = byDay.get(routine.day_order)
      if (copy) routineMap.set(routine.id, copy)
    }
    return { programId: made.id, routineMap }
  }

  const ts = now()
  const copyId = uid()
  await db.programs.add({
    ...program,
    id: copyId,
    client_id: clientId,
    author_id: trainerId,
    source_id: programId,
    updated_at: ts,
  })

  // Расписание ссылается на дни программы, поэтому копии дней надо запомнить:
  // со старыми идентификаторами у клиента не нашлось бы ни одного дня.
  const routineMap = new Map<string, string>()
  const routines = await db.routines.where('program_id').equals(programId).sortBy('day_order')
  for (const routine of routines) {
    const routineId = uid()
    routineMap.set(routine.id, routineId)
    await db.routines.add({ ...routine, id: routineId, program_id: copyId, updated_at: ts })

    const items = await db.templateItems
      .where('routine_id')
      .equals(routine.id)
      .sortBy('sequence_order')
    for (const item of items) {
      await db.templateItems.add({ ...item, id: uid(), routine_id: routineId, updated_at: ts })
    }
  }
  return { programId: copyId, routineMap }
}

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
  const copy = await programForClient(input.programId, input.clientId, trainerId)
  const programId = copy.programId
  const schedule = input.schedule?.length
    ? input.schedule.map((slot) => ({
        ...slot,
        routine_id: copy.routineMap.get(slot.routine_id) ?? slot.routine_id,
      }))
    : undefined

  await db.assignments.add({
    id,
    trainer_id: trainerId,
    client_id: input.clientId,
    program_id: programId,
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

  // Шагаем календарными сутками, а не ровно 24 часами: в день перевода
  // часов сутки короче или длиннее, и счёт в миллисекундах уводит на 23:00
  // предыдущего дня — день недели съезжает, и план рисуется не там.
  for (let d = begin; d <= finish;) {
    const name = nameByWeekday.get((new Date(d).getDay() + 6) % 7)
    if (name) out.set(d, name)
    const next = new Date(d)
    next.setDate(next.getDate() + 1)
    d = next.getTime()
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

  // Владелец дней и упражнений выводится из программы, а она удаляется
  // последней — к моменту выгрузки искать его будет негде.
  const owner = (await db.programs.get(programId))?.client_id

  const routines = await db.routines.where('program_id').equals(programId).toArray()
  for (const r of routines) {
    const items = await db.templateItems.where('routine_id').equals(r.id).toArray()
    await deleteManySynced(
      'templateItems',
      items.map((i) => i.id),
      owner,
    )
  }
  await deleteManySynced(
    'routines',
    routines.map((r) => r.id),
    owner,
  )
  await deleteSynced('programs', programId)
}

export async function cancelAssignment(assignmentId: string) {
  await db.assignments.update(assignmentId, {
    status: 'CANCELLED',
    updated_at: now(),
  })
}

/** Активное назначение клиента — показывается у него на главной. */
/**
 * Назначение, программа которого не доехала до устройства.
 *
 * Раньше такой случай выглядел как отсутствие назначения вовсе:
 * activeAssignmentFor возвращает null, если строки программы нет, и человек
 * видел пустой календарь, пока тренер видел «программа назначена».
 *
 * Причин у пропажи две. Программу каталога тренер не копирует — она
 * одинакова у всех и ссылается по выведенному идентификатору («prog-5»);
 * если на устройстве стоит сборка постарше, где этой программы ещё нет,
 * ссылка ведёт в пустоту. Личную программу тренер копирует, и её строки
 * едут обменом — они могут просто не успеть.
 *
 * Первое лечится досылкой каталога прямо здесь, второе — временем; и в том,
 * и в другом случае человеку надо сказать, что происходит, а не показывать
 * пустоту.
 */
export async function pendingAssignmentFor(clientId = currentUserId()) {
  const assignment = await db.assignments
    .where('client_id')
    .equals(clientId)
    .and((a) => a.status === 'ACTIVE')
    .first()
  if (!assignment) return null
  if (await db.programs.get(assignment.program_id)) return null

  await syncCatalogPrograms().catch(() => undefined)
  return (await db.programs.get(assignment.program_id)) ? null : assignment
}

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

/**
 * Очередь тренировок плана: что делать следующим и что идёт за этим.
 *
 * Показывать одну «следующую» кнопку оказалось мало. План — это не
 * конвейер: заболело плечо, зал занят, уехал в командировку, — и человек
 * хочет взять другой день, а не выбирать между «строго по плану» и пустой
 * тренировкой. Поэтому отдаём весь список, но начинаем с той, что по
 * плану, — порядок и есть подсказка.
 *
 * Порядок исполнения задаёт расписание, а не нумерация дней в программе:
 * тренер вправе поставить второй день на понедельник, и тогда именно он
 * идёт первым. Дни программы, которых в расписании нет, добавляем следом —
 * они не выпадают из списка, просто не привязаны к дню недели.
 */
export async function planQueue(date: number, clientId = currentUserId()) {
  const plan = await activeAssignmentFor(clientId)
  if (!plan || !plan.routines.length) return null

  const byId = new Map(plan.routines.map((r) => [r.id, r]))
  const schedule = [...(plan.assignment.schedule ?? [])].sort((a, b) => a.weekday - b.weekday)

  const ordered: WorkoutRoutine[] = []
  const seen = new Set<string>()
  for (const slot of schedule) {
    const r = byId.get(slot.routine_id)
    if (r && !seen.has(r.id)) {
      seen.add(r.id)
      ordered.push(r)
    }
  }
  for (const r of plan.routines) {
    if (!seen.has(r.id)) {
      seen.add(r.id)
      ordered.push(r)
    }
  }

  const nextId = await nextRoutineId(date, clientId, ordered, schedule)
  const at = ordered.findIndex((r) => r.id === nextId)
  // Разворачиваем список от следующей тренировки, а не просто помечаем её:
  // «дальше по порядку» должно читаться сверху вниз, иначе продолжение
  // плана оказывается выше его начала.
  const queue = at > 0 ? [...ordered.slice(at), ...ordered.slice(0, at)] : ordered

  return { plan, queue, nextId: queue[0]?.id }
}

/**
 * Какую тренировку человек должен сделать следующей.
 *
 * Сначала спрашиваем расписание: выбранный день, а если он пустой — ближайший
 * плановый в пределах недели. Без расписания идём от сделанного: следующая
 * после последней завершённой. Оба пути могут не дать ответа — тогда начало
 * плана, с него и начинают.
 */
async function nextRoutineId(
  date: number,
  clientId: string,
  ordered: WorkoutRoutine[],
  schedule: ScheduleSlot[],
): Promise<string | undefined> {
  if (schedule.length) {
    for (let i = 0; i < 7; i++) {
      const planned = await plannedForDate(date + i * 86400_000, clientId)
      if (planned) return planned.routine.id
    }
  }

  const last = await db.sessions
    .where('user_id')
    .equals(clientId)
    .and((s) => s.is_completed === 1 && !!s.routine_id)
    .sortBy('start_time')
  const lastId = last[last.length - 1]?.routine_id
  const at = lastId ? ordered.findIndex((r) => r.id === lastId) : -1
  if (at >= 0) return ordered[(at + 1) % ordered.length].id

  return ordered[0]?.id
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

/**
 * Порога у прикрепления нет намеренно.
 *
 * Раньше здесь стоял отказ на файле тяжелее 60 МБ, и это была единственная
 * причина, по которой снятый ролик пропадал совсем: человек уже потратил
 * подход и съёмку, а приложение отвечало «снимите покороче» — переснять
 * тренировку нельзя. Ролик любого веса и любой длины ложится в IndexedDB и
 * сразу виден на устройстве; дойдёт ли он до сервера — отдельный вопрос, на
 * который отвечает выгрузка (см. pushAttachments в src/db/sync.ts) и о котором
 * человеку говорят прямо у ролика, а не отказом заранее.
 */

/*
 * Съёмка фото тела живёт в src/db/photos.ts (addSeriesPhoto), а не здесь.
 *
 * Прежняя addTaskPhoto умела класть кадр только внутрь задания, и в этом
 * была вся беда: серия «спустя месяц» упиралась в то, что задание уже
 * сдано, а нового под неё никто не выдавал. Теперь снимок принадлежит дню
 * съёмки, а задание — необязательная пометка «пришло вот отсюда».
 */

/** Фото, приложенные к заданию. Нужны разбору отчёта: он ведётся по заданию. */
export async function taskPhotos(taskId: string, userId = currentUserId()) {
  return db.attachments
    .where('user_id')
    .equals(userId)
    .and((a) => a.task_id === taskId)
    .toArray()
}

/**
 * Фото, которым тренер поясняет разбор упражнения.
 *
 * Владельцем записываем клиента, а не тренера: сервер отдаёт человеку его
 * собственные строки, и снимок, оставшийся за тренером, до клиента бы не
 * доехал — как и подпись под ним. То же правило, что у ответа на отчёт.
 */
export async function addTrainerPhoto(input: {
  clientId: string
  sessionId: string
  exerciseId: string
  file: File
}) {
  return addAttachment({
    sessionId: input.sessionId,
    exerciseId: input.exerciseId,
    file: input.file,
    userId: input.clientId,
  })
}

export async function addAttachment(input: {
  sessionId: string
  exerciseId: string
  file: File
  userId?: string
  /** Доля сжатия, 0..1 — чтобы экран мог показать, что телефон занят делом. */
  onShrink?: (fraction: number) => void
}) {
  /*
   * Просим постоянное хранилище до записи, а не после.
   *
   * Тяжёлый ролик занимает заметную долю квоты, а браузер вправе вычистить
   * непостоянное хранилище целиком, когда на устройстве кончается место, —
   * вместе с ним ушла бы вся местная база, а не только видео. Разрешения
   * может и не быть (Safari даёт его лишь установленному приложению), отказ
   * здесь ничего не меняет: файл всё равно сохраняем.
   */
  try {
    await navigator.storage?.persist?.()
  } catch {
    /* хранилище может быть недоступно — прикреплению это не мешает */
  }

  /*
   * Пережимаем до записи, а не перед отправкой, и оригинал не храним.
   *
   * Так экономится не только мобильный трафик, но и место на устройстве:
   * держать рядом исходные 92 МБ и пережатые 8 МБ значит занимать квоту
   * IndexedDB тем, что уже никому не нужно — тренер смотрит пережатое, а
   * снятый файл и так остался в галерее телефона. Сорваться сжатие может
   * (старый браузер, отказ кодека) — тогда вернётся исходный файл, и
   * прикрепление всё равно состоится.
   */
  const file = await shrinkVideo(input.file, input.onShrink)

  const kind: Attachment['kind'] = file.type.startsWith('image/') ? 'photo' : 'video'
  const attachment: Attachment = {
    id: uid(),
    user_id: input.userId ?? currentUserId(),
    session_id: input.sessionId,
    exercise_id: input.exerciseId,
    kind,
    blob: file,
    mime: file.type || (kind === 'photo' ? 'image/jpeg' : 'video/mp4'),
    size: file.size,
    created_at: now(),
    updated_at: now(),
  }
  /*
   * Место на устройстве проверяем попыткой записи, а не оценкой квоты заранее.
   *
   * navigator.storage.estimate() возвращает округлённое и заниженное число
   * (Safari врёт намеренно), и отказ по нему прогонял бы ролики, которые
   * прекрасно помещаются. Пусть решает сама база: не влезло — говорим, что
   * кончилось место, а не «файл слишком большой».
   */
  try {
    await db.attachments.add(attachment)
  } catch (e) {
    if (e instanceof Error && e.name.includes('Quota')) {
      throw new Error(
        t('На устройстве кончилось место — удалите старые ролики и попробуйте снова'),
      )
    }
    throw e
  }
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

// Само удаление переехало в files.ts: им пользуются и задания, а обратный
// импорт из reports.ts замкнул бы модули друг на друга. Здесь оставлен
// повторный вывоз, чтобы не переписывать полдесятка мест, которые его зовут.
export { deleteAttachment } from './files'

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
  await deleteSynced('trainerNotes', noteId)
}
