import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { type Exercise } from '../db/db'
import { useExercises } from '../db/catalog'
import { Sheet } from './Sheet'
import { IconSearch } from './Icons'
import { loadFacets, matchesQuery } from '../lib/facets'
import { t } from '../lib/i18n'

type Props = {
  open: boolean
  title?: string
  onClose: () => void
  onPick: (exercise: Exercise) => void
  /** Подсказка для «горячей замены»: показываем сначала похожие упражнения. */
  preferMuscle?: string
}

export function ExercisePicker({
  open,
  title = 'Выбрать упражнение',
  onClose,
  onPick,
  preferMuscle,
}: Props) {
  const [q, setQ] = useState('')
  const [muscle, setMuscle] = useState<string>(preferMuscle ?? 'Все')
  const exercises = useExercises()
  const facets = useLiveQuery(() => loadFacets(), [exercises?.length], {
    muscles: [],
    equipment: [],
    sports: [],
  })

  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    return (exercises ?? [])
      .filter((e) => (muscle === 'Все' ? true : e.muscle_group === muscle))
      .filter((e) => matchesQuery(e, term))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }, [exercises, q, muscle])

  return (
    <Sheet open={open} title={title} onClose={onClose}>
      <div className="search mb-3">
        <IconSearch />
        <input
          className="input"
          placeholder={t('Поиск по названию')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
      </div>

      <div className="chips mb-3">
        {['Все', ...facets.muscles].map((m) => (
          <button
            key={m}
            className={`chip${muscle === m ? ' active' : ''}`}
            onClick={() => setMuscle(m)}
          >
            {m}
          </button>
        ))}
      </div>

      {list.length === 0 && <div className="empty">{t('Ничего не нашлось')}</div>}

      {list.map((ex) => (
        <button
          key={ex.id}
          className="list-item"
          style={{ width: '100%', textAlign: 'left' }}
          onClick={() => {
            onPick(ex)
            onClose()
          }}
        >
          <div className="avatar">{ex.name.slice(0, 1)}</div>
          <div className="grow">
            <div className="truncate">{ex.name}</div>
            <div className="mute-sm">
              {ex.muscle_group} · {ex.equipment}
              {ex.is_custom === 1 ? ' · своё' : ''}
            </div>
          </div>
        </button>
      ))}
    </Sheet>
  )
}
