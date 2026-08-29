import type {
  H2AssistantAnswer,
  H2AssistantRequest,
  H2CsvUploadChunkReceipt,
  H2CsvUploadChunkRequest,
  H2CsvUploadFinalizeReceipt,
  H2CsvUploadFinalizeRequest,
  H2CsvUploadSessionCreateRequest,
  H2NluRequest,
  H2NluResult,
  H2ReviewEventRequest,
  H2ReviewMutationReceipt,
  H2StreamingCsvDataSource,
  H2SeriesRequest,
  H2SeriesResponse,
} from '@opendashboard/h2-contracts'

import { H2EmsAdapterError } from './errors.ts'
import {
  isAnalysisRun,
  isAssistantAnswer,
  isCsvUploadChunkReceipt,
  isCsvUploadFinalizeReceipt,
  isCsvUploadSession,
  isCsvImportResult,
  isDatasetArray,
  isDatasetMode,
  isEvent,
  isEventArray,
  isQualityReport,
  isNluResult,
  isReportArtifact,
  isSeriesResponse,
  unwrapRemoteEnvelope,
  verifyReportContentHash,
  verifyReportIdentity,
} from './remote-response-validation.ts'
import {
  isEventReview,
  isReviewMutationReceipt,
} from './remote-review-validation.ts'
import {
  isIsoTimestamp,
  verifyRemoteIdentity,
} from './remote-validation-primitives.ts'
import { sha256 } from './sha256.ts'

export const H2_EMS_REQUEST_TIMEOUTS_MS = {
  standard: 15_000,
  importCsv: 60_000,
  analysis: 180_000,
} as const

export type H2EmsRequestTimeouts = Readonly<
  Record<keyof typeof H2_EMS_REQUEST_TIMEOUTS_MS, number>
>

export interface H2EmsLiveAdapterOptions {
  readonly enabled: true
  readonly baseUrl: string
  /** Tests and bounded runtimes may shorten, but never extend, the closed defaults. */
  readonly requestTimeoutsMs?: Partial<H2EmsRequestTimeouts>
  readonly signal?: AbortSignal
  readonly fetchFn?: typeof fetch
}
export const H2_EMS_LIVE_ROUTES = {
  mode: '/api/v1/h2-sentinel/mode',
  datasets: '/api/v1/h2-sentinel/datasets',
  importCsv: '/api/v1/h2-sentinel/datasets:import',
  createUploadSession: '/api/v1/h2-sentinel/ingest/sessions',
  uploadChunk: '/api/v1/h2-sentinel/ingest/sessions/{sessionId}/chunks/{chunkIndex}',
  finalizeUpload: '/api/v1/h2-sentinel/ingest/sessions/{sessionId}/commit',
  quality: '/api/v1/h2-sentinel/datasets/quality',
  analysis: '/api/v1/h2-sentinel/datasets:analyze',
  overview: '/api/v1/h2-sentinel/runs/overview',
  events: '/api/v1/h2-sentinel/runs/events',
  event: '/api/v1/h2-sentinel/runs/event',
  eventReview: '/api/v1/h2-sentinel/runs/{runId}/events/{eventId}/review',
  reviewEvent: '/api/v1/h2-sentinel/runs/{runId}/events/{eventId}:review',
  series: '/api/v1/h2-sentinel/runs/series',
  assistant: '/api/v1/h2-sentinel/assistant:ask',
  nlu: '/api/v1/h2-sentinel/assistant/nlu',
  report: '/api/v1/h2-sentinel/reports:export',
  submission: '/api/v1/h2-sentinel/submissions:export',
} as const

export interface H2NluDataSourceCapability {
  resolveNlu(request: H2NluRequest): Promise<H2NluResult>
}

export type H2EmsLiveDataSource = H2StreamingCsvDataSource & H2NluDataSourceCapability

/**
 * Creates the sole Live boundary. It is opt-in, literal-loopback-only, and
 * maps every remote failure to a redacted local error.
 */
export function createLiveH2EmsDataSource(
  options: H2EmsLiveAdapterOptions,
): H2EmsLiveDataSource {
  if (options.enabled !== true) {
    throw new H2EmsAdapterError('live_adapter_disabled', false)
  }
  const baseUrl = validateLoopbackUrl(options.baseUrl)
  const requestTimeoutsMs = resolveRequestTimeouts(options.requestTimeoutsMs)
  const fetchFn = options.fetchFn ?? fetch

  const request = <T>(
    route: string,
    payload: unknown,
    guard: (value: unknown) => value is T,
    timeoutMs = requestTimeoutsMs.standard,
  ): Promise<T> => requestEnvelope(baseUrl, route, payload, guard, fetchFn, timeoutMs, options.signal)

  return {
    getMode: () => request(H2_EMS_LIVE_ROUTES.mode, undefined, isDatasetMode),
    listDatasets: () => request(H2_EMS_LIVE_ROUTES.datasets, undefined, isDatasetArray),
    importCsv: async (input) => {
      let expectedFingerprint: `sha256:${string}`
      try {
        expectedFingerprint = await sha256(input.text)
      } catch {
        throw new H2EmsAdapterError('remote_response_invalid', false)
      }
      return verifyRemoteIdentity(
        await request(
          H2_EMS_LIVE_ROUTES.importCsv,
          input,
          isCsvImportResult,
          requestTimeoutsMs.importCsv,
        ),
        ({ dataset }) =>
          dataset.sourceFilename === input.filename &&
          dataset.fingerprint === expectedFingerprint,
      )
    },
    createCsvUploadSession: async (input: H2CsvUploadSessionCreateRequest) => verifyRemoteIdentity(
      await request(H2_EMS_LIVE_ROUTES.createUploadSession, input, isCsvUploadSession),
      (session) =>
        session.filename === input.filename &&
        session.declaredBytes === input.declaredBytes,
    ),
    uploadCsvChunk: async (
      input: H2CsvUploadChunkRequest,
      bytes: Uint8Array,
    ): Promise<H2CsvUploadChunkReceipt> => {
      if (bytes.byteLength !== input.byteLength) {
        throw new H2EmsAdapterError('remote_response_invalid', false)
      }
      const route = uploadChunkRoute(input)
      return verifyRemoteIdentity(
        await requestBytesEnvelope(
          baseUrl,
          route,
          bytes,
          isCsvUploadChunkReceipt,
          fetchFn,
          requestTimeoutsMs.importCsv,
          options.signal,
        ),
        (receipt) =>
          receipt.sessionId === input.sessionId &&
          receipt.acceptedChunkIndex === input.chunkIndex,
      )
    },
    finalizeCsvUpload: async (
      input: H2CsvUploadFinalizeRequest,
    ): Promise<H2CsvUploadFinalizeReceipt> => verifyRemoteIdentity(
      await request(
        finalizeUploadRoute(input.sessionId),
        input,
        isCsvUploadFinalizeReceipt,
        requestTimeoutsMs.analysis,
      ),
      (receipt) =>
        receipt.sessionId === input.sessionId &&
        receipt.totalChunks === input.totalChunks &&
        receipt.totalBytes === input.totalBytes &&
        receipt.contentHash === input.contentHash &&
        receipt.result.dataset.fingerprint === input.contentHash,
    ),
    getDataQuality: async (datasetId) => verifyRemoteIdentity(
      await request(H2_EMS_LIVE_ROUTES.quality, { datasetId }, isQualityReport),
      (quality) => quality.datasetId === datasetId,
    ),
    runAnalysis: async (datasetId) => verifyRemoteIdentity(
      await request(
        H2_EMS_LIVE_ROUTES.analysis,
        { datasetId },
        isAnalysisRun,
        requestTimeoutsMs.analysis,
      ),
      (run) => run.dataset.datasetId === datasetId,
    ),
    getOverview: async (runId) => verifyRemoteIdentity(
      await request(H2_EMS_LIVE_ROUTES.overview, { runId }, isAnalysisRun),
      (run) => run.runId === runId,
    ),
    listEvents: (runId, filter) => request(H2_EMS_LIVE_ROUTES.events, { runId, ...(filter ? { filter } : {}) }, isEventArray),
    getEvent: async (runId, eventId) => verifyRemoteIdentity(
      await request(H2_EMS_LIVE_ROUTES.event, { runId, eventId }, isEvent),
      (event) => event.eventId === eventId,
    ),
    getEventReview: async (runId, eventId) => verifyRemoteIdentity(
      await request(
        reviewRoute(H2_EMS_LIVE_ROUTES.eventReview, runId, eventId),
        undefined,
        isEventReview,
      ),
      (review) => review.runId === runId && review.eventId === eventId,
    ),
    reviewEvent: async (input) => verifyRemoteIdentity(
      await request(
        reviewRoute(H2_EMS_LIVE_ROUTES.reviewEvent, input.runId, input.eventId),
        input,
        isReviewMutationReceipt,
      ),
      (receipt) => reviewReceiptMatchesRequest(receipt, input),
    ),
    getSeries: async (input) => verifyRemoteIdentity(
      await request(
        H2_EMS_LIVE_ROUTES.series,
        input,
        isSeriesResponse,
        requestTimeoutsMs.analysis,
      ),
      (series) => seriesMatchesRequest(series, input),
    ),
    ask: async (input) => {
      const answer = verifyRemoteIdentity(
        await request(H2_EMS_LIVE_ROUTES.assistant, input, isAssistantAnswer),
        (candidate) => assistantAnswerMatchesRequest(candidate, input),
      )
      if (answer.generatedReport) {
        await verifyReportContentHash(answer.generatedReport)
      }
      return answer
    },
    resolveNlu: (input: H2NluRequest) => request(
      H2_EMS_LIVE_ROUTES.nlu,
      input,
      isNluResult,
    ),
    exportReport: async (input) => verifyReportIdentity(
      await verifyReportContentHash(
        await request(H2_EMS_LIVE_ROUTES.report, input, isReportArtifact),
      ),
      input,
    ),
    exportSubmission: async (runId) => verifyReportIdentity(
      await verifyReportContentHash(
        await request(H2_EMS_LIVE_ROUTES.submission, { runId }, isReportArtifact),
      ),
      { runId, kind: 'submission_csv' },
    ),
  }
}

function validateLoopbackUrl(input: string): URL {
  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    throw new H2EmsAdapterError('invalid_loopback_url', false)
  }
  const host = parsed.hostname.toLowerCase()
  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
    (host !== '127.0.0.1' && host !== '[::1]' && host !== '::1') ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.pathname !== '/' ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) {
    throw new H2EmsAdapterError('invalid_loopback_url', false)
  }
  return parsed
}

function resolveRequestTimeouts(
  overrides: Partial<H2EmsRequestTimeouts> | undefined,
): H2EmsRequestTimeouts {
  return {
    standard: validateTimeoutOverride(
      overrides?.standard,
      H2_EMS_REQUEST_TIMEOUTS_MS.standard,
    ),
    importCsv: validateTimeoutOverride(
      overrides?.importCsv,
      H2_EMS_REQUEST_TIMEOUTS_MS.importCsv,
    ),
    analysis: validateTimeoutOverride(
      overrides?.analysis,
      H2_EMS_REQUEST_TIMEOUTS_MS.analysis,
    ),
  }
}

function validateTimeoutOverride(value: number | undefined, maximum: number): number {
  const timeoutMs = value ?? maximum
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > maximum) {
    throw new H2EmsAdapterError('remote_response_invalid', false)
  }
  return timeoutMs
}

async function requestEnvelope<T>(
  baseUrl: URL,
  route: string,
  payload: unknown,
  guard: (value: unknown) => value is T,
  fetchFn: typeof fetch,
  timeoutMs: number,
  upstreamSignal: AbortSignal | undefined,
): Promise<T> {
  const init: RequestInit = payload === undefined
    ? { method: 'GET', redirect: 'error' }
    : {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        redirect: 'error',
      }
  return requestEnvelopeWithInit(
    baseUrl, route, init, guard, fetchFn, timeoutMs, upstreamSignal,
  )
}

async function requestBytesEnvelope<T>(
  baseUrl: URL,
  route: string,
  bytes: Uint8Array,
  guard: (value: unknown) => value is T,
  fetchFn: typeof fetch,
  timeoutMs: number,
  upstreamSignal: AbortSignal | undefined,
): Promise<T> {
  const body = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
  return requestEnvelopeWithInit(
    baseUrl,
    route,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/octet-stream' },
      body,
      redirect: 'error',
    },
    guard,
    fetchFn,
    timeoutMs,
    upstreamSignal,
  )
}

async function requestEnvelopeWithInit<T>(
  baseUrl: URL,
  route: string,
  init: RequestInit,
  guard: (value: unknown) => value is T,
  fetchFn: typeof fetch,
  timeoutMs: number,
  upstreamSignal: AbortSignal | undefined,
): Promise<T> {
  const controller = new AbortController()
  let upstreamAbort: (() => void) | undefined
  if (upstreamSignal) {
    upstreamAbort = () => controller.abort('upstream-abort')
    if (upstreamSignal.aborted) upstreamAbort()
    else upstreamSignal.addEventListener('abort', upstreamAbort, { once: true })
  }
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs)
  try {
    if (controller.signal.aborted) {
      throw new H2EmsAdapterError('request_aborted', false)
    }
    const response = await fetchFn(
      new URL(route, baseUrl),
      { ...init, redirect: 'error', signal: controller.signal },
    )
    if (!hasExpectedResponseOrigin(response, baseUrl)) {
      throw new H2EmsAdapterError('remote_response_invalid', false)
    }
    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new H2EmsAdapterError(
        response.ok ? 'remote_response_invalid' : 'remote_request_failed',
        response.status >= 500,
      )
    }
    if (!response.ok) {
      try {
        unwrapRemoteEnvelope(body, guard)
      } catch (error: unknown) {
        if (error instanceof H2EmsAdapterError && error.code === 'remote_error') {
          throw error
        }
      }
      throw new H2EmsAdapterError('remote_request_failed', response.status >= 500)
    }
    return unwrapRemoteEnvelope(body, guard)
  } catch (error: unknown) {
    if (error instanceof H2EmsAdapterError) throw error
    if (controller.signal.aborted) {
      throw new H2EmsAdapterError(
        controller.signal.reason === 'timeout' ? 'request_timeout' : 'request_aborted',
        controller.signal.reason === 'timeout',
      )
    }
    throw new H2EmsAdapterError('remote_request_failed', true)
  } finally {
    clearTimeout(timer)
    if (upstreamSignal && upstreamAbort) upstreamSignal.removeEventListener('abort', upstreamAbort)
  }
}

function uploadChunkRoute(input: H2CsvUploadChunkRequest): string {
  const route = H2_EMS_LIVE_ROUTES.uploadChunk
    .replace('{sessionId}', encodeURIComponent(input.sessionId))
    .replace('{chunkIndex}', encodeURIComponent(String(input.chunkIndex)))
  const query = new URLSearchParams({
    requestId: input.requestId,
    offsetBytes: String(input.offsetBytes),
    byteLength: String(input.byteLength),
    contentHash: input.contentHash,
  })
  return `${route}?${query.toString()}`
}

function finalizeUploadRoute(sessionId: string): string {
  return H2_EMS_LIVE_ROUTES.finalizeUpload.replace(
    '{sessionId}',
    encodeURIComponent(sessionId),
  )
}

function reviewRoute(template: string, runId: string, eventId: string): string {
  return template
    .replace('{runId}', encodeURIComponent(runId))
    .replace('{eventId}', encodeURIComponent(eventId))
}

function reviewReceiptMatchesRequest(
  receipt: H2ReviewMutationReceipt,
  input: H2ReviewEventRequest,
): boolean {
  return (
    receipt.review.runId === input.runId &&
    receipt.review.eventId === input.eventId &&
    receipt.entry.requestId === input.requestId &&
    receipt.entry.action === input.action &&
    receipt.entry.revision === input.expectedRevision + 1 &&
    receipt.entry.actor.kind === input.actor.kind &&
    receipt.entry.actor.displayName === input.actor.displayName &&
    receipt.entry.note === input.note
  )
}

function assistantAnswerMatchesRequest(
  answer: H2AssistantAnswer,
  input: H2AssistantRequest,
): boolean {
  return (
    answer.runId === input.runId &&
    answer.questionId === input.questionId &&
    answer.eventId === input.eventId &&
    (input.allowLlmRendering || answer.mode === 'DETERMINISTIC_TEMPLATE') &&
    answer.refusedControlClaim
  )
}

function hasExpectedResponseOrigin(response: Response, baseUrl: URL): boolean {
  if (response.redirected) return false
  if (!response.url) return true
  try {
    return new URL(response.url).origin === baseUrl.origin
  } catch {
    return false
  }
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function seriesMatchesRequest(
  series: H2SeriesResponse,
  input: H2SeriesRequest,
): boolean {
  if (
    series.runId !== input.runId ||
    !sameStrings(series.variables, input.variables) ||
    new Set(series.variables).size !== series.variables.length ||
    !isIsoTimestamp(input.startTime) ||
    !isIsoTimestamp(input.endTime)
  ) return false

  const start = Date.parse(input.startTime)
  const end = Date.parse(input.endTime)
  if (start > end) return false

  let previous = start
  for (const point of series.points) {
    const timestamp = Date.parse(point.timestamp)
    const keys = Object.keys(point.values)
    if (
      timestamp < start ||
      timestamp > end ||
      timestamp < previous ||
      keys.length !== series.variables.length ||
      !series.variables.every((variable) => Object.hasOwn(point.values, variable))
    ) return false
    previous = timestamp
  }
  return true
}
