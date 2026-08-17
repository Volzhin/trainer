import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type ExerciseSet, type WorkoutSession } from '../db/db'
import {
  listMySessions,
  repeatSession,
  startSessionFromRoutine,
  startEmptySession,
} from '../db/repo'
import {
  activeAssignmentFor,
  pendingAssignmentFor,
  planQueue,
  plannedDates,
  plannedForDate,
} from '../db/coach'
import { IconChevronRight, IconDumbbell, IconPlay, IconRepeat } from '../components/Icons'
import { Sheet } from './Sheet'
import { formatDuration, plural, startOfDay, totalVolume } from '../lib/calc'
import { haptics } from '../lib/native'
import { useApp } from '../store/app'
import { locale, t } from '../lib/i18n'

const WEEK_DAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']
const MONTHS = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
]

const DAY = 86400_000
const mondayOf = (ts: number) => {
  const d = startOfDay(ts)
  return d - ((new Date(d).getDay() + 6) % 7) * DAY
}

/** Насколько далеко нужно увести палец, чтобы это считалось листанием. */
const SWIPE_MIN = 44

/** Сколько длится доводка после отпущенного пальца, мс. Столько же в CSS. */
const SETTLE_MS = 260

/** Даты сетки для режима и опорной даты. */
function gridDays(mode: 'week' | 'month', anchor: number): number[] {
  if (mode === 'week') {
    const start = mondayOf(anchor)
    return Array.from({ length: 7 }, (_, i) => start + i * DAY)
  }
  const d = new Date(anchor)
  const gridStart = mondayOf(new Date(d.getFullYear(), d.getMonth(), 1).getTime())
  /*
   * Месяц всегда шесть строк, даже когда влезает в пять.
   *
   * Раньше число строк считалось по месяцу, и сетка то и дело меняла высоту.
   * Пока месяцы просто сменяли друг друга, это было незаметно; теперь они
   * едут за пальцем бок о бок, и соседи разной высоты дёргали бы всё, что
   * стоит под календарём, на каждом миллиметре движения.
   */
  return Array.from({ length: 42 }, (_, i) => gridStart + i * DAY)
}

/** Соседняя опорная дата: неделей или месяцем назад и вперёд. */
function shiftAnchor(mode: 'week' | 'month', anchor: number, dir: -1 | 1): number {
  if (mode === 'week') return anchor + dir * 7 * DAY
  const d = new Date(anchor)
  return new Date(d.getFullYear(), d.getMonth() + dir, 1).getTime()
}

/** Начало периода, которому принадлежит день: понедельник или первое число. */
function periodStart(mode: 'week' | 'month', ts: number): number {
  if (mode === 'week') return mondayOf(ts)
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
}

/**
 * Лента из трёх сеток, которая едет за пальцем.
 *
 * Не «жест, а потом перелистывание»: соседние недели лежат слева и справа
 * от текущей и видны ровно настолько, насколько уведён палец. Человек
 * тянет — и видит, что придёт, а не гадает, сработало ли движение. Отпустил
 * на полпути — лента сама доедет до ближайшей.
 *
 * Указатель, а не касание: тем же движением календарь листается мышью на
 * десктопе, где пальца нет, а стрелок больше тоже нет.
 */
function useCarousel(width: number, onCommit: (dir: -1 | 1) => void) {
  const from = useRef<{ x: number; y: number } | null>(null)
  /*
   * Направление решаем один раз за жест и больше не пересматриваем.
   *
   * Календарь стоит посреди прокручиваемого экрана, и палец, ведущий
   * страницу вверх, почти никогда не идёт ровно. Без этого лента дёргалась
   * бы вбок при каждой попытке проскроллить, а перехваченная прокрутка
   * раздражает сильнее, чем не сработавший свайп.
   */
  const axis = useRef<'?' | 'x' | 'y'>('?')
  // Жест заканчивается на какой-то клетке, и без пометки отпущенный палец
  // заодно выбирал бы день, над которым остановился.
  const swiped = useRef(false)
  const [dx, setDx] = useState(0)
  /** Куда доводим ленту после отпускания: −1 назад, 0 на место, 1 вперёд. */
  const [settle, setSettle] = useState<-1 | 0 | 1 | null>(null)

  const idle = settle == null
  const offset = idle ? dx : settle * -width

  const release = () => {
    // Лента и не трогалась — доводить нечего. Это не мелочь: переход с
    // нулевым сдвигом не начнётся, `transitionend` не придёт, и лента
    // осталась бы «в доводке» навсегда, перестав отвечать на жесты вовсе.
    if (dx === 0) return setSettle(null)
    // Порога хватает и трети ширины: на узком экране 44 пикселя — это уже
    // почти клетка, и туда легко попасть, просто промахнувшись по дню.
    const enough = Math.abs(dx) >= Math.min(SWIPE_MIN, width / 3)
    setSettle(enough ? (dx < 0 ? 1 : -1) : 0)
    if (enough) haptics.selection()
  }

  const finish = () => {
    if (settle == null) return
    const dir = settle
    // Обе правки в одном обработчике — React применит их одним рендером,
    // и подмена дат совпадёт с возвратом ленты в исходное положение. Иначе
    // между ними успел бы прорисоваться кадр со сдвинутой лентой и уже
    // новыми числами — то есть заметный рывок в конце каждого движения.
    setSettle(null)
    setDx(0)
    if (dir !== 0) onCommit(dir)
  }

  /*
   * Страховка на случай, если `transitionend` не придёт.
   *
   * Он не приходит, когда вкладку увели в фон посреди доводки или переход
   * прервали. Без страховки лента навсегда осталась бы «в доводке» и
   * перестала бы отвечать на жесты — а это единственный способ листать.
   */
  useEffect(() => {
    if (settle == null) return
    const id = window.setTimeout(finish, SETTLE_MS + 120)
    return () => clearTimeout(id)
  })

  return {
    /** Сдвиг ленты относительно «текущая сетка по центру», в пикселях. */
    offset,
    /** Идёт доводка — на это время лента едет с переходом, а не за пальцем. */
    settling: !idle,
    onTransitionEnd: finish,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        if (!width || !idle) return
        if (e.pointerType === 'mouse' && e.button !== 0) return
        // Пометку снимаем в начале жеста, а не после того, как применили:
        // протяжка начинается и заканчивается на разных клетках, и клика
        // после неё браузер не шлёт вовсе. Поднятая пометка доживала до
        // следующего касания и гасила уже его.
        swiped.current = false
        axis.current = '?'
        from.current = { x: e.clientX, y: e.clientY }
        // Захват указателя — удобство, а не условие работы: с ним движение
        // продолжает приходить, даже когда палец ушёл за края календаря.
        // Отказ не должен ронять жест целиком, поэтому не даём ему выйти.
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          /* обойдёмся без захвата */
        }
      },
      onPointerMove: (e: React.PointerEvent) => {
        const start = from.current
        if (!start) return
        const mx = e.clientX - start.x
        const my = e.clientY - start.y
        if (axis.current === '?') {
          if (Math.abs(mx) < 8 && Math.abs(my) < 8) return
          axis.current = Math.abs(mx) > Math.abs(my) ? 'x' : 'y'
          if (axis.current === 'y') from.current = null
        }
        if (axis.current !== 'x') return
        swiped.current = true
        setDx(mx)
      },
      onPointerUp: () => {
        if (!from.current) return
        from.current = null
        release()
      },
      onPointerCancel: () => {
        from.current = null
        if (dx !== 0) setSettle(0)
      },
      onClickCapture: (e: React.MouseEvent) => {
        if (!swiped.current) return
        e.stopPropagation()
        e.preventDefault()
      },
    },
  }
}

/** Ширина элемента в пикселях — лента считает сдвиг по ней. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, width }
}

/**
 * Итог периода в подвале календаря.
 *
 * Одна строка, а не панель со статистикой: календарь остаётся календарём, а
 * счёт под ним отвечает на единственный вопрос, ради которого листают назад
 * — «а сколько было тогда».
 */
function CalendarScore({
  mode,
  score,
}: {
  mode: 'week' | 'month'
  score: { done: number; volume: number; best: boolean }
}) {
  if (score.done === 0) {
    return (
      <div className="cal-score">
        <span className="mute-sm">{t('Тренировок нет')}</span>
      </div>
    )
  }
  return (
    <div className={`cal-score${score.best ? ' best' : ''}`}>
      <span className="cal-score-line">
        {/* plural сам знает про английский (см. PLURAL_EN), оборачивать его
            в t() не нужно — получилась бы двойная попытка перевода. */}
        <b className="t-num">{score.done}</b>{' '}
        {plural(score.done, ['тренировка', 'тренировки', 'тренировок'])}
        {score.volume > 0 && (
          <>
            {' · '}
            <b className="t-num">{(score.volume / 1000).toFixed(1)}</b> {t('т')}
          </>
        )}
      </span>
      {/* Звание — единственная награда на этом экране, поэтому она и заметна.
          Лайм, а не медь: медь в приложении закреплена за личным рекордом в
          упражнении и больше нигде не появляется (см. DESIGN.md). */}
      {score.best && (
        <span className="badge pro">
          {mode === 'week' ? t('лучшая неделя') : t('лучший месяц')}
        </span>
      )}
    </div>
  )
}

/**
 * Календарь тренировок: история и план в одной ленте дат.
 * Неделя — режим по умолчанию: в зале нужен ближайший горизонт, а месяц
 * открывается, когда смотрят на регулярность за период.
 */
export function WorkoutCalendar() {
  const nav = useNavigate()
  // Аккаунт берём из контекста: календарь переживает переключение профиля без
  // размонтирования, и без него в запросах остался бы прошлый пользователь.
  const { toast, userId } = useApp()
  const [mode, setMode] = useState<'week' | 'month'>('week')
  const [anchor, setAnchor] = useState(() => startOfDay(Date.now()))
  const [selected, setSelected] = useState(() => startOfDay(Date.now()))

  const sessions = useLiveQuery(() => listMySessions(), [userId], [] as WorkoutSession[])
  const allSets = useLiveQuery(() => db.sets.toArray(), [], [])
  const plan = useLiveQuery(() => activeAssignmentFor(userId), [userId])
  // Назначение есть, а программы к нему нет — человеку надо сказать об этом,
  // иначе у него пусто, а у тренера «назначено».
  const pending = useLiveQuery(() => pendingAssignmentFor(userId), [userId, plan?.assignment.id])

  /**
   * Подходы и тоннаж по тренировкам — считаем один раз на все места сразу.
   *
   * Раньше каждая карточка в списке дня перебирала все подходы устройства
   * заново; теперь тем же счётом пользуется и итог периода, которому иначе
   * пришлось бы делать этот перебор ещё по разу на каждую тренировку.
   */
  const statsBySession = useMemo(() => {
    const sets = new Map<string, ExerciseSet[]>()
    for (const s of allSets ?? []) {
      const arr = sets.get(s.workout_session_id)
      if (arr) arr.push(s)
      else sets.set(s.workout_session_id, [s])
    }
    const out = new Map<string, { count: number; volume: number }>()
    for (const [id, arr] of sets) out.set(id, { count: arr.length, volume: totalVolume(arr) })
    return out
  }, [allSets])

  /** Тренировки, разложенные по дням — основа и маркеров, и списка. */
  const byDay = useMemo(() => {
    const map = new Map<number, WorkoutSession[]>()
    for (const s of sessions ?? []) {
      const key = startOfDay(s.start_time)
      const arr = map.get(key)
      if (arr) arr.push(s)
      else map.set(key, [s])
    }
    return map
  }, [sessions])

  /*
   * Три сетки сразу: прошлая, текущая и следующая.
   *
   * Соседи считаются всегда, а не в момент жеста: показать их надо на первом
   * же миллиметре движения, а собирать сетку под пальцем — значит показать
   * пустоту там, куда человек уже смотрит.
   */
  const panels = useMemo(
    () =>
      ([-1, 0, 1] as const).map((d) => {
        const a = d === 0 ? anchor : shiftAnchor(mode, anchor, d)
        return { key: `${mode}:${a}`, anchor: a, days: gridDays(mode, a) }
      }),
    [mode, anchor],
  )
  const days = panels[1].days

  // Плановые тренировки по расписанию — маркеры на будущих днях. Диапазон
  // берём по всем трём сеткам: у соседей маркеры нужны до того, как они
  // доедут до центра, иначе план проступает на них уже после остановки.
  const spanFrom = panels[0].days[0]
  const spanTo = panels[2].days[panels[2].days.length - 1]
  const planned = useLiveQuery(
    async () => await plannedDates(spanFrom, spanTo, userId),
    [spanFrom, spanTo, plan?.assignment.id, userId],
    new Map<string, string>() as unknown as Map<number, string>,
  )
  const plannedToday = useLiveQuery(
    () => plannedForDate(selected, userId),
    [selected, plan?.assignment.id, userId],
  )

  /**
   * Итог показанного периода — то, ради чего вообще листают назад.
   *
   * Считаем по тому, что на экране, а не по текущей неделе: карточка выше
   * и так про «эту неделю», и повторять её здесь незачем. Смысл появляется
   * ровно в тот момент, когда человек уехал в июль и увидел, сколько там
   * было. Тоннаж рядом с числом тренировок потому, что три тренировки по
   * часу и три по десять минут — это разные три тренировки.
   */
  const score = useMemo(() => {
    const from = periodStart(mode, anchor)
    const to = shiftAnchor(mode, from, 1)
    const done = [...byDay.keys()].filter((k) => k >= from && k < to).length
    const volume = (sessions ?? [])
      .filter((s) => s.start_time >= from && s.start_time < to)
      .reduce((sum, s) => sum + (statsBySession.get(s.id)?.volume ?? 0), 0)

    // «Лучший» — по числу дней с тренировкой среди всех периодов, где вообще
    // что-то было. Пока такой период один, звания нет: назвать лучшей
    // единственную неделю в истории значит обесценить слово.
    const counts = new Map<number, number>()
    for (const k of byDay.keys()) {
      const p = periodStart(mode, k)
      counts.set(p, (counts.get(p) ?? 0) + 1)
    }
    const best = counts.size >= 2 && done > 0 && done === Math.max(...counts.values())
    return { done, volume, best }
  }, [byDay, sessions, statsBySession, mode, anchor])

  const { ref: viewport, width } = useWidth<HTMLDivElement>()
  const carousel = useCarousel(width, (dir) => setAnchor((a) => shiftAnchor(mode, a, dir)))

  /** Листание с клавиатуры и по кнопке «сегодня» — без ленты, сразу. */
  const shift = (dir: -1 | 1) => {
    haptics.selection()
    setAnchor((a) => shiftAnchor(mode, a, dir))
  }

  const today = startOfDay(Date.now())
  const dayList = byDay.get(selected) ?? []
  /**
   * Подпись месяца.
   *
   * В месячном виде она берётся у самого месяца, а не у краёв сетки: сетка
   * достроена до целых недель и заходит в соседние месяцы, отчего август
   * подписывался как «июль — сентябрь».
   *
   * Неделя же и правда может лежать в двух месяцах — тогда это диапазон. Год
   * ставим один раз в конце: он у обоих месяцев общий, кроме стыка декабря и
   * января, где годы разные и нужны оба.
   */
  const monthLabel = useMemo(() => {
    const label = (d: Date) => t(MONTHS[d.getMonth()])
    if (mode === 'month') {
      const d = new Date(anchor)
      return `${label(d)} ${d.getFullYear()}`
    }
    const from = new Date(days[0])
    const to = new Date(days[days.length - 1])
    if (from.getMonth() === to.getMonth()) return `${label(from)} ${from.getFullYear()}`
    return from.getFullYear() === to.getFullYear()
      ? `${label(from)} — ${label(to)} ${to.getFullYear()}`
      : `${label(from)} ${from.getFullYear()} — ${label(to)} ${to.getFullYear()}`
  }, [days, mode, anchor])

  const [startOpen, setStartOpen] = useState(false)

  /**
   * Весь план по порядку исполнения, начиная с той тренировки, что стоит
   * следующей. Список грузим только с открытой шторкой: до неё он не виден,
   * а запрос ходит в четыре таблицы.
   */
  const queue = useLiveQuery(
    () => (startOpen ? planQueue(selected) : Promise.resolve(null)),
    [startOpen, selected, plan?.assignment.id],
  )

  const startProgram = async (routineId: string) => {
    haptics.impact()
    const id = await startSessionFromRoutine(routineId)
    if (!id) {
      toast(t('В этом дне программы пока нет упражнений'))
      return
    }
    setStartOpen(false)
    nav(`/session/${id}`)
  }

  /** Свободная тренировка: упражнения добавляются внутри неё из библиотеки. */
  const startFree = async () => {
    haptics.impact()
    const id = await startEmptySession()
    setStartOpen(false)
    nav(`/session/${id}`)
  }

  const repeat = async (sessionId: string) => {
    haptics.impact()
    const id = await repeatSession(sessionId)
    toast(t('Тренировка создана по образцу'))
    nav(`/session/${id}`)
  }

  return (
    <div>
      {/* Календарь собран в одну карточку: шапка, дни недели, сетка и итог —
          части одного предмета, а по отдельности на фоне экрана они лежали
          россыпью, и переключатель «Неделя / Месяц» висел сам по себе. */}
      <div className="cal-card">
        <div className="cal-head">
          <div className="grow">
            <div className="cal-month">{monthLabel}</div>
            <button
              className="mute-sm tap-wide"
              style={{ padding: '4px 0', position: 'relative' }}
              onClick={() => {
                setAnchor(today)
                setSelected(today)
              }}
            >
              {t('сегодня')}
            </button>
          </div>
          <div className="segmented">
            <button className={mode === 'week' ? 'on' : ''} onClick={() => setMode('week')}>
              {t('Неделя')}
            </button>
            <button className={mode === 'month' ? 'on' : ''} onClick={() => setMode('month')}>
              {t('Месяц')}
            </button>
          </div>
        </div>

        {/* Ряд дней недели стоит один и ровно над числами: у него та же сетка
            из семи колонок и тот же зазор, что у сетки дат. Раньше между ними
            вклинивались кнопки-стрелки, ряд получался из девяти ячеек, и число
            ни разу не попадало под своё название. */}
        <div className="cal-weekdays">
          {WEEK_DAYS.map((d) => (
            <span key={d}>{t(d)}</span>
          ))}
        </div>

        <div
          className="cal-viewport"
          ref={viewport}
          role="group"
          aria-label={t('Календарь тренировок')}
          onKeyDown={(e) => {
            // Стрелок на экране нет, но с клавиатуры листать по-прежнему
            // можно: без этого календарь остался бы доступен только пальцем
            // и мышью.
            if (e.key === 'ArrowLeft') shift(-1)
            else if (e.key === 'ArrowRight') shift(1)
            else return
            e.preventDefault()
          }}
          {...carousel.handlers}
        >
          <div
            className={`cal-track${carousel.settling ? ' settling' : ''}`}
            style={{ transform: `translate3d(${carousel.offset - width}px, 0, 0)` }}
            onTransitionEnd={carousel.onTransitionEnd}
          >
            {panels.map((panel) => (
              <div className="cal-grid" key={panel.key}>
                {panel.days.map((ts) => {
                  const list = byDay.get(ts) ?? []
                  const inMonth =
                    mode === 'week' ||
                    new Date(ts).getMonth() === new Date(panel.anchor).getMonth()
                  return (
                    <button
                      key={ts}
                      // Соседние сетки из обхода табом убираем: они лежат за
                      // краем, и фокус уезжал бы на невидимые числа.
                      tabIndex={panel.anchor === anchor ? undefined : -1}
                      className={[
                        'cal-day',
                        ts === selected ? 'on' : '',
                        ts === today ? 'today' : '',
                        list.length > 0 ? 'done' : '',
                        inMonth ? '' : 'dim',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => {
                        haptics.selection()
                        setSelected(ts)
                        // Клетка соседней сетки — значит человек ткнул в день,
                        // который видно с краю: переезжаем туда вместе с ним.
                        if (panel.anchor !== anchor) setAnchor(panel.anchor)
                      }}
                    >
                      {/* Подписи дня недели под числом нет: она стоит в ряду
                          выше, ровно над этой колонкой, и повторять её в
                          каждой клетке значит написать «вт» трижды. */}
                      <span className="d-num">{new Date(ts).getDate()}</span>
                      {list.length > 0 ? (
                        <span className="d-dot" />
                      ) : (
                        planned?.has(ts) && <span className="d-dot planned" />
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        <CalendarScore mode={mode} score={score} />
      </div>

      <div className="section-title">
        {new Date(selected).toLocaleDateString(locale(), {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}
      </div>

      {dayList.length === 0 ? (
        <div className="cal-empty">
          {plannedToday ? (
            <>
              <div className="mute-sm">{t('По плану')}</div>
              <div className="strong" style={{ fontSize: 17, marginTop: 2 }}>
                {t(plannedToday.routine.name)}
              </div>
            </>
          ) : (
            <div className="muted">{t('Нет тренировок в этот день')}</div>
          )}
          {selected >= today && (
            /* Единственное место с дышащей кнопкой: экран пустой, нажимать
               кроме неё нечего, и дыхание здесь — приглашение, а не помеха.
               На рабочем экране такая кнопка тянула бы взгляд от дела. */
            <button
              className="btn primary block mt-4 pulse"
              onClick={() => setStartOpen(true)}
            >
              <IconPlay size={17} /> {t('Начать тренировку')}
            </button>
          )}
        </div>
      ) : (
        <div className="stagger">
          {dayList.map((s, i) => {
            const stats = statsBySession.get(s.id) ?? { count: 0, volume: 0 }
            return (
              <button
                key={s.id}
                className="card tap"
                style={
                  {
                    width: '100%',
                    textAlign: 'left',
                    marginBottom: 12,
                    '--i': i,
                  } as React.CSSProperties
                }
                onClick={() => nav(`/history/${s.id}`)}
              >
                <div className="row between">
                  <div className="grow">
                    <div className="truncate strong">
                      {t(s.title)}
                    </div>
                    <div className="mute-sm" style={{ marginTop: 3 }}>
                      {stats.count} {plural(stats.count, ['подход', 'подхода', 'подходов'])} ·{' '}
                      {Math.round(stats.volume)} {t('кг')} ·{' '}
                      {formatDuration((s.end_time ?? s.start_time) - s.start_time)}
                    </div>
                  </div>
                  <span className="chevron">
                    <IconChevronRight size={16} />
                  </span>
                </div>
                {s.notes && (
                  <div className="mute-sm mt-2">
                    {s.notes}
                  </div>
                )}
                <span
                  className="btn sm block mt-3"
                  onClick={(e) => {
                    e.stopPropagation()
                    void repeat(s.id)
                  }}
                >
                  <IconRepeat size={15} /> {t('Повторить эту тренировку')}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {pending && (
        <>
          <div className="section-title">{t('План')}</div>
          <div className="card warn">
            <div className="strong">{t('Тренер назначил программу')}</div>
            <div className="mute-sm mt-1">
              {t('Она ещё не загрузилась на это устройство. Проверьте связь и обновите приложение — программа появится сама.')}
            </div>
          </div>
        </>
      )}

      {plan && (
        <>
          <div className="section-title">{t('План')}</div>
          <div className="card">
            <div className="row between">
              <div className="grow">
                <div className="strong">{t(plan.program.name)}</div>
                <div className="mute-sm" style={{ marginTop: 2 }}>
                  {plan.weeksLeft != null
                    ? `${t('Осталось')} ${plan.weeksLeft} ${plural(plan.weeksLeft, ['неделя', 'недели', 'недель'])}`
                    : t('План на неделю')}
                </div>
              </div>
              <span className="badge pro">
                {plan.doneThisWeek} / {plan.assignment.weekly_target}
              </span>
            </div>
          </div>
        </>
      )}

      {/*
        Показываем весь план, а не одну «следующую».

        План — не конвейер: заболело плечо, зал занят, уехал в командировку.
        Раньше выбор был между строго следующим днём и пустой тренировкой,
        и человек, которому сегодня не подходит план, оставался ни с чем.
        Порядок при этом сохраняет подсказку: сверху то, что по плану.
      */}
      <Sheet open={startOpen} title={t('Начать тренировку')} onClose={() => setStartOpen(false)}>
        <div className="stack">
          {/* Пока список едет из базы, queue === undefined. Отличать это от
              «плана нет» обязательно: иначе при каждом открытии мелькает
              «программа не назначена» у человека, у которого она есть. */}
          {queue === undefined ? (
            <div className="mute-sm">{t('Загружаю план…')}</div>
          ) : queue?.queue.length ? (
            <div className="group">
              {queue.queue.map((r, i) => (
                <button className="group-row tap" key={r.id} onClick={() => startProgram(r.id)}>
                  <span className="metric-icon" style={i === 0 ? { color: 'var(--accent-ink)' } : undefined}>
                    {i === 0 ? <IconPlay size={18} /> : <IconDumbbell size={18} />}
                  </span>
                  <span className="grow">
                    <span className="title">{t(r.name)}</span>
                    {i === 0 && <span className="sub">{t('следующая по плану')}</span>}
                  </span>
                  <IconChevronRight size={16} />
                </button>
              ))}
            </div>
          ) : (
            <div className="mute-sm">
              {t('Программа не назначена — тренировку из плана запускать пока не из чего.')}
            </div>
          )}

          {/* Своя тренировка — внизу и кнопкой: это выход из плана, а не ещё
              один его день, и стоять в одном списке с ними он не должен. */}
          <button className="btn block" onClick={startFree}>
            <IconDumbbell size={16} /> {t('Создать свою тренировку')}
          </button>
        </div>
      </Sheet>
    </div>
  )
}
