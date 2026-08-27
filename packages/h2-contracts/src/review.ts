import type {
  H2AnomalyCode,
  H2AnomalySubtype,
  H2ReviewState,
} from './anomaly.ts'
import type { H2Provenance } from './provenance.ts'

export const H2_REVIEW_ACTIONS = [
  'confirm',
  'reject',
  'resolve',
  'reopen',
  'add_note',
] as const

export type H2ReviewAction = (typeof H2_REVIEW_ACTIONS)[number]

export interface H2LocalReviewActor {
  readonly kind: 'local_operator'
  readonly displayName: string
}

export interface H2ReviewEntry {
  readonly schemaVersion: 1
  readonly entryId: string
  readonly requestId: string
  readonly revision: number
  readonly action: H2ReviewAction
  readonly previousState: H2ReviewState
  readonly nextState: H2ReviewState
  readonly note?: string
  readonly actor: H2LocalReviewActor
  readonly createdAt: string
}

export interface H2EventReview {
  readonly schemaVersion: 1
  readonly reviewId: string
  readonly runId: string
  readonly eventId: string
  readonly initialState: 'open'
  readonly currentState: H2ReviewState
  readonly revision: number
  readonly entries: readonly H2ReviewEntry[]
  readonly provenance: H2Provenance
}

export interface H2ReviewEventRequest {
  readonly schemaVersion: 1
  readonly requestId: string
  readonly runId: string
  readonly eventId: string
  readonly action: H2ReviewAction
  readonly expectedRevision: number
  readonly actor: H2LocalReviewActor
  readonly note?: string
}

export interface H2ReviewMutationReceipt {
  readonly schemaVersion: 1
  readonly replayed: boolean
  readonly entry: H2ReviewEntry
  readonly review: H2EventReview
}

export interface H2ReviewAuditEventSnapshot {
  readonly eventId: string
  readonly code: H2AnomalyCode
  readonly subtype: H2AnomalySubtype
  readonly startTime: string
  readonly endTime: string
}

export interface H2ReviewAuditEvent {
  readonly event: H2ReviewAuditEventSnapshot
  readonly review: H2EventReview
}

export interface H2ReviewAuditExport {
  readonly schemaVersion: 1
  readonly exportKind: 'event_review_audit'
  readonly runId: string
  readonly datasetFingerprint: string
  readonly generatedAt: string
  readonly actorIdentityNotice: 'local_operator_labels_are_unverified'
  readonly events: readonly H2ReviewAuditEvent[]
  readonly provenance: H2Provenance
}

export function nextH2ReviewState(
  current: H2ReviewState,
  action: H2ReviewAction,
): H2ReviewState {
  if (action === 'add_note') return current
  if (current === 'open' && action === 'confirm') return 'confirmed'
  if (current === 'open' && action === 'reject') return 'dismissed'
  if (current === 'confirmed' && action === 'resolve') return 'resolved'
  if (
    action === 'reopen' &&
    (current === 'confirmed' ||
      current === 'dismissed' ||
      current === 'resolved')
  ) {
    return 'open'
  }
  throw new RangeError(`review.invalid_transition:${current}:${action}`)
}
