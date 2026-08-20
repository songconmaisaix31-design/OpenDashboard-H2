import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  H2_GOLDEN_C03_EVENT,
  H2_SUBMISSION_COLUMNS,
  serializeH2SubmissionRows,
  toH2SubmissionCells,
  toH2SubmissionRow,
} from '../src/index.ts'

const expectedColumns = [
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

describe('H2 submission mapping', () => {
  it('freezes the exact competition column order', () => {
    assert.deepEqual(H2_SUBMISSION_COLUMNS, expectedColumns)
  })

  it('maps canonical anomaly events into exact submission cells', () => {
    const row = toH2SubmissionRow(H2_GOLDEN_C03_EVENT)

    assert.equal(row.pred_event_id, H2_GOLDEN_C03_EVENT.eventId)
    assert.equal(row.anomaly_code, 'C03')
    assert.equal(row.anomaly_subtype, 'BESS_DIRECTION_REVERSED')
    assert.equal(row.primary_impact_metric, 'abnormal_grid_exchange_energy_kwh')
    assert.equal(row.requires_human_confirmation, true)
    assert.deepEqual(toH2SubmissionCells(row), expectedColumns.map((key) => row[key]))

    const evidence = JSON.parse(row.evidence_json) as readonly unknown[]
    assert.equal(evidence.length, H2_GOLDEN_C03_EVENT.evidence.length)
  })

  it('serializes submission CSV with the frozen header first', () => {
    const row = toH2SubmissionRow(H2_GOLDEN_C03_EVENT)
    const csv = serializeH2SubmissionRows([row])
    const [header, body] = csv.trimEnd().split('\n')

    assert.equal(header, expectedColumns.join(','))
    assert(body)
    assert(body.startsWith('C03-20260105-001,2026-01-05T10:20:00Z'))
    assert(body.endsWith(',true'))
  })
})
