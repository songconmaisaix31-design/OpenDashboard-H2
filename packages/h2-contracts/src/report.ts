import type { H2Provenance } from './provenance.ts'

export type H2ReportKind =
  | 'single_event_diagnosis'
  | 'period_summary'
  | 'pcc_daily_compliance'
  | 'analysis_result_json'
  | 'submission_csv'
  | 'validation_metrics'
  | 'quality_report'
  | 'review_audit_json'

export type H2ReportFormat = 'html' | 'json' | 'csv'

export type H2ReportMediaType =
  | 'text/html'
  | 'application/json'
  | 'text/csv'

export type H2ReportStatus = 'ready' | 'failed'

export interface H2ReportDescriptor {
  readonly schemaVersion: 1
  readonly reportId: string
  readonly runId: string
  readonly kind: H2ReportKind
  readonly format: H2ReportFormat
  readonly status: H2ReportStatus
  readonly generatedAt: string
  readonly filename: string
  readonly contentHash: string
  readonly eventId?: string
  readonly warnings: readonly string[]
  readonly safetyDisclaimer: string
  readonly provenance: H2Provenance
}

export interface H2ReportArtifact {
  readonly descriptor: H2ReportDescriptor
  readonly mediaType: H2ReportMediaType
  readonly content: string
}
