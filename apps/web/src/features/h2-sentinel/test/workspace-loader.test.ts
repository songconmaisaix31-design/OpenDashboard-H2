import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

import type {
  H2AnalysisRun,
  H2AnomalyEvent,
  H2CsvImportRequest,
  H2DatasetField,
  H2DatasetManifest,
  H2SentinelDataSource,
  H2SeriesPoint,
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

  it('requests only fields consumed by overview, diagnosis, and analysis charts', async () => {
    const fixture = createH2WebFixtureDataSource()
    const fields = createOfficialWidthFields()
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

    assert.equal(fields.length, 68)
    assert.deepEqual(requestedBatches, [H2_CHART_VARIABLES])
    assert.deepEqual(workspace.series?.variables, H2_CHART_VARIABLES)
    assert.equal(Object.keys(workspace.series?.points[0]?.values ?? {}).length, H2_CHART_VARIABLES.length)
    assert.equal(workspace.seriesError, null)
  })

  it('does not copy a representative 129600-row response when one bounded request is sufficient', async () => {
    const fixture = createH2WebFixtureDataSource()
    const rowCount = 129_600
    const startTime = Date.parse('2026-01-01T00:00:00.000Z')
    const fields = createOfficialWidthFields()
    const dataset = {
      ...H2_WEB_FIXTURE_RUN.dataset,
      fields,
      rowCount,
      timeRange: {
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(startTime + (rowCount - 1) * 60_000).toISOString(),
      },
    }
    const run = { ...H2_WEB_FIXTURE_RUN, dataset }
    const values = Object.fromEntries(H2_CHART_VARIABLES.map((variable, index) => [variable, index]))
    const points: H2SeriesPoint[] = Array.from({ length: rowCount }, (_, index) => ({
      timestamp: new Date(startTime + index * 60_000).toISOString(),
      values,
    }))
    let requestedVariables: readonly string[] = []
    const dataSource: H2SentinelDataSource = {
      ...fixture,
      async runAnalysis() {
        return run
      },
      async getSeries(request) {
        requestedVariables = request.variables
        return { runId: run.runId, variables: request.variables, points }
      },
    }

    const workspace = await hydrateH2Workspace(dataSource, [dataset], dataset)

    assert.deepEqual(requestedVariables, H2_CHART_VARIABLES)
    assert.strictEqual(workspace.series?.points, points)
    assert.equal(workspace.series?.points.length, rowCount)
    assert.equal(workspace.seriesError, null)
  })

  it('merges batches before requesting the next response', async () => {
    const fixture = createH2WebFixtureDataSource()
    const { dataset, expectedVariables, run } = createMultiBatchRun()
    const requestedBatches: string[][] = []
    const sharedResponse = {
      runId: run.runId,
      variables: [] as readonly string[],
      points: [] as readonly H2SeriesPoint[],
    }
    const dataSource: H2SentinelDataSource = {
      ...fixture,
      async runAnalysis() {
        return run
      },
      async getSeries(request) {
        requestedBatches.push([...request.variables])
        sharedResponse.variables = request.variables
        sharedResponse.points = [{
          timestamp: run.dataset.timeRange.startTime,
          values: Object.fromEntries(
            request.variables.map((variable, index) => [variable, requestedBatches.length * 100 + index]),
          ),
        }]
        return sharedResponse
      },
    }

    const workspace = await hydrateH2Workspace(dataSource, [dataset], dataset)

    assert.deepEqual(requestedBatches.map(({ length }) => length), [32, 3])
    assert.deepEqual(workspace.series?.variables, expectedVariables)
    assert.equal(workspace.series?.points[0]?.values[expectedVariables[0] ?? ''], 100)
    assert.equal(workspace.series?.points[0]?.values[expectedVariables.at(-1) ?? ''], 202)
    assert.equal(workspace.seriesError, null)
  })

  it('rejects a mismatched series batch instead of exposing a partial merge', async () => {
    const fixture = createH2WebFixtureDataSource()
    const { dataset, run } = createMultiBatchRun()
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

const H2_CHART_VARIABLES = [
  'pcc_power_actual_kw',
  'grid_export_power_limit_kw',
  'grid_import_power_limit_kw',
  'soc_target_pct',
  'bess_soc_pct',
  'bess_power_cmd_kw',
  'bess_power_actual_kw',
] as const

function createOfficialWidthFields(): readonly H2DatasetField[] {
  const compatibilityAliases = [
    'pcc_power_kw',
    'pcc_export_limit_kw',
    'pcc_import_limit_kw',
    'bess_soc_percent',
    'bess_dispatch_command_kw',
    'bess_power_kw',
  ] as const
  const knownFields = [...H2_CHART_VARIABLES, ...compatibilityAliases]
  const irrelevantFields = Array.from(
    { length: 68 - knownFields.length },
    (_, index) => `unused_official_field_${String(index + 1).padStart(2, '0')}_kw`,
  )
  return [...knownFields, ...irrelevantFields].map(createSeriesField)
}

function createMultiBatchRun(): {
  readonly dataset: H2DatasetManifest
  readonly expectedVariables: readonly string[]
  readonly run: H2AnalysisRun
} {
  const overviewVariables = H2_CHART_VARIABLES.slice(0, 5)
  const evidenceVariables = Array.from(
    { length: 30 },
    (_, index) => `event_evidence_${String(index + 1).padStart(2, '0')}_kw`,
  )
  const fields = [...overviewVariables, ...evidenceVariables].map(createSeriesField)
  const eventSeed = H2_WEB_FIXTURE_RUN.events.find(
    (event): event is Extract<H2AnomalyEvent, { readonly code: 'C04' }> => event.code === 'C04',
  )
  const evidenceSeed = eventSeed?.evidence[0]
  if (!evidenceSeed) throw new Error('The fixture must provide a reusable evidence shape.')
  const events: H2AnomalyEvent[] = Array.from({ length: 6 }, (_, eventIndex) => ({
    ...eventSeed,
    eventId: `C05-capacity-${eventIndex + 1}`,
    code: 'C05',
    subtype: 'EXPORT_ENERGY_QUOTA_RISK',
    evidence: evidenceVariables
      .slice(eventIndex * 5, (eventIndex + 1) * 5)
      .map((variable, evidenceIndex) => ({
        ...evidenceSeed,
        evidenceId: `C05-capacity-${eventIndex + 1}-EV-${evidenceIndex + 1}`,
        variable,
      })),
    impact: {
      ...eventSeed.impact,
      metric: 'grid_energy_quota_deviation_kwh',
    },
  }))
  const dataset: H2DatasetManifest = { ...H2_WEB_FIXTURE_RUN.dataset, fields }
  const run: H2AnalysisRun = {
    ...H2_WEB_FIXTURE_RUN,
    dataset,
    events,
    eventCountsByCode: {
      ...H2_WEB_FIXTURE_RUN.eventCountsByCode,
      C03: 0,
      C04: 0,
      C05: events.length,
    },
  }

  return { dataset, expectedVariables: [...overviewVariables, ...evidenceVariables], run }
}

function createSeriesField(name: string): H2DatasetField {
  return {
    name,
    displayNameZh: name,
    role: name.includes('limit') || name === 'soc_target_pct' ? 'constraint' : 'measurement',
    required: true,
    unit: name.includes('soc') ? 'percent' : 'kW',
  }
}
