/**
 * Иконки показателей состава тела. Рисованные, а не эмодзи: эмодзи
 * отрисовываются шрифтом системы, ломают выравнивание и на светлой теме
 * выглядят инородно.
 */

type P = { size?: number; color?: string }

const svg = (size = 20) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
})

export const IcoWeight = ({ size, color }: P) => (
  <svg {...svg(size)} style={{ color }}>
    <path d="M5 8h14l2 12H3z" />
    <circle cx="12" cy="5.5" r="2.5" />
  </svg>
)

export const IcoFat = ({ size, color }: P) => (
  <svg {...svg(size)} style={{ color }}>
    <path d="M12 3c3.5 4 6 6.7 6 10a6 6 0 0 1-12 0c0-3.3 2.5-6 6-10z" />
  </svg>
)

export const IcoMuscle = ({ size, color }: P) => (
  <svg {...svg(size)} style={{ color }}>
    <path d="M3.5 13c0-4 2.5-6.5 6-6.5 2.8 0 4.5 1.6 5.2 3.6l1.8 5c.5 1.4-.4 2.9-1.9 2.9H8.5" />
    <path d="M3.5 13c0 3 1.8 5 4.5 5.2" />
    <path d="M9.5 10.5c1.6 0 2.7 1 3 2.5" />
  </svg>
)

export const IcoWater = ({ size, color }: P) => (
  <svg {...svg(size)} style={{ color }}>
    <path d="M12 3.5c3 3.6 5.5 6.2 5.5 9.2a5.5 5.5 0 0 1-11 0c0-3 2.5-5.6 5.5-9.2z" />
    <path d="M9.5 13.5c0 1.6 1.1 2.8 2.5 3" />
  </svg>
)

export const IcoProtein = ({ size, color }: P) => (
  <svg {...svg(size)} style={{ color }}>
    <ellipse cx="12" cy="13" rx="8" ry="6.5" />
    <circle cx="11" cy="12.5" r="3" />
  </svg>
)

export const IcoBone = ({ size, color }: P) => (
  <svg {...svg(size)} style={{ color }}>
    <path d="M7.5 16.5 16 8" />
    <circle cx="5.6" cy="18.4" r="2.2" />
    <circle cx="8.4" cy="15.6" r="2.2" />
    <circle cx="15.6" cy="8.4" r="2.2" />
    <circle cx="18.4" cy="5.6" r="2.2" />
  </svg>
)

export const IcoVisceral = ({ size, color }: P) => (
  <svg {...svg(size)} style={{ color }}>
    <path d="M8 4v5a4 4 0 0 0 4 4h1a4 4 0 0 1 4 4v3" />
    <path d="M5 8c0 6 3 11 8 12" />
  </svg>
)

export const IcoBmi = ({ size, color }: P) => (
  <svg {...svg(size)} style={{ color }}>
    <path d="M3 17.5 9 11l4 4 8-8.5" />
    <path d="M16 6.5h5v5" />
  </svg>
)

export const IcoLean = ({ size, color }: P) => (
  <svg {...svg(size)} style={{ color }}>
    <circle cx="12" cy="5" r="2.4" />
    <path d="M12 8v7M12 15l-3 6M12 15l3 6M7.5 10.5h9" />
  </svg>
)

export const IcoFlame = ({ size, color }: P) => (
  <svg {...svg(size)} style={{ color }}>
    <path d="M12 3s5 4.5 5 9a5 5 0 0 1-10 0c0-1.5.7-2.8 1.5-3.7.3 1.2 1 2 1.9 2.2C10 8.5 12 6 12 3z" />
  </svg>
)

export const IcoTarget = ({ size, color }: P) => (
  <svg {...svg(size)} style={{ color }}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
  </svg>
)

export const IcoApple = ({ size, color }: P) => (
  <svg {...svg(size)} style={{ color }}>
    <path d="M12 8c-3.5-2-7 .5-7 4.5S8 21 12 21s7-4.5 7-8.5S15.5 6 12 8z" />
    <path d="M12 8V5.5C12 4 13 3 14.5 3" />
  </svg>
)
