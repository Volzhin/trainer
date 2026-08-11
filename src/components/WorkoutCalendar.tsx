import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, currentUserId, type WorkoutSession } from '../db/db'
import {
  listMySessions,
  repeatSession,
  startSessionFromRoutine,
  startEmptySession,
} from '../db/repo'
import { activeAssignmentFor, plannedDates, plannedForDate } from '../db/coach'
import { IconBack, IconChevronRight, IconDumbbell, IconPlay, IconRepeat } from '../components/Icons'
import { Sheet } from './Sheet'
import { formatDuration, plural, startOfDay, totalVolume } from '../lib/calc'
import { haptics } from '../lib/native'
import { useApp } from '../store/app'

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

/**
 * Календарь тренировок: история и план в одной ленте дат.
 * Неделя — режим по умолчанию: в зале нужен ближайший горизонт, а месяц
 * открывается, когда смотрят на регулярность за период.
 */
export function WorkoutCalendar() {
  const nav = useNavigate()
  const { toast } = useApp()
  const [mode, setMode] = useState<'week' | 'month'>('week')
  const [anchor, setAnchor] = useState(() => startOfDay(Date.now()))
  const [selected, setSelected] = useState(() => startOfDay(Date.now()))

  const sessions = useLiveQuery(() => listMySessions(), [], [] as WorkoutSession[])
  const allSets = useLiveQuery(() => db.sets.toArray(), [], [])
  const plan = useLiveQuery(() => activeAssignmentFor(currentUserId()), [])

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
    const weeks = Math.ceil((startOfDay(lastDay) - gridStart) / (7 * DAY)) + 1
    return Array.from({ length: weeks * 7 }, (_, i) => gridStart + i * DAY)
  }, [mode, anchor])

  // Плановые тренировки по расписанию — маркеры на будущих днях.
  const planned = useLiveQuery(
    async () =>
      days.length
        ? await plannedDates(days[0], days[days.length - 1], currentUserId())
        : new Map<number, string>(),
    [days[0], days[days.length - 1], plan?.assignment.id],
    new Map<string, string>() as unknown as Map<number, string>,
  )
  const plannedToday = useLiveQuery(
    () => plannedForDate(selected, currentUserId()),
    [selected, plan?.assignment.id],
  )

  const shift = (dir: -1 | 1) => {
    haptics.selection()
    setAnchor((a) =>
      mode === 'week'
        ? a + dir * 7 * DAY
        : new Date(new Date(a).getFullYear(), new Date(a).getMonth() + dir, 1).getTime(),
    )
  }

  const today = startOfDay(Date.now())
  const dayList = byDay.get(selected) ?? []
  const monthLabel = useMemo(() => {
    const from = new Date(days[0])
    const to = new Date(days[days.length - 1])
    const label = (d: Date) => MONTHS[d.getMonth()]
    return from.getMonth() === to.getMonth()
      ? `${label(from)} ${from.getFullYear()}`
      : `${label(from)} — ${label(to)}`
  }, [days])

  const [startOpen, setStartOpen] = useState(false)

  /**
   * Следующая тренировка из программы: день, стоящий на выбранной дате, а
   * если на неё плана нет — первый день программы.
   */
  const nextRoutine = plannedToday?.routine ?? plan?.routines?.[0]

  const startProgram = async () => {
    if (!nextRoutine) return
    haptics.impact()
    const id = await startSessionFromRoutine(nextRoutine.id)
    if (!id) {
      toast('В этом дне программы пока нет упражнений')
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
    toast('Тренировка создана по образцу')
    nav(`/session/${id}`)
  }

  return (
    <div>
      <div className="row between mb-3">
        <div>
          <div style={{ fontWeight: 700, textTransform: 'capitalize' }}>{monthLabel}</div>
          <button
            className="mute-sm"
            style={{ padding: 0 }}
            onClick={() => {
              setAnchor(today)
              setSelected(today)
            }}
          >
            сегодня
          </button>
        </div>
        <div className="segmented" style={{ flex: '0 0 auto' }}>
          <button className={mode === 'week' ? 'on' : ''} onClick={() => setMode('week')}>
            Неделя
          </button>
          <button className={mode === 'month' ? 'on' : ''} onClick={() => setMode('month')}>
            Месяц
          </button>
        </div>
      </div>

      <div className="cal-nav">
        <button className="icon-btn" onClick={() => shift(-1)} aria-label="Назад">
          <IconBack size={16} />
        </button>
        <div className="cal-weekdays">
          {WEEK_DAYS.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <button className="icon-btn" onClick={() => shift(1)} aria-label="Вперёд">
          <IconChevronRight size={16} />
        </button>
      </div>

      <div className={`cal-grid${mode === 'week' ? ' week' : ''}`}>
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
              <span className="d-num">{new Date(ts).getDate()}</span>
              {mode === 'week' && (
                <span className="d-wd">{WEEK_DAYS[(new Date(ts).getDay() + 6) % 7]}</span>
              )}
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
        {new Date(selected).toLocaleDateString('ru-RU', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}
      </div>

      {dayList.length === 0 ? (
        <div className="cal-empty">
          {plannedToday ? (
            <>
              <div className="mute-sm">По плану</div>
              <div className="strong" style={{ fontSize: 17, marginTop: 2 }}>
                {plannedToday.routine.name}
              </div>
            </>
          ) : (
            <div className="muted">Нет тренировок в этот день</div>
          )}
          {selected >= today && (
            <button
              className="btn primary block mt-4"
              onClick={() => setStartOpen(true)}
            >
              <IconPlay size={17} /> Начать тренировку
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
                      {s.title}
                    </div>
                    <div className="mute-sm" style={{ marginTop: 3 }}>
                      {sets.length} {plural(sets.length, ['подход', 'подхода', 'подходов'])} ·{' '}
                      {Math.round(totalVolume(sets))} кг ·{' '}
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
                  <IconRepeat size={15} /> Повторить эту тренировку
                </span>
              </button>
            )
          })}
        </div>
      )}

      {plan && (
        <>
          <div className="section-title">План</div>
          <div className="card">
            <div className="row between">
              <div className="grow">
                <div className="strong">{plan.program.name}</div>
                <div className="mute-sm" style={{ marginTop: 2 }}>
                  {plan.weeksLeft != null
                    ? `Осталось ${plan.weeksLeft} ${plural(plan.weeksLeft, ['неделя', 'недели', 'недель'])}`
                    : 'План на неделю'}
                </div>
              </div>
              <span className="badge pro">
                {plan.doneThisWeek} / {plan.assignment.weekly_target}
              </span>
            </div>
          </div>
        </>
      )}

      {/* Выбор из двух, а не одна «умная» кнопка: раньше она сама решала,
          что запустить, и человек не знал заранее, получит он свой план или
          пустую тренировку. Пункт из программы появляется только с
          назначенной программой — предлагать несуществующее нечестно. */}
      <Sheet open={startOpen} title="Начать тренировку" onClose={() => setStartOpen(false)}>
        <div className="stack">
          {nextRoutine ? (
            <button className="list-item" onClick={startProgram}>
              <span className="metric-icon" style={{ color: 'var(--accent-ink)' }}>
                <IconPlay size={18} />
              </span>
              <span className="grow">
                <span className="title">Следующая из программы</span>
                <span className="sub">
                  {nextRoutine.name}
                </span>
              </span>
              <IconChevronRight size={16} />
            </button>
          ) : (
            <div className="mute-sm">
              Программа не назначена — тренировку из плана запускать пока не из чего.
            </div>
          )}

          <button className="list-item" onClick={startFree}>
            <span className="metric-icon">
              <IconDumbbell size={18} />
            </span>
            <span className="grow">
              <span className="title">Свободная тренировка</span>
              <span className="sub">
                Упражнения добавите по ходу
              </span>
            </span>
            <IconChevronRight size={16} />
          </button>
        </div>
      </Sheet>
    </div>
  )
}
