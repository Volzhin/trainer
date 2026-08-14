import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { coachNoteFor, coachNotesFor } from '../db/reports'
import type { Progression } from '../db/db'
import { Sheet } from './Sheet'
import { formatDateTime } from '../lib/calc'
import { t } from '../lib/i18n'

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
  const [historyOpen, setHistoryOpen] = useState(false)
  const hint = useLiveQuery(() => coachNoteFor(exerciseId, clientId), [exerciseId, clientId])
  // Историю тянем только с открытой шторкой: у снаряда нужна последняя
  // строка, а прошлые указания — когда за ними специально пришли.
  const history = useLiveQuery(
    async () => (historyOpen ? await coachNotesFor(exerciseId, clientId) : []),
    [historyOpen, exerciseId, clientId],
    [],
  )
  if (!hint) return null

  const label = hint.progression ? LABELS[hint.progression] : null

  return (
    <>
      <div className="quote inset">
        {label && (
          <span className="badge" style={{ color: label.color, borderColor: label.color }}>
            {t(label.text)}
          </span>
        )}
        {/* Комментарий показываем и без рекомендации по весу: «пауза внизу»
            указание не хуже, чем «прибавить». */}
        {hint.text && <div className={`mute-sm${label ? ' mt-1' : ''}`}>{hint.text}</div>}
        <button className="btn sm block mt-2" onClick={() => setHistoryOpen(true)}>
          {t('История комментариев')}
        </button>
      </div>

      <Sheet
        open={historyOpen}
        title={t('История комментариев')}
        onClose={() => setHistoryOpen(false)}
      >
        {history.length === 0 ? (
          <div className="empty compact">{t('Пока ничего не сказано')}</div>
        ) : (
          <div className="stack">
            {history.map((row) => {
              const mark = row.progression ? LABELS[row.progression] : null
              return (
                <div className="quote" key={row.id}>
                  {mark && (
                    <span
                      className="badge"
                      style={{ color: mark.color, borderColor: mark.color }}
                    >
                      {t(mark.text)}
                    </span>
                  )}
                  {row.text.trim() && (
                    <div className={`mute-sm${mark ? ' mt-1' : ''}`}>{row.text}</div>
                  )}
                  <div className="mute-sm mt-1">{formatDateTime(row.created_at)}</div>
                </div>
              )
            })}
          </div>
        )}
      </Sheet>
    </>
  )
}
