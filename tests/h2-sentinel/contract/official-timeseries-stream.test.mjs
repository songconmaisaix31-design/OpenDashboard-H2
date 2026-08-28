import assert from 'node:assert/strict'
import { createReadStream, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, it } from 'node:test'

import { parseCsvText, serializeCsv } from '../../../validation/lib/csv.mjs'
import { OFFICIAL_FIELDS } from '../../../validation/lib/official-contract.mjs'
import { sha256 } from '../../../validation/lib/official-sources.mjs'
import {
  inspectOfficialTimeseries,
  snapshotOfficialTimeseries,
  streamOfficialTimeseriesWindow,
} from '../../../validation/lib/official-timeseries.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../../..')

function timeseriesRow(timestamp, value = '1') {
  return OFFICIAL_FIELDS.map((field) => field === 'timestamp' ? timestamp : value)
}

function fixtureContent(headers = OFFICIAL_FIELDS, rows = [
  timeseriesRow('2026-01-01 00:00:00'),
  timeseriesRow('2026-01-01 00:01:00'),
  timeseriesRow('2026-01-02 00:00:00'),
  timeseriesRow('2026-01-02 00:01:00'),
  timeseriesRow('2026-01-03 00:00:00'),
  timeseriesRow('2026-01-03 00:01:00'),
]) {
  return serializeCsv(headers, rows)
}

function contractFor(content, overrides = {}) {
  return {
    filename: 'streamed-timeseries.csv',
    sha256: sha256(Buffer.from(content, 'utf8')),
    rowCount: 6,
    firstTimestamp: '2026-01-01T00:00:00Z',
    lastTimestamp: '2026-01-03T00:01:00Z',
    ...overrides,
  }
}

describe('H2 Sentinel streamed official timeseries', () => {
  it('verifies the full source twice while retaining only the selected UTC-day chunk', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'h2-streamed-timeseries-'))
    const path = join(directory, 'streamed-timeseries.csv')
    const content = `\uFEFF${fixtureContent()}`
    writeFileSync(path, content, 'utf8')
    let readStreamCalls = 0
    const chunks = []
    try {
      const result = await streamOfficialTimeseriesWindow({
        path,
        contract: contractFor(content),
        minimumUtcDay: '2026-01-02',
        limitDays: 1,
        onChunk: (chunk) => chunks.push(chunk),
      }, {
        createReadStreamFn: (sourcePath) => {
          readStreamCalls += 1
          return createReadStream(sourcePath)
        },
      })

      assert.equal(readStreamCalls, 2)
      assert.deepEqual(result.identity, {
        filename: 'streamed-timeseries.csv',
        sha256: contractFor(content).sha256,
        rowCount: 6,
        fieldCount: 69,
        firstTimestamp: '2026-01-01T00:00:00Z',
        lastTimestamp: '2026-01-03T00:01:00Z',
      })
      assert.deepEqual(result.selectedWindow, {
        rowCount: 2,
        firstTimestamp: '2026-01-02T00:00:00.000Z',
        lastTimestamp: '2026-01-02T00:01:00.000Z',
        firstUtcDay: '2026-01-02',
        lastUtcDay: '2026-01-02',
      })
      assert.equal(chunks.length, 1)
      assert.equal(chunks[0].day, '2026-01-02')
      assert.equal(chunks[0].rowCount, 2)
      const selected = parseCsvText(chunks[0].text, 'Selected streamed chunk')
      assert.deepEqual(selected.columns, OFFICIAL_FIELDS)
      assert.deepEqual(
        selected.rows.map((row) => row[0]),
        ['2026-01-02T00:00:00Z', '2026-01-02T00:01:00Z'],
      )
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('fails closed on hash, row-count, header, range, and timestamp drift', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'h2-streamed-drift-'))
    const path = join(directory, 'streamed-timeseries.csv')
    const content = fixtureContent()
    try {
      writeFileSync(path, content, 'utf8')
      await assert.rejects(
        inspectOfficialTimeseries(path, contractFor(content, {
          sha256: `sha256:${'0'.repeat(64)}`,
        })),
        /SHA-256/,
      )
      await assert.rejects(
        inspectOfficialTimeseries(path, contractFor(content, { rowCount: 7 })),
        /row count/,
      )
      await assert.rejects(
        inspectOfficialTimeseries(path, contractFor(content, {
          firstTimestamp: '2026-01-01T00:01:00Z',
        })),
        /range/,
      )

      const swappedHeaders = [...OFFICIAL_FIELDS]
      ;[swappedHeaders[0], swappedHeaders[1]] = [swappedHeaders[1], swappedHeaders[0]]
      const swappedContent = fixtureContent(swappedHeaders)
      writeFileSync(path, swappedContent, 'utf8')
      await assert.rejects(
        inspectOfficialTimeseries(path, contractFor(swappedContent)),
        /exact 69-field order/,
      )

      const duplicateRows = [
        timeseriesRow('2026-01-01 00:00:00'),
        timeseriesRow('2026-01-01 00:00:00'),
        timeseriesRow('2026-01-02 00:00:00'),
        timeseriesRow('2026-01-02 00:01:00'),
        timeseriesRow('2026-01-03 00:00:00'),
        timeseriesRow('2026-01-03 00:01:00'),
      ]
      const duplicateContent = fixtureContent(OFFICIAL_FIELDS, duplicateRows)
      writeFileSync(path, duplicateContent, 'utf8')
      await assert.rejects(
        inspectOfficialTimeseries(path, contractFor(duplicateContent)),
        /unique, and strictly increasing/,
      )
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('captures the exact validated bytes for submission in one immutable streaming pass', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'h2-streamed-snapshot-'))
    const path = join(directory, 'streamed-timeseries.csv')
    const content = `\uFEFF${fixtureContent()}`
    writeFileSync(path, content, 'utf8')
    let readStreamCalls = 0
    try {
      const snapshot = await snapshotOfficialTimeseries(
        path,
        contractFor(content),
        {
          createReadStreamFn: (sourcePath) => {
            readStreamCalls += 1
            return createReadStream(sourcePath, { highWaterMark: 7 })
          },
        },
      )

      assert.equal(readStreamCalls, 1)
      assert.equal(snapshot.text, content)
      assert.equal(sha256(Buffer.from(snapshot.text, 'utf8')), snapshot.identity.sha256)
      assert.equal(snapshot.identity.sha256, contractFor(content).sha256)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('keeps TRAIN evaluation, slice preparation, and offline smoke off full cell-matrix parsing', () => {
    const evaluator = readFileSync(resolve(repositoryRoot, 'validation/evaluate.mjs'), 'utf8')
    const offline = readFileSync(
      resolve(repositoryRoot, 'validation/offline-deploy-smoke.mjs'),
      'utf8',
    )
    const slice = readFileSync(
      resolve(repositoryRoot, 'tests/h2-sentinel/scripts/prepare-validation-slice.mjs'),
      'utf8',
    )

    assert.match(evaluator, /streamOfficialTimeseriesWindow/)
    assert.doesNotMatch(evaluator, /timeseriesBytes|timeseriesText|chunkRowsByUtcDay/)
    assert.equal((evaluator.match(/\breadFileSync\s*\(/g) ?? []).length, 1)
    assert.equal((evaluator.match(/\bparseCsvText\s*\(/g) ?? []).length, 1)
    assert.match(evaluator, /decodeUtf8Strict\(bytes, 'Official labels'\)/)
    assert.match(offline, /snapshotOfficialTimeseries/)
    assert.doesNotMatch(offline, /inspectOfficialTimeseries|readFileSync/)
    assert.doesNotMatch(offline, /normalizeOfficialCsv|parseCsvText|parsed\.rows/)
    assert.match(slice, /streamOfficialTimeseriesWindow/)
    assert.doesNotMatch(slice, /timeseriesBytes|timeseriesCsv|validateTimeseries/)
  })
})
