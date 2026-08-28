import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { describe, it } from 'node:test'

import {
  H2_FIXTURE_PROVENANCE,
  H2_FIXTURE_ANALYSIS_RUN,
  H2_FIXTURE_DATASET,
  H2_FIXTURE_QUALITY_REPORT,
} from '@opendashboard/h2-contracts'
import {
  createH2EmsPlugin,
  createLiveH2EmsDataSource,
  H2_EMS_DATA_SOURCE,
  H2_EMS_LIVE_ROUTES,
  H2_EMS_REQUEST_TIMEOUTS_MS,
  H2EmsAdapterError,
} from '../src/index.ts'
import { createPluginRuntime } from '@opendashboard/plugin-runtime'

const envelope = (data: unknown): Response =>
  Response.json({
    ok: true,
    status: 'success',
    data,
    warnings: [],
    provenance: H2_FIXTURE_PROVENANCE,
  })

const listen = (server: Server): Promise<number> =>
  new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Dynamic loopback listener did not expose a TCP port.'))
        return
      }
      resolve(address.port)
    })
  })

const close = (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    if (!server.listening) {
      resolve()
      return
    }
    server.close((error) => error ? reject(error) : resolve())
  })

describe('H2 EMS loopback adapter', () => {
  it('rejects non-loopback and path-bearing base URLs before fetch', () => {
    for (const baseUrl of ['https://example.com/', 'http://localhost:8000/', 'http://127.0.0.1:8000/api']) {
      assert.throws(
        () => createLiveH2EmsDataSource({ enabled: true, baseUrl }),
        (error: unknown) => error instanceof H2EmsAdapterError && error.code === 'invalid_loopback_url',
      )
    }
  })

  it('uses the mandated namespace and preserves live response provenance', async () => {
    const source = createLiveH2EmsDataSource({
      enabled: true,
      baseUrl: 'http://127.0.0.1:8123/',
      fetchFn: async (input, init) => {
        assert.equal(new URL(input.toString()).pathname, H2_EMS_LIVE_ROUTES.overview)
        assert.equal(init?.redirect, 'error')
        return envelope(H2_FIXTURE_ANALYSIS_RUN)
      },
    })
    const result = await source.getOverview(H2_FIXTURE_ANALYSIS_RUN.runId)
    assert.equal(result.provenance.mode, 'FIXTURE')
  })

  it('never forwards a CSV body across a loopback redirect', async () => {
    const fixtureText = await readFile(
      new URL('../../../packages/h2-contracts/fixtures/tiny-valid-timeseries.csv', import.meta.url),
      'utf8',
    )
    let targetRequests = 0
    let targetBodyBytes = 0
    const target = createServer((request, response) => {
      targetRequests += 1
      request.on('data', (chunk: Buffer) => { targetBodyBytes += chunk.byteLength })
      request.on('end', () => {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({
          ok: true,
          status: 'success',
          data: {
            dataset: H2_FIXTURE_DATASET,
            quality: H2_FIXTURE_QUALITY_REPORT,
          },
          warnings: [],
          provenance: H2_FIXTURE_PROVENANCE,
        }))
      })
    })
    const targetPort = await listen(target)
    const redirector = createServer((request, response) => {
      request.resume()
      response.writeHead(307, {
        location: `http://127.0.0.1:${targetPort}${request.url ?? '/'}`,
      })
      response.end()
    })
    const redirectorPort = await listen(redirector)

    let rejection: unknown
    try {
      const source = createLiveH2EmsDataSource({
        enabled: true,
        baseUrl: `http://127.0.0.1:${redirectorPort}/`,
      })
      await source.importCsv({
        filename: H2_FIXTURE_DATASET.sourceFilename,
        text: fixtureText,
      })
    } catch (error: unknown) {
      rejection = error
    } finally {
      await close(redirector)
      await close(target)
    }

    assert.deepEqual(
      {
        targetRequests,
        targetBodyBytes,
        rejected: rejection instanceof H2EmsAdapterError,
      },
      { targetRequests: 0, targetBodyBytes: 0, rejected: true },
    )
    assert.ok(rejection instanceof H2EmsAdapterError)
    assert.equal(rejection.message.includes(String(targetPort)), false)
    assert.equal(rejection.message.includes('timestamp'), false)
  })

  it('rejects redirected and cross-origin final response metadata', async () => {
    const responseWith = (redirected: boolean, url: string): Response =>
      ({
        ok: true,
        status: 200,
        redirected,
        url,
        json: async () => ({
          ok: true,
          status: 'success',
          data: 'LIVE_ANALYSIS',
          warnings: [],
          provenance: H2_FIXTURE_PROVENANCE,
        }),
      }) as Response

    for (const response of [
      responseWith(true, 'http://127.0.0.1:8123/api/v1/h2-sentinel/mode'),
      responseWith(false, 'http://127.0.0.1:9123/api/v1/h2-sentinel/mode'),
    ]) {
      const source = createLiveH2EmsDataSource({
        enabled: true,
        baseUrl: 'http://127.0.0.1:8123/',
        fetchFn: async () => response,
      })
      await assert.rejects(
        () => source.getMode(),
        (error: unknown) =>
          error instanceof H2EmsAdapterError &&
          error.code === 'remote_response_invalid' &&
          !error.message.includes('9123'),
      )
    }
  })

  it('registers explicit local mode through the static plugin factory', async () => {
    const runtime = createPluginRuntime([
      createH2EmsPlugin({
        enabled: true,
        baseUrl: 'http://127.0.0.1:8123/',
        fetchFn: async () => envelope('LIVE_ANALYSIS'),
      }),
    ])
    await runtime.start()
    assert.equal(await runtime.resolve(H2_EMS_DATA_SOURCE).getMode(), 'LIVE_ANALYSIS')
    await runtime.stop()
  })

  it('maps timeout and cancellation to stable errors', async () => {
    const timedOut = createLiveH2EmsDataSource({
      enabled: true,
      baseUrl: 'http://127.0.0.1:8123/',
      requestTimeoutsMs: { standard: 1 },
      fetchFn: (_input, init) => new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('raw transport failure')))),
    })
    await assert.rejects(
      () => timedOut.getMode(),
      (error: unknown) => error instanceof H2EmsAdapterError && error.code === 'request_timeout',
    )

    const controller = new AbortController()
    controller.abort()
    const cancelled = createLiveH2EmsDataSource({
      enabled: true,
      baseUrl: 'http://127.0.0.1:8123/',
      signal: controller.signal,
      fetchFn: async () => envelope('LIVE_ANALYSIS'),
    })
    await assert.rejects(
      () => cancelled.getMode(),
      (error: unknown) => error instanceof H2EmsAdapterError && error.code === 'request_aborted',
    )
  })

  it('uses closed operation-specific defaults for Local import and analysis', async () => {
    assert.deepEqual(H2_EMS_REQUEST_TIMEOUTS_MS, {
      standard: 15_000,
      importCsv: 60_000,
      analysis: 180_000,
    })
    const waitForAbort: typeof fetch = (_input, init) => new Promise((_, reject) => {
      init?.signal?.addEventListener(
        'abort',
        () => reject(new Error('raw transport failure')),
        { once: true },
      )
    })
    const importTimedOut = createLiveH2EmsDataSource({
      enabled: true,
      baseUrl: 'http://127.0.0.1:8123/',
      requestTimeoutsMs: { importCsv: 1 },
      fetchFn: waitForAbort,
    })
    await assert.rejects(
      () => importTimedOut.importCsv({ filename: 'bounded.csv', text: 'timestamp\n' }),
      (error: unknown) => error instanceof H2EmsAdapterError && error.code === 'request_timeout',
    )

    const analysisTimedOut = createLiveH2EmsDataSource({
      enabled: true,
      baseUrl: 'http://127.0.0.1:8123/',
      requestTimeoutsMs: { analysis: 1 },
      fetchFn: waitForAbort,
    })
    await assert.rejects(
      () => analysisTimedOut.runAnalysis('dataset-bounded'),
      (error: unknown) => error instanceof H2EmsAdapterError && error.code === 'request_timeout',
    )
  })

  it('routes series hydration through the closed analysis timeout', async () => {
    assert.throws(
      () => createLiveH2EmsDataSource({
        enabled: true,
        baseUrl: 'http://127.0.0.1:8123/',
        requestTimeoutsMs: { analysis: H2_EMS_REQUEST_TIMEOUTS_MS.analysis + 1 },
      }),
      (error: unknown) =>
        error instanceof H2EmsAdapterError && error.code === 'remote_response_invalid',
    )

    const request = {
      runId: H2_FIXTURE_ANALYSIS_RUN.runId,
      variables: ['pcc_power_kw'],
      startTime: '2026-01-05T10:20:00Z',
      endTime: '2026-01-05T10:21:00Z',
    }
    const response = {
      runId: request.runId,
      variables: request.variables,
      points: [{
        timestamp: request.startTime,
        values: { pcc_power_kw: 420 },
      }],
    }
    const resolveAfterStandardTimeout: typeof fetch = (_input, init) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve(envelope(response)), 20)
        init?.signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(timer)
            reject(new Error('raw transport failure'))
          },
          { once: true },
        )
      })
    const source = createLiveH2EmsDataSource({
      enabled: true,
      baseUrl: 'http://127.0.0.1:8123/',
      requestTimeoutsMs: { standard: 1, analysis: 1_000 },
      fetchFn: resolveAfterStandardTimeout,
    })

    assert.deepEqual(await source.getSeries(request), response)
  })
})
