export type H2EmsAdapterErrorCode =
  | 'assistant_event_mismatch'
  | 'assistant_event_required'
  | 'fixture_import_disabled'
  | 'invalid_fixture_request'
  | 'invalid_loopback_url'
  | 'live_adapter_disabled'
  | 'report_invalid_scope'
  | 'remote_error'
  | 'remote_request_failed'
  | 'remote_response_invalid'
  | 'review_conflict'
  | 'review_idempotency_conflict'
  | 'review_invalid_transition'
  | 'review_note_required'
  | 'request_aborted'
  | 'request_timeout'

/** A stable, redacted error safe to surface in application diagnostics. */
export class H2EmsAdapterError extends Error {
  readonly name = 'H2EmsAdapterError'

  constructor(
    readonly code: H2EmsAdapterErrorCode,
    readonly retryable: boolean,
    readonly remoteCode?: string,
  ) {
    super(messageFor(code))
  }
}

function messageFor(code: H2EmsAdapterErrorCode): string {
  switch (code) {
    case 'assistant_event_mismatch':
      return 'The selected event does not match the assistant question.'
    case 'assistant_event_required':
      return 'The assistant question requires a selected event.'
    case 'fixture_import_disabled':
      return 'The deterministic Fixture adapter does not import external data.'
    case 'invalid_fixture_request':
      return 'The Fixture request is not valid for the fixed dataset.'
    case 'invalid_loopback_url':
      return 'The Live adapter requires a literal loopback HTTP(S) URL.'
    case 'live_adapter_disabled':
      return 'The Live adapter requires explicit opt-in.'
    case 'report_invalid_scope':
      return 'The report kind does not accept the supplied event or time range.'
    case 'remote_error':
      return 'The local EMS service returned a redacted error.'
    case 'remote_request_failed':
      return 'The local EMS request could not be completed.'
    case 'remote_response_invalid':
      return 'The local EMS response did not satisfy the H2 contract.'
    case 'review_conflict':
      return 'The event review changed and must be reloaded.'
    case 'review_idempotency_conflict':
      return 'The review request identifier was reused with different content.'
    case 'review_invalid_transition':
      return 'The requested event review transition is not allowed.'
    case 'review_note_required':
      return 'The requested review action requires a note.'
    case 'request_aborted':
      return 'The local EMS request was cancelled.'
    case 'request_timeout':
      return 'The local EMS request timed out.'
  }
}
