import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createPluginRuntime } from '@opendashboard/plugin-runtime'
import {
  createFixtureH2EmsDataSource,
  H2_EMS_DATA_SOURCE,
  h2EmsPlugin,
} from '../src/index.ts'

describe('H2 EMS Fixture adapter', () => {
  it('returns canonical C03/C04 data without sending a request', async () => {
    const source = createFixtureH2EmsDataSource()
    const run = await source.runAnalysis('fixture-h2-sentinel-golden')
    const events = await source.listEvents(run.runId)

    assert.equal(await source.getMode(), 'FIXTURE')
    assert.deepEqual(events.map(({ code }) => code), ['C03', 'C04'])
    assert(events.every(({ provenance }) => provenance.mode === 'FIXTURE'))
    assert(events.every(({ requiresHumanConfirmation }) => requiresHumanConfirmation))
  })

  it('returns the exact official variables requested by the Fixture overview', async () => {
    const source = createFixtureH2EmsDataSource()
    const variables = [
      'pcc_power_actual_kw',
      'grid_export_power_limit_kw',
      'grid_import_power_limit_kw',
      'soc_target_pct',
      'bess_soc_pct',
    ]
    const overview = await source.getSeries({
      runId: 'run-fixture-h2-sentinel-golden',
      variables,
      startTime: '2026-01-05T10:20:00Z',
      endTime: '2026-01-05T10:41:00Z',
    })

    assert.deepEqual(overview.variables, variables)
    assert.equal(overview.points.length, 22)
    assert.deepEqual(overview.points[0]?.values, {
      pcc_power_actual_kw: 590,
      grid_export_power_limit_kw: 500,
      grid_import_power_limit_kw: 450,
      soc_target_pct: 55,
      bess_soc_pct: 55,
    })
  })

  it('returns official C03/C04 diagnosis variables with event bounds and key values', async () => {
    const source = createFixtureH2EmsDataSource()
    const c03 = await source.getSeries({
      runId: 'run-fixture-h2-sentinel-golden',
      eventId: 'C03-20260105-001',
      variables: [
        'bess_power_cmd_kw',
        'bess_power_actual_kw',
        'pcc_power_actual_kw',
      ],
      startTime: '2026-01-05T10:20:00Z',
      endTime: '2026-01-05T10:41:00Z',
    })
    const c04 = await source.getSeries({
      runId: 'run-fixture-h2-sentinel-golden',
      eventId: 'C04-20260105-001',
      variables: ['pcc_power_actual_kw', 'grid_export_power_limit_kw'],
      startTime: '2026-01-05T10:32:00Z',
      endTime: '2026-01-05T10:39:00Z',
    })

    assert.equal(c03.points.length, 22)
    assert.equal(c03.points[0]?.timestamp, '2026-01-05T10:20:00Z')
    assert.equal(c03.points.at(-1)?.timestamp, '2026-01-05T10:41:00Z')
    assert.deepEqual(c03.points[4]?.values, {
      bess_power_cmd_kw: -240,
      bess_power_actual_kw: 230,
      pcc_power_actual_kw: 590,
    })

    assert.equal(c04.points.length, 8)
    assert.equal(c04.points[0]?.timestamp, '2026-01-05T10:32:00Z')
    assert.equal(c04.points.at(-1)?.timestamp, '2026-01-05T10:39:00Z')
    assert(c04.points.every(({ values }) => values.pcc_power_actual_kw === 720))
    assert(c04.points.every(({ values }) => values.grid_export_power_limit_kw === 500))
    const impact =
      c04.points.reduce(
      (total, { values }) =>
        total +
        (values.pcc_power_actual_kw ?? 0) -
        (values.grid_export_power_limit_kw ?? 0),
      0,
    ) / 60
    assert.equal(impact, 29.333333333333332)
  })

  it('returns deterministic pv_forecast_kw points for the Analysis default', async () => {
    const source = createFixtureH2EmsDataSource()
    const analysis = await source.getSeries({
      runId: 'run-fixture-h2-sentinel-golden',
      variables: ['pv_forecast_kw'],
      startTime: '2026-01-05T10:20:00Z',
      endTime: '2026-01-05T10:41:00Z',
    })

    assert.deepEqual(analysis.variables, ['pv_forecast_kw'])
    assert.equal(analysis.points.length, 22)
    assert(analysis.points.every(({ values }) => values.pv_forecast_kw === 1900))
  })

  it('keeps deprecated Fixture series aliases compatible', async () => {
    const source = createFixtureH2EmsDataSource()
    const series = await source.getSeries({
      runId: 'run-fixture-h2-sentinel-golden',
      variables: [
        'bess_dispatch_command_kw',
        'bess_power_kw',
        'pcc_power_kw',
        'pcc_export_limit_kw',
        'bess_soc_percent',
      ],
      startTime: '2026-01-05T10:24:00Z',
      endTime: '2026-01-05T10:24:00Z',
    })

    assert.deepEqual(series.points[0]?.values, {
      bess_dispatch_command_kw: -240,
      bess_power_kw: 230,
      pcc_power_kw: 590,
      pcc_export_limit_kw: 500,
      bess_soc_percent: 55.8,
    })
  })

  it('rejects unknown or duplicate variables, invalid ranges, and empty results', async () => {
    const source = createFixtureH2EmsDataSource()
    await assert.rejects(
      () =>
        source.getSeries({
          runId: 'run-fixture-h2-sentinel-golden',
          variables: ['unknown_variable'],
          startTime: '2026-01-05T10:20:00Z',
          endTime: '2026-01-05T10:21:00Z',
        }),
    )
    await assert.rejects(
      () =>
        source.getSeries({
          runId: 'run-fixture-h2-sentinel-golden',
          variables: ['pcc_power_actual_kw', 'pcc_power_actual_kw'],
          startTime: '2026-01-05T10:20:00Z',
          endTime: '2026-01-05T10:21:00Z',
        }),
    )
    await assert.rejects(
      () =>
        source.getSeries({
          runId: 'run-fixture-h2-sentinel-golden',
          variables: ['pcc_power_kw'],
          startTime: '2026-01-05T10:19:00Z',
          endTime: '2026-01-05T10:20:00Z',
        }),
    )
    await assert.rejects(
      () =>
        source.getSeries({
          runId: 'run-fixture-h2-sentinel-golden',
          variables: ['pcc_power_actual_kw'],
          startTime: '2026-01-05T10:20:30Z',
          endTime: '2026-01-05T10:20:45Z',
        }),
    )
  })

  it('registers the fixture default through the static plugin runtime', async () => {
    const runtime = createPluginRuntime([h2EmsPlugin])
    await runtime.start()
    assert.equal(await runtime.resolve(H2_EMS_DATA_SOURCE).getMode(), 'FIXTURE')
    await runtime.stop()
  })
})
