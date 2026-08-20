import type { H2Provenance, H2TimeRange } from './provenance.ts'

export type H2DatasetMode = 'FIXTURE' | 'LIVE_ANALYSIS'

export type H2DatasetFieldRole =
  | 'timestamp'
  | 'measurement'
  | 'constraint'
  | 'label'
  | 'metadata'

export interface H2DatasetField {
  readonly name: string
  readonly displayNameZh: string
  readonly role: H2DatasetFieldRole
  readonly required: boolean
  readonly unit?: string
}

export interface H2DatasetManifest {
  readonly schemaVersion: 1
  readonly datasetId: string
  readonly name: string
  readonly mode: H2DatasetMode
  readonly sourceFilename: string
  readonly fingerprint: string
  readonly rowCount: number
  readonly timeRange: H2TimeRange
  readonly samplingIntervalMinutes: number
  readonly fields: readonly H2DatasetField[]
  readonly provenance: H2Provenance
}
