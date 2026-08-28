import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { validateSubmissionText } from '../../../validation/check-submission.mjs'
import {
  PRIMARY_CONTROL_OBJECT_BY_CODE,
  PRIMARY_IMPACT_METRIC_BY_CODE,
} from '../../../validation/lib/official-contract.mjs'
import { serializeSubmission, SUBMISSION_COLUMNS } from '../../../validation/lib/submission.mjs'

const directory = resolve(fileURLToPath(new URL('.', import.meta.url)))
const fixture = JSON.parse(
  readFileSync(
    resolve(directory, '../fixtures/official-submission-cases.json'),
    'utf8',
  ),
)

function submissionRow(entry) {
  return {
    pred_event_id: `${entry.code}-official-schema-001`,
    start_time: '2026-01-05T10:00:00Z',
    end_time: '2026-01-05T10:10:00Z',
    anomaly_code: entry.code,
    anomaly_subtype: entry.subtype,
    severity: entry.severity,
    primary_control_object: entry.primaryControlObject,
    affected_equipment: entry.affectedEquipment,
    confidence: '0.9',
    evidence_json: '[{"evidence_id":"EV-001","kind":"measurement"}]',
    root_cause: 'Evidence-grounded local finding.',
    recommended_action: 'Verify locally before a human-confirmed action.',
    primary_impact_metric: entry.primaryImpactMetric,
    estimated_impact_value: String(entry.estimatedImpactValue),
    first_detection_time: ['C05', 'C07'].includes(entry.code)
      ? '2026-01-05T09:59:00Z'
      : '2026-01-05T10:00:00Z',
    requires_human_confirmation: 'true',
  }
}

describe('H2 Sentinel integrated submission conformance', () => {
  it('uses the official C01-C07 mappings and passes the strict checker', () => {
    assert.equal(fixture.schemaVersion, 1)
    assert.deepEqual(fixture.cases.map(({ code }) => code), [
      'C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07',
    ])
    for (const entry of fixture.cases) {
      assert.equal(entry.primaryControlObject, PRIMARY_CONTROL_OBJECT_BY_CODE.get(entry.code))
      assert.equal(entry.primaryImpactMetric, PRIMARY_IMPACT_METRIC_BY_CODE.get(entry.code))
      const result = validateSubmissionText(serializeSubmission([submissionRow(entry)]))
      assert.equal(result.valid, true, `${entry.code}: ${result.issues.join(' | ')}`)
    }
  })

  it('freezes the corrected integrated C03 and C04 impact values', () => {
    assert.equal(fixture.cases.find(({ code }) => code === 'C03').estimatedImpactValue, 84.33333333333333)
    assert.equal(fixture.cases.find(({ code }) => code === 'C04').estimatedImpactValue, 120)
  })

  it('keeps every case in the exact 16-column order', () => {
    for (const entry of fixture.cases) {
      assert.deepEqual(Object.keys(submissionRow(entry)), SUBMISSION_COLUMNS)
    }
  })
})
