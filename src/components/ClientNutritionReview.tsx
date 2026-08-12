import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type NutritionTarget } from '../db/db'
import {
  activityFor,
  currentTargets,
  reviewedRefs,
  setWeeklyTargets,
  submittedNutritionDays,
  weeklyStats,
} from '../db/reports'
import { logsForDate, sumNutrients } from '../db/nutrition'
import { nutritionShots } from '../db/coach'
import { ShotThumb } from './ShotThumb'
import { formatDate, formatWeight } from '../lib/calc'
import { LineChart } from './LineChart'
import { Sheet } from './Sheet'
import { MeasurementsTable } from './MeasurementsTable'
import { listBodyMetrics } from '../db/repo'
import { ReportCalendar, type ReportState } from './ReportCalendar'
import { ReviewSheet, toDaySubject, type ReviewSubject } from './ReviewSheet'
import { useApp } from '../store/app'
import { haptics } from '../lib/native'
import { t } from '../lib/i18n'

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


  const version = useLiveQuery(
    async () => [await db.nutritionDays.count(), await db.reviews.count()],
    [clientId],
  )

  const days = useLiveQuery(() => submittedNutritionDays(clientId), [clientId, version?.join('-')])
  const seen = useLiveQuery(() => reviewedRefs(clientId, 'nutrition'), [clientId, version?.join('-')])
  const targets = useLiveQuery(() => currentTargets(clientId), [clientId, version?.join('-')])

  const [reviewing, setReviewing] = useState<ReviewSubject | null>(null)
  const [targetsOpen, setTargetsOpen] = useState(false)

  const states = useMemo(() => {
    const map = new Map<string, ReportState>()
    for (const d of days ?? []) {
      map.set(d.date, seen?.has(d.date) ? 'reviewed' : 'submitted')
    }
    return map
  }, [days, seen])

  if (!days || !seen) return <div className="empty">{t('Загрузка…')}</div>

  return (
    <div className="mt-4">
      {/* Цели строкой наверху и без кнопки: это условие, при котором тренер
          читает всё остальное на экране, а не действие. Выдача — внизу,
          после того как он посмотрел, что происходило. */}
      <TargetsLine targets={targets ?? null} />

      <div className="section-title">{t('Дневник по дням')}</div>
      <div className="card">
        <ReportCalendar
          states={states}
          onPick={(date) => {
            const day = days.find((d) => d.date === date)
            if (day) setReviewing(toDaySubject(day))
          }}
        />
        <div className="mute-sm mt-3">
          {t('Нажмите на день, чтобы прочитать отчёт и ответить клиенту.')}
        </div>
      </div>

      <button className="btn primary block mt-5" onClick={() => setTargetsOpen(true)}>
        {targets ? t('Обновить цели') : t('Выдать цели')}
      </button>

      <ReviewSheet
        subject={reviewing}
        clientId={clientId}
        trainerId={userId}
        /* Разбирая день, тренер должен видеть, при каких целях он прошёл и
           что в нём было. Иначе комментарий пишется по памяти. */
        context={
          reviewing ? (
            <>
              <TargetsLine targets={targets ?? null} compact />
              <NutritionDayFacts
                clientId={clientId}
                date={reviewing.ref}
                targets={targets ?? null}
              />
            </>
          ) : undefined
        }
        onClose={() => setReviewing(null)}
        onDone={() => toast(t('Отчёт разобран'))}
      />

      <TargetsSheet
        open={targetsOpen}
        clientId={clientId}
        trainerId={userId}
        current={targets ?? undefined}
        onClose={() => setTargetsOpen(false)}
        onDone={() => toast(t('Цели выданы'))}
      />
    </div>
  )
}

/**
 * Цели на неделю одной строкой.
 *
 * Наверху вкладки и внутри разбора — один и тот же вид: тренер сравнивает
 * день с целями, и цели должны быть перед глазами в обоих местах. Строка,
 * а не карточка с кнопкой: это условие задачи, а не действие.
 */
function TargetsLine({
  targets,
  compact,
}: {
  targets: NutritionTarget | null
  compact?: boolean
}) {
  const parts = targets
    ? [
        targets.kcal && `${targets.kcal} ${t('ккал')}`,
        targets.protein && `${t('Б')} ${targets.protein}`,
        targets.fat && `${t('Ж')} ${targets.fat}`,
        targets.carbs && `${t('У')} ${targets.carbs}`,
        targets.steps && `${targets.steps} ${t('шагов')}`,
      ].filter(Boolean)
    : []

  return (
    <div className={`targets-line${compact ? ' compact' : ''}`}>
      <div className="cap">{t('Цели на неделю')}</div>
      {parts.length ? (
        <div className="figures">{parts.join(' · ')}</div>
      ) : (
        <div className="mute-sm">{t('Цели на эту неделю не выданы.')}</div>
      )}
      {targets?.note && !compact && <div className="mute-sm quote mt-2">{targets.note}</div>}
    </div>
  )
}

/**
 * Что было в этом дне: съеденное против целей, шаги и сон.
 *
 * Шаги и сон стоят рядом с КБЖУ, а не отдельным разделом на вкладке:
 * они объясняют расход, без которого съеденное не с чем сравнивать. По
 * отдельности эти цифры не отвечают ни на один вопрос.
 */
function NutritionDayFacts({
  clientId,
  date,
  targets,
}: {
  clientId: string
  date: string
  targets: NutritionTarget | null
}) {
  const facts = useLiveQuery(async () => {
    const logs = await logsForDate(date, clientId)
    const activity = await activityFor(date, clientId)
    const day = await db.nutritionDays.get(`${clientId}:${date}`)
    const shots = await nutritionShots(date, clientId)
    return {
      eaten: sumNutrients(logs),
      entries: logs.length,
      // Итог, введённый рукой, важнее посчитанного: пока базы продуктов
      // нет, человек считает КБЖУ в стороннем счётчике, и его четыре
      // числа — единственное, что он на самом деле сдал.
      manual: day?.manual,
      activity,
      shots,
    }
  }, [clientId, date])

  if (!facts) return <div className="card skeleton" style={{ height: 96 }} />

  const row = (label: string, actual: number, goal?: number, unit = '') => (
    <div className="row between mt-1" key={label}>
      <span className="mute-sm">{label}</span>
      <span className="figures">
        {actual}
        {unit}
        {goal ? ` / ${goal}${unit}` : ''}
      </span>
    </div>
  )

  return (
    <div className="card mt-2">
      <div className="cap mb-1">{t('За этот день')}</div>
      {(() => {
        const m = facts.manual
        const hasManual = m && (m.kcal != null || m.protein != null || m.fat != null || m.carbs != null)
        if (!hasManual && facts.entries === 0) {
          return <div className="mute-sm">{t('Записей о еде за день нет.')}</div>
        }
        const eaten = hasManual
          ? {
              kcal: m?.kcal ?? 0,
              protein: m?.protein ?? 0,
              fat: m?.fat ?? 0,
              carbs: m?.carbs ?? 0,
            }
          : facts.eaten
        return (
          <>
            {hasManual && (
              <div className="mute-sm mb-1">{t('Из счётчика клиента')}</div>
            )}
            {row(t('Калории'), Math.round(eaten.kcal), targets?.kcal, ` ${t('ккал')}`)}
            {row(t('Белки'), Math.round(eaten.protein), targets?.protein, ` ${t('г')}`)}
            {row(t('Жиры'), Math.round(eaten.fat), targets?.fat, ` ${t('г')}`)}
            {row(t('Углеводы'), Math.round(eaten.carbs), targets?.carbs, ` ${t('г')}`)}
          </>
        )
      })()}

      {row(
        t('Шаги'),
        facts.activity?.steps ?? 0,
        targets?.steps,
      )}
      <div className="row between mt-1">
        <span className="mute-sm">{t('Сон')}</span>
        <span className="figures">{sleepLabel(facts.activity?.sleep_minutes)}</span>
      </div>

      {/* Скриншоты счётчика: без них четыре числа приходится принимать на
          веру, а именно их клиент и прислал как доказательство. */}
      {facts.shots.length > 0 && (
        <div className="shot-grid mt-3">
          {facts.shots.map((a) => (
            <ShotThumb key={a.id} attachment={a} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------ шаги и сон ----------------------------- */

const sleepLabel = (m?: number) => {
  if (!m) return '—'
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest ? `${h} ${t('ч')} ${rest} ${t('мин')}` : `${h} ${t('ч')}`
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

  return (
    <div className="card">
      <div className="mute-sm mb-2">{t('Вес за две недели')}</div>
      {stats.weightPoints.length >= 2 ? (
        <LineChart data={stats.weightPoints} unit={` ${t('кг')}`} height={90} />
      ) : (
        <div className="mute-sm">{t('Взвешиваний за две недели меньше двух — графика нет.')}</div>
      )}

      <div className="row between mt-3">
        <span className="mute-sm">{t('Среднее: прошлая → эта неделя')}</span>
        <span className="figures strong">
          {stats.weightAvgPrev == null || stats.weightAvgLast == null
            ? '—'
            : `${stats.weightAvgPrev} → ${stats.weightAvgLast} ${t('кг')}`}
        </span>
      </div>
      <div className="row between mt-1">
        <span className="mute-sm">{t('Разница по среднему')}</span>
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

      <div className="mute-sm mt-4 mb-2">{t('Процент жира по замерам')}</div>
      {/* Только за две последние недели — то же окно, что у веса. Замер
          полугодовой давности к решению о целях на неделю отношения не
          имеет, а рядом со свежими читался бы как часть той же динамики. */}
      {stats.fatPoints.length === 0 ? (
        <div className="mute-sm">{t('За две недели замеров не было.')}</div>
      ) : (
        <div className="group">
          {stats.fatPoints.map((p) => (
            <div className="group-row" key={p.at}>
              <span className="grow title">{formatDate(p.at)}</span>
              <span className="value figures">{p.value}%</span>
            </div>
          ))}
        </div>
      )}

      <div className="mute-sm mt-4 mb-2">{t('В среднем за неделю')}</div>
      <div className="group">
        <div className="group-row">
          <span className="grow title">{t('Шаги')}</span>
          <span className="value figures">
            {stats.avgSteps == null ? '—' : stats.avgSteps}
          </span>
        </div>
        <div className="group-row">
          <span className="grow title">{t('Сон')}</span>
          <span className="value figures">
            {sleepLabel(stats.avgSleepMinutes ?? undefined)}
          </span>
        </div>
        <div className="group-row">
          <span className="grow title">{t('Сытость')}</span>
          <span className="value figures">
            {stats.avgSatiety == null ? '—' : `${stats.avgSatiety} ${t('из')} 5`}
          </span>
        </div>
      </div>
    </div>
  )
}

const DAY = 86400_000
const round1 = (v: number) => Math.round(v * 10) / 10

/**
 * Как отвечало тело на прошлые цели.
 *
 * Калорийность и шаги назначают не по формуле, а по тому, что произошло с
 * весом на предыдущей неделе: расчёт даёт отправную точку, дальше правят по
 * факту. Поэтому график, сдвиг веса и обхваты стоят прямо над полями — иначе
 * тренер выдаёт цифру, не видя, к чему привела прошлая.
 *
 * Проценты рядом с килограммами не для красоты: минус килограмм у человека
 * весом сто и весом пятьдесят — это разные события, и решения по ним разные.
 */
function BodyResponseBlock({ clientId, open }: { clientId: string; open: boolean }) {
  const metrics = useLiveQuery(
    () => (open ? listBodyMetrics(clientId) : Promise.resolve([])),
    [clientId, open],
    [],
  )

  const points = useMemo(
    () =>
      metrics
        .filter((m) => m.weight_kg != null)
        .sort((a, b) => a.logged_at - b.logged_at)
        .map((m) => ({ x: m.logged_at, y: m.weight_kg as number })),
    [metrics],
  )

  if (!points.length) {
    return <div className="muted">{t('Клиент ещё не взвешивался — цели придётся ставить вслепую.')}</div>
  }

  const last = points[points.length - 1]
  const first = points[0]
  // Точка отсчёта — ближайшее взвешивание не новее двух недель. Если таких
  // нет, за две недели просто не взвешивались, и сдвиг показывать не из чего.
  const twoWeeks = points.filter((p) => p.x >= Date.now() - 14 * DAY)[0]

  const delta = (from?: { y: number }) =>
    from && from !== last && from.y > 0
      ? { kg: round1(last.y - from.y), pct: round1(((last.y - from.y) / from.y) * 100) }
      : null

  const rows: [string, ReturnType<typeof delta>][] = [
    ['за 2 недели', delta(twoWeeks)],
    ['от старта', delta(first)],
  ]
  const shown = rows.filter(([, d]) => d)

  return (
    <>
      <div className="section-title">{t('Вес')}</div>
      <div className="card">
        <div className="row between">
          <div className="t-num" style={{ fontSize: 26 }}>
            {formatWeight(last.y)}{' '}
            <span className="mute-sm" style={{ fontSize: 14 }}>
              {t('кг')}
            </span>
          </div>
          <div className="mute-sm">{formatDate(last.x)}</div>
        </div>

        {points.length > 1 && (
          <div className="mt-3">
            <LineChart data={points.slice(-30)} unit={` ${t('кг')}`} height={90} />
          </div>
        )}

        {shown.length > 0 && (
          <div className="group mt-3">
            {shown.map(([label, d]) => (
              <div className="group-row" key={label}>
                <span className="grow title">{t(label)}</span>
                <span
                  className="value figures"
                  style={{ color: d!.kg > 0 ? 'var(--warn)' : d!.kg < 0 ? 'var(--ok)' : undefined }}
                >
                  {d!.kg > 0 ? '+' : ''}
                  {d!.kg} {t('кг')} · {d!.pct > 0 ? '+' : ''}
                  {d!.pct} %
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Только грудь, талия и таз: по ним видно, куда уходит вес. Полная
          таблица со всеми обхватами живёт во вкладке «Тело» — здесь она
          отвлекала бы от решения о калориях. */}
      <MeasurementsTable
        metrics={metrics}
        userId={clientId}
        rows={['chest_cm', 'waist_cm', 'hip_cm']}
        withStart={false}
        title="Замеры за 2 недели"
      />
    </>
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
    <Sheet open={open} title={t('Цели на неделю')} onClose={onClose}>
      <div className="stack">
        {/* Цифры стоят над полями, а не в другом разделе кабинета: цель
            назначают, глядя на то, что происходило, — иначе это угадывание. */}
        <WeeklyStatsBlock clientId={clientId} open={open} />
        <BodyResponseBlock clientId={clientId} open={open} />

        <div className="muted">
          Пустое поле означает, что цели по этой метрике нет — приложение покажет клиенту только
          факт.
        </div>

        <div className="row" style={{ gap: 8 }}>
          {field('kcal', t('Ккал'))}
          {field('steps', t('Шаги'))}
        </div>
        <div className="row" style={{ gap: 8 }}>
          {field('protein', t('Белки, г'))}
          {field('fat', t('Жиры, г'))}
          {field('carbs', t('Углеводы, г'))}
        </div>

        <div className="field">
          <label>{t('Комментарий')}</label>
          <textarea
            className="textarea"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('На чём держим фокус на этой неделе')}
          />
        </div>

        <button className="btn primary block" disabled={busy} onClick={save}>
          {t('Выдать цели')}
        </button>
      </div>
    </Sheet>
  )
}

