import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { validateSubmissionText } from '../../../validation/check-submission.mjs'
import { serializeSubmission, SUBMISSION_COLUMNS } from '../../../validation/lib/submission.mjs'

const controls = {
  C01: 'EMS电解槽群控与功率分配模块',
  C02: 'EMS设备状态与容量同步模块',
  C03: 'EMS储能功率控制与接口映射模块',
  C04: 'EMS并网点功率边界控制模块',
  C05: 'EMS周期电量配额与日内能量计划模块',
  C06: 'EMS电解槽群控分配模块',
  C07: 'EMS储能SOC计划与调节备用管理模块',
}
const subtypes = {
  C01: 'SETPOINT_OSCILLATION',
  C02: 'CAPACITY_NOT_SYNCHRONIZED',
  C03: 'BESS_DIRECTION_REVERSED',
  C04: 'EXPORT_POWER_LIMIT_NOT_TRACKED',
  C05: 'EXPORT_ENERGY_QUOTA_RISK',
  C06: 'INEFFICIENT_POWER_ALLOCATION',
  C07: 'CHARGE_HEADROOM_SHORTFALL',
}
const metrics = {
  C01: 'bess_extra_regulation_energy_kwh',
  C02: 'unserved_elz_energy_kwh',
  C03: 'abnormal_grid_exchange_energy_kwh',
  C04: 'pcc_power_limit_violation_energy_kwh',
  C05: 'grid_energy_quota_deviation_kwh',
  C06: 'extra_energy_consumption_kwh',
  C07: 'bess_regulation_reserve_shortfall_kwh',
}
const severities = {
  C01: '中', C02: '高', C03: '高', C04: '高', C05: '高', C06: '中', C07: '高',
}
const equipment = {
  C01: 'ELZ1,ELZ2,BESS,PCC',
  C02: 'ELZ1',
  C03: 'BESS,PCC',
  C04: 'PCC,BESS,ELZ,PV',
  C05: 'PCC,BESS,ELZ',
  C06: 'ELZ1,ELZ2,ELZ3',
  C07: 'BESS,PCC,PV,ELZ',
}

function row(overrides = {}) {
  const code = overrides.anomaly_code ?? 'C03'
  return {
    pred_event_id: `${code}-fixture-001`,
    start_time: '2026-01-05T10:24:00Z',
    end_time: '2026-01-05T10:30:00Z',
    anomaly_code: code,
    anomaly_subtype: subtypes[code],
    severity: severities[code],
    primary_control_object: controls[code],
    affected_equipment: equipment[code],
    confidence: '0.94',
    evidence_json: '[{"evidence_id":"EV-001","kind":"measurement"}]',
    root_cause: 'Bounded evidence-grounded cause.',
    recommended_action: 'Verify locally before any human-confirmed action.',
    primary_impact_metric: metrics[code],
    estimated_impact_value: '1.0',
    first_detection_time: '2026-01-05T10:25:00Z',
    requires_human_confirmation: 'true',
    ...overrides,
  }
}

describe('H2 Sentinel official submission checker', () => {
  it('accepts all seven official affected-equipment token shapes', () => {
    for (const [code, affected_equipment] of Object.entries(equipment)) {
      const result = validateSubmissionText(
        serializeSubmission([row({ anomaly_code: code, affected_equipment })]),
      )
      assert.equal(result.valid, true, `${code}: ${result.issues.join(' | ')}`)
    }
  })

  it('accepts dynamic official C01 pairs and C02 instances without accepting duplicates or extras', () => {
    for (const affected_equipment of [
      'ELZ1,ELZ3,BESS,PCC',
      'ELZ2,ELZ3,BESS,PCC',
    ]) {
      const result = validateSubmissionText(serializeSubmission([row({
        anomaly_code: 'C01',
        affected_equipment,
      })]))
      assert.equal(result.valid, true, result.issues.join(' | '))
    }
    for (const affected_equipment of ['ELZ2', 'ELZ3']) {
      const result = validateSubmissionText(serializeSubmission([row({
        anomaly_code: 'C02',
        affected_equipment,
      })]))
      assert.equal(result.valid, true, result.issues.join(' | '))
    }
    for (const [code, affected_equipment] of [
      ['C01', 'ELZ1,ELZ1,BESS,PCC'],
      ['C01', 'ELZ1,ELZ2,ELZ3,BESS,PCC'],
      ['C02', 'ELZ1,ELZ2'],
      ['C02', 'ELZ'],
    ]) {
      assert.equal(validateSubmissionText(serializeSubmission([row({
        anomaly_code: code,
        affected_equipment,
      })])).valid, false)
    }
  })

  it('accepts a legitimate early warning and rejects late or invalid chronology', () => {
    const early = validateSubmissionText(serializeSubmission([row({
      anomaly_code: 'C05',
      first_detection_time: '2026-01-05T09:55:00Z',
    })]))
    assert.equal(early.valid, true, early.issues.join(' | '))

    assert.equal(validateSubmissionText(serializeSubmission([row({
      anomaly_code: 'C03',
      first_detection_time: '2026-01-05T09:55:00Z',
    })])).valid, false)

    for (const overrides of [
      { first_detection_time: '2026-01-05T10:30:01Z' },
      { start_time: '2026-01-05T10:31:00Z', end_time: '2026-01-05T10:30:00Z' },
      { start_time: '2026-02-30T10:00:00Z' },
      { end_time: '2026-01-05T10:30:00+00:00' },
      { first_detection_time: '2026-01-05 10:25:00' },
    ]) {
      assert.equal(
        validateSubmissionText(serializeSubmission([row(overrides)])).valid,
        false,
        JSON.stringify(overrides),
      )
    }
  })

  it('accepts only finite decimal numbers and non-negative impact', () => {
    for (const overrides of [
      { confidence: '0x1' },
      { confidence: ' 0.9' },
      { confidence: 'Infinity' },
      { estimated_impact_value: '-0.1' },
      { estimated_impact_value: '0x10' },
      { estimated_impact_value: 'NaN' },
    ]) {
      assert.equal(validateSubmissionText(serializeSubmission([row(overrides)])).valid, false)
    }
    assert.equal(
      validateSubmissionText(serializeSubmission([row({
        confidence: '9e-1',
        estimated_impact_value: '0',
      })])).valid,
      true,
    )
  })

  it('requires minimally valid evidence objects', () => {
    for (const evidence_json of ['[null]', '[{}]', '[["EV-001"]]', '[{"evidence_id":""}]']) {
      assert.equal(
        validateSubmissionText(serializeSubmission([row({ evidence_json })])).valid,
        false,
        evidence_json,
      )
    }
    assert.equal(
      validateSubmissionText(serializeSubmission([row({
        evidence_json: '[{"evidence_id":"EV-001"}]',
      })])).valid,
      true,
    )
  })

  it('rejects trimmed or BOM-prefixed header lookalikes', () => {
    const valid = serializeSubmission([row()])
    assert.equal(validateSubmissionText(valid.replace('pred_event_id', ' pred_event_id')).valid, false)
    assert.equal(validateSubmissionText(`\uFEFF${valid}`).valid, false)
  })

  it('rejects equipment-master IDs, id:name values, spaces, and wrong token sets', () => {
    for (const affected_equipment of [
      'BESS01,PCC',
      'BESS01:储能系统;PCC01:并网点',
      'BESS, PCC',
      ' BESS,PCC',
      'BESS,PCC,PV',
    ]) {
      const result = validateSubmissionText(
        serializeSubmission([row({ affected_equipment })]),
      )
      assert.equal(result.valid, false, affected_equipment)
    }
  })

  it('rejects header drift, duplicate IDs, mojibake, and unsafe field values', () => {
    assert.equal(validateSubmissionText('a,b\n1,2\n').valid, false)
    assert.equal(validateSubmissionText(serializeSubmission([row(), row()])).valid, false)
    assert.equal(
      validateSubmissionText(
        serializeSubmission([row({ root_cause: '锟斤拷' })]),
      ).valid,
      false,
    )
    assert.equal(
      validateSubmissionText(
        serializeSubmission([row({ requires_human_confirmation: 'TRUE' })]),
      ).valid,
      false,
    )
  })

  it('rejects recommendations that do not require human confirmation', () => {
    for (const requires_human_confirmation of ['false', ' true', 'true ']) {
      const result = validateSubmissionText(
        serializeSubmission([row({ requires_human_confirmation })]),
      )
      assert.equal(result.valid, false)
      assert.ok(
        result.issues.some((issue) =>
          issue.includes('requires_human_confirmation must be true for every recommendation'),
        ),
      )
    }
  })

  it('freezes the exact 16-column order', () => {
    assert.equal(SUBMISSION_COLUMNS.length, 16)
    assert.equal(SUBMISSION_COLUMNS[0], 'pred_event_id')
    assert.equal(SUBMISSION_COLUMNS.at(-1), 'requires_human_confirmation')
  })
})
