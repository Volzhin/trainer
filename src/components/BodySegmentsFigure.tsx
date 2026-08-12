import { useMemo } from 'react'
import { BodyFigure, type SegmentKey } from './BodyFigure'
import { t } from '../lib/i18n'

/**
 * Сегментарный анализ. Значения стоят у своих частей тела — слева от левой
 * руки, справа от правой, туловище по центру: так цифра читается вместе с
 * местом, а не через сопоставление со списком.
 */

export type Seg = { kg: number; pct?: number; status?: string }
export type Segments = Record<string, Seg>

type Kind = 'muscle' | 'fat'

const STATUS_TEXT: Record<string, string> = {
  normal: 'Норма',
  high: 'Выше нормы',
  low: 'Ниже нормы',
}

/**
 * Тон сегмента. По мышцам «выше нормы» — достижение, поэтому они акцентные;
 * по жиру превышение красится предупреждением, а красный достаётся только
 * худшему сегменту как указатель, а не как приговор.
 */
function toneOf(kind: Kind, seg: Seg | undefined, worst: boolean): string {
  if (!seg) return 'var(--text-3)'
  if (kind === 'muscle') return seg.status === 'low' ? 'var(--info)' : 'var(--accent-ink)'
  if (worst) return 'var(--danger)'
  return seg.status === 'normal' ? 'var(--ok)' : 'var(--warn)'
}

/** Класс чипа: у мышц норма и превышение одинаково хороши. */
function chipClass(kind: Kind, seg: Seg | undefined): string {
  if (!seg?.status) return 'normal'
  if (kind === 'muscle') return seg.status === 'low' ? 'low' : 'normal'
  return seg.status === 'normal' ? 'normal' : 'high'
}

export function BodySegmentsFigure({
  segments,
  kind,
  total,
  unit = 'кг',
}: {
  segments: Segments
  kind: Kind
  /** Общая масса показателя — заголовок карточки. */
  total?: number
  unit?: string
}) {
  const worst = useMemo<SegmentKey | null>(() => {
    if (kind !== 'fat') return null
    let key: SegmentKey | null = null
    let peak = 0
    for (const k of [
      'left_arm',
      'right_arm',
      'trunk',
      'left_leg',
      'right_leg',
    ] as SegmentKey[]) {
      const pct = segments[k]?.pct
      if (pct == null) continue
      if (pct - 100 > peak) {
        peak = pct - 100
        key = k
      }
    }
    return peak > 25 ? key : null
  }, [segments, kind])

  const tone = (k: SegmentKey) => toneOf(kind, segments[k], k === worst)
  const fill = (k: SegmentKey) =>
    segments[k] ? `color-mix(in srgb, ${tone(k)} 16%, transparent)` : 'var(--surface-2)'

  const Value = ({
    k,
    align,
    label,
  }: {
    k: SegmentKey
    align: 'left' | 'right'
    label: string
  }) => {
    const s = segments[k]
    return (
      <div className={`seg-cell ${align}`}>
        <div className="part">{label}</div>
        <div className="kg">{s ? `${s.kg} ${unit}` : '—'}</div>
        {s?.pct != null && <div className="pct">{s.pct} %</div>}
        {s?.status && (
          <span className={`status ${chipClass(kind, s)}`}>{STATUS_TEXT[s.status]}</span>
        )}
      </div>
    )
  }

  const trunk = segments.trunk

  return (
    <div className="body-panel">
      {total != null && (
        <div className="row between mb-1">
          <span className="mute-sm">
            {kind === 'muscle' ? 'Содержание мышц' : 'Содержание жира'}
          </span>
          <span style={{ fontFamily: 'var(--font-num)', fontWeight: 700 }}>
            {total} {unit}
          </span>
        </div>
      )}

      <div className="body-grid">
        <Value k="left_arm" align="right" label={t('левая рука')} />
        <div className="body-figure-wrap">
          <BodyFigure tone={tone} fill={fill} worst={worst} />
        </div>
        <Value k="right_arm" align="left" label={t('правая рука')} />

        <Value k="left_leg" align="right" label={t('левая нога')} />
        <Value k="right_leg" align="left" label={t('правая нога')} />
      </div>

      {/* Туловище — отдельной строкой, а не надписью поверх фигуры: цифра
          на теле перекрывала сегменты и мешала видеть их окраску. */}
      {trunk && (
        <div className="trunk-row">
          <span className="metric-icon" style={{ color: tone('trunk') }}>
            <span className="trunk-mark" style={{ background: tone('trunk') }} />
          </span>
          <span className="grow">
            <span className="part">{t('туловище')}</span>
            {trunk.status && (
              <span className={`status ${chipClass(kind, trunk)}`} style={{ marginLeft: 8 }}>
                {STATUS_TEXT[trunk.status]}
              </span>
            )}
          </span>
          <span style={{ textAlign: 'right' }}>
            <span className="kg">
              {trunk.kg} {unit}
            </span>
            {trunk.pct != null && <span className="pct"> · {trunk.pct} %</span>}
          </span>
        </div>
      )}
    </div>
  )
}
