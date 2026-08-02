import type { ReactNode } from 'react'

/**
 * Сгруппированный список в духе системных настроек iOS.
 * Одна рамка на группу вместо рамки на каждый элемент — экран
 * перестаёт выглядеть как россыпь карточек.
 */
export function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <>
      {title && <div className="section-title">{title}</div>}
      <div className="group">{children}</div>
    </>
  )
}

const Chevron = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

type RowProps = {
  icon?: ReactNode
  title: string
  sub?: string
  value?: ReactNode
  onClick?: () => void
  /** Показать шеврон — строка ведёт дальше. */
  chevron?: boolean
  danger?: boolean
  children?: ReactNode
}

export function Row({ icon, title, sub, value, onClick, chevron, danger, children }: RowProps) {
  const content = (
    <>
      {icon && <span className="avatar">{icon}</span>}
      <span className="grow">
        <span className="title" style={danger ? { color: 'var(--danger)' } : undefined}>
          {title}
        </span>
        {sub && (
          <span className="sub" style={{ display: 'block' }}>
            {sub}
          </span>
        )}
      </span>
      {value != null && <span className="value">{value}</span>}
      {children}
      {chevron && (
        <span className="chevron">
          <Chevron />
        </span>
      )}
    </>
  )

  if (onClick) {
    return (
      <button className="group-row" onClick={onClick}>
        {content}
      </button>
    )
  }
  return <div className="group-row">{content}</div>
}

/** Крупная метрика без рамки: число держит иерархию само. */
export function Metric({ num, cap, accent }: { num: ReactNode; cap: string; accent?: string }) {
  return (
    <div className="metric">
      <div className="num" style={accent ? { color: accent } : undefined}>
        {num}
      </div>
      <div className="cap">{cap}</div>
    </div>
  )
}

export function Bar({
  value,
  max,
  onAccent,
}: {
  value: number
  max: number
  onAccent?: boolean
}) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100))
  return (
    <div className={`bar${onAccent ? ' on-accent' : ''}`}>
      <i
        style={{
          width: `${pct}%`,
          background: !onAccent && pct >= 100 ? 'var(--success)' : undefined,
        }}
      />
    </div>
  )
}
