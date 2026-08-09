import { useState } from 'react'
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
import { Home } from './pages/Home'
import { Programs } from './pages/Programs'
import { ProgramDetail } from './pages/ProgramDetail'
import { Exercises } from './pages/Exercises'
import { ExerciseDetail } from './pages/ExerciseDetail'
import { LiveSession } from './pages/LiveSession'
import { SessionDetail } from './pages/SessionDetail'
import { History } from './pages/History'
import { Progress } from './pages/Progress'
import { BodyComposition } from './pages/BodyComposition'
// Раздел питания снят с интерфейса — см. TabBar. Импорты и маршруты
// закомментированы вместе с ним, страницы остались в репозитории.
// import { Nutrition } from './pages/Nutrition'
// import { MyFoods } from './pages/MyFoods'
// import { NutritionSettings } from './pages/NutritionSettings'
import { Chat } from './pages/Chat'
import { Reports } from './pages/Reports'
import { Profile } from './pages/Profile'
import { TrainerClients } from './pages/trainer/TrainerClients'
import { TrainerClientDetail } from './pages/trainer/TrainerClientDetail'
import { TrainerProfile } from './pages/trainer/TrainerProfile'
import { useApp, useProfile } from './store/app'
import { getActiveSession } from './db/repo'
import { IconPlay, IconRecord } from './components/Icons'

export default function App() {
  const { toasts, userId } = useApp()
  const profile = useProfile()
  const location = useLocation()
  const inSession = location.pathname.startsWith('/session/')
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
      {/* key по аккаунту: смена профиля перемонтирует дерево, и все
          запросы к базе перечитываются от имени нового пользователя. */}
      <ErrorBoundary key={`${userId}-${location.pathname}`}>
        <Routes>
          {isTrainer ? (
            <>
              <Route path="/trainer" element={<TrainerClients />} />
              <Route path="/trainer/clients/:id" element={<TrainerClientDetail />} />
              <Route path="/trainer/profile" element={<TrainerProfile />} />
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
              {/* <Route path="/nutrition" element={<Nutrition />} /> */}
              {/* <Route path="/nutrition/settings" element={<NutritionSettings />} /> */}
              {/* <Route path="/nutrition/foods" element={<MyFoods />} /> */}
              <Route path="/chat" element={<Chat />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          )}
        </Routes>
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
          <div style={{ fontWeight: 600, fontSize: 14 }} className="truncate">
            {active.title}
          </div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>
            Тренировка идёт — нажмите, чтобы вернуться
          </div>
        </div>
      </div>
    </div>
  )
}
