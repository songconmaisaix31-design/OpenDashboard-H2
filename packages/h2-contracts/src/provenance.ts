export const H2_PROVENANCE_MODES = [
  'FIXTURE',
  'LIVE_ANALYSIS',
  'DERIVED',
  'MODEL',
  'RULE',
  'LLM_RENDERED',
] as const

export type H2ProvenanceMode = (typeof H2_PROVENANCE_MODES)[number]

export type H2ClaimKind =
  | 'fact'
  | 'calculation'
  | 'inference'
  | 'recommendation'

export interface H2TimeRange {
  readonly startTime: string
  readonly endTime: string
}

export interface H2Provenance {
  readonly mode: H2ProvenanceMode
  readonly source: string
  readonly generatedAt: string
  readonly datasetFingerprint?: string
  readonly modelVersion?: string
  readonly ruleVersion?: string
  readonly configurationVersion?: string
  readonly rendererVersion?: string
  readonly limitations: readonly string[]
}
