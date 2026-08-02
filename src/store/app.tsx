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
import { db, currentUserId, type Role } from '../db/db'
import { switchAccount } from '../db/coach'
import { configureNative, haptics, beep, notifyRestOver } from '../lib/native'

type Toast = { id: number; text: string; kind?: 'pr' | 'default' }

type RestState = { total: number; endsAt: number; label?: string } | null

type Ctx = {
  toasts: Toast[]
  toast: (text: string, kind?: 'pr' | 'default') => void
  rest: RestState
  restLeft: number
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
  const [tick, setTick] = useState(0)
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

  // Таймер считает по абсолютной метке времени: интервалы в фоне
  // дросселируются, но оставшееся время остаётся корректным.
  useEffect(() => {
    if (!rest) return
    const i = setInterval(() => setTick((t) => t + 1), 250)
    return () => clearInterval(i)
  }, [rest])

  const restLeft = rest ? Math.max(0, Math.round((rest.endsAt - Date.now()) / 1000)) : 0

  useEffect(() => {
    if (!rest || firedRef.current) return
    if (rest.endsAt - Date.now() > 0) return
    firedRef.current = true
    haptics.warning()
    beep(2)
    notifyRestOver(rest.label)
    setTimeout(() => setRest(null), 1500)
  }, [rest, tick])

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
      return { ...r, endsAt, total: Math.max(r.total, Math.round((endsAt - Date.now()) / 1000)) }
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
      restLeft,
      startRest,
      addRest,
      stopRest,
      online,
      userId,
      switchTo,
    }),
    [toasts, toast, rest, restLeft, startRest, addRest, stopRest, online, userId, switchTo],
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
