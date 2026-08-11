import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { IconBack } from '../components/Icons'
import { LineChart } from '../components/LineChart'
import { ExerciseMedia } from '../components/ExerciseMedia'
import { ExerciseDescription } from '../components/ExerciseDescription'
import { estimate1RM, formatDate, formatWeight } from '../lib/calc'

export function ExerciseDetail() {
  const { id = '' } = useParams()
  const nav = useNavigate()

  const exercise = useLiveQuery(() => db.exercises.get(id), [id])

  const history = useLiveQuery(async () => {
    const sets = await db.sets.where('exercise_id').equals(id).toArray()
    const done = sets.filter((s) => s.is_done && s.weight_kg && s.reps_completed)
    if (!done.length) return []

    const sessions = await db.sessions.bulkGet([
      ...new Set(done.map((s) => s.workout_session_id)),
    ])
    const byId = new Map(sessions.filter(Boolean).map((s) => [s!.id, s!]))

    const grouped = new Map<
      string,
      { date: number; best: number; sets: number; volume: number }
    >()
    for (const s of done) {
      const session = byId.get(s.workout_session_id)
      if (!session || session.is_completed !== 1) continue
      const cur = grouped.get(session.id) ?? {
        date: session.start_time,
        best: 0,
        sets: 0,
        volume: 0,
      }
      cur.best = Math.max(cur.best, estimate1RM(s.weight_kg!, s.reps_completed!))
      cur.sets += 1
      cur.volume += s.weight_kg! * s.reps_completed!
      grouped.set(session.id, cur)
    }
    return [...grouped.values()].sort((a, b) => a.date - b.date)
  }, [id])

  if (!exercise) {
    return <div className="screen">Загрузка…</div>
  }

  const chart = (history ?? []).map((h) => ({ x: h.date, y: h.best }))
  const pr = Math.max(0, ...(history ?? []).map((h) => h.best))

  return (
    <div className="screen">
      <div className="header">
        <button className="icon-btn" onClick={() => nav(-1)} aria-label="Назад">
          <IconBack size={18} />
        </button>
        <div className="grow">
          <h1 style={{ fontSize: 21, lineHeight: 1.2 }}>{exercise.name}</h1>
        </div>
      </div>

      <div className="tagline" style={{ marginBottom: 14, marginTop: -6 }}>
        <span className="tag accent">{exercise.muscle_group}</span>
        <span className="tag">{exercise.equipment}</span>
        {exercise.exercise_type && <span className="tag">{exercise.exercise_type}</span>}
        {(exercise.sports ?? []).map((s) => (
          <span className="tag" key={s}>
            {s}
          </span>
        ))}
      </div>

      <ExerciseMedia exercise={exercise} />

      {exercise.description && (
        <>
          <div className="section-title">Техника выполнения</div>
          <div className="card enter">
            <ExerciseDescription text={exercise.description} />
          </div>
        </>
      )}

      <div className="group" style={{ marginTop: 12 }}>
        {exercise.secondary && exercise.secondary.length > 0 && (
          <div className="group-row">
            <span className="grow title">Ещё работают</span>
            <span className="value">{exercise.secondary.join(', ')}</span>
          </div>
        )}
        {exercise.equipment_all && exercise.equipment_all.length > 0 && (
          <div className="group-row">
            <span className="grow title">Инвентарь</span>
            <span className="value">{exercise.equipment_all.join(', ')}</span>
          </div>
        )}
        {exercise.alt_names && exercise.alt_names.length > 0 && (
          <div className="group-row">
            <span className="grow title">Другие названия</span>
            <span className="value">{exercise.alt_names.join(', ')}</span>
          </div>
        )}
      </div>

      {exercise.restrictions && exercise.restrictions.length > 0 && (
        <div className="card" style={{ marginTop: 12, borderColor: 'var(--warn)' }}>
          <div className="mute-sm" style={{ color: 'var(--warn)', marginBottom: 4 }}>
            Ограничения
          </div>
          {exercise.restrictions.map((r) => (
            <div key={r} style={{ fontSize: 14 }}>
              {r}
            </div>
          ))}
        </div>
      )}

      <div className="section-title">Прогресс 1ПМ</div>
      <div className="card">
        {chart.length > 0 && (
          <div className="row between" style={{ marginBottom: 4 }}>
            <span className="muted">Расчётный максимум</span>
            <strong>{Math.round(pr)} кг</strong>
          </div>
        )}
        <LineChart data={chart} unit=" кг" />
      </div>

      <div className="section-title">История</div>
      {(history ?? []).length === 0 ? (
        <div className="empty">Ещё не выполняли это упражнение</div>
      ) : (
        [...(history ?? [])].reverse().map((h, i) => (
          <div className="list-item" key={i}>
            <div className="avatar">{new Date(h.date).getDate()}</div>
            <div className="grow">
              <div>{formatDate(h.date)}</div>
              <div className="mute-sm">
                {h.sets} подх. · {Math.round(h.volume)} кг тоннаж
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="strong">
                {formatWeight(Math.round(h.best * 10) / 10)}
              </div>
              <div className="mute-sm">1ПМ</div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
