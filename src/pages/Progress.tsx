import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type ExerciseSet } from '../db/db'
import { listMySessions, logBodyMetric } from '../db/repo'
import { BarChart } from '../components/LineChart'
import { Sheet } from '../components/Sheet'
import { estimate1RM, plural, startOfDay } from '../lib/calc'
import { useApp } from '../store/app'

export function Progress() {
  const { toast } = useApp()
  const [metricOpen, setMetricOpen] = useState(false)

  const sessions = useLiveQuery(() => listMySessions(), [], [])
  const sets = useLiveQuery(() => db.sets.toArray(), [], [] as ExerciseSet[])
  const exercises = useLiveQuery(() => db.exercises.toArray(), [], [])

  const sessionIds = useMemo(() => new Set((sessions ?? []).map((s) => s.id)), [sessions])
  const doneSets = useMemo(
    () => (sets ?? []).filter((s) => s.is_done && sessionIds.has(s.workout_session_id)),
    [sets, sessionIds],
  )

  /** Тоннаж по последним 8 неделям. */
  const weekly = useMemo(() => {
    const byId = new Map((sessions ?? []).map((s) => [s.id, s]))
    const buckets: number[] = Array(8).fill(0)
    const labels: string[] = []
    const monday = startOfDay(Date.now())
    const dow = (new Date(monday).getDay() + 6) % 7
    const thisMonday = monday - dow * 86400_000

    for (let i = 0; i < 8; i++) {
      const start = thisMonday - (7 - i) * 7 * 86400_000
      labels.push(new Date(start).toLocaleDateString('ru-RU', { day: 'numeric', month: 'numeric' }))
    }
    for (const s of doneSets) {
      const session = byId.get(s.workout_session_id)
      if (!session || !s.weight_kg || !s.reps_completed) continue
      // Приводим дату тренировки к понедельнику её недели, иначе текущая
      // неделя (дни после понедельника) уезжает за границу массива.
      const day = startOfDay(session.start_time)
      const sessionMonday = day - ((new Date(day).getDay() + 6) % 7) * 86400_000
      const idx = 7 - Math.round((thisMonday - sessionMonday) / (7 * 86400_000))
      if (idx >= 0 && idx < 8) buckets[idx] += s.weight_kg * s.reps_completed
    }
    return { buckets, labels }
  }, [doneSets, sessions])

  /** Распределение подходов по мышечным группам за 30 дней. */
  const muscleSplit = useMemo(() => {
    const exMap = new Map((exercises ?? []).map((e) => [e.id, e]))
    const byId = new Map((sessions ?? []).map((s) => [s.id, s]))
    const cutoff = Date.now() - 30 * 86400_000
    const counts = new Map<string, number>()
    for (const s of doneSets) {
      const session = byId.get(s.workout_session_id)
      if (!session || session.start_time < cutoff) continue
      const g = exMap.get(s.exercise_id)?.muscle_group
      if (!g) continue
      counts.set(g, (counts.get(g) ?? 0) + 1)
    }
    const total = [...counts.values()].reduce((a, b) => a + b, 0)
    return { rows: [...counts.entries()].sort((a, b) => b[1] - a[1]), total }
  }, [doneSets, exercises, sessions])

  /** Топ упражнений по расчётному 1ПМ. */
  const records = useMemo(() => {
    const exMap = new Map((exercises ?? []).map((e) => [e.id, e]))
    const best = new Map<string, number>()
    for (const s of doneSets) {
      if (!s.weight_kg || !s.reps_completed) continue
      const score = estimate1RM(s.weight_kg, s.reps_completed)
      best.set(s.exercise_id, Math.max(best.get(s.exercise_id) ?? 0, score))
    }
    return [...best.entries()]
      .map(([exId, score]) => ({ name: exMap.get(exId)?.name ?? '—', score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
  }, [doneSets, exercises])


  return (
    <div className="screen">
      <div className="header">
        <div>
          <h1>Прогресс</h1>
          <div className="sub">
            {(sessions ?? []).length}{' '}
            {plural((sessions ?? []).length, ['тренировка', 'тренировки', 'тренировок'])} в истории
          </div>
        </div>
      </div>

      <div className="section-title">Тоннаж по неделям</div>
      <div className="card">
        <BarChart data={weekly.buckets} labels={weekly.labels} />
        <div className="mute-sm" style={{ marginTop: 8, textAlign: 'center' }}>
          Вес × повторения × подходы за неделю
        </div>
      </div>

      <div className="section-title">Объём по группам · 30 дней</div>
      <div className="card">
        {muscleSplit.rows.length === 0 ? (
          <div className="empty" style={{ padding: 20 }}>
            Нет данных за месяц
          </div>
        ) : (
          <div className="stack">
            {muscleSplit.rows.map(([group, count]) => (
              <div key={group}>
                <div className="row between" style={{ marginBottom: 4 }}>
                  <span className="muted">{group}</span>
                  <span className="mute-sm">
                    {count} {plural(count, ['подход', 'подхода', 'подходов'])}
                  </span>
                </div>
                <div className="rest-progress">
                  <i style={{ width: `${(count / muscleSplit.total) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="section-title">Рекорды · расчётный 1ПМ</div>
      {records.length === 0 ? (
        <div className="empty" style={{ padding: 20 }}>
          Завершите первую тренировку
        </div>
      ) : (
        records.map((r) => (
          <div className="list-item" key={r.name}>
            <div className="grow truncate">{r.name}</div>
            <strong>{Math.round(r.score)} кг</strong>
          </div>
        ))
      )}

      <BodyMetricSheet
        open={metricOpen}
        onClose={() => setMetricOpen(false)}
        onSaved={() => toast('Замер сохранён')}
      />
    </div>
  )
}

function BodyMetricSheet({
  open,
  onClose,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [weight, setWeight] = useState('')
  const [fat, setFat] = useState('')
  const [waist, setWaist] = useState('')

  const num = (v: string) => {
    const n = parseFloat(v.replace(',', '.'))
    return Number.isFinite(n) ? n : undefined
  }

  const submit = async () => {
    if (!weight && !fat && !waist) return
    await logBodyMetric({
      weight_kg: num(weight),
      body_fat_pct: num(fat),
      waist_cm: num(waist),
    })
    setWeight('')
    setFat('')
    setWaist('')
    onSaved()
    onClose()
  }

  return (
    <Sheet open={open} title="Замер тела" onClose={onClose}>
      <div className="stack">
        <div className="field">
          <label>Вес, кг</label>
          <input
            className="input"
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="78,5"
            autoFocus
          />
        </div>
        <div className="field">
          <label>Процент жира, %</label>
          <input
            className="input"
            inputMode="decimal"
            value={fat}
            onChange={(e) => setFat(e.target.value)}
            placeholder="16"
          />
        </div>
        <div className="field">
          <label>Талия, см</label>
          <input
            className="input"
            inputMode="decimal"
            value={waist}
            onChange={(e) => setWaist(e.target.value)}
            placeholder="84"
          />
        </div>
        <button className="btn primary block" onClick={submit}>
          Сохранить
        </button>
      </div>
    </Sheet>
  )
}
