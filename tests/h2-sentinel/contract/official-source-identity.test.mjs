import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { OFFICIAL_FIELDS } from '../../../validation/lib/official-contract.mjs'
import {
  collectPredictionsThenLoadLabels,
  labelsInWindow,
} from '../../../validation/evaluate.mjs'
import {
  EVALUATION_WINDOWS,
  OFFICIAL_SOURCES,
  assertLabelSourceIdentity,
  sha256,
} from '../../../validation/lib/official-sources.mjs'
import { inspectOfficialTimeseries } from '../../../validation/lib/official-timeseries.mjs'
import {
  assertAnalysisRun,
  assertImportedDataset,
} from '../../../validation/lib/runtime-provenance.mjs'

describe('H2 Sentinel official source identity', () => {
  it('opens labels only after detector predictions complete', async () => {
    const calls = []
    let analysisComplete = false
    const result = await collectPredictionsThenLoadLabels({
      predictionSource: { kind: 'streamed-official-timeseries' },
      set: 'validation',
      officialData: 'unused',
      labelContract: { filename: 'unused.csv' },
      collectPredictionsFn: async () => {
        calls.push('analysis:start')
        await Promise.resolve()
        analysisComplete = true
        calls.push('analysis:complete')
        return {
          predictions: [],
          importedChunks: [{ day: '2026-01-01' }],
          runtime: null,
        }
      },
      loadGroundTruthFn: () => {
        assert.equal(analysisComplete, true)
        calls.push('labels:opened')
        return {
          events: [{
            id: 'label-1',
            code: 'C01',
            startTime: '2026-01-01T00:00:00Z',
            endTime: '2026-01-01T00:01:00Z',
          }],
          identity: { filename: 'unused.csv' },
        }
      },
    })

    assert.deepEqual(calls, ['analysis:start', 'analysis:complete', 'labels:opened'])
    assert.equal(result.groundTruth.length, 1)

    let labelsOpenedAfterFailure = false
    await assert.rejects(
      collectPredictionsThenLoadLabels({
        predictionSource: { kind: 'streamed-official-timeseries' },
        set: 'validation',
        officialData: 'unused',
        labelContract: { filename: 'unused.csv' },
        collectPredictionsFn: async () => {
          throw new Error('analysis failed')
        },
        loadGroundTruthFn: () => {
          labelsOpenedAfterFailure = true
          return { events: [], identity: {} }
        },
      }),
      /analysis failed/,
    )
    assert.equal(labelsOpenedAfterFailure, false)
  })

  it('freezes independent hashes, full row counts, and evaluation windows', () => {
    assert.deepEqual(
      {
        validationTimeseries: OFFICIAL_SOURCES.validation.timeseries.sha256,
        validationRows: OFFICIAL_SOURCES.validation.timeseries.rowCount,
        validationLabels: OFFICIAL_SOURCES.validation.labels.sha256,
        validationEvents: OFFICIAL_SOURCES.validation.labels.eventCount,
        testRows: OFFICIAL_SOURCES.test.timeseries.rowCount,
        trainRows: OFFICIAL_SOURCES.train.timeseries.rowCount,
        trainLast90Rows: EVALUATION_WINDOWS['train-last-90'].rowCount,
        trainLast90Labels: EVALUATION_WINDOWS['train-last-90'].labelCount,
        trainLast90ByCode: EVALUATION_WINDOWS['train-last-90'].byCode,
      },
      {
        validationTimeseries: 'sha256:182728b3a4c5326503a90a04325adcf97fddc290c59ed1e319fa7e8be97d9666',
        validationRows: 129_600,
        validationLabels: 'sha256:47989467020fad5499168179716ce93da4585e8204dad80b71cfd803231d0cf4',
        validationEvents: 70,
        testRows: 172_800,
        trainRows: 525_600,
        trainLast90Rows: 129_600,
        trainLast90Labels: 63,
        trainLast90ByCode: { C01: 9, C02: 13, C03: 8, C04: 9, C05: 11, C06: 2, C07: 11 },
      },
    )
  })

  it('uses inclusive interval overlap for the frozen UTC-day evaluation window', () => {
    const chunks = [{ day: '2025-10-03' }, { day: '2025-12-31' }]
    const selected = labelsInWindow([
      { id: 'ends-at-window-start', startTime: '2025-10-02T23:00:00Z', endTime: '2025-10-03T00:00:00Z' },
      { id: 'first-c02-in-window', startTime: '2025-10-03T13:30:00Z', endTime: '2025-10-03T14:51:00Z' },
      { id: 'starts-at-window-end', startTime: '2025-12-31T23:59:59.999Z', endTime: '2026-01-01T00:01:00Z' },
      { id: 'before-window', startTime: '2025-10-02T22:00:00Z', endTime: '2025-10-02T23:59:59.999Z' },
      { id: 'after-window', startTime: '2026-01-01T00:00:00Z', endTime: '2026-01-01T00:01:00Z' },
    ], chunks)

    assert.deepEqual(
      selected.map(({ id }) => id),
      ['ends-at-window-start', 'first-c02-in-window', 'starts-at-window-end'],
    )
  })

  it('rejects same-name one-row lookalikes before slicing or reporting', async () => {
    const row = OFFICIAL_FIELDS.map((field) => field === 'timestamp' ? '2026-01-01 00:00:00' : '0')
    const directory = mkdtempSync(join(tmpdir(), 'h2-timeseries-lookalike-'))
    const timeseriesPath = join(directory, OFFICIAL_SOURCES.validation.timeseries.filename)
    writeFileSync(timeseriesPath, `${OFFICIAL_FIELDS.join(',')}\n${row.join(',')}\n`, 'utf8')
    try {
      await assert.rejects(
        inspectOfficialTimeseries(timeseriesPath, OFFICIAL_SOURCES.validation.timeseries),
        /SHA-256|row count/,
      )
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
    assert.throws(
      () => assertLabelSourceIdentity({
        bytes: Buffer.from('event_id,anomaly_code,start_time,end_time\nVA0034,C04,2026-01-22 11:19:00,2026-01-22 12:15:00\n'),
        rowCount: 1,
        events: [{
          id: 'VA0034',
          code: 'C04',
          startTime: '2026-01-22T11:19:00Z',
          endTime: '2026-01-22T12:15:00Z',
        }],
        contract: OFFICIAL_SOURCES.validation.labels,
      }),
      /SHA-256|row or event count/,
    )
  })

  it('requires unique non-empty label IDs even under a matching test contract', () => {
    const bytes = Buffer.from('test-label-bytes')
    const contract = {
      filename: 'labels.csv',
      sha256: sha256(bytes),
      rowCount: 2,
      eventCount: 2,
      firstStart: '2026-01-01T00:00:00Z',
      lastEnd: '2026-01-01T00:02:00Z',
      byCode: { C01: 2, C02: 0, C03: 0, C04: 0, C05: 0, C06: 0, C07: 0 },
    }
    assert.throws(
      () => assertLabelSourceIdentity({
        bytes,
        rowCount: 2,
        events: [
          { id: 'duplicate', code: 'C01', startTime: '2026-01-01T00:00:00Z', endTime: '2026-01-01T00:01:00Z' },
          { id: 'duplicate', code: 'C01', startTime: '2026-01-01T00:01:00Z', endTime: '2026-01-01T00:02:00Z' },
        ],
        contract,
      }),
      /unique, non-empty/,
    )
  })

  it('binds LIVE_ANALYSIS import and run IDs, ranges, filenames, rows, and fingerprints', () => {
    const fingerprint = `sha256:${'a'.repeat(64)}`
    const timeRange = {
      startTime: '2026-01-01T00:00:00Z',
      endTime: '2026-01-01T00:01:00Z',
    }
    const provenance = {
      mode: 'LIVE_ANALYSIS',
      source: 'in-memory-csv-import',
      generatedAt: '2026-01-01T00:02:00Z',
      datasetFingerprint: fingerprint,
      modelVersion: null,
      ruleVersion: 'rules-v1',
      configurationVersion: 'configuration-v1',
      limitations: ['Local analysis only.'],
    }
    const imported = {
      dataset: {
        datasetId: 'dataset-1',
        mode: 'LIVE_ANALYSIS',
        sourceFilename: 'validation-2026-01-01.csv',
        rowCount: 2,
        fingerprint,
        timeRange,
        provenance,
      },
    }
    const importedIdentity = assertImportedDataset(imported, {
      filename: imported.dataset.sourceFilename,
      rowCount: 2,
      fingerprint,
    })
    assert.equal(importedIdentity.datasetId, 'dataset-1')

    const run = {
      runId: 'run-1',
      dataset: { ...imported.dataset },
      provenance: { ...provenance },
    }
    assert.equal(assertAnalysisRun(run, imported).runId, 'run-1')
    assert.throws(
      () => assertImportedDataset({ dataset: { ...imported.dataset, datasetId: '' } }, {
        filename: imported.dataset.sourceFilename,
        rowCount: 2,
        fingerprint,
      }),
      /identity/,
    )
    assert.throws(
      () => assertAnalysisRun({
        ...run,
        dataset: {
          ...run.dataset,
          timeRange: { ...timeRange, endTime: '2025-12-31T23:59:00Z' },
        },
      }, imported),
      /identity/,
    )
  })
})
