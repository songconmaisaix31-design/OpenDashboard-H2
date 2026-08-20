import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = resolve(fileURLToPath(new URL('.', import.meta.url)))
const contracts = resolve(directory, '../../../packages/h2-contracts')
const c03 = JSON.parse(readFileSync(resolve(contracts, 'fixtures/golden-c03.json'), 'utf8'))
const c04 = JSON.parse(readFileSync(resolve(contracts, 'fixtures/golden-c04.json'), 'utf8'))

const columns = [
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
]

function expectedRow(event) {
  return {
    pred_event_id: event.eventId,
    start_time: event.startTime,
    end_time: event.endTime,
    anomaly_code: event.code,
    anomaly_subtype: event.subtype,
    severity: event.severity,
    primary_control_object: event.primaryControlObject.type,
    affected_equipment: event.affectedEquipment.map(({ kind, id }) => `${kind}:${id}`).join(';'),
    confidence: event.confidence,
    evidence_json: JSON.stringify(event.evidence.map((item) => ({
      evidence_id: item.evidenceId,
      kind: item.kind,
      claim_kind: item.claimKind,
      timestamp: item.timestamp ?? item.interval?.startTime ?? '',
      variable: item.variable ?? '',
      actual_value: item.actualValue ?? '',
      reference_value: item.referenceValue ?? '',
      unit: item.unit ?? '',
      conclusion: item.conclusion,
    }))),
    root_cause: event.rootCause,
    recommended_action: event.recommendations.map(({ summary }) => summary).join(' '),
    primary_impact_metric: event.impact.metric,
    estimated_impact_value: event.impact.value,
    first_detection_time: event.firstDetectionTime,
    requires_human_confirmation: event.requiresHumanConfirmation,
  }
}

describe('H2 Sentinel QA submission conformance', () => {
  it('freezes the exact C03 and C04 competition row values', () => {
    assert.deepEqual(
      expectedRow(c03),
      {
        ...expectedRow(c03),
        pred_event_id: 'C03-20260105-001',
        anomaly_code: 'C03',
        anomaly_subtype: 'BESS_DIRECTION_REVERSED',
        primary_impact_metric: 'abnormal_grid_exchange_energy_kwh',
        estimated_impact_value: 112.4,
        requires_human_confirmation: true,
      },
    )
    assert.deepEqual(
      expectedRow(c04),
      {
        ...expectedRow(c04),
        pred_event_id: 'C04-20260105-001',
        anomaly_code: 'C04',
        anomaly_subtype: 'EXPORT_POWER_LIMIT_NOT_TRACKED',
        primary_impact_metric: 'pcc_power_limit_violation_energy_kwh',
        estimated_impact_value: 29.333333333333332,
        requires_human_confirmation: true,
      },
    )
  })

  it('keeps every expected row in the frozen source column order', () => {
    for (const event of [c03, c04]) {
      assert.deepEqual(Object.keys(expectedRow(event)), columns)
    }
  })
})
