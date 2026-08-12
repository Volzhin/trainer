import { useMemo, useState } from 'react'
import { localDate } from '../lib/tdee'
import { t } from '../lib/i18n'
import { IconBack, IconChevronRight } from './Icons'

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
  /**
   * Смещение показываемого периода: 0 — текущий, −1 — предыдущий.
   *
   * Тренер разбирает не только сегодняшнее: клиент возвращается после
   * перерыва, и разговор начинается со «что было в марте». Без листания
   * старые отчёты существовали в базе, но добраться до них было нельзя.
   */
  const [offset, setOffset] = useState(0)

  // Якорь периода. Для месяца двигаем календарные месяцы, а не 30 дней:
  // «минус месяц» от 31 марта иначе даёт 3 марта.
  const anchor = useMemo(() => {
    if (mode === 'week') return today + offset * 7 * DAY
    const d = new Date(today)
    return new Date(d.getFullYear(), d.getMonth() + offset, 1).getTime()
  }, [mode, offset, today])

  const days = useMemo(() => {
    if (mode === 'week') {
      // Семь дней назад от якоря, а не календарная неделя: в понедельник
      // утром пустая неделя не сказала бы тренеру ничего.
      return Array.from({ length: 7 }, (_, i) => anchor - (6 - i) * DAY)
    }
    const now = new Date(anchor)
    const first = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getTime()
    const gridStart = mondayOf(first)
    const weeks = Math.ceil((startOfLocalDay(last) - gridStart) / (7 * DAY)) + 1
    return Array.from({ length: weeks * 7 }, (_, i) => gridStart + i * DAY)
  }, [mode, anchor])

  const shownMonth = new Date(anchor).getMonth()

  const label =
    mode === 'month'
      ? `${t(MONTHS[shownMonth])} ${new Date(anchor).getFullYear()}`
      : `${new Date(days[0]).getDate()} ${t(MONTHS[new Date(days[0]).getMonth()])} — ${new Date(
          days[6],
        ).getDate()} ${t(MONTHS[new Date(days[6]).getMonth()])}`

  return (
    <div>
      {/* Листание периода. Вперёд дальше текущего не пускаем: отчётов из
          будущего не бывает, а пустые клетки читались бы как пропуски. */}
      <div className="cal-nav mb-2">
        <button className="icon-btn" onClick={() => setOffset((o) => o - 1)} aria-label={t('Назад')}>
          <IconBack size={16} />
        </button>
        <div className="grow text-center">
          <div className="strong" style={{ textTransform: 'capitalize' }}>
            {label}
          </div>
          {offset !== 0 && (
            <button className="mute-sm" style={{ padding: 0 }} onClick={() => setOffset(0)}>
              {t('сегодня')}
            </button>
          )}
        </div>
        <button
          className="icon-btn"
          onClick={() => setOffset((o) => Math.min(0, o + 1))}
          disabled={offset === 0}
          aria-label={t('Вперёд')}
        >
          <IconChevronRight size={16} />
        </button>
      </div>

      <div className="row between mb-3">
        <div className="row" style={{ gap: 12 }}>
          <span className="row mute-sm" style={{ gap: 5 }}>
            <i className="report-key submitted" /> {t('сдан')}
          </span>
          <span className="row mute-sm" style={{ gap: 5 }}>
            <i className="report-key reviewed" /> {t('проверен')}
          </span>
        </div>
        <div className="segmented" style={{ flex: '0 0 auto' }}>
          <button
            className={mode === 'week' ? 'on' : ''}
            onClick={() => {
              setMode('week')
              setOffset(0)
            }}
          >
            {t('7 дней')}
          </button>
          <button
            className={mode === 'month' ? 'on' : ''}
            onClick={() => {
              setMode('month')
              setOffset(0)
            }}
          >
            {t('Месяц')}
          </button>
        </div>
      </div>

      {mode === 'month' && (
        <div className="cal-weekdays mb-2">
          {WEEK_DAYS.map((d) => (
            <span key={d}>{t(d)}</span>
          ))}
        </div>
      )}

      <div className={`cal-grid${mode === 'week' ? ' week' : ''}`}>
        {days.map((ts) => {
          const key = localDate(ts)
          const state = states.get(key)
          const dim = mode === 'month' && new Date(ts).getMonth() !== shownMonth
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
                  ? `${key}: ${t('отчёт')} ${state === 'reviewed' ? t('проверен') : t('сдан')}`
                  : `${key}: ${t('отчёта нет')}`
              }
              onClick={() => state && onPick?.(key)}
            >
              <span className="d-num">{new Date(ts).getDate()}</span>
              {mode === 'week' && (
                <span className="d-wd">{t(WEEK_DAYS[(new Date(ts).getDay() + 6) % 7])}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
