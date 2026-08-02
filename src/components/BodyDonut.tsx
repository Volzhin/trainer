import { useEffect, useRef, useState } from 'react'

/**
 * Кольцо состава тела: доли мышц, белка, минералов, воды и жира.
 * Дуги пропорциональны массе — картинка не врёт о соотношении, в отличие
 * от декоративных колец фиксированной длины. Каждая дуга прочерчивается
 * при появлении, поэтому кольцо читается как «замер собирается».
 */

export type DonutPart = { key: string; label: string; value: number; unit: string; color: string }

type Props = {
  parts: DonutPart[]
  centerLabel: string
  centerValue: string
  status?: string
  statusKind?: 'normal' | 'high' | 'low'
}

const SIZE = 240
const R = 88
const STROKE = 16
const GAP_DEG = 6

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

/** Плавный счёт числа при появлении — глаз успевает заметить величину. */
export function useCountUp(target: number, decimals = 1, duration = 900) {
  const [value, setValue] = useState(0)
  const raf = useRef(0)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target)
      return
    }
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      // easeOutCubic: быстрый разгон и мягкая остановка на конечном числе.
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(target * eased)
      if (t < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [target, duration])

  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

export function BodyDonut({ parts, centerLabel, centerValue, status, statusKind }: Props) {
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
    // Длина дуги нужна, чтобы прочертить её через stroke-dash.
    const length = (Math.PI * R * span) / 180
    return { ...p, from, to, length }
  })

  return (
    <div>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        style={{ width: '100%', maxWidth: 280, margin: '0 auto', display: 'block' }}
        role="img"
        aria-label={`Состав тела, ${centerLabel} ${centerValue}`}
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="var(--line-soft)"
          strokeWidth={STROKE}
        />

        {arcs.map((a, i) => (
          <path
            key={a.key}
            className="arc-draw"
            d={arcPath(a.from, a.to)}
            stroke={a.color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            fill="none"
            style={
              {
                '--dash': a.length,
                strokeDasharray: a.length,
                animationDelay: `${i * 90}ms`,
              } as React.CSSProperties
            }
          />
        ))}

        <text x={SIZE / 2} y={SIZE / 2 - 12} textAnchor="middle" fill="var(--text-dim)" fontSize="12">
          {centerLabel}
        </text>
        <text
          x={SIZE / 2}
          y={SIZE / 2 + 16}
          textAnchor="middle"
          fill="var(--text)"
          fontSize="27"
          fontWeight="700"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {centerValue}
        </text>
      </svg>

      {status && (
        <div style={{ textAlign: 'center', marginTop: -6 }}>
          <span className={`status ${statusKind ?? 'normal'}`}>{status}</span>
        </div>
      )}

      {/* Легенда списком: подписи по кругу не читаются на узком экране. */}
      <div
        className="stagger"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(76px, 1fr))',
          gap: 10,
          marginTop: 14,
        }}
      >
        {arcs.map((a, i) => (
          <div key={a.key} style={{ textAlign: 'center', '--i': i + 3 } as React.CSSProperties}>
            <div
              style={{
                width: 22,
                height: 3,
                borderRadius: 2,
                background: a.color,
                margin: '0 auto 6px',
              }}
            />
            <div style={{ fontWeight: 700, fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>
              {a.value}
              <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-mute)' }}>
                {' '}
                {a.unit}
              </span>
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

type Seg = { kg: number; pct?: number; status?: string }

const STATUS_CLASS: Record<string, string> = {
  normal: 'normal',
  high: 'high',
  low: 'low',
}

const STATUS_LABEL: Record<string, string> = {
  normal: 'норма',
  high: 'выше',
  low: 'ниже',
}

/**
 * Сегментарный анализ. Части фигуры подсвечиваются цветом метрики с
 * непрозрачностью по отклонению от нормы — видно, где перекос, без чтения цифр.
 */
export function BodySegments({
  segments,
  unit = 'кг',
  color,
}: {
  segments: Record<string, Seg>
  unit?: string
  color: string
}) {
  const opacity = (s?: Seg) => (!s ? 0.12 : s.status === 'normal' ? 0.55 : 0.9)

  const Value = ({ k, label, align }: { k: string; label: string; align: 'left' | 'right' }) => {
    const s = segments[k]
    return (
      <div style={{ textAlign: align }}>
        <div style={{ fontWeight: 700, fontSize: 16, fontVariantNumeric: 'tabular-nums' }}>
          {s ? `${s.kg} ${unit}` : '—'}
        </div>
        {s?.pct != null && (
          <div className="mute-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {s.pct} %
          </div>
        )}
        {s?.status && (
          <span className={`status ${STATUS_CLASS[s.status] ?? 'normal'}`} style={{ marginTop: 3 }}>
            {STATUS_LABEL[s.status] ?? ''}
          </span>
        )}
        <div className="mute-sm" style={{ fontSize: 10, marginTop: 2 }}>
          {label}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 104px 1fr',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Value k="left_arm" label="левая рука" align="right" />

        {/* Обводка цветом карточки разделяет части: без неё руки сливаются
            с корпусом в один силуэт. */}
        <svg
          viewBox="0 0 64 132"
          style={{ width: '100%' }}
          aria-hidden
          className="enter"
          stroke="var(--bg-elev)"
          strokeWidth="1.6"
        >
          {/* Голова и корпус нейтральны, конечности окрашены по данным. */}
          <circle cx="32" cy="13" r="9" fill="var(--text-mute)" opacity={0.35} />
          <rect
            x="22"
            y="25"
            width="20"
            height="38"
            rx="8"
            fill={color}
            opacity={opacity(segments.trunk)}
          />
          <rect
            x="4"
            y="27"
            width="11"
            height="34"
            rx="5"
            fill={color}
            opacity={opacity(segments.left_arm)}
          />
          <rect
            x="49"
            y="27"
            width="11"
            height="34"
            rx="5"
            fill={color}
            opacity={opacity(segments.right_arm)}
          />
          <rect
            x="22"
            y="66"
            width="8.5"
            height="48"
            rx="4.2"
            fill={color}
            opacity={opacity(segments.left_leg)}
          />
          <rect
            x="33.5"
            y="66"
            width="8.5"
            height="48"
            rx="4.2"
            fill={color}
            opacity={opacity(segments.right_leg)}
          />
        </svg>

        <Value k="right_arm" label="правая рука" align="left" />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 104px 1fr',
          alignItems: 'start',
          gap: 12,
          marginTop: 6,
        }}
      >
        <Value k="left_leg" label="левая нога" align="right" />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 16, fontVariantNumeric: 'tabular-nums' }}>
            {segments.trunk ? `${segments.trunk.kg} ${unit}` : '—'}
          </div>
          {segments.trunk?.pct != null && (
            <div className="mute-sm">{segments.trunk.pct} %</div>
          )}
          <div className="mute-sm" style={{ fontSize: 10 }}>
            туловище
          </div>
        </div>
        <Value k="right_leg" label="правая нога" align="left" />
      </div>
    </div>
  )
}
