import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Exercise } from '../db/db'
import { createCustomExercise } from '../db/repo'
import { IconPlus, IconSearch } from '../components/Icons'
import { Sheet } from '../components/Sheet'
import { loadFacets, matchesQuery } from '../lib/facets'
import { useApp } from '../store/app'
import { plural } from '../lib/calc'

export function Exercises() {
  const nav = useNavigate()
  const { toast } = useApp()
  const [q, setQ] = useState('')
  const [muscle, setMuscle] = useState('Все')
  const [equipment, setEquipment] = useState('Всё')
  const [createOpen, setCreateOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  // Каталог больше тысячи позиций — рисуем порциями, иначе телефон
  // тратит секунды на разметку экрана, который всё равно не виден целиком.
  const [limit, setLimit] = useState(60)

  const exercises = useLiveQuery(() => db.exercises.toArray(), [], [] as Exercise[])
  const facets = useLiveQuery(() => loadFacets(), [exercises?.length], {
    muscles: [],
    equipment: [],
    sports: [],
  })

  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    return (exercises ?? [])
      .filter((e) => (muscle === 'Все' ? true : e.muscle_group === muscle))
      .filter((e) => (equipment === 'Всё' ? true : e.equipment === equipment))
      .filter((e) => matchesQuery(e, term))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }, [exercises, q, muscle, equipment])

  const visible = list.slice(0, limit)

  return (
    <div className="screen">
      <div className="header">
        <div>
          <h1>Упражнения</h1>
          <div className="sub">
            {list.length} {plural(list.length, ['упражнение', 'упражнения', 'упражнений'])} в каталоге
          </div>
        </div>
        <button className="icon-btn" onClick={() => setCreateOpen(true)} aria-label="Создать своё">
          <IconPlus size={18} />
        </button>
      </div>

      <div className="search">
        <IconSearch />
        <input
          className="input"
          placeholder="Поиск: жим, тяга, присед…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setLimit(60)
          }}
        />
      </div>

      {/* Одно измерение фильтра на виду, второе — за кнопкой: два ряда чипов
          подряд читались как стена и занимали пол-экрана. */}
      <div className="row" style={{ marginTop: 12, gap: 8 }}>
        <div className="chips grow" style={{ margin: 0, padding: 0 }}>
          {['Все', ...facets.muscles].map((m) => (
            <button
              key={m}
              className={`chip${muscle === m ? ' active' : ''}`}
              onClick={() => {
                setMuscle(m)
                setLimit(60)
              }}
            >
              {m}
            </button>
          ))}
        </div>
        <button
          className={`btn sm${equipment !== 'Всё' ? ' primary' : ''}`}
          style={{ flex: '0 0 auto' }}
          onClick={() => setFilterOpen(true)}
        >
          {equipment === 'Всё' ? 'Инвентарь' : equipment}
        </button>
      </div>

      <div className="group stagger" style={{ marginTop: 14 }}>
        {list.length === 0 && (
          <div className="empty">
            Ничего не нашлось. Можно создать своё упражнение.
          </div>
        )}
        {visible.map((ex, i) => (
          <button
            key={ex.id}
            className="group-row"
            style={{ '--i': Math.min(i, 12) } as React.CSSProperties}
            onClick={() => nav(`/exercises/${ex.id}`)}
          >
            <span className="grow">
              <span className="title">{ex.name}</span>
              <span className="sub" style={{ display: 'block' }}>
                {ex.muscle_group} · {ex.equipment}
              </span>
            </span>
            {ex.is_custom === 1 && <span className="badge">своё</span>}
          </button>
        ))}
      </div>

      {list.length > visible.length && (
        <button
          className="btn block"
          style={{ marginTop: 12 }}
          onClick={() => setLimit((v) => v + 120)}
        >
          Показать ещё · осталось {list.length - visible.length}
        </button>
      )}

      <Sheet open={filterOpen} title="Инвентарь" onClose={() => setFilterOpen(false)}>
        <div className="stack">
          {['Всё', ...facets.equipment].map((e) => (
            <button
              key={e}
              className={`btn block${equipment === e ? ' primary' : ''}`}
              onClick={() => {
                setEquipment(e)
                setLimit(60)
                setFilterOpen(false)
              }}
            >
              {e}
            </button>
          ))}
        </div>
      </Sheet>

      <CreateExerciseSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => toast('Упражнение добавлено')}
      />
    </div>
  )
}

function CreateExerciseSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  // Списки те же, что и в фильтрах, — своё упражнение встаёт в общий каталог.
  const facets = useLiveQuery(() => loadFacets(), [], {
    muscles: [],
    equipment: [],
    sports: [],
  })
  const [name, setName] = useState('')
  const [muscle, setMuscle] = useState('')
  const [equipment, setEquipment] = useState('')
  const [description, setDescription] = useState('')

  const submit = async () => {
    if (!name.trim()) return
    await createCustomExercise({
      name,
      muscle_group: muscle || facets.muscles[0] || 'Другое',
      equipment: equipment || facets.equipment[0] || 'Другое',
      description,
    })
    setName('')
    setDescription('')
    onCreated()
    onClose()
  }

  return (
    <Sheet open={open} title="Своё упражнение" onClose={onClose}>
      <div className="stack">
        <div className="field">
          <label>Название</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например: Тяга Пендлея"
          />
        </div>
        <div className="field">
          <label>Мышечная группа</label>
          <select
            className="select"
            value={muscle || facets.muscles[0] || ''}
            onChange={(e) => setMuscle(e.target.value)}
          >
            {facets.muscles.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Оборудование</label>
          <select
            className="select"
            value={equipment || facets.equipment[0] || ''}
            onChange={(e) => setEquipment(e.target.value)}
          >
            {facets.equipment.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Заметка по технике</label>
          <textarea
            className="textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Необязательно"
          />
        </div>
        <button className="btn primary block" disabled={!name.trim()} onClick={submit}>
          Создать
        </button>
        <div className="mute-sm" style={{ textAlign: 'center' }}>
          Своё упражнение видно только вам.
        </div>
      </div>
    </Sheet>
  )
}
