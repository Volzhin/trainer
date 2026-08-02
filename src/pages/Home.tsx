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

      {assigned && (
        <>
          <div className="section-title">Программа от тренера</div>
          <div className="card">
            <div style={{ fontWeight: 700, fontSize: 17 }}>{assigned.program.name}</div>
            <div className="mute-sm" style={{ marginTop: 3 }}>
              {assigned.trainer?.name ?? 'Тренер'}
              {assigned.weeksLeft != null &&
                ` · осталось ${assigned.weeksLeft} ${plural(assigned.weeksLeft, ['неделя', 'недели', 'недель'])}`}
            </div>

            {/* Дни недели с планом: клиенту важно знать, когда он тренируется,
                а не только сколько раз. */}
            {assigned.assignment.schedule?.length ? (
              <div className="weekday-row" style={{ marginTop: 14 }}>
                {['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map((label, wd) => {
                  const on = assigned.assignment.schedule?.some((sl) => sl.weekday === wd)
                  return (
                    <div key={wd} className={`weekday${on ? ' on' : ''}`}>
                      <span className="wd">{label}</span>
                      <span className="slot">{on ? '•' : '—'}</span>
                    </div>
                  )
                })}
              </div>
            ) : null}

            <div className="row between" style={{ marginTop: 16, marginBottom: 6 }}>
              <span className="mute-sm">На этой неделе</span>
              <span className="mute-sm" style={{ fontFamily: 'var(--font-num)' }}>
                {assigned.doneThisWeek} из {assigned.assignment.weekly_target}
              </span>
            </div>
            <div className="bar">
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
              <div
                className="mute-sm"
                style={{
                  marginTop: 14,
                  paddingLeft: 10,
                  borderLeft: '2px solid var(--accent)',
                }}
              >
                {assigned.assignment.note}
              </div>
            )}

            <button
              className="btn sm block"
              style={{ marginTop: 14 }}
              onClick={() => nav('/programs')}
            >
              Открыть программу
            </button>
          </div>
        </>
      )}
    </div>
  )
}
