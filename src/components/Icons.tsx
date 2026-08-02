type P = { size?: number; className?: string }

const base = (size = 22) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
})

export const IconHome = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
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

export const IconFlame = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M12 3s5 4.5 5 9a5 5 0 0 1-10 0c0-1.5.7-2.8 1.5-3.7.3 1.2 1 2 1.9 2.2C10 8.5 12 6 12 3z" />
  </svg>
)
