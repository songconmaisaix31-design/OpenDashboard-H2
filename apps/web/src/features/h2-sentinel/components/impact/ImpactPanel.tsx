import type { H2AnomalyEvent } from '../../../../../../../packages/h2-contracts/src/index.ts'
import { formatH2Number } from '../../model/presentation.ts'
import { StatusBadge } from '../common/StatusBadge.tsx'

export interface ImpactPanelProps {
  readonly event: H2AnomalyEvent
}

export function ImpactPanel({ event }: ImpactPanelProps) {
  return (
    <section aria-labelledby="h2-impact-title" className="h2-panel h2-impact-panel">
      <div className="h2-panel__heading">
        <div>
          <p className="h2-eyebrow">Deterministic impact</p>
          <h2 id="h2-impact-title">影响量化</h2>
        </div>
        <StatusBadge tone="warning">计算</StatusBadge>
      </div>
      <div className="h2-impact-panel__value">
        <strong>{formatH2Number(event.impact.value)}</strong>
        <span>{event.impact.unit}</span>
      </div>
      <dl className="h2-key-values">
        <div>
          <dt>指标</dt>
          <dd>{event.impact.metric}</dd>
        </div>
        <div>
          <dt>公式版本</dt>
          <dd>{event.impact.formulaVersion}</dd>
        </div>
      </dl>
      <h3>计算假设</h3>
      <ul className="h2-compact-list">
        {event.impact.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}
      </ul>
    </section>
  )
}
