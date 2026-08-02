import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type BodyMetric } from '../db/db'
import {
  deleteBodyMetric,
  listBodyMetrics,
  saveInBodyReport,
  saveManualMeasurement,
} from '../db/repo'
import { parseInBodyPdf, statusFor, type InBodyReport, type NormStatus } from '../lib/inbody'
import { LineChart } from './LineChart'
import { BodyDonut, useCountUp, type DonutPart } from './BodyDonut'
import { BodySegmentsFigure } from './BodySegmentsFigure'
import {
  IcoApple, IcoBmi, IcoBone, IcoFat, IcoFlame, IcoLean, IcoMuscle,
  IcoProtein, IcoTarget, IcoVisceral, IcoWater, IcoWeight,
} from './MetricIcons'
import { Sheet } from './Sheet'
import { IconTrash } from './Icons'
import { formatDate } from '../lib/calc'
import { deriveComposition } from '../lib/anthropometry'
import { useApp } from '../store/app'
import { haptics } from '../lib/native'

// Цвета берём из токенов: они подобраны отдельно для светлой и тёмной темы.
export const BODY_C = {
  muscle: 'var(--c-muscle)',
  protein: 'var(--c-protein)',
  minerals: 'var(--c-minerals)',
  water: 'var(--c-water)',
  fat: 'var(--c-fat)',
  neutral: 'var(--text-dim)',
}

const C = BODY_C

const STATUS_TEXT: Record<NormStatus, string> = {
  low: 'Ниже нормы',
  normal: 'Норма',
  high: 'Выше нормы',
}

/** Метрика экрана: как достать значение, как подписать и каким цветом. */
type Row = {
  key: keyof BodyMetric
  label: string
  unit: string
  color: string
  Icon: (p: { size?: number; color?: string }) => JSX.Element
  /** Куда «лучше» двигаться — для окраски дельты. */
  better?: 'up' | 'down'
}

const MAIN: Row[] = [
  { key: 'weight_kg', label: 'Вес', unit: 'кг', color: C.muscle, Icon: IcoWeight, better: 'down' },
  { key: 'body_fat_pct', label: 'Жир', unit: '%', color: C.fat, Icon: IcoFat, better: 'down' },
  { key: 'skeletal_muscle_kg', label: 'Мышцы', unit: 'кг', color: C.muscle, Icon: IcoMuscle, better: 'up' },
  { key: 'body_water_l', label: 'Вода', unit: 'л', color: C.water, Icon: IcoWater, better: 'up' },
  { key: 'protein_kg', label: 'Белок', unit: 'кг', color: C.protein, Icon: IcoProtein, better: 'up' },
  { key: 'minerals_kg', label: 'Минералы', unit: 'кг', color: C.minerals, Icon: IcoBone, better: 'up' },
]

const OTHER: Row[] = [
  { key: 'visceral_fat', label: 'Висцеральный жир', unit: '', color: C.fat, Icon: IcoVisceral, better: 'down' },
  { key: 'bmi', label: 'ИМТ', unit: '', color: C.neutral, Icon: IcoBmi, better: 'down' },
  { key: 'fat_free_mass_kg', label: 'Безжировая масса', unit: 'кг', color: C.muscle, Icon: IcoLean, better: 'up' },
  { key: 'bmr_kcal', label: 'Основной обмен веществ', unit: 'ккал', color: C.protein, Icon: IcoFlame, better: 'up' },
]

const TRACKABLE = [...MAIN, ...OTHER]

/** Чей состав тела смотрим: от этого зависят только формулировки. */
export type BodySubject = 'self' | 'client'

const TEXT = {
  self: {
    emptyTitle: 'Загрузите отчёт InBody',
    emptyHint:
      'PDF из приложения DDX Fitness или распечатку InBody. Разберём состав, нормы и сегментарный анализ — и покажем динамику между замерами.',
    uploadFirst: 'Загрузить отчёт InBody',
    uploadMore: 'Загрузить новый замер',
    privacy: 'Файл никуда не отправляется — разбор идёт прямо на устройстве.',
  },
  client: {
    emptyTitle: 'Замеров InBody пока нет',
    emptyHint:
      'Клиент может загрузить отчёт сам — или загрузите его PDF здесь: состав, нормы и сегментарный анализ появятся и в приложении клиента.',
    uploadFirst: 'Загрузить отчёт клиента',
    uploadMore: 'Загрузить новый замер клиента',
    privacy: 'Файл никуда не отправляется — разбор идёт прямо на устройстве.',
  },
}

/**
 * Тело экрана «Состав тела» без шапки: один и тот же разбор показывается
 * клиенту про себя и тренеру — про каждого клиента.
 */
export function BodyCompositionView({
  userId,
  subject = 'self',
}: {
  userId: string
  subject?: BodySubject
}) {
  const { toast } = useApp()
  const fileRef = useRef<HTMLInputElement>(null)
  const t = TEXT[subject]

  const [pending, setPending] = useState<{ report: InBodyReport; fileName: string } | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [segTab, setSegTab] = useState<'muscle' | 'fat'>('muscle')
  const [trendKey, setTrendKey] = useState<keyof BodyMetric>('weight_kg')
  const [historyOpen, setHistoryOpen] = useState(false)

  const metrics = useLiveQuery(() => listBodyMetrics(userId), [userId], [] as BodyMetric[])

  const scans = useMemo(
    () =>
      (metrics ?? [])
        .filter((m) => m.source === 'inbody')
        .sort((a, b) => b.logged_at - a.logged_at),
    [metrics],
  )
  const latest = scans[0]
  const previous = scans[1]

  const onFile = async (file?: File) => {
    if (!file) return
    setBusy(true)
    try {
      const report = await parseInBodyPdf(file)
      haptics.impact()
      setPending({ report, fileName: file.name })
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не удалось разобрать PDF')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const confirmImport = async () => {
    if (!pending) return
    const res = await saveInBodyReport(pending.report, pending.fileName, userId)
    haptics.success()
    toast(res.replaced ? 'Замер за эту дату обновлён' : 'Замер добавлен')
    setPending(null)
  }

  const donutParts: DonutPart[] = latest
    ? ([
        { key: 'muscle', label: 'Мышцы', value: latest.skeletal_muscle_kg, unit: 'кг', color: C.muscle },
        { key: 'protein', label: 'Белок', value: latest.protein_kg, unit: 'кг', color: C.protein },
        { key: 'minerals', label: 'Минералы', value: latest.minerals_kg, unit: 'кг', color: C.minerals },
        { key: 'water', label: 'Вода', value: latest.body_water_l, unit: 'л', color: C.water },
        { key: 'fat', label: 'Жир', value: latest.body_fat_kg, unit: 'кг', color: C.fat },
      ].filter((p) => typeof p.value === 'number') as DonutPart[])
    : []

  const weightStatus = latest ? statusFor(latest.weight_kg, latest.norms?.weight_kg) : undefined

  const trendRow = TRACKABLE.find((r) => r.key === trendKey)!
  const trendPoints = (metrics ?? [])
    .filter((m) => typeof m[trendKey] === 'number')
    .map((m) => ({ x: m.logged_at, y: m[trendKey] as number }))

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,.pdf"
        style={{ display: 'none' }}
        onChange={(e) => onFile(e.target.files?.[0])}
      />

      <div className="row between" style={{ margin: '4px 0 10px' }}>
        <div className="mute-sm">
          {latest ? `Замер от ${formatDate(latest.logged_at)}` : 'Замеров пока нет'}
        </div>
        {scans.length > 1 && (
          <button className="btn sm" onClick={() => setHistoryOpen(true)}>
            Все замеры · {scans.length}
          </button>
        )}
      </div>

      {!latest && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600 }}>{t.emptyTitle}</div>
          <div className="muted" style={{ marginTop: 4 }}>
            {t.emptyHint}
          </div>
        </div>
      )}

      {latest && (
        <div className="card">
          <BodyDonut
            parts={donutParts}
            centerLabel="Вес"
            centerValue={`${latest.weight_kg ?? '—'} кг`}
            status={weightStatus ? STATUS_TEXT[weightStatus] : undefined}
            statusKind={weightStatus}
          />
        </div>
      )}

      {latest && (
        <>
          <div className="section-title">Основные параметры</div>
          <div className="group stagger">
            {MAIN.map((row, i) => (
              <MetricRow key={String(row.key)} row={row} now={latest} was={previous} index={i} />
            ))}
          </div>

          <div className="section-title">Другие</div>
          <div className="group stagger">
            {OTHER.map((row, i) => (
              <MetricRow key={String(row.key)} row={row} now={latest} was={previous} index={i} />
            ))}
          </div>
        </>
      )}

      {latest?.muscle_segments && (
        <>
          <div className="section-title">Анализ тела по сегментам</div>
          <div className="segmented" style={{ marginBottom: 12 }}>
            <button className={segTab === 'muscle' ? 'on' : ''} onClick={() => setSegTab('muscle')}>
              Мышцы
            </button>
            <button className={segTab === 'fat' ? 'on' : ''} onClick={() => setSegTab('fat')}>
              Жир
            </button>
          </div>
          <div className="card">
            <BodySegmentsFigure
              segments={
                (segTab === 'muscle' ? latest.muscle_segments : latest.fat_segments) ?? {}
              }
              kind={segTab}
            />
          </div>
        </>
      )}

      {trendPoints.length > 0 && (
        <>
          <div className="section-title">Динамика</div>
          <div className="chips" style={{ marginBottom: 10 }}>
            {TRACKABLE.filter((r) =>
              (metrics ?? []).some((m) => typeof m[r.key] === 'number'),
            ).map((r) => (
              <button
                key={String(r.key)}
                className={`chip${trendKey === r.key ? ' active' : ''}`}
                onClick={() => setTrendKey(r.key)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="card">
            <LineChart
              data={trendPoints}
              unit={trendRow.unit ? ` ${trendRow.unit}` : ''}
              color={trendRow.color === C.neutral ? 'var(--accent)' : trendRow.color}
            />
            <div className="mute-sm" style={{ textAlign: 'center', marginTop: 6 }}>
              {trendRow.label}
              {trendPoints.length === 1 && ' · нужен ещё один замер, чтобы увидеть тренд'}
            </div>
          </div>
        </>
      )}

      {latest && (latest.optimal_weight_kg != null || latest.daily_kcal != null) && (
        <>
          <div className="section-title">Может быть полезным</div>
          <div className="group">
            {latest.optimal_weight_kg != null && (
              <div className="group-row">
                <span className="metric-icon" style={{ color: 'var(--c-muscle)' }}>
                  <IcoTarget size={20} />
                </span>
                <span className="grow">
                  <span className="title">Оптимальный вес</span>
                  <span className="sub" style={{ display: 'block' }}>
                    По росту и балансу мышц, жира и воды
                  </span>
                </span>
                <strong>{latest.optimal_weight_kg} кг</strong>
              </div>
            )}
            {latest.daily_kcal != null && (
              <div className="group-row">
                <span className="metric-icon" style={{ color: 'var(--c-fat)' }}>
                  <IcoApple size={20} />
                </span>
                <span className="grow">
                  <span className="title">Приём калорий</span>
                  <span className="sub" style={{ display: 'block' }}>
                    Ежедневный
                  </span>
                </span>
                <strong>{latest.daily_kcal} ккал</strong>
              </div>
            )}
          </div>
        </>
      )}

      {latest?.optimal_weight_kg != null && latest.weight_kg != null && (
        <>
          <div className="section-title">Улучшение композиции тела</div>
          <div className="card">
            <div className="metrics">
              <Target label="Вес" value={round1(latest.optimal_weight_kg - latest.weight_kg)} />
              <Target
                label="Жир"
                value={
                  latest.body_fat_kg != null
                    ? round1(latest.optimal_weight_kg - latest.weight_kg)
                    : undefined
                }
              />
              <Target label="Мышцы" value={0} />
            </div>
            <div className="mute-sm" style={{ marginTop: 10 }}>
              Сколько осталось до оптимального веса при сохранении мышечной массы.
            </div>
          </div>
        </>
      )}

      <button
        className="btn primary block"
        style={{ marginTop: 20 }}
        disabled={busy}
        onClick={() => fileRef.current?.click()}
      >
        {busy ? 'Читаю отчёт…' : latest ? t.uploadMore : t.uploadFirst}
      </button>

      {/* Отчёт InBody есть не у всех: домашние весы, замер в другом зале или
          просто взвешивание тоже должны попадать в тренд. */}
      <button className="btn block" style={{ marginTop: 8 }} onClick={() => setManualOpen(true)}>
        Ввести замер вручную
      </button>

      <ManualMeasurementSheet
        open={manualOpen}
        userId={userId}
        onClose={() => setManualOpen(false)}
        onSaved={(replaced) => toast(replaced ? 'Замер обновлён' : 'Замер добавлен')}
      />

      <Sheet open={!!pending} title="Данные из отчёта" onClose={() => setPending(null)}>
        {pending && (
          <div className="stack">
            <div className="muted">
              Отчёт от {formatDate(pending.report.measured_at)}
              {pending.report.person ? ` · ${pending.report.person}` : ''}
            </div>
            <div className="group">
              {metricRows(pending.report as unknown as BodyMetric).map(([label, value]) => (
                <div className="group-row" key={label}>
                  <span className="grow title">{label}</span>
                  <span className="value">{value}</span>
                </div>
              ))}
            </div>
            <button className="btn primary block" onClick={confirmImport}>
              Добавить замер
            </button>
            <div className="mute-sm" style={{ textAlign: 'center' }}>
              {t.privacy}
            </div>
          </div>
        )}
      </Sheet>

      <Sheet open={historyOpen} title="Замеры" onClose={() => setHistoryOpen(false)}>
        <div className="group">
          {scans.map((m) => (
            <div className="group-row" key={m.id}>
              <span className="grow">
                <span className="title">{formatDate(m.logged_at)}</span>
                <span className="sub" style={{ display: 'block' }}>
                  {[
                    m.weight_kg != null && `${m.weight_kg} кг`,
                    m.skeletal_muscle_kg != null && `мышцы ${m.skeletal_muscle_kg}`,
                    m.body_fat_pct != null && `жир ${m.body_fat_pct}%`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <button
                className="icon-btn"
                onClick={async () => {
                  await deleteBodyMetric(m.id)
                  toast('Замер удалён')
                }}
                aria-label="Удалить"
              >
                <IconTrash size={15} />
              </button>
            </div>
          ))}
        </div>
      </Sheet>
    </>
  )
}

const round1 = (v: number) => Math.round(v * 10) / 10

function Target({ label, value }: { label: string; value?: number }) {
  return (
    <div className="metric">
      <div className="cap">{label}</div>
      <div className="num" style={{ fontSize: 22 }}>
        {value == null ? '—' : `${value > 0 ? '+' : ''}${value} кг`}
      </div>
    </div>
  )
}

function MetricRow({
  row,
  now,
  was,
  index = 0,
}: {
  row: Row
  now: BodyMetric
  was?: BodyMetric
  index?: number
}) {
  const value = now[row.key] as number | undefined
  const shown = useCountUp(value ?? 0, Number.isInteger(value) ? 0 : 1)
  if (value == null) return null

  const status = statusFor(value, now.norms?.[row.key as string])
  const prev = was?.[row.key] as number | undefined
  const diff = prev != null ? round1(value - prev) : null
  const good = diff == null || diff === 0 ? null : row.better === 'up' ? diff > 0 : diff < 0

  return (
    <div className="group-row" style={{ '--i': index } as React.CSSProperties}>
      <span className="metric-icon" style={{ color: row.color }}>
        <row.Icon size={20} />
      </span>
      <span className="grow">
        <span className="title">{row.label}</span>
        {status && (
          <span style={{ display: 'block', marginTop: 3 }}>
            <span className={`status ${status}`}>{STATUS_TEXT[status]}</span>
          </span>
        )}
      </span>
      <span style={{ textAlign: 'right' }}>
        <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          {shown}
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-mute)' }}>
            {row.unit ? ` ${row.unit}` : ''}
          </span>
        </span>
        {diff != null && diff !== 0 && (
          <span
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
              color: good ? 'var(--success)' : 'var(--danger)',
            }}
          >
            {diff > 0 ? '↑' : '↓'} {Math.abs(diff)}
          </span>
        )}
      </span>
    </div>
  )
}

function metricRows(m: Partial<BodyMetric>): [string, string][] {
  const rows: [string, string, number | undefined][] = [
    ['Вес', 'кг', m.weight_kg],
    ['Скелетные мышцы', 'кг', m.skeletal_muscle_kg],
    ['Жир', '%', m.body_fat_pct],
    ['Жировая масса', 'кг', m.body_fat_kg],
    ['Безжировая масса', 'кг', m.fat_free_mass_kg],
    ['Вода', 'л', m.body_water_l],
    ['Белок', 'кг', m.protein_kg],
    ['Минералы', 'кг', m.minerals_kg],
    ['Висцеральный жир', '', m.visceral_fat],
    ['ИМТ', '', m.bmi],
    ['Обмен веществ', 'ккал', m.bmr_kcal],
    ['Суточная норма', 'ккал', m.daily_kcal],
    ['Оптимальный вес', 'кг', m.optimal_weight_kg],
  ]
  return rows
    .filter(([, , v]) => v != null)
    .map(([label, unit, v]) => [label, `${v}${unit ? ` ${unit}` : ''}`])
}


/**
 * Ручной ввод замера. Обхваты важнее отдельных показателей: по ним
 * считается процент жира и производный состав, поэтому измерительная лента
 * заменяет весы с биоимпедансом там, где их нет.
 */
function ManualMeasurementSheet({
  open,
  userId,
  onClose,
  onSaved,
}: {
  open: boolean
  userId: string
  onClose: () => void
  onSaved: (replaced: boolean) => void
}) {
  const profile = useLiveQuery(async () => db.profile.get(userId), [userId])
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const num = (key: string) => {
    const raw = values[key]
    if (!raw) return undefined
    const n = parseFloat(raw.replace(',', '.'))
    return Number.isFinite(n) ? n : undefined
  }

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }))

  const heightCm = num('height_cm') ?? profile?.height_cm
  const sex = profile?.gender ?? 'м'

  // Считаем на лету: человек должен видеть, что даёт очередной обхват,
  // а не узнавать результат после сохранения.
  const derived = useMemo(
    () =>
      deriveComposition({
        weightKg: num('weight_kg'),
        heightCm,
        sex,
        girths: {
          neck: num('neck_cm'),
          waist: num('waist_cm'),
          hip: num('hip_cm'),
          chest: num('chest_cm'),
          thigh: num('thigh_cm'),
        },
        knownBodyFatPct: num('body_fat_pct'),
      }),
    [values, heightCm, sex],
  )

  const girthFields: { key: string; label: string; hint?: string }[] = [
    { key: 'neck_cm', label: 'Шея', hint: 'под кадыком, лента горизонтально' },
    { key: 'waist_cm', label: 'Талия', hint: 'на уровне пупка, не втягивая живот' },
    { key: 'hip_cm', label: 'Таз', hint: 'по самой широкой части ягодиц' },
    { key: 'chest_cm', label: 'Грудь' },
    { key: 'thigh_cm', label: 'Бедро' },
  ]

  const submit = async () => {
    const weight = num('weight_kg')
    if (!weight && derived.bodyFatPct == null) return
    setBusy(true)
    try {
      const at = new Date(`${date}T12:00:00`).getTime()
      const res = await saveManualMeasurement(
        {
          weight_kg: weight,
          neck_cm: num('neck_cm'),
          waist_cm: num('waist_cm'),
          hip_cm: num('hip_cm'),
          chest_cm: num('chest_cm'),
          thigh_cm: num('thigh_cm'),
          // Значение, введённое руками, приоритетнее расчётного.
          body_fat_pct: num('body_fat_pct') ?? derived.bodyFatPct,
          body_fat_kg: derived.fatMassKg,
          fat_free_mass_kg: derived.leanMassKg,
          skeletal_muscle_kg: derived.skeletalMuscleKg,
          body_water_l: derived.bodyWaterL,
          protein_kg: derived.proteinKg,
          minerals_kg: derived.mineralsKg,
          bmi: derived.bmi,
          waist_to_height: derived.waistToHeight,
          waist_to_hip: derived.waistToHip,
          derived: num('body_fat_pct') == null && derived.bodyFatPct != null ? 1 : 0,
          logged_at: at,
        },
        userId,
      )
      setValues({})
      onSaved(res.replaced)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const rows: [string, string | undefined][] = [
    ['Жир', derived.bodyFatPct != null ? `${derived.bodyFatPct} %` : undefined],
    ['Жировая масса', derived.fatMassKg != null ? `${derived.fatMassKg} кг` : undefined],
    ['Безжировая масса', derived.leanMassKg != null ? `${derived.leanMassKg} кг` : undefined],
    ['Скелетные мышцы', derived.skeletalMuscleKg != null ? `${derived.skeletalMuscleKg} кг` : undefined],
    ['Вода', derived.bodyWaterL != null ? `${derived.bodyWaterL} л` : undefined],
    ['Белок', derived.proteinKg != null ? `${derived.proteinKg} кг` : undefined],
    ['Минералы', derived.mineralsKg != null ? `${derived.mineralsKg} кг` : undefined],
    ['ИМТ', derived.bmi != null ? String(derived.bmi) : undefined],
    ['Талия к росту', derived.waistToHeight != null ? String(derived.waistToHeight) : undefined],
    ['Талия к бёдрам', derived.waistToHip != null ? String(derived.waistToHip) : undefined],
  ]
  const shown = rows.filter(([, v]) => v)

  return (
    <Sheet open={open} title="Замер вручную" onClose={onClose}>
      <div className="stack">
        <div className="field">
          <label>Дата</label>
          <input
            className="input"
            type="date"
            value={date}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="row" style={{ gap: 8 }}>
          <div className="field grow">
            <label>Вес, кг</label>
            <input
              className="input"
              inputMode="decimal"
              value={values.weight_kg ?? ''}
              onChange={set('weight_kg')}
              placeholder="—"
              style={{ fontFamily: 'var(--font-num)' }}
            />
          </div>
          <div className="field grow">
            <label>Рост, см</label>
            <input
              className="input"
              inputMode="numeric"
              value={values.height_cm ?? (profile?.height_cm ? String(profile.height_cm) : '')}
              onChange={set('height_cm')}
              placeholder="—"
              style={{ fontFamily: 'var(--font-num)' }}
            />
          </div>
        </div>

        <div className="section-title">Обхваты, см</div>
        <div className="group">
          {girthFields.map((f) => (
            <div className="group-row" key={f.key}>
              <span className="grow">
                <span className="title">{f.label}</span>
                {f.hint && (
                  <span className="sub" style={{ display: 'block' }}>
                    {f.hint}
                  </span>
                )}
              </span>
              <input
                className="input"
                inputMode="decimal"
                value={values[f.key] ?? ''}
                onChange={set(f.key)}
                placeholder="—"
                style={{ width: 84, textAlign: 'center', fontFamily: 'var(--font-num)', padding: '9px 8px' }}
              />
            </div>
          ))}
        </div>

        {!heightCm && (
          <div className="mute-sm" style={{ color: 'var(--warn)' }}>
            Без роста процент жира по обхватам не посчитать — укажите его выше.
          </div>
        )}
        {heightCm && sex === 'ж' && !num('hip_cm') && (
          <div className="mute-sm" style={{ color: 'var(--warn)' }}>
            Для женской формулы нужен обхват таза: без него расчёт занижает жир.
          </div>
        )}

        {shown.length > 0 && (
          <>
            <div className="section-title">Расчёт по обхватам</div>
            <div className="group">
              {shown.map(([label, value]) => (
                <div className="group-row" key={label}>
                  <span className="grow title">{label}</span>
                  <span className="value" style={{ fontFamily: 'var(--font-num)' }}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
            <div className="mute-sm">
              Оценка по методике ВМФ США: погрешность около трёх процентов.
              Отчёт биоимпеданса точнее — если он есть, загрузите его.
            </div>
          </>
        )}

        <div className="field">
          <label>Свой процент жира, если знаете</label>
          <input
            className="input"
            inputMode="decimal"
            value={values.body_fat_pct ?? ''}
            onChange={set('body_fat_pct')}
            placeholder="—"
            style={{ fontFamily: 'var(--font-num)' }}
          />
        </div>

        <button
          className="btn primary block"
          disabled={busy || (!values.weight_kg && derived.bodyFatPct == null)}
          onClick={submit}
        >
          Сохранить замер
        </button>
        <div className="mute-sm" style={{ textAlign: 'center' }}>
          Достаточно веса. Обхваты дадут состав тела без весов с биоимпедансом.
        </div>
      </div>
    </Sheet>
  )
}
