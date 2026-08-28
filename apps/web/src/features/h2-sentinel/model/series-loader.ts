import { useEffect, useRef, useState } from 'react'

import type {
  H2AnalysisRun,
  H2AnomalyEvent,
  H2SentinelDataSource,
  H2SeriesRequest,
  H2SeriesResponse,
} from '@opendashboard/h2-contracts'
import {
  selectH2EventSeriesVariables,
  selectH2OverviewSeriesVariables,
} from './chart-options.ts'

const H2_OVERVIEW_WINDOW_MS = 24 * 60 * 60 * 1000
const H2_VIEW_SERIES_MAX_VARIABLES = 5

export type H2SeriesTarget =
  | { readonly scope: 'overview'; readonly runId: string }
  | { readonly scope: 'diagnosis'; readonly runId: string; readonly eventId: string }
  | { readonly scope: 'analysis'; readonly runId: string; readonly variable: string }

export interface H2SeriesQuery {
  readonly target: H2SeriesTarget
  readonly request: H2SeriesRequest
}

export type H2SeriesLoadState =
  | { readonly status: 'idle'; readonly series: null }
  | { readonly status: 'loading'; readonly series: null }
  | { readonly status: 'ready'; readonly series: H2SeriesResponse }
  | { readonly status: 'error'; readonly series: null }

export type H2SeriesResolution =
  | { readonly status: 'ready'; readonly target: H2SeriesTarget; readonly series: H2SeriesResponse }
  | { readonly status: 'error'; readonly target: H2SeriesTarget }
  | { readonly status: 'stale' }

const IDLE_SERIES_STATE = { status: 'idle', series: null } as const satisfies H2SeriesLoadState
const LOADING_SERIES_STATE = { status: 'loading', series: null } as const satisfies H2SeriesLoadState
const ERROR_SERIES_STATE = { status: 'error', series: null } as const satisfies H2SeriesLoadState

export function createH2OverviewSeriesQuery(run: H2AnalysisRun): H2SeriesQuery | null {
  const variables = selectH2OverviewSeriesVariables(run.dataset.fields)
  const boundedRange = getLatestH2OverviewRange(run)
  if (variables.length === 0 || !boundedRange) return null

  return {
    target: { scope: 'overview', runId: run.runId },
    request: {
      runId: run.runId,
      variables,
      startTime: boundedRange.startTime,
      endTime: boundedRange.endTime,
    },
  }
}

export function createH2DiagnosisSeriesQuery(
  run: H2AnalysisRun,
  event: H2AnomalyEvent,
): H2SeriesQuery | null {
  const variables = selectH2EventSeriesVariables(run.dataset.fields, event)
  if (variables.length === 0 || !isOrderedH2Range(event.startTime, event.endTime)) return null

  return {
    target: { scope: 'diagnosis', runId: run.runId, eventId: event.eventId },
    request: {
      runId: run.runId,
      eventId: event.eventId,
      variables,
      startTime: event.startTime,
      endTime: event.endTime,
    },
  }
}

export function createH2AnalysisSeriesQuery(
  run: H2AnalysisRun,
  variable: string,
): H2SeriesQuery | null {
  const field = run.dataset.fields.find(({ name }) => name === variable)
  if (
    !field ||
    (field.role !== 'measurement' && field.role !== 'constraint') ||
    !isOrderedH2Range(run.dataset.timeRange.startTime, run.dataset.timeRange.endTime)
  ) return null

  return {
    target: { scope: 'analysis', runId: run.runId, variable },
    request: {
      runId: run.runId,
      variables: [variable],
      startTime: run.dataset.timeRange.startTime,
      endTime: run.dataset.timeRange.endTime,
    },
  }
}

export async function requestH2Series(
  dataSource: H2SentinelDataSource,
  request: H2SeriesRequest,
): Promise<H2SeriesResponse> {
  if (
    request.variables.length === 0 ||
    request.variables.length > H2_VIEW_SERIES_MAX_VARIABLES ||
    new Set(request.variables).size !== request.variables.length ||
    !isOrderedH2Range(request.startTime, request.endTime)
  ) {
    throw new Error('The view series request is outside the bounded contract.')
  }

  const response = await dataSource.getSeries(request)
  if (
    response.runId !== request.runId ||
    !sameStrings(response.variables, request.variables)
  ) {
    throw new Error('The series response identity does not match the current request.')
  }

  const start = Date.parse(request.startTime)
  const end = Date.parse(request.endTime)
  let previousTimestamp = start
  for (const point of response.points) {
    const timestamp = Date.parse(point.timestamp)
    const keys = Object.keys(point.values)
    if (
      !Number.isFinite(timestamp) ||
      timestamp < start ||
      timestamp > end ||
      timestamp < previousTimestamp ||
      keys.length !== request.variables.length ||
      !request.variables.every((variable) => Object.hasOwn(point.values, variable))
    ) {
      throw new Error('The series response does not match the requested range and variables.')
    }
    previousTimestamp = timestamp
  }

  return response
}

export async function resolveH2SeriesQuery(
  dataSource: H2SentinelDataSource,
  query: H2SeriesQuery,
  isCurrent: (target: H2SeriesTarget) => boolean,
): Promise<H2SeriesResolution> {
  try {
    const series = await requestH2Series(dataSource, query.request)
    if (!isCurrent(query.target)) return { status: 'stale' }
    return { status: 'ready', target: query.target, series }
  } catch {
    if (!isCurrent(query.target)) return { status: 'stale' }
    return { status: 'error', target: query.target }
  }
}

export function isH2SeriesTargetCurrent(
  current: H2SeriesTarget | null,
  submitted: H2SeriesTarget,
): boolean {
  if (!current || current.scope !== submitted.scope || current.runId !== submitted.runId) {
    return false
  }
  if (current.scope === 'overview') return true
  if (current.scope === 'diagnosis' && submitted.scope === 'diagnosis') {
    return current.eventId === submitted.eventId
  }
  return current.scope === 'analysis' &&
    submitted.scope === 'analysis' &&
    current.variable === submitted.variable
}

export function useH2Series(
  dataSource: H2SentinelDataSource,
  query: H2SeriesQuery | null,
): H2SeriesLoadState {
  const [storedState, setStoredState] = useState<{
    readonly target: H2SeriesTarget | null
    readonly value: H2SeriesLoadState
  }>({ target: null, value: IDLE_SERIES_STATE })
  const activeTargetRef = useRef<H2SeriesTarget | null>(query?.target ?? null)
  activeTargetRef.current = query?.target ?? null
  const queryKey = query ? JSON.stringify(query) : ''

  useEffect(() => {
    if (!query) {
      setStoredState({ target: null, value: IDLE_SERIES_STATE })
      return
    }

    let disposed = false
    const submittedTarget = query.target
    setStoredState({ target: submittedTarget, value: LOADING_SERIES_STATE })
    void resolveH2SeriesQuery(
      dataSource,
      query,
      (target) => isH2SeriesTargetCurrent(activeTargetRef.current, target),
    ).then((resolution) => {
      if (disposed || resolution.status === 'stale') return
      setStoredState({
        target: resolution.target,
        value: resolution.status === 'ready'
          ? { status: 'ready', series: resolution.series }
          : ERROR_SERIES_STATE,
      })
    })

    return () => {
      disposed = true
    }
  }, [dataSource, queryKey])

  if (!query) return IDLE_SERIES_STATE
  return isH2SeriesTargetCurrent(storedState.target, query.target)
    ? storedState.value
    : LOADING_SERIES_STATE
}

function getLatestH2OverviewRange(
  run: H2AnalysisRun,
): { readonly startTime: string; readonly endTime: string } | null {
  const { startTime, endTime } = run.dataset.timeRange
  if (!isOrderedH2Range(startTime, endTime)) return null
  const datasetStart = Date.parse(startTime)
  const datasetEnd = Date.parse(endTime)
  const boundedStart = Math.max(datasetStart, datasetEnd - H2_OVERVIEW_WINDOW_MS)
  return {
    startTime: boundedStart === datasetStart ? startTime : new Date(boundedStart).toISOString(),
    endTime,
  }
}

function isOrderedH2Range(startTime: string, endTime: string): boolean {
  const start = Date.parse(startTime)
  const end = Date.parse(endTime)
  return Number.isFinite(start) && Number.isFinite(end) && start <= end
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}
