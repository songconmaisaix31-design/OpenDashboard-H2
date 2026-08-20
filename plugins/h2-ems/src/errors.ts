export type H2EmsAdapterErrorCode =
  | 'fixture_import_disabled'
  | 'invalid_fixture_request'
  | 'invalid_loopback_url'
  | 'live_adapter_disabled'
  | 'remote_error'
  | 'remote_request_failed'
  | 'remote_response_invalid'
  | 'request_aborted'
  | 'request_timeout'

/** A stable, redacted error safe to surface in application diagnostics. */
export class H2EmsAdapterError extends Error {
  readonly name = 'H2EmsAdapterError'

  constructor(
    readonly code: H2EmsAdapterErrorCode,
    readonly retryable: boolean,
  ) {
    super(messageFor(code))
  }
}

function messageFor(code: H2EmsAdapterErrorCode): string {
  switch (code) {
    case 'fixture_import_disabled':
      return 'The deterministic Fixture adapter does not import external data.'
    case 'invalid_fixture_request':
      return 'The Fixture request is not valid for the fixed dataset.'
    case 'invalid_loopback_url':
      return 'The Live adapter requires a literal loopback HTTP(S) URL.'
    case 'live_adapter_disabled':
      return 'The Live adapter requires explicit opt-in.'
    case 'remote_error':
      return 'The local EMS service returned a redacted error.'
    case 'remote_request_failed':
      return 'The local EMS request could not be completed.'
    case 'remote_response_invalid':
      return 'The local EMS response did not satisfy the H2 contract.'
    case 'request_aborted':
      return 'The local EMS request was cancelled.'
    case 'request_timeout':
      return 'The local EMS request timed out.'
  }
}
