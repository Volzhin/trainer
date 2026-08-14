import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { isOnboarded } from './db/db'
import { isDemoMode } from './db/account'
import { isAuthed } from './lib/backend'
import { Onboarding } from './pages/Onboarding'
import { Auth } from './pages/Auth'
import { ErrorBoundary } from './components/ErrorBoundary'
import { TabBar } from './components/TabBar'
import { RestTimer } from './components/RestTimer'
import { SyncTroubleBanner } from './components/SyncTroubleBanner'
import { Home } from './pages/Home'
import { Programs } from './pages/Programs'
import { ProgramDetail } from './pages/ProgramDetail'
import { Exercises } from './pages/Exercises'
import { ExerciseDetail } from './pages/ExerciseDetail'
import { LiveSession } from './pages/LiveSession'
import { SessionDetail } from './pages/SessionDetail'
import { History } from './pages/History'
import { Chat } from './pages/Chat'
import { Profile } from './pages/Profile'
import { Settings } from './pages/Settings'
import { useApp, useProfile } from './store/app'
import { getActiveSession } from './db/repo'
import { IconPlay, IconRecord } from './components/Icons'
import { t } from './lib/i18n'

/*
 * Тяжёлые экраны грузятся по требованию.
 *
 * Кабинет тренера, состав тела и питание тянут за собой разбор PDF, графики
 * и таблицы продуктов — вместе это больше половины сборки. Клиенту, который
 * открыл приложение, чтобы отметить подход, всё это скачивать незачем: на
 * слабой сети в подвальном зале лишние сотни килобайт превращаются в
 * секунды ожидания первого экрана.
 */
const BodyComposition = lazy(() =>
  import('./pages/BodyComposition').then((m) => ({ default: m.BodyComposition })),
)
const Nutrition = lazy(() => import('./pages/Nutrition').then((m) => ({ default: m.Nutrition })))
const MyFoods = lazy(() => import('./pages/MyFoods').then((m) => ({ default: m.MyFoods })))
const NutritionSettings = lazy(() =>
  import('./pages/NutritionSettings').then((m) => ({ default: m.NutritionSettings })),
)
const Reports = lazy(() => import('./pages/Reports').then((m) => ({ default: m.Reports })))
const Progress = lazy(() => import('./pages/Progress').then((m) => ({ default: m.Progress })))
const TrainerClients = lazy(() =>
  import('./pages/trainer/TrainerClients').then((m) => ({ default: m.TrainerClients })),
)
const TrainerClientDetail = lazy(() =>
  import('./pages/trainer/TrainerClientDetail').then((m) => ({ default: m.TrainerClientDetail })),
)
const TrainerProfile = lazy(() =>
  import('./pages/trainer/TrainerProfile').then((m) => ({ default: m.TrainerProfile })),
)

export default function App() {
  const { toasts, userId } = useApp()
  const profile = useProfile()
  const location = useLocation()
  const inSession = location.pathname.startsWith('/session/')

  /*
   * Новый экран открывается сверху.
   *
   * Браузер держит положение прокрутки для страницы целиком, а здесь адрес
   * меняется без перезагрузки: уйдя из середины длинного «Прогресса», человек
   * попадал в середину «Истории» — и видел её не с начала, а с середины.
   */
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])
  const isTrainer = profile?.role === 'TRAINER'

  const onboarded = useLiveQuery(() => isOnboarded(), [])
  const [justOnboarded, setJustOnboarded] = useState(false)
  // Вход — первое, что видит новый человек. Демо-режим позволяет пропустить
  // его и посмотреть приложение, не оставляя о себе данных.
  const [entered, setEntered] = useState(() => isAuthed() || isDemoMode())

  if (!entered) return <Auth onReady={() => setEntered(true)} />

  // Профиль ещё не поднялся из базы — не рендерим экраны, иначе клиентские
  // и тренерские данные мигают друг через друга при переключении аккаунта.
  if (!profile || onboarded === undefined) return <div className="app" />

  if (!onboarded && !justOnboarded) {
    return <Onboarding onDone={() => setJustOnboarded(true)} />
  }

  return (
    <div className="app">
      {/* Выше всех экранов и в общем потоке: беда обмена касается любого из
          них, а перекрывать заголовок ради предупреждения незачем. */}
      <SyncTroubleBanner />
      {/* key по аккаунту: смена профиля перемонтирует дерево, и все
          запросы к базе перечитываются от имени нового пользователя. */}
      <ErrorBoundary key={`${userId}-${location.pathname}`}>
        {/* Пока подгружается кусок, держим пустой холст того же цвета:
            мигание белым на тёмной теме заметнее самой задержки. */}
        <Suspense fallback={<div className="screen" />}>
        <Routes>
          {isTrainer ? (
            <>
              <Route path="/trainer" element={<TrainerClients />} />
              <Route path="/trainer/clients/:id" element={<TrainerClientDetail />} />
              <Route path="/trainer/profile" element={<TrainerProfile />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/programs" element={<Programs />} />
              <Route path="/programs/:id" element={<ProgramDetail />} />
              <Route path="/exercises" element={<Exercises />} />
              <Route path="/exercises/:id" element={<ExerciseDetail />} />
              <Route path="*" element={<Navigate to="/trainer" replace />} />
            </>
          ) : (
            <>
              <Route path="/" element={<Home />} />
              <Route path="/programs" element={<Programs />} />
              <Route path="/programs/:id" element={<ProgramDetail />} />
              <Route path="/exercises" element={<Exercises />} />
              <Route path="/exercises/:id" element={<ExerciseDetail />} />
              <Route path="/session/:id" element={<LiveSession />} />
              <Route path="/history" element={<History />} />
              <Route path="/history/:id" element={<SessionDetail />} />
              <Route path="/progress" element={<Progress />} />
              <Route path="/body" element={<BodyComposition />} />
              <Route path="/nutrition" element={<Nutrition />} />
              <Route path="/nutrition/settings" element={<NutritionSettings />} />
              <Route path="/nutrition/foods" element={<MyFoods />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          )}
        </Routes>
        </Suspense>
      </ErrorBoundary>

      {!inSession && !isTrainer && <ActiveSessionBanner />}
      <RestTimer />
      <TabBar />

      {toasts.map((t, i) => (
        <div
          key={t.id}
          className={`toast${t.kind === 'pr' ? ' pr' : ''}`}
          style={{ bottom: `calc(var(--tabbar-h) + var(--safe-b) + ${84 + i * 46}px)` }}
        >
          {t.kind === 'pr' && <IconRecord size={16} />}
          {t.text}
        </div>
      ))}
    </div>
  )
}

/** Плашка «идёт тренировка» — как в нативных плеерах. */
function ActiveSessionBanner() {
  const nav = useNavigate()
  const active = useLiveQuery(() => getActiveSession(), [])
  const { rest } = useApp()
  if (!active || rest) return null

  return (
    <div className="session-banner">
      <div className="inner" onClick={() => nav(`/session/${active.id}`)}>
        <IconPlay size={16} />
        <div className="grow">
          <div className="truncate strong" style={{ fontSize: 14 }}>
            {t(active.title)}
          </div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>
            {t('Тренировка идёт — нажмите, чтобы вернуться')}
          </div>
        </div>
      </div>
    </div>
  )
}
