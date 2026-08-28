import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { H2SeriesResponse } from '@opendashboard/h2-contracts'
import {
  createPccChartOption,
  createSocChartOption,
} from '../model/chart-options.ts'

interface TestChartSeries {
  readonly name?: string
  readonly data?: readonly (number | null)[]
}

describe('H2 chart official-field compatibility', () => {
  it('prefers official PCC and BESS fields without breaking deprecated Fixture fields', () => {
    const official = seriesResponse({
      bess_soc_pct: 61,
      grid_export_power_limit_kw: 500,
      grid_import_power_limit_kw: 450,
      pcc_power_actual_kw: 590,
      soc_target_pct: 60,
    })
    assert.deepEqual(seriesNames(createPccChartOption(official)), [
      '并网点实际功率',
      '送出边界',
      '受电边界',
    ])
    assert.deepEqual(seriesNames(createSocChartOption(official)), [
      '储能目标 SOC',
      '储能实际 SOC',
    ])

    const compatibility = seriesResponse({
      bess_soc_percent: 55,
      pcc_export_limit_kw: 500,
      pcc_import_limit_kw: 450,
      pcc_power_kw: 590,
    })
    assert.deepEqual(seriesNames(createPccChartOption(compatibility)), [
      '并网点实际功率',
      '送出边界',
      '受电边界',
    ])
    assert.deepEqual(seriesNames(createSocChartOption(compatibility)), ['储能实际 SOC'])
  })
})

function seriesResponse(values: Readonly<Record<string, number>>): H2SeriesResponse {
  return {
    runId: 'run-chart-fields',
    variables: Object.keys(values),
    points: [{ timestamp: '2026-01-05T10:20:00Z', values }],
  }
}

function seriesNames(option: unknown): readonly string[] {
  const chart = option as { readonly series?: readonly TestChartSeries[] }
  return chart.series?.map(({ name }) => name ?? '') ?? []
}
