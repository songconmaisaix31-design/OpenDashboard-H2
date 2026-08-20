import type { EChartsCoreOption } from 'echarts/core'

import type {
  H2AnomalyEvent,
  H2DatasetField,
  H2SeriesResponse,
} from '@opendashboard/h2-contracts'
import { formatH2Timestamp } from './presentation.ts'

const COLORS = ['#49d6bd', '#ffb45d', '#8ea9ff', '#f3778f', '#b393ff'] as const

interface SeriesDefinition {
  readonly variable: string
  readonly label: string
  readonly color: string
  readonly dashed?: boolean
}

const powerSeriesByCode = {
  C03: [
    {
      variable: 'bess_dispatch_command_kw',
      label: '储能调度指令',
      color: COLORS[1],
      dashed: true,
    },
    { variable: 'bess_power_kw', label: '储能实际功率', color: COLORS[0] },
    { variable: 'pcc_power_kw', label: '并网点功率', color: COLORS[2] },
  ],
  C04: [
    { variable: 'pcc_power_kw', label: '并网点实际功率', color: COLORS[3] },
    {
      variable: 'pcc_export_limit_kw',
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
    variable,
    label: variable,
    color: COLORS[index] ?? COLORS[0],
    dashed: kind === 'constraint',
  }))
}

export function createPccChartOption(response: H2SeriesResponse): EChartsCoreOption {
  return createLineOption(
    response,
    [
      { variable: 'pcc_power_kw', label: '并网点实际功率', color: COLORS[0] },
      {
        variable: 'pcc_export_limit_kw',
        label: '送出边界',
        color: COLORS[1],
        dashed: true,
      },
      {
        variable: 'pcc_import_limit_kw',
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
    [{ variable: 'bess_soc_percent', label: '储能 SOC', color: COLORS[4] }],
    '%',
  )
}

export function createVariableChartOption(
  response: H2SeriesResponse,
  field: H2DatasetField,
): EChartsCoreOption {
  return createLineOption(
    response,
    [{ variable: field.name, label: field.displayNameZh, color: COLORS[0] }],
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

  return {
    aria: { enabled: true, decal: { show: true } },
    color: definitions.map(({ color }) => color),
    grid: { left: 54, right: 24, top: 54, bottom: 48, containLabel: false },
    legend: {
      top: 4,
      left: 0,
      textStyle: { color: '#a9b7c8', fontSize: 11 },
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross', label: { backgroundColor: '#152333' } },
      backgroundColor: 'rgba(7, 16, 26, 0.96)',
      borderColor: '#2d4258',
      textStyle: { color: '#ecf4f6' },
    },
    dataZoom: [
      { type: 'inside', filterMode: 'none' },
      {
        type: 'slider',
        height: 16,
        bottom: 4,
        borderColor: '#26384b',
        fillerColor: 'rgba(73, 214, 189, 0.12)',
        handleStyle: { color: '#49d6bd' },
        textStyle: { color: '#77899c' },
      },
    ],
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: timestamps,
      axisLabel: {
        color: '#7f91a4',
        formatter: (value: string) => formatH2Timestamp(value),
      },
      axisLine: { lineStyle: { color: '#304458' } },
    },
    yAxis: {
      type: 'value',
      name: unit,
      nameTextStyle: { color: '#7f91a4' },
      axisLabel: { color: '#7f91a4' },
      splitLine: { lineStyle: { color: 'rgba(126, 148, 170, 0.14)' } },
    },
    series: definitions.map((definition, index) => ({
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
              itemStyle: { color: 'rgba(243, 119, 143, 0.11)' },
              label: { color: '#f6a1b2', formatter: eventBand.label },
              data: [[{ xAxis: eventBand.startTime }, { xAxis: eventBand.endTime }]],
            }
          : undefined,
    })),
  }
}
