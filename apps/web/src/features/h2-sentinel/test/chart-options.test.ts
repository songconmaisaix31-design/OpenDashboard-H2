import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  H2_GOLDEN_C04_EVENT,
  type H2AnomalyEvent,
  type H2SeriesResponse,
} from '@opendashboard/h2-contracts'
import {
  createEventChartOption,
  createPccChartOption,
  createSocChartOption,
  getEventChartUnitSummary,
} from '../model/chart-options.ts'

interface TestChartSeries {
  readonly name?: string
  readonly data?: readonly (number | null)[]
  readonly yAxisIndex?: number
}

interface TestChartAxis {
  readonly name?: string
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
      '受电边界（负向）',
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
      '受电边界（负向）',
    ])
    assert.deepEqual(seriesNames(createSocChartOption(compatibility)), ['储能实际 SOC'])
  })

  it('plots positive import-limit magnitudes on the negative PCC side', () => {
    const option = createPccChartOption(seriesResponse({
      grid_export_power_limit_kw: 500,
      grid_import_power_limit_kw: 450,
      pcc_power_actual_kw: -520,
    }))

    assert.deepEqual(seriesData(option, '送出边界'), [500])
    assert.deepEqual(seriesData(option, '受电边界（负向）'), [-450])
  })

  it('uses the import boundary for an import-limit C04 event', () => {
    const importEvent = {
      ...H2_GOLDEN_C04_EVENT,
      subtype: 'IMPORT_POWER_LIMIT_NOT_TRACKED',
    } as H2AnomalyEvent
    const option = createEventChartOption(seriesResponse({
      grid_export_power_limit_kw: 500,
      grid_import_power_limit_kw: 450,
      pcc_power_actual_kw: -520,
    }), importEvent)

    assert.deepEqual(seriesNames(option), ['并网点实际功率', '受电边界（负向）'])
    assert.deepEqual(seriesData(option, '受电边界（负向）'), [-450])
  })

  it('separates mixed-unit event evidence onto truthful axes', () => {
    const [powerEvidence, quotaEvidence] = H2_GOLDEN_C04_EVENT.evidence
    assert.ok(powerEvidence)
    assert.ok(quotaEvidence)
    const mixedUnitEvent = {
      ...H2_GOLDEN_C04_EVENT,
      code: 'C05',
      subtype: 'EXPORT_ENERGY_QUOTA_RISK',
      evidence: [
        { ...powerEvidence, variable: 'pcc_power_actual_kw', unit: 'kW' },
        { ...quotaEvidence, variable: 'grid_export_energy_quota_kwh', unit: 'kWh' },
      ],
      impact: {
        ...H2_GOLDEN_C04_EVENT.impact,
        metric: 'grid_energy_quota_deviation_kwh',
        unit: 'kWh',
      },
    } as unknown as H2AnomalyEvent
    const option = createEventChartOption(seriesResponse({
      grid_export_energy_quota_kwh: 9_600,
      pcc_power_actual_kw: 420,
    }), mixedUnitEvent)

    assert.deepEqual(axisNames(option), ['kW', 'kWh'])
    assert.deepEqual(seriesAxisIndexes(option), [0, 1])
    assert.equal(getEventChartUnitSummary(mixedUnitEvent), '纵轴：kW / kWh')
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

function seriesData(option: unknown, name: string): readonly (number | null)[] {
  const chart = option as { readonly series?: readonly TestChartSeries[] }
  return chart.series?.find((series) => series.name === name)?.data ?? []
}

function axisNames(option: unknown): readonly string[] {
  const chart = option as { readonly yAxis?: TestChartAxis | readonly TestChartAxis[] }
  const axes = Array.isArray(chart.yAxis) ? chart.yAxis : chart.yAxis ? [chart.yAxis] : []
  return axes.map(({ name }) => name ?? '')
}

function seriesAxisIndexes(option: unknown): readonly number[] {
  const chart = option as { readonly series?: readonly TestChartSeries[] }
  return chart.series?.map(({ yAxisIndex }) => yAxisIndex ?? 0) ?? []
}
