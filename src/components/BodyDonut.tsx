/**
 * Кольцо состава тела: доли мышц, белка, минералов, воды и жира.
 * Дуги пропорциональны массе — картинка не врёт о соотношении,
 * в отличие от декоративных колец фиксированной длины.
 */

export type DonutPart = { key: string; label: string; value: number; unit: string; color: string }

type Props = {
  parts: DonutPart[]
  centerLabel: string
  centerValue: string
  status?: string
  statusColor?: string
}

const SIZE = 260
const R = 96
const STROKE = 20
const GAP_DEG = 7

const polar = (deg: number, r = R) => {
  const rad = ((deg - 90) * Math.PI) / 180
  return [SIZE / 2 + r * Math.cos(rad), SIZE / 2 + r * Math.sin(rad)]
}

function arcPath(from: number, to: number): string {
  const [x1, y1] = polar(from)
  const [x2, y2] = polar(to)
  const large = to - from > 180 ? 1 : 0
  return `M${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)}`
}

export function BodyDonut({ parts, centerLabel, centerValue, status, statusColor }: Props) {
  const usable = parts.filter((p) => p.value > 0)
  const total = usable.reduce((a, p) => a + p.value, 0)
  if (!total) return null

  const gaps = usable.length * GAP_DEG
  let cursor = 0

  const arcs = usable.map((p) => {
    const span = ((360 - gaps) * p.value) / total
    const from = cursor + GAP_DEG / 2
    const to = from + span
    cursor = to + GAP_DEG / 2
    const mid = (from + to) / 2
    return { ...p, from, to, mid }
  })

  return (
    <div>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ width: '100%', maxWidth: 300, margin: '0 auto', display: 'block' }}>
        {arcs.map((a) => (
          <path
            key={a.key}
            d={arcPath(a.from, a.to)}
            stroke={a.color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            fill="none"
          />
        ))}

        <text
          x={SIZE / 2}
          y={SIZE / 2 - 14}
          textAnchor="middle"
          fill="var(--text-dim)"
          fontSize="13"
        >
          {centerLabel}
        </text>
        <text
          x={SIZE / 2}
          y={SIZE / 2 + 18}
          textAnchor="middle"
          fill="var(--text)"
          fontSize="30"
          fontWeight="700"
        >
          {centerValue}
        </text>
        {status && (
          <text
            x={SIZE / 2}
            y={SIZE / 2 + 42}
            textAnchor="middle"
            fill={statusColor ?? 'var(--text-mute)'}
            fontSize="12"
            fontWeight="600"
          >
            {status}
          </text>
        )}
      </svg>

      {/* Легенда отдельным списком: подписи по кругу не читаются на узком экране. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(88px, 1fr))',
          gap: 10,
          marginTop: 6,
        }}
      >
        {arcs.map((a) => (
          <div key={a.key} style={{ textAlign: 'center' }}>
            <div style={{ color: a.color, fontWeight: 700, fontSize: 15 }}>
              {a.value}
              <span style={{ fontSize: 11, fontWeight: 500 }}> {a.unit}</span>
            </div>
            <div className="mute-sm" style={{ fontSize: 11 }}>
              {a.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Схематичное тело для сегментарного анализа. */
export function BodySegments({
  segments,
  unit = 'кг',
  color,
}: {
  segments: Record<string, { kg: number; pct?: number; status?: string }>
  unit?: string
  color: string
}) {
  const cell = (key: string, label: string) => {
    const s = segments[key]
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 17 }}>
          {s ? `${s.kg} ${unit}` : '—'}
        </div>
        {s?.pct != null && <div className="mute-sm">{s.pct} %</div>}
        <div className="mute-sm" style={{ fontSize: 10 }}>
          {label}
        </div>
      </div>
    )
  }

  const trunk = segments.trunk

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 92px 1fr',
        alignItems: 'center',
        gap: 10,
      }}
    >
      {cell('left_arm', 'левая рука')}

      <svg viewBox="0 0 60 120" style={{ width: '100%' }} aria-hidden>
        <g fill={color} opacity={0.85}>
          <circle cx="30" cy="12" r="8" />
          <rect x="21" y="23" width="18" height="34" rx="7" />
          <rect x="8" y="25" width="9" height="30" rx="4.5" />
          <rect x="43" y="25" width="9" height="30" rx="4.5" />
          <rect x="21" y="59" width="7.5" height="42" rx="3.7" />
          <rect x="31.5" y="59" width="7.5" height="42" rx="3.7" />
        </g>
      </svg>

      {cell('right_arm', 'правая рука')}

      <div style={{ gridColumn: '1 / -1', textAlign: 'center', marginTop: -6 }}>
        <div style={{ fontWeight: 700, fontSize: 17 }}>
          {trunk ? `${trunk.kg} ${unit}` : '—'}
          {trunk?.pct != null && (
            <span className="mute-sm" style={{ fontWeight: 500 }}> · {trunk.pct} %</span>
          )}
        </div>
        <div className="mute-sm" style={{ fontSize: 10 }}>
          туловище
        </div>
      </div>

      {cell('left_leg', 'левая нога')}
      <div />
      {cell('right_leg', 'правая нога')}
    </div>
  )
}
