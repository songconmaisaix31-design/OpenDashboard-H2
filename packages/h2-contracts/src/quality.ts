import type { H2Provenance, H2TimeRange } from './provenance.ts'

export type H2DataQualityStatus = 'passed' | 'warning' | 'blocked'

export type H2QualityCheckCode =
  | 'field_mapping'
  | 'missing_values'
  | 'duplicate_timestamps'
  | 'irregular_sampling'
  | 'invalid_range'
  | 'timestamp_order'
  | 'power_balance_residual'
  | 'row_count'

export type H2QualitySeverity = 'info' | 'warning' | 'blocking'

export interface H2QualityCheck {
  readonly checkId: string
  readonly code: H2QualityCheckCode
  readonly status: H2DataQualityStatus
  readonly severity: H2QualitySeverity
  readonly affectedFields: readonly string[]
  readonly message: string
  readonly evidenceIds: readonly string[]
  readonly observedValue?: number | string
  readonly threshold?: number | string
  readonly unit?: string
  readonly provenance: H2Provenance
}

export interface H2DataQualityReport {
  readonly schemaVersion: 1
  readonly reportId: string
  readonly datasetId: string
  readonly status: H2DataQualityStatus
  readonly generatedAt: string
  readonly rowCount: number
  readonly timeRange: H2TimeRange
  readonly checks: readonly H2QualityCheck[]
  readonly warnings: readonly string[]
  readonly blockingReasons: readonly string[]
  readonly provenance: H2Provenance
}
