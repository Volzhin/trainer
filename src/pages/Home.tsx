import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, currentUserId } from '../db/db'
import { getActiveSession, listMySessions } from '../db/repo'
import { activeAssignmentFor } from '../db/coach'
import { plural, startOfDay } from '../lib/calc'
import { WorkoutCalendar } from '../components/WorkoutCalendar'
import { IconPlay } from '../components/Icons'
import { useApp } from '../store/app'

/**
 * Главный экран — это календарь тренировок и ничего больше.
 * Начать тренировку можно только отсюда, из конкретного дня: пока точек
 * запуска было несколько, экран читался как набор способов сделать одно
 * и то же. Аналитика, состав тела и история переехали в свои разделы.
 */
export function Home() {
  const nav = useNavigate()
  const { online } = useApp()

  const profile = useLiveQuery(() => db.profile.get(currentUserId()), [])
  const sessions = useLiveQuery(() => listMySessions(), [])
  const active = useLiveQuery(() => getActiveSession(), [])
  const assigned = useLiveQuery(() => activeAssignmentFor(currentUserId()), [sessions?.length])

  const weekAgo = startOfDay(Date.now()) - 6 * 86400_000
  const thisWeek = (sessions ?? []).filter((s) => s.start_time >= weekAgo).length

  return (
    <div className={`screen${active ? ' with-banner' : ''}`}>
      <div className="header">
        <div>
          <h1>Привет{profile?.name && profile.name !== 'Гость' ? `, ${profile.name}` : ''}</h1>
          <div className="sub">
            {(sessions ?? []).length === 0
              ? 'Выберите день и начните тренировку'
              : `${thisWeek} ${plural(thisWeek, ['тренировка', 'тренировки', 'тренировок'])} за неделю`}
          </div>
        </div>
        {!online && (
          <span className="offline-pill">
            <i className="dot" /> оффлайн
          </span>
        )}
      </div>

      {assigned && (
        <div className="card" style={{ marginBottom: 16, borderColor: 'var(--accent)' }}>
          <div className="row between">
            <div className="grow">
              <div className="mute-sm">
                Программа от тренера{assigned.trainer ? ` · ${assigned.trainer.name}` : ''}
              </div>
              <div style={{ fontWeight: 600, marginTop: 2 }}>{assigned.program.name}</div>
            </div>
            <span className="badge pro">
              {assigned.doneThisWeek} / {assigned.assignment.weekly_target}
            </span>
          </div>
          <div className="bar" style={{ marginTop: 12 }}>
            <i
              style={{
                width: `${Math.min(100, (assigned.doneThisWeek / assigned.assignment.weekly_target) * 100)}%`,
                background:
                  assigned.doneThisWeek >= assigned.assignment.weekly_target
                    ? 'var(--ok)'
                    : 'var(--accent)',
              }}
            />
          </div>
          {assigned.assignment.note && (
            <div className="mute-sm" style={{ marginTop: 10 }}>
              {assigned.assignment.note}
            </div>
          )}
        </div>
      )}

      {active && (
        <button
          className="btn primary block"
          style={{ marginBottom: 16 }}
          onClick={() => nav(`/session/${active.id}`)}
        >
          <IconPlay size={18} /> Вернуться к тренировке
        </button>
      )}

      <WorkoutCalendar />
    </div>
  )
}
