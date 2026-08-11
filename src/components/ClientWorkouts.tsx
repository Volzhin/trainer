import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type WorkoutSession } from '../db/db'
import { loadProgress } from '../db/analytics'
import { workoutReportsOf, reviewedRefs } from '../db/reports'
import { activeAssignmentFor } from '../db/coach'
import { localDate } from '../lib/tdee'
import { plural } from '../lib/calc'
import { ReportCalendar, type ReportState } from './ReportCalendar'
import { ExerciseRow } from './ProgressView'
import { SessionReview } from './SessionReview'

const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

/**
 * Тренировки клиента глазами тренера.
 *
 * Порядок продиктован тем, как тренер смотрит: сначала что сдано и что ещё
 * ждёт разбора (календарь), потом по какому плану человек работает, и лишь
 * затем — цифры. Разбор открывается прямо из календаря: искать нужную
 * тренировку списком после того, как увидел её в сетке, незачем.
 */
export function ClientWorkouts({
  clientId,
  onAssign,
}: {
  clientId: string
  /** Открывает форму назначения — она живёт в карточке клиента. */
  onAssign: () => void
}) {
  const nav = useNavigate()
  const [reviewing, setReviewing] = useState<WorkoutSession | null>(null)

  const version = useLiveQuery(
    async () => [await db.sessions.count(), await db.reviews.count(), await db.feedback.count()],
    [clientId],
  )

  const reports = useLiveQuery(() => workoutReportsOf(clientId), [clientId, version?.join('-')])
  const seen = useLiveQuery(() => reviewedRefs(clientId, 'workout'), [clientId, version?.join('-')])
  const sessions = useLiveQuery(
    () => db.sessions.where('user_id').equals(clientId).toArray(),
    [clientId, version?.join('-')],
  )
  const assigned = useLiveQuery(() => activeAssignmentFor(clientId), [clientId])
  // Нагрузка и упражнения — за четыре недели: горизонт, на котором видно
  // тенденцию и ещё не размыты последние правки программы.
  const report = useLiveQuery(() => loadProgress(clientId, 28), [clientId, version?.join('-')])

  const byDate = useMemo(() => {
    const map = new Map<string, ReportState>()
    const sessionOf = new Map((sessions ?? []).map((s) => [s.id, s]))
    for (const r of reports ?? []) {
      if (r.status !== 'submitted') continue
      // Без самой тренировки отчёт всё равно показываем: строки приезжают
      // с сервера по одной, и требовать обе значит прятать сданное до тех
      // пор, пока не доедет вторая.
      const session = sessionOf.get(r.session_id)
      const at = r.submitted_at ?? session?.start_time
      if (at == null) continue
      const date = localDate(at)
      const state: ReportState = seen?.has(r.id) ? 'reviewed' : 'submitted'
      // Жёлтый перебивает зелёный: клетка означает «здесь ещё есть работа».
      if (map.get(date) !== 'submitted') map.set(date, state)
    }
    return map
  }, [reports, seen, sessions])

  if (!reports || !seen || !sessions || !report) return <div className="empty">Загрузка…</div>

  const openDay = (date: string) => {
    const hit = (reports ?? []).find((r) => {
      const session = sessions.find((s) => s.id === r.session_id)
      return session && localDate(r.submitted_at ?? session.start_time) === date
    })
    const session = hit && sessions.find((s) => s.id === hit.session_id)
    if (session) setReviewing(session)
  }

  const inProgram = report.exercises.filter((e) => e.inProgram)
  const shownExercises = inProgram.length ? inProgram : report.exercises

  return (
    <div className="mt-4">
      <div className="section-title">Сданные тренировки</div>
      <div className="card">
        <ReportCalendar states={byDate} onPick={openDay} />
      </div>

      <div className="section-title">Программа</div>
      <div className="card">
        {assigned ? (
          <>
            <div className="strong">{assigned.program.name}</div>
            <div className="mute-sm mt-1">
              {assigned.assignment.schedule?.length
                ? assigned.assignment.schedule
                    .slice()
                    .sort((a, b) => a.weekday - b.weekday)
                    .map((sl) => WEEKDAYS[sl.weekday])
                    .join(', ')
                : `${assigned.assignment.weekly_target} в неделю`}
              {assigned.weeksLeft != null &&
                ` · осталось ${assigned.weeksLeft} ${plural(assigned.weeksLeft, ['неделя', 'недели', 'недель'])}`}
            </div>
            <div className="row mt-3" style={{ gap: 8 }}>
              <button
                className="btn sm grow"
                onClick={() => nav(`/programs/${assigned.program.id}`)}
              >
                Открыть
              </button>
              <button className="btn sm grow" onClick={onAssign}>
                Заменить
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="strong">Программа не назначена</div>
            <div className="mute-sm mt-1">
              Клиент не увидит план тренировок, пока вы не назначите программу.
            </div>
            <button className="btn primary block mt-3" onClick={onAssign}>
              Назначить программу
            </button>
          </>
        )}
      </div>

      <div className="section-title">Куда уходит нагрузка</div>
      <div className="card">
        {report.muscles.length === 0 ? (
          <div className="mute-sm">За четыре недели подходов не записано.</div>
        ) : (
          <div className="stack">
            {report.muscles.slice(0, 8).map((m) => {
              const top = report.muscles[0].sets
              return (
                <div key={m.group}>
                  <div className="row between mb-1">
                    <span className="muted">{m.group}</span>
                    <span className="mute-sm t-num">
                      {m.sets} {plural(m.sets, ['подход', 'подхода', 'подходов'])}
                    </span>
                  </div>
                  <div className="bar">
                    <i style={{ width: `${(m.sets / top) * 100}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="section-title">
        {inProgram.length ? 'Упражнения программы' : 'Упражнения'}
      </div>
      <div className="mute-sm mb-3">
        Рабочий вес в последней тренировке и изменение расчётного максимума за четыре недели.
      </div>
      {shownExercises.length === 0 ? (
        <div className="empty compact">За четыре недели подходов не записано</div>
      ) : (
        <div className="stack tight">
          {shownExercises.map((e) => (
            <ExerciseRow
              key={e.exercise.id}
              row={e}
              onOpen={() => nav(`/exercises/${e.exercise.id}`)}
            />
          ))}
        </div>
      )}

      <SessionReview
        session={reviewing}
        clientId={clientId}
        onClose={() => setReviewing(null)}
      />
    </div>
  )
}
