import type {
  H2ReportArtifact,
  H2ReportFormat,
  H2ReportKind,
  H2ReportRequest,
  H2ReportStatus,
} from '../../../packages/h2-contracts/src/index.ts'

import { H2EmsAdapterError } from './errors.ts'
import {
  invalid,
  isClosedRecord,
  isHash,
  isIsoTimestamp,
  isNonEmptyString,
  isOneOf,
  isOptionalString,
  isProvenance,
  isSafeFilename,
  isString,
  isStringArray,
} from './remote-validation-primitives.ts'
import { sha256 } from './sha256.ts'

const REPORT_PROFILES = {
  single_event_diagnosis: { format: 'html', mediaType: 'text/html' },
  period_summary: { format: 'html', mediaType: 'text/html' },
  analysis_result_json: { format: 'json', mediaType: 'application/json' },
  submission_csv: { format: 'csv', mediaType: 'text/csv' },
  validation_metrics: { format: 'json', mediaType: 'application/json' },
  quality_report: { format: 'html', mediaType: 'text/html' },
} as const satisfies Readonly<
  Record<
    H2ReportKind,
    { readonly format: H2ReportFormat; readonly mediaType: H2ReportArtifact['mediaType'] }
  >
>
const REPORT_STATUSES = ['ready', 'failed'] as const satisfies readonly H2ReportStatus[]

export function isReportArtifact(value: unknown): value is H2ReportArtifact {
  if (
    !isClosedRecord(value, ['descriptor', 'mediaType', 'content']) ||
    !isString(value.content) ||
    value.content.length > 2_000_000 ||
    !isReportDescriptor(value.descriptor)
  ) return false

  const profile = REPORT_PROFILES[value.descriptor.kind]
  return (
    value.descriptor.format === profile.format &&
    value.mediaType === profile.mediaType &&
    value.descriptor.filename.endsWith(`.${profile.format}`)
  )
}

/** Rejects a report whose bytes do not match its integrity descriptor. */
export async function verifyReportContentHash(
  artifact: H2ReportArtifact,
): Promise<H2ReportArtifact> {
  try {
    if ((await sha256(artifact.content)) !== artifact.descriptor.contentHash) {
      invalid()
    }
    return artifact
  } catch (error: unknown) {
    if (error instanceof H2EmsAdapterError) throw error
    invalid()
  }
}

/** Prevents a valid artifact descriptor from being replayed for another request. */
export function verifyReportIdentity(
  artifact: H2ReportArtifact,
  expected: H2ReportRequest,
): H2ReportArtifact {
  if (
    artifact.descriptor.runId !== expected.runId ||
    artifact.descriptor.kind !== expected.kind ||
    artifact.descriptor.eventId !== expected.eventId
  ) invalid()
  return artifact
}

function isReportDescriptor(
  value: unknown,
): value is H2ReportArtifact['descriptor'] {
  return (
    isClosedRecord(
      value,
      [
        'schemaVersion', 'reportId', 'runId', 'kind', 'format', 'status',
        'generatedAt', 'filename', 'contentHash', 'warnings',
        'safetyDisclaimer', 'provenance',
      ],
      ['eventId'],
    ) &&
    value.schemaVersion === 1 &&
    isNonEmptyString(value.reportId) &&
    isNonEmptyString(value.runId) &&
    isString(value.kind) &&
    Object.hasOwn(REPORT_PROFILES, value.kind) &&
    isOneOf(value.format, ['html', 'json', 'csv'] as const) &&
    isOneOf(value.status, REPORT_STATUSES) &&
    isIsoTimestamp(value.generatedAt) &&
    isSafeFilename(value.filename) &&
    isHash(value.contentHash) &&
    isOptionalString(value, 'eventId') &&
    isStringArray(value.warnings) &&
    isNonEmptyString(value.safetyDisclaimer) &&
    isProvenance(value.provenance)
  )
}
