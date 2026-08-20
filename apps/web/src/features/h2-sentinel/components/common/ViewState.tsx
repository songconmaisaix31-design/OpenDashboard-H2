export interface ViewStateProps {
  readonly eyebrow: string
  readonly title: string
  readonly description: string
  readonly actionLabel?: string
  readonly onAction?: () => void
  readonly tone?: 'neutral' | 'error'
}

export function ViewState({
  actionLabel,
  description,
  eyebrow,
  onAction,
  title,
  tone = 'neutral',
}: ViewStateProps) {
  return (
    <main className={`h2-view-state h2-view-state--${tone}`}>
      <div aria-hidden="true" className="h2-view-state__mark">
        H2
      </div>
      <p className="h2-eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{description}</p>
      {actionLabel && onAction ? (
        <button className="h2-button h2-button--primary" onClick={onAction} type="button">
          {actionLabel}
        </button>
      ) : null}
    </main>
  )
}
