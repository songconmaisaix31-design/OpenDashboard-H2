import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const qaDirectory = resolve(fileURLToPath(new URL('.', import.meta.url)))
const repositoryRoot = resolve(qaDirectory, '../..')
const contractsDirectory = resolve(repositoryRoot, 'packages/h2-contracts')

const passed = []
const skipped = []
const failed = []
const canonicalC04ImpactKwh = 120

function run(name, test) {
  try {
    test()
    passed.push(name)
    console.log(`PASS ${name}`)
  } catch (error) {
    failed.push({ name, error })
    console.error(`FAIL ${name}`)
    console.error(error instanceof Error ? error.message : String(error))
  }
}

function skip(name, reason) {
  skipped.push({ name, reason })
  console.log(`SKIP ${name} — ${reason}`)
}

function readContractFile(relativePath) {
  return readFileSync(resolve(contractsDirectory, relativePath), 'utf8')
}

function readJson(relativePath) {
  return JSON.parse(readContractFile(relativePath))
}

function validateSchema(value, schema, path = '$') {
  const errors = []
  if (schema.allOf) {
    schema.allOf.forEach((item) => errors.push(...validateSchema(value, item, path)))
  }
  if (schema.oneOf) {
    const matches = schema.oneOf.filter(
      (item) => validateSchema(value, item, path).length === 0,
    )
    if (matches.length !== 1) {
      errors.push(`${path} must match exactly one schema branch`)
    }
    return errors
  }
  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${path} must equal the schema constant`)
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path} must use an allowed enum value`)
  }
  if (schema.required && (!value || typeof value !== 'object' || Array.isArray(value))) {
    errors.push(`${path} must be an object`)
    return errors
  }
  if (schema.required) {
    schema.required.forEach((key) => {
      if (!(key in value)) errors.push(`${path}.${key} is required`)
    })
  }
  if (schema.properties && value && typeof value === 'object' && !Array.isArray(value)) {
    Object.entries(schema.properties).forEach(([key, propertySchema]) => {
      if (key in value) errors.push(...validateSchema(value[key], propertySchema, `${path}.${key}`))
    })
  }
  return errors
}

function parseCsv(csv) {
  const [header, ...lines] = csv.trim().split(/\r?\n/)
  assert.ok(header, 'CSV must have a header')
  const columns = header.split(',')
  return lines.map((line) =>
    Object.fromEntries(
      columns.map((column, index) => [column, line.split(',')[index] ?? '']),
    ),
  )
}

function assertFixtureProvenance(value, label) {
  assert.equal(value.provenance?.mode, 'FIXTURE', `${label} must be fixture-provenanced`)
  assert.match(value.provenance?.source ?? '', /sanitized/i, `${label} must identify a sanitized source`)
  assert.ok(value.provenance?.datasetFingerprint?.startsWith('sha256:'), `${label} must carry a dataset fingerprint`)
}

function assertEventContract(event, expected) {
  assert.equal(event.code, expected.code)
  assert.equal(event.subtype, expected.subtype)
  assert.equal(event.impact.metric, expected.metric)
  assert.equal(event.requiresHumanConfirmation, true)
  assert.ok(event.confidence >= 0 && event.confidence <= 1)
  assert.ok(Date.parse(event.startTime) <= Date.parse(event.firstDetectionTime))
  assert.ok(Date.parse(event.firstDetectionTime) <= Date.parse(event.endTime))
  assert.ok(event.evidence.length >= 3)
  assert.ok(event.recommendations.every((item) => item.requiresHumanConfirmation))
  assertFixtureProvenance(event, event.eventId)
  event.evidence.forEach((item) => assertFixtureProvenance(item, item.evidenceId))
}

run('C01 frozen contract assets are present and deterministic', () => {
  const csv = readContractFile('fixtures/tiny-valid-timeseries.csv')
  const fingerprint = `sha256:${createHash('sha256').update(csv).digest('hex')}`
  const fixturesSource = readContractFile('src/fixtures.ts')

  assert.match(fixturesSource, new RegExp(fingerprint))
  assert.equal(parseCsv(csv).length, 22)
})

const c03 = readJson('fixtures/golden-c03.json')
const c04 = readJson('fixtures/golden-c04.json')
const rows = parseCsv(readContractFile('fixtures/tiny-valid-timeseries.csv'))
const rowsByTimestamp = new Map(rows.map((row) => [row.timestamp, row]))

run('C02 golden C03 fixture preserves evidence, provenance, and advisory boundary', () => {
  assertEventContract(c03, {
    code: 'C03',
    subtype: 'BESS_DIRECTION_REVERSED',
    metric: 'abnormal_grid_exchange_energy_kwh',
  })
  const row = rowsByTimestamp.get('2026-01-05T10:24:00Z')
  assert.ok(row, 'C03 evidence timestamp must exist in the fixture CSV')
  assert.equal(Number(row.bess_power_cmd_kw), -240)
  assert.equal(Number(row.bess_power_actual_kw), 230)
})

run('C02a golden C03/C04 fixtures conform to the published anomaly JSON Schema', () => {
  const schema = readJson('schema/anomaly-event.schema.json')
  assert.deepEqual(validateSchema(c03, schema), [])
  assert.deepEqual(validateSchema(c04, schema), [])
})

run('C04 golden impact is reproducible from the sanitized minute fixture', () => {
  assertEventContract(c04, {
    code: 'C04',
    subtype: 'EXPORT_POWER_LIMIT_NOT_TRACKED',
    metric: 'pcc_power_limit_violation_energy_kwh',
  })
  const impact = rows
    .filter((row) => row.timestamp >= c04.startTime && row.timestamp <= c04.endTime)
    .reduce((total, row) => total + Number(row.pcc_export_power_violation_kw) / 60, 0)
  assert.equal(c04.impact.value, canonicalC04ImpactKwh)
  assert.ok(
    Math.abs(impact - c04.impact.value) < 1e-10,
    `CSV-derived C04 impact must equal golden contract value ${c04.impact.value} kWh`,
  )
})

run('C04 report, submission, and redaction contracts retain safe export boundaries', () => {
  const report = readJson('schema/report-descriptor.schema.json')
  const api = readJson('schema/api-envelope.schema.json')
  const submission = readContractFile('src/submission.ts')

  assert.ok(report.required.includes('safetyDisclaimer'))
  assert.ok(api.oneOf.some((variant) => variant.properties?.status?.const === 'error'))
  assert.match(submission, /H2_SUBMISSION_COLUMNS/)
  for (const artifact of [JSON.stringify(c03), JSON.stringify(c04)]) {
    assert.doesNotMatch(artifact, /(?:[A-Za-z]:\\|\/home\/|Authorization:|api[_-]?key|password)/i)
  }
})

console.log(`SUMMARY PASS=${passed.length} SKIP=${skipped.length} FAIL=${failed.length}`)
if (failed.length > 0) {
  process.exitCode = 1
} else {
  await import('./assembled/run-assembled-qa.mjs')
}
