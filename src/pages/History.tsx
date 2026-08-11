import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { listMySessions } from '../db/repo'
import { IconBack, IconCheck, IconChevronRight, IconDumbbell } from '../components/Icons'
import { formatDate, formatDuration, plural, totalVolume } from '../lib/calc'

/** Полная история тренировок. С главной убрана: там теперь только календарь. */
export function History() {
  const nav = useNavigate()
  const sessions = useLiveQuery(() => listMySessions(), [])
  const allSets = useLiveQuery(() => db.sets.toArray(), [], [])
  // Пока история не прочитана, «здесь появятся тренировки» — вранье: у человека
  // они есть, просто ещё не доехали из базы. Пустой экран показываем только
  // когда точно знаем, что записей нет.
  const loading = sessions === undefined

  return (
    <div className="screen">
      <div className="header">
        <button className="icon-btn" onClick={() => nav(-1)} aria-label="Назад">
          <IconBack size={18} />
        </button>
        <div className="grow">
          <h1 style={{ fontSize: 22 }}>История</h1>
          <div className="sub">
            {loading
              ? ' '
              : `${sessions.length} ${plural(sessions.length, ['тренировка', 'тренировки', 'тренировок'])}`}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="stack">
          <div className="card skeleton" style={{ height: 64 }} />
          <div className="card skeleton" style={{ height: 64 }} />
          <div className="card skeleton" style={{ height: 64 }} />
        </div>
      ) : sessions.length === 0 ? (
        <div className="empty">
          <div className="big">
            <IconDumbbell size={34} />
          </div>
          Здесь появятся завершённые тренировки.
        </div>
      ) : (
        <div className="group stagger">
          {sessions.map((s, i) => {
            const sets = (allSets ?? []).filter((x) => x.workout_session_id === s.id)
            return (
              <button
                key={s.id}
                className="group-row"
                style={{ '--i': Math.min(i, 12) } as React.CSSProperties}
                onClick={() => nav(`/history/${s.id}`)}
              >
                <span className="metric-icon" style={{ color: 'var(--ok)' }}>
                  <IconCheck size={17} />
                </span>
                <span className="grow">
                  <span className="title">{s.title}</span>
                  <span className="sub" style={{ display: 'block' }}>
                    {formatDate(s.start_time)} · {sets.length}{' '}
                    {plural(sets.length, ['подход', 'подхода', 'подходов'])} ·{' '}
                    {Math.round(totalVolume(sets))} кг ·{' '}
                    {formatDuration((s.end_time ?? s.start_time) - s.start_time)}
                  </span>
                </span>
                <span className="chevron">
                  <IconChevronRight size={16} />
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
