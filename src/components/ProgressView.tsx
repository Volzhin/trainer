import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  loadProgress,
  PERIODS,
  type ExerciseProgress,
  type PeriodKey,
  type PlanProgress,
} from '../db/analytics'
import { BarChart } from '../components/LineChart'
import { formatDate, formatTonnage, formatWeight, plural } from '../lib/calc'
import { t } from '../lib/i18n'

const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

/**
 * Прогресс = ответ на два вопроса: держусь ли я плана и растут ли веса.
 * Поэтому экран идёт от программы к упражнениям в ней, и только потом —
 * к сводным цифрам. Всё считается за один выбранный период.
 */
/**
 * Разбор прогресса одного человека. Вынесен из экрана, потому что тренеру
 * нужен тот же самый взгляд на клиента, а не его усечённая копия: две
 * версии одного отчёта неизбежно разъезжаются.
 */
export function ProgressView({ userId }: { userId: string }) {
  const nav = useNavigate()

  const [period, setPeriod] = useState<PeriodKey>('4w')
  const [onlyProgram, setOnlyProgram] = useState(true)

  const days = PERIODS.find((p) => p.key === period)!.days
  const report = useLiveQuery(() => loadProgress(userId, days), [userId, days])

  const shown = useMemo(() => {
    const list = report?.exercises ?? []
    if (!report?.plan || !onlyProgram) return list
    return list.filter((e) => e.inProgram)
  }, [report, onlyProgram])

  if (!report) return <div className="screen">{t('Загрузка…')}</div>

  const periodLabel = PERIODS.find((p) => p.key === period)!.label.toLowerCase()

  return (
    <div>
      <div className="header">
        <div>
          <h1>{t('Прогресс')}</h1>
          <div className="sub">
            {report.sessions}{' '}
            {plural(report.sessions, ['тренировка', 'тренировки', 'тренировок'])} за{' '}
            {periodLabel}
          </div>
        </div>
      </div>

      <div className="chips mb-4">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            className={`chip${period === p.key ? ' active' : ''}`}
            onClick={() => setPeriod(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Три показателя в линию — то, по чему тренер судит о неделе:
          сколько сделано сейчас, обычный темп и куда идёт вес. */}
      <div className="stat-grid three">
        <div className="stat">
          <div className="value t-num">{report.sessionsThisWeek}</div>
          <div className="label">{t('на этой неделе')}</div>
        </div>
        <div className="stat">
          <div className="value t-num">{report.perWeek}</div>
          <div className="label">{t('в среднем за неделю')}</div>
        </div>
        <div className="stat">
          {/* Прочерк, а не ноль: ноль означал бы, что вес стоит, а тут его
              просто не измеряли достаточно часто. */}
          <div
            className="value t-num"
            style={{
              color:
                report.weightPerWeek == null
                  ? undefined
                  : report.weightPerWeek > 0
                    ? 'var(--warn)'
                    : 'var(--ok)',
            }}
          >
            {report.weightPerWeek == null
              ? '—'
              : `${report.weightPerWeek > 0 ? '+' : ''}${report.weightPerWeek}`}
          </div>
          <div className="label">{t('вес, кг в неделю')}</div>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="value t-num">{formatTonnage(report.volume)}</div>
          <div className="label">{t('поднято всего')}</div>
        </div>
        <div className="stat">
          <div className="value t-num">{report.sets}</div>
          <div className="label">{t('подходов')}</div>
        </div>
      </div>

      {report.plan ? (
        <PlanCard
          plan={report.plan}
          onOpen={() => nav(`/programs/${report.plan!.program.id}`)}
        />
      ) : (
        <>
          <div className="section-title">{t('Программа')}</div>
          <div className="card">
            <div className="t-body-strong">{t('Программа не назначена')}</div>
            <div className="mute-sm mt-1">
              {t(
                'С программой прогресс считается по плану: видно, какие тренировки вы пропустили и какие упражнения растут, а какие стоят.',
              )}
            </div>
            <button className="btn block mt-3" onClick={() => nav('/programs')}>
              {t('Выбрать программу')}
            </button>
          </div>
        </>
      )}

      <div className="section-title">
        {report.plan && onlyProgram ? t('Упражнения программы') : t('Упражнения')}
      </div>
      <div className="mute-sm mb-3">
        Рабочий вес в последней тренировке и изменение расчётного максимума за {periodLabel}.
      </div>

      {report.plan && (
        <div className="segmented mb-3">
          <button className={onlyProgram ? 'on' : ''} onClick={() => setOnlyProgram(true)}>
            {t('Из программы')}
          </button>
          <button className={onlyProgram ? '' : 'on'} onClick={() => setOnlyProgram(false)}>
            {t('Все')}
          </button>
        </div>
      )}

      {shown.length === 0 ? (
        <div className="empty compact">{t('За этот период подходов не записано')}</div>
      ) : (
        <div className="stack tight">
          {shown.map((e) => (
            <ExerciseRow
              key={e.exercise.id}
              row={e}
              onOpen={() => nav(`/exercises/${e.exercise.id}`)}
            />
          ))}
        </div>
      )}

      <div className="section-title">{t('Нагрузка по неделям')}</div>
      <div className="card">
        <BarChart
          data={report.weekly.map((w) => w.value)}
          labels={report.weekly.map((w) => w.label)}
        />
        <div className="mute-sm mt-2 text-center">
          Вес × повторения за неделю. Всего за {periodLabel} — {formatTonnage(report.volume)}
        </div>
      </div>

      <div className="section-title">{t('Куда уходит нагрузка')}</div>
      <div className="card">
        {report.muscles.length === 0 ? (
          <div className="empty compact">{t('Нет данных за период')}</div>
        ) : (
          <div className="stack">
            {report.muscles.slice(0, 8).map((m) => {
              const top = report.muscles[0].sets
              return (
                <div key={m.group}>
                  <div className="row between mb-1">
                    <span className="muted">{m.group}</span>
                    <span className="mute-sm t-num">
                      {m.sets} {plural(m.sets, ['подход', 'подхода', 'подходов'])}
                    </span>
                  </div>
                  <div className="bar">
                    <i style={{ width: `${(m.sets / top) * 100}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="section-title">{t('Личные рекорды')}</div>
      <div className="mute-sm mb-3">
        Расчётный максимум на одно повторение — по формуле Эпли из лучшего подхода.
      </div>
      {report.records.length === 0 ? (
        <div className="empty compact">Завершите первую тренировку</div>
      ) : (
        <div className="stack tight">
          {report.records.map((r) => (
            <button
              key={r.exerciseId}
              className="list-item"
              onClick={() => nav(`/exercises/${r.exerciseId}`)}
            >
              <div className="grow truncate">{r.name}</div>
              <strong className="t-num" style={{ fontSize: 16 }}>
                {Math.round(r.score)} кг
              </strong>
              <span className="chevron">›</span>
            </button>
          ))}
        </div>
      )}

      {/* Вес, состав тела и ввод замеров отсюда убраны: этот экран отвечает
          на «растут ли веса», а не «что с телом». Сдают замеры в «Отчётах»,
          смотрят их в «Анализе тела» — по одному месту на действие. */}
    </div>
  )
}

/** План против факта: расписание, доля выполненного и разбивка по дням. */
function PlanCard({ plan, onOpen }: { plan: PlanProgress; onOpen: () => void }) {
  const missed = Math.max(0, plan.planned - plan.done)
  const pct = Math.min(100, plan.adherence)

  return (
    <>
      <div className="section-title">{t('Программа')}</div>
      <div className="card">
        <div className="row between">
          <div className="grow">
            <div style={{ fontWeight: 700, fontSize: 17 }}>{plan.program.name}</div>
            <div className="mute-sm mt-1">
              {plan.trainerName ? `от тренера · ${plan.trainerName}` : 'ваша программа'}
            </div>
          </div>
          <span className={`tag${pct >= 80 ? ' accent' : ''}`}>{pct}%</span>
        </div>

        {plan.weekdays.length > 0 && (
          <div className="weekday-row mt-4">
            {WEEKDAYS.map((label, wd) => {
              const on = plan.weekdays.includes(wd)
              return (
                <div key={wd} className={`weekday${on ? ' on' : ''}`}>
                  <span className="wd">{label}</span>
                  <span className="slot">{on ? '•' : '—'}</span>
                </div>
              )
            })}
          </div>
        )}

        <div className="row between mt-4 mb-2">
          <span className="mute-sm">Сделано по плану</span>
          <span className="mute-sm t-num">
            {plan.done} из {plan.planned}
          </span>
        </div>
        <div className="bar">
          <i
            style={{
              width: `${pct}%`,
              background: pct >= 80 ? 'var(--ok)' : pct >= 50 ? 'var(--accent)' : 'var(--warn)',
            }}
          />
        </div>
        <div className="mute-sm mt-2">
          {missed === 0
            ? 'План выполняется полностью.'
            : `Пропущено ${missed} ${plural(missed, ['тренировка', 'тренировки', 'тренировок'])} из плана.`}
          {' На этой неделе — '}
          {plan.doneThisWeek} из {plan.weeklyTarget}.
        </div>

        {plan.byRoutine.length > 0 && (
          <div className="stack tight mt-4">
            {plan.byRoutine.map(({ routine, planned, done }) => (
              <div key={routine.id}>
                <div className="row between mb-1">
                  <span className="muted truncate">{routine.name}</span>
                  <span className="mute-sm t-num">
                    {done}/{planned || '—'}
                  </span>
                </div>
                <div className="bar">
                  <i
                    style={{
                      width: `${planned ? Math.min(100, (done / planned) * 100) : 0}%`,
                      background:
                        done >= planned && planned > 0 ? 'var(--ok)' : 'var(--accent)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        <button className="btn sm block mt-4" onClick={onOpen}>
          Открыть программу
        </button>
      </div>
    </>
  )
}

/** Строка упражнения: что было в последний раз и куда двигается вес. */
/**
 * Строка упражнения с динамикой расчётного максимума. Экспортируется,
 * потому что тем же взглядом на упражнения смотрит тренер в карточке
 * клиента: две копии одной строки разъехались бы при первой правке.
 */
export function ExerciseRow({ row, onOpen }: { row: ExerciseProgress; onOpen: () => void }) {
  const { exercise, deltaKg, lastWeight, lastReps, lastDate, sessions } = row
  const untouched = sessions === 0

  return (
    <button className="list-item" onClick={onOpen}>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="truncate t-body-strong">{exercise.name}</div>
        <div className="mute-sm truncate mt-1">
          {untouched
            ? row.routineNames.length
              ? `${row.routineNames.join(' · ')} — ещё не выполнялось`
              : 'ещё не выполнялось'
            : [
                lastDate && formatDate(lastDate),
                `${sessions} ${plural(sessions, ['тренировка', 'тренировки', 'тренировок'])}`,
                row.routineNames[0],
              ]
                .filter(Boolean)
                .join(' · ')}
        </div>
      </div>

      {!untouched && <Spark points={row.points} up={(deltaKg ?? 0) >= 0} />}

      <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
        <div className="t-num" style={{ fontSize: 15 }}>
          {lastWeight != null ? `${formatWeight(lastWeight)} кг` : '—'}
          {lastReps ? <span className="mute-sm"> × {lastReps}</span> : null}
        </div>
        {deltaKg != null && deltaKg !== 0 && (
          <div
            className="t-num mt-1"
            style={{
              fontSize: 12,
              color: deltaKg > 0 ? 'var(--ok)' : 'var(--danger)',
            }}
          >
            {deltaKg > 0 ? '↑' : '↓'} {Math.abs(deltaKg)} кг
          </div>
        )}
      </div>
    </button>
  )
}

/** Мини-график 1ПМ внутри строки: тренд важнее точных значений. */
function Spark({ points, up }: { points: { x: number; y: number }[]; up: boolean }) {
  if (points.length < 2) return null
  const w = 52
  const h = 22
  const ys = points.map((p) => p.y)
  const min = Math.min(...ys)
  const max = Math.max(...ys)
  const span = max - min || 1
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w
      const y = h - ((p.y - min) / span) * (h - 3) - 1.5
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden
      style={{ flex: '0 0 auto' }}
    >
      <path
        d={d}
        fill="none"
        stroke={up ? 'var(--ok)' : 'var(--danger)'}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

