import type { ReactNode } from 'react'

import { H2Icon, type H2IconName } from './H2Icon.tsx'

export interface PageHeaderProps {
  readonly eyebrow: string
  readonly title: string
  readonly description: string
  readonly actions?: ReactNode
  readonly icon?: H2IconName
}

export function PageHeader({
  actions,
  description,
  eyebrow,
  icon = 'sparkles',
  title,
}: PageHeaderProps) {
  return (
    <header className="h2-page-header">
      <span aria-hidden="true" className="h2-page-header__icon">
        <H2Icon name={icon} size={24} />
      </span>
      <div className="h2-page-header__copy">
        <p className="h2-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className="h2-page-header__actions">{actions}</div> : null}
      <span aria-hidden="true" className="h2-page-header__ornament" />
    </header>
  )
}
