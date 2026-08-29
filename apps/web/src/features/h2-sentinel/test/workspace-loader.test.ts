import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { describe, it } from 'node:test'

import type {
  H2AnalysisRun,
  H2CsvImportRequest,
  H2SentinelDataSource,
  H2StreamingCsvDataSource,
} from '@opendashboard/h2-contracts'
import {
  H2_CSV_MAX_BYTES,
  H2_CSV_MAX_ROWS,
  H2CsvInputError,
  hydrateH2Workspace,
  importH2CsvWorkspace,
  importH2StreamingCsvWorkspace,
  h2CsvImportFailureMessage,
  validateH2CsvFile,
} from '../model/workspace-loader.ts'
import { h2Sha256Hex } from '../model/sha256.ts'
import {
  createH2WebFixtureDataSource,
  H2_WEB_FIXTURE_EVENTS,
  H2_WEB_FIXTURE_RUN,
} from './fixture-data-source.ts'

const LIVE_PROVENANCE = {
  ...H2_WEB_FIXTURE_RUN.provenance,
  mode: 'LIVE_ANALYSIS',
  source: 'local-import-test',
} as const
const LIVE_EVENTS = H2_WEB_FIXTURE_EVENTS.map((event) => ({
  ...event,
  provenance: LIVE_PROVENANCE,
}))
const LIVE_DATASET = {
  ...H2_WEB_FIXTURE_RUN.dataset,
  datasetId: 'live-dataset',
  mode: 'LIVE_ANALYSIS',
  provenance: LIVE_PROVENANCE,
} as const
const LIVE_RUN = {
  ...H2_WEB_FIXTURE_RUN,
  dataset: LIVE_DATASET,
  quality: {
    ...H2_WEB_FIXTURE_RUN.quality,
    datasetId: LIVE_DATASET.datasetId,
    checks: H2_WEB_FIXTURE_RUN.quality.checks.map((check) => ({
      ...check,
      provenance: LIVE_PROVENANCE,
    })),
    provenance: LIVE_PROVENANCE,
  },
  events: LIVE_EVENTS,
  provenance: LIVE_PROVENANCE,
} as const satisfies H2AnalysisRun
const CONTRADICTORY_FINGERPRINT =
  'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'

describe('H2 CSV workspace loading', () => {
  it('hashes bytes incrementally with the standard SHA-256 result', () => {
    const bytes = new TextEncoder().encode('abc')
    assert.equal(
      h2Sha256Hex(bytes),
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('uploads fixed ordered chunks, reports bounded progress, and finalizes the full hash', async () => {
    const bytes = new Uint8Array(8 * 1024 * 1024 + 17)
    bytes.fill(0x61)
    const chunkIndexes: number[] = []
    const progress: { readonly completedChunks: number; readonly uploadedBytes: number }[] = []
    const fixture = createH2WebFixtureDataSource()
    const dataSource: H2StreamingCsvDataSource = {
      ...fixture,
      async createCsvUploadSession(request) {
        assert.equal(request.declaredBytes, bytes.byteLength)
        return {
          schemaVersion: 1,
          sessionId: 'session-1',
          filename: request.filename,
          status: 'open',
          declaredBytes: request.declaredBytes,
          receivedBytes: 0,
          nextChunkIndex: 0,
          expiresAt: '2026-08-29T12:00:00Z',
        }
      },
      async uploadCsvChunk(request, chunk) {
        chunkIndexes.push(request.chunkIndex)
        assert.equal(request.offsetBytes, request.chunkIndex * 8 * 1024 * 1024)
        assert.equal(request.byteLength, chunk.byteLength)
        assert.equal(request.contentHash, `sha256:${createHash('sha256').update(chunk).digest('hex')}`)
        const receivedBytes = request.offsetBytes + request.byteLength
        return {
          schemaVersion: 1,
          sessionId: request.sessionId,
          acceptedChunkIndex: request.chunkIndex,
          receivedBytes,
          nextChunkIndex: request.chunkIndex + 1,
          replayed: false,
        }
      },
      async finalizeCsvUpload(request) {
        assert.equal(request.totalChunks, 2)
        assert.equal(request.totalBytes, bytes.byteLength)
        assert.equal(request.contentHash, `sha256:${createHash('sha256').update(bytes).digest('hex')}`)
        return {
          schemaVersion: 1,
          sessionId: request.sessionId,
          status: 'finalized',
          totalChunks: request.totalChunks,
          totalBytes: request.totalBytes,
          contentHash: request.contentHash,
          replayed: false,
          result: { dataset: H2_WEB_FIXTURE_RUN.dataset, quality: H2_WEB_FIXTURE_RUN.quality },
        }
      },
    }

    const result = await importH2StreamingCsvWorkspace(dataSource, memoryFile('train.csv', bytes), {
      onProgress(value) {
        progress.push(value)
      },
    })

    assert.deepEqual(chunkIndexes, [0, 1])
    assert.equal(progress.at(-1)?.uploadedBytes, bytes.byteLength)
    assert.equal(progress.at(-1)?.completedChunks, 2)
    assert.equal(result.workspace.run.dataset.datasetId, H2_WEB_FIXTURE_RUN.dataset.datasetId)
  })

  it('retries only an explicitly retryable chunk with its immutable request and bytes', async () => {
    const bytes = new TextEncoder().encode('timestamp,pcc_power_actual_kw\n2026-01-01T00:00:00Z,1\n')
    const fixture = createH2WebFixtureDataSource()
    const requests: object[] = []
    const chunks: Uint8Array[] = []
    const dataSource: H2StreamingCsvDataSource = {
      ...fixture,
      async createCsvUploadSession(request) {
        return { schemaVersion: 1, sessionId: 'session-retry', filename: request.filename, status: 'open', declaredBytes: request.declaredBytes, receivedBytes: 0, nextChunkIndex: 0, expiresAt: '2026-08-29T12:00:00Z' }
      },
      async uploadCsvChunk(request, chunk) {
        requests.push(request)
        chunks.push(chunk)
        if (requests.length === 1) throw { retryable: true }
        return { schemaVersion: 1, sessionId: request.sessionId, acceptedChunkIndex: 0, receivedBytes: bytes.byteLength, nextChunkIndex: 1, replayed: true }
      },
      async finalizeCsvUpload(request) {
        return { schemaVersion: 1, sessionId: request.sessionId, status: 'finalized', totalChunks: 1, totalBytes: bytes.byteLength, contentHash: request.contentHash, replayed: false, result: { dataset: H2_WEB_FIXTURE_RUN.dataset, quality: H2_WEB_FIXTURE_RUN.quality } }
      },
    }

    await importH2StreamingCsvWorkspace(dataSource, memoryFile('retry.csv', bytes))
    assert.strictEqual(requests[0], requests[1])
    assert.strictEqual(chunks[0], chunks[1])
  })

  it('exposes distinct Chinese streaming failure states and cancels between chunks', async () => {
    const expectations = {
      streaming_unavailable: /未启用分片导入/,
      cancelled: /已取消分片导入/,
      retryable_upload: /幂等重试后仍失败/,
      terminal_upload: /终止性错误/,
      finalization_failed: /SHA-256 最终校验未通过/,
    } as const
    for (const [code, pattern] of Object.entries(expectations)) {
      assert.match(h2CsvImportFailureMessage(new H2CsvInputError(code as keyof typeof expectations)), pattern)
    }

    const bytes = new Uint8Array(8 * 1024 * 1024 + 1)
    const abortController = new AbortController()
    const fixture = createH2WebFixtureDataSource()
    const dataSource: H2StreamingCsvDataSource = {
      ...fixture,
      async createCsvUploadSession(request) {
        return { schemaVersion: 1, sessionId: 'session-cancel', filename: request.filename, status: 'open', declaredBytes: request.declaredBytes, receivedBytes: 0, nextChunkIndex: 0, expiresAt: '2026-08-29T12:00:00Z' }
      },
      async uploadCsvChunk(request) {
        return { schemaVersion: 1, sessionId: request.sessionId, acceptedChunkIndex: 0, receivedBytes: 8 * 1024 * 1024, nextChunkIndex: 1, replayed: false }
      },
      async finalizeCsvUpload() {
        throw new Error('Cancellation must stop before finalization.')
      },
    }
    await assert.rejects(
      () => importH2StreamingCsvWorkspace(dataSource, memoryFile('cancel.csv', bytes), {
        signal: abortController.signal,
        onProgress(progress) {
          if (progress.completedChunks === 1) abortController.abort()
        },
      }),
      (error: unknown) => error instanceof H2CsvInputError && error.code === 'cancelled',
    )
  })
  it('hydrates only the request-bound run and leaves series to the active page', async () => {
    let listEventsCalls = 0
    let seriesCalls = 0
    const fixture = createH2WebFixtureDataSource()
    const dataSource: H2SentinelDataSource = {
      ...fixture,
      async listEvents() {
        listEventsCalls += 1
        throw new Error('A second event snapshot must not replace run.events.')
      },
      async getSeries() {
        seriesCalls += 1
        throw new Error('Workspace hydration must not preload page series.')
      },
    }

    const workspace = await hydrateH2Workspace(
      dataSource,
      [H2_WEB_FIXTURE_RUN.dataset],
      H2_WEB_FIXTURE_RUN.dataset,
    )

    assert.equal(listEventsCalls, 0)
    assert.equal(seriesCalls, 0)
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

  it('rejects a Fixture workspace backed by a Live run and Live events', async () => {
    const contradictoryRun = {
      ...H2_WEB_FIXTURE_RUN,
      events: LIVE_EVENTS,
      provenance: LIVE_PROVENANCE,
    } as const satisfies H2AnalysisRun

    await assert.rejects(
      () => hydrateH2Workspace(
        createDataSourceForRun(contradictoryRun),
        [contradictoryRun.dataset],
        contradictoryRun.dataset,
      ),
      /H2 workspace provenance is internally inconsistent\./,
    )
  })

  it('rejects a Live workspace and run containing a Fixture event', async () => {
    const contradictoryRun = {
      ...LIVE_RUN,
      events: [H2_WEB_FIXTURE_EVENTS[0], ...LIVE_EVENTS.slice(1)],
    } as const satisfies H2AnalysisRun

    await assert.rejects(
      () => hydrateH2Workspace(
        createDataSourceForRun(contradictoryRun),
        [contradictoryRun.dataset],
        contradictoryRun.dataset,
      ),
      /H2 workspace provenance is internally inconsistent\./,
    )
  })

  it('rejects event dataset fingerprint drift from the canonical run provenance', async () => {
    const firstLiveEvent = LIVE_EVENTS[0]
    assert.ok(firstLiveEvent)
    const eventWithFingerprintDrift = {
      ...firstLiveEvent,
      provenance: {
        ...LIVE_PROVENANCE,
        datasetFingerprint: CONTRADICTORY_FINGERPRINT,
      },
    }
    assert.notEqual(
      eventWithFingerprintDrift.provenance.datasetFingerprint,
      LIVE_RUN.provenance.datasetFingerprint,
    )
    const contradictoryRun = {
      ...LIVE_RUN,
      events: [eventWithFingerprintDrift, ...LIVE_EVENTS.slice(1)],
    } as const satisfies H2AnalysisRun

    await assert.rejects(
      () => hydrateH2Workspace(
        createDataSourceForRun(contradictoryRun),
        [contradictoryRun.dataset],
        contradictoryRun.dataset,
      ),
      /H2 workspace provenance is internally inconsistent\./,
    )
  })

  it('rejects an injected run and events consistently bound to a different dataset fingerprint', async () => {
    const contradictoryProvenance = {
      ...LIVE_PROVENANCE,
      datasetFingerprint: CONTRADICTORY_FINGERPRINT,
    }
    const contradictoryRun = {
      ...LIVE_RUN,
      dataset: {
        ...LIVE_DATASET,
        fingerprint: CONTRADICTORY_FINGERPRINT,
        provenance: contradictoryProvenance,
      },
      events: LIVE_EVENTS.map((event) => ({
        ...event,
        provenance: contradictoryProvenance,
      })),
      provenance: contradictoryProvenance,
    } as const satisfies H2AnalysisRun
    assert.notEqual(
      contradictoryRun.dataset.fingerprint,
      LIVE_DATASET.fingerprint,
    )

    await assert.rejects(
      () => hydrateH2Workspace(
        createDataSourceForRun(contradictoryRun),
        [LIVE_DATASET],
        LIVE_DATASET,
      ),
      /H2 workspace provenance is internally inconsistent\./,
    )
  })

  it('rejects an injected run fingerprint that contradicts its real dataset provenance', async () => {
    const contradictoryRun = {
      ...LIVE_RUN,
      dataset: {
        ...LIVE_DATASET,
        fingerprint: CONTRADICTORY_FINGERPRINT,
      },
    } as const satisfies H2AnalysisRun
    assert.equal(
      contradictoryRun.dataset.provenance.datasetFingerprint,
      LIVE_DATASET.fingerprint,
    )

    await assert.rejects(
      () => hydrateH2Workspace(
        createDataSourceForRun(contradictoryRun),
        [LIVE_DATASET],
        LIVE_DATASET,
      ),
      /H2 workspace provenance is internally inconsistent\./,
    )
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
    const dataSource: H2SentinelDataSource = {
      ...fixture,
      async getMode() {
        return 'LIVE_ANALYSIS'
      },
      async listDatasets() {
        return imported ? [LIVE_DATASET] : []
      },
      async importCsv(request: H2CsvImportRequest) {
        assert.equal(request.filename, 'first-live-run.csv')
        assert.match(request.text, /^timestamp,pcc_power_kw/m)
        imported = true
        return { dataset: LIVE_DATASET, quality: LIVE_RUN.quality }
      },
      async runAnalysis(datasetId: string) {
        assert.equal(datasetId, LIVE_DATASET.datasetId)
        return LIVE_RUN
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

function memoryFile(name: string, bytes: Uint8Array) {
  return {
    name,
    size: bytes.byteLength,
    async text() {
      throw new Error('Streaming import must never read the complete file as text.')
    },
    slice(start = 0, end = bytes.byteLength) {
      return {
        async arrayBuffer() {
          return bytes.slice(start, end).buffer
        },
      }
    },
  }
}

function createDataSourceForRun(run: H2AnalysisRun): H2SentinelDataSource {
  return {
    ...createH2WebFixtureDataSource(),
    async runAnalysis(datasetId: string) {
      assert.equal(datasetId, run.dataset.datasetId)
      return run
    },
  }
}
