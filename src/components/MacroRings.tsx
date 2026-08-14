import type { Nutrients } from '../db/db'
import { useCountUp } from './BodyDonut'
import { t } from '../lib/i18n'

/**
 * Калории кольцом, макронутриенты полосами. Кольцо отвечает на главный
 * вопрос «сколько ещё можно», полосы — на «чего не хватает».
 */
export function MacroRings({
  eaten,
  target,
  macros,
}: {
  eaten: Nutrients
  /** null — цели нет, кольцо остаётся незакрашенным, а полосы без делений. */
  target: number | null
  macros: { protein: number | null; fat: number | null; carbs: number | null }
}) {
  const shown = useCountUp(eaten.kcal, 0, 700)
  const pct = target ? Math.min(1, eaten.kcal / target) : 0
  const over = target != null && target > 0 && eaten.kcal > target

  const R = 62
  const C = 2 * Math.PI * R

  const rows: { label: string; value: number; goal: number | null; color: string }[] = [
    { label: 'Белки', value: eaten.protein, goal: macros.protein, color: 'var(--accent-ink)' },
    { label: 'Жиры', value: eaten.fat, goal: macros.fat, color: 'var(--warn)' },
    { label: 'Углеводы', value: eaten.carbs, goal: macros.carbs, color: 'var(--info)' },
  ]

  return (
    <div>
      <svg viewBox="0 0 160 160" style={{ width: 168, display: 'block', margin: '0 auto' }}>
        <circle cx="80" cy="80" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="12" />
        <circle
          className="arc-draw"
          cx="80"
          cy="80"
          r={R}
          fill="none"
          stroke={over ? 'var(--warn)' : 'var(--accent)'}
          strokeWidth="12"
          strokeLinecap="round"
          transform="rotate(-90 80 80)"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - pct)}
          style={{ ['--dash' as string]: C }}
        />
        <text x="80" y="74" textAnchor="middle" fill="var(--text-2)" fontSize="11">
          {t('съедено')}
        </text>
        <text
          x="80"
          y="99"
          textAnchor="middle"
          className="figures"
          fill="var(--text)"
          fontSize="26"
          fontWeight="700"
        >
          {shown}
        </text>
      </svg>

      <div className="mute-sm" style={{ textAlign: 'center', marginTop: 2 }}>
        {target == null ? t('цель не задана') : `${t('цель')} ${target} ${t('ккал')}`}
      </div>

      <div className="stack" style={{ gap: 12, marginTop: 20 }}>
        {rows.map((r) => (
          <div key={r.label}>
            <div className="row between" style={{ marginBottom: 5 }}>
              <span className="mute-sm">{t(r.label)}</span>
              {/* Без цели показываем только факт: «120 / 0 г» читалось бы
                  как невыполненная норма, которой никто не ставил. */}
              <span className="mute-sm figures">
                {r.goal == null
                  ? `${Math.round(r.value)} ${t('г')}`
                  : `${Math.round(r.value)} / ${r.goal} ${t('г')}`}
              </span>
            </div>
            <div className="bar">
              <i
                style={{
                  width: `${Math.min(100, r.goal ? (r.value / r.goal) * 100 : 0)}%`,
                  background: r.color,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
