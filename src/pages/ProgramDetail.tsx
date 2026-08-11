import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, currentUserId, type WorkoutRoutine, type WorkoutTemplateItem } from '../db/db'
import { useExercises } from '../db/catalog'
import { addTemplateItem, createRoutine, startSessionFromRoutine } from '../db/repo'
import { activeAssignmentFor, cancelMyPlan, planProgramMyself } from '../db/coach'
import { IconBack, IconChevronRight, IconPlay, IconPlus, IconTrash } from '../components/Icons'
import { ExercisePicker } from '../components/ExercisePicker'
import { ExerciseTechniqueSheet } from '../components/ExerciseTechnique'
import { Sheet } from '../components/Sheet'
import { useApp } from '../store/app'
import { haptics } from '../lib/native'
import { plural } from '../lib/calc'

const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

export function ProgramDetail() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { toast } = useApp()
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const [techniqueFor, setTechniqueFor] = useState<string | null>(null)
  const [planOpen, setPlanOpen] = useState(false)

  const program = useLiveQuery(() => db.programs.get(id), [id])
  const routines = useLiveQuery(
    () => db.routines.where('program_id').equals(id).sortBy('day_order'),
    [id],
    [],
  )
  const items = useLiveQuery(() => db.templateItems.toArray(), [], [] as WorkoutTemplateItem[])
  const exercises = useExercises()
  const clientName = useLiveQuery(
    async () =>
      program?.client_id ? (await db.profile.get(program.client_id))?.name : undefined,
    [program?.client_id],
  )

  const plan = useLiveQuery(() => activeAssignmentFor(), [])

  if (!program) return <div className="screen">Загрузка…</div>

  const editable = program.author_id === currentUserId()
  // Планирует человек себе, поэтому чужую персональную программу — ту, что
  // тренер собрал для клиента, — в план не предлагаем.
  const forSomeoneElse = !!program.client_id && program.client_id !== currentUserId()
  const lockedByTrainer = !!plan && !plan.isSelfPlan
  const myPlan = plan?.isSelfPlan && plan.program.id === id ? plan : null
  const plannedDays = myPlan?.assignment.schedule
    ? [...myPlan.assignment.schedule]
        .sort((a, b) => a.weekday - b.weekday)
        .map((s) => WEEKDAYS[s.weekday])
    : []
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
              <div className="strong" style={{ marginTop: 2 }}>{clientName ?? '—'}</div>
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

      {/* Программа сама по себе — ещё не тренировки. План раскладывает её дни
          по дням недели, и только после этого календарь знает, что сегодня. */}
      {!forSomeoneElse && (routines ?? []).length > 0 && (
        <div
          className="card"
          style={myPlan ? { borderColor: 'var(--accent)' } : undefined}
          data-plan={myPlan ? 'on' : 'off'}
        >
          <div className="row between">
            <div className="grow">
              <div className="strong">{myPlan ? 'В моём плане' : 'Мой план'}</div>
              <div className="mute-sm" style={{ marginTop: 3 }}>
                {lockedByTrainer
                  ? `Сейчас действует программа от тренера${plan?.trainer ? ` · ${plan.trainer.name}` : ''}`
                  : plannedDays.length
                    ? `${plannedDays.join(', ')} · ${plannedDays.length} ${plural(
                        plannedDays.length,
                        ['тренировка', 'тренировки', 'тренировок'],
                      )} в неделю`
                    : 'Разложите дни по дням недели — они появятся в календаре на главной'}
              </div>
            </div>
            {!lockedByTrainer && (
              <button className="btn sm" onClick={() => setPlanOpen(true)}>
                {myPlan ? 'Изменить' : 'В план'}
              </button>
            )}
          </div>

          {myPlan && (
            <div className="weekday-row" style={{ marginTop: 14 }}>
              {WEEKDAYS.map((label, wd) => {
                const on = myPlan.assignment.schedule?.some((s) => s.weekday === wd)
                return (
                  <div key={wd} className={`weekday${on ? ' on' : ''}`}>
                    <span className="wd">{label}</span>
                    <span className="slot">{on ? '•' : '—'}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {(routines ?? []).map((routine) => {
        const dayItems = (items ?? [])
          .filter((i) => i.routine_id === routine.id)
          .sort((a, b) => a.sequence_order - b.sequence_order)

        return (
          <div key={routine.id} style={{ marginTop: 16 }}>
            <div className="row between" style={{ marginBottom: 8 }}>
              <div className="strong">{routine.name}</div>
              <button
                className="btn sm primary"
                onClick={async () => {
                  haptics.impact()
                  const sid = await startSessionFromRoutine(routine.id)
                  if (!sid) {
                    toast('В этом дне пока нет упражнений')
                    return
                  }
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
                      borderTop: idx === 0 ? 'none' : '1px solid var(--border)',
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
                <div style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
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

      <PlanSheet
        open={planOpen}
        onClose={() => setPlanOpen(false)}
        programId={id}
        days={routines ?? []}
        current={myPlan?.assignment.schedule}
        currentWeeks={myPlan?.assignment.weeks}
      />

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

/**
 * Раскладка программы по дням недели.
 *
 * Тот же приём, что в кабинете тренера: нажатие на день недели перебирает дни
 * программы и «пусто». Выпадающий список на каждый из семи дней превратил бы
 * минутное дело в анкету.
 */
function PlanSheet({
  open,
  onClose,
  programId,
  days,
  current,
  currentWeeks,
}: {
  open: boolean
  onClose: () => void
  programId: string
  days: WorkoutRoutine[]
  current?: { weekday: number; routine_id: string }[]
  currentWeeks?: number
}) {
  const { toast } = useApp()
  const [slots, setSlots] = useState<Record<number, string>>({})
  const [weeks, setWeeks] = useState(currentWeeks ?? 8)
  const [busy, setBusy] = useState(false)

  // Уже стоящий план открываем как есть, новый раскладываем по умолчанию
  // пн / ср / пт и дальше — самый частый разнос тренировок через день.
  useEffect(() => {
    if (!open || !days.length) return
    if (current?.length) {
      setSlots(Object.fromEntries(current.map((s) => [s.weekday, s.routine_id])))
      setWeeks(currentWeeks ?? 8)
      return
    }
    const preset = [0, 2, 4, 1, 3, 5, 6]
    const next: Record<number, string> = {}
    days.forEach((r, i) => {
      next[preset[i % preset.length]] = r.id
    })
    setSlots(next)
  }, [open, days.length, current?.length])

  const schedule = useMemo(
    () =>
      Object.entries(slots)
        .filter(([, routineId]) => routineId)
        .map(([weekday, routineId]) => ({ weekday: Number(weekday), routine_id: routineId })),
    [slots],
  )

  const cycleDay = (weekday: number) => {
    haptics.selection()
    setSlots((prev) => {
      const idx = days.findIndex((d) => d.id === prev[weekday])
      const next = { ...prev }
      if (idx === -1) next[weekday] = days[0]?.id
      else if (idx === days.length - 1) delete next[weekday]
      else next[weekday] = days[idx + 1].id
      return next
    })
  }

  const markOf = (routineId?: string) => {
    const i = days.findIndex((d) => d.id === routineId)
    return i === -1 ? null : String.fromCharCode(65 + i)
  }

  const save = async () => {
    if (!schedule.length) return
    setBusy(true)
    try {
      await planProgramMyself({ programId, schedule, weeks })
      toast('План сохранён — дни появятся в календаре')
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не удалось сохранить план')
    } finally {
      setBusy(false)
    }
  }

  const drop = async () => {
    setBusy(true)
    try {
      await cancelMyPlan()
      toast('План снят')
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} title="Запланировать программу" onClose={onClose}>
      <div className="stack">
        <div className="field">
          <label>Дни недели</label>
          <div className="weekday-row">
            {WEEKDAYS.map((label, wd) => {
              const mark = markOf(slots[wd])
              return (
                <button
                  key={wd}
                  className={`weekday${mark ? ' on' : ''}`}
                  onClick={() => cycleDay(wd)}
                >
                  <span className="wd">{label}</span>
                  <span className="slot">{mark ?? '—'}</span>
                </button>
              )
            })}
          </div>
          <div className="mute-sm" style={{ marginTop: 8 }}>
            {schedule.length
              ? `${schedule.length} ${plural(schedule.length, ['тренировка', 'тренировки', 'тренировок'])} в неделю`
              : 'Выберите хотя бы один день'}
          </div>
        </div>

        {days.length > 0 && (
          <div className="group">
            {days.map((r, i) => (
              <div className="group-row" key={r.id}>
                <span className="metric-icon" style={{ color: 'var(--accent-ink)' }}>
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="grow title">{r.name}</span>
                <span className="value">
                  {WEEKDAYS.filter((_, wd) => slots[wd] === r.id).join(', ') || 'не назначен'}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="field">
          <label>Сколько недель</label>
          <div className="segmented">
            {[4, 6, 8, 12].map((v) => (
              <button key={v} className={weeks === v ? 'on' : ''} onClick={() => setWeeks(v)}>
                {v}
              </button>
            ))}
          </div>
        </div>

        <button
          className="btn primary block"
          disabled={busy || !schedule.length}
          onClick={save}
        >
          Запланировать на {weeks} {plural(weeks, ['неделю', 'недели', 'недель'])}
        </button>

        {current?.length ? (
          <button className="btn block" disabled={busy} onClick={drop}>
            Убрать из плана
          </button>
        ) : null}
      </div>
    </Sheet>
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
        <span className="strong" style={{ minWidth: 34, fontVariantNumeric: 'tabular-nums' }}>
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
