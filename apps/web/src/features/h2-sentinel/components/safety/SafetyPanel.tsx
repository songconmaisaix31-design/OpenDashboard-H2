import type { H2AnomalyEvent } from '@opendashboard/h2-contracts'
import { H2_SAFETY_LABELS } from '../../model/presentation.ts'
import { StatusBadge, type H2BadgeTone } from '../common/StatusBadge.tsx'

const safetyTone = {
  passed: 'positive',
  warning: 'warning',
  failed: 'danger',
  unknown: 'planned',
  not_applicable: 'neutral',
} as const satisfies Readonly<Record<H2AnomalyEvent['safetyChecks'][number]['status'], H2BadgeTone>>

export interface SafetyPanelProps {
  readonly event: H2AnomalyEvent
}

export function SafetyPanel({ event }: SafetyPanelProps) {
  return (
    <section aria-labelledby="h2-safety-title" className="h2-panel h2-safety-panel">
      <div className="h2-panel__heading">
        <div>
          <p className="h2-eyebrow">Human in the loop</p>
          <h2 id="h2-safety-title">安全检查与建议</h2>
        </div>
        <StatusBadge tone="danger">必须人工确认</StatusBadge>
      </div>
      <div className="h2-safety-list">
        {event.safetyChecks.map((check) => (
          <article className="h2-safety-item" key={check.checkId}>
            <StatusBadge tone={safetyTone[check.status]}>{H2_SAFETY_LABELS[check.status]}</StatusBadge>
            <div>
              <h3>{check.title}</h3>
              <p>{check.message}</p>
              <code>{check.constraintId ?? '未关联约束'}</code>
            </div>
          </article>
        ))}
      </div>
      {event.safetyChecks.length === 0 ? (
        <p className="h2-unknown-safety" role="status">安全状态未知：缺少检查结果，不能视为通过。</p>
      ) : null}
      <div className="h2-recommendations">
        {event.recommendations.map((recommendation) => (
          <article key={recommendation.recommendationId}>
            <div>
              <StatusBadge tone="warning">建议</StatusBadge>
              <code>{recommendation.recommendationId}</code>
            </div>
            <h3>{recommendation.summary}</h3>
            <p>{recommendation.rationale}</p>
            <strong>仅提供检查路径，不执行设备或设定值操作。</strong>
          </article>
        ))}
      </div>
    </section>
  )
}
