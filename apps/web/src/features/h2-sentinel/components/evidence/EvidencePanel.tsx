import type { H2EvidenceItem } from '@opendashboard/h2-contracts'
import {
  H2_CLAIM_LABELS,
  formatEvidenceValue,
  formatH2Timestamp,
} from '../../model/presentation.ts'
import { StatusBadge } from '../common/StatusBadge.tsx'

export interface EvidencePanelProps {
  readonly evidence: readonly H2EvidenceItem[]
}

export function EvidencePanel({ evidence }: EvidencePanelProps) {
  return (
    <section aria-labelledby="h2-evidence-title" className="h2-panel h2-evidence-panel">
      <div className="h2-panel__heading">
        <div>
          <p className="h2-eyebrow">Evidence first</p>
          <h2 id="h2-evidence-title">证据链</h2>
        </div>
        <span>{evidence.length} 项结构化证据</span>
      </div>
      {evidence.length === 0 ? (
        <p className="h2-inline-empty">当前事件没有可展示的结构化证据，系统不会补写结论。</p>
      ) : (
        <div className="h2-evidence-list">
          {evidence.map((item, index) => (
            <article className="h2-evidence-card" key={item.evidenceId}>
              <div className="h2-evidence-card__index">{String(index + 1).padStart(2, '0')}</div>
              <div className="h2-evidence-card__body">
                <div className="h2-evidence-card__meta">
                  <StatusBadge tone={item.claimKind === 'calculation' ? 'warning' : 'neutral'}>
                    {H2_CLAIM_LABELS[item.claimKind]}
                  </StatusBadge>
                  <code>{item.evidenceId}</code>
                  <span>
                    {item.timestamp
                      ? formatH2Timestamp(item.timestamp)
                      : item.interval
                        ? `${formatH2Timestamp(item.interval.startTime)}–${formatH2Timestamp(item.interval.endTime)}`
                        : '时间未提供'}
                  </span>
                </div>
                <h3>{item.conclusion}</h3>
                <dl className="h2-evidence-card__values">
                  <div>
                    <dt>变量</dt>
                    <dd>{item.variable ?? '未指定'}</dd>
                  </div>
                  <div>
                    <dt>实际值</dt>
                    <dd>{formatEvidenceValue(item.actualValue, item.unit)}</dd>
                  </div>
                  <div>
                    <dt>参照值</dt>
                    <dd>{formatEvidenceValue(item.referenceValue, item.unit)}</dd>
                  </div>
                  <div>
                    <dt>来源</dt>
                    <dd>{item.source}</dd>
                  </div>
                </dl>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
