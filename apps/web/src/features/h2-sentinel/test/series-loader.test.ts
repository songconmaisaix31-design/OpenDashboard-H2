import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type {
  H2AnalysisRun,
  H2AnomalyEvent,
  H2DatasetField,
  H2SentinelDataSource,
  H2SeriesPoint,
  H2SeriesResponse,
} from '@opendashboard/h2-contracts'
import {
  createH2AnalysisSeriesQuery,
  createH2DiagnosisSeriesQuery,
  createH2OverviewSeriesQuery,
  isH2SeriesTargetCurrent,
  requestH2Series,
  resolveH2SeriesQuery,
  type H2SeriesTarget,
} from '../model/series-loader.ts'
import {
  createH2WebFixtureDataSource,
  H2_WEB_FIXTURE_RUN,
} from './fixture-data-source.ts'

describe('H2 R15 view-scoped series loading', () => {
  it('bounds a 69-field Overview to five semantic variables and the latest 24 hours', () => {
    const run = createRun(createWideFields(), {
      startTime: '2026-01-01T00:00:00.000Z',
      endTime: '2026-01-05T12:00:00.000Z',
    })
    const query = createH2OverviewSeriesQuery(run)

    assert.ok(query)
    assert.equal(run.dataset.fields.length, 69)
    assert.deepEqual(query.request.variables, [
      'pcc_power_actual_kw',
      'grid_export_power_limit_kw',
      'grid_import_power_limit_kw',
      'soc_target_pct',
      'bess_soc_pct',
    ])
    assert.ok(query.request.variables.length <= 5)
    assert.equal(query.request.startTime, '2026-01-04T12:00:00.000Z')
    assert.equal(query.request.endTime, run.dataset.timeRange.endTime)
    assert.equal(
      isH2SeriesTargetCurrent({ scope: 'overview', runId: 'new-run' }, query.target),
      false,
    )
  })

  it('requests only the current generic event evidence and exact event window', () => {
    const eventA = createC05Event(
      'event-a',
      Array.from({ length: 6 }, (_, index) => `event_a_variable_${index + 1}_kw`),
      '2026-01-05T08:00:00.000Z',
      '2026-01-05T08:15:00.000Z',
    )
    const eventB = createC05Event(
      'event-b',
      ['event_b_only_variable_kw'],
      '2026-01-05T09:00:00.000Z',
      '2026-01-05T09:15:00.000Z',
    )
    const fields = [...eventA.evidence, ...eventB.evidence]
      .flatMap(({ variable }) => variable ? [createField(variable)] : [])
    const run = createRun(fields, undefined, [eventA, eventB])
    const query = createH2DiagnosisSeriesQuery(run, eventA)

    assert.ok(query)
    assert.deepEqual(query.request.variables, [
      'event_a_variable_1_kw',
      'event_a_variable_2_kw',
      'event_a_variable_3_kw',
      'event_a_variable_4_kw',
      'event_a_variable_5_kw',
    ])
    assert.equal(query.request.eventId, eventA.eventId)
    assert.equal(query.request.startTime, eventA.startTime)
    assert.equal(query.request.endTime, eventA.endTime)
    assert.doesNotMatch(query.request.variables.join(','), /event_b|variable_6/u)
  })

  it('uses subtype-specific C03 and C04 semantic slots', () => {
    const run = createRun(createWideFields())
    const c03 = H2_WEB_FIXTURE_RUN.events.find(({ code }) => code === 'C03')
    const c04 = H2_WEB_FIXTURE_RUN.events.find(({ code }) => code === 'C04')
    assert.ok(c03)
    assert.ok(c04)

    const c03Query = createH2DiagnosisSeriesQuery(run, c03)
    const importC04 = { ...c04, subtype: 'IMPORT_POWER_LIMIT_NOT_TRACKED' } as H2AnomalyEvent
    const c04Query = createH2DiagnosisSeriesQuery(run, importC04)

    assert.deepEqual(c03Query?.request.variables, [
      'bess_power_cmd_kw',
      'bess_power_actual_kw',
      'pcc_power_actual_kw',
    ])
    assert.deepEqual(c04Query?.request.variables, [
      'pcc_power_actual_kw',
      'grid_import_power_limit_kw',
    ])
    assert.equal(c03Query?.request.startTime, c03.startTime)
    assert.equal(c04Query?.request.endTime, importC04.endTime)
  })

  it('requests exactly the arbitrary Analysis variable selected from the manifest', () => {
    const run = createRun(createWideFields())
    const selectedVariable = 'unused_manifest_variable_56_kw'
    const query = createH2AnalysisSeriesQuery(run, selectedVariable)

    assert.ok(query)
    assert.deepEqual(query.request.variables, [selectedVariable])
    assert.equal(query.request.startTime, run.dataset.timeRange.startTime)
    assert.equal(query.request.endTime, run.dataset.timeRange.endTime)
  })

  it('ignores a deferred event response after a rapid event switch', async () => {
    const eventA = createC05Event('event-a', ['event_a_kw'])
    const eventB = createC05Event('event-b', ['event_b_kw'])
    const run = createRun([createField('event_a_kw'), createField('event_b_kw')])
    const queryA = createH2DiagnosisSeriesQuery(run, eventA)
    const queryB = createH2DiagnosisSeriesQuery(run, eventB)
    assert.ok(queryA)
    assert.ok(queryB)
    const deferred = deferredValue<H2SeriesResponse>()
    const dataSource = withSeriesResponse(deferred.promise)
    let activeTarget: H2SeriesTarget | null = queryA.target
    const resolution = resolveH2SeriesQuery(
      dataSource,
      queryA,
      (target) => isH2SeriesTargetCurrent(activeTarget, target),
    )

    activeTarget = queryB.target
    deferred.resolve(responseFor(queryA))

    assert.deepEqual(await resolution, { status: 'stale' })
  })

  it('ignores a deferred variable error after a rapid Analysis selection switch', async () => {
    const run = createRun([createField('variable_a_kw'), createField('variable_b_kw')])
    const queryA = createH2AnalysisSeriesQuery(run, 'variable_a_kw')
    const queryB = createH2AnalysisSeriesQuery(run, 'variable_b_kw')
    assert.ok(queryA)
    assert.ok(queryB)
    const deferred = deferredValue<H2SeriesResponse>()
    const dataSource = withSeriesResponse(deferred.promise)
    let activeTarget: H2SeriesTarget | null = queryA.target
    const resolution = resolveH2SeriesQuery(
      dataSource,
      queryA,
      (target) => isH2SeriesTargetCurrent(activeTarget, target),
    )

    activeTarget = queryB.target
    deferred.reject(new Error('late variable failure'))

    assert.deepEqual(await resolution, { status: 'stale' })
  })

  it('returns a representative 129600-row response without duplicating its arrays', async () => {
    const rowCount = 129_600
    const start = Date.parse('2026-01-01T00:00:00.000Z')
    const endTime = new Date(start + (rowCount - 1) * 60_000).toISOString()
    const run = createRun([createField('analysis_variable_kw')], {
      startTime: new Date(start).toISOString(),
      endTime,
    })
    const query = createH2AnalysisSeriesQuery(run, 'analysis_variable_kw')
    assert.ok(query)
    const points: H2SeriesPoint[] = Array.from({ length: rowCount }, (_, index) => ({
      timestamp: new Date(start + index * 60_000).toISOString(),
      values: { analysis_variable_kw: index },
    }))
    const response = { runId: run.runId, variables: query.request.variables, points }
    const dataSource = withSeriesResponse(Promise.resolve(response))

    const loaded = await requestH2Series(dataSource, query.request)

    assert.strictEqual(loaded, response)
    assert.strictEqual(loaded.points, points)
    assert.equal(loaded.points.length, rowCount)
  })
})

function createWideFields(): readonly H2DatasetField[] {
  const knownVariables = [
    'pcc_power_kw',
    'pcc_power_actual_kw',
    'pcc_export_limit_kw',
    'grid_export_power_limit_kw',
    'pcc_import_limit_kw',
    'grid_import_power_limit_kw',
    'soc_target_pct',
    'bess_soc_percent',
    'bess_soc_pct',
    'bess_dispatch_command_kw',
    'bess_power_cmd_kw',
    'bess_power_kw',
    'bess_power_actual_kw',
  ]
  const unusedVariables = Array.from(
    { length: 69 - knownVariables.length },
    (_, index) => `unused_manifest_variable_${index + 1}_kw`,
  )
  return [...knownVariables, ...unusedVariables].map(createField)
}

function createField(name: string): H2DatasetField {
  return {
    name,
    displayNameZh: name,
    role: name.includes('limit') || name === 'soc_target_pct' ? 'constraint' : 'measurement',
    required: true,
    unit: name.includes('soc') ? 'percent' : 'kW',
  }
}

function createRun(
  fields: readonly H2DatasetField[],
  timeRange = H2_WEB_FIXTURE_RUN.dataset.timeRange,
  events = H2_WEB_FIXTURE_RUN.events,
): H2AnalysisRun {
  const dataset = {
    ...H2_WEB_FIXTURE_RUN.dataset,
    fields,
    timeRange,
  }
  return { ...H2_WEB_FIXTURE_RUN, dataset, events }
}

function createC05Event(
  eventId: string,
  variables: readonly string[],
  startTime = '2026-01-05T10:20:00.000Z',
  endTime = '2026-01-05T10:25:00.000Z',
): Extract<H2AnomalyEvent, { readonly code: 'C05' }> {
  const seed = H2_WEB_FIXTURE_RUN.events.find(
    (event): event is Extract<H2AnomalyEvent, { readonly code: 'C04' }> => event.code === 'C04',
  )
  const evidenceSeed = seed?.evidence[0]
  if (!seed || !evidenceSeed) throw new Error('The fixture must provide C04 evidence.')
  return {
    ...seed,
    eventId,
    code: 'C05',
    subtype: 'EXPORT_ENERGY_QUOTA_RISK',
    startTime,
    endTime,
    evidence: variables.map((variable, index) => ({
      ...evidenceSeed,
      evidenceId: `${eventId}-evidence-${index + 1}`,
      variable,
    })),
    impact: {
      ...seed.impact,
      metric: 'grid_energy_quota_deviation_kwh',
    },
  }
}

function responseFor(query: NonNullable<ReturnType<typeof createH2DiagnosisSeriesQuery>>): H2SeriesResponse {
  return {
    runId: query.request.runId,
    variables: query.request.variables,
    points: [{
      timestamp: query.request.startTime,
      values: Object.fromEntries(query.request.variables.map((variable) => [variable, 1])),
    }],
  }
}

function withSeriesResponse(response: Promise<H2SeriesResponse>): H2SentinelDataSource {
  return {
    ...createH2WebFixtureDataSource(),
    async getSeries() {
      return response
    },
  }
}

function deferredValue<T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
  readonly reject: (error: Error) => void
} {
  let resolvePromise: ((value: T) => void) | undefined
  let rejectPromise: ((error: Error) => void) | undefined
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  return {
    promise,
    resolve(value) {
      if (!resolvePromise) throw new Error('Deferred promise was not initialized.')
      resolvePromise(value)
    },
    reject(error) {
      if (!rejectPromise) throw new Error('Deferred promise was not initialized.')
      rejectPromise(error)
    },
  }
}
