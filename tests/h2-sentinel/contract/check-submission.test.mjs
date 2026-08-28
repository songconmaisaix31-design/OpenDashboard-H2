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

function row(overrides = {}) {
  const code = overrides.anomaly_code ?? 'C03'
  return {
    pred_event_id: `${code}-fixture-001`,
    start_time: '2026-01-05T10:24:00Z',
    end_time: '2026-01-05T10:30:00Z',
    anomaly_code: code,
    anomaly_subtype: subtypes[code],
    severity: '高',
    primary_control_object: controls[code],
    affected_equipment: 'BESS,PCC',
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
    const cases = {
      C01: 'ELZ2,ELZ3,BESS,PCC',
      C02: 'ELZ1',
      C03: 'BESS,PCC',
      C04: 'PCC,BESS,ELZ,PV',
      C05: 'PCC,BESS,ELZ',
      C06: 'ELZ1,ELZ2,ELZ3',
      C07: 'BESS,PCC,PV,ELZ',
    }
    for (const [code, affected_equipment] of Object.entries(cases)) {
      const result = validateSubmissionText(
        serializeSubmission([row({ anomaly_code: code, affected_equipment })]),
      )
      assert.equal(result.valid, true, `${code}: ${result.issues.join(' | ')}`)
    }
  })

  it('rejects equipment-master IDs, id:name values, spaces, and wrong token sets', () => {
    for (const affected_equipment of [
      'BESS01,PCC',
      'BESS01:储能系统;PCC01:并网点',
      'BESS, PCC',
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
    const result = validateSubmissionText(
      serializeSubmission([row({ requires_human_confirmation: 'false' })]),
    )
    assert.equal(result.valid, false)
    assert.ok(
      result.issues.some((issue) =>
        issue.includes('requires_human_confirmation must be true for every recommendation'),
      ),
    )
  })

  it('freezes the exact 16-column order', () => {
    assert.equal(SUBMISSION_COLUMNS.length, 16)
    assert.equal(SUBMISSION_COLUMNS[0], 'pred_event_id')
    assert.equal(SUBMISSION_COLUMNS.at(-1), 'requires_human_confirmation')
  })
})
