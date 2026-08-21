import type { ReactNode } from 'react'

import { H2Icon, type H2IconName } from './H2Icon.tsx'

export interface StackWidgetProps {
  readonly children: ReactNode
  readonly eyebrow?: string
  readonly footer?: ReactNode
  readonly icon: H2IconName
  readonly title: string
  readonly tone?: 'default' | 'accent' | 'safe'
}

export function StackWidget({
  children,
  eyebrow,
  footer,
  icon,
  title,
  tone = 'default',
}: StackWidgetProps) {
  return (
    <section className={`h2-stack-widget h2-stack-widget--${tone}`}>
      <header className="h2-stack-widget__header">
        <span className="h2-stack-widget__icon">
          <H2Icon name={icon} size={16} />
        </span>
        <div>
          {eyebrow ? <p>{eyebrow}</p> : null}
          <h2>{title}</h2>
        </div>
      </header>
      <div className="h2-stack-widget__body">{children}</div>
      {footer ? <footer className="h2-stack-widget__footer">{footer}</footer> : null}
    </section>
  )
}

export function StackWidgetRow({
  label,
  value,
}: {
  readonly label: string
  readonly value: ReactNode
}) {
  return (
    <div className="h2-stack-widget__row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
