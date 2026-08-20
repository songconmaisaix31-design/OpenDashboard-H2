import type { ReactNode } from 'react'

export type H2BadgeTone =
  | 'neutral'
  | 'positive'
  | 'warning'
  | 'danger'
  | 'fixture'
  | 'live'
  | 'planned'

export interface StatusBadgeProps {
  readonly children: ReactNode
  readonly icon?: string
  readonly tone?: H2BadgeTone
}

export function StatusBadge({ children, icon, tone = 'neutral' }: StatusBadgeProps) {
  return (
    <span className={`h2-badge h2-badge--${tone}`}>
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      {children}
    </span>
  )
}
