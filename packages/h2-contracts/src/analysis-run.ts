import type { H2AnomalyCode, H2AnomalyEvent, H2Severity } from './anomaly.ts'
import type { H2DatasetManifest } from './dataset.ts'
import type { H2Provenance } from './provenance.ts'
import type { H2DataQualityReport } from './quality.ts'

export type H2AnalysisRunStatus = 'queued' | 'running' | 'completed' | 'failed'

export type H2CountByAnomalyCode = Readonly<Record<H2AnomalyCode, number>>

export type H2CountBySeverity = Readonly<Record<H2Severity, number>>

export interface H2AnalysisRun {
  readonly schemaVersion: 1
  readonly runId: string
  readonly dataset: H2DatasetManifest
  readonly quality: H2DataQualityReport
  readonly status: H2AnalysisRunStatus
  readonly startedAt: string
  readonly completedAt?: string
  readonly eventCountsByCode: H2CountByAnomalyCode
  readonly eventCountsBySeverity: H2CountBySeverity
  readonly events: readonly H2AnomalyEvent[]
  readonly warnings: readonly string[]
  readonly provenance: H2Provenance
}
