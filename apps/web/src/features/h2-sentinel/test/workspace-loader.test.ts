import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

import type {
  H2CsvImportRequest,
  H2SentinelDataSource,
} from '@opendashboard/h2-contracts'
import {
  H2_CSV_MAX_BYTES,
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

  it('fails closed for non-CSV and oversized files before reading content', () => {
    assert.throws(
      () => validateH2CsvFile({ name: 'payload.xlsx', size: 12 }),
      (error) => error instanceof H2CsvInputError && error.code === 'invalid_type',
    )
    assert.throws(
      () => validateH2CsvFile({ name: 'too-large.csv', size: H2_CSV_MAX_BYTES + 1 }),
      (error) => error instanceof H2CsvInputError && error.code === 'too_large',
    )
  })
})
