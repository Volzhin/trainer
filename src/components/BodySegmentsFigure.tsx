import { useMemo } from 'react'

/**
 * Сегментарный анализ фигурой.
 *
 * Правила подачи заданы дизайн-системой: сегменты — простые геометрические
 * формы с мягкой заливкой и рамкой цветом статуса, появляются от корпуса к
 * конечностям, и пульсирует только худший из них — иначе внимание
 * размазывается по всей карточке и перекос не читается.
 */

export type Seg = { kg: number; pct?: number; status?: string }
export type Segments = Record<string, Seg>

type Kind = 'muscle' | 'fat'

const KEYS = ['trunk', 'left_arm', 'right_arm', 'left_leg', 'right_leg'] as const
type Key = (typeof KEYS)[number]

const LABELS: Record<Key, string> = {
  trunk: 'туловище',
  left_arm: 'левая рука',
  right_arm: 'правая рука',
  left_leg: 'левая нога',
  right_leg: 'правая нога',
}

/**
 * Цвет сегмента. По мышцам «выше нормы» — это хорошо, поэтому они всегда
 * акцентные; по жиру превышение красится предупреждением, а худший сегмент
 * выделяется отдельно. Красный для жира системой запрещён как оценка,
 * он остаётся только маркером «здесь сильнее всего».
 */
function toneOf(kind: Kind, seg: Seg | undefined, worst: boolean): string {
  if (!seg) return 'var(--text-3)'
  if (kind === 'muscle') return seg.status === 'low' ? 'var(--info)' : 'var(--accent-ink)'
  if (worst) return 'var(--danger)'
  return seg.status === 'normal' ? 'var(--ok)' : 'var(--warn)'
}

export function BodySegmentsFigure({
  segments,
  kind,
  unit = 'кг',
}: {
  segments: Segments
  kind: Kind
  unit?: string
}) {
  // Худший сегмент — самое сильное отклонение от нормы вверх.
  const worstKey = useMemo(() => {
    let key: Key | null = null
    let peak = 0
    for (const k of KEYS) {
      const pct = segments[k]?.pct
      if (pct == null) continue
      const excess = kind === 'fat' ? pct - 100 : 0
      if (excess > peak) {
        peak = excess
        key = k
      }
    }
    return peak > 25 ? key : null
  }, [segments, kind])

  const tone = (k: Key) => toneOf(kind, segments[k], k === worstKey)

  /** Заливка — тот же тон, приглушённый: форма читается, но не кричит. */
  const fill = (k: Key) =>
    segments[k] ? `color-mix(in srgb, ${tone(k)} 18%, transparent)` : 'var(--surface-2)'

  const seg = (k: Key, delay: number, node: React.ReactNode) => (
    <g
      className={`seg${k === worstKey ? ' worst' : ''}`}
      style={{ animationDelay: `${delay}ms` }}
      fill={fill(k)}
      stroke={tone(k)}
      strokeWidth={2}
    >
      {node}
    </g>
  )

  return (
    <div className="segments">
      <svg viewBox="0 0 200 260" className="segments-figure" aria-hidden>
        {/* Голова нейтральна: измерений по ней нет, и подсвечивать её нечем. */}
        <circle cx="100" cy="26" r="20" fill="var(--surface-2)" stroke="var(--border)" strokeWidth={2} />

        {/* Появление идёт от корпуса к конечностям — так фигура собирается,
            а не мигает всеми частями разом. */}
        {seg('trunk', 0, <rect x="58" y="54" width="84" height="112" rx="22" />)}
        {seg('left_arm', 50, <rect x="20" y="58" width="28" height="112" rx="14" />)}
        {seg('right_arm', 50, <rect x="152" y="58" width="28" height="112" rx="14" />)}
        {seg('left_leg', 100, <rect x="62" y="174" width="34" height="106" rx="17" />)}
        {seg('right_leg', 100, <rect x="104" y="174" width="34" height="106" rx="17" />)}
      </svg>

      <div className="segments-values">
        {KEYS.map((k) => {
          const s = segments[k]
          return (
            <div key={k} className={`seg-value${k === worstKey ? ' worst' : ''}`}>
              <span className="dot" style={{ background: tone(k) }} />
              <span className="grow">
                <span className="name">{LABELS[k]}</span>
                {s?.pct != null && <span className="pct">{s.pct}% от нормы</span>}
              </span>
              <span className="kg">{s ? `${s.kg} ${unit}` : '—'}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
