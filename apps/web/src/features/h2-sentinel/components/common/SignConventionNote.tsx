import { H2_SIGN_CONVENTIONS } from '../../model/presentation.ts'

export interface SignConventionNoteProps {
  readonly compact?: boolean
}

/** Keeps the two official power directions visible wherever values are interpreted. */
export function SignConventionNote({ compact = false }: SignConventionNoteProps) {
  return (
    <aside
      aria-label="功率符号约定"
      className={compact ? 'h2-sign-convention is-compact' : 'h2-sign-convention'}
    >
      <span className="h2-sign-convention__label">功率符号约定</span>
      <ul>
        {H2_SIGN_CONVENTIONS.map(({ id, label, copy }) => (
          <li key={id}>
            <strong>{label}</strong>
            <span>{copy}</span>
          </li>
        ))}
      </ul>
    </aside>
  )
}
