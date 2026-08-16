import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db,
  currentUserId,
  type Exercise,
  type WorkoutRoutine,
  type WorkoutTemplateItem,
} from '../db/db'
import { useExercises } from '../db/catalog'
import {
  addTemplateItem,
  createRoutine,
  deleteTemplateItem,
  reorderTemplateItems,
  startSessionFromRoutine,
} from '../db/repo'
import { activeAssignmentFor, cancelMyPlan, planProgramMyself } from '../db/coach'
import {
  IconBack,
  IconChart,
  IconChevronRight,
  IconGrip,
  IconInfo,
  IconPencil,
  IconPlay,
  IconPlus,
  IconTrash,
} from '../components/Icons'
import { ExercisePicker } from '../components/ExercisePicker'
import { ExerciseTechniqueSheet } from '../components/ExerciseTechnique'
import { ExerciseStatsSheet } from '../components/ExerciseStatsSheet'
import { CoachHint } from '../components/CoachHint'
import { ExerciseBrief } from '../components/ExerciseBrief'
import { Sheet } from '../components/Sheet'
import { useApp } from '../store/app'
import { haptics } from '../lib/native'
import { plural } from '../lib/calc'
import { t } from '../lib/i18n'
import { exName } from '../lib/exerciseNames'

const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

export function ProgramDetail() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { toast } = useApp()
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const [techniqueFor, setTechniqueFor] = useState<string | null>(null)
  const [statsFor, setStatsFor] = useState<Exercise | null>(null)
  const [planOpen, setPlanOpen] = useState(false)
  /** Упражнение, к которому тренер сейчас пишет комментарий. */
  const [noteFor, setNoteFor] = useState<WorkoutTemplateItem | null>(null)

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

  /*
   * Недельный объём по группам мышц — сумма подходов всех дней программы.
   *
   * Считается прямо здесь, из тех же строк, которые тренер сейчас правит:
   * добавил упражнение — цифра сдвинулась. Смысл именно в этом. Свести
   * объём после того, как программа собрана, можно и в голове, но тогда
   * перекос обнаруживается, когда переделывать уже лень.
   *
   * Неделя считается как «каждый день программы по разу»: расписание
   * задаётся при назначении клиенту, а до него у программы есть только
   * состав. Если день поставят дважды, объём удвоится — но это уже про
   * назначение, а не про программу.
   */
  const volume = useMemo(() => {
    const exMap = new Map((exercises ?? []).map((e) => [e.id, e]))
    const dayIds = new Set((routines ?? []).map((r) => r.id))
    const byGroup = new Map<string, number>()

    for (const item of items ?? []) {
      if (!dayIds.has(item.routine_id)) continue
      const group = exMap.get(item.exercise_id)?.muscle_group
      if (!group) continue
      byGroup.set(group, (byGroup.get(group) ?? 0) + item.target_sets)
    }

    return [...byGroup.entries()]
      .map(([group, sets]) => ({ group, sets }))
      .sort((a, b) => b.sets - a.sets)
  }, [items, routines, exercises])

  const volumeTotal = volume.reduce((a, v) => a + v.sets, 0)

  if (!program) return <div className="screen">{t('Загрузка…')}</div>

  const editable = program.author_id === currentUserId()
  // Планирует человек себе, поэтому чужую персональную программу — ту, что
  // тренер собрал для клиента, — в план не предлагаем.
  const forSomeoneElse = !!program.client_id && program.client_id !== currentUserId()
  const lockedByTrainer = !!plan && !plan.isSelfPlan
  const myPlan = plan?.isSelfPlan && plan.program.id === id ? plan : null
  const plannedDays = myPlan?.assignment.schedule
    ? [...myPlan.assignment.schedule]
        .sort((a, b) => a.weekday - b.weekday)
        .map((s) => t(WEEKDAYS[s.weekday]))
    : []
  const exMap = new Map((exercises ?? []).map((e) => [e.id, e]))

  const patchItem = (itemId: string, patch: Partial<WorkoutTemplateItem>) =>
    db.templateItems.update(itemId, { ...patch, updated_at: Date.now() })

  return (
    <div className="screen">
      <div className="header">
        <button className="icon-btn" onClick={() => nav(-1)} aria-label={t('Назад')}>
          <IconBack size={18} />
        </button>
        <div className="grow">
          <h1 className="detail">{t(program.name)}</h1>
          <div className="sub">
            {program.goal} · {program.level}
            {!editable && ` · ${t('программа платформы')}`}
          </div>
        </div>
      </div>

      {/* Персональная программа собирается из карточки клиента — держим
          обратный путь на виду, иначе тренер теряет контекст. */}
      {program.client_id && (
        <div className="card" style={{ borderColor: 'var(--accent)' }}>
          <div className="row between">
            <div className="grow">
              <div className="mute-sm">{t('Программа для клиента')}</div>
              <div className="strong" style={{ marginTop: 2 }}>
                {clientName ?? '—'}
              </div>
            </div>
            <button
              className="btn sm"
              onClick={() => nav(`/trainer/clients/${program.client_id}`)}
            >
              {t('К клиенту')}
            </button>
          </div>
        </div>
      )}

      {program.description && !program.client_id && (
        <div className="card muted">{t(program.description)}</div>
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
              <div className="strong">{myPlan ? t('В моём плане') : t('Мой план')}</div>
              <div className="mute-sm" style={{ marginTop: 3 }}>
                {lockedByTrainer
                  ? `${t('Сейчас действует программа от тренера')}${plan?.trainer ? ` · ${plan.trainer.name}` : ''}`
                  : plannedDays.length
                    ? `${plannedDays.join(', ')} · ${plannedDays.length} ${plural(
                        plannedDays.length,
                        ['тренировка', 'тренировки', 'тренировок'],
                      )} ${t('в неделю')}`
                    : t('Разложите дни по дням недели — они появятся в календаре на главной')}
              </div>
            </div>
            {!lockedByTrainer && (
              <button className="btn sm" onClick={() => setPlanOpen(true)}>
                {myPlan ? t('Изменить') : t('В план')}
              </button>
            )}
          </div>

          {myPlan && (
            <div className="weekday-row mt-4">
              {WEEKDAYS.map((rawLabel, wd) => {
                const label = t(rawLabel)
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

      {(routines ?? []).map((routine) => (
        <RoutineDay
          key={routine.id}
          routine={routine}
          items={(items ?? [])
            .filter((i) => i.routine_id === routine.id)
            .sort((a, b) => a.sequence_order - b.sequence_order)}
          exMap={exMap}
          editable={editable}
          onStart={async () => {
            haptics.impact()
            const sid = await startSessionFromRoutine(routine.id)
            if (!sid) {
              toast(t('В этом дне пока нет упражнений'))
              return
            }
            nav(`/session/${sid}`)
          }}
          onTechnique={setTechniqueFor}
          onStats={setStatsFor}
          onNote={setNoteFor}
          onAdd={() => setPickerFor(routine.id)}
          patchItem={patchItem}
        />
      ))}

      {editable && (
        <button
          className="btn block mt-4"
          onClick={async () => {
            const count = (routines ?? []).length
            await createRoutine(id, `${t('День')} ${count + 1}`)
            toast(t('День добавлен'))
          }}
        >
          <IconPlus size={17} /> {t('Добавить день')}
        </button>
      )}

      {volume.length > 0 && (
        <>
          <div className="section-title">{t('Объём за неделю')}</div>
          <div className="card">
            <div className="mute-sm mb-3">
              {t(
                'Подходы по всем дням программы. Пересчитывается на месте — видно, куда перекосило, пока программу ещё собирают.',
              )}
            </div>
            <div className="stack">
              {volume.map((v) => (
                <div key={v.group}>
                  <div className="row between mb-1">
                    <span className="muted truncate">{v.group}</span>
                    <span className="mute-sm figures" style={{ flex: '0 0 auto' }}>
                      {v.sets} {plural(v.sets, ['подход', 'подхода', 'подходов'])}
                    </span>
                  </div>
                  <div className="bar">
                    {/* Доля от самой нагруженной группы, а не от общего числа:
                        сравнивают группы между собой, и полоска в три
                        процента ничего не показывает. */}
                    <i style={{ width: `${(v.sets / volume[0].sets) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="row between mt-4">
              <span className="mute-sm">{t('Всего за неделю')}</span>
              <span className="figures strong">
                {volumeTotal} {plural(volumeTotal, ['подход', 'подхода', 'подходов'])}
              </span>
            </div>
          </div>
        </>
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

      <ExerciseStatsSheet
        exerciseId={statsFor?.id ?? null}
        name={statsFor?.name}
        onClose={() => setStatsFor(null)}
      />

      <ExercisePicker
        open={!!pickerFor}
        onClose={() => setPickerFor(null)}
        onPick={(ex) => {
          if (pickerFor) void addTemplateItem(pickerFor, ex.id)
        }}
      />

      <NoteSheet
        item={noteFor}
        name={noteFor ? exName(exMap.get(noteFor.exercise_id)?.name) : ''}
        onClose={() => setNoteFor(null)}
        onSave={(text) => noteFor && patchItem(noteFor.id, { note: text })}
      />
    </div>
  )
}

/**
 * Один тренировочный день: упражнения по порядку, с перестановкой.
 *
 * Вынесен из экрана, потому что порядок — состояние дня, а не программы:
 * тащат внутри одного дня, и хранить наполовину переставленный список в
 * общем месте значит смешивать два независимых перетаскивания в одно.
 */
function RoutineDay({
  routine,
  items,
  exMap,
  editable,
  onStart,
  onTechnique,
  onStats,
  onNote,
  onAdd,
  patchItem,
}: {
  routine: WorkoutRoutine
  items: WorkoutTemplateItem[]
  exMap: Map<string, Exercise>
  editable: boolean
  onStart: () => void
  onTechnique: (exerciseId: string) => void
  onStats: (ex: Exercise) => void
  onNote: (item: WorkoutTemplateItem) => void
  onAdd: () => void
  patchItem: (itemId: string, patch: Partial<WorkoutTemplateItem>) => unknown
}) {
  const { toast } = useApp()

  /**
   * Порядок, пока его держит палец. Снимается сразу после записи в базу:
   * держать свой список дольше значит прятать порядок, приехавший обменом,
   * — а узнать об этом было бы неоткуда.
   */
  const [order, setOrder] = useState<string[] | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [shift, setShift] = useState(0)

  /**
   * Жест целиком — в ссылке, а не в состоянии.
   *
   * События указателя приходят чаще, чем React успевает перерисоваться, и
   * обработчик, читающий состояние прошлого кадра, переставляет строки по
   * устаревшим индексам: упражнение прыгает назад, а в базу уезжает порядок,
   * которого человек не видел. Здесь же лежит и номер указателя — второй
   * палец, коснувшийся соседней ручки, иначе перехватывал бы жест на себя, и
   * движения первого двигали бы чужую строку.
   */
  const drag = useRef<{ id: string; pointerId: number } | null>(null)
  const live = useRef<string[]>([])
  /** Откуда считаем смещение. Обнуляется при каждой перестановке. */
  const originY = useRef(0)
  const shifted = useRef(0)
  const rows = useRef(new Map<string, HTMLElement>())
  const listRef = useRef<HTMLDivElement | null>(null)

  const ordered = useMemo(() => {
    if (!order) return items
    const byId = new Map(items.map((i) => [i.id, i]))
    const list = order.map((id) => byId.get(id)).filter((i): i is WorkoutTemplateItem => !!i)
    // Состав изменился под рукой — упражнение добавили или удалили с другого
    // устройства. Свой порядок больше не про эти строки, слушаем базу.
    return list.length === items.length ? list : items
  }, [order, items])

  const reset = () => {
    drag.current = null
    shifted.current = 0
    setDragId(null)
    setShift(0)
    setOrder(null)
  }

  const move = (v: number) => {
    shifted.current = v
    setShift(v)
  }

  // Строку могли удалить прямо во время жеста — тогда ни pointerup, ни
  // pointercancel до нас не дойдут: обработчики уехали вместе с разметкой.
  // Без этого возврата день навсегда остался бы со своим порядком.
  useEffect(() => {
    if (dragId && !items.some((i) => i.id === dragId)) reset()
  }, [items, dragId])

  /** Не даём строке уехать за пределы дня — под таббар или на чужую карточку. */
  const clamp = (raw: number): number => {
    const id = drag.current?.id
    const el = id ? rows.current.get(id) : null
    const box = listRef.current
    if (!el || !box) return raw
    const r = el.getBoundingClientRect()
    const b = box.getBoundingClientRect()
    // getBoundingClientRect уже со сдвигом — вычитаем его, чтобы получить
    // место, где строка стоит на самом деле.
    const top = r.top - shifted.current
    const bottom = r.bottom - shifted.current
    return Math.max(b.top - top, Math.min(b.bottom - bottom, raw))
  }

  /**
   * Над каким упражнением палец. Меряем сами, а не спрашиваем
   * `elementFromPoint`: перетаскиваемая строка закрывает собой то, что под
   * ней, и её пришлось бы выключать из попадания — а она же и держит захват
   * указателя.
   *
   * Меняемся местами по середине соседа, а не по касанию края: у порога в
   * край строка дрожала бы между двумя местами всю дорогу.
   */
  const targetAt = (y: number, dragged: string): string | null => {
    const list = live.current
    const from = list.indexOf(dragged)
    if (from < 0) return null

    let best: { id: string; to: number } | null = null
    for (const [id, el] of rows.current) {
      if (id === dragged) continue
      const to = list.indexOf(id)
      if (to < 0) continue
      const r = el.getBoundingClientRect()
      const middle = r.top + r.height / 2
      if (!(to > from ? y > middle : y < middle)) continue
      // Палец мог перескочить через несколько строк разом — берём дальнюю
      // из пройденных, иначе за рывок переставится только одна.
      if (!best || Math.abs(to - from) > Math.abs(best.to - from)) best = { id, to }
    }
    return best?.id ?? null
  }

  /** Записать порядок, если он и правда изменился. */
  const commit = async (next: string[]) => {
    const current = items.map((i) => i.id)
    const sameSet = next.length === current.length && next.every((id) => current.includes(id))
    // Просто коснулись ручки — в базу не лезем: перенумерация поднимает метку
    // правки всем строкам дня, и при обмене они победили бы чужую правку
    // только потому, что записаны позже.
    if (!sameSet || next.join() === current.join()) {
      setOrder(null)
      return
    }
    try {
      await reorderTemplateItems(next)
    } catch {
      // Молчать здесь нельзя: экран показывает один порядок, база хранит
      // другой, и увидеть это можно только с третьего устройства.
      toast(t('Не удалось сохранить порядок — попробуйте ещё раз'))
    } finally {
      setOrder(null)
    }
  }

  const startDrag = (e: ReactPointerEvent<HTMLElement>, id: string) => {
    if (drag.current) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { id, pointerId: e.pointerId }
    live.current = ordered.map((i) => i.id)
    originY.current = e.clientY
    setOrder(live.current)
    setDragId(id)
    move(0)
    haptics.selection()
  }

  const moveDrag = (e: ReactPointerEvent<HTMLElement>) => {
    const state = drag.current
    if (!state || state.pointerId !== e.pointerId) return
    move(clamp(e.clientY - originY.current))

    const overId = targetAt(e.clientY, state.id)
    if (!overId) return

    const list = [...live.current]
    const from = list.indexOf(state.id)
    const to = list.indexOf(overId)
    if (from < 0 || to < 0) return
    list.splice(to, 0, ...list.splice(from, 1))
    live.current = list
    setOrder(list)

    // Строка встала на новое место прямо под пальцем — смещение считаем
    // заново, иначе она уехала бы от него на высоту соседа.
    originY.current = e.clientY
    move(0)
    haptics.selection()
  }

  const endDrag = async (e: ReactPointerEvent<HTMLElement>) => {
    const state = drag.current
    if (!state || state.pointerId !== e.pointerId) return
    drag.current = null
    shifted.current = 0
    setDragId(null)
    setShift(0)
    await commit(live.current)
  }

  /**
   * Перестановка с клавиатуры — стрелками на ручке.
   *
   * Не только ради доступности: страница во время жеста не прокручивается
   * (иначе палец таскал бы её вместе с упражнением), и в дне, который не
   * помещается на экран, перенести первое упражнение в конец одним движением
   * нельзя в принципе. Стрелками — можно.
   */
  const nudge = async (id: string, delta: number) => {
    const list = ordered.map((i) => i.id)
    const from = list.indexOf(id)
    const to = from + delta
    if (from < 0 || to < 0 || to >= list.length) return
    list.splice(to, 0, ...list.splice(from, 1))
    live.current = list
    setOrder(list)
    haptics.selection()
    await commit(list)
  }

  return (
    <div className="mt-4">
      <div className="row between mb-2">
        <div className="strong">{t(routine.name)}</div>
        <button className="btn sm primary" onClick={onStart}>
          <IconPlay size={13} /> {t('Начать')}
        </button>
      </div>

      <div className="card day-card" ref={listRef}>
        {ordered.length === 0 && <div className="mute-sm day-empty">{t('Пока пусто')}</div>}
        {ordered.map((item, idx) => {
          const ex = exMap.get(item.exercise_id)
          const dragging = dragId === item.id
          return (
            <div
              key={item.id}
              className={`ex-row${dragging ? ' dragging' : ''}`}
              style={dragging ? { transform: `translateY(${shift}px)` } : undefined}
              ref={(el) => {
                if (el) rows.current.set(item.id, el)
                else rows.current.delete(item.id)
              }}
            >
              <div className="row between">
                {/* Ручка перетаскивания слева: за неё берут, чтобы обычное
                    касание строки по-прежнему открывало технику, а не
                    начинало перестановку. */}
                {editable && (
                  <button
                    className="icon-btn drag-handle"
                    aria-label={`${t('Переставить')}: ${exName(ex?.name) || t('Упражнение')}`}
                    title={t('Тяните или меняйте порядок стрелками')}
                    onPointerDown={(e) => startDrag(e, item.id)}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    onKeyDown={(e) => {
                      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
                      e.preventDefault()
                      void nudge(item.id, e.key === 'ArrowUp' ? -1 : 1)
                    }}
                  >
                    <IconGrip size={16} />
                  </button>
                )}

                {/* Номер упражнения. Тренер и клиент говорят «третье в дне»,
                    а не «то, что после тяги», — до нумерации это приходилось
                    каждый раз пересчитывать глазами. */}
                <span className="ex-num mute-sm figures">{idx + 1}</span>

                {/* Строка ведёт к технике: без неё клиент видит название
                    и не понимает, как упражнение делать. */}
                <button className="row grow ex-name" onClick={() => ex && onTechnique(ex.id)}>
                  {ex?.image_url ? (
                    <img src={ex.image_url} alt="" className="ex-thumb" loading="lazy" />
                  ) : (
                    <span className="ex-thumb placeholder" />
                  )}
                  <span className="grow">
                    <span className="truncate" style={{ display: 'block' }}>
                      {exName(ex?.name) || t('Упражнение')}
                    </span>
                    <span className="mute-sm">
                      {t(ex?.muscle_group ?? '')} · {t('как делать')}
                    </span>
                  </span>
                  <span className="chevron">
                    <IconChevronRight size={16} />
                  </span>
                </button>

                {/* Техника нужна обоим: программу открывают до зала, чтобы
                    понять, что предстоит. А вот статистика по подходам —
                    только тому, кто по программе занимается: она считает
                    подходы того, кто смотрит, и тренеру, собирающему
                    программу клиенту, показала бы его собственные. Заодно
                    это возвращает строке ширину, которую забрали ручка и
                    номер: на 360 пикселях кнопок в ряд помещается четыре. */}
                {ex && (
                  <button
                    className="icon-btn"
                    onClick={() => onTechnique(ex.id)}
                    aria-label={`${t('Как делать')}: ${exName(ex.name)}`}
                    title={t('Как делать')}
                  >
                    <IconInfo size={17} />
                  </button>
                )}
                {ex && !editable && (
                  <button
                    className="icon-btn"
                    onClick={() => onStats(ex)}
                    aria-label={`${t('Статистика')}: ${exName(ex.name)}`}
                    title={t('Статистика по подходам')}
                  >
                    <IconChart size={17} />
                  </button>
                )}
                {editable && (
                  <button
                    className="icon-btn"
                    onClick={() => void deleteTemplateItem(item.id)}
                    aria-label={`${t('Удалить')}: ${exName(ex?.name) || t('Упражнение')}`}
                  >
                    <IconTrash size={16} />
                  </button>
                )}
              </div>

              {/* Слово тренера об этом упражнении в этой программе. Стоит
                  выше цифр: указание вроде «пауза внизу» меняет то, как
                  человек будет делать подход, а не то, сколько их. Отступы
                  те же, что у разбора ниже (`inset`), — два блока слов
                  тренера подряд обязаны стоять по одной линии. */}
              {item.note && <div className="quote inset mt-2">{item.note}</div>}

              {/* История и разбор — только у того, кто по программе
                  занимается. Тренеру, который её правит, показывать нечего:
                  клиента здесь нет, а его собственные подходы к чужой
                  программе отношения не имеют. */}
              {!editable && ex && (
                <>
                  <CoachHint exerciseId={ex.id} />
                  <ExerciseBrief exerciseId={ex.id} />
                </>
              )}

              {/* Три поля в строке на узком экране становятся по
                  восемьдесят пикселей, а с верхней границей их четыре.
                  Поэтому отдых уехал во вторую строку: он меняется
                  реже всех, и терять на нём ширину обиднее всего. */}
              <div className="row num-row mt-2">
                <NumField
                  label={t('подходы')}
                  value={item.target_sets}
                  disabled={!editable}
                  onChange={(v) => patchItem(item.id, { target_sets: v })}
                />
                <NumField
                  label={t('повторы от')}
                  value={item.target_reps ?? 0}
                  disabled={!editable}
                  onChange={(v) =>
                    patchItem(item.id, {
                      target_reps: v,
                      // Верх ниже низа — не диапазон, а опечатка.
                      // Подтягиваем его, а не запрещаем ввод.
                      ...(item.target_reps_max != null && item.target_reps_max < v
                        ? { target_reps_max: v }
                        : {}),
                    })
                  }
                />
                <NumField
                  label={t('до')}
                  value={item.target_reps_max ?? item.target_reps ?? 0}
                  min={item.target_reps ?? 0}
                  disabled={!editable}
                  onChange={(v) =>
                    patchItem(item.id, {
                      // Верх, равный низу, это не диапазон — стираем,
                      // чтобы не показывать клиенту «10-10».
                      target_reps_max: v > (item.target_reps ?? 0) ? v : undefined,
                    })
                  }
                />
              </div>
              <div className="row num-row mt-2">
                <NumField
                  label={t('отдых, сек')}
                  value={item.rest_seconds}
                  step={15}
                  disabled={!editable}
                  onChange={(v) => patchItem(item.id, { rest_seconds: v })}
                />
                {editable && (
                  <button className="btn sm" onClick={() => onNote(item)}>
                    <IconPencil size={14} />{' '}
                    {item.note ? t('Изменить комментарий') : t('Добавить комментарий')}
                  </button>
                )}
              </div>
            </div>
          )
        })}

        {editable && (
          <div className="day-add">
            <button className="btn sm block" onClick={onAdd}>
              <IconPlus size={15} /> {t('Добавить упражнение')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Комментарий тренера к упражнению в программе.
 *
 * Шторкой, а не полем в строке: пишут его редко, а место в строке он занимал
 * бы всегда — и на телефоне вытеснил бы цифры, ради которых на экран и
 * заходят. Пустой текст комментарий снимает.
 */
function NoteSheet({
  item,
  name,
  onClose,
  onSave,
}: {
  item: WorkoutTemplateItem | null
  name: string
  onClose: () => void
  onSave: (note: string | undefined) => void
}) {
  const [text, setText] = useState('')

  // Набранное не стираем при закрытии — только при переходе к другому
  // упражнению. Шторка закрывается касанием фона, а на телефоне рядом с
  // клавиатурой в него попадают часто; терять из-за этого написанное нельзя.
  useEffect(() => {
    if (item) setText(item.note ?? '')
  }, [item?.id])

  return (
    <Sheet open={!!item} title={name || t('Комментарий к упражнению')} onClose={onClose}>
      <div className="stack">
        <div className="field">
          <label>{t('Что важно в этом упражнении')}</label>
          <textarea
            className="textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('Например: пауза внизу секунду, последний подход до отказа')}
          />
          <div className="mute-sm mt-1">
            {t('Клиент увидит это в программе и на тренировке, у самого упражнения.')}
          </div>
        </div>
        <button
          className="btn primary block"
          onClick={() => {
            onSave(text.trim() || undefined)
            onClose()
          }}
        >
          {t('Сохранить')}
        </button>
      </div>
    </Sheet>
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
      toast(t('План сохранён — дни появятся в календаре'))
      onClose()
    } catch (e) {
      toast(e instanceof Error ? t(e.message) : t('Не удалось сохранить план'))
    } finally {
      setBusy(false)
    }
  }

  const drop = async () => {
    setBusy(true)
    try {
      await cancelMyPlan()
      toast(t('План снят'))
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} title={t('Запланировать программу')} onClose={onClose}>
      <div className="stack">
        <div className="field">
          <label>{t('Дни недели')}</label>
          <div className="weekday-row">
            {WEEKDAYS.map((rawLabel, wd) => {
              const label = t(rawLabel)
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
          <div className="mute-sm mt-2">
            {schedule.length
              ? `${schedule.length} ${plural(schedule.length, ['тренировка', 'тренировки', 'тренировок'])} ${t('в неделю')}`
              : t('Выберите хотя бы один день')}
          </div>
        </div>

        {days.length > 0 && (
          <div className="group">
            {days.map((r, i) => (
              <div className="group-row" key={r.id}>
                <span className="metric-icon" style={{ color: 'var(--accent-ink)' }}>
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="grow title">{t(r.name)}</span>
                <span className="value">
                  {WEEKDAYS.filter((_, wd) => slots[wd] === r.id)
                    .map(t)
                    .join(', ') || t('не назначен')}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="field">
          <label>{t('Сколько недель')}</label>
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
          {t('Запланировать на')} {weeks} {plural(weeks, ['неделю', 'недели', 'недель'])}
        </button>

        {current?.length ? (
          <button className="btn block" disabled={busy} onClick={drop}>
            {t('Убрать из плана')}
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
  min = 0,
  disabled,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
  /** Нижняя граница — у верхнего конца диапазона это его нижний конец. */
  min?: number
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
            onChange(Math.max(min, value - step))
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
