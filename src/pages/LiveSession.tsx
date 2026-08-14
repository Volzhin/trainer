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
import {
  estimate1RM,
  formatDuration,
  formatReps,
  formatWeight,
  plural,
  totalVolume,
} from '../lib/calc'
import {
  IconBack,
  IconChart,
  IconCheck,
  IconInfo,
  IconPlus,
  IconRecord,
  IconSwap,
  IconTrash,
} from '../components/Icons'
import { ExercisePicker } from '../components/ExercisePicker'
import { ExerciseTechniqueSheet } from '../components/ExerciseTechnique'
import { VideoUploader } from '../components/ExerciseVideo'
import { CoachHint } from '../components/CoachHint'
import { ExerciseBrief } from '../components/ExerciseBrief'
import { ExerciseStatsSheet } from '../components/ExerciseStatsSheet'
import { postponeWorkoutReport, submitWorkoutReport } from '../db/reports'
import { attachmentsForSession, trainerOfClient } from '../db/coach'
import { Sheet } from '../components/Sheet'
import { useApp, useClientMode, useProfile } from '../store/app'
import { ensureNotificationPermission, haptics } from '../lib/native'
import { t } from '../lib/i18n'
import { exName } from '../lib/exerciseNames'

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
  const [statsFor, setStatsFor] = useState<Exercise | null>(null)
  const [finishOpen, setFinishOpen] = useState(false)
  const [notes, setNotes] = useState('')
  /**
   * Длительность, замороженная в момент нажатия «Завершить». Секундомер
   * останавливается там, а не когда человек закончит возиться с видео: иначе
   * разбор роликов на десять минут припишется к длительности тренировки.
   */
  const [frozenElapsed, setFrozenElapsed] = useState<number | null>(null)
  const [askedNotify, setAskedNotify] = useState(false)
  const [reportBusy, setReportBusy] = useState(false)

  const session = useLiveQuery(() => db.sessions.get(id), [id])
  // Кнопку съёмки показываем только на онлайн-сопровождении: без тренера
  // видео некому смотреть, а на очной работе технику он видит сам —
  // просить запись значит просить лишнее.
  const videoReport = useClientMode() === 'online'
  // Сколько роликов уже приложено: «сдать видео-отчёт» без единого видео —
  // не видео-отчёт, и кнопка не должна делать вид, что он собран.
  const attachedCount = useLiveQuery(
    async () => (await attachmentsForSession(id)).length,
    [id],
    0,
  )
  const hasTrainer = !!useLiveQuery(() => trainerOfClient(), [])
  const sets = useLiveQuery(
    () => db.sets.where('workout_session_id').equals(id).toArray(),
    [id],
    [] as ExerciseSet[],
  )
  const exercises = useExercises()

  /*
   * Цель по подходам и повторам из программы. Клиент её раньше не видел
   * вовсе: тренер задавал «3 по 8-12», а у снаряда стояли пустые поля, и
   * коридор оставался в голове у одного из двоих.
   */
  const targets = useLiveQuery(async () => {
    if (!session?.routine_id) return new Map<string, string>()
    const items = await db.templateItems
      .where('routine_id')
      .equals(session.routine_id)
      .toArray()
    return new Map(
      items.map((i) => {
        const reps = formatReps(i.target_reps, i.target_reps_max)
        return [i.exercise_id, reps ? `${i.target_sets} × ${reps}` : `${i.target_sets} ${t('подх.')}`]
      }),
    )
  }, [session?.routine_id])

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
        <div className="empty">{t('Тренировка не найдена')}</div>
        <button className="btn block" onClick={() => nav('/')}>
          {t('На главную')}
        </button>
      </div>
    )
  }

  const onToggleDone = async (set: ExerciseSet, block: Block, entered: EnteredSet) => {
    if (set.is_done) {
      await uncompleteSet(set.id)
      haptics.selection()
      return
    }
    // Введённое в строке главнее того, что успело доехать до пропсы.
    if (!(entered.weightKg ?? set.weight_kg) && !(entered.reps ?? set.reps_completed)) {
      toast(t('Укажите вес или повторения'))
      return
    }

    const { isPR } = await completeSet(set.id)
    if (isPR) {
      haptics.success()
      toast(`${t('Личный рекорд')}: ${exName(block.exercise.name)}!`, 'pr')
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
      next ? exName(block.exercise.name) : undefined,
    )
  }

  /**
   * Отметить всё упражнение разом.
   *
   * Если хоть один подход не отмечен — отмечаем оставшиеся; если отмечены
   * все — снимаем. Так одна кнопка делает то, чего от неё ждут в обоих
   * состояниях, и не требует догадываться, что она сделает.
   *
   * Пустые подходы пропускаем: «сделано» там, где не введено ни веса, ни
   * повторов, — запись о том, чего не было. Отдых после общей отметки не
   * запускаем: её жмут, когда упражнение уже закончено.
   */
  const onToggleBlock = async (block: Block) => {
    const allDone = block.sets.every((x) => x.is_done)
    if (allDone) {
      for (const set of block.sets) await uncompleteSet(set.id)
      haptics.selection()
      return
    }

    let marked = 0
    let prs = 0
    for (const set of block.sets) {
      if (set.is_done) continue
      if (!set.weight_kg && !set.reps_completed) continue
      const { isPR } = await completeSet(set.id)
      if (isPR) prs++
      marked++
    }

    if (!marked) {
      toast(t('Нечего отмечать: подходы пустые'))
      return
    }
    if (prs) {
      haptics.success()
      toast(`${t('Личный рекорд')}: ${exName(block.exercise.name)}!`, 'pr')
    } else {
      haptics.impact()
    }
  }

  const onFinish = async () => {
    const saved = await finishSession(id, notes.trim() || undefined)
    stopRest()
    haptics.success()
    toast(saved ? t('Тренировка завершена') : t('Тренировка отменена — ни одного подхода'))
    nav('/', { replace: true })
  }

  /**
   * Сдать отчёт прямо из шторки завершения.
   *
   * Ролики к этому моменту уже разложены по упражнениям выше: отдельного
   * шага «приложить видео» нет — есть решение, сдавать ли с ними.
   */
  const finishAndSubmit = async () => {
    setReportBusy(true)
    try {
      await finishSession(id, notes.trim() || undefined)
      await submitWorkoutReport(id)
      stopRest()
      haptics.success()
      toast(t('Отчёт отправлен тренеру'))
      nav('/', { replace: true })
    } finally {
      setReportBusy(false)
    }
  }

  /**
   * Отложить сдачу. Тренировка сохраняется и ждёт в «Отчётах», а через
   * четыре часа приложение напомнит о ней при следующем открытии.
   */
  const finishAndPostpone = async () => {
    setReportBusy(true)
    try {
      await finishSession(id, notes.trim() || undefined)
      await postponeWorkoutReport(id)
      stopRest()
      haptics.success()
      toast(t('Тренировка сохранена — отчёт ждёт в «Отчётах»'))
      nav('/', { replace: true })
    } finally {
      setReportBusy(false)
    }
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
          <button className="icon-btn" onClick={() => nav(-1)} aria-label={t('Назад')}>
            <IconBack size={18} />
          </button>
          <div style={{ textAlign: 'center' }} className="grow">
            <div className="truncate strong">
              {t(session.title)}
            </div>
            <div className="mute-sm">
              <Stopwatch from={session.start_time} stopped={frozenElapsed} /> · {doneCount}{' '}
              {plural(doneCount, ['подход', 'подхода', 'подходов'])} · {Math.round(volume)} {t('кг')}
            </div>
          </div>
          <button
            className="btn success sm"
            onClick={() => {
              setFrozenElapsed(Date.now() - session.start_time)
              setFinishOpen(true)
            }}
          >
            {t('Завершить')}
          </button>
        </div>
      </div>

      <div className="mt-4">
        {blocks.length === 0 && (
          <div className="empty">
            <div className="big">
              <IconPlus size={34} />
            </div>
            {t('Добавьте первое упражнение')}
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
                    {exName(block.exercise.name)}
                  </span>
                  <span className="mute-sm">
                    {/* Цель важнее истории: по ней человек решает, сколько
                        делать сейчас. Прошлый раз подсказывает вес и потому
                        идёт следом, а не вместо. */}
                    {targets?.get(block.exercise.id) && (
                      <span style={{ color: 'var(--accent-ink)' }}>
                        {t('цель')} {targets.get(block.exercise.id)}
                      </span>
                    )}
                    {targets?.get(block.exercise.id) && block.prev.length > 0 && ' · '}
                    {block.prev.length > 0
                      ? `${t('прошлый раз')} ${formatWeight(block.prev[0].weight_kg)} ${t('кг')} × ${
                          block.prev[0].reps_completed ?? '—'
                        }`
                      : !targets?.get(block.exercise.id) && t('как делать')}
                  </span>
                </span>
              </button>
              <button
                className="icon-btn"
                onClick={() => setTechniqueFor(block.exercise.id)}
                aria-label={`${t('Техника')}: ${exName(block.exercise.name)}`}
                title={t('Как делать')}
              >
                <IconInfo size={17} />
              </button>
              <button
                className="icon-btn"
                onClick={() => setStatsFor(block.exercise)}
                aria-label={`${t('Статистика')}: ${exName(block.exercise.name)}`}
                title={t('Статистика по подходам')}
              >
                <IconChart size={17} />
              </button>
              <button
                className="icon-btn"
                onClick={() => setSwapFor(block)}
                aria-label={t('Заменить упражнение')}
                title={t('Заменить')}
              >
                <IconSwap size={17} />
              </button>
              <button
                className="icon-btn"
                onClick={() => removeExerciseFromSession(id, block.sequence_order)}
                aria-label={t('Убрать упражнение')}
              >
                <IconTrash size={17} />
              </button>
            </div>

            {/* Слово тренера стоит выше таблицы подходов: оно должно попасть
                на глаза до того, как человек наберёт вес, а не после. */}
            <CoachHint exerciseId={block.exercise.id} />

            <ExerciseBrief exerciseId={block.exercise.id} />

            <div className="set-grid head">
              <div className="num">#</div>
              <div style={{ textAlign: 'center' }}>{t('кг')}</div>
              <div style={{ textAlign: 'center' }}>{t('повт.')}</div>
              {/* Общая галочка: отметить всё упражнение разом. Подходы часто
                  делают по плану и отмечают в конце — тыкать в каждую
                  строку по очереди значит повторять одно действие пять раз.
                  Пустые подходы она не трогает: отметить «сделано» там, где
                  не введено ни веса, ни повторов, нечего. */}
              <button
                className={`check sm${block.sets.every((x) => x.is_done) ? ' on' : ''}`}
                aria-label={`${t('Отметить всё')}: ${exName(block.exercise.name)}`}
                onClick={() => void onToggleBlock(block)}
              >
                <IconCheck size={15} />
              </button>
            </div>

            {block.sets.map((s, i) => (
              <SetRow
                key={s.id}
                set={s}
                index={i}
                prev={block.prev[i]}
                onToggle={(entered) => onToggleDone(s, block, entered)}
                onDelete={() => deleteSetRow(s.id)}
              />
            ))}

            <div style={{ padding: '4px 12px 8px' }}>
              <button
                className="btn sm block"
                onClick={() => addSetRow(id, block.exercise.id, block.sequence_order)}
              >
                <IconPlus size={15} /> {t('Добавить подход')}
              </button>
            </div>
            {videoReport && <VideoUploader sessionId={id} exerciseId={block.exercise.id} />}
          </div>
        ))}

        <button
          className="btn block mt-3"
          onClick={() => setPickerOpen(true)}
        >
          <IconPlus size={17} /> {t('Добавить упражнение')}
        </button>

      </div>

      <ExerciseTechniqueSheet exerciseId={techniqueFor} onClose={() => setTechniqueFor(null)} />

      <ExerciseStatsSheet
        exerciseId={statsFor?.id ?? null}
        name={statsFor?.name}
        onClose={() => setStatsFor(null)}
      />

      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(ex) => addExerciseToSession(id, ex.id)}
      />

      <ExercisePicker
        open={!!swapFor}
        title={t('Заменить упражнение')}
        preferMuscle={swapFor?.exercise.muscle_group}
        onClose={() => setSwapFor(null)}
        onPick={(ex) => {
          if (swapFor) void swapExercise(id, swapFor.sequence_order, ex.id)
          toast(t('Упражнение заменено'))
        }}
      />

      <Sheet
        open={finishOpen}
        title={t('Завершить тренировку')}
        onClose={() => {
          setFinishOpen(false)
          setFrozenElapsed(null)
        }}
      >
        <div className="stat-grid mb-4">
          <div className="stat">
            <div className="value">{formatDuration(frozenElapsed ?? 0)}</div>
            <div className="label">{t('длительность')}</div>
          </div>
          <div className="stat">
            <div className="value">{Math.round(volume)} {t('кг')}</div>
            <div className="label">{t('тоннаж')}</div>
          </div>
        </div>
        {/* Видеоотчёт собирается здесь, а не по ходу тренировки: снимать и
            тут же прикреплять между подходами некогда. Ролики уже лежат в
            галерее — остаётся разложить их по упражнениям. */}
        {videoReport && doneBlocks.length > 0 && (
          <>
            <div className="field-group-title">{t('Видеоотчёт тренеру')}</div>
            <div className="mute-sm mb-3">
              {t('Необязательно. Можно пропустить и прикрепить позже — тренировка останется в истории.')}
            </div>
            <div className="finish-videos">
              {doneBlocks.map((block) => (
                <div className="finish-video" key={block.exercise.id}>
                  <div className="row between">
                    <span className="title truncate">{exName(block.exercise.name)}</span>
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

        <div className="field" style={{ marginTop: 16, marginBottom: 16 }}>
          <label>{t('Заметка к тренировке')}</label>
          <textarea
            className="textarea"
            placeholder={t('Самочувствие, техника, что поменять в следующий раз')}
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
            {t('Ни один подход не отмечен галочкой — сохранять нечего, и в календаре тренировка не появится. Отметьте выполненные подходы и завершите снова.')}
          </div>
        )}
        {/* У онлайн-клиента завершение и сдача — одно решение, а не два
            подряд: он всё равно сдаёт отчёт, вопрос только в том, с видео,
            без него или позже. Кому сдавать некому, тот просто завершает. */}
        <div className="stack">
          {hasTrainer && doneCount > 0 ? (
            <>
              {/* Видео-отчёт предлагаем только онлайн-клиенту: очному технику
                  тренер видит на занятии, и кнопка «сдать с видео» у него
                  спрашивала бы то, чего никто не ждёт. */}
              {videoReport && (
                <>
                  <button
                    className="btn success block"
                    disabled={reportBusy || attachedCount === 0}
                    onClick={finishAndSubmit}
                  >
                    {t('Сдать видео-отчёт')}
                  </button>
                  {attachedCount === 0 && (
                    <div className="mute-sm" style={{ textAlign: 'center' }}>
                      {t('Прикрепите хотя бы одно видео выше')}
                    </div>
                  )}
                </>
              )}
              <button
                className={`btn block${videoReport ? '' : ' success'}`}
                disabled={reportBusy}
                onClick={finishAndSubmit}
              >
                {videoReport ? t('Сдать без видео') : t('Сдать отчёт')}
              </button>
              <button className="btn block" disabled={reportBusy} onClick={finishAndPostpone}>
                {t('Напомнить позже')}
              </button>
            </>
          ) : (
            <button className="btn success block" onClick={onFinish}>
              {doneCount === 0 ? t('Выйти без сохранения') : t('Завершить тренировку')}
            </button>
          )}
          <button className="btn ghost danger block" onClick={onDiscard}>
            {t('Отменить тренировку')}
          </button>
        </div>
        {doneCount > 0 && (
          <div className="mute-sm" style={{ marginTop: 12, textAlign: 'center' }}>
            {t('Неотмеченные подходы не попадут в статистику.')}
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

/** Что стоит в полях строки прямо сейчас — до того, как это доедет до пропсы. */
type EnteredSet = { weightKg?: number; reps?: number }

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
  onToggle: (entered: EnteredSet) => void
  onDelete: () => void
}) {
  const [weight, setWeight] = useState(set.weight_kg?.toString() ?? '')
  const [reps, setReps] = useState(set.reps_completed?.toString() ?? '')

  useEffect(() => {
    setWeight(set.weight_kg?.toString() ?? '')
    setReps(set.reps_completed?.toString() ?? '')
  }, [set.weight_kg, set.reps_completed])

  const asWeight = (v: string) => {
    const n = parseFloat(v.replace(',', '.'))
    return Number.isFinite(n) ? n : undefined
  }
  const asReps = (v: string) => {
    const n = parseInt(v, 10)
    return Number.isFinite(n) ? n : undefined
  }

  const commitWeight = (v: string) => updateSet(set.id, { weight_kg: asWeight(v) })
  const commitReps = (v: string) => updateSet(set.id, { reps_completed: asReps(v) })

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
          title={t('Двойной клик — удалить подход')}
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
          onClick={async () => {
            // Дожидаемся записи и передаём введённое наверх. Проверка «пусто
            // ли» по пропсе смотрит на прошлый рендер: подход, куда вес и
            // повторы вписали только что, выглядит там незаполненным — и
            // отметить его не давало. По той же причине рекорд считался бы
            // по старым числам.
            await commitWeight(weight)
            await commitReps(reps)
            onToggle({ weightKg: asWeight(weight), reps: asReps(reps) })
          }}
          aria-label={t('Подход выполнен')}
        >
          <IconCheck size={18} />
        </button>
        {(set.is_pr === 1 || oneRm > 0) && (
          <div className="prev-hint">
            {set.is_pr === 1 && (
              <span className="badge pr">
                <IconRecord size={11} />
                {t('Личный рекорд')}
              </span>
            )}
            {oneRm > 0 && (
              <span style={{ marginLeft: set.is_pr ? 8 : 0 }}>{t('1ПМ')} ≈ {oneRm} {t('кг')}</span>
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
