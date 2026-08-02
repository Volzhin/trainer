import { useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { isOnboarded } from './db/db'
import { Onboarding } from './pages/Onboarding'
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
import { Chat } from './pages/Chat'
import { Profile } from './pages/Profile'
import { TrainerClients } from './pages/trainer/TrainerClients'
import { TrainerClientDetail } from './pages/trainer/TrainerClientDetail'
import { TrainerProfile } from './pages/trainer/TrainerProfile'
import { useApp, useProfile } from './store/app'
import { getActiveSession } from './db/repo'
import { IconPlay } from './components/Icons'

export default function App() {
  const { toasts, userId } = useApp()
  const profile = useProfile()
  const location = useLocation()
  const inSession = location.pathname.startsWith('/session/')
  // Чат занимает экран целиком: таб-бар перекрыл бы поле ввода.
  const inChat = location.pathname.endsWith('/chat')
  const isTrainer = profile?.role === 'TRAINER'

  const onboarded = useLiveQuery(() => isOnboarded(), [])
  const [justOnboarded, setJustOnboarded] = useState(false)

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
      <Routes key={userId}>
        {isTrainer ? (
          <>
            <Route path="/trainer" element={<TrainerClients />} />
            <Route path="/trainer/clients/:id" element={<TrainerClientDetail />} />
            <Route path="/trainer/profile" element={<TrainerProfile />} />
            <Route path="/trainer/clients/:id/chat" element={<Chat />} />
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
            <Route path="/chat" element={<Chat />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
      </Routes>

      {!inSession && !inChat && !isTrainer && <ActiveSessionBanner />}
      {!inChat && <RestTimer />}
      {!inChat && <TabBar />}

      {toasts.map((t, i) => (
        <div
          key={t.id}
          className={`toast${t.kind === 'pr' ? ' pr' : ''}`}
          style={{ bottom: `calc(var(--tabbar-h) + var(--safe-b) + ${84 + i * 46}px)` }}
        >
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
          <div style={{ fontSize: 12, opacity: 0.85 }}>Тренировка идёт — нажмите, чтобы вернуться</div>
        </div>
      </div>
    </div>
  )
}
