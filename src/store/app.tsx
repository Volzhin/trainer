import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, currentUserId, modeOf, type ClientMode, type Role } from '../db/db'
import { switchAccount, trainerOfClient } from '../db/coach'
import { configureNative, haptics, beep, notifyRestOver } from '../lib/native'

type Toast = { id: number; text: string; kind?: 'pr' | 'default' }

type RestState = { total: number; endsAt: number; label?: string } | null

type Ctx = {
  toasts: Toast[]
  toast: (text: string, kind?: 'pr' | 'default') => void
  rest: RestState
  startRest: (seconds: number, label?: string) => void
  addRest: (seconds: number) => void
  stopRest: () => void
  online: boolean
  /** Активный аккаунт. Меняется при переключении между тренером и клиентом. */
  userId: string
  switchTo: (userId: string) => Promise<void>
}

const AppCtx = createContext<Ctx | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [rest, setRest] = useState<RestState>(null)
  const [online, setOnline] = useState(navigator.onLine)
  const [userId, setUserId] = useState(currentUserId())
  const firedRef = useRef(false)

  const profile = useLiveQuery(() => db.profile.get(userId), [userId])

  useEffect(() => {
    if (!profile) return
    configureNative({
      haptics: profile.haptics_enabled === 1,
      sound: profile.sound_enabled === 1,
    })
  }, [profile])

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  const toast = useCallback((text: string, kind: 'pr' | 'default' = 'default') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2200)
  }, [])

  /**
   * Конец отдыха ждём таймером на точный момент, а не опросом четыре раза в
   * секунду. Опрос жил здесь, в провайдере, и каждое его срабатывание меняло
   * значение контекста — то есть перерисовывало все три десятка мест, которые
   * читают useApp, включая экран тренировки со всеми подходами. Обратный
   * отсчёт на цифрах теперь тикает там, где он виден, — в RestTimer.
   */
  useEffect(() => {
    if (!rest) return
    firedRef.current = false

    // Панель отдыха убираем не сразу, а через полторы секунды — чтобы сигнал
    // было видно. Ссылку на этот таймер держим и снимаем вместе с остальными:
    // подходы идут подряд, и следующий отдых, запущенный внутри этих полутора
    // секунд, гасился бы «хвостом» предыдущего сразу после появления.
    let hide: number | undefined

    const fire = () => {
      if (firedRef.current) return
      firedRef.current = true
      haptics.warning()
      beep(2)
      notifyRestOver(rest.label)
      hide = window.setTimeout(() => setRest(null), 1500)
    }

    const exact = window.setTimeout(fire, Math.max(0, rest.endsAt - Date.now()))
    // Страховка на случай свёрнутой вкладки: точные таймеры там придерживают,
    // и без проверки отдых мог бы «зависнуть» дольше положенного. Пока время
    // не вышло, она ничего не меняет и никого не перерисовывает.
    const guard = window.setInterval(() => {
      if (Date.now() >= rest.endsAt) fire()
    }, 1000)

    return () => {
      window.clearTimeout(exact)
      window.clearInterval(guard)
      if (hide !== undefined) window.clearTimeout(hide)
    }
  }, [rest])

  const startRest = useCallback((seconds: number, label?: string) => {
    if (seconds <= 0) return
    firedRef.current = false
    setRest({ total: seconds, endsAt: Date.now() + seconds * 1000, label })
  }, [])

  const addRest = useCallback((seconds: number) => {
    haptics.selection()
    setRest((r) => {
      if (!r) return r
      const endsAt = Math.max(Date.now(), r.endsAt + seconds * 1000)
      firedRef.current = false
      return {
        ...r,
        endsAt,
        total: Math.max(r.total, Math.round((endsAt - Date.now()) / 1000)),
      }
    })
  }, [])

  const stopRest = useCallback(() => {
    firedRef.current = true
    setRest(null)
  }, [])

  const switchTo = useCallback(async (next: string) => {
    await switchAccount(next)
    setRest(null)
    setUserId(next)
  }, [])

  const value = useMemo(
    () => ({
      toasts,
      toast,
      rest,
      startRest,
      addRest,
      stopRest,
      online,
      userId,
      switchTo,
    }),
    [toasts, toast, rest, startRest, addRest, stopRest, online, userId, switchTo],
  )

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

export function useApp() {
  const ctx = useContext(AppCtx)
  if (!ctx) throw new Error('useApp вне AppProvider')
  return ctx
}

export function useProfile() {
  const { userId } = useApp()
  return useLiveQuery(() => db.profile.get(userId), [userId])
}

/** Роль активного аккаунта. Пока профиль не загружен — считаем клиентом. */
export function useRole(): Role {
  return useProfile()?.role ?? 'CLIENT'
}

/**
 * Связка с тренером у активного клиента.
 *
 * undefined — базу ещё не прочитали, null — тренера нет. Разницу нужно
 * различать: от связки зависят разделы «Чат» и «Отчёты», и «пока не знаю»
 * это не то же самое, что «их не будет».
 */
export function useTrainerLink() {
  const { userId } = useApp()
  return useLiveQuery(() => trainerOfClient(userId), [userId])
}

/** Режим работы клиента с тренером. Без тренера режима нет. */
export function useClientMode(): ClientMode | null {
  const bond = useTrainerLink()
  return bond ? modeOf(bond.link) : null
}

/**
 * Обратный отсчёт отдыха. Тикает только у того, кто его показывает: держать
 * его в контексте означало перерисовывать четыре раза в секунду каждый экран,
 * который читает useApp, — а таких мест три десятка.
 */
export function useRestLeft(): number {
  const { rest } = useApp()
  const [left, setLeft] = useState(0)

  useEffect(() => {
    if (!rest) return setLeft(0)
    const read = () => setLeft(Math.max(0, Math.round((rest.endsAt - Date.now()) / 1000)))
    read()
    const i = setInterval(read, 250)
    return () => clearInterval(i)
  }, [rest])

  return left
}
