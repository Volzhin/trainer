import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, currentUserId, type Exercise, type WorkoutTemplateItem } from '../db/db'
import { addTemplateItem, createRoutine, startSessionFromRoutine } from '../db/repo'
import { IconBack, IconChevronRight, IconPlay, IconPlus, IconTrash } from '../components/Icons'
import { ExercisePicker } from '../components/ExercisePicker'
import { ExerciseTechniqueSheet } from '../components/ExerciseTechnique'
import { useApp } from '../store/app'
import { haptics } from '../lib/native'

export function ProgramDetail() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { toast } = useApp()
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const [techniqueFor, setTechniqueFor] = useState<string | null>(null)

  const program = useLiveQuery(() => db.programs.get(id), [id])
  const routines = useLiveQuery(
    () => db.routines.where('program_id').equals(id).sortBy('day_order'),
    [id],
    [],
  )
  const items = useLiveQuery(() => db.templateItems.toArray(), [], [] as WorkoutTemplateItem[])
  const exercises = useLiveQuery(() => db.exercises.toArray(), [], [] as Exercise[])
  const clientName = useLiveQuery(
    async () => (program?.client_id ? (await db.profile.get(program.client_id))?.name : undefined),
    [program?.client_id],
  )

  if (!program) return <div className="screen">Загрузка…</div>

  const editable = program.author_id === currentUserId()
  const exMap = new Map((exercises ?? []).map((e) => [e.id, e]))

  const patchItem = (itemId: string, patch: Partial<WorkoutTemplateItem>) =>
    db.templateItems.update(itemId, { ...patch, updated_at: Date.now() })

  return (
    <div className="screen">
      <div className="header">
        <button className="icon-btn" onClick={() => nav(-1)} aria-label="Назад">
          <IconBack size={18} />
        </button>
        <div className="grow">
          <h1 style={{ fontSize: 22 }}>{program.name}</h1>
          <div className="sub">
            {program.goal} · {program.level}
            {!editable && ' · программа платформы'}
          </div>
        </div>
      </div>

      {/* Персональная программа собирается из карточки клиента — держим
          обратный путь на виду, иначе тренер теряет контекст. */}
      {program.client_id && (
        <div className="card" style={{ borderColor: 'var(--accent)' }}>
          <div className="row between">
            <div className="grow">
              <div className="mute-sm">Программа для клиента</div>
              <div style={{ fontWeight: 600, marginTop: 2 }}>{clientName ?? '—'}</div>
            </div>
            <button
              className="btn sm"
              onClick={() => nav(`/trainer/clients/${program.client_id}`)}
            >
              К клиенту
            </button>
          </div>
        </div>
      )}

      {program.description && !program.client_id && (
        <div className="card muted">{program.description}</div>
      )}

      {(routines ?? []).map((routine) => {
        const dayItems = (items ?? [])
          .filter((i) => i.routine_id === routine.id)
          .sort((a, b) => a.sequence_order - b.sequence_order)

        return (
          <div key={routine.id} style={{ marginTop: 16 }}>
            <div className="row between" style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 600 }}>{routine.name}</div>
              <button
                className="btn sm primary"
                onClick={async () => {
                  haptics.impact()
                  const sid = await startSessionFromRoutine(routine.id)
                  nav(`/session/${sid}`)
                }}
              >
                <IconPlay size={13} /> Начать
              </button>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {dayItems.length === 0 && (
                <div className="mute-sm" style={{ padding: 16, textAlign: 'center' }}>
                  Пока пусто
                </div>
              )}
              {dayItems.map((item, idx) => {
                const ex = exMap.get(item.exercise_id)
                return (
                  <div
                    key={item.id}
                    style={{
                      padding: '12px 14px',
                      borderTop: idx === 0 ? 'none' : '1px solid var(--line)',
                    }}
                  >
                    <div className="row between">
                      {/* Строка ведёт к технике: без неё клиент видит название
                          и не понимает, как упражнение делать. */}
                      <button
                        className="row grow"
                        style={{ textAlign: 'left', gap: 10 }}
                        onClick={() => ex && setTechniqueFor(ex.id)}
                      >
                        {ex?.image_url ? (
                          <img src={ex.image_url} alt="" className="ex-thumb" loading="lazy" />
                        ) : (
                          <span className="ex-thumb placeholder" />
                        )}
                        <span className="grow">
                          <span className="truncate" style={{ display: 'block' }}>
                            {ex?.name ?? 'Упражнение'}
                          </span>
                          <span className="mute-sm">{ex?.muscle_group} · как делать</span>
                        </span>
                        <span className="chevron">
                          <IconChevronRight size={16} />
                        </span>
                      </button>
                      {editable && (
                        <button
                          className="icon-btn"
                          onClick={() => db.templateItems.delete(item.id)}
                          aria-label="Убрать"
                        >
                          <IconTrash size={16} />
                        </button>
                      )}
                    </div>

                    <div className="row" style={{ marginTop: 8, gap: 8 }}>
                      <NumField
                        label="подходы"
                        value={item.target_sets}
                        disabled={!editable}
                        onChange={(v) => patchItem(item.id, { target_sets: v })}
                      />
                      <NumField
                        label="повторы"
                        value={item.target_reps ?? 0}
                        disabled={!editable}
                        onChange={(v) => patchItem(item.id, { target_reps: v })}
                      />
                      <NumField
                        label="отдых, сек"
                        value={item.rest_seconds}
                        step={15}
                        disabled={!editable}
                        onChange={(v) => patchItem(item.id, { rest_seconds: v })}
                      />
                    </div>
                  </div>
                )
              })}

              {editable && (
                <div style={{ padding: 12, borderTop: '1px solid var(--line)' }}>
                  <button className="btn sm block" onClick={() => setPickerFor(routine.id)}>
                    <IconPlus size={15} /> Добавить упражнение
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })}

      {editable && (
        <button
          className="btn block"
          style={{ marginTop: 16 }}
          onClick={async () => {
            const count = (routines ?? []).length
            await createRoutine(id, `День ${count + 1}`)
            toast('День добавлен')
          }}
        >
          <IconPlus size={17} /> Добавить день
        </button>
      )}

      <ExerciseTechniqueSheet exerciseId={techniqueFor} onClose={() => setTechniqueFor(null)} />

      <ExercisePicker
        open={!!pickerFor}
        onClose={() => setPickerFor(null)}
        onPick={(ex) => {
          if (pickerFor) void addTemplateItem(pickerFor, ex.id)
        }}
      />
    </div>
  )
}

function NumField({
  label,
  value,
  onChange,
  step = 1,
  disabled,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
  disabled?: boolean
}) {
  return (
    <div className="grow" style={{ textAlign: 'center' }}>
      <div className="row" style={{ gap: 4, justifyContent: 'center' }}>
        <button
          className="icon-btn"
          style={{ width: 28, height: 28 }}
          disabled={disabled}
          onClick={() => {
            haptics.selection()
            onChange(Math.max(0, value - step))
          }}
        >
          −
        </button>
        <span style={{ minWidth: 34, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </span>
        <button
          className="icon-btn"
          style={{ width: 28, height: 28 }}
          disabled={disabled}
          onClick={() => {
            haptics.selection()
            onChange(value + step)
          }}
        >
          +
        </button>
      </div>
      <div className="mute-sm" style={{ fontSize: 10, marginTop: 2 }}>
        {label}
      </div>
    </div>
  )
}
