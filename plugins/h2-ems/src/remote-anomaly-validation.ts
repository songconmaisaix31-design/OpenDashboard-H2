import {
  H2_ANOMALY_CODES,
  H2_SEVERITIES,
  isH2AnomalySubtypeForCode,
  isH2PrimaryImpactMetricForCode,
  type H2AnomalyEvent,
  type H2ControlObject,
  type H2EquipmentKind,
  type H2EvidenceComparator,
  type H2EvidenceKind,
  type H2RecommendationActionKind,
  type H2ReviewState,
  type H2SafetyStatus,
} from '@opendashboard/h2-contracts'

import {
  CLAIM_KINDS,
  hasMatchingDatasetProvenance,
  isClosedRecord,
  isFiniteNumber,
  isNonEmptyString,
  isOneOf,
  isOptionalEnum,
  isOptionalEvidenceValue,
  isOptionalIsoTimestamp,
  isOptionalString,
  isOptionalTimeRange,
  isOrderedEventTimes,
  isProvenance,
  isString,
  isStringArray,
} from './remote-validation-primitives.ts'

const CONTROL_OBJECTS = [
  'EMS_ELECTROLYZER_GROUP_CONTROL',
  'EMS_CAPACITY_MODEL',
  'BESS_CONTROL',
  'PCC_BOUNDARY_CONTROL',
  'GRID_ENERGY_QUOTA_CONTROL',
  'ELECTROLYZER_LOAD_ALLOCATION',
  'BESS_SOC_RESERVE_CONTROL',
] as const satisfies readonly H2ControlObject[]
const EQUIPMENT_KINDS = [
  'PV', 'BESS', 'PCC', 'GRID', 'EMS', 'ELECTROLYZER',
  'ELECTROLYZER_GROUP', 'AUXILIARY_LOAD', 'METERING', 'WEATHER',
] as const satisfies readonly H2EquipmentKind[]
const EVIDENCE_KINDS = [
  'measurement', 'constraint', 'derived_metric', 'alarm_log',
  'operation_log', 'quality_signal', 'knowledge_base',
] as const satisfies readonly H2EvidenceKind[]
const EVIDENCE_COMPARATORS = [
  '>', '>=', '<', '<=', '=', '!=', 'within', 'outside',
] as const satisfies readonly H2EvidenceComparator[]
const SAFETY_STATUSES = [
  'passed', 'warning', 'failed', 'unknown', 'not_applicable',
] as const satisfies readonly H2SafetyStatus[]
const RECOMMENDATION_ACTIONS = [
  'check', 'monitor', 'escalate', 'report',
] as const satisfies readonly H2RecommendationActionKind[]
const REVIEW_STATES = [
  'open', 'confirmed', 'dismissed', 'resolved',
] as const satisfies readonly H2ReviewState[]

export function isEvent(value: unknown): value is H2AnomalyEvent {
  if (
    !isClosedRecord(value, [
      'schemaVersion', 'eventId', 'code', 'subtype', 'title', 'startTime',
      'endTime', 'firstDetectionTime', 'severity', 'confidence',
      'primaryControlObject', 'affectedEquipment', 'evidence', 'impact',
      'safetyChecks', 'recommendations', 'rootCause', 'rootCauseKind',
      'reviewState', 'provenance', 'requiresHumanConfirmation',
    ]) ||
    value.schemaVersion !== 1 ||
    !isNonEmptyString(value.eventId) ||
    !isOneOf(value.code, H2_ANOMALY_CODES) ||
    !isString(value.subtype) ||
    !isH2AnomalySubtypeForCode(value.code, value.subtype) ||
    !isNonEmptyString(value.title) ||
    !isOrderedEventTimes(value.startTime, value.firstDetectionTime, value.endTime) ||
    !isOneOf(value.severity, H2_SEVERITIES) ||
    !isFiniteNumber(value.confidence) ||
    value.confidence < 0 ||
    value.confidence > 1 ||
    !isControlObject(value.primaryControlObject) ||
    !Array.isArray(value.affectedEquipment) ||
    value.affectedEquipment.length === 0 ||
    !value.affectedEquipment.every(isEquipment) ||
    !Array.isArray(value.evidence) ||
    value.evidence.length === 0 ||
    !value.evidence.every(isEvidence) ||
    !isImpact(value.impact, value.code) ||
    !Array.isArray(value.safetyChecks) ||
    !value.safetyChecks.every(isSafetyCheck) ||
    !Array.isArray(value.recommendations) ||
    !value.recommendations.every(isRecommendation) ||
    !isNonEmptyString(value.rootCause) ||
    (value.rootCauseKind !== 'fact' && value.rootCauseKind !== 'inference') ||
    !isOneOf(value.reviewState, REVIEW_STATES) ||
    !isProvenance(value.provenance) ||
    typeof value.requiresHumanConfirmation !== 'boolean'
  ) return false
  const event = value as unknown as H2AnomalyEvent
  return (
    hasConsistentEventReferences(event) &&
    hasConsistentEventProvenance(event)
  )
}

export function isEventArray(
  value: unknown,
): value is readonly H2AnomalyEvent[] {
  if (!Array.isArray(value) || !value.every(isEvent)) return false
  return new Set(value.map(({ eventId }) => eventId)).size === value.length
}

function isControlObject(value: unknown): boolean {
  return (
    isClosedRecord(value, ['type', 'id', 'displayName']) &&
    isOneOf(value.type, CONTROL_OBJECTS) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.displayName)
  )
}

function isEquipment(value: unknown): boolean {
  return (
    isClosedRecord(value, ['kind', 'id', 'displayName']) &&
    isOneOf(value.kind, EQUIPMENT_KINDS) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.displayName)
  )
}

function isEvidence(value: unknown): boolean {
  return (
    isClosedRecord(
      value,
      ['schemaVersion', 'evidenceId', 'kind', 'claimKind', 'source', 'conclusion', 'provenance'],
      ['timestamp', 'interval', 'variable', 'actualValue', 'referenceValue', 'unit', 'comparator'],
    ) &&
    value.schemaVersion === 1 &&
    isNonEmptyString(value.evidenceId) &&
    isOneOf(value.kind, EVIDENCE_KINDS) &&
    isOneOf(value.claimKind, CLAIM_KINDS) &&
    isOptionalIsoTimestamp(value, 'timestamp') &&
    isOptionalTimeRange(value, 'interval') &&
    isOptionalString(value, 'variable') &&
    isOptionalEvidenceValue(value, 'actualValue') &&
    isOptionalEvidenceValue(value, 'referenceValue') &&
    isOptionalString(value, 'unit') &&
    isOptionalEnum(value, 'comparator', EVIDENCE_COMPARATORS) &&
    isNonEmptyString(value.source) &&
    isNonEmptyString(value.conclusion) &&
    isProvenance(value.provenance)
  )
}

function isImpact(
  value: unknown,
  code: (typeof H2_ANOMALY_CODES)[number],
): boolean {
  return (
    isClosedRecord(value, [
      'metric', 'value', 'unit', 'formulaVersion', 'assumptions',
      'evidenceIds', 'provenance',
    ]) &&
    isString(value.metric) &&
    isH2PrimaryImpactMetricForCode(code, value.metric) &&
    isFiniteNumber(value.value) &&
    isOneOf(value.unit, ['kWh', 'kW', 'percent', 'minutes', 'count'] as const) &&
    isNonEmptyString(value.formulaVersion) &&
    isStringArray(value.assumptions) &&
    isStringArray(value.evidenceIds) &&
    isProvenance(value.provenance)
  )
}

function isSafetyCheck(value: unknown): boolean {
  return (
    isClosedRecord(
      value,
      ['checkId', 'title', 'status', 'message', 'evidenceIds', 'provenance'],
      ['constraintId'],
    ) &&
    isNonEmptyString(value.checkId) &&
    isNonEmptyString(value.title) &&
    isOneOf(value.status, SAFETY_STATUSES) &&
    isNonEmptyString(value.message) &&
    isOptionalString(value, 'constraintId') &&
    isStringArray(value.evidenceIds) &&
    isProvenance(value.provenance)
  )
}

function isRecommendation(value: unknown): boolean {
  return (
    isClosedRecord(value, [
      'recommendationId', 'actionKind', 'summary', 'rationale',
      'safetyCheckIds', 'evidenceIds', 'requiresHumanConfirmation', 'provenance',
    ]) &&
    isNonEmptyString(value.recommendationId) &&
    isOneOf(value.actionKind, RECOMMENDATION_ACTIONS) &&
    isNonEmptyString(value.summary) &&
    isNonEmptyString(value.rationale) &&
    isStringArray(value.safetyCheckIds) &&
    isStringArray(value.evidenceIds) &&
    value.requiresHumanConfirmation === true &&
    isProvenance(value.provenance)
  )
}

function hasConsistentEventReferences(event: H2AnomalyEvent): boolean {
  const evidenceIds = event.evidence.map(({ evidenceId }) => evidenceId)
  const safetyCheckIds = event.safetyChecks.map(({ checkId }) => checkId)
  const recommendationIds = event.recommendations.map(
    ({ recommendationId }) => recommendationId,
  )
  const knownEvidenceIds = new Set(evidenceIds)
  const knownSafetyCheckIds = new Set(safetyCheckIds)
  return (
    isUnique(evidenceIds) &&
    isUnique(safetyCheckIds) &&
    isUnique(recommendationIds) &&
    referencesKnownIds(event.impact.evidenceIds, knownEvidenceIds) &&
    event.safetyChecks.every(({ evidenceIds: references }) =>
      referencesKnownIds(references, knownEvidenceIds),
    ) &&
    event.recommendations.every((recommendation) =>
      referencesKnownIds(recommendation.evidenceIds, knownEvidenceIds) &&
      referencesKnownIds(recommendation.safetyCheckIds, knownSafetyCheckIds),
    )
  )
}

function hasConsistentEventProvenance(event: H2AnomalyEvent): boolean {
  return [
    ...event.evidence.map(({ provenance }) => provenance),
    event.impact.provenance,
    ...event.safetyChecks.map(({ provenance }) => provenance),
    ...event.recommendations.map(({ provenance }) => provenance),
  ].every((provenance) =>
    hasMatchingDatasetProvenance(provenance, event.provenance),
  )
}

function referencesKnownIds(
  references: readonly string[],
  knownIds: ReadonlySet<string>,
): boolean {
  return isUnique(references) && references.every((id) => knownIds.has(id))
}

function isUnique(values: readonly string[]): boolean {
  return new Set(values).size === values.length
}
