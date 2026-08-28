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
  readonly unit: string
  readonly dashed?: boolean
  readonly transform?: (value: number) => number
}

const powerSeriesByCode = {
  C03: [
    {
      variables: ['bess_power_cmd_kw', 'bess_dispatch_command_kw'],
      label: '储能调度指令',
      color: COLORS[1],
      unit: 'kW',
      dashed: true,
    },
    { variables: ['bess_power_actual_kw', 'bess_power_kw'], label: '储能实际功率', color: COLORS[0], unit: 'kW' },
    { variables: ['pcc_power_actual_kw', 'pcc_power_kw'], label: '并网点功率', color: COLORS[2], unit: 'kW' },
  ],
} as const satisfies Readonly<Record<'C03', readonly SeriesDefinition[]>>

const pccActualSeries = {
  variables: ['pcc_power_actual_kw', 'pcc_power_kw'],
  label: '并网点实际功率',
  color: COLORS[3],
  unit: 'kW',
} as const satisfies SeriesDefinition

const pccExportBoundarySeries = {
  variables: ['grid_export_power_limit_kw', 'pcc_export_limit_kw'],
  label: '送出边界',
  color: COLORS[1],
  unit: 'kW',
  dashed: true,
} as const satisfies SeriesDefinition

const pccImportBoundarySeries = {
  variables: ['grid_import_power_limit_kw', 'pcc_import_limit_kw'],
  label: '受电边界（负向）',
  color: COLORS[2],
  unit: 'kW',
  dashed: true,
  transform: (value: number) => -Math.abs(value),
} as const satisfies SeriesDefinition

const pccSeriesDefinitions = [
  { ...pccActualSeries, color: COLORS[0] },
  pccExportBoundarySeries,
  pccImportBoundarySeries,
] as const satisfies readonly SeriesDefinition[]

const socSeriesDefinitions = [
  { variables: ['soc_target_pct'], label: '储能目标 SOC', color: COLORS[1], unit: '%', dashed: true },
  { variables: ['bess_soc_pct', 'bess_soc_percent'], label: '储能实际 SOC', color: COLORS[4], unit: '%' },
] as const satisfies readonly SeriesDefinition[]

export function selectH2SeriesVariables(
  fields: readonly H2DatasetField[],
  events: readonly H2AnomalyEvent[],
): string[] {
  const availableVariables = new Set(
    fields
      .filter(({ role }) => role === 'measurement' || role === 'constraint')
      .map(({ name }) => name),
  )
  const consumedVariables = new Set<string>()
  const definitions = [
    ...pccSeriesDefinitions,
    ...socSeriesDefinitions,
    ...events.flatMap((event) => getEventSeriesDefinitions(event)),
  ]

  for (const definition of definitions) {
    const variable = definition.variables.find((candidate) => availableVariables.has(candidate))
    if (variable) consumedVariables.add(variable)
  }

  const selectedVariables: string[] = []
  for (const { name } of fields) {
    if (consumedVariables.delete(name)) selectedVariables.push(name)
  }
  return selectedVariables
}

export function createEventChartOption(
  response: H2SeriesResponse,
  event: H2AnomalyEvent,
): EChartsCoreOption {
  const definitions = getEventSeriesDefinitions(event)

  return createLineOption(response, definitions, {
    startTime: event.startTime,
    endTime: event.endTime,
    label: `${event.code} 事件区间`,
  })
}

export function getEventChartUnitSummary(event: H2AnomalyEvent): string {
  const units = uniqueUnits(getEventSeriesDefinitions(event))
  return `纵轴：${units.join(' / ')}`
}

function getEventSeriesDefinitions(event: H2AnomalyEvent): readonly SeriesDefinition[] {
  if (event.code === 'C03') return powerSeriesByCode.C03
  if (event.code === 'C04') {
    return [
      pccActualSeries,
      event.subtype === 'IMPORT_POWER_LIMIT_NOT_TRACKED'
        ? pccImportBoundarySeries
        : pccExportBoundarySeries,
    ]
  }
  return createEvidenceSeries(event)
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
    unit: toChartUnit(variables[index]?.unit),
    dashed: kind === 'constraint',
  }))
}

export function createPccChartOption(response: H2SeriesResponse): EChartsCoreOption {
  return createLineOption(response, pccSeriesDefinitions)
}

export function createSocChartOption(response: H2SeriesResponse): EChartsCoreOption {
  return createLineOption(response, socSeriesDefinitions)
}

export function createVariableChartOption(
  response: H2SeriesResponse,
  field: H2DatasetField,
): EChartsCoreOption {
  return createLineOption(
    response,
    [{ variables: [field.name], label: field.displayNameZh, color: COLORS[0], unit: toChartUnit(field.unit) }],
  )
}

function createLineOption(
  response: H2SeriesResponse,
  definitions: readonly SeriesDefinition[],
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
  const units = uniqueUnits(resolvedDefinitions)
  const leftAxisCount = Math.ceil(units.length / 2)
  const rightAxisCount = Math.floor(units.length / 2)

  return {
    aria: { enabled: true, decal: { show: true } },
    color: resolvedDefinitions.map(({ color }) => color),
    grid: {
      left: 54 + Math.max(0, leftAxisCount - 1) * 34,
      right: 24 + Math.max(0, rightAxisCount - 1) * 34,
      top: 54,
      bottom: 48,
      containLabel: false,
    },
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
    yAxis: units.map((unit, index) => ({
      type: 'value',
      name: unit,
      position: index % 2 === 0 ? 'left' : 'right',
      offset: Math.floor(index / 2) * 34,
      nameTextStyle: { color: '#9d9195' },
      axisLabel: { color: '#9d9195' },
      axisLine: { show: index > 0, lineStyle: { color: '#4a3c41' } },
      splitLine: {
        show: index === 0,
        lineStyle: { color: 'rgba(255, 238, 233, 0.08)' },
      },
    })),
    series: resolvedDefinitions.map((definition, index) => ({
      name: units.length > 1
        ? `${definition.label} (${definition.unit})`
        : definition.label,
      type: 'line',
      yAxisIndex: units.indexOf(definition.unit),
      data: response.points.map(({ values }) => {
        const value = values[definition.variable]
        if (value === null || value === undefined) return null
        return definition.transform ? definition.transform(value) : value
      }),
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

function uniqueUnits(definitions: readonly Pick<SeriesDefinition, 'unit'>[]): string[] {
  const units = definitions.map(({ unit }) => unit)
  return [...new Set(units.length > 0 ? units : ['单位未声明'])]
}

function toChartUnit(unit: string | undefined): string {
  if (unit === 'percent') return '%'
  return unit?.trim() || '单位未声明'
}
