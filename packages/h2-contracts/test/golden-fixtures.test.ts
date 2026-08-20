import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import {
  H2_PRIMARY_IMPACT_METRIC_BY_CODE,
  H2_FIXTURE_DATASET,
  H2_GOLDEN_C03_EVENT,
  H2_GOLDEN_C04_EVENT,
  isH2PrimaryImpactMetricForCode,
  isH2AnomalySubtypeForCode,
  type H2AnomalyEvent,
} from '../src/index.ts'

const jsonFixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'),
  ) as unknown

const csvFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8')

describe('H2 golden fixtures', () => {
  it('keep C03 and C04 domain invariants explicit', () => {
    assertEventInvariants(H2_GOLDEN_C03_EVENT)
    assertEventInvariants(H2_GOLDEN_C04_EVENT)

    assert.equal(
      H2_GOLDEN_C03_EVENT.impact.metric,
      'abnormal_grid_exchange_energy_kwh',
    )
    assert.equal(
      H2_GOLDEN_C04_EVENT.impact.metric,
      'pcc_power_limit_violation_energy_kwh',
    )
  })

  it('keep JSON fixtures aligned with typed fixture identities', () => {
    assertFixtureIdentity(jsonFixture('golden-c03.json'), H2_GOLDEN_C03_EVENT)
    assertFixtureIdentity(jsonFixture('golden-c04.json'), H2_GOLDEN_C04_EVENT)
  })

  it('derives the C04 violation energy from every inclusive event sample', () => {
    const rows = parseCsv(csvFixture('tiny-valid-timeseries.csv')).rows
    const expectedImpact = 29.333333333333332
    const intervalRows = rows.filter(
      (row) => {
        const timestamp = row.timestamp
        return (
          timestamp !== undefined &&
          timestamp >= H2_GOLDEN_C04_EVENT.startTime &&
          timestamp <= H2_GOLDEN_C04_EVENT.endTime
        )
      },
    )
    const violationPowerMinutes = intervalRows.reduce(
      (total, row) =>
        total +
        Math.max(Number(row.pcc_power_kw) - Number(row.pcc_export_limit_kw), 0),
      0,
    )
    const calculatedImpact = violationPowerMinutes / 60

    assert.equal(intervalRows.length, 8)
    assert(intervalRows.every((row) => Number(row.pcc_power_kw) === 720))
    assert(intervalRows.every((row) => Number(row.pcc_export_limit_kw) === 500))
    assert.equal(calculatedImpact, expectedImpact)
    assert.equal(H2_GOLDEN_C04_EVENT.impact.value, calculatedImpact)

    const jsonC04 = jsonFixture('golden-c04.json')
    assert(isObject(jsonC04))
    assert(isObject(jsonC04.impact))
    assert.equal(jsonC04.impact.value, calculatedImpact)
    assert(Array.isArray(jsonC04.evidence))
    const derivedEvidence = jsonC04.evidence.find(
      (item) =>
        isObject(item) &&
        item.evidenceId === 'C04-EV-003' &&
        item.variable === 'pcc_power_limit_violation_energy_kwh',
    )
    assert(isObject(derivedEvidence))
    assert.equal(derivedEvidence.actualValue, calculatedImpact)
    assert.equal(
      H2_GOLDEN_C04_EVENT.evidence.find(
        (item) => item.evidenceId === 'C04-EV-003',
      )?.actualValue,
      calculatedImpact,
    )
  })

  it('do not contain absolute paths or secret-shaped values', () => {
    const allFixtureText = [
      JSON.stringify(H2_GOLDEN_C03_EVENT),
      JSON.stringify(H2_GOLDEN_C04_EVENT),
      csvFixture('tiny-valid-timeseries.csv'),
      csvFixture('tiny-invalid-timeseries.csv'),
    ].join('\n')

    assert(!/[A-Za-z]:\\/.test(allFixtureText))
    assert(!/\\\\[^,\n]+\\/.test(allFixtureText))
    assert(!/(api[_-]?key|password|private key|secret=|token=)/i.test(allFixtureText))
  })

  it('provide one tiny valid CSV and one intentionally invalid CSV', () => {
    const validRows = parseCsv(csvFixture('tiny-valid-timeseries.csv'))
    const invalidRows = parseCsv(csvFixture('tiny-invalid-timeseries.csv'))

    assert.equal(validRows.headers[0], 'timestamp')
    assert.deepEqual(
      [...validRows.headers].sort(),
      H2_FIXTURE_DATASET.fields.map(({ name }) => name).sort(),
    )
    assert.equal(validRows.rows.length, H2_FIXTURE_DATASET.rowCount)
    assert.equal(
      validRows.rows[0]?.timestamp,
      H2_FIXTURE_DATASET.timeRange.startTime,
    )
    assert.equal(
      validRows.rows.at(-1)?.timestamp,
      H2_FIXTURE_DATASET.timeRange.endTime,
    )
    assertContinuousOneMinuteSamples(validRows.rows)
    assert(validRows.rows.every((row) => row.pcc_power_kw !== ''))
    assertGoldenEventEvidenceIsCovered(validRows.rows, H2_GOLDEN_C03_EVENT)
    assertGoldenEventEvidenceIsCovered(validRows.rows, H2_GOLDEN_C04_EVENT)
    assertGoldenEvidenceMatchesCsv(validRows.rows, H2_GOLDEN_C03_EVENT)
    assertGoldenEvidenceMatchesCsv(validRows.rows, H2_GOLDEN_C04_EVENT)

    assert.equal(invalidRows.rows.length, 3)
    assert.notEqual(
      new Set(invalidRows.rows.map((row) => row.timestamp)).size,
      invalidRows.rows.length,
    )
    assert(invalidRows.rows.some((row) => row.pcc_power_kw === ''))
    assert(invalidRows.rows.some((row) => Number(row.bess_soc_percent) > 90))
  })

  it('uses the real CSV byte digest in dataset and JSON fixture provenance', () => {
    const csvBytes = readFileSync(
      new URL('../fixtures/tiny-valid-timeseries.csv', import.meta.url),
    )
    const expectedFingerprint = `sha256:${createHash('sha256')
      .update(csvBytes)
      .digest('hex')}`

    assert.equal(H2_FIXTURE_DATASET.fingerprint, expectedFingerprint)
    assert.equal(H2_FIXTURE_DATASET.provenance.datasetFingerprint, expectedFingerprint)

    for (const name of ['golden-c03.json', 'golden-c04.json']) {
      const text = readFileSync(
        new URL(`../fixtures/${name}`, import.meta.url),
        'utf8',
      )
      const fixtureFingerprints = [
        ...text.matchAll(/"datasetFingerprint": "([^"]+)"/g),
      ].map((match) => match[1])

      assert(fixtureFingerprints.length > 0)
      assert(fixtureFingerprints.every((value) => value === expectedFingerprint))
    }
  })
})

function assertEventInvariants(event: H2AnomalyEvent): void {
  assert(isH2AnomalySubtypeForCode(event.code, event.subtype))
  assert(isH2PrimaryImpactMetricForCode(event.code, event.impact.metric))
  assert.equal(event.impact.metric, H2_PRIMARY_IMPACT_METRIC_BY_CODE[event.code])
  assert.equal(event.requiresHumanConfirmation, true)
  assert(event.confidence >= 0 && event.confidence <= 1)
  assert(Date.parse(event.startTime) <= Date.parse(event.firstDetectionTime))
  assert(Date.parse(event.firstDetectionTime) <= Date.parse(event.endTime))
  assert(event.evidence.length >= 3)
  assert(event.recommendations.every((item) => item.requiresHumanConfirmation))

  const evidenceIds = new Set(event.evidence.map(({ evidenceId }) => evidenceId))
  const referencedEvidenceIds = [
    ...event.impact.evidenceIds,
    ...event.safetyChecks.flatMap(({ evidenceIds }) => evidenceIds),
    ...event.recommendations.flatMap(({ evidenceIds }) => evidenceIds),
  ]

  assert(referencedEvidenceIds.every((id) => evidenceIds.has(id)))
}

function assertContinuousOneMinuteSamples(
  rows: readonly Record<string, string>[],
): void {
  for (let index = 1; index < rows.length; index += 1) {
    const previousTimestamp = rows[index - 1]?.timestamp
    const currentTimestamp = rows[index]?.timestamp
    assert(previousTimestamp)
    assert(currentTimestamp)
    assert.equal(
      Date.parse(currentTimestamp) - Date.parse(previousTimestamp),
      H2_FIXTURE_DATASET.samplingIntervalMinutes * 60_000,
    )
  }
}

function assertGoldenEventEvidenceIsCovered(
  rows: readonly Record<string, string>[],
  event: H2AnomalyEvent,
): void {
  const timestamps = new Set(rows.map((row) => row.timestamp))
  assert(timestamps.has(event.startTime))
  assert(timestamps.has(event.endTime))
  event.evidence.forEach((item) => {
    if (item.timestamp) {
      assert(timestamps.has(item.timestamp))
    }
    if (item.interval) {
      assert(timestamps.has(item.interval.startTime))
      assert(timestamps.has(item.interval.endTime))
    }
  })
}

function assertGoldenEvidenceMatchesCsv(
  rows: readonly Record<string, string>[],
  event: H2AnomalyEvent,
): void {
  const rowsByTimestamp = new Map(rows.map((row) => [row.timestamp, row]))

  event.evidence.forEach((item) => {
    if (
      item.kind !== 'measurement' ||
      !item.timestamp ||
      !item.variable ||
      typeof item.actualValue !== 'number'
    ) {
      return
    }

    const row = rowsByTimestamp.get(item.timestamp)
    assert(row, `missing source row for ${item.evidenceId}`)
    assert.equal(Number(row[item.variable]), item.actualValue)
  })
}

function assertFixtureIdentity(
  candidate: unknown,
  expected: H2AnomalyEvent,
): void {
  assert(isObject(candidate))
  assert.equal(candidate.eventId, expected.eventId)
  assert.equal(candidate.code, expected.code)
  assert.equal(candidate.subtype, expected.subtype)
  assert.equal(candidate.requiresHumanConfirmation, true)
}

interface CsvRows {
  readonly headers: readonly string[]
  readonly rows: readonly Record<string, string>[]
}

function parseCsv(csv: string): CsvRows {
  const [headerLine, ...rowLines] = csv.trim().split(/\r?\n/)
  assert(headerLine)
  const headers = headerLine.split(',')
  return {
    headers,
    rows: rowLines.map((line) => {
      const cells = line.split(',')
      return Object.fromEntries(
        headers.map((header, index) => [header, cells[index] ?? '']),
      )
    }),
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
