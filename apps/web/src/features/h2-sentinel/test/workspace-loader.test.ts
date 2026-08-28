import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

import type {
  H2CsvImportRequest,
  H2DatasetField,
  H2SentinelDataSource,
} from '@opendashboard/h2-contracts'
import {
  H2_CSV_MAX_BYTES,
  H2_CSV_MAX_ROWS,
  H2CsvInputError,
  hydrateH2Workspace,
  importH2CsvWorkspace,
  validateH2CsvFile,
} from '../model/workspace-loader.ts'
import {
  createH2WebFixtureDataSource,
  H2_WEB_FIXTURE_RUN,
} from './fixture-data-source.ts'

describe('H2 CSV workspace loading', () => {
  it('hydrates from the request-bound run events without listing another snapshot', async () => {
    let listEventsCalls = 0
    const fixture = createH2WebFixtureDataSource()
    const dataSource: H2SentinelDataSource = {
      ...fixture,
      async listEvents() {
        listEventsCalls += 1
        throw new Error('A second event snapshot must not replace run.events.')
      },
    }

    const workspace = await hydrateH2Workspace(
      dataSource,
      [H2_WEB_FIXTURE_RUN.dataset],
      H2_WEB_FIXTURE_RUN.dataset,
    )

    assert.equal(listEventsCalls, 0)
    assert.strictEqual(workspace.events, H2_WEB_FIXTURE_RUN.events)
  })

  it('keeps an existing ready workspace aligned with its Fixture run', async () => {
    const fixture = createH2WebFixtureDataSource()
    const dataSource: H2SentinelDataSource = {
      ...fixture,
      async getMode() {
        return 'LIVE_ANALYSIS'
      },
    }
    assert.equal(await dataSource.getMode(), 'LIVE_ANALYSIS')
    const workspace = await hydrateH2Workspace(
      dataSource,
      [H2_WEB_FIXTURE_RUN.dataset],
      H2_WEB_FIXTURE_RUN.dataset,
    )

    assert.equal(workspace.mode, 'FIXTURE')
    assert.equal(workspace.run.dataset.mode, 'FIXTURE')
    assert.equal(workspace.run.dataset.provenance.mode, 'FIXTURE')
    assert.equal(workspace.run.provenance.mode, 'FIXTURE')
  })

  it('keeps the canonical CSV Fixture-provenanced on a local transport', async () => {
    let imported = false
    let transportModeReads = 0
    const fixture = createH2WebFixtureDataSource()
    const csv = await readFile(
      new URL('../../../../../../packages/h2-contracts/fixtures/tiny-valid-timeseries.csv', import.meta.url),
      'utf8',
    )
    const dataSource: H2SentinelDataSource = {
      ...fixture,
      async getMode() {
        transportModeReads += 1
        return 'LIVE_ANALYSIS'
      },
      async listDatasets() {
        return imported ? [H2_WEB_FIXTURE_RUN.dataset] : []
      },
      async importCsv(request: H2CsvImportRequest) {
        assert.equal(request.filename, 'tiny-valid-timeseries.csv')
        assert.equal(request.text, csv)
        imported = true
        return {
          dataset: H2_WEB_FIXTURE_RUN.dataset,
          quality: H2_WEB_FIXTURE_RUN.quality,
        }
      },
    }

    const result = await importH2CsvWorkspace(dataSource, {
      name: 'tiny-valid-timeseries.csv',
      size: Buffer.byteLength(csv),
      async text() {
        return csv
      },
    })

    assert.equal(result.workspace.mode, 'FIXTURE')
    assert.equal(result.workspace.run.dataset.mode, 'FIXTURE')
    assert.equal(result.workspace.run.dataset.provenance.mode, 'FIXTURE')
    assert.equal(result.workspace.run.provenance.mode, 'FIXTURE')
    assert.equal(transportModeReads, 0)
  })

  it('moves a clean LIVE_ANALYSIS source from empty through import to ready', async () => {
    let imported = false
    const fixture = createH2WebFixtureDataSource()
    const liveProvenance = {
      ...H2_WEB_FIXTURE_RUN.provenance,
      mode: 'LIVE_ANALYSIS',
      source: 'local-import-test',
    } as const
    const liveDataset = {
      ...H2_WEB_FIXTURE_RUN.dataset,
      mode: 'LIVE_ANALYSIS',
      provenance: liveProvenance,
    } as const
    const liveRun = {
      ...H2_WEB_FIXTURE_RUN,
      dataset: liveDataset,
      quality: {
        ...H2_WEB_FIXTURE_RUN.quality,
        provenance: liveProvenance,
      },
      provenance: liveProvenance,
    }
    const dataSource: H2SentinelDataSource = {
      ...fixture,
      async getMode() {
        return 'LIVE_ANALYSIS'
      },
      async listDatasets() {
        return imported ? [liveDataset] : []
      },
      async importCsv(request: H2CsvImportRequest) {
        assert.equal(request.filename, 'first-live-run.csv')
        assert.match(request.text, /^timestamp,pcc_power_kw/m)
        imported = true
        return {
          dataset: liveDataset,
          quality: {
            ...liveRun.quality,
          },
        }
      },
      async runAnalysis(datasetId: string) {
        assert.equal(datasetId, liveDataset.datasetId)
        return liveRun
      },
    }

    assert.deepEqual(await dataSource.listDatasets(), [])
    const result = await importH2CsvWorkspace(dataSource, {
      name: 'first-live-run.csv',
      size: 42,
      async text() {
        return 'timestamp,pcc_power_kw\n2026-01-05T10:20:00Z,590\n'
      },
    })

    assert.equal(result.workspace.mode, 'LIVE_ANALYSIS')
    assert.equal(result.workspace.run.dataset.mode, 'LIVE_ANALYSIS')
    assert.equal(result.workspace.run.dataset.provenance.mode, 'LIVE_ANALYSIS')
    assert.equal(result.workspace.run.provenance.mode, 'LIVE_ANALYSIS')
    assert.equal(result.workspace.run.status, 'completed')
    assert.equal(result.workspace.events.length, 2)
    assert.equal(result.workspace.datasets.length, 1)
    assert.equal(result.qualityStatus, 'passed')
  })

  it('accepts official validation files within the closed Local service boundary', () => {
    assert.equal(H2_CSV_MAX_BYTES, 96 * 1024 * 1024)
    assert.equal(H2_CSV_MAX_ROWS, 180_000)
    assert.doesNotThrow(() => validateH2CsvFile({ name: 'official-validation.csv', size: 58_400_000 }))
    assert.doesNotThrow(() => validateH2CsvFile({ name: 'official-test.csv', size: 77_865_257 }))
    assert.doesNotThrow(() => validateH2CsvFile({ name: 'at-limit.csv', size: H2_CSV_MAX_BYTES }))
    assert.throws(
      () => validateH2CsvFile({ name: 'unbounded.csv', size: H2_CSV_MAX_BYTES + 1 }),
      (error: unknown) => error instanceof H2CsvInputError && error.code === 'too_large',
    )
  })

  it('batches an official-width series request deterministically and merges every value', async () => {
    const fixture = createH2WebFixtureDataSource()
    const fields = Array.from({ length: 68 }, (_, index) => ({
      name: `measurement_${String(index + 1).padStart(2, '0')}_kw`,
      displayNameZh: `测量 ${index + 1}`,
      role: 'measurement',
      required: true,
      unit: 'kW',
    }) satisfies H2DatasetField)
    const dataset = { ...H2_WEB_FIXTURE_RUN.dataset, fields }
    const run = { ...H2_WEB_FIXTURE_RUN, dataset }
    const requestedBatches: string[][] = []
    const dataSource: H2SentinelDataSource = {
      ...fixture,
      async runAnalysis() {
        return run
      },
      async getSeries(request) {
        requestedBatches.push([...request.variables])
        return {
          runId: run.runId,
          variables: request.variables,
          points: [
            {
              timestamp: run.dataset.timeRange.startTime,
              values: Object.fromEntries(
                request.variables.map((variable, index) => [variable, requestedBatches.length * 100 + index]),
              ),
            },
          ],
        }
      },
    }

    const workspace = await hydrateH2Workspace(dataSource, [dataset], dataset)

    assert.deepEqual(requestedBatches.map(({ length }) => length), [32, 32, 4])
    assert.deepEqual(workspace.series?.variables, fields.map(({ name }) => name))
    assert.equal(Object.keys(workspace.series?.points[0]?.values ?? {}).length, 68)
    assert.equal(workspace.seriesError, null)
  })

  it('rejects a mismatched series batch instead of exposing a partial merge', async () => {
    const fixture = createH2WebFixtureDataSource()
    const fields = Array.from({ length: 33 }, (_, index) => ({
      name: `measurement_${index}_kw`,
      displayNameZh: `测量 ${index}`,
      role: 'measurement',
      required: true,
      unit: 'kW',
    }) satisfies H2DatasetField)
    const dataset = { ...H2_WEB_FIXTURE_RUN.dataset, fields }
    const run = { ...H2_WEB_FIXTURE_RUN, dataset }
    let requestCount = 0
    const dataSource: H2SentinelDataSource = {
      ...fixture,
      async runAnalysis() {
        return run
      },
      async getSeries(request) {
        requestCount += 1
        return {
          runId: run.runId,
          variables: request.variables,
          points: [{
            timestamp: requestCount === 1
              ? run.dataset.timeRange.startTime
              : run.dataset.timeRange.endTime,
            values: Object.fromEntries(request.variables.map((variable) => [variable, 1])),
          }],
        }
      },
    }

    const workspace = await hydrateH2Workspace(dataSource, [dataset], dataset)

    assert.equal(requestCount, 2)
    assert.equal(workspace.series, null)
    assert.match(workspace.seriesError ?? '', /时间序列读取失败/)
  })

  it('fails invalid or oversized files before reading content or calling the data source', async () => {
    const fixture = createH2WebFixtureDataSource()
    const cases = [
      { code: 'invalid_type' as const, name: 'payload.xlsx', size: 12 },
      { code: 'too_large' as const, name: 'too-large.csv', size: H2_CSV_MAX_BYTES + 1 },
    ]

    for (const testCase of cases) {
      let textCalls = 0
      let dataSourceCalls = 0
      const dataSource: H2SentinelDataSource = {
        ...fixture,
        async importCsv() {
          dataSourceCalls += 1
          throw new Error('The input guard must run before the data source.')
        },
      }

      await assert.rejects(
        () => importH2CsvWorkspace(dataSource, {
          name: testCase.name,
          size: testCase.size,
          async text() {
            textCalls += 1
            return 'must not be read'
          },
        }),
        (error) => error instanceof H2CsvInputError && error.code === testCase.code,
      )
      assert.equal(textCalls, 0)
      assert.equal(dataSourceCalls, 0)
    }
  })
})
