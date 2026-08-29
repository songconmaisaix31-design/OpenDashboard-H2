import type { EChartsCoreOption } from 'echarts/core'

import type {
  H2AnomalyEvent,
  H2DatasetField,
  H2SeriesResponse,
} from '@opendashboard/h2-contracts'
import { H2_EVENT_CHART_REQUIREMENTS } from '@opendashboard/h2-contracts'
import { formatH2Timestamp } from './presentation.ts'

const COLORS = ['#70c2ac', '#d5a162', '#7eb8c5', '#d86f7b', '#a78ac1'] as const

interface SeriesDefinition {
  readonly variables: readonly string[]
  readonly label: string
  readonly color: string
  readonly unit: string
  readonly dashed?: boolean
  readonly axisKey?: string
  readonly chartType?: 'line' | 'scatter'
  readonly stack?: string
  readonly areaOpacity?: number
  readonly transform?: (value: number) => number
}

const eventSeriesByCode = {
  C01: [
    { variables: ['ems_total_elz_target_kw'], label: 'EMS 电解槽总目标', color: COLORS[1], unit: 'kW', axisKey: 'target-kw', dashed: true },
    { variables: ['bess_power_actual_kw'], label: '储能实际功率', color: COLORS[0], unit: 'kW', axisKey: 'response-kw' },
    { variables: ['pcc_power_actual_kw'], label: '并网点实际功率', color: COLORS[2], unit: 'kW', axisKey: 'response-kw' },
  ],
  C02: [
    { variables: ['elz1_reported_available_capacity_kw'], label: 'ELZ01 上报可用容量', color: COLORS[1], unit: 'kW', dashed: true },
    { variables: ['elz1_actual_available_capacity_kw'], label: 'ELZ01 实际可用容量', color: COLORS[0], unit: 'kW' },
    { variables: ['elz2_reported_available_capacity_kw'], label: 'ELZ02 上报可用容量', color: COLORS[3], unit: 'kW', dashed: true },
    { variables: ['elz2_actual_available_capacity_kw'], label: 'ELZ02 实际可用容量', color: COLORS[2], unit: 'kW' },
    { variables: ['elz3_reported_available_capacity_kw'], label: 'ELZ03 上报可用容量', color: COLORS[4], unit: 'kW', dashed: true },
    { variables: ['elz3_actual_available_capacity_kw'], label: 'ELZ03 实际可用容量', color: '#c98bdf', unit: 'kW' },
  ],
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
  C05: [
    { variables: ['pcc_power_actual_kw'], label: '并网点实际功率', color: COLORS[3], unit: 'kW' },
    { variables: ['grid_export_energy_quota_kwh_day'], label: '日送出电量配额', color: COLORS[1], unit: 'kWh', dashed: true },
    { variables: ['grid_import_energy_quota_kwh_day'], label: '日受电电量配额', color: COLORS[2], unit: 'kWh', dashed: true },
    { variables: ['grid_export_energy_used_kwh_day'], label: '日送出电量已用', color: COLORS[0], unit: 'kWh' },
    { variables: ['grid_import_energy_used_kwh_day'], label: '日受电电量已用', color: COLORS[4], unit: 'kWh' },
  ],
  C06: [
    { variables: ['elz1_power_actual_kw'], label: 'ELZ01 实际功率', color: COLORS[0], unit: 'kW', stack: 'elz-power', areaOpacity: 0.12 },
    { variables: ['elz2_power_actual_kw'], label: 'ELZ02 实际功率', color: COLORS[2], unit: 'kW', stack: 'elz-power', areaOpacity: 0.12 },
    { variables: ['elz3_power_actual_kw'], label: 'ELZ03 实际功率', color: COLORS[4], unit: 'kW', stack: 'elz-power', areaOpacity: 0.12 },
    { variables: ['elz1_specific_energy_kwh_per_kg'], label: 'ELZ01 单位制氢电耗', color: COLORS[1], unit: 'kWh/kg', chartType: 'scatter' },
    { variables: ['elz2_specific_energy_kwh_per_kg'], label: 'ELZ02 单位制氢电耗', color: COLORS[3], unit: 'kWh/kg', chartType: 'scatter' },
    { variables: ['elz3_specific_energy_kwh_per_kg'], label: 'ELZ03 单位制氢电耗', color: '#c98bdf', unit: 'kWh/kg', chartType: 'scatter' },
  ],
  C07: [
    { variables: ['soc_target_pct'], label: '储能目标 SOC', color: COLORS[1], unit: '%', dashed: true },
    { variables: ['bess_soc_pct'], label: '储能实际 SOC', color: COLORS[4], unit: '%' },
    { variables: ['bess_available_charge_energy_kwh'], label: '可充电量', color: COLORS[0], unit: 'kWh', areaOpacity: 0.1 },
    { variables: ['bess_available_discharge_energy_kwh'], label: '可放电量', color: COLORS[2], unit: 'kWh', areaOpacity: 0.1 },
    { variables: ['bess_regulation_reserve_target_kwh'], label: '调节备用目标', color: COLORS[3], unit: 'kWh', dashed: true, areaOpacity: 0.06 },
  ],
} as const satisfies Readonly<Record<Exclude<H2AnomalyEvent['code'], 'C04'>, readonly SeriesDefinition[]>>

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

export function selectH2OverviewSeriesVariables(
  fields: readonly H2DatasetField[],
): string[] {
  return selectAvailableSeriesVariables(
    fields,
    [...pccSeriesDefinitions, ...socSeriesDefinitions],
  )
}

export function selectH2EventSeriesVariables(
  fields: readonly H2DatasetField[],
  event: H2AnomalyEvent,
): string[] {
  const availableVariables = new Set(fields.map(({ name }) => name))
  return selectAvailableSeriesVariables(
    fields,
    getEventSeriesDefinitions(event, availableVariables),
  )
}

function selectAvailableSeriesVariables(
  fields: readonly H2DatasetField[],
  definitions: readonly SeriesDefinition[],
): string[] {
  const availableVariables = new Set(
    fields
      .filter(({ role }) => role === 'measurement' || role === 'constraint')
      .map(({ name }) => name),
  )
  const selectedVariables: string[] = []
  for (const definition of definitions) {
    const variable = definition.variables.find((candidate) => availableVariables.has(candidate))
    if (variable && !selectedVariables.includes(variable)) selectedVariables.push(variable)
  }
  return selectedVariables
}

export function createEventChartOption(
  response: H2SeriesResponse,
  event: H2AnomalyEvent,
): EChartsCoreOption {
  const definitions = getEventSeriesDefinitions(event, new Set(response.variables))

  return createLineOption(response, definitions, {
    startTime: event.startTime,
    endTime: event.endTime,
    label: `${event.code} 事件区间`,
  })
}

export function getEventChartUnitSummary(event: H2AnomalyEvent): string {
  const units = uniqueUnits(getDedicatedEventSeriesDefinitions(event))
  return `纵轴：${units.join(' / ')}`
}

function getEventSeriesDefinitions(
  event: H2AnomalyEvent,
  availableVariables: ReadonlySet<string>,
): readonly SeriesDefinition[] {
  const definitions = getDedicatedEventSeriesDefinitions(event)
  const requirement = H2_EVENT_CHART_REQUIREMENTS.find(({ code }) => code === event.code)
  if (
    requirement &&
    requirement.requiredVariables.every((variable) => availableVariables.has(variable))
  ) return definitions

  // Preserve the P1 C03/C04 compatibility aliases while newer Local manifests converge.
  if (event.code === 'C03' && definitions.every(({ variables }) =>
    variables.some((variable) => availableVariables.has(variable)))) return definitions
  if (event.code === 'C04' && definitions.every(({ variables }) =>
    variables.some((variable) => availableVariables.has(variable)))) return definitions
  return createEvidenceSeries(event)
}

function getDedicatedEventSeriesDefinitions(event: H2AnomalyEvent): readonly SeriesDefinition[] {
  if (event.code === 'C04') {
    return [
      pccActualSeries,
      event.subtype === 'IMPORT_POWER_LIMIT_NOT_TRACKED'
        ? pccImportBoundarySeries
        : pccExportBoundarySeries,
    ]
  }
  return eventSeriesByCode[event.code]
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
  const axes = uniqueAxes(resolvedDefinitions)
  const leftAxisCount = Math.ceil(axes.length / 2)
  const rightAxisCount = Math.floor(axes.length / 2)

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
    yAxis: axes.map(({ unit }, index) => ({
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
      name: axes.length > 1
        ? `${definition.label} (${definition.unit})`
        : definition.label,
      type: definition.chartType ?? 'line',
      yAxisIndex: axes.findIndex(({ key }) => key === (definition.axisKey ?? definition.unit)),
      stack: definition.stack,
      areaStyle: definition.areaOpacity === undefined
        ? undefined
        : { opacity: definition.areaOpacity },
      data: response.points.map(({ values }) => {
        const value = values[definition.variable]
        if (value === null || value === undefined) return null
        return definition.transform ? definition.transform(value) : value
      }),
      connectNulls: false,
      showSymbol: definition.chartType === 'scatter',
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

function uniqueAxes(
  definitions: readonly Pick<SeriesDefinition, 'axisKey' | 'unit'>[],
): { readonly key: string; readonly unit: string }[] {
  const axes: { readonly key: string; readonly unit: string }[] = []
  for (const definition of definitions) {
    const key = definition.axisKey ?? definition.unit
    if (!axes.some((axis) => axis.key === key)) axes.push({ key, unit: definition.unit })
  }
  return axes.length > 0 ? axes : [{ key: 'undeclared', unit: '单位未声明' }]
}

function toChartUnit(unit: string | undefined): string {
  if (unit === 'percent') return '%'
  return unit?.trim() || '单位未声明'
}
