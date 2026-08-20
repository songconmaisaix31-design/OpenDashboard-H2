import { H2EmsAdapterError } from '../errors.ts'

/** Allows callers to handle only the stable, redacted adapter error surface. */
export function isH2EmsAdapterError(value: unknown): value is H2EmsAdapterError {
  return value instanceof H2EmsAdapterError
}
