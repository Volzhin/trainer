import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { Sheet } from './Sheet'
import { ExerciseMedia } from './ExerciseMedia'
import { ExerciseDescription } from './ExerciseDescription'
import { t } from '../lib/i18n'
import { exName } from '../lib/exerciseNames'

/**
 * Техника упражнения шторкой. Открывается из программы и прямо во время
 * тренировки: уводить человека с горячего экрана на отдельную страницу,
 * когда он стоит у тренажёра, нельзя — он потеряет введённые подходы.
 */
export function ExerciseTechniqueSheet({
  exerciseId,
  onClose,
}: {
  exerciseId: string | null
  onClose: () => void
}) {
  const exercise = useLiveQuery(
    async () => (exerciseId ? await db.exercises.get(exerciseId) : undefined),
    [exerciseId],
  )

  if (!exerciseId) return null

  return (
    <Sheet open={!!exerciseId} title={exName(exercise?.name) || t('Техника')} onClose={onClose}>
      {!exercise ? (
        <div className="empty">{t('Упражнение не найдено')}</div>
      ) : (
        <div className="stack" style={{ gap: 14 }}>
          <ExerciseMedia exercise={exercise} />

          <div className="tagline" style={{ marginTop: 0 }}>
            <span className="tag accent">{t(exercise.muscle_group)}</span>
            <span className="tag">{t(exercise.equipment)}</span>
            {exercise.exercise_type && <span className="tag">{exercise.exercise_type}</span>}
          </div>

          {exercise.description ? (
            <ExerciseDescription text={exercise.description} />
          ) : (
            <div className="muted">{t('Описание техники не заполнено.')}</div>
          )}

          {exercise.equipment_all && exercise.equipment_all.length > 0 && (
            <div className="group">
              <div className="group-row">
                <span className="grow title">{t('Инвентарь')}</span>
                <span className="value">{exercise.equipment_all.join(', ')}</span>
              </div>
            </div>
          )}

          {exercise.restrictions && exercise.restrictions.length > 0 && (
            <div className="card" style={{ borderColor: 'var(--warn)' }}>
              <div className="mute-sm" style={{ color: 'var(--warn)', marginBottom: 4 }}>
                {t('Ограничения')}
              </div>
              {exercise.restrictions.map((r) => (
                <div key={r} style={{ fontSize: 14 }}>
                  {r}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}
