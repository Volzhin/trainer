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

function write(next: Stored | null) {
  session = next
  if (next) localStorage.setItem(TOKEN_KEY, JSON.stringify(next))
  else localStorage.removeItem(TOKEN_KEY)
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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (session?.token) headers.set('Authorization', session.token)
  if (init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null

  if (!res.ok) {
    // Протухший токен: выкидываем сессию, приложение покажет экран входа.
    if (res.status === 401) write(null)
    throw new ApiError(res.status, humanError(data, res.status))
  }
  return data as T
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
    const label = FIELD_NAMES[field] ?? field
    return `${label}: ${translate(err?.message ?? '')}`
  }
  if (status === 400) return 'Неверная почта или пароль'
  return translate(d?.message ?? 'Не удалось связаться с сервером')
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
]

function translate(msg: string): string {
  for (const [re, ru] of PHRASES) if (re.test(msg)) return msg.replace(re, ru)
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
      emailVisibility: true,
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
  updated: number
  deleted?: boolean
  payload: unknown
}

type Page<T> = {
  page: number
  perPage: number
  totalItems: number
  items: T[]
}

/** Страница изменений начиная с метки. Тренеру приезжают и записи клиентов. */
export async function pullRecords(since: number, page = 1, perPage = 200) {
  const filter = encodeURIComponent(`updated > ${since}`)
  return request<Page<RemoteRecord>>(
    `/api/collections/records/records?filter=${filter}&sort=updated&page=${page}&perPage=${perPage}`,
  )
}

/**
 * Отправка пачки изменений. PocketBase умеет батч-запрос — одна поездка
 * вместо сотни, что заметно на мобильной сети.
 */
export async function pushRecords(rows: Omit<RemoteRecord, 'id'>[]): Promise<void> {
  if (!rows.length) return
  const requests = rows.map((r) => ({
    method: 'PUT',
    url: `/api/collections/records/records?filter=${encodeURIComponent(
      `owner="${r.owner}" && tbl="${r.tbl}" && rid="${r.rid}"`,
    )}`,
    body: r,
  }))
  await request('/api/batch', {
    method: 'POST',
    body: JSON.stringify({ requests }),
  })
}

export async function upsertRecord(row: Omit<RemoteRecord, 'id'>): Promise<void> {
  const filter = encodeURIComponent(
    `owner="${row.owner}" && tbl="${row.tbl}" && rid="${row.rid}"`,
  )
  const found = await request<Page<RemoteRecord>>(
    `/api/collections/records/records?filter=${filter}&perPage=1`,
  )
  const existing = found.items[0]
  if (existing) {
    if (existing.updated >= row.updated) return
    await request(`/api/collections/records/records/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify(row),
    })
    return
  }
  await request('/api/collections/records/records', {
    method: 'POST',
    body: JSON.stringify(row),
  })
}

// --- Люди ---

export async function findUser(email: string): Promise<AuthUser | null> {
  const filter = encodeURIComponent(`email="${email.trim().toLowerCase()}"`)
  const res = await request<Page<AuthUser>>(
    `/api/collections/users/records?filter=${filter}&perPage=1`,
  )
  return res.items[0] ?? null
}

export async function listClients(trainerId: string): Promise<AuthUser[]> {
  const filter = encodeURIComponent(`trainer="${trainerId}"`)
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

export async function createInvite(code: string, trainerId: string) {
  return request('/api/collections/invites/records', {
    method: 'POST',
    body: JSON.stringify({ code, trainer: trainerId, status: 'PENDING' }),
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

export const attachmentUrl = (recordId: string, file: string) =>
  `${API_BASE}/api/files/attachments/${recordId}/${file}`
