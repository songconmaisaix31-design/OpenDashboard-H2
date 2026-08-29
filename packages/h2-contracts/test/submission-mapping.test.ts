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
    assert.equal(row.severity, '高')
    assert.equal(
      row.primary_control_object,
      'EMS储能功率控制与接口映射模块',
    )
    assert.equal(row.affected_equipment, 'BESS,PCC')
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

  it('uses event-specific C01/C02 units while preserving exact C06 tokens', () => {
    const c01 = {
      ...H2_GOLDEN_C03_EVENT,
      eventId: 'C01-20260105-001',
      code: 'C01',
      subtype: 'SETPOINT_OSCILLATION',
      affectedEquipment: [
        { kind: 'ELECTROLYZER', id: 'ELZ02', displayName: '碱性电解槽2' },
        { kind: 'ELECTROLYZER', id: 'ELZ03', displayName: '碱性电解槽3' },
        { kind: 'BESS', id: 'BESS01', displayName: '储能系统' },
        { kind: 'PCC', id: 'PCC01', displayName: '并网点' },
      ],
      impact: {
        ...H2_GOLDEN_C03_EVENT.impact,
        metric: 'bess_extra_regulation_energy_kwh',
      },
    } as const
    const c02 = {
      ...H2_GOLDEN_C03_EVENT,
      eventId: 'C02-20260105-001',
      code: 'C02',
      subtype: 'CAPACITY_NOT_SYNCHRONIZED',
      affectedEquipment: [
        { kind: 'ELECTROLYZER', id: 'ELZ03', displayName: '碱性电解槽3' },
      ],
      impact: {
        ...H2_GOLDEN_C03_EVENT.impact,
        metric: 'unserved_elz_energy_kwh',
      },
    } as const
    const c06 = {
      ...H2_GOLDEN_C03_EVENT,
      eventId: 'C06-20260105-001',
      code: 'C06',
      subtype: 'INEFFICIENT_POWER_ALLOCATION',
      affectedEquipment: [
        { kind: 'ELECTROLYZER', id: 'ELZ03', displayName: '碱性电解槽3' },
        { kind: 'ELECTROLYZER', id: 'ELZ02', displayName: '碱性电解槽2' },
      ],
      impact: {
        ...H2_GOLDEN_C03_EVENT.impact,
        metric: 'extra_energy_consumption_kwh',
      },
    } as const

    assert.equal(toH2SubmissionRow(c01).affected_equipment, 'ELZ2,ELZ3,BESS,PCC')
    assert.equal(toH2SubmissionRow(c02).affected_equipment, 'ELZ3')
    assert.equal(toH2SubmissionRow(c06).affected_equipment, 'ELZ1,ELZ2,ELZ3')
  })
})
