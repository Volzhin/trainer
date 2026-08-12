import { useLiveQuery } from 'dexie-react-hooks'
import { coachNoteFor } from '../db/reports'
import type { Progression } from '../db/db'

/**
 * Что тренер сказал про это упражнение: разбор техники и что делать с весом.
 *
 * Показывается прямо в тренировке, а не только в её карточке после
 * завершения. Рекомендация «прибавить» полезна ровно в тот момент, когда
 * человек стоит у снаряда и выбирает блины, — прочитанная вечером, она
 * относится к тренировке, которая уже прошла.
 *
 * До этого рекомендация никуда не выводилась вовсе: тренер её выставлял,
 * она сохранялась, и на этом всё заканчивалось.
 */

const LABELS: Record<Progression, { text: string; color: string }> = {
  decrease: { text: 'Снизить вес', color: 'var(--warn)' },
  keep: { text: 'Оставить вес', color: 'var(--text-2)' },
  increase: { text: 'Прибавить вес', color: 'var(--ok)' },
}

export function CoachHint({ exerciseId, clientId }: { exerciseId: string; clientId?: string }) {
  const hint = useLiveQuery(() => coachNoteFor(exerciseId, clientId), [exerciseId, clientId])
  if (!hint) return null

  const label = hint.progression ? LABELS[hint.progression] : null

  return (
    <div className="quote inset">
      {label && (
        <span className="badge" style={{ color: label.color, borderColor: label.color }}>
          {label.text}
        </span>
      )}
      {/* Комментарий показываем и без рекомендации по весу: «пауза внизу»
          указание не хуже, чем «прибавить». */}
      {hint.text && <div className={`mute-sm${label ? ' mt-1' : ''}`}>{hint.text}</div>}
    </div>
  )
}
