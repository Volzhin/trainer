import { useEffect, useRef, useState } from 'react'
import { t } from '../lib/i18n'

/**
 * cells — показания точки по столбцам. Столбцы у всех рядов одинаковые по
 * смыслу (например, слева доля в процентах, справа абсолютное значение),
 * поэтому глаз сравнивает ряды по вертикали, не разбирая каждый заново.
 */
type Point = { x: number; y: number; cells?: (string | null)[] }

/** Границы нормы из отчёта — чтобы по графику было видно не только «куда
    движемся», но и «куда надо». */
type Norm = { min: number; max: number }

type Series = { data: Point[]; color?: string; unit?: string; label?: string; norm?: Norm }

type Props = {
  data: Point[]
  color?: string
  unit?: string
  label?: string
  norm?: Norm
  height?: number
  /** Второй ряд со своей шкалой Y справа. */
  second?: Series
}

/** Лёгкий SVG-график без внешних библиотек — быстрее грузится в WebView. */
export function LineChart({
  data,
  color = 'var(--accent)',
  unit = '',
  label,
  norm,
  height = 170,
  second,
}: Props) {
  // Выбранная точка. Объявлено до раннего возврата: иначе на пустых данных
  // порядок хуков разъедется.
  const [active, setActive] = useState<number | null>(null)

  /**
   * Прочерк линии идёт сдвигом dashoffset, поэтому штрих должен быть длиной
   * со всю ломаную. Длину меряем у самого пути: на шумных рядах веса ломаная
   * набирает заметно больше единиц viewBox, чем любое значение «на глаз», и
   * хвост линии остался бы в пропуске между штрихами.
   */
  const pathRef = useRef<SVGPathElement>(null)
  const [dash, setDash] = useState<number | null>(null)
  useEffect(() => {
    const el = pathRef.current
    setDash(typeof el?.getTotalLength === 'function' ? el.getTotalLength() : null)
  }, [data, height])

  if (data.length === 0) {
    return <div className="empty">{t('Недостаточно данных')}</div>
  }

  const w = 320
  const h = height
  const padX = 8
  const padTop = 18
  const padBottom = 22

  const hasSecond = !!second && second.data.length > 0
  const secondColor = second?.color ?? 'var(--info)'
  const secondUnit = second?.unit ?? ''

  /**
   * Шкала X общая — иначе ряды разъедутся по времени и сравнивать их будет
   * не с чем. Шкалы Y у каждого своя: вес в килограммах и жир в процентах
   * на одной оси превратились бы в прямую и щепку.
   */
  const allX = hasSecond ? [...data, ...second!.data].map((d) => d.x) : data.map((d) => d.x)
  const minX = Math.min(...allX)
  const maxX = Math.max(...allX)
  const spanX = maxX - minX || 1
  const px = (x: number) => padX + ((x - minX) / spanX) * (w - padX * 2)

  /**
   * Границы нормы входят в шкалу наравне со значениями: если все замеры выше
   * нормы, полоса иначе оказалась бы за краем — то есть ровно в том случае,
   * когда она нужнее всего.
   */
  const scaleOf = (pts: Point[], n?: Norm) => {
    const values = pts.map((d) => d.y)
    // Разброс замеров и границы шкалы — разные вещи. Подписи по краям должны
    // показывать первое: «62–84.6 кг» читалось бы как «вес доходил до 62»,
    // хотя 62 — это нижняя граница нормы, а не чей-то замер.
    const dmin = Math.min(...values)
    const dmax = Math.max(...values)
    const ys = [...values, ...(n ? [n.min, n.max] : [])]
    const min = Math.min(...ys)
    const max = Math.max(...ys)
    const span = max - min || Math.max(1, max * 0.1)
    return {
      dmin,
      dmax,
      py: (y: number) => padTop + (1 - (y - min) / span) * (h - padTop - padBottom),
    }
  }

  const a = scaleOf(data, norm)
  const b = hasSecond ? scaleOf(second!.data, second!.norm) : null

  const lineOf = (pts: Point[], py: (y: number) => number) =>
    pts
      .map((d, i) => `${i === 0 ? 'M' : 'L'}${px(d.x).toFixed(1)},${py(d.y).toFixed(1)}`)
      .join(' ')

  const single = data.length === 1
  const path = lineOf(data, a.py)
  const area = `${path} L${px(data[data.length - 1].x).toFixed(1)},${h - padBottom} L${px(data[0].x).toFixed(1)},${h - padBottom} Z`

  const fmtDate = (ts: number) =>
    new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })

  const fmtVal = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))

  const nearestTo = (pts: Point[], x: number) =>
    pts.reduce((best, p) => (Math.abs(p.x - x) < Math.abs(best.x - x) ? p : best), pts[0])

  /**
   * Ближайшая точка по горизонтали. preserveAspectRatio="none" растягивает
   * систему координат линейно, поэтому доля от ширины переводится в единицы
   * viewBox простым умножением.
   */
  const pickNearest = (clientX: number, box: DOMRect) => {
    if (!box.width) return
    const vx = ((clientX - box.left) / box.width) * w
    let best = 0
    for (let i = 1; i < data.length; i++) {
      if (Math.abs(px(data[i].x) - vx) < Math.abs(px(data[best].x) - vx)) best = i
    }
    setActive(best)
  }

  const onPointer = (e: React.PointerEvent<HTMLDivElement>) =>
    pickNearest(e.clientX, e.currentTarget.getBoundingClientRect())

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const step = e.key === 'ArrowRight' ? 1 : -1
      setActive((prev) => {
        const from = prev ?? data.length - 1
        return Math.min(data.length - 1, Math.max(0, from + step))
      })
    } else if (e.key === 'Escape') {
      setActive(null)
    }
  }

  /**
   * Без наведения показываем последний замер, а не пустоту: блок показаний
   * стоит на месте всегда, ничего не подпрыгивает, и в покое видно то, что
   * человека и интересует — как дела сейчас.
   */
  const idx = Math.min(active ?? data.length - 1, data.length - 1)
  const point = data[idx]
  // Второй ряд меряют в свои дни, поэтому берём его ближайшую точку, а не ту
  // же по счёту: иначе показания были бы от другой даты.
  const pointB = hasSecond ? nearestTo(second!.data, point.x) : undefined

  const cellsOf = (p: Point, u: string) => p.cells ?? [null, `${fmtVal(p.y)}${u}`]
  const normText = (n?: Norm, u = '') =>
    n ? `норма ${fmtVal(n.min)}–${fmtVal(n.max)}${u}` : undefined
  const readout = [
    { color, label, cells: cellsOf(point, unit), norm: normText(norm, unit) },
    ...(pointB
      ? [
          {
            color: secondColor,
            label: second?.label,
            cells: cellsOf(pointB, secondUnit),
            norm: normText(second?.norm, secondUnit),
          },
        ]
      : []),
  ]
  // Пустой столбец не занимает места: у веса доли в процентах нет, и держать
  // под неё пробел в каждой строке незачем.
  const colCount = Math.max(...readout.map((r) => r.cells.length))
  const cols = Array.from({ length: colCount }, (_, i) => i).filter((i) =>
    readout.some((r) => r.cells[i]),
  )

  return (
    <div className="chart-block">
      <div className="chart-readout">
        <div className="chart-readout-date">{fmtDate(point.x)}</div>
        {readout.map((r, i) => (
          <div className="chart-readout-row" key={i}>
            {/* Образец нужен, только когда рядов два: у одиночного графика
                различать нечего. */}
            {hasSecond && (
              <i
                className="chart-swatch"
                style={{ background: r.color }}
                data-dashed={i === 1}
              />
            )}
            {r.label && <span className="chart-readout-name">{r.label}</span>}
            {cols.map((c) => (
              <span className="chart-readout-cell" key={c}>
                {r.cells[c] ?? ''}
              </span>
            ))}
            {r.norm && <span className="chart-readout-norm">{r.norm}</span>}
          </div>
        ))}
      </div>

      <div
        className="chart-wrap"
        tabIndex={0}
        role="group"
        aria-label={readout
          .map((r) => [r.label, ...r.cells.filter(Boolean)].filter(Boolean).join(' '))
          .concat(fmtDate(point.x))
          .join(', ')}
        onPointerDown={onPointer}
        onPointerMove={onPointer}
        onPointerLeave={() => setActive(null)}
        onPointerCancel={() => setActive(null)}
        onKeyDown={onKey}
      >
        <svg className="chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img">
          <line
            x1={padX}
            y1={h - padBottom}
            x2={w - padX}
            y2={h - padBottom}
            stroke="var(--border)"
          />
          {/* Полоса нормы рисуется первой — она подложка, а не поверх линий.
              При двух рядах закрашиваем только норму первого: шкалы у рядов
              разные, и две полосы в одном поле означали бы разное, накладываясь
              друг на друга. Норма второго остаётся текстом в показаниях. */}
          {norm && (
            <rect
              x={padX}
              y={a.py(norm.max)}
              width={w - padX * 2}
              height={Math.max(1, a.py(norm.min) - a.py(norm.max))}
              fill={color}
              opacity={0.1}
            />
          )}

          {!single && (
            <>
              <path d={area} fill={color} opacity={0.12} />
              <path
                ref={pathRef}
                className="arc-draw"
                d={path}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinejoin="round"
                style={
                  {
                    // До первого замера длины берём заведомо большое число:
                    // короткую линию оно прочерчивает целиком.
                    strokeDasharray: dash ?? 1400,
                    '--dash': dash ?? 1400,
                  } as React.CSSProperties
                }
              />
            </>
          )}

          {/* Второй ряд — пунктиром: на чёрно-белом снимке экрана и людям с
              нарушением цветовосприятия цвет один ряд от другого не отличит. */}
          {b && second!.data.length > 1 && (
            <path
              d={lineOf(second!.data, b.py)}
              fill="none"
              stroke={secondColor}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeDasharray="5 4"
            />
          )}

          {data.map((d, i) => (
            <circle key={i} cx={px(d.x)} cy={a.py(d.y)} r={single ? 4 : 2.6} fill={color} />
          ))}
          {b &&
            second!.data.map((d, i) => (
              <circle key={`b${i}`} cx={px(d.x)} cy={b.py(d.y)} r={2.6} fill={secondColor} />
            ))}

          <line
            x1={px(point.x)}
            y1={padTop}
            x2={px(point.x)}
            y2={h - padBottom}
            stroke="var(--border-strong)"
          />
        </svg>

        {/* Подписи осей — разметкой. Внутри svg их растягивало вместе с
            системой координат, и буквы разъезжались по горизонтали. */}
        {!hasSecond ? (
          <>
            <span className="chart-axis tl">
              макс {Math.round(a.dmax)}
              {unit}
            </span>
            <span className="chart-axis tr">
              мин {Math.round(a.dmin)}
              {unit}
            </span>
          </>
        ) : (
          <>
            {/* Диапазон своей оси и своим цветом: слева первый ряд, справа второй. */}
            <span className="chart-axis tl" style={{ color }}>
              {fmtVal(a.dmin)}–{fmtVal(a.dmax)}
              {unit}
            </span>
            <span className="chart-axis tr" style={{ color: secondColor }}>
              {fmtVal(b!.dmin)}–{fmtVal(b!.dmax)}
              {secondUnit}
            </span>
          </>
        )}
        <span className="chart-axis bl">{fmtDate(minX)}</span>
        <span className="chart-axis br">{fmtDate(maxX)}</span>

        {/* Выбранные точки — разметкой: preserveAspectRatio="none" растягивает
            систему координат по горизонтали, и круг в svg выходит эллипсом. */}
        <i
          className="chart-dot"
          style={{
            left: `${(px(point.x) / w) * 100}%`,
            top: `${(a.py(point.y) / h) * 100}%`,
            background: color,
          }}
          aria-hidden
        />
        {pointB && b && (
          <i
            className="chart-dot"
            style={{
              left: `${(px(pointB.x) / w) * 100}%`,
              top: `${(b.py(pointB.y) / h) * 100}%`,
              background: secondColor,
            }}
            aria-hidden
          />
        )}
      </div>

      {/* Легенда с образцами линий: при двух шкалах мало знать цвет — нужно
          понимать, по какой оси читать ряд. */}
      {hasSecond && label && second?.label && (
        <div className="chart-legend">
          <span className="chart-legend-item">
            <i className="chart-swatch" style={{ background: color }} />
            {label} <span className="mute-sm">{t('слева')}</span>
          </span>
          <span className="chart-legend-item">
            <i className="chart-swatch" style={{ background: secondColor }} data-dashed />
            {second.label} <span className="mute-sm">{t('справа')}</span>
          </span>
        </div>
      )}
    </div>
  )
}

/** Столбчатый график — для недельного тоннажа. */
export function BarChart({ data, labels }: { data: number[]; labels: string[] }) {
  const max = Math.max(1, ...data)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 130, marginTop: 8 }}>
      {data.map((v, i) => (
        <div key={i} style={{ flex: 1, textAlign: 'center' }}>
          <div
            className="bar-col"
            style={
              {
                height: `${Math.max(2, (v / max) * 100)}px`,
                background: v > 0 ? 'var(--accent)' : 'var(--border)',
                borderRadius: 5,
                '--i': i,
              } as React.CSSProperties
            }
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
