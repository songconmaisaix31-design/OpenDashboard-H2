import type { H2Provenance } from './provenance.ts'

export interface H2ApiWarning {
  readonly code: string
  readonly message: string
  readonly field?: string
  readonly evidenceIds: readonly string[]
}

export interface H2RedactedError {
  readonly code: string
  readonly message: string
  readonly retryable: boolean
  readonly incidentId: string
  readonly details: readonly string[]
}

export interface H2ApiSuccessEnvelope<T> {
  readonly ok: true
  readonly status: 'success'
  readonly data: T
  readonly warnings: readonly []
  readonly provenance: H2Provenance
}

export interface H2ApiWarningEnvelope<T> {
  readonly ok: true
  readonly status: 'warning'
  readonly data: T
  readonly warnings: readonly [H2ApiWarning, ...H2ApiWarning[]]
  readonly provenance: H2Provenance
}

export interface H2ApiRedactedErrorEnvelope {
  readonly ok: false
  readonly status: 'error'
  readonly error: H2RedactedError
  readonly warnings: readonly H2ApiWarning[]
  readonly provenance: H2Provenance
}

export type H2ApiEnvelope<T> =
  | H2ApiSuccessEnvelope<T>
  | H2ApiWarningEnvelope<T>
  | H2ApiRedactedErrorEnvelope
