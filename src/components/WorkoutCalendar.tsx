import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type WorkoutSession } from '../db/db'
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

/**
 * Листание календаря пальцем или мышью — вместо кнопок-стрелок.
 *
 * Указатель, а не касание: тем же движением календарь листается мышью на
 * десктопе, где пальца нет, а стрелок больше тоже нет.
 *
 * Горизонталь должна заметно перевешивать вертикаль. Календарь стоит в
 * середине прокручиваемого экрана, и палец, ведущий страницу вверх, почти
 * никогда не идёт ровно: без этой проверки неделя перескакивала бы при
 * обычной прокрутке. Сам зазор по вертикали браузеру не мешаем отдавать
 * странице — за это отвечает `touch-action: pan-y` у сетки.
 */
function useSwipe(onSwipe: (dir: -1 | 1) => void) {
  const from = useRef<{ x: number; y: number } | null>(null)
  // Свайп заканчивается на какой-то клетке, и без этой пометки отпущенный
  // палец заодно выбирал бы день, над которым остановился.
  const swiped = useRef(false)

  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      // Пометку снимаем здесь, а не после того, как её применили: протяжка
      // начинается и заканчивается на разных клетках, и клика после неё
      // браузер не шлёт вовсе. Поднятая пометка доживала до следующего
      // касания и гасила уже его — день переставал выбираться после
      // каждого перелистывания.
      swiped.current = false
      from.current = { x: e.clientX, y: e.clientY }
    },
    onPointerUp: (e: React.PointerEvent) => {
      const start = from.current
      from.current = null
      if (!start) return
      const dx = e.clientX - start.x
      const dy = e.clientY - start.y
      if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * 1.5) return
      swiped.current = true
      onSwipe(dx < 0 ? 1 : -1)
    },
    onPointerCancel: () => {
      from.current = null
    },
    onClickCapture: (e: React.MouseEvent) => {
      if (!swiped.current) return
      e.stopPropagation()
      e.preventDefault()
    },
  }
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

  const days = useMemo(() => {
    if (mode === 'week') {
      const start = mondayOf(anchor)
      return Array.from({ length: 7 }, (_, i) => start + i * DAY)
    }
    // Месяц показываем целыми неделями, иначе сетка «рвётся» по краям.
    const first = new Date(
      new Date(anchor).getFullYear(),
      new Date(anchor).getMonth(),
      1,
    ).getTime()
    const gridStart = mondayOf(first)
    const lastDay = new Date(
      new Date(anchor).getFullYear(),
      new Date(anchor).getMonth() + 1,
      0,
    ).getTime()
    // Последний день месяца входит в сетку целиком, поэтому считаем недели по
    // дню после него: без этого почти каждый месяц получал лишнюю строку.
    const weeks = Math.ceil((startOfDay(lastDay) + DAY - gridStart) / (7 * DAY))
    return Array.from({ length: weeks * 7 }, (_, i) => gridStart + i * DAY)
  }, [mode, anchor])

  // Плановые тренировки по расписанию — маркеры на будущих днях.
  const planned = useLiveQuery(
    async () =>
      days.length
        ? await plannedDates(days[0], days[days.length - 1], userId)
        : new Map<number, string>(),
    [days[0], days[days.length - 1], plan?.assignment.id, userId],
    new Map<string, string>() as unknown as Map<number, string>,
  )
  const plannedToday = useLiveQuery(
    () => plannedForDate(selected, userId),
    [selected, plan?.assignment.id, userId],
  )

  const shift = (dir: -1 | 1) => {
    haptics.selection()
    setAnchor((a) =>
      mode === 'week'
        ? a + dir * 7 * DAY
        : new Date(new Date(a).getFullYear(), new Date(a).getMonth() + dir, 1).getTime(),
    )
  }

  const swipe = useSwipe(shift)

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
      <div className="row between mb-3">
        <div>
          <div style={{ fontWeight: 700, textTransform: 'capitalize' }}>{monthLabel}</div>
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
        <div className="segmented" style={{ flex: '0 0 auto' }}>
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
        className="cal-grid cal-swipe"
        role="group"
        aria-label={t('Календарь тренировок')}
        onKeyDown={(e) => {
          // Стрелок на экране нет, но с клавиатуры листать по-прежнему можно:
          // без этого календарь остался бы доступен только пальцем и мышью.
          if (e.key === 'ArrowLeft') shift(-1)
          else if (e.key === 'ArrowRight') shift(1)
          else return
          e.preventDefault()
        }}
        {...swipe}
      >
        {days.map((ts) => {
          const list = byDay.get(ts) ?? []
          const inMonth =
            mode === 'week' || new Date(ts).getMonth() === new Date(anchor).getMonth()
          return (
            <button
              key={ts}
              className={[
                'cal-day',
                ts === selected ? 'on' : '',
                ts === today ? 'today' : '',
                inMonth ? '' : 'dim',
              ].join(' ')}
              onClick={() => {
                haptics.selection()
                setSelected(ts)
              }}
            >
              {/* Подписи дня недели под числом нет: она стоит в ряду выше,
                  ровно над этой колонкой, и повторять её в каждой клетке
                  значит написать «вт» на экране трижды. */}
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
            const sets = (allSets ?? []).filter((x) => x.workout_session_id === s.id)
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
                      {sets.length} {plural(sets.length, ['подход', 'подхода', 'подходов'])} ·{' '}
                      {Math.round(totalVolume(sets))} {t('кг')} ·{' '}
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
