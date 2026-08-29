import {
  H2_PROVENANCE_MODES,
  type H2ClaimKind,
  type H2Provenance,
} from '@opendashboard/h2-contracts'

import { H2EmsAdapterError } from './errors.ts'

export type JsonRecord = Record<string, unknown>

export const CLAIM_KINDS = [
  'fact', 'calculation', 'inference', 'recommendation',
] as const satisfies readonly H2ClaimKind[]

const PROVENANCE_REQUIRED_KEYS = ['mode', 'source', 'generatedAt', 'limitations'] as const
const PROVENANCE_OPTIONAL_KEYS = [
  'datasetFingerprint',
  'modelVersion',
  'ruleVersion',
  'configurationVersion',
  'rendererVersion',
] as const

/** Validates the canonical closed API envelope before its data enters the app. */
export function unwrapRemoteEnvelope<T>(
  value: unknown,
  guard: (candidate: unknown) => candidate is T,
): T {
  if (!isRecord(value)) invalid()

  if (value.ok === true && value.status === 'success') {
    if (
      !isClosedRecord(value, ['ok', 'status', 'data', 'warnings', 'provenance']) ||
      !Array.isArray(value.warnings) ||
      value.warnings.length !== 0 ||
      !isProvenance(value.provenance) ||
      !guard(value.data)
    ) invalid()
    return value.data
  }

  if (value.ok === true && value.status === 'warning') {
    if (
      !isClosedRecord(value, ['ok', 'status', 'data', 'warnings', 'provenance']) ||
      !Array.isArray(value.warnings) ||
      value.warnings.length === 0 ||
      !value.warnings.every(isApiWarning) ||
      !isProvenance(value.provenance) ||
      !guard(value.data)
    ) invalid()
    return value.data
  }

  if (value.ok === false && value.status === 'error') {
    if (
      !isClosedRecord(value, ['ok', 'status', 'error', 'warnings', 'provenance']) ||
      !Array.isArray(value.warnings) ||
      !value.warnings.every(isApiWarning) ||
      !isProvenance(value.provenance) ||
      !isRedactedError(value.error)
    ) invalid()
    throw new H2EmsAdapterError(
      'remote_error',
      value.error.retryable,
      value.error.code,
    )
  }

  invalid()
}

export function isProvenance(value: unknown): value is H2Provenance {
  return (
    isClosedRecord(value, PROVENANCE_REQUIRED_KEYS, PROVENANCE_OPTIONAL_KEYS) &&
    isOneOf(value.mode, H2_PROVENANCE_MODES) &&
    isNonEmptyString(value.source) &&
    isIsoTimestamp(value.generatedAt) &&
    isOptionalHash(value, 'datasetFingerprint') &&
    isOptionalString(value, 'modelVersion') &&
    isOptionalString(value, 'ruleVersion') &&
    isOptionalString(value, 'configurationVersion') &&
    isOptionalString(value, 'rendererVersion') &&
    isStringArray(value.limitations)
  )
}

export function hasMatchingDatasetProvenance(
  candidate: H2Provenance,
  expected: H2Provenance,
): boolean {
  return (
    candidate.mode === expected.mode &&
    candidate.datasetFingerprint === expected.datasetFingerprint
  )
}

export function isTimeRange(value: unknown): boolean {
  return (
    isClosedRecord(value, ['startTime', 'endTime']) &&
    isIsoTimestamp(value.startTime) &&
    isIsoTimestamp(value.endTime) &&
    Date.parse(value.startTime) <= Date.parse(value.endTime)
  )
}

export function isCountRecord(
  value: unknown,
  keys: readonly string[],
): boolean {
  return (
    isClosedRecord(value, keys) &&
    keys.every((key) => isNonNegativeInteger(value[key]))
  )
}

export function isClosedRecord(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
): value is JsonRecord {
  if (!isRecord(value)) return false
  const allowed = new Set([...requiredKeys, ...optionalKeys])
  return (
    requiredKeys.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  )
}

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isString(value: unknown): value is string {
  return typeof value === 'string'
}

export function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.length > 0
}

export function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(isString)
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

export function isHash(value: unknown): value is string {
  return isString(value) && /^sha256:[a-f0-9]{64}$/.test(value)
}

export function isSafeFilename(value: unknown): value is string {
  return (
    isNonEmptyString(value) &&
    /^[a-z0-9][a-z0-9._-]*$/i.test(value) &&
    !value.includes('..')
  )
}

export function isOptionalString(value: JsonRecord, key: string): boolean {
  return !Object.hasOwn(value, key) || isString(value[key])
}

export function isOptionalIsoTimestamp(value: JsonRecord, key: string): boolean {
  return !Object.hasOwn(value, key) || isIsoTimestamp(value[key])
}

export function isOptionalTimestampAtOrAfter(
  value: JsonRecord,
  key: string,
  lowerBound: string,
): boolean {
  return (
    !Object.hasOwn(value, key) ||
    (isIsoTimestamp(value[key]) &&
      Date.parse(value[key]) >= Date.parse(lowerBound))
  )
}

export function isOptionalHash(value: JsonRecord, key: string): boolean {
  return !Object.hasOwn(value, key) || isHash(value[key])
}

export function isOptionalTimeRange(value: JsonRecord, key: string): boolean {
  return !Object.hasOwn(value, key) || isTimeRange(value[key])
}

export function isOptionalFiniteNumberOrString(
  value: JsonRecord,
  key: string,
): boolean {
  return (
    !Object.hasOwn(value, key) ||
    isString(value[key]) ||
    isFiniteNumber(value[key])
  )
}

export function isOptionalEvidenceValue(value: JsonRecord, key: string): boolean {
  const candidate = value[key]
  return (
    !Object.hasOwn(value, key) ||
    isString(candidate) ||
    typeof candidate === 'boolean' ||
    isFiniteNumber(candidate)
  )
}

export function isOptionalEnum<TValue extends string>(
  value: JsonRecord,
  key: string,
  allowed: readonly TValue[],
): boolean {
  return !Object.hasOwn(value, key) || isOneOf(value[key], allowed)
}

export function isOneOf<TValue extends string>(
  value: unknown,
  allowed: readonly TValue[],
): value is TValue {
  return isString(value) && allowed.some((candidate) => candidate === value)
}

export function isIsoTimestamp(value: unknown): value is string {
  if (!isString(value)) return false
  const match = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value)
  if (!match || !Number.isFinite(Date.parse(value))) return false
  const calendarDate = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`)
  return (
    calendarDate.getUTCFullYear() === Number(match[1]) &&
    calendarDate.getUTCMonth() + 1 === Number(match[2]) &&
    calendarDate.getUTCDate() === Number(match[3])
  )
}

export function isOrderedEventTimes(
  startTime: unknown,
  firstDetectionTime: unknown,
  endTime: unknown,
): boolean {
  if (
    !isIsoTimestamp(startTime) ||
    !isIsoTimestamp(firstDetectionTime) ||
    !isIsoTimestamp(endTime)
  ) return false
  const start = Date.parse(startTime)
  const firstDetection = Date.parse(firstDetectionTime)
  const end = Date.parse(endTime)
  return start <= firstDetection && firstDetection <= end
}

export function invalid(): never {
  throw new H2EmsAdapterError('remote_response_invalid', false)
}

export function verifyRemoteIdentity<T>(
  value: T,
  matches: (candidate: T) => boolean,
): T {
  if (!matches(value)) invalid()
  return value
}

function isApiWarning(value: unknown): boolean {
  return (
    isClosedRecord(value, ['code', 'message', 'evidenceIds'], ['field']) &&
    isSafeErrorCode(value.code) &&
    isNonEmptyString(value.message) &&
    isOptionalString(value, 'field') &&
    isStringArray(value.evidenceIds)
  )
}

function isSafeErrorCode(value: unknown): value is string {
  return isString(value) && /^[a-z][a-z0-9_.-]{0,127}$/u.test(value)
}

function isRedactedError(
  value: unknown,
): value is { readonly code: string; readonly retryable: boolean } {
  return (
    isClosedRecord(value, [
      'code',
      'message',
      'retryable',
      'incidentId',
      'details',
    ]) &&
    isNonEmptyString(value.code) &&
    isNonEmptyString(value.message) &&
    typeof value.retryable === 'boolean' &&
    isNonEmptyString(value.incidentId) &&
    isStringArray(value.details)
  )
}
