import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import {
  activityRange,
  currentTargets,
  reviewedRefs,
  setWeeklyTargets,
  submittedNutritionDays,
  weeklyStats,
} from '../db/reports'
import { localDate } from '../lib/tdee'
import { formatDate, plural } from '../lib/calc'
import { LineChart } from './LineChart'
import { Group, Row } from './Group'
import { Sheet } from './Sheet'
import { ReportCalendar, type ReportState } from './ReportCalendar'
import { ReviewSheet, toDaySubject, type ReviewSubject } from './ReviewSheet'
import { useApp } from '../store/app'
import { haptics } from '../lib/native'

/** Глубина ленты активности: дальше двух недель разбирать уже поздно. */
const WINDOW_DAYS = 14

/**
 * Питание клиента глазами тренера — один связанный отчёт.
 *
 * Дневник, цели на неделю, шаги и сон стоят подряд не по алфавиту: это
 * части одного разговора. Калории без шагов ничего не значат, а сытость
 * объясняет, почему цифры именно такие. Пока они лежали в разных вкладках,
 * тренер выставлял норму, не видя, сколько человек ходил и как спал.
 */
export function ClientNutritionReview({ clientId }: { clientId: string }) {
  const { toast, userId } = useApp()

  const today = localDate()
  const from = localDate(Date.now() - (WINDOW_DAYS - 1) * 86400_000)

  const version = useLiveQuery(
    async () => [await db.nutritionDays.count(), await db.reviews.count()],
    [clientId],
  )

  const days = useLiveQuery(() => submittedNutritionDays(clientId), [clientId, version?.join('-')])
  const seen = useLiveQuery(() => reviewedRefs(clientId, 'nutrition'), [clientId, version?.join('-')])
  const targets = useLiveQuery(() => currentTargets(clientId), [clientId, version?.join('-')])
  const activity = useLiveQuery(
    () => activityRange(clientId, from, today),
    [clientId, from, today],
  )

  const [reviewing, setReviewing] = useState<ReviewSubject | null>(null)
  const [targetsOpen, setTargetsOpen] = useState(false)

  const states = useMemo(() => {
    const map = new Map<string, ReportState>()
    for (const d of days ?? []) {
      map.set(d.date, seen?.has(d.date) ? 'reviewed' : 'submitted')
    }
    return map
  }, [days, seen])

  if (!days || !seen) return <div className="empty">Загрузка…</div>

  return (
    <div className="mt-4">
      <div className="section-title">Дневник по дням</div>
      <div className="card">
        <ReportCalendar
          states={states}
          onPick={(date) => {
            const day = days.find((d) => d.date === date)
            if (day) setReviewing(toDaySubject(day))
          }}
        />
        <div className="mute-sm mt-3">
          Нажмите на день, чтобы прочитать отчёт и ответить клиенту.
        </div>
      </div>

      <div className="section-title">Цели на неделю</div>
      <div className="card">
        {targets ? (
          <>
            <div className="mute-sm figures">
              {[
                targets.kcal && `${targets.kcal} ккал`,
                targets.protein && `Б ${targets.protein}`,
                targets.fat && `Ж ${targets.fat}`,
                targets.carbs && `У ${targets.carbs}`,
                targets.steps && `${targets.steps} шагов`,
              ]
                .filter(Boolean)
                .join(' · ') || 'без цифр'}
            </div>
            {targets.note && <div className="mute-sm quote mt-2">{targets.note}</div>}
            <button className="btn sm block mt-3" onClick={() => setTargetsOpen(true)}>
              Обновить цели
            </button>
          </>
        ) : (
          <>
            <div className="muted">Цели на эту неделю не выданы.</div>
            <button className="btn primary block mt-4" onClick={() => setTargetsOpen(true)}>
              Выдать цели
            </button>
          </>
        )}
      </div>

      {/* Шаги и сон — хвост того же отчёта, а не отдельная тема: они
          объясняют расход, без которого калории не с чем сравнивать. */}
      <div className="section-title">Шаги и сон за {WINDOW_DAYS} дней</div>
      <ActivityList rows={activity ?? []} />

      <ReviewSheet
        subject={reviewing}
        clientId={clientId}
        trainerId={userId}
        onClose={() => setReviewing(null)}
        onDone={() => toast('Отчёт разобран')}
      />

      <TargetsSheet
        open={targetsOpen}
        clientId={clientId}
        trainerId={userId}
        current={targets ?? undefined}
        onClose={() => setTargetsOpen(false)}
        onDone={() => toast('Цели выданы')}
      />
    </div>
  )
}

/* ------------------------------ шаги и сон ----------------------------- */

const sleepLabel = (m?: number) => {
  if (!m) return '—'
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest ? `${h} ч ${rest} мин` : `${h} ч`
}

function ActivityList({
  rows,
}: {
  rows: { date: string; steps?: number; sleep_minutes?: number }[]
}) {
  const withData = rows.filter((r) => r.steps || r.sleep_minutes)
  if (withData.length === 0) {
    return <div className="empty compact">Клиент не вводил шаги и сон. Это ручной ввод.</div>
  }

  const steps = withData.filter((r) => r.steps).map((r) => r.steps as number)
  const sleep = withData.filter((r) => r.sleep_minutes).map((r) => r.sleep_minutes as number)
  const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length)

  return (
    <>
      <div className="card">
        <div className="metrics">
          <div className="metric">
            <div className="num">{steps.length ? avg(steps) : '—'}</div>
            <div className="cap">шагов в среднем</div>
          </div>
          <div className="metric">
            <div className="num">{sleep.length ? sleepLabel(avg(sleep)) : '—'}</div>
            <div className="cap">сна в среднем</div>
          </div>
        </div>
        <div className="mute-sm mt-3">
          Данные за {withData.length} {plural(withData.length, ['день', 'дня', 'дней'])} из{' '}
          {WINDOW_DAYS}
        </div>
      </div>

      <Group>
        {withData
          .slice()
          .reverse()
          .map((r) => (
            <Row
              key={r.date}
              title={formatDate(new Date(`${r.date}T12:00:00`).getTime())}
              value={
                <span style={{ fontFamily: 'var(--font-num)' }}>
                  {r.steps ?? '—'} · {sleepLabel(r.sleep_minutes)}
                </span>
              }
            />
          ))}
      </Group>
    </>
  )
}

/* --------------------------- цели на неделю ---------------------------- */

/**
 * Статистика перед выдачей целей (пункт 5.6): вес за две недели, процент
 * жира по трём точкам и средние за неделю.
 *
 * Прочерк вместо нуля везде, где данных нет: «клиент не вводил шаги» и
 * «клиент прошёл ноль шагов» — разные вещи, и вторую тренер прочитал бы
 * как повод снижать калории.
 */
function WeeklyStatsBlock({ clientId, open }: { clientId: string; open: boolean }) {
  const stats = useLiveQuery(() => (open ? weeklyStats(clientId) : undefined), [clientId, open])
  if (!stats) return <div className="card skeleton" style={{ height: 180 }} />

  const fatRow = [
    ['старт', stats.fatStart],
    ['пред.', stats.fatPrev],
    ['посл.', stats.fatLast],
  ] as const

  return (
    <div className="card">
      <div className="mute-sm mb-2">Вес за две недели</div>
      {stats.weightPoints.length >= 2 ? (
        <LineChart data={stats.weightPoints} unit=" кг" height={90} />
      ) : (
        <div className="mute-sm">Взвешиваний за две недели меньше двух — графика нет.</div>
      )}

      <div className="row between mt-3">
        <span className="mute-sm">Среднее: прошлая → эта неделя</span>
        <span className="figures strong">
          {stats.weightAvgPrev == null || stats.weightAvgLast == null
            ? '—'
            : `${stats.weightAvgPrev} → ${stats.weightAvgLast} кг`}
        </span>
      </div>
      <div className="row between mt-1">
        <span className="mute-sm">Разница по среднему</span>
        <span
          className="figures strong"
          style={{
            color:
              stats.weightDeltaPct == null
                ? undefined
                : stats.weightDeltaPct > 0
                  ? 'var(--warn)'
                  : 'var(--ok)',
          }}
        >
          {stats.weightDeltaPct == null
            ? '—'
            : `${stats.weightDeltaPct > 0 ? '+' : ''}${stats.weightDeltaPct}%`}
        </span>
      </div>

      <div className="mute-sm mt-4 mb-2">Процент жира по замерам</div>
      <div className="stat-grid three">
        {fatRow.map(([label, value]) => (
          <div className="stat" key={label}>
            <div className="value t-num">{value == null ? '—' : `${value}%`}</div>
            <div className="label">{label}</div>
          </div>
        ))}
      </div>

      <div className="mute-sm mt-4 mb-2">В среднем за неделю</div>
      <div className="group">
        <div className="group-row">
          <span className="grow title">Шаги</span>
          <span className="value figures">
            {stats.avgSteps == null ? '—' : stats.avgSteps}
          </span>
        </div>
        <div className="group-row">
          <span className="grow title">Сон</span>
          <span className="value figures">
            {sleepLabel(stats.avgSleepMinutes ?? undefined)}
          </span>
        </div>
        <div className="group-row">
          <span className="grow title">Сытость</span>
          <span className="value figures">
            {stats.avgSatiety == null ? '—' : `${stats.avgSatiety} из 5`}
          </span>
        </div>
      </div>
    </div>
  )
}

function TargetsSheet({
  open,
  clientId,
  trainerId,
  current,
  onClose,
  onDone,
}: {
  open: boolean
  clientId: string
  trainerId: string
  current?: {
    kcal?: number
    protein?: number
    fat?: number
    carbs?: number
    steps?: number
    note?: string
  }
  onClose: () => void
  onDone: () => void
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setValues({
      kcal: current?.kcal ? String(current.kcal) : '',
      protein: current?.protein ? String(current.protein) : '',
      fat: current?.fat ? String(current.fat) : '',
      carbs: current?.carbs ? String(current.carbs) : '',
      steps: current?.steps ? String(current.steps) : '',
    })
    setNote(current?.note ?? '')
  }, [open])

  // Пустое поле остаётся пустым: цель, которой не задали, — это не ноль, и
  // подставлять расчётное значение вместо пропуска нельзя.
  const num = (key: string) => {
    const raw = (values[key] ?? '').replace(',', '.').trim()
    if (!raw) return undefined
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? n : undefined
  }

  const save = async () => {
    setBusy(true)
    try {
      await setWeeklyTargets({
        clientId,
        trainerId,
        kcal: num('kcal'),
        protein: num('protein'),
        fat: num('fat'),
        carbs: num('carbs'),
        steps: num('steps'),
        note,
      })
      haptics.success()
      onDone()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const field = (key: string, label: string) => (
    <div className="field grow" key={key}>
      <label>{label}</label>
      <input
        className="input"
        inputMode="decimal"
        value={values[key] ?? ''}
        placeholder="—"
        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
      />
    </div>
  )

  return (
    <Sheet open={open} title="Цели на неделю" onClose={onClose}>
      <div className="stack">
        {/* Цифры стоят над полями, а не в другом разделе кабинета: цель
            назначают, глядя на то, что происходило, — иначе это угадывание. */}
        <WeeklyStatsBlock clientId={clientId} open={open} />

        <div className="muted">
          Пустое поле означает, что цели по этой метрике нет — приложение покажет клиенту только
          факт.
        </div>

        <div className="row" style={{ gap: 8 }}>
          {field('kcal', 'Ккал')}
          {field('steps', 'Шаги')}
        </div>
        <div className="row" style={{ gap: 8 }}>
          {field('protein', 'Белки, г')}
          {field('fat', 'Жиры, г')}
          {field('carbs', 'Углеводы, г')}
        </div>

        <div className="field">
          <label>Комментарий</label>
          <textarea
            className="textarea"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="На чём держим фокус на этой неделе"
          />
        </div>

        <button className="btn primary block" disabled={busy} onClick={save}>
          Выдать цели
        </button>
      </div>
    </Sheet>
  )
}

