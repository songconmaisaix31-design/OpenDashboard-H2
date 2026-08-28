import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  ANOMALY_CODES,
  OFFICIAL_EQUIPMENT_TOKENS,
  OFFICIAL_FIELDS,
  PRIMARY_CONTROL_OBJECT_BY_CODE,
  PRIMARY_IMPACT_METRIC_BY_CODE,
  SUBTYPES_BY_CODE,
  assertOfficialTimeseriesColumns,
  validateEquipmentTokenSet,
} from '../../../validation/lib/official-contract.mjs'

const directory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(directory, '../../..')

describe('H2 Sentinel official vocabulary contract', () => {
  it('freezes the exact 69-field public timeseries vocabulary', () => {
    const fixture = JSON.parse(
      readFileSync(
        resolve(directory, '../fixtures/official-timeseries-columns.json'),
        'utf8',
      ),
    )
    assert.equal(fixture.count, 69)
    assert.equal(OFFICIAL_FIELDS.length, 69)
    assert.equal(new Set(OFFICIAL_FIELDS).size, 69)
    assert.deepEqual(OFFICIAL_FIELDS, fixture.fields)
    assert.equal(OFFICIAL_FIELDS[0], 'timestamp')
    assert.equal(OFFICIAL_FIELDS.at(-1), 'system_alarm_count')
    assert.throws(
      () => assertOfficialTimeseriesColumns(OFFICIAL_FIELDS.slice(0, -1)),
      /official 69-field vocabulary/,
    )
    assert.throws(
      () => assertOfficialTimeseriesColumns([...OFFICIAL_FIELDS, 'anomaly_code']),
      /official 69-field vocabulary/,
    )
  })

  it('covers C01-C07 with closed subtype, control-object, and impact vocabularies', () => {
    assert.deepEqual(ANOMALY_CODES, ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07'])
    for (const code of ANOMALY_CODES) {
      assert.ok(SUBTYPES_BY_CODE.get(code)?.length >= 1, code)
      assert.ok(PRIMARY_CONTROL_OBJECT_BY_CODE.get(code)?.length > 0, code)
      assert.ok(PRIMARY_IMPACT_METRIC_BY_CODE.get(code)?.length > 0, code)
    }
  })

  it('freezes the exact official affected-equipment token alphabet and per-code sets', () => {
    assert.deepEqual(
      [...OFFICIAL_EQUIPMENT_TOKENS].sort(),
      ['BESS', 'ELZ', 'ELZ1', 'ELZ2', 'ELZ3', 'PCC', 'PV'],
    )
    const valid = [
      ['C01', ['ELZ2', 'ELZ3', 'BESS', 'PCC']],
      ['C02', ['ELZ1']],
      ['C03', ['BESS', 'PCC']],
      ['C04', ['PCC', 'BESS', 'ELZ', 'PV']],
      ['C05', ['PCC', 'BESS', 'ELZ']],
      ['C06', ['ELZ1', 'ELZ2', 'ELZ3']],
      ['C07', ['BESS', 'PCC', 'PV', 'ELZ']],
    ]
    for (const [code, tokens] of valid) {
      assert.equal(validateEquipmentTokenSet(code, tokens), null, code)
    }
    assert.match(validateEquipmentTokenSet('C03', ['BESS01', 'PCC']), /non-official/)
    assert.match(validateEquipmentTokenSet('C04', ['BESS', 'PCC']), /exactly/)
  })

  it('matches the canonical product vocabulary when the Lane A package is integrated', (context) => {
    const canonicalPath = resolve(
      repositoryRoot,
      'packages/h2-vocabulary/data/fields.json',
    )
    if (!existsSync(canonicalPath)) {
      context.skip('packages/h2-vocabulary is coordinator-integrated from Lane A')
      return
    }
    const canonical = JSON.parse(readFileSync(canonicalPath, 'utf8'))
    assert.deepEqual(canonical.fields.map(({ name }) => name), OFFICIAL_FIELDS)
  })
})
