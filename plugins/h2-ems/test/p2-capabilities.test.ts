import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  H2_FIXTURE_DATASET,
  H2_FIXTURE_ANALYSIS_RUN,
  H2_FIXTURE_PROVENANCE,
  H2_FIXTURE_QUALITY_REPORT,
} from '@opendashboard/h2-contracts'
import {
  createFixtureH2EmsDataSource,
  createLiveH2EmsDataSource,
} from '../src/index.ts'

const envelope = (data: unknown): Response => Response.json({
  ok: true,
  status: 'success',
  data,
  warnings: [],
  provenance: H2_FIXTURE_PROVENANCE,
})

describe('H2 EMS P2 Live capabilities', () => {
  it('uses the exact session routes, sends raw chunk bytes, and validates NLU', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const deterministic = await createFixtureH2EmsDataSource().ask({
      runId: H2_FIXTURE_ANALYSIS_RUN.runId,
      questionId: 'Q01',
      allowLlmRendering: false,
    })
    const source = createLiveH2EmsDataSource({
      enabled: true,
      baseUrl: 'http://127.0.0.1:8123/',
      fetchFn: async (input, init) => {
        const url = input.toString()
        calls.push({ url, ...(init ? { init } : {}) })
        if (url.endsWith('/ingest/sessions')) {
          return envelope({
            schemaVersion: 1,
            sessionId: 'upload-1',
            filename: H2_FIXTURE_DATASET.sourceFilename,
            status: 'open',
            declaredBytes: 3,
            receivedBytes: 0,
            nextChunkIndex: 0,
            expiresAt: '2026-08-29T10:00:00Z',
          })
        }
        if (url.includes('/chunks/0?')) {
          return envelope({
            schemaVersion: 1,
            sessionId: 'upload-1',
            acceptedChunkIndex: 0,
            receivedBytes: 3,
            nextChunkIndex: 1,
            replayed: false,
          })
        }
        if (url.endsWith('/ingest/sessions/upload-1/commit')) {
          return envelope({
            schemaVersion: 1,
            sessionId: 'upload-1',
            status: 'finalized',
            totalChunks: 1,
            totalBytes: 3,
            contentHash: H2_FIXTURE_DATASET.fingerprint,
            replayed: false,
            result: {
              dataset: H2_FIXTURE_DATASET,
              quality: H2_FIXTURE_QUALITY_REPORT,
            },
          })
        }
        if (url.endsWith('/assistant/nlu')) {
          return envelope({
            schemaVersion: 1,
            status: 'matched',
            questionId: 'Q01',
            confidence: 1,
          })
        }
        return envelope({
          ...deterministic,
          mode: 'LLM_RENDERED',
          provenance: {
            ...deterministic.provenance,
            mode: 'LLM_RENDERED',
            source: 'StepFun',
            rendererVersion: 'stepfun-restatement-v1',
          },
        })
      },
    })

    await source.createCsvUploadSession({
      schemaVersion: 1,
      requestId: 'create-1',
      filename: H2_FIXTURE_DATASET.sourceFilename,
      declaredBytes: 3,
      expectedContentHash: H2_FIXTURE_DATASET.fingerprint,
    })
    await source.uploadCsvChunk({
      schemaVersion: 1,
      requestId: 'chunk-1',
      sessionId: 'upload-1',
      chunkIndex: 0,
      offsetBytes: 0,
      byteLength: 3,
      contentHash: H2_FIXTURE_DATASET.fingerprint,
    }, new Uint8Array([1, 2, 3]))
    await source.finalizeCsvUpload({
      schemaVersion: 1,
      requestId: 'finalize-1',
      sessionId: 'upload-1',
      totalChunks: 1,
      totalBytes: 3,
      contentHash: H2_FIXTURE_DATASET.fingerprint,
    })
    assert.equal((await source.resolveNlu({
      schemaVersion: 1,
      runId: H2_FIXTURE_ANALYSIS_RUN.runId,
      text: 'PCC 正负号是什么意思',
    })).status, 'matched')
    assert.equal((await source.ask({
      runId: H2_FIXTURE_ANALYSIS_RUN.runId,
      questionId: 'Q01',
      allowLlmRendering: true,
    })).mode, 'LLM_RENDERED')

    const chunk = calls[1]
    assert(chunk)
    assert.equal(chunk.init?.method, 'PUT')
    assert.equal(chunk.init?.redirect, 'error')
    assert.equal(chunk.init?.headers && new Headers(chunk.init.headers).get('content-type'), 'application/octet-stream')
    assert.deepEqual(Array.from(new Uint8Array(chunk.init?.body as ArrayBuffer)), [1, 2, 3])
    assert.match(chunk.url, /requestId=chunk-1/)
    assert.match(chunk.url, /offsetBytes=0/)
    assert.match(chunk.url, /byteLength=3/)
    assert.match(chunk.url, /contentHash=sha256%3A[a-f0-9]{64}/)
  })
})
