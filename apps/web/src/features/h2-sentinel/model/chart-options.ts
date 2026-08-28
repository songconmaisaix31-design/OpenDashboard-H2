import type { EChartsCoreOption } from 'echarts/core'

import type {
  H2AnomalyEvent,
  H2DatasetField,
  H2SeriesResponse,
} from '@opendashboard/h2-contracts'
import { formatH2Timestamp } from './presentation.ts'

const COLORS = ['#70c2ac', '#d5a162', '#7eb8c5', '#d86f7b', '#a78ac1'] as const

interface SeriesDefinition {
  readonly variables: readonly string[]
  readonly label: string
  readonly color: string
  readonly dashed?: boolean
}

const powerSeriesByCode = {
  C03: [
    {
      variables: ['bess_power_cmd_kw', 'bess_dispatch_command_kw'],
      label: '储能调度指令',
      color: COLORS[1],
      dashed: true,
    },
    { variables: ['bess_power_actual_kw', 'bess_power_kw'], label: '储能实际功率', color: COLORS[0] },
    { variables: ['pcc_power_actual_kw', 'pcc_power_kw'], label: '并网点功率', color: COLORS[2] },
  ],
  C04: [
    { variables: ['pcc_power_actual_kw', 'pcc_power_kw'], label: '并网点实际功率', color: COLORS[3] },
    {
      variables: ['grid_export_power_limit_kw', 'pcc_export_limit_kw'],
      label: '送出边界',
      color: COLORS[1],
      dashed: true,
    },
  ],
} as const satisfies Readonly<Record<'C03' | 'C04', readonly SeriesDefinition[]>>

export function createEventChartOption(
  response: H2SeriesResponse,
  event: H2AnomalyEvent,
): EChartsCoreOption {
  const definitions =
    event.code === 'C03'
      ? powerSeriesByCode.C03
      : event.code === 'C04'
        ? powerSeriesByCode.C04
        : createEvidenceSeries(event)

  return createLineOption(response, definitions, 'kW', {
    startTime: event.startTime,
    endTime: event.endTime,
    label: `${event.code} 事件区间`,
  })
}

function createEvidenceSeries(event: H2AnomalyEvent): readonly SeriesDefinition[] {
  const variables = event.evidence
    .filter(
      (item): item is typeof item & { readonly variable: string } =>
        typeof item.variable === 'string',
    )
    .filter(
      (item, index, items) =>
        items.findIndex(({ variable }) => variable === item.variable) === index,
    )
    .slice(0, COLORS.length)

  return variables.map(({ kind, variable }, index) => ({
    variables: [variable],
    label: variable,
    color: COLORS[index] ?? COLORS[0],
    dashed: kind === 'constraint',
  }))
}

export function createPccChartOption(response: H2SeriesResponse): EChartsCoreOption {
  return createLineOption(
    response,
    [
      { variables: ['pcc_power_actual_kw', 'pcc_power_kw'], label: '并网点实际功率', color: COLORS[0] },
      {
        variables: ['grid_export_power_limit_kw', 'pcc_export_limit_kw'],
        label: '送出边界',
        color: COLORS[1],
        dashed: true,
      },
      {
        variables: ['grid_import_power_limit_kw', 'pcc_import_limit_kw'],
        label: '受电边界',
        color: COLORS[2],
        dashed: true,
      },
    ],
    'kW',
  )
}

export function createSocChartOption(response: H2SeriesResponse): EChartsCoreOption {
  return createLineOption(
    response,
    [
      { variables: ['soc_target_pct'], label: '储能目标 SOC', color: COLORS[1], dashed: true },
      { variables: ['bess_soc_pct', 'bess_soc_percent'], label: '储能实际 SOC', color: COLORS[4] },
    ],
    '%',
  )
}

export function createVariableChartOption(
  response: H2SeriesResponse,
  field: H2DatasetField,
): EChartsCoreOption {
  return createLineOption(
    response,
    [{ variables: [field.name], label: field.displayNameZh, color: COLORS[0] }],
    field.unit === 'percent' ? '%' : (field.unit ?? ''),
  )
}

function createLineOption(
  response: H2SeriesResponse,
  definitions: readonly SeriesDefinition[],
  unit: string,
  eventBand?: {
    readonly startTime: string
    readonly endTime: string
    readonly label: string
  },
): EChartsCoreOption {
  const timestamps = response.points.map(({ timestamp }) => timestamp)
  const resolvedDefinitions = definitions.flatMap((definition) => {
    const variable = definition.variables.find((candidate) =>
      response.variables.includes(candidate),
    )
    return variable ? [{ ...definition, variable }] : []
  })

  return {
    aria: { enabled: true, decal: { show: true } },
    color: resolvedDefinitions.map(({ color }) => color),
    grid: { left: 54, right: 24, top: 54, bottom: 48, containLabel: false },
    legend: {
      top: 4,
      left: 0,
      textStyle: { color: '#c8bdc0', fontSize: 11 },
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross', label: { backgroundColor: '#3a2f33' } },
      backgroundColor: 'rgba(23, 19, 21, 0.96)',
      borderColor: '#4a3c41',
      textStyle: { color: '#f8f2f0' },
    },
    dataZoom: [
      { type: 'inside', filterMode: 'none' },
      {
        type: 'slider',
        height: 16,
        bottom: 4,
        borderColor: '#45373c',
        fillerColor: 'rgba(200, 111, 120, 0.14)',
        handleStyle: { color: '#c86f78' },
        textStyle: { color: '#9d9195' },
      },
    ],
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: timestamps,
      axisLabel: {
        color: '#9d9195',
        formatter: (value: string) => formatH2Timestamp(value),
      },
      axisLine: { lineStyle: { color: '#4a3c41' } },
    },
    yAxis: {
      type: 'value',
      name: unit,
      nameTextStyle: { color: '#9d9195' },
      axisLabel: { color: '#9d9195' },
      splitLine: { lineStyle: { color: 'rgba(255, 238, 233, 0.08)' } },
    },
    series: resolvedDefinitions.map((definition, index) => ({
      name: definition.label,
      type: 'line',
      data: response.points.map(({ values }) => values[definition.variable] ?? null),
      connectNulls: false,
      showSymbol: false,
      smooth: false,
      lineStyle: {
        color: definition.color,
        width: definition.dashed ? 1.5 : 2.5,
        type: definition.dashed ? 'dashed' : 'solid',
      },
      itemStyle: { color: definition.color },
      markArea:
        index === 0 && eventBand
          ? {
              silent: true,
              itemStyle: { color: 'rgba(200, 111, 120, 0.13)' },
              label: { color: '#e7a4aa', formatter: eventBand.label },
              data: [[{ xAxis: eventBand.startTime }, { xAxis: eventBand.endTime }]],
            }
          : undefined,
    })),
  }
}
