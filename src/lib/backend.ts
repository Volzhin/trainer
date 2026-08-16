/**
 * Клиент PocketBase.
 *
 * Своя обёртка вместо официального SDK: приложению нужны вход, записи и
 * файлы — примерно полтора десятка запросов. Свой код весит меньше и не
 * тянет в бандл realtime-подписки, которые здесь не используются.
 *
 * Токен живёт в localStorage: он должен переживать перезапуск приложения,
 * иначе на телефоне пришлось бы входить после каждого закрытия вкладки.
 */

import { t } from './i18n'

const TOKEN_KEY = 'trainer.auth'

/** Адрес API. В проде фронт и бэкенд на одном домене, поэтому путь пустой. */
export const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

/**
 * Настроена ли отправка почты.
 *
 * Сервер отвечает на запрос сброса пароля успехом независимо от того, ушло
 * письмо или нет, — то есть приложение не может это выяснить само. Пока
 * ящик не подключён, честнее сказать правду, чем показать «письмо
 * отправлено» и оставить человека ждать.
 */
export const MAIL_ENABLED = import.meta.env.VITE_MAIL_ENABLED === '1'

export type AuthUser = {
  id: string
  email: string
  name?: string
  role?: 'client' | 'trainer'
  trainer?: string
  verified?: boolean
}

type Stored = { token: string; user: AuthUser }

let session: Stored | null = read()

function read(): Stored | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    return raw ? (JSON.parse(raw) as Stored) : null
  } catch {
    return null
  }
}

/**
 * Запись сессии на диск. Хранилище может отказать — в приватном окне
 * Safari или при исчерпанной квоте. Это не повод считать человека
 * незалогиненным: сессия остаётся в памяти и работает до закрытия вкладки.
 */
function write(next: Stored | null) {
  session = next
  // Токен на файлы выписан прежнему входу — с новым он недействителен.
  fileTokenValue = ''
  try {
    if (next) localStorage.setItem(TOKEN_KEY, JSON.stringify(next))
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* останемся с сессией в памяти */
  }
  listeners.forEach((l) => l(next?.user ?? null))
}

const listeners = new Set<(u: AuthUser | null) => void>()

export function onAuthChange(fn: (u: AuthUser | null) => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export const authUser = (): AuthUser | null => session?.user ?? null
export const isAuthed = (): boolean => !!session?.token

/** Ошибка с текстом, который не стыдно показать человеку. */
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Почему сессия оборвалась. Показывается на экране входа. */
let dropReason = ''
export const sessionDropReason = () => dropReason

async function request<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const headers = new Headers(init.headers)
  if (session?.token) headers.set('Authorization', session.token)
  if (init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null

  if (!res.ok) {
    /**
     * Один отказ — ещё не повод выкидывать человека из аккаунта.
     *
     * Раньше любой 401 из любого фонового запроса стирал сессию, и человек
     * оказывался на экране входа без объяснений. Сначала пробуем продлить
     * токен и повторить запрос; сессию рвём, только если и продление
     * отказало — тогда токен действительно мёртв.
     */
    if (res.status === 401 && !retried && path !== REFRESH_PATH && session) {
      const state = await renew()
      if (state === 'ok') return request<T>(path, init, true)
      // Связи нет — это не протухший токен. Оставляем сессию: человек
      // вернётся в метро в сеть и продолжит работать, а не обнаружит себя
      // разлогиненным.
      if (state === 'expired') {
        dropReason = t('Вход устарел — войдите ещё раз')
        write(null)
      }
    }
    throw new ApiError(res.status, humanError(data, res.status))
  }
  return data as T
}

const REFRESH_PATH = '/api/collections/users/auth-refresh'

/**
 * Продление токена. Различает «токен мёртв» и «сети нет» — от этого зависит,
 * выкидывать человека из аккаунта или подождать.
 */
async function renew(): Promise<'ok' | 'expired' | 'offline'> {
  if (!session) return 'expired'
  try {
    const res = await fetch(`${API_BASE}${REFRESH_PATH}`, {
      method: 'POST',
      headers: { Authorization: session.token, 'Content-Type': 'application/json' },
    })
    if (res.status === 401 || res.status === 403) return 'expired'
    if (!res.ok) return 'offline'
    const data = (await res.json()) as { token: string; record: AuthUser }
    write({ token: data.token, user: data.record })
    return 'ok'
  } catch {
    return 'offline'
  }
}

/** PocketBase кладёт разбор по полям — собираем из него внятную фразу. */
function humanError(data: unknown, status: number): string {
  const d = data as {
    message?: string
    data?: Record<string, { message?: string }>
  } | null
  const fields = d?.data ? Object.entries(d.data) : []
  if (fields.length) {
    const [field, err] = fields[0]
    const label = t(FIELD_NAMES[field] ?? field)
    return `${label}: ${translate(err?.message ?? '')}`
  }
  // 400 на входе значит одно — не сошлись почта и пароль. Но 429 приходит с
  // тем же пустым data, и общая ветка ниже разберёт его сама: наше
  // сообщение уже по-русски, встроенное подменяется в PHRASES.
  if (status === 400) return t('Неверная почта или пароль')
  return translate(d?.message ?? t('Не удалось связаться с сервером'))
}

const FIELD_NAMES: Record<string, string> = {
  email: 'Почта',
  password: 'Пароль',
  passwordConfirm: 'Подтверждение пароля',
  name: 'Имя',
}

const PHRASES: [RegExp, string][] = [
  [/already in use|not unique/i, 'уже занята'],
  [/must be at least (\d+) character/i, 'минимум $1 символов'],
  [/valid email/i, 'нужен настоящий адрес'],
  [/cannot be blank|required/i, 'заполните поле'],
  [/values don.t match/i, 'пароли не совпадают'],
  [/failed to authenticate/i, 'Неверная почта или пароль'],
  [/Failed to fetch|NetworkError/i, 'Нет связи с сервером'],
  // Ответ встроенного ограничителя частоты. Он приходит по-английски, а
  // словарь интерфейса переводит только в обратную сторону — поэтому
  // подменяем текст здесь, на границе с сервером.
  [/too many requests/i, 'Слишком часто. Попробуйте через минуту.'],
]

function translate(msg: string): string {
  // Шаблон переводим до подстановки: в нём стоит $1 из регулярного
  // выражения, и после замены ключа в словаре уже не будет.
  for (const [re, ru] of PHRASES) if (re.test(msg)) return msg.replace(re, t(ru))
  return msg
}

// --- Аккаунт ---

export async function register(input: {
  email: string
  password: string
  name: string
  role: 'client' | 'trainer'
}): Promise<AuthUser> {
  await request('/api/collections/users/records', {
    method: 'POST',
    body: JSON.stringify({
      email: input.email.trim().toLowerCase(),
      password: input.password,
      passwordConfirm: input.password,
      name: input.name.trim(),
      role: input.role,
      // emailVisibility здесь стоял и отдавал почту наружу. Владельцу своя
      // почта видна и без него — PocketBase не прячет её от хозяина записи, —
      // а чужую приложение не показывает нигде: в интерфейсе есть ровно одно
      // место с почтой, и это своя карточка в настройках. Флаг открывал её
      // связанной стороне просто так, за компанию.
    }),
  })
  return login(input.email, input.password)
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const res = await request<{ token: string; record: AuthUser }>(
    '/api/collections/users/auth-with-password',
    {
      method: 'POST',
      body: JSON.stringify({ identity: email.trim().toLowerCase(), password }),
    },
  )
  write({ token: res.token, user: res.record })
  return res.record
}

export function logout() {
  write(null)
}

/** Продлевает токен и подтягивает свежий профиль с сервера. */
export async function refresh(): Promise<AuthUser | null> {
  if (!session) return null
  try {
    const res = await request<{ token: string; record: AuthUser }>(
      '/api/collections/users/auth-refresh',
      { method: 'POST' },
    )
    write({ token: res.token, user: res.record })
    return res.record
  } catch {
    return authUser()
  }
}

export async function requestPasswordReset(email: string): Promise<void> {
  await request('/api/collections/users/request-password-reset', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  })
}

export async function updateAccount(patch: Partial<AuthUser> & Record<string, unknown>) {
  const id = session?.user.id
  if (!id) throw new ApiError(401, 'Нужно войти')
  const rec = await request<AuthUser>(`/api/collections/users/records/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  if (session) write({ token: session.token, user: rec })
  return rec
}

/**
 * Полное удаление аккаунта. Записи и файлы уходят каскадом: связь owner
 * объявлена с cascadeDelete, поэтому на сервере не остаётся ни строк, ни
 * вложений — это требование к обработке персональных данных, а не удобство.
 */
export async function deleteAccount(): Promise<void> {
  const id = session?.user.id
  if (!id) return
  await request(`/api/collections/users/records/${id}`, { method: 'DELETE' })
  write(null)
}

// --- Записи ---

export type RemoteRecord = {
  id: string
  owner: string
  tbl: string
  rid: string
  /** Часы автора: по ним решается, чья версия новее. */
  updated: number
  /**
   * Часы сервера: по ним строится очередь доставки. Пусто у записей,
   * лежавших до появления поля, — деплой проставляет им seq отдельным
   * проходом, см. backfillSeq в server/schema.mjs.
   */
  seq?: number
  deleted?: boolean
  payload: unknown
}

type Page<T> = {
  page: number
  perPage: number
  totalItems: number
  items: T[]
}

/**
 * Значение внутри filter-выражения. Кавычка в адресе почты рвёт условие
 * пополам, и вместо поиска одного человека получается запрос с чужим смыслом.
 */
const quote = (v: string) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

/** Страница изменений начиная с метки. Тренеру приезжают и записи клиентов. */
/**
 * Забирает всё, что появилось на сервере после отметки.
 *
 * Отметка идёт по seq — часам сервера. По updated её строить нельзя: там
 * часы того, кто записал, и достаточно минуты расхождения между
 * устройствами, чтобы чужие записи навсегда провалились мимо условия.
 */
export async function pullRecords(since: number, page = 1, perPage = 200) {
  const filter = encodeURIComponent(`seq > ${since}`)
  return request<Page<RemoteRecord>>(
    `/api/collections/records/records?filter=${filter}&sort=seq,id&page=${page}&perPage=${perPage}`,
  )
}

/**
 * Отправка пачки изменений. PocketBase умеет батч-запрос — одна поездка
 * вместо сотни, что заметно на мобильной сети.
 */
async function findRecord(row: Omit<RemoteRecord, 'id'>): Promise<RemoteRecord | undefined> {
  const filter = encodeURIComponent(
    `owner=${quote(row.owner)} && tbl=${quote(row.tbl)} && rid=${quote(row.rid)}`,
  )
  const found = await request<Page<RemoteRecord>>(
    `/api/collections/records/records?filter=${filter}&perPage=1`,
  )
  return found.items[0]
}

export async function upsertRecord(row: Omit<RemoteRecord, 'id'>): Promise<void> {
  const existing = await findRecord(row)
  if (existing) {
    if (existing.updated >= row.updated) return
    await request(`/api/collections/records/records/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify(row),
    })
    return
  }

  try {
    await request('/api/collections/records/records', {
      method: 'POST',
      body: JSON.stringify(row),
    })
  } catch (e) {
    // Между поиском и созданием строку мог завести второй телефон того же
    // человека — уникальный индекс (owner, tbl, rid) такую запись отклоняет.
    // Это не ошибка обмена: перечитываем победителя и дописываем в него.
    if (!(e instanceof ApiError) || e.status !== 400) throw e
    const rival = await findRecord(row)
    // Соперника нет — значит сервер отказал по существу (не прошла проверка,
    // payload больше допустимого). Молчать здесь нельзя: выгрузка сочла бы
    // строку отправленной, сдвинула курсор и потеряла её навсегда.
    if (!rival) throw e
    if (rival.updated >= row.updated) return
    await request(`/api/collections/records/records/${rival.id}`, {
      method: 'PATCH',
      body: JSON.stringify(row),
    })
  }
}

// --- Люди ---

export async function findUser(email: string): Promise<AuthUser | null> {
  const filter = encodeURIComponent(`email=${quote(email.trim().toLowerCase())}`)
  const res = await request<Page<AuthUser>>(
    `/api/collections/users/records?filter=${filter}&perPage=1`,
  )
  return res.items[0] ?? null
}

export async function listClients(trainerId: string): Promise<AuthUser[]> {
  const filter = encodeURIComponent(`trainer=${quote(trainerId)}`)
  const res = await request<Page<AuthUser>>(
    `/api/collections/users/records?filter=${filter}&perPage=200`,
  )
  return res.items
}

export async function getUser(id: string): Promise<AuthUser | null> {
  try {
    return await request<AuthUser>(`/api/collections/users/records/${id}`)
  } catch {
    return null
  }
}

// --- Приглашения ---

export async function createInvite(code: string, trainerId: string, expires: number) {
  return request('/api/collections/invites/records', {
    method: 'POST',
    // Срок обязателен: без него сервер считает код вечным, а приложение
    // показывает тренеру семь дней — и «протухшие» коды гасятся годами.
    body: JSON.stringify({ code, trainer: trainerId, status: 'PENDING', expires }),
  })
}

/**
 * Отзывает код на сервере.
 *
 * Удалить его у себя недостаточно: гасит код сервер, и запись со статусом
 * PENDING продолжает работать после того, как тренер счёл её отозванной.
 */
export async function revokeInvite(code: string): Promise<void> {
  const filter = encodeURIComponent(`code=${quote(code)}`)
  const found = await request<Page<{ id: string }>>(
    `/api/collections/invites/records?filter=${filter}&perPage=1`,
  )
  const row = found.items[0]
  if (!row) return
  await request(`/api/collections/invites/records/${row.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'REVOKED' }),
  })
}

export type RedeemedTrainer = {
  id: string
  name?: string
  contacts?: unknown
  preferred_contact?: string
}

/**
 * Гасит код приглашения. Поиск по коду делает сервер: список приглашений
 * закрыт, иначе чужие коды мог бы выгрузить любой вошедший.
 */
/** Документ тренера, который клиент подписывает при подключении. */
export type TrainerDoc = { kind: string; id: string; file: string }

/**
 * Посмотреть, к кому ведёт код и что придётся подписать, не гася его.
 *
 * Права на чужие записи появляются только после привязки, поэтому
 * документы тренера отдаёт сервер вместе с карточкой. Гасить код на этом
 * шаге нельзя: передумавший остался бы без кода и без тренера.
 */
export async function peekInvite(
  code: string,
): Promise<{ trainer: RedeemedTrainer; documents: TrainerDoc[] }> {
  return request('/api/redeem', {
    method: 'POST',
    body: JSON.stringify({ code, peek: true }),
  })
}

/**
 * Разорвать связь на сервере.
 *
 * Зовут обе стороны: клиент — за себя, тренер — за своего клиента. Кто
 * кому кем приходится, проверяет сервер: поле лежит в записи клиента, и
 * открывать её на запись всем подряд ради этого нельзя.
 */
export async function unlinkClient(clientId?: string): Promise<void> {
  await request('/api/unlink', {
    method: 'POST',
    body: JSON.stringify({ client: clientId ?? '' }),
  })
  // Отвязал себя — своя же сессия устарела.
  if (!clientId) await refresh()
}

export async function redeemInvite(code: string): Promise<RedeemedTrainer> {
  const res = await request<{ trainer: RedeemedTrainer }>('/api/redeem', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
  // Привязка изменила собственный аккаунт — обновляем сохранённую сессию.
  await refresh()
  return res.trainer
}

// --- Живые обновления ---

/**
 * Подписка на изменения через SSE.
 *
 * Опрос раз в минуту означает, что тренер узнаёт о завершённой тренировке с
 * заметной задержкой — для совместной работы это много. PocketBase шлёт
 * события сам; поток открывается без заголовков, а права привязываются к
 * его идентификатору отдельным запросом, который заголовок уже несёт.
 */
export type RealtimeEvent = {
  collection: string
  action: 'create' | 'update' | 'delete'
  record: Record<string, unknown>
}

let source: EventSource | null = null
let resubscribeTimer: ReturnType<typeof setTimeout> | null = null

export function openRealtime(
  collections: string[],
  onEvent: (e: RealtimeEvent) => void,
): () => void {
  closeRealtime()
  if (!session?.token) return () => {}

  const es = new EventSource(`${API_BASE}/api/realtime`)
  source = es

  es.addEventListener('PB_CONNECT', (ev) => {
    const clientId = (JSON.parse((ev as MessageEvent).data) as { clientId: string }).clientId
    void fetch(`${API_BASE}/api/realtime`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.token ? { Authorization: session.token } : {}),
      },
      body: JSON.stringify({ clientId, subscriptions: collections }),
    })
  })

  for (const name of collections) {
    es.addEventListener(name, (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as {
          action: RealtimeEvent['action']
          record: Record<string, unknown>
        }
        onEvent({ collection: name, action: data.action, record: data.record })
      } catch {
        /* битое событие не должно ронять поток */
      }
    })
  }

  // Соединение рвётся при засыпании телефона и смене сети — поднимаем заново,
  // иначе приложение тихо перестанет получать обновления.
  es.onerror = () => {
    if (resubscribeTimer) return
    resubscribeTimer = setTimeout(() => {
      resubscribeTimer = null
      if (source === es) openRealtime(collections, onEvent)
    }, 5000)
  }

  return closeRealtime
}

export function closeRealtime() {
  if (resubscribeTimer) {
    clearTimeout(resubscribeTimer)
    resubscribeTimer = null
  }
  source?.close()
  source = null
}

// --- Файлы ---

export async function uploadAttachment(input: {
  owner: string
  rid: string
  kind: string
  note?: string
  file: Blob
  filename: string
}): Promise<{ id: string; file: string }> {
  const form = new FormData()
  form.append('owner', input.owner)
  form.append('rid', input.rid)
  form.append('kind', input.kind)
  if (input.note) form.append('note', input.note)
  form.append('file', input.file, input.filename)
  return request('/api/collections/attachments/records', {
    method: 'POST',
    body: form,
  })
}

export async function deleteRemoteAttachment(recordId: string): Promise<void> {
  await request(`/api/collections/attachments/records/${recordId}`, {
    method: 'DELETE',
  })
}

/**
 * Токен на скачивание защищённых файлов.
 *
 * Поле file объявлено protected, поэтому ссылка на видео больше не работает
 * сама по себе — иначе адрес, утёкший через историю браузера или пересылку,
 * открывал бы чужое видео кому угодно и после разрыва связи с тренером.
 * Сервер выдаёт короткоживущий токен; держим его до истечения, чтобы не
 * ходить за новым на каждый ролик в списке.
 */
let fileTokenValue = ''
let fileTokenAt = 0
/** Сервер держит токен около двух минут — обновляем заметно раньше. */
const FILE_TOKEN_TTL = 60_000

async function fileToken(force = false): Promise<string> {
  if (!isAuthed()) return ''
  if (!force && fileTokenValue && Date.now() - fileTokenAt < FILE_TOKEN_TTL) {
    return fileTokenValue
  }
  const res = await request<{ token: string }>('/api/files/token', { method: 'POST' })
  fileTokenValue = res.token
  fileTokenAt = Date.now()
  return fileTokenValue
}

/**
 * Ссылка на файл вложения. `fresh` заставляет выписать новый токен: у длинного
 * ролика проигрывание переживает срок действия прежнего, и докачка обрывается
 * на середине — плеер в этот момент просит ссылку заново.
 */
export async function attachmentUrl(
  recordId: string,
  file: string,
  fresh = false,
): Promise<string> {
  const url = `${API_BASE}/api/files/attachments/${recordId}/${file}`
  const token = await fileToken(fresh).catch(() => '')
  return token ? `${url}?token=${encodeURIComponent(token)}` : url
}

/**
 * Открывает вложение в новой вкладке.
 *
 * Вкладку заводим сразу по нажатию и только потом подставляем адрес: ссылка
 * требует токена, а за ним нужно сходить на сервер — открытая после ожидания
 * вкладка считалась бы всплывающей и была бы заблокирована.
 */
export function openAttachment(recordId: string, file: string) {
  const tab = window.open('', '_blank', 'noreferrer')
  void attachmentUrl(recordId, file, true).then((url) => {
    if (tab) tab.location.href = url
  })
}
