import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { currentUserId } from '../db/db'
import { estimate1RM, formatDate, formatWeight, plural } from '../lib/calc'
import { LineChart } from './LineChart'
import { Sheet } from './Sheet'
import { t } from '../lib/i18n'
import { exName } from '../lib/exerciseNames'

/**
 * Статистика по подходам одного упражнения.
 *
 * По тренировкам, а не по отдельным подходам списком: человек хочет
 * увидеть, растёт ли он, а рост виден в сравнении дней между собой.
 * Внутри дня показываем все подходы — по ним понятно, добирал ли он вес
 * или сыпался к последнему.
 */
export function ExerciseStatsSheet({
  exerciseId,
  name,
  onClose,
}: {
  exerciseId: string | null
  name?: string
  onClose: () => void
}) {
  const days = useLiveQuery(async () => {
    if (!exerciseId) return null
    const rows = await db.sets.where('exercise_id').equals(exerciseId).toArray()
    const done = rows.filter((s) => s.is_done)
    if (!done.length) return []

    const sessions = await db.sessions.bulkGet([
      ...new Set(done.map((s) => s.workout_session_id)),
    ])
    const mine = new Map(
      sessions
        .filter((s) => !!s && s.user_id === currentUserId() && s.is_completed === 1)
        .map((s) => [s!.id, s!]),
    )

    const bySession = new Map<string, typeof done>()
    for (const s of done) {
      if (!mine.has(s.workout_session_id)) continue
      const arr = bySession.get(s.workout_session_id) ?? []
      arr.push(s)
      bySession.set(s.workout_session_id, arr)
    }

    return [...bySession.entries()]
      .map(([id, sets]) => ({
        at: mine.get(id)!.start_time,
        sets: sets.sort((a, b) => a.set_number - b.set_number),
      }))
      .sort((a, b) => b.at - a.at)
  }, [exerciseId])

  // Расчётный максимум по дням — по нему видно направление, которого не
  // видно в отдельных подходах: вес мог упасть, а повторы вырасти.
  const points = (days ?? [])
    .slice()
    .reverse()
    .map((d) => ({
      x: d.at,
      y: Math.round(
        Math.max(
          ...d.sets.map((s) =>
            s.weight_kg && s.reps_completed ? estimate1RM(s.weight_kg, s.reps_completed) : 0,
          ),
        ),
      ),
    }))
    .filter((p) => p.y > 0)

  return (
    <Sheet open={!!exerciseId} title={name ? exName(name) : t('Статистика')} onClose={onClose}>
      {days == null ? (
        <div className="card skeleton" style={{ height: 140 }} />
      ) : days.length === 0 ? (
        <div className="empty compact">{t('Это упражнение вы ещё не делали.')}</div>
      ) : (
        <div className="stack">
          {points.length >= 2 && (
            <div className="card">
              <div className="mute-sm mb-2">{t('Расчётный максимум')}</div>
              <LineChart data={points} unit={` ${t('кг')}`} height={90} />
            </div>
          )}

          <div className="group">
            {days.map((d) => (
              <div className="group-row" key={d.at}>
                <span className="grow">
                  <span className="title">{formatDate(d.at)}</span>
                  <span className="sub figures">
                    {d.sets
                      .map((s) => `${formatWeight(s.weight_kg)}×${s.reps_completed ?? '—'}`)
                      .join('  ')}
                  </span>
                </span>
                <span className="value">
                  {d.sets.length} {plural(d.sets.length, ['подход', 'подхода', 'подходов'])}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  )
}
