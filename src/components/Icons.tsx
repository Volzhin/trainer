type P = { size?: number; className?: string }

const base = (size = 22) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
})

export const IconHome = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
  </svg>
)

/**
 * Шестерёнка. Восемь зубцов рисуем одним путём по окружности, а не восемью
 * прямоугольниками: так контур остаётся ровным на любом размере и не
 * рассыпается на мелких кеглях, где зубцы шириной в полпикселя.
 */
export const IconSettings = ({ size }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
  </svg>
)

export const IconDumbbell = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11" />
  </svg>
)

export const IconList = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
  </svg>
)

/** Камера. Корпус со скошенным плечом под видоискатель и круг объектива. */
export const IconCamera = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M3 8.5a2 2 0 0 1 2-2h2.2l1.3-2h6l1.3 2H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <circle cx="12" cy="13" r="3.4" />
  </svg>
)

export const IconInfo = ({ size }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5" />
    <path d="M12 8h.01" />
  </svg>
)

export const IconChart = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M3 21h18" />
    <path d="M7 21V11M12 21V4M17 21v-6" />
  </svg>
)

export const IconUser = ({ size }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
  </svg>
)

export const IconUsers = ({ size }: P) => (
  <svg {...base(size)}>
    <circle cx="9" cy="8" r="3.4" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M16 5.4a3.4 3.4 0 0 1 0 5.2M17.5 14.2A6.5 6.5 0 0 1 21.5 20" />
  </svg>
)

/**
 * Торт со свечами — день рождения клиента.
 *
 * Огоньки нарисованы точками, а не каплями: при обводке в 1.75 фигура
 * высотой в два пункта заплывает в блямбу, и торт превращался в шарик на
 * ножке. Свечей три — так силуэт узнаётся сразу.
 *
 * Рисунок сдвинут вверх на полтора пункта: со свечами он занимает всю
 * высоту сетки, и, будучи прижатым к низу, в круглой плашке сидел криво —
 * центр фигуры должен совпадать с центром вьюбокса, а не её нижний край.
 */
export const IconCake = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M2.5 19h19" />
    <path d="M19.4 19v-5.9a1.8 1.8 0 0 0-1.8-1.8H6.4a1.8 1.8 0 0 0-1.8 1.8V19" />
    <path d="M4.6 14.8c1 0 1-1.1 2-1.1s1 1.1 2 1.1 1-1.1 2-1.1 1 1.1 2 1.1 1-1.1 2-1.1 1 1.1 2 1.1 1-1.1 2-1.1" />
    <path d="M8.4 8.1v3.2M12 8.1v3.2M15.6 8.1v3.2" />
    <path d="M8.4 5.1h.01M12 5.1h.01M15.6 5.1h.01" />
  </svg>
)

export const IconChat = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M4 5h16v11H9l-5 4z" />
  </svg>
)

export const IconSearch = ({ size }: P) => (
  <svg {...base(size)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
)

export const IconCheck = ({ size }: P) => (
  <svg {...base(size)} strokeWidth={2.6}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </svg>
)

export const IconPlus = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const IconBack = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M15 19l-7-7 7-7" />
  </svg>
)

export const IconClose = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

export const IconMore = ({ size }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="5" r="1.4" fill="currentColor" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" />
    <circle cx="12" cy="19" r="1.4" fill="currentColor" />
  </svg>
)

export const IconTimer = ({ size }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2.5 2M9.5 2h5" />
  </svg>
)

export const IconSwap = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5" />
  </svg>
)

export const IconTrash = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
  </svg>
)

export const IconPlay = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M7 4.5 19 12 7 19.5z" fill="currentColor" />
  </svg>
)

/** Звезда. Залитая — программа уже в своём списке, контурная — ещё нет. */
export const IconStar = ({ size, filled }: P & { filled?: boolean }) => (
  <svg {...base(size)}>
    <path
      d="M12 3.8l2.6 5.27 5.82.85-4.21 4.1.99 5.79L12 17.08l-5.2 2.73.99-5.79-4.21-4.1 5.82-.85z"
      fill={filled ? 'currentColor' : 'none'}
    />
  </svg>
)

/* Личный рекорд — единственное место в приложении, где встречается медь.
   Диск штанги вместо привычного огонька: образ ближе к тому, что человек
   в этот момент реально держит в руках. */
export const IconRecord = ({ size }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

/* Набор в стиле Lucide: контур, штрих 1.75, цвет наследуется. Эмодзи в
   интерфейсе не используем — они рисуются шрифтом системы, ломают
   выравнивание и по-разному выглядят на разных платформах. */

export const IconPause = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M9 5v14M15 5v14" />
  </svg>
)

export const IconMic = ({ size }: P) => (
  <svg {...base(size)}>
    <rect x="9" y="2.5" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6" />
  </svg>
)

export const IconCircleDot = ({ size }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none" />
  </svg>
)

export const IconPaperclip = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M20 11.5 12 19.5a5 5 0 0 1-7-7l8.5-8.5a3.4 3.4 0 0 1 4.8 4.8l-8.4 8.4a1.8 1.8 0 0 1-2.5-2.5l7.8-7.8" />
  </svg>
)

export const IconImage = ({ size }: P) => (
  <svg {...base(size)}>
    <rect x="3" y="4.5" width="18" height="15" rx="3" />
    <circle cx="8.6" cy="10" r="1.6" />
    <path d="m4 17 5-4.5 4.5 4 3-2.5L20 18" />
  </svg>
)

export const IconVideo = ({ size }: P) => (
  <svg {...base(size)}>
    <rect x="2.5" y="6" width="13" height="12" rx="3" />
    <path d="m15.5 11 6-3.2v8.4l-6-3.2z" />
  </svg>
)

export const IconGallery = ({ size }: P) => (
  <svg {...base(size)}>
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <circle cx="8.5" cy="9.5" r="1.6" />
    <path d="m4 17 5-5 4 4 3-2.5 4 3.5" />
  </svg>
)

export const IconClipboard = ({ size }: P) => (
  <svg {...base(size)}>
    <rect x="5" y="4" width="14" height="17" rx="3" />
    <path d="M9 4V3h6v1M9 10h6M9 14h4" />
  </svg>
)

export const IconZap = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z" />
  </svg>
)

export const IconCloudOff = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M6.5 18.5h10a4 4 0 0 0 .8-7.9A6 6 0 0 0 8 8.2" />
    <path d="M3 3l18 18" />
  </svg>
)

export const IconTrend = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M3 16.5 9 10l4 4 8-8.5" />
    <path d="M16 5.5h5v5" />
  </svg>
)

export const IconSparkles = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M12 3.5 13.6 8 18 9.5 13.6 11 12 15.5 10.4 11 6 9.5 10.4 8z" />
    <path d="M18.5 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
  </svg>
)

export const IconArrowUpRight = ({ size }: P) => (
  <svg {...base(size)} strokeWidth={2.2}>
    <path d="M7 17 17 7M8 7h9v9" />
  </svg>
)

export const IconArrowDownRight = ({ size }: P) => (
  <svg {...base(size)} strokeWidth={2.2}>
    <path d="M7 7l10 10M17 8v9H8" />
  </svg>
)

export const IconMuscle = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M3.5 13c0-4 2.5-6.5 6-6.5 2.8 0 4.5 1.6 5.2 3.6l1.8 5c.5 1.4-.4 2.9-1.9 2.9H8.5" />
    <path d="M3.5 13c0 3 1.8 5 4.5 5.2" />
  </svg>
)

export const IconTeacher = ({ size }: P) => (
  <svg {...base(size)}>
    <circle cx="9" cy="7" r="3.2" />
    <path d="M3 20a6 6 0 0 1 12 0" />
    <path d="M16.5 5.5h5v7h-5z" />
  </svg>
)

export const IconChevronRight = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="m9 5 7 7-7 7" />
  </svg>
)

export const IconRepeat = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M4 9V8a3 3 0 0 1 3-3h10l-2.5-2.5M20 15v1a3 3 0 0 1-3 3H7l2.5 2.5" />
  </svg>
)

export const IconCalendar = ({ size }: P) => (
  <svg {...base(size)}>
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
)

export const IconApple = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M12 8.2c-3.4-2-6.8.4-6.8 4.4 0 4 2.9 8.4 6.8 8.4s6.8-4.4 6.8-8.4c0-4-3.4-6.4-6.8-4.4z" />
    <path d="M12 8.2V5.6C12 4.2 13.1 3 14.6 3" />
  </svg>
)

/**
 * Ручка перетаскивания. Точками, а не стрелками вверх-вниз: стрелки обещают
 * два нажатия, а здесь берут и тащат.
 */
export const IconGrip = ({ size }: P) => (
  <svg {...base(size)} fill="currentColor" stroke="none">
    <circle cx="9" cy="6" r="1.5" />
    <circle cx="15" cy="6" r="1.5" />
    <circle cx="9" cy="12" r="1.5" />
    <circle cx="15" cy="12" r="1.5" />
    <circle cx="9" cy="18" r="1.5" />
    <circle cx="15" cy="18" r="1.5" />
  </svg>
)

/** Карандаш — правка того, что написано словами: комментарий, заметка. */
export const IconPencil = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16v4z" />
    <path d="m13.5 6.5 4 4" />
  </svg>
)
