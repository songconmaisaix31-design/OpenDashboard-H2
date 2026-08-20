import {
  H2_ANOMALY_CODES,
  H2_ASSISTANT_QUESTIONS,
  H2_SEVERITIES,
  type H2AnalysisRun,
  type H2AnomalyEvent,
  type H2AssistantAnswer,
  type H2AssistantAnswerSection,
  type H2AssistantCitation,
  type H2CsvImportResult,
  type H2DataQualityReport,
  type H2DatasetFieldRole,
  type H2DatasetManifest,
  type H2DatasetMode,
  type H2QualityCheckCode,
  type H2QualitySeverity,
  type H2SeriesResponse,
} from '@opendashboard/h2-contracts'

import { isEventArray } from './remote-anomaly-validation.ts'
import {
  CLAIM_KINDS,
  hasMatchingDatasetProvenance,
  isClosedRecord,
  isCountRecord,
  isFiniteNumber,
  isHash,
  isIsoTimestamp,
  isNonEmptyString,
  isNonNegativeInteger,
  isOneOf,
  isOptionalFiniteNumberOrString,
  isOptionalString,
  isOptionalTimestampAtOrAfter,
  isProvenance,
  isRecord,
  isStringArray,
  isTimeRange,
} from './remote-validation-primitives.ts'

export { isEvent, isEventArray } from './remote-anomaly-validation.ts'
export {
  isReportArtifact,
  verifyReportContentHash,
  verifyReportIdentity,
} from './remote-report-validation.ts'
export { unwrapRemoteEnvelope } from './remote-validation-primitives.ts'

const DATASET_FIELD_ROLES = [
  'timestamp', 'measurement', 'constraint', 'label', 'metadata',
] as const satisfies readonly H2DatasetFieldRole[]
const QUALITY_STATUSES = ['passed', 'warning', 'blocked'] as const
const QUALITY_CHECK_CODES = [
  'field_mapping', 'missing_values', 'duplicate_timestamps',
  'irregular_sampling', 'invalid_range', 'timestamp_order',
  'power_balance_residual', 'row_count',
] as const satisfies readonly H2QualityCheckCode[]
const QUALITY_SEVERITIES = [
  'info', 'warning', 'blocking',
] as const satisfies readonly H2QualitySeverity[]
const QUALITY_SEVERITY_BY_STATUS = {
  passed: 'info',
  warning: 'warning',
  blocked: 'blocking',
} as const
const ANALYSIS_STATUSES = ['queued', 'running', 'completed', 'failed'] as const
const ASSISTANT_QUESTION_IDS = H2_ASSISTANT_QUESTIONS.map(
  ({ questionId }) => questionId,
)
const ASSISTANT_MODES = ['DETERMINISTIC_TEMPLATE', 'LLM_RENDERED'] as const
const ASSISTANT_SOURCE_TYPES = [
  'event', 'evidence', 'constraint', 'variable', 'knowledge_base', 'report',
] as const
const EVENT_SCOPED_ASSISTANT_SOURCES = new Set<
  H2AssistantCitation['sourceType']
>(['event', 'evidence', 'constraint'])

export function isDatasetMode(value: unknown): value is H2DatasetMode {
  return value === 'FIXTURE' || value === 'LIVE_ANALYSIS'
}

export function isDatasetArray(
  value: unknown,
): value is readonly H2DatasetManifest[] {
  return Array.isArray(value) && value.every(isDataset)
}

export function isCsvImportResult(value: unknown): value is H2CsvImportResult {
  return (
    isClosedRecord(value, ['dataset', 'quality']) &&
    isDataset(value.dataset) &&
    isQualityReport(value.quality) &&
    qualityMatchesDataset(value.quality, value.dataset)
  )
}

export function isQualityReport(
  value: unknown,
): value is H2DataQualityReport {
  if (!(
    isClosedRecord(value, [
      'schemaVersion', 'reportId', 'datasetId', 'status', 'generatedAt',
      'rowCount', 'timeRange', 'checks', 'warnings', 'blockingReasons',
      'provenance',
    ]) &&
    value.schemaVersion === 1 &&
    isNonEmptyString(value.reportId) &&
    isNonEmptyString(value.datasetId) &&
    isOneOf(value.status, QUALITY_STATUSES) &&
    isIsoTimestamp(value.generatedAt) &&
    isNonNegativeInteger(value.rowCount) &&
    isTimeRange(value.timeRange) &&
    Array.isArray(value.checks) &&
    value.checks.every(isQualityCheck) &&
    isStringArray(value.warnings) &&
    isStringArray(value.blockingReasons) &&
    isProvenance(value.provenance)
  )) return false
  return hasConsistentQualitySummary(value as unknown as H2DataQualityReport)
}

export function isAnalysisRun(value: unknown): value is H2AnalysisRun {
  return (
    isClosedRecord(
      value,
      [
        'schemaVersion', 'runId', 'dataset', 'quality', 'status', 'startedAt',
        'eventCountsByCode', 'eventCountsBySeverity', 'events', 'warnings',
        'provenance',
      ],
      ['completedAt'],
    ) &&
    value.schemaVersion === 1 &&
    isNonEmptyString(value.runId) &&
    isDataset(value.dataset) &&
    isQualityReport(value.quality) &&
    qualityMatchesDataset(value.quality, value.dataset) &&
    isOneOf(value.status, ANALYSIS_STATUSES) &&
    isIsoTimestamp(value.startedAt) &&
    isOptionalTimestampAtOrAfter(value, 'completedAt', value.startedAt) &&
    isCountRecord(value.eventCountsByCode, H2_ANOMALY_CODES) &&
    isCountRecord(value.eventCountsBySeverity, H2_SEVERITIES) &&
    isEventArray(value.events) &&
    hasMatchingEventCounts(
      value.events,
      value.eventCountsByCode,
      value.eventCountsBySeverity,
    ) &&
    isStringArray(value.warnings) &&
    isProvenance(value.provenance) &&
    hasConsistentAnalysisProvenance(value as unknown as H2AnalysisRun)
  )
}

export function isSeriesResponse(value: unknown): value is H2SeriesResponse {
  return (
    isClosedRecord(value, ['runId', 'variables', 'points']) &&
    isNonEmptyString(value.runId) &&
    isStringArray(value.variables) &&
    Array.isArray(value.points) &&
    value.points.every(
      (point) =>
        isClosedRecord(point, ['timestamp', 'values']) &&
        isIsoTimestamp(point.timestamp) &&
        isRecord(point.values) &&
        Object.values(point.values).every(
          (entry) => entry === null || isFiniteNumber(entry),
        ),
    )
  )
}

export function isAssistantAnswer(value: unknown): value is H2AssistantAnswer {
  if (!(
    isClosedRecord(
      value,
      [
        'schemaVersion', 'answerId', 'runId', 'questionId', 'mode',
        'generatedAt', 'sections', 'citations', 'refusedControlClaim',
        'provenance',
      ],
      ['eventId'],
    ) &&
    value.schemaVersion === 1 &&
    isNonEmptyString(value.answerId) &&
    isNonEmptyString(value.runId) &&
    isOneOf(value.questionId, ASSISTANT_QUESTION_IDS) &&
    isOneOf(value.mode, ASSISTANT_MODES) &&
    isIsoTimestamp(value.generatedAt) &&
    isOptionalString(value, 'eventId') &&
    Array.isArray(value.sections) &&
    value.sections.length > 0 &&
    value.sections.every(isAssistantSection) &&
    Array.isArray(value.citations) &&
    value.citations.every(isAssistantCitation) &&
    value.refusedControlClaim === true &&
    isProvenance(value.provenance)
  )) return false
  return hasConsistentCitations(value as unknown as H2AssistantAnswer)
}

function isDataset(value: unknown): value is H2DatasetManifest {
  return (
    isClosedRecord(value, [
      'schemaVersion', 'datasetId', 'name', 'mode', 'sourceFilename',
      'fingerprint', 'rowCount', 'timeRange', 'samplingIntervalMinutes',
      'fields', 'provenance',
    ]) &&
    value.schemaVersion === 1 &&
    isNonEmptyString(value.datasetId) &&
    isNonEmptyString(value.name) &&
    isDatasetMode(value.mode) &&
    isSafeDatasetSourceFilename(value.sourceFilename) &&
    isHash(value.fingerprint) &&
    isNonNegativeInteger(value.rowCount) &&
    isTimeRange(value.timeRange) &&
    isFiniteNumber(value.samplingIntervalMinutes) &&
    value.samplingIntervalMinutes > 0 &&
    Array.isArray(value.fields) &&
    value.fields.length > 0 &&
    value.fields.every(isDatasetField) &&
    isProvenance(value.provenance) &&
    value.provenance.mode === value.mode &&
    value.provenance.datasetFingerprint === value.fingerprint
  )
}

function isDatasetField(value: unknown): boolean {
  return (
    isClosedRecord(value, ['name', 'displayNameZh', 'role', 'required'], ['unit']) &&
    isNonEmptyString(value.name) &&
    isNonEmptyString(value.displayNameZh) &&
    isOneOf(value.role, DATASET_FIELD_ROLES) &&
    typeof value.required === 'boolean' &&
    isOptionalString(value, 'unit')
  )
}

function isQualityCheck(
  value: unknown,
): value is H2DataQualityReport['checks'][number] {
  return (
    isClosedRecord(
      value,
      [
        'checkId', 'code', 'status', 'severity', 'affectedFields', 'message',
        'evidenceIds', 'provenance',
      ],
      ['observedValue', 'threshold', 'unit'],
    ) &&
    isNonEmptyString(value.checkId) &&
    isOneOf(value.code, QUALITY_CHECK_CODES) &&
    isOneOf(value.status, QUALITY_STATUSES) &&
    isOneOf(value.severity, QUALITY_SEVERITIES) &&
    isStringArray(value.affectedFields) &&
    isNonEmptyString(value.message) &&
    isStringArray(value.evidenceIds) &&
    isOptionalFiniteNumberOrString(value, 'observedValue') &&
    isOptionalFiniteNumberOrString(value, 'threshold') &&
    isOptionalString(value, 'unit') &&
    isProvenance(value.provenance)
  )
}

function hasConsistentQualitySummary(
  quality: H2DataQualityReport,
): boolean {
  const warnings = quality.checks
    .filter(({ status }) => status === 'warning')
    .map(({ message }) => message)
  const blockingReasons = quality.checks
    .filter(({ status }) => status === 'blocked')
    .map(({ message }) => message)
  const status = blockingReasons.length > 0
    ? 'blocked'
    : warnings.length > 0
      ? 'warning'
      : 'passed'
  return (
    quality.status === status &&
    sameStrings(quality.warnings, warnings) &&
    sameStrings(quality.blockingReasons, blockingReasons) &&
    quality.checks.every((check) =>
      check.severity === QUALITY_SEVERITY_BY_STATUS[check.status] &&
      hasMatchingDatasetProvenance(check.provenance, quality.provenance),
    )
  )
}

function isAssistantSection(value: unknown): value is H2AssistantAnswerSection {
  return (
    isClosedRecord(value, ['sectionId', 'claimKind', 'text', 'citationIds']) &&
    isNonEmptyString(value.sectionId) &&
    isOneOf(value.claimKind, CLAIM_KINDS) &&
    isNonEmptyString(value.text) &&
    isStringArray(value.citationIds)
  )
}

function isAssistantCitation(value: unknown): value is H2AssistantCitation {
  return (
    isClosedRecord(
      value,
      ['citationId', 'claimKind', 'sourceType', 'sourceId'],
      ['eventId'],
    ) &&
    isNonEmptyString(value.citationId) &&
    isOneOf(value.claimKind, CLAIM_KINDS) &&
    isOneOf(value.sourceType, ASSISTANT_SOURCE_TYPES) &&
    isNonEmptyString(value.sourceId) &&
    isOptionalString(value, 'eventId')
  )
}

function hasConsistentCitations(
  answer: H2AssistantAnswer,
): boolean {
  const sectionIds = answer.sections.map(({ sectionId }) => sectionId)
  const citationIds = answer.citations.map(({ citationId }) => citationId)
  const knownCitationIds = new Set(citationIds)
  const referencedCitationIds = new Set(
    answer.sections.flatMap(({ citationIds: references }) => references),
  )
  return (
    new Set(sectionIds).size === sectionIds.length &&
    knownCitationIds.size === answer.citations.length &&
    answer.sections.every(({ citationIds: references }) =>
      references.length > 0 &&
      new Set(references).size === references.length &&
      references.every((citationId) => knownCitationIds.has(citationId)),
    ) &&
    answer.citations.every((citation) =>
      referencedCitationIds.has(citation.citationId) &&
      citationMatchesEventScope(citation, answer.eventId),
    )
  )
}

function citationMatchesEventScope(
  citation: H2AssistantCitation,
  answerEventId: string | undefined,
): boolean {
  if (
    citation.eventId !== undefined &&
    citation.eventId !== answerEventId
  ) return false
  return (
    answerEventId === undefined ||
    !EVENT_SCOPED_ASSISTANT_SOURCES.has(citation.sourceType) ||
    citation.eventId === answerEventId
  )
}

function hasMatchingEventCounts(
  events: readonly H2AnomalyEvent[],
  eventCountsByCode: unknown,
  eventCountsBySeverity: unknown,
): boolean {
  if (!isRecord(eventCountsByCode) || !isRecord(eventCountsBySeverity)) return false
  const byCode = Object.fromEntries(H2_ANOMALY_CODES.map((code) => [code, 0])) as Record<
    (typeof H2_ANOMALY_CODES)[number],
    number
  >
  const bySeverity = Object.fromEntries(H2_SEVERITIES.map((severity) => [severity, 0])) as Record<
    (typeof H2_SEVERITIES)[number],
    number
  >
  for (const event of events) {
    byCode[event.code] += 1
    bySeverity[event.severity] += 1
  }
  return (
    H2_ANOMALY_CODES.every((code) => byCode[code] === eventCountsByCode[code]) &&
    H2_SEVERITIES.every(
      (severity) => bySeverity[severity] === eventCountsBySeverity[severity],
    )
  )
}

function qualityMatchesDataset(
  quality: H2DataQualityReport,
  dataset: H2DatasetManifest,
): boolean {
  return (
    quality.datasetId === dataset.datasetId &&
    quality.rowCount === dataset.rowCount &&
    quality.timeRange.startTime === dataset.timeRange.startTime &&
    quality.timeRange.endTime === dataset.timeRange.endTime &&
    hasMatchingDatasetProvenance(quality.provenance, dataset.provenance)
  )
}

function hasConsistentAnalysisProvenance(run: H2AnalysisRun): boolean {
  return (
    hasMatchingDatasetProvenance(run.provenance, run.dataset.provenance) &&
    run.events.every((event) =>
      hasMatchingDatasetProvenance(event.provenance, run.dataset.provenance),
    )
  )
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length && left.every(
    (value, index) => value === right[index],
  )
}

function isSafeDatasetSourceFilename(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const candidate = value.trim()
  return (
    candidate === value &&
    candidate.length > 0 &&
    candidate.length <= 128 &&
    candidate !== '.' &&
    candidate !== '..' &&
    !candidate.includes('/') &&
    !candidate.includes('\\') &&
    !candidate.includes('\0') &&
    candidate.toLowerCase().endsWith('.csv')
  )
}
