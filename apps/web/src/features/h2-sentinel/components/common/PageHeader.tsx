import type { ReactNode } from 'react'

export interface PageHeaderProps {
  readonly eyebrow: string
  readonly title: string
  readonly description: string
  readonly actions?: ReactNode
}

export function PageHeader({ actions, description, eyebrow, title }: PageHeaderProps) {
  return (
    <header className="h2-page-header">
      <div>
        <p className="h2-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className="h2-page-header__actions">{actions}</div> : null}
    </header>
  )
}
