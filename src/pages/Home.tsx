import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, currentUserId } from '../db/db'
import {
  startEmptySession,
  startSessionFromRoutine,
  getActiveSession,
  listMySessions,
} from '../db/repo'
import { activeAssignmentFor } from '../db/coach'
import { formatDate, formatDuration, formatTonnage, plural, startOfDay, totalVolume } from '../lib/calc'
import { BodyCompositionCard } from '../components/BodyCompositionCard'
import { WorkoutCalendar } from '../components/WorkoutCalendar'
import { IconCheck, IconDumbbell, IconFlame, IconPlay, IconPlus } from '../components/Icons'
import { useApp } from '../store/app'
import { haptics } from '../lib/native'

export function Home() {
  const nav = useNavigate()
  const { online, toast, userId } = useApp()
  const profile = useLiveQuery(() => db.profile.get(currentUserId()), [])
  const sessions = useLiveQuery(() => listMySessions(), [])
  const allSets = useLiveQuery(() => db.sets.toArray(), [])
  const active = useLiveQuery(() => getActiveSession(), [])
  const assigned = useLiveQuery(() => activeAssignmentFor(currentUserId()), [sessions?.length])

  // Последняя тренировка из программ пользователя — чтобы продолжить сплит.
  const nextRoutine = useLiveQuery(async () => {
    // Если тренер назначил программу, следующий день берём из неё.
    const plan = await activeAssignmentFor(currentUserId())
    const mine = await listMySessions()
    const last = mine.find((s) => s.routine_id)

    if (plan) {
      const idx = plan.routines.findIndex((r) => r.id === last?.routine_id)
      return plan.routines[(idx + 1) % plan.routines.length] ?? plan.routines[0] ?? null
    }
    if (!last?.routine_id) {
      const anyRoutine = await db.routines.orderBy('day_order').first()
      return anyRoutine ?? null
    }
    const routine = await db.routines.get(last.routine_id)
    if (!routine) return null
    const siblings = await db.routines.where('program_id').equals(routine.program_id).sortBy('day_order')
    const idx = siblings.findIndex((r) => r.id === routine.id)
    return siblings[(idx + 1) % siblings.length] ?? routine
  }, [sessions?.length])

  const stats = useMemo(() => {
    const done = sessions ?? []
    const sets = allSets ?? []
    const weekAgo = startOfDay(Date.now()) - 6 * 86400_000
    const thisWeek = done.filter((s) => s.start_time >= weekAgo)
    const volume = totalVolume(sets.filter((s) => s.is_done))
    const totalTime = done.reduce((a, s) => a + ((s.end_time ?? s.start_time) - s.start_time), 0)

    // Серия: подряд идущие недели/дни с тренировками.
    const days = new Set(done.map((s) => startOfDay(s.start_time)))
    let streak = 0
    let cursor = startOfDay(Date.now())
    if (!days.has(cursor)) cursor -= 86400_000
    while (days.has(cursor)) {
      streak++
      cursor -= 86400_000
    }

    return { count: done.length, week: thisWeek.length, volume, totalTime, streak }
  }, [sessions, allSets])

  const start = async (routineId?: string) => {
    haptics.impact()
    const id = routineId ? await startSessionFromRoutine(routineId) : await startEmptySession()
    nav(`/session/${id}`)
  }

  const resume = () => {
    if (active) nav(`/session/${active.id}`)
  }

  return (
    <div className={`screen${active ? ' with-banner' : ''}`}>
      <div className="header">
        <div>
          <h1>Привет{profile?.name && profile.name !== 'Гость' ? `, ${profile.name}` : ''}</h1>
          <div className="sub">
            {stats.count === 0
              ? 'Пора начать первую тренировку'
              : `${stats.week} ${plural(stats.week, ['тренировка', 'тренировки', 'тренировок'])} за неделю`}
          </div>
        </div>
        {!online && (
          <span className="offline-pill">
            <i className="dot" /> оффлайн
          </span>
        )}
      </div>

      {assigned && (
        <div className="card" style={{ marginBottom: 10, borderColor: 'var(--accent-dim)' }}>
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
          <div className="rest-progress" style={{ marginTop: 10 }}>
            <i
              style={{
                width: `${Math.min(100, (assigned.doneThisWeek / assigned.assignment.weekly_target) * 100)}%`,
                background:
                  assigned.doneThisWeek >= assigned.assignment.weekly_target
                    ? 'var(--success)'
                    : 'var(--accent)',
              }}
            />
          </div>
          {assigned.assignment.note && (
            <div className="mute-sm" style={{ marginTop: 8 }}>
              {assigned.assignment.note}
            </div>
          )}
        </div>
      )}

      {active ? (
        <button className="btn primary block" onClick={resume}>
          <IconPlay size={18} /> Продолжить: {active.title}
        </button>
      ) : (
        <div className="stack">
          {nextRoutine && (
            <div className="card">
              <div className="mute-sm">Следующая по плану</div>
              <div style={{ fontSize: 18, fontWeight: 600, margin: '4px 0 12px' }}>
                {nextRoutine.name}
              </div>
              <button className="btn primary block" onClick={() => start(nextRoutine.id)}>
                <IconPlay size={18} /> Начать тренировку
              </button>
            </div>
          )}
          <button className="btn block" onClick={() => start()}>
            <IconPlus size={18} /> Свободная тренировка
          </button>
        </div>
      )}

      <div className="section-title">Календарь</div>
      <WorkoutCalendar />

      <div className="section-title">Сводка</div>
      <div className="stat-grid">
        <div className="stat">
          <div className="value">{stats.count}</div>
          <div className="label">всего тренировок</div>
        </div>
        <div className="stat">
          <div className="value">
            {stats.streak}
            <span style={{ fontSize: 14, color: 'var(--pr)', marginLeft: 6 }}>
              <IconFlame size={14} />
            </span>
          </div>
          <div className="label">дней подряд</div>
        </div>
        <div className="stat">
          <div className="value">{formatTonnage(stats.volume)}</div>
          <div className="label">суммарный тоннаж</div>
        </div>
        <div className="stat">
          <div className="value">{formatDuration(stats.totalTime)}</div>
          <div className="label">времени под штангой</div>
        </div>
      </div>

      <div className="section-title">Тело</div>
      <BodyCompositionCard userId={userId} onOpen={() => nav('/body')} />

      <div className="section-title">История</div>
      {(sessions ?? []).length === 0 ? (
        <div className="empty">
          <div className="big">
            <IconDumbbell size={34} />
          </div>
          Здесь появятся ваши тренировки.
          <br />
          Все данные хранятся на устройстве и доступны без сети.
        </div>
      ) : (
        (sessions ?? []).slice(0, 12).map((s) => {
          const sets = (allSets ?? []).filter((x) => x.workout_session_id === s.id)
          const vol = totalVolume(sets)
          return (
            <button
              key={s.id}
              className="list-item"
              style={{ width: '100%', textAlign: 'left' }}
              onClick={() => nav(`/history/${s.id}`)}
            >
              <div className="avatar">
                <IconCheck size={16} />
              </div>
              <div className="grow">
                <div className="truncate">{s.title}</div>
                <div className="mute-sm">
                  {formatDate(s.start_time)} · {sets.length}{' '}
                  {plural(sets.length, ['подход', 'подхода', 'подходов'])} ·{' '}
                  {Math.round(vol)} кг
                </div>
              </div>
              <div className="mute-sm">
                {formatDuration((s.end_time ?? s.start_time) - s.start_time)}
              </div>
            </button>
          )
        })
      )}

      {(sessions ?? []).length > 0 && (
        <div className="mute-sm" style={{ textAlign: 'center', marginTop: 16 }}>
          Данные записаны локально{online ? ' и готовы к синхронизации' : ', синхронизация после появления сети'}
          {'. '}
          <button
            className="btn ghost sm"
            onClick={() => toast('Очередь синхронизации пуста — сервер в прототипе не подключён')}
          >
            Проверить очередь
          </button>
        </div>
      )}
    </div>
  )
}
