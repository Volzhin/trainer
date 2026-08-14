import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { type Exercise } from '../db/db'
import { useExercises } from '../db/catalog'
import { Sheet } from './Sheet'
import { IconSearch } from './Icons'
import { loadFacets, matchesQuery } from '../lib/facets'
import { t } from '../lib/i18n'
import { exName } from '../lib/exerciseNames'

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
  const [muscle, setMuscle] = useState<string>('Все')
  const exercises = useExercises()

  /**
   * Пикер живёт в разметке экрана постоянно, а подсказка о мышце приходит
   * только вместе с открытием, поэтому фильтр ставится на каждом открытии, а
   * не при монтировании. Заодно поиск не тянется из прошлого раза: набранное
   * слово от предыдущего выбора скрывает половину каталога.
   */
  useEffect(() => {
    if (!open) return
    setQ('')
    setMuscle(preferMuscle ?? 'Все')
  }, [open, preferMuscle])
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
      .sort((a, b) => exName(a.name).localeCompare(exName(b.name)))
  }, [exercises, q, muscle])

  return (
    <Sheet open={open} title={t(title)} onClose={onClose}>
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
            {t(m)}
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
          <div className="avatar">{exName(ex.name).slice(0, 1)}</div>
          <div className="grow">
            <div className="truncate">{exName(ex.name)}</div>
            <div className="mute-sm">
              {t(ex.muscle_group)} · {t(ex.equipment)}
              {ex.is_custom === 1 ? ` · ${t('своё')}` : ''}
            </div>
          </div>
        </button>
      ))}
    </Sheet>
  )
}
