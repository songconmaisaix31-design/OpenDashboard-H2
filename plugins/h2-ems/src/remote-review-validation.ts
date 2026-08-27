import {
  H2_REVIEW_ACTIONS,
  type H2EventReview,
  type H2LocalReviewActor,
  type H2ReviewAction,
  type H2ReviewEntry,
  type H2ReviewMutationReceipt,
  type H2ReviewState,
} from '@opendashboard/h2-contracts'

import {
  isClosedRecord,
  isIsoTimestamp,
  isNonEmptyString,
  isNonNegativeInteger,
  isOneOf,
  isProvenance,
  isString,
} from './remote-validation-primitives.ts'

const REVIEW_STATES = [
  'open',
  'confirmed',
  'dismissed',
  'resolved',
] as const satisfies readonly H2ReviewState[]

export function isEventReview(value: unknown): value is H2EventReview {
  if (!(
    isClosedRecord(value, [
      'schemaVersion',
      'reviewId',
      'runId',
      'eventId',
      'initialState',
      'currentState',
      'revision',
      'entries',
      'provenance',
    ]) &&
    value.schemaVersion === 1 &&
    isNonEmptyString(value.reviewId) &&
    isNonEmptyString(value.runId) &&
    isNonEmptyString(value.eventId) &&
    value.initialState === 'open' &&
    isOneOf(value.currentState, REVIEW_STATES) &&
    isNonNegativeInteger(value.revision) &&
    Array.isArray(value.entries) &&
    value.entries.every(isReviewEntry) &&
    isProvenance(value.provenance)
  )) return false

  const review = value as unknown as H2EventReview
  if (review.entries.length !== review.revision) return false
  if (
    new Set(review.entries.map(({ entryId }) => entryId)).size !== review.entries.length ||
    new Set(review.entries.map(({ requestId }) => requestId)).size !== review.entries.length
  ) return false

  let projectedState: H2ReviewState = 'open'
  for (const [index, entry] of review.entries.entries()) {
    const expectedRevision = index + 1
    const nextState = projectedReviewState(projectedState, entry.action)
    if (
      entry.revision !== expectedRevision ||
      entry.previousState !== projectedState ||
      nextState === null ||
      entry.nextState !== nextState
    ) return false
    projectedState = entry.nextState
  }

  return review.currentState === projectedState
}

export function isReviewMutationReceipt(
  value: unknown,
): value is H2ReviewMutationReceipt {
  if (!(
    isClosedRecord(value, ['schemaVersion', 'replayed', 'entry', 'review']) &&
    value.schemaVersion === 1 &&
    typeof value.replayed === 'boolean' &&
    isReviewEntry(value.entry) &&
    isEventReview(value.review)
  )) return false

  const receipt = value as unknown as H2ReviewMutationReceipt
  const matchingEntry = receipt.review.entries.find(
    ({ entryId }) => entryId === receipt.entry.entryId,
  )
  return (
    matchingEntry !== undefined &&
    receipt.review.revision === receipt.entry.revision &&
    sameReviewEntry(matchingEntry, receipt.entry)
  )
}

function isReviewEntry(value: unknown): value is H2ReviewEntry {
  if (!(
    isClosedRecord(
      value,
      [
        'schemaVersion',
        'entryId',
        'requestId',
        'revision',
        'action',
        'previousState',
        'nextState',
        'actor',
        'createdAt',
      ],
      ['note'],
    ) &&
    value.schemaVersion === 1 &&
    isNonEmptyString(value.entryId) &&
    isReviewRequestId(value.requestId) &&
    isNonNegativeInteger(value.revision) &&
    value.revision > 0 &&
    isOneOf(value.action, H2_REVIEW_ACTIONS) &&
    isOneOf(value.previousState, REVIEW_STATES) &&
    isOneOf(value.nextState, REVIEW_STATES) &&
    isReviewActor(value.actor) &&
    isIsoTimestamp(value.createdAt)
  )) return false

  const note = Object.hasOwn(value, 'note') ? value.note : undefined
  return (
    (note === undefined || isReviewNote(note)) &&
    (!reviewActionRequiresNote(value.action) || (isString(note) && note.length > 0))
  )
}

function isReviewActor(value: unknown): value is H2LocalReviewActor {
  return (
    isClosedRecord(value, ['kind', 'displayName']) &&
    value.kind === 'local_operator' &&
    isBoundedTrimmedText(value.displayName, 64) &&
    !/[\u0000-\u001f\u007f]/u.test(value.displayName)
  )
}

function isReviewRequestId(value: unknown): value is string {
  return (
    isString(value) &&
    value.trim() === value &&
    /^[\x20-\x7e]{1,128}$/u.test(value)
  )
}

function isReviewNote(value: unknown): value is string {
  return (
    isBoundedTrimmedText(value, 2_000) &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
  )
}

function isBoundedTrimmedText(value: unknown, limit: number): value is string {
  return (
    isString(value) &&
    value.trim() === value &&
    value.length > 0 &&
    Array.from(value).length <= limit
  )
}

function reviewActionRequiresNote(action: H2ReviewAction): boolean {
  return action !== 'confirm'
}

function projectedReviewState(
  currentState: H2ReviewState,
  action: H2ReviewAction,
): H2ReviewState | null {
  if (action === 'add_note') return currentState
  if (currentState === 'open' && action === 'confirm') return 'confirmed'
  if (currentState === 'open' && action === 'reject') return 'dismissed'
  if (currentState === 'confirmed' && action === 'resolve') return 'resolved'
  if (action === 'reopen' && currentState !== 'open') return 'open'
  return null
}

function sameReviewEntry(left: H2ReviewEntry, right: H2ReviewEntry): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.entryId === right.entryId &&
    left.requestId === right.requestId &&
    left.revision === right.revision &&
    left.action === right.action &&
    left.previousState === right.previousState &&
    left.nextState === right.nextState &&
    left.note === right.note &&
    left.actor.kind === right.actor.kind &&
    left.actor.displayName === right.actor.displayName &&
    left.createdAt === right.createdAt
  )
}
