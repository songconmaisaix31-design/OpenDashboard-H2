import { parseCsvText, serializeCsv } from './csv.mjs'

export const SUBMISSION_COLUMNS = Object.freeze([
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
])

export function parseSubmission(text) {
  const { columns, rows } = parseCsvText(text, 'Submission CSV', {
    normalizeHeaders: false,
  })
  return {
    columns,
    rows: rows.map((row) =>
      Object.fromEntries(
        columns.map((column, index) => [column, row[index] ?? '']),
      ),
    ),
  }
}

export function serializeSubmission(rows) {
  return serializeCsv(
    SUBMISSION_COLUMNS,
    rows.map((row) => SUBMISSION_COLUMNS.map((column) => row[column])),
  )
}
