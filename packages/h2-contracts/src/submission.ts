import type {
  H2AnomalyCode,
  H2AnomalyEvent,
  H2AnomalyEventForCode,
  H2AnomalySubtypeForCode,
  H2PrimaryImpactMetricForCode,
  H2Severity,
} from './anomaly.ts'

export const H2_SUBMISSION_COLUMNS = [
  'pred_event_id',
  'start_time',
  'end_time',
  'anomaly_code',
  'anomaly_subtype',
  'severity',
  'primary_control_object',
  'affected_equipment',
  'confidence',
  'evidence_json',
  'root_cause',
  'recommended_action',
  'primary_impact_metric',
  'estimated_impact_value',
  'first_detection_time',
  'requires_human_confirmation',
] as const

export type H2SubmissionColumn = (typeof H2_SUBMISSION_COLUMNS)[number]

export interface H2SubmissionRowForCode<TCode extends H2AnomalyCode> {
  readonly pred_event_id: string
  readonly start_time: string
  readonly end_time: string
  readonly anomaly_code: TCode
  readonly anomaly_subtype: H2AnomalySubtypeForCode<TCode>
  readonly severity: H2Severity
  readonly primary_control_object: string
  readonly affected_equipment: string
  readonly confidence: number
  readonly evidence_json: string
  readonly root_cause: string
  readonly recommended_action: string
  readonly primary_impact_metric: H2PrimaryImpactMetricForCode<TCode>
  readonly estimated_impact_value: number
  readonly first_detection_time: string
  readonly requires_human_confirmation: boolean
}

export type H2SubmissionRow = {
  readonly [TCode in H2AnomalyCode]: H2SubmissionRowForCode<TCode>
}[H2AnomalyCode]

type H2SubmissionRowForEvent<TEvent extends H2AnomalyEvent> =
  TEvent extends H2AnomalyEventForCode<infer TCode extends H2AnomalyCode>
    ? H2SubmissionRowForCode<TCode>
    : never

type H2SubmissionCell = string | number | boolean

export function toH2SubmissionRow<TEvent extends H2AnomalyEvent>(
  event: TEvent,
): H2SubmissionRowForEvent<TEvent> {
  return {
    pred_event_id: event.eventId,
    start_time: event.startTime,
    end_time: event.endTime,
    anomaly_code: event.code,
    anomaly_subtype: event.subtype,
    severity: event.severity,
    primary_control_object: event.primaryControlObject.type,
    affected_equipment: event.affectedEquipment
      .map(({ id, kind }) => `${kind}:${id}`)
      .join(';'),
    confidence: event.confidence,
    evidence_json: JSON.stringify(
      event.evidence.map((item) => ({
        evidence_id: item.evidenceId,
        kind: item.kind,
        claim_kind: item.claimKind,
        timestamp: item.timestamp ?? item.interval?.startTime ?? '',
        variable: item.variable ?? '',
        actual_value: item.actualValue ?? '',
        reference_value: item.referenceValue ?? '',
        unit: item.unit ?? '',
        conclusion: item.conclusion,
      })),
    ),
    root_cause: event.rootCause,
    recommended_action: event.recommendations
      .map(({ summary }) => summary)
      .join(' '),
    primary_impact_metric: event.impact.metric,
    estimated_impact_value: event.impact.value,
    first_detection_time: event.firstDetectionTime,
    requires_human_confirmation: event.requiresHumanConfirmation,
  } as H2SubmissionRowForEvent<TEvent>
}

export function toH2SubmissionCells(
  row: H2SubmissionRow,
): readonly H2SubmissionCell[] {
  return H2_SUBMISSION_COLUMNS.map((column) => row[column])
}

export function serializeH2SubmissionRows(
  rows: readonly H2SubmissionRow[],
): string {
  const lines = [
    H2_SUBMISSION_COLUMNS.join(','),
    ...rows.map((row) => toH2SubmissionCells(row).map(formatCsvCell).join(',')),
  ]

  return `${lines.join('\n')}\n`
}

function formatCsvCell(value: H2SubmissionCell): string {
  const text = String(value)
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}
