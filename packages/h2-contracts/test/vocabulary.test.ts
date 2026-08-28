import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  H2_ANOMALY_CODES,
  H2_ANOMALY_TAXONOMY,
  H2_ASSISTANT_QUESTIONS,
  H2_ASSISTANT_QUESTIONS_ZH,
  H2_DEPRECATED_FIELD_MAPPINGS,
  H2_FIXTURE_DATASET,
  H2_IMPACT_FORMULAS,
  H2_OFFICIAL_FIELDS,
  deprecatedFieldName,
  submissionEquipmentTokensByCode,
} from '../src/index.ts'

describe('official H2 vocabulary', () => {
  it('freezes 69 unique canonical fields and seven anomaly classes', () => {
    const names = H2_OFFICIAL_FIELDS.map(({ name }) => name)

    assert.equal(names.length, 69)
    assert.equal(new Set(names).size, 69)
    assert.deepEqual(
      H2_ANOMALY_TAXONOMY.map(({ code }) => code),
      H2_ANOMALY_CODES,
    )
    assert.equal(H2_ANOMALY_TAXONOMY.length, 7)
    assert(
      H2_ANOMALY_TAXONOMY.every(
        ({ affectedEquipment, primaryImpactMetric, subtypes }) =>
          affectedEquipment.length > 0 &&
          primaryImpactMetric.length > 0 &&
          subtypes.length > 0,
      ),
    )
  })

  it('keeps the fixture manifest aligned with the canonical header', () => {
    assert.deepEqual(
      H2_FIXTURE_DATASET.fields.map(({ name }) => name),
      H2_OFFICIAL_FIELDS.map(({ name }) => name),
    )
  })

  it('keeps the exact Q01-Q10 Chinese prompts in one vocabulary', () => {
    assert.deepEqual(
      H2_ASSISTANT_QUESTIONS_ZH.map(({ questionId, question }) => ({
        questionId,
        prompt: question,
      })),
      H2_ASSISTANT_QUESTIONS,
    )
  })

  it('makes every deprecated fixture name explicit', () => {
    assert.equal(H2_DEPRECATED_FIELD_MAPPINGS.length, 8)
    assert.equal(deprecatedFieldName('bess_power_kw'), 'bess_power_actual_kw')
    assert.equal(deprecatedFieldName('pcc_power_kw'), 'pcc_power_actual_kw')
    assert.equal(deprecatedFieldName('total_electrolyzer_power_kw'), null)
    assert.equal(
      H2_DEPRECATED_FIELD_MAPPINGS.find(
        ({ internal }) => internal === 'total_electrolyzer_power_kw',
      )?.derived,
      'elz1_power_actual_kw + elz2_power_actual_kw + elz3_power_actual_kw',
    )
  })

  it('freezes official submission equipment tokens separately from event refs', () => {
    assert.deepEqual(submissionEquipmentTokensByCode('C03'), ['BESS', 'PCC'])
    assert.deepEqual(submissionEquipmentTokensByCode('C06'), [
      'ELZ1',
      'ELZ2',
      'ELZ3',
    ])
  })

  it('versions C06 public-train calibration separately from physical constraints', () => {
    assert.equal(H2_IMPACT_FORMULAS.formulaVersion, 'impact-c06-v3')
    assert.equal(H2_IMPACT_FORMULAS.source.calibrationSplit, 'public_train')
    assert.match(H2_IMPACT_FORMULAS.source.heldOutPolicy, /acceptance-only/)
    assert.deepEqual(H2_IMPACT_FORMULAS.classes.C06.subtypeRates, {
      AVOIDABLE_START_STOP: 0.018,
      INEFFICIENT_POWER_ALLOCATION: 0.022,
    })
    assert.match(H2_IMPACT_FORMULAS.classes.C06.rationale, /not physical/)
  })
})
