import type {
  H2AssistantAnswer,
  H2AssistantRequest,
  H2ReviewEventRequest,
  H2ReviewMutationReceipt,
  H2SentinelDataSource,
  H2SeriesRequest,
  H2SeriesResponse,
} from '@opendashboard/h2-contracts'

import { H2EmsAdapterError } from './errors.ts'
import {
  isAnalysisRun,
  isAssistantAnswer,
  isCsvImportResult,
  isDatasetArray,
  isDatasetMode,
  isEvent,
  isEventArray,
  isQualityReport,
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

export interface H2EmsLiveAdapterOptions {
  readonly enabled: true
  readonly baseUrl: string
  readonly timeoutMs?: number
  readonly signal?: AbortSignal
  readonly fetchFn?: typeof fetch
}
export const H2_EMS_LIVE_ROUTES = {
  mode: '/api/v1/h2-sentinel/mode',
  datasets: '/api/v1/h2-sentinel/datasets',
  importCsv: '/api/v1/h2-sentinel/datasets:import',
  quality: '/api/v1/h2-sentinel/datasets/quality',
  analysis: '/api/v1/h2-sentinel/datasets:analyze',
  overview: '/api/v1/h2-sentinel/runs/overview',
  events: '/api/v1/h2-sentinel/runs/events',
  event: '/api/v1/h2-sentinel/runs/event',
  eventReview: '/api/v1/h2-sentinel/runs/{runId}/events/{eventId}/review',
  reviewEvent: '/api/v1/h2-sentinel/runs/{runId}/events/{eventId}:review',
  series: '/api/v1/h2-sentinel/runs/series',
  assistant: '/api/v1/h2-sentinel/assistant:ask',
  report: '/api/v1/h2-sentinel/reports:export',
  submission: '/api/v1/h2-sentinel/submissions:export',
} as const

/**
 * Creates the sole Live boundary. It is opt-in, literal-loopback-only, and
 * maps every remote failure to a redacted local error.
 */
export function createLiveH2EmsDataSource(
  options: H2EmsLiveAdapterOptions,
): H2SentinelDataSource {
  if (options.enabled !== true) {
    throw new H2EmsAdapterError('live_adapter_disabled', false)
  }
  const baseUrl = validateLoopbackUrl(options.baseUrl)
  const timeoutMs = validateTimeout(options.timeoutMs)
  const fetchFn = options.fetchFn ?? fetch

  const request = <T>(
    route: string,
    payload: unknown,
    guard: (value: unknown) => value is T,
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
        await request(H2_EMS_LIVE_ROUTES.importCsv, input, isCsvImportResult),
        ({ dataset }) =>
          dataset.sourceFilename === input.filename &&
          dataset.fingerprint === expectedFingerprint,
      )
    },
    getDataQuality: async (datasetId) => verifyRemoteIdentity(
      await request(H2_EMS_LIVE_ROUTES.quality, { datasetId }, isQualityReport),
      (quality) => quality.datasetId === datasetId,
    ),
    runAnalysis: async (datasetId) => verifyRemoteIdentity(
      await request(H2_EMS_LIVE_ROUTES.analysis, { datasetId }, isAnalysisRun),
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
      await request(H2_EMS_LIVE_ROUTES.series, input, isSeriesResponse),
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

function validateTimeout(value: number | undefined): number {
  const timeoutMs = value ?? 5_000
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
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
    const init: RequestInit =
      payload === undefined
        ? { method: 'GET', redirect: 'error', signal: controller.signal }
        : {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
            redirect: 'error',
            signal: controller.signal,
          }
    const response = await fetchFn(new URL(route, baseUrl), init)
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
    answer.mode === 'DETERMINISTIC_TEMPLATE' &&
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
