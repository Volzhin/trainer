/**
 * Анатомическая фигура для сегментарного анализа.
 *
 * Форма собрана гранёными контурами, как в отчётах биоимпеданса: части тела
 * узнаются с одного взгляда, а грани дают объём без растровой картинки —
 * фигура остаётся векторной, масштабируется и красится токенами темы.
 */

export type SegmentKey = 'left_arm' | 'right_arm' | 'trunk' | 'left_leg' | 'right_leg'

type Props = {
  /** Цвет обводки сегмента: несёт оценку относительно нормы. */
  tone: (key: SegmentKey) => string
  /** Заливка сегмента — тот же тон, приглушённый. */
  fill: (key: SegmentKey) => string
  /** Ключ сегмента, к которому нужно привлечь внимание. */
  worst?: SegmentKey | null
}

/** Контуры частей тела. Координаты в системе 200×360. */
const SHAPES: Record<SegmentKey, { outline: string; facets: string[]; delay: number }> = {
  trunk: {
    outline:
      'M100 60 L128 64 L136 74 L134 96 L128 122 L124 148 L124 172 L118 192 L100 198 L82 192 L76 172 L76 148 L72 122 L66 96 L64 74 L72 64 Z',
    facets: [
      'M100 60 L100 198',
      'M72 64 L100 82 L128 64',
      'M66 96 L100 116 L134 96',
      'M72 122 L100 142 L128 122',
      'M76 172 L100 184 L124 172',
    ],
    delay: 0,
  },
  left_arm: {
    outline:
      'M70 63 L52 70 L43 92 L38 122 L33 152 L28 182 L24 208 L20 226 L34 232 L44 224 L47 198 L51 170 L55 142 L59 114 L63 90 L67 74 Z',
    facets: ['M52 70 L47 100', 'M38 122 L33 152', 'M24 208 L34 224'],
    delay: 60,
  },
  right_arm: {
    outline:
      'M130 63 L148 70 L157 92 L162 122 L167 152 L172 182 L176 208 L180 226 L166 232 L156 224 L153 198 L149 170 L145 142 L141 114 L137 90 L133 74 Z',
    facets: ['M148 70 L153 100', 'M162 122 L167 152', 'M176 208 L166 224'],
    delay: 60,
  },
  left_leg: {
    outline:
      'M98 200 L98 244 L94 282 L92 312 L91 336 L78 340 L71 332 L73 304 L77 272 L81 240 L84 208 Z',
    facets: ['M84 208 L98 230', 'M77 272 L94 282', 'M73 304 L91 320'],
    delay: 120,
  },
  right_leg: {
    outline:
      'M102 200 L102 244 L106 282 L108 312 L109 336 L122 340 L129 332 L127 304 L123 272 L119 240 L116 208 Z',
    facets: ['M116 208 L102 230', 'M123 272 L106 282', 'M127 304 L109 320'],
    delay: 120,
  },
}

/** Голова и кисти нейтральны: измерений по ним нет. */
const NEUTRAL = {
  head: 'M100 6 L113 12 L119 26 L115 42 L100 50 L85 42 L81 26 L87 12 Z',
  neck: 'M93 48 L107 48 L109 62 L91 62 Z',
  headFacets: ['M87 12 L100 24 L113 12', 'M81 26 L100 32 L119 26'],
}

export function BodyFigure({ tone, fill, worst }: Props) {
  return (
    <svg viewBox="0 0 200 360" className="body-figure" aria-hidden>
      <g
        fill="var(--surface-2)"
        stroke="var(--border)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      >
        <path d={NEUTRAL.head} />
        <path d={NEUTRAL.neck} />
        {NEUTRAL.headFacets.map((d, i) => (
          <path key={i} d={d} fill="none" strokeWidth="1" />
        ))}
      </g>

      {(Object.keys(SHAPES) as SegmentKey[]).map((key) => {
        const shape = SHAPES[key]
        return (
          <g
            key={key}
            className={`body-seg${worst === key ? ' worst' : ''}`}
            style={{ animationDelay: `${shape.delay}ms` }}
          >
            <path
              d={shape.outline}
              fill={fill(key)}
              stroke={tone(key)}
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            {/* Грани рисуются тем же тоном вполсилы: объём без лишнего шума. */}
            {shape.facets.map((d, i) => (
              <path
                key={i}
                d={d}
                fill="none"
                stroke={tone(key)}
                strokeWidth="0.9"
                opacity={0.45}
                strokeLinecap="round"
              />
            ))}
          </g>
        )
      })}
    </svg>
  )
}
