import { useLiveQuery } from 'dexie-react-hooks'
import { exerciseHistory } from '../db/repo'
import { formatWeight } from '../lib/calc'

/**
 * Что человек уже делал в этом упражнении: лучший подход за всю историю и
 * подходы прошлой тренировки.
 *
 * Два разных ответа на два разных вопроса, поэтому и стоят рядом. «Лучший»
 * говорит, на что он способен; «последний» — от чего отталкиваться сегодня.
 * Показывать один рекорд жестоко: он мог быть год назад и на свежих силах,
 * а сравнивать себя человек будет всё равно.
 */
export function ExerciseBrief({ exerciseId }: { exerciseId: string }) {
  const history = useLiveQuery(() => exerciseHistory(exerciseId), [exerciseId])
  if (!history) return null

  const { best, last } = history
  if (!best && !last.length) return null

  const short = (weight?: number, reps?: number | null) =>
    `${formatWeight(weight)}×${reps ?? '—'}`

  return (
    <div className="ex-brief">
      {best && (
        <div>
          <div className="cap">Лучший</div>
          <div className="figures">{short(best.weight_kg, best.reps_completed)}</div>
        </div>
      )}
      {last.length > 0 && (
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="cap">Последний</div>
          {/* Подходы прошлой тренировки в строку: их редко больше пяти, а
              вертикальным списком они отодвинули бы сами поля ввода. */}
          <div className="figures truncate">
            {last.map((s) => short(s.weight_kg, s.reps_completed)).join('  ')}
          </div>
        </div>
      )}
    </div>
  )
}
