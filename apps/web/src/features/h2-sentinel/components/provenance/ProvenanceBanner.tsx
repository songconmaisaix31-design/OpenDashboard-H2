import type { H2DatasetMode, H2Provenance } from '../../../../../../../packages/h2-contracts/src/index.ts'
import { H2_MODE_COPY, H2_PROVENANCE_LABELS } from '../../model/presentation.ts'
import { StatusBadge } from '../common/StatusBadge.tsx'

export interface ProvenanceBannerProps {
  readonly mode: H2DatasetMode
  readonly provenance: H2Provenance
}

export function ProvenanceBanner({ mode, provenance }: ProvenanceBannerProps) {
  const copy = H2_MODE_COPY[mode]

  return (
    <aside className="h2-provenance" aria-label="数据来源与限制">
      <div>
        <StatusBadge icon={mode === 'FIXTURE' ? '◇' : '●'} tone={mode === 'FIXTURE' ? 'fixture' : 'live'}>
          {copy.label}
        </StatusBadge>
        <p>{copy.description}</p>
      </div>
      <dl>
        <div>
          <dt>来源</dt>
          <dd>{provenance.source}</dd>
        </div>
        <div>
          <dt>类型</dt>
          <dd>{H2_PROVENANCE_LABELS[provenance.mode]}</dd>
        </div>
        <div>
          <dt>规则</dt>
          <dd>{provenance.ruleVersion ?? '未提供'}</dd>
        </div>
      </dl>
    </aside>
  )
}
