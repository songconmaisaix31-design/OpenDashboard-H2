import type { H2DatasetMode, H2Provenance } from '@opendashboard/h2-contracts'
import { H2_MODE_COPY, H2_PROVENANCE_LABELS } from '../../model/presentation.ts'
import { H2Icon } from '../common/H2Icon.tsx'
import { StatusBadge } from '../common/StatusBadge.tsx'

export interface ProvenanceBannerProps {
  readonly mode: H2DatasetMode
  readonly provenance: H2Provenance
}

export function ProvenanceBanner({ mode, provenance }: ProvenanceBannerProps) {
  const copy = H2_MODE_COPY[mode]

  return (
    <aside className="h2-provenance" aria-label="数据来源与限制">
      <div className="h2-provenance__lead">
        <span aria-hidden="true" className="h2-provenance__icon">
          <H2Icon name="layers" size={18} />
        </span>
        <div>
          <div className="h2-provenance__title-row">
            <strong>来源与可追溯性</strong>
            <StatusBadge
              icon={mode === 'FIXTURE' ? '◇' : '●'}
              tone={mode === 'FIXTURE' ? 'fixture' : 'live'}
            >
              {copy.label}
            </StatusBadge>
          </div>
          <p>{copy.description}</p>
        </div>
      </div>
      <dl>
        <div>
          <dt>来源</dt>
          <dd title={provenance.source}>{provenance.source}</dd>
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
