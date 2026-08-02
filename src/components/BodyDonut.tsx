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
const STROKE = 15
/**
 * Зазор между дугами. Со скруглёнными концами промежуток съедался шапками
 * штриха и кольцо читалось как одна непрерывная линия, поэтому концы
 * прямые, а зазор задан явно.
 */
const GAP_DEG = 5

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
        aria-label={`Анализ тела, ${centerLabel} ${centerValue}`}
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
            strokeLinecap="butt"
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
        <div style={{ textAlign: 'center', marginTop: 2 }}>
          <span className={`status ${statusKind ?? 'normal'}`}>{status}</span>
        </div>
      )}

      {/* Легенда списком: подписи по кругу не читаются на узком экране. */}
      <div
        className="stagger"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(88px, 1fr))',
          gap: '18px 10px',
          marginTop: 22,
        }}
      >
        {arcs.map((a, i) => (
          <div key={a.key} style={{ textAlign: 'center', '--i': i + 3 } as React.CSSProperties}>
            <div
              style={{
                width: 26,
                height: 4,
                borderRadius: 2,
                background: a.color,
                margin: '0 auto 8px',
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
