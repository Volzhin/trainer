import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import type { BodyMetric } from '../db/db'
import { deleteBodyMetric, listBodyMetrics, saveInBodyReport } from '../db/repo'
import { parseInBodyPdf, statusFor, type InBodyReport, type NormStatus } from '../lib/inbody'
import { LineChart } from '../components/LineChart'
import { BodyDonut, BodySegments, type DonutPart } from '../components/BodyDonut'
import { Sheet } from '../components/Sheet'
import { IconBack, IconTrash } from '../components/Icons'
import { formatDate } from '../lib/calc'
import { useApp } from '../store/app'
import { haptics } from '../lib/native'

const C = {
  muscle: '#1f5f5b',
  protein: '#f5c451',
  minerals: '#2bc4c9',
  water: '#7ec8f0',
  fat: '#f26a1b',
  neutral: 'var(--text-dim)',
}

const STATUS_TEXT: Record<NormStatus, string> = {
  low: 'Ниже нормы',
  normal: 'Норма',
  high: 'Выше нормы',
}

const STATUS_COLOR: Record<NormStatus, string> = {
  low: 'var(--accent)',
  normal: 'var(--success)',
  high: 'var(--warn)',
}

/** Метрика экрана: как достать значение, как подписать и каким цветом. */
type Row = {
  key: keyof BodyMetric
  label: string
  unit: string
  color: string
  icon: string
  /** Куда «лучше» двигаться — для окраски дельты. */
  better?: 'up' | 'down'
}

const MAIN: Row[] = [
  { key: 'weight_kg', label: 'Вес', unit: 'кг', color: C.muscle, icon: '⚖️', better: 'down' },
  { key: 'body_fat_pct', label: 'Жир', unit: '%', color: C.fat, icon: '💧', better: 'down' },
  { key: 'skeletal_muscle_kg', label: 'Мышцы', unit: 'кг', color: C.muscle, icon: '💪', better: 'up' },
  { key: 'body_water_l', label: 'Вода', unit: 'л', color: C.water, icon: '💦', better: 'up' },
  { key: 'protein_kg', label: 'Белок', unit: 'кг', color: C.protein, icon: '🥚', better: 'up' },
  { key: 'minerals_kg', label: 'Минералы', unit: 'кг', color: C.minerals, icon: '🦴', better: 'up' },
]

const OTHER: Row[] = [
  { key: 'visceral_fat', label: 'Висцеральный жир', unit: '', color: C.neutral, icon: '🫃', better: 'down' },
  { key: 'bmi', label: 'ИМТ', unit: '', color: C.neutral, icon: '📈', better: 'down' },
  { key: 'fat_free_mass_kg', label: 'Безжировая масса', unit: 'кг', color: C.neutral, icon: '🧍', better: 'up' },
  { key: 'bmr_kcal', label: 'Основной обмен веществ', unit: 'ккал', color: C.neutral, icon: '🔥', better: 'up' },
]

const TRACKABLE = [...MAIN, ...OTHER]

export function BodyComposition() {
  const nav = useNavigate()
  const { toast, userId } = useApp()
  const fileRef = useRef<HTMLInputElement>(null)

  const [pending, setPending] = useState<{ report: InBodyReport; fileName: string } | null>(null)
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
    <div className="screen">
      <div className="header">
        <button className="icon-btn" onClick={() => nav(-1)} aria-label="Назад">
          <IconBack size={18} />
        </button>
        <div className="grow">
          <h1 style={{ fontSize: 22 }}>Состав тела</h1>
          <div className="sub">
            {latest ? formatDate(latest.logged_at) : 'Замеров пока нет'}
          </div>
        </div>
        {scans.length > 1 && (
          <button className="btn sm" onClick={() => setHistoryOpen(true)}>
            Замеры
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,.pdf"
        style={{ display: 'none' }}
        onChange={(e) => onFile(e.target.files?.[0])}
      />

      {!latest && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600 }}>Загрузите отчёт InBody</div>
          <div className="muted" style={{ marginTop: 4 }}>
            PDF из приложения DDX Fitness или распечатку InBody. Разберём состав, нормы и
            сегментарный анализ — и покажем динамику между замерами.
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
            statusColor={weightStatus ? STATUS_COLOR[weightStatus] : undefined}
          />
        </div>
      )}

      {latest && (
        <>
          <div className="section-title">Основные параметры</div>
          <div className="group">
            {MAIN.map((row) => (
              <MetricRow key={String(row.key)} row={row} now={latest} was={previous} />
            ))}
          </div>

          <div className="section-title">Другие</div>
          <div className="group">
            {OTHER.map((row) => (
              <MetricRow key={String(row.key)} row={row} now={latest} was={previous} />
            ))}
          </div>
        </>
      )}

      {latest?.muscle_segments && (
        <>
          <div className="section-title">Анализ тела по сегментам</div>
          <div className="chips" style={{ marginBottom: 10 }}>
            <button
              className={`chip${segTab === 'muscle' ? ' active' : ''}`}
              onClick={() => setSegTab('muscle')}
            >
              Мышцы
            </button>
            <button
              className={`chip${segTab === 'fat' ? ' active' : ''}`}
              onClick={() => setSegTab('fat')}
            >
              Жир
            </button>
          </div>
          <div className="card">
            <BodySegments
              segments={
                (segTab === 'muscle' ? latest.muscle_segments : latest.fat_segments) ?? {}
              }
              color={segTab === 'muscle' ? C.muscle : C.fat}
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
                <span className="avatar">🎯</span>
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
                <span className="avatar">🍎</span>
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
        {busy ? 'Читаю PDF…' : latest ? 'Загрузить новый замер' : 'Загрузить PDF отчёт'}
      </button>

      <Sheet open={!!pending} title="Проверьте данные" onClose={() => setPending(null)}>
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
              Сохранить замер
            </button>
            <div className="mute-sm" style={{ textAlign: 'center' }}>
              Файл никуда не отправляется — разбор идёт прямо на устройстве.
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
    </div>
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

function MetricRow({ row, now, was }: { row: Row; now: BodyMetric; was?: BodyMetric }) {
  const value = now[row.key] as number | undefined
  if (value == null) return null

  const norm = now.norms?.[row.key as string]
  const status = statusFor(value, norm)
  const prev = was?.[row.key] as number | undefined
  const diff = prev != null ? round1(value - prev) : null
  const good = diff == null || diff === 0 ? null : row.better === 'up' ? diff > 0 : diff < 0

  return (
    <div className="group-row">
      <span
        className="avatar"
        style={{ background: row.color, borderColor: row.color, color: '#fff' }}
      >
        {row.icon}
      </span>
      <span className="grow">
        <span className="title">{row.label}</span>
        {status && (
          <span className="sub" style={{ display: 'block' }}>
            {STATUS_TEXT[status]}
          </span>
        )}
      </span>
      <span style={{ textAlign: 'right' }}>
        <span style={{ fontWeight: 700 }}>
          {value}
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
              color: good ? 'var(--success)' : 'var(--danger)',
            }}
          >
            {diff > 0 ? '↗' : '↘'} {Math.abs(diff)}
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
