import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Exercise, type ExerciseSet } from '../db/db'
import { useExercises } from '../db/catalog'
import {
  addExerciseToSession,
  addSetRow,
  completeSet,
  deleteSetRow,
  discardSession,
  finishSession,
  lastSetsForExercise,
  removeExerciseFromSession,
  swapExercise,
  uncompleteSet,
  updateSet,
} from '../db/repo'
import { estimate1RM, formatDuration, formatWeight, plural, totalVolume } from '../lib/calc'
import {
  IconBack,
  IconCheck,
  IconPlus,
  IconRecord,
  IconSwap,
  IconTrash,
} from '../components/Icons'
import { ExercisePicker } from '../components/ExercisePicker'
import { ExerciseTechniqueSheet } from '../components/ExerciseTechnique'
import { VideoUploader } from '../components/ExerciseVideo'
import { Sheet } from '../components/Sheet'
import { useApp, useClientMode, useProfile } from '../store/app'
import { ensureNotificationPermission, haptics } from '../lib/native'

type Block = {
  sequence_order: number
  exercise: Exercise
  sets: ExerciseSet[]
  prev: ExerciseSet[]
}

export function LiveSession() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { startRest, toast, stopRest } = useApp()
  const profile = useProfile()

  const [pickerOpen, setPickerOpen] = useState(false)
  const [swapFor, setSwapFor] = useState<Block | null>(null)
  const [techniqueFor, setTechniqueFor] = useState<string | null>(null)
  const [finishOpen, setFinishOpen] = useState(false)
  const [notes, setNotes] = useState('')
  /**
   * Длительность, замороженная в момент нажатия «Завершить». Секундомер
   * останавливается там, а не когда человек закончит возиться с видео: иначе
   * разбор роликов на десять минут припишется к длительности тренировки.
   */
  const [frozenElapsed, setFrozenElapsed] = useState<number | null>(null)
  const [askedNotify, setAskedNotify] = useState(false)

  const session = useLiveQuery(() => db.sessions.get(id), [id])
  // Кнопку съёмки показываем только на онлайн-сопровождении: без тренера
  // видео некому смотреть, а на очной работе технику он видит сам —
  // просить запись значит просить лишнее.
  const videoReport = useClientMode() === 'online'
  const sets = useLiveQuery(
    () => db.sets.where('workout_session_id').equals(id).toArray(),
    [id],
    [] as ExerciseSet[],
  )
  const exercises = useExercises()

  // История предыдущей тренировки по каждому упражнению — для подсказок.
  const prevByExercise = useLiveQuery(async () => {
    const ids = [...new Set((sets ?? []).map((s) => s.exercise_id))]
    const map = new Map<string, ExerciseSet[]>()
    for (const exId of ids) {
      const rows = await lastSetsForExercise(exId)
      map.set(
        exId,
        rows.filter((r) => r.workout_session_id !== id),
      )
    }
    return map
  }, [sets?.length, id])

  const blocks: Block[] = useMemo(() => {
    const exMap = new Map((exercises ?? []).map((e) => [e.id, e]))
    const grouped = new Map<number, ExerciseSet[]>()
    for (const s of sets ?? []) {
      const arr = grouped.get(s.sequence_order) ?? []
      arr.push(s)
      grouped.set(s.sequence_order, arr)
    }
    return [...grouped.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([sequence_order, rows]) => {
        const sorted = rows.sort((a, b) => a.set_number - b.set_number)
        const exercise = exMap.get(sorted[0].exercise_id)
        return {
          sequence_order,
          exercise: exercise ?? ({ id: '', name: 'Упражнение', muscle_group: '' } as never),
          sets: sorted,
          prev: prevByExercise?.get(sorted[0].exercise_id) ?? [],
        }
      })
  }, [sets, exercises, prevByExercise])

  const doneCount = (sets ?? []).filter((s) => s.is_done).length
  const volume = totalVolume(sets ?? [])

  /**
   * Упражнения, которые человек действительно сделал. В окне завершения
   * показываем только их: предлагать снять технику того, к чему он даже не
   * подошёл, — лишний шум в момент, когда хочется уже закончить.
   */
  const doneBlocks = useMemo(
    () =>
      blocks
        .map((b) => ({ exercise: b.exercise, done: b.sets.filter((s) => s.is_done).length }))
        .filter((b) => b.done > 0 && b.exercise.id),
    [blocks],
  )

  if (!session) {
    return (
      <div className="screen">
        <div className="empty">Тренировка не найдена</div>
        <button className="btn block" onClick={() => nav('/')}>
          На главную
        </button>
      </div>
    )
  }

  const onToggleDone = async (set: ExerciseSet, block: Block) => {
    if (set.is_done) {
      await uncompleteSet(set.id)
      haptics.selection()
      return
    }
    if (!set.weight_kg && !set.reps_completed) {
      toast('Укажите вес или повторения')
      return
    }

    const { isPR } = await completeSet(set.id)
    if (isPR) {
      haptics.success()
      toast(`Личный рекорд: ${block.exercise.name}!`, 'pr')
    } else {
      haptics.impact()
    }

    // Разрешение на уведомления запрашиваем в контексте — при первом отдыхе.
    if (!askedNotify) {
      setAskedNotify(true)
      void ensureNotificationPermission()
    }

    const restSeconds = await restForExercise(block.exercise.id, session.routine_id)
    const next = block.sets.find((s) => s.id !== set.id && !s.is_done)
    startRest(
      restSeconds ?? profile?.default_rest_seconds ?? 90,
      next ? block.exercise.name : undefined,
    )
  }

  const onFinish = async () => {
    const saved = await finishSession(id, notes.trim() || undefined)
    stopRest()
    haptics.success()
    toast(saved ? 'Тренировка завершена' : 'Тренировка отменена — ни одного подхода')
    nav('/', { replace: true })
  }

  const onDiscard = async () => {
    await discardSession(id)
    stopRest()
    nav('/', { replace: true })
  }

  return (
    <div className="screen">
      <div className="live-head">
        <div className="row between">
          <button className="icon-btn" onClick={() => nav(-1)} aria-label="Назад">
            <IconBack size={18} />
          </button>
          <div style={{ textAlign: 'center' }} className="grow">
            <div className="truncate strong">
              {session.title}
            </div>
            <div className="mute-sm">
              <Stopwatch from={session.start_time} stopped={frozenElapsed} /> · {doneCount}{' '}
              {plural(doneCount, ['подход', 'подхода', 'подходов'])} · {Math.round(volume)} кг
            </div>
          </div>
          <button
            className="btn success sm"
            onClick={() => {
              setFrozenElapsed(Date.now() - session.start_time)
              setFinishOpen(true)
            }}
          >
            Завершить
          </button>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        {blocks.length === 0 && (
          <div className="empty">
            <div className="big">
              <IconPlus size={34} />
            </div>
            Добавьте первое упражнение
          </div>
        )}

        {blocks.map((block) => (
          <div className="ex-block" key={block.sequence_order}>
            <div className="ex-head">
              {/* Техника открывается шторкой поверх тренировки: уходить со
                  страницы с незаписанными подходами нельзя. */}
              <button
                className="row grow"
                style={{ textAlign: 'left', gap: 10 }}
                onClick={() => setTechniqueFor(block.exercise.id)}
              >
                {block.exercise.image_url ? (
                  <img
                    src={block.exercise.image_url}
                    alt=""
                    className="ex-thumb"
                    loading="lazy"
                  />
                ) : (
                  <span className="ex-thumb placeholder" />
                )}
                <span className="grow">
                  <span className="truncate strong" style={{ display: 'block' }}>
                    {block.exercise.name}
                  </span>
                  <span className="mute-sm">
                    {block.prev.length > 0
                      ? `прошлый раз ${formatWeight(block.prev[0].weight_kg)} кг × ${
                          block.prev[0].reps_completed ?? '—'
                        }`
                      : 'как делать'}
                  </span>
                </span>
              </button>
              <button
                className="icon-btn"
                onClick={() => setSwapFor(block)}
                aria-label="Заменить упражнение"
                title="Заменить (тренажёр занят)"
              >
                <IconSwap size={17} />
              </button>
              <button
                className="icon-btn"
                onClick={() => removeExerciseFromSession(id, block.sequence_order)}
                aria-label="Убрать упражнение"
              >
                <IconTrash size={17} />
              </button>
            </div>

            <div className="set-grid head">
              <div className="num">#</div>
              <div style={{ textAlign: 'center' }}>кг</div>
              <div style={{ textAlign: 'center' }}>повт.</div>
              <div />
            </div>

            {block.sets.map((s, i) => (
              <SetRow
                key={s.id}
                set={s}
                index={i}
                prev={block.prev[i]}
                onToggle={() => onToggleDone(s, block)}
                onDelete={() => deleteSetRow(s.id)}
              />
            ))}

            <div style={{ padding: '4px 12px 8px' }}>
              <button
                className="btn sm block"
                onClick={() => addSetRow(id, block.exercise.id, block.sequence_order)}
              >
                <IconPlus size={15} /> Добавить подход
              </button>
            </div>
            {videoReport && <VideoUploader sessionId={id} exerciseId={block.exercise.id} />}
          </div>
        ))}

        <button
          className="btn block"
          style={{ marginTop: 12 }}
          onClick={() => setPickerOpen(true)}
        >
          <IconPlus size={17} /> Добавить упражнение
        </button>
      </div>

      <ExerciseTechniqueSheet exerciseId={techniqueFor} onClose={() => setTechniqueFor(null)} />

      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(ex) => addExerciseToSession(id, ex.id)}
      />

      <ExercisePicker
        open={!!swapFor}
        title="Заменить упражнение"
        preferMuscle={swapFor?.exercise.muscle_group}
        onClose={() => setSwapFor(null)}
        onPick={(ex) => {
          if (swapFor) void swapExercise(id, swapFor.sequence_order, ex.id)
          toast('Упражнение заменено')
        }}
      />

      <Sheet
        open={finishOpen}
        title="Завершить тренировку"
        onClose={() => {
          setFinishOpen(false)
          setFrozenElapsed(null)
        }}
      >
        <div className="stat-grid" style={{ marginBottom: 14 }}>
          <div className="stat">
            <div className="value">{formatDuration(frozenElapsed ?? 0)}</div>
            <div className="label">длительность</div>
          </div>
          <div className="stat">
            <div className="value">{Math.round(volume)} кг</div>
            <div className="label">тоннаж</div>
          </div>
        </div>
        {/* Видеоотчёт собирается здесь, а не по ходу тренировки: снимать и
            тут же прикреплять между подходами некогда. Ролики уже лежат в
            галерее — остаётся разложить их по упражнениям. */}
        {videoReport && doneBlocks.length > 0 && (
          <>
            <div className="field-group-title">Видеоотчёт тренеру</div>
            <div className="mute-sm" style={{ marginBottom: 10 }}>
              Необязательно. Можно пропустить и прикрепить позже — тренировка останется в
              истории.
            </div>
            <div className="finish-videos">
              {doneBlocks.map((block) => (
                <div className="finish-video" key={block.exercise.id}>
                  <div className="row between">
                    <span className="title truncate">{block.exercise.name}</span>
                    <span className="mute-sm">
                      {block.done} {plural(block.done, ['подход', 'подхода', 'подходов'])}
                    </span>
                  </div>
                  <VideoUploader sessionId={id} exerciseId={block.exercise.id} compact />
                </div>
              ))}
            </div>
          </>
        )}

        <div className="field" style={{ marginTop: 14, marginBottom: 14 }}>
          <label>Заметка к тренировке</label>
          <textarea
            className="textarea"
            placeholder="Самочувствие, техника, что поменять в следующий раз"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        {/* Тренировка без единого отмеченного подхода не сохраняется — сохранять
            в ней нечего. Раньше об этом сообщал тост уже после нажатия, когда
            экран сменился: человек видел, что тренировки нет в календаре, и
            считал это пропажей. Предупреждать нужно до, а не после. */}
        {doneCount === 0 && (
          <div
            className="mute-sm"
            style={{
              marginBottom: 12,
              paddingLeft: 10,
              borderLeft: '2px solid var(--danger)',
            }}
          >
            Ни один подход не отмечен галочкой — сохранять нечего, и в календаре тренировка не
            появится. Отметьте выполненные подходы и завершите снова.
          </div>
        )}
        <div className="stack">
          <button className="btn success block" onClick={onFinish}>
            {doneCount === 0 ? 'Выйти без сохранения' : 'Завершить тренировку'}
          </button>
          <button className="btn ghost danger block" onClick={onDiscard}>
            Отменить тренировку
          </button>
        </div>
        {doneCount > 0 && (
          <div className="mute-sm" style={{ marginTop: 10, textAlign: 'center' }}>
            Неотмеченные подходы не попадут в статистику.
          </div>
        )}
      </Sheet>
    </div>
  )
}

/**
 * Секундомер тренировки. Отдельным компонентом — чтобы ежесекундное
 * обновление перерисовывало строку со временем, а не весь экран с
 * упражнениями и полями подходов.
 */
function Stopwatch({ from, stopped }: { from: number; stopped: number | null }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (stopped != null) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [stopped])

  return <>{formatDuration(stopped ?? now - from)}</>
}

function SetRow({
  set,
  index,
  prev,
  onToggle,
  onDelete,
}: {
  set: ExerciseSet
  index: number
  prev?: ExerciseSet
  onToggle: () => void
  onDelete: () => void
}) {
  const [weight, setWeight] = useState(set.weight_kg?.toString() ?? '')
  const [reps, setReps] = useState(set.reps_completed?.toString() ?? '')

  useEffect(() => {
    setWeight(set.weight_kg?.toString() ?? '')
    setReps(set.reps_completed?.toString() ?? '')
  }, [set.weight_kg, set.reps_completed])

  const commitWeight = (v: string) => {
    const n = parseFloat(v.replace(',', '.'))
    void updateSet(set.id, { weight_kg: Number.isFinite(n) ? n : undefined })
  }
  const commitReps = (v: string) => {
    const n = parseInt(v, 10)
    void updateSet(set.id, { reps_completed: Number.isFinite(n) ? n : undefined })
  }

  const oneRm =
    set.is_done && set.weight_kg && set.reps_completed
      ? estimate1RM(set.weight_kg, set.reps_completed)
      : 0

  return (
    <>
      <div className={`set-grid${set.is_done ? ' done' : ''}`}>
        <button
          className="num"
          onDoubleClick={onDelete}
          title="Двойной клик — удалить подход"
          style={{ background: 'none' }}
        >
          {index + 1}
        </button>
        <input
          className="cell-input"
          type="text"
          inputMode="decimal"
          placeholder={prev?.weight_kg != null ? formatWeight(prev.weight_kg) : '—'}
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          onBlur={(e) => commitWeight(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
        />
        <input
          className="cell-input"
          type="text"
          inputMode="numeric"
          placeholder={prev?.reps_completed != null ? String(prev.reps_completed) : '—'}
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          onBlur={(e) => commitReps(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
        />
        <button
          className={`check${set.is_done ? ' on' : ''}`}
          onClick={() => {
            commitWeight(weight)
            commitReps(reps)
            onToggle()
          }}
          aria-label="Подход выполнен"
        >
          <IconCheck size={18} />
        </button>
        {(set.is_pr === 1 || oneRm > 0) && (
          <div className="prev-hint">
            {set.is_pr === 1 && (
              <span className="badge pr">
                <IconRecord size={11} />
                Личный рекорд
              </span>
            )}
            {oneRm > 0 && (
              <span style={{ marginLeft: set.is_pr ? 8 : 0 }}>1ПМ ≈ {oneRm} кг</span>
            )}
          </div>
        )}
      </div>
    </>
  )
}

/** Время отдыха берём из шаблона, если тренировка запущена по программе. */
async function restForExercise(exerciseId: string, routineId?: string): Promise<number | null> {
  if (!routineId) return null
  const item = await db.templateItems
    .where('routine_id')
    .equals(routineId)
    .and((i) => i.exercise_id === exerciseId)
    .first()
  return item?.rest_seconds ?? null
}
