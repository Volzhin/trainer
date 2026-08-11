import { useMemo, useState } from 'react'
import { localDate } from '../lib/tdee'

/**
 * Календарь сданных отчётов в кабинете тренера.
 *
 * Ровно два состояния цвета — сдан и проверен. Третьего нет намеренно:
 * спецификация называет два, и любой добавленный оттенок пришлось бы
 * объяснять глазами, а не легендой.
 *
 * Дни без отчёта не красятся вовсе. «Не сдан» — это не событие: клиент мог
 * не тренироваться в этот день, и красить пропуск тревожным цветом значит
 * обвинять его в том, чего он не обязан был делать.
 */

export type ReportState = 'submitted' | 'reviewed'

const DAY = 86400_000
const WEEK_DAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

const startOfLocalDay = (ts: number) => {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const mondayOf = (ts: number) => {
  const d = startOfLocalDay(ts)
  return d - ((new Date(d).getDay() + 6) % 7) * DAY
}

export function ReportCalendar({
  /** Состояние по дням, ключ — локальная дата YYYY-MM-DD. */
  states,
  onPick,
}: {
  states: Map<string, ReportState>
  onPick?: (date: string) => void
}) {
  const [mode, setMode] = useState<'week' | 'month'>('week')
  const today = startOfLocalDay(Date.now())

  const days = useMemo(() => {
    if (mode === 'week') {
      // Семь дней назад от сегодняшнего, а не текущая календарная неделя:
      // в понедельник утром пустая неделя не сказала бы тренеру ничего.
      return Array.from({ length: 7 }, (_, i) => today - (6 - i) * DAY)
    }
    const now = new Date(today)
    const first = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getTime()
    const gridStart = mondayOf(first)
    const weeks = Math.ceil((startOfLocalDay(last) - gridStart) / (7 * DAY)) + 1
    return Array.from({ length: weeks * 7 }, (_, i) => gridStart + i * DAY)
  }, [mode, today])

  const monthOfToday = new Date(today).getMonth()

  return (
    <div>
      <div className="row between mb-3">
        <div className="row" style={{ gap: 12 }}>
          <span className="row mute-sm" style={{ gap: 5 }}>
            <i className="report-key submitted" /> сдан
          </span>
          <span className="row mute-sm" style={{ gap: 5 }}>
            <i className="report-key reviewed" /> проверен
          </span>
        </div>
        <div className="segmented" style={{ flex: '0 0 auto' }}>
          <button className={mode === 'week' ? 'on' : ''} onClick={() => setMode('week')}>
            7 дней
          </button>
          <button className={mode === 'month' ? 'on' : ''} onClick={() => setMode('month')}>
            Месяц
          </button>
        </div>
      </div>

      {mode === 'month' && (
        <div className="cal-weekdays mb-2">
          {WEEK_DAYS.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
      )}

      <div className={`cal-grid${mode === 'week' ? ' week' : ''}`}>
        {days.map((ts) => {
          const key = localDate(ts)
          const state = states.get(key)
          const dim = mode === 'month' && new Date(ts).getMonth() !== monthOfToday
          return (
            <button
              key={ts}
              className={[
                'cal-day',
                state ? `report-${state}` : '',
                ts === today ? 'today' : '',
                dim ? 'dim' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              disabled={!state}
              aria-label={
                state
                  ? `${key}: отчёт ${state === 'reviewed' ? 'проверен' : 'сдан'}`
                  : `${key}: отчёта нет`
              }
              onClick={() => state && onPick?.(key)}
            >
              <span className="d-num">{new Date(ts).getDate()}</span>
              {mode === 'week' && (
                <span className="d-wd">{WEEK_DAYS[(new Date(ts).getDay() + 6) % 7]}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
