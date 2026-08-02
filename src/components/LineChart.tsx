type Point = { x: number; y: number }

type Props = {
  data: Point[]
  color?: string
  unit?: string
  height?: number
}

/** Лёгкий SVG-график без внешних библиотек — быстрее грузится в WebView. */
export function LineChart({ data, color = 'var(--accent)', unit = '', height = 170 }: Props) {
  if (data.length === 0) {
    return <div className="empty">Недостаточно данных</div>
  }

  const w = 320
  const h = height
  const padX = 8
  const padTop = 18
  const padBottom = 22

  const xs = data.map((d) => d.x)
  const ys = data.map((d) => d.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const spanX = maxX - minX || 1
  const spanY = maxY - minY || Math.max(1, maxY * 0.1)

  const px = (x: number) => padX + ((x - minX) / spanX) * (w - padX * 2)
  const py = (y: number) => padTop + (1 - (y - minY) / spanY) * (h - padTop - padBottom)

  const single = data.length === 1
  const path = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${px(d.x).toFixed(1)},${py(d.y).toFixed(1)}`).join(' ')
  const area = `${path} L${px(maxX).toFixed(1)},${h - padBottom} L${px(minX).toFixed(1)},${h - padBottom} Z`

  const fmtDate = (ts: number) =>
    new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })

  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img">
      <line x1={padX} y1={h - padBottom} x2={w - padX} y2={h - padBottom} stroke="var(--line)" />
      {!single && (
        <>
          <path d={area} fill={color} opacity={0.12} />
          <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        </>
      )}
      {data.map((d, i) => (
        <circle key={i} cx={px(d.x)} cy={py(d.y)} r={single ? 4 : 2.6} fill={color} />
      ))}

      <text x={padX} y={12} fill="var(--text-mute)" fontSize={10}>
        макс {Math.round(maxY)}
        {unit}
      </text>
      <text x={w - padX} y={12} fill="var(--text-mute)" fontSize={10} textAnchor="end">
        мин {Math.round(minY)}
        {unit}
      </text>
      <text x={padX} y={h - 6} fill="var(--text-mute)" fontSize={10}>
        {fmtDate(minX)}
      </text>
      <text x={w - padX} y={h - 6} fill="var(--text-mute)" fontSize={10} textAnchor="end">
        {fmtDate(maxX)}
      </text>
    </svg>
  )
}

/** Столбчатый график — для недельного тоннажа. */
export function BarChart({ data, labels }: { data: number[]; labels: string[] }) {
  const max = Math.max(1, ...data)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 130, marginTop: 6 }}>
      {data.map((v, i) => (
        <div key={i} style={{ flex: 1, textAlign: 'center' }}>
          <div
            style={{
              height: `${Math.max(2, (v / max) * 100)}px`,
              background: v > 0 ? 'var(--accent)' : 'var(--line)',
              borderRadius: 5,
              transition: 'height 0.3s',
            }}
            title={`${Math.round(v)} кг`}
          />
          <div className="mute-sm" style={{ marginTop: 5, fontSize: 10 }}>
            {labels[i]}
          </div>
        </div>
      ))}
    </div>
  )
}
