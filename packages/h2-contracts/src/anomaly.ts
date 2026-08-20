import type { H2ClaimKind, H2Provenance, H2TimeRange } from './provenance.ts'

export const H2_ANOMALY_CODES = [
  'C01',
  'C02',
  'C03',
  'C04',
  'C05',
  'C06',
  'C07',
] as const

export type H2AnomalyCode = (typeof H2_ANOMALY_CODES)[number]

export const H2_ANOMALY_SUBTYPES_BY_CODE = {
  C01: ['SETPOINT_OSCILLATION'],
  C02: ['CAPACITY_NOT_SYNCHRONIZED'],
  C03: ['BESS_DIRECTION_REVERSED'],
  C04: ['EXPORT_POWER_LIMIT_NOT_TRACKED', 'IMPORT_POWER_LIMIT_NOT_TRACKED'],
  C05: ['EXPORT_ENERGY_QUOTA_RISK', 'IMPORT_ENERGY_QUOTA_RISK'],
  C06: ['AVOIDABLE_START_STOP', 'INEFFICIENT_POWER_ALLOCATION'],
  C07: ['CHARGE_HEADROOM_SHORTFALL', 'DISCHARGE_RESERVE_SHORTFALL'],
} as const satisfies Record<H2AnomalyCode, readonly string[]>

type H2AnomalySubtypeMap = typeof H2_ANOMALY_SUBTYPES_BY_CODE

export type H2AnomalySubtype =
  H2AnomalySubtypeMap[keyof H2AnomalySubtypeMap][number]

export type H2AnomalySubtypeForCode<TCode extends H2AnomalyCode> =
  H2AnomalySubtypeMap[TCode][number]

export const H2_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const

export type H2Severity = (typeof H2_SEVERITIES)[number]

export const H2_PRIMARY_IMPACT_METRIC_BY_CODE = {
  C01: 'bess_extra_regulation_energy_kwh',
  C02: 'unserved_elz_energy_kwh',
  C03: 'abnormal_grid_exchange_energy_kwh',
  C04: 'pcc_power_limit_violation_energy_kwh',
  C05: 'grid_energy_quota_deviation_kwh',
  C06: 'extra_energy_consumption_kwh',
  C07: 'bess_regulation_reserve_shortfall_kwh',
} as const satisfies Record<H2AnomalyCode, string>

export type H2ImpactMetric =
  (typeof H2_PRIMARY_IMPACT_METRIC_BY_CODE)[H2AnomalyCode]

export type H2PrimaryImpactMetricForCode<TCode extends H2AnomalyCode> =
  (typeof H2_PRIMARY_IMPACT_METRIC_BY_CODE)[TCode]

export type H2ControlObject =
  | 'EMS_ELECTROLYZER_GROUP_CONTROL'
  | 'EMS_CAPACITY_MODEL'
  | 'BESS_CONTROL'
  | 'PCC_BOUNDARY_CONTROL'
  | 'GRID_ENERGY_QUOTA_CONTROL'
  | 'ELECTROLYZER_LOAD_ALLOCATION'
  | 'BESS_SOC_RESERVE_CONTROL'

export type H2EquipmentKind =
  | 'PV'
  | 'BESS'
  | 'PCC'
  | 'GRID'
  | 'EMS'
  | 'ELECTROLYZER'
  | 'ELECTROLYZER_GROUP'
  | 'AUXILIARY_LOAD'
  | 'METERING'
  | 'WEATHER'

export interface H2ControlObjectRef {
  readonly type: H2ControlObject
  readonly id: string
  readonly displayName: string
}

export interface H2EquipmentRef {
  readonly kind: H2EquipmentKind
  readonly id: string
  readonly displayName: string
}

export type H2EvidenceKind =
  | 'measurement'
  | 'constraint'
  | 'derived_metric'
  | 'alarm_log'
  | 'operation_log'
  | 'quality_signal'
  | 'knowledge_base'

export type H2EvidenceComparator =
  | '>'
  | '>='
  | '<'
  | '<='
  | '='
  | '!='
  | 'within'
  | 'outside'

export type H2EvidenceValue = string | number | boolean

export interface H2EvidenceItem {
  readonly schemaVersion: 1
  readonly evidenceId: string
  readonly kind: H2EvidenceKind
  readonly claimKind: H2ClaimKind
  readonly source: string
  readonly conclusion: string
  readonly provenance: H2Provenance
  readonly timestamp?: string
  readonly interval?: H2TimeRange
  readonly variable?: string
  readonly actualValue?: H2EvidenceValue
  readonly referenceValue?: H2EvidenceValue
  readonly unit?: string
  readonly comparator?: H2EvidenceComparator
}

export interface H2ImpactResult<TCode extends H2AnomalyCode = H2AnomalyCode> {
  readonly metric: H2PrimaryImpactMetricForCode<TCode>
  readonly value: number
  readonly unit: 'kWh' | 'kW' | 'percent' | 'minutes' | 'count'
  readonly formulaVersion: string
  readonly assumptions: readonly string[]
  readonly evidenceIds: readonly string[]
  readonly provenance: H2Provenance
}

export type H2SafetyStatus =
  | 'passed'
  | 'warning'
  | 'failed'
  | 'unknown'
  | 'not_applicable'

export interface H2SafetyCheck {
  readonly checkId: string
  readonly title: string
  readonly status: H2SafetyStatus
  readonly message: string
  readonly constraintId?: string
  readonly evidenceIds: readonly string[]
  readonly provenance: H2Provenance
}

export type H2RecommendationActionKind =
  | 'check'
  | 'monitor'
  | 'escalate'
  | 'report'

export interface H2Recommendation {
  readonly recommendationId: string
  readonly actionKind: H2RecommendationActionKind
  readonly summary: string
  readonly rationale: string
  readonly safetyCheckIds: readonly string[]
  readonly evidenceIds: readonly string[]
  readonly requiresHumanConfirmation: true
  readonly provenance: H2Provenance
}

export type H2ReviewState = 'open' | 'confirmed' | 'dismissed' | 'resolved'

export interface H2AnomalyEventForCode<TCode extends H2AnomalyCode> {
  readonly schemaVersion: 1
  readonly eventId: string
  readonly code: TCode
  readonly subtype: H2AnomalySubtypeForCode<TCode>
  readonly title: string
  readonly startTime: string
  readonly endTime: string
  readonly firstDetectionTime: string
  readonly severity: H2Severity
  readonly confidence: number
  readonly primaryControlObject: H2ControlObjectRef
  readonly affectedEquipment: readonly H2EquipmentRef[]
  readonly evidence: readonly H2EvidenceItem[]
  readonly impact: H2ImpactResult<TCode>
  readonly safetyChecks: readonly H2SafetyCheck[]
  readonly recommendations: readonly H2Recommendation[]
  readonly rootCause: string
  readonly rootCauseKind: Extract<H2ClaimKind, 'fact' | 'inference'>
  readonly reviewState: H2ReviewState
  readonly provenance: H2Provenance
  readonly requiresHumanConfirmation: boolean
}

export type H2AnomalyEvent = {
  readonly [TCode in H2AnomalyCode]: H2AnomalyEventForCode<TCode>
}[H2AnomalyCode]

export function isH2AnomalySubtypeForCode<TCode extends H2AnomalyCode>(
  code: TCode,
  subtype: string,
): subtype is H2AnomalySubtypeForCode<TCode> {
  return (H2_ANOMALY_SUBTYPES_BY_CODE[code] as readonly string[]).includes(
    subtype,
  )
}

export function isH2PrimaryImpactMetricForCode<TCode extends H2AnomalyCode>(
  code: TCode,
  metric: string,
): metric is H2PrimaryImpactMetricForCode<TCode> {
  return H2_PRIMARY_IMPACT_METRIC_BY_CODE[code] === metric
}
