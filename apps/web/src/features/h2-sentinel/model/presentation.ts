import { H2_SEVERITIES } from '@opendashboard/h2-contracts'
import type {
  H2AnalysisRun,
  H2AnomalyCode,
  H2AnomalyEvent,
  H2ClaimKind,
  H2DataQualityStatus,
  H2DatasetField,
  H2DatasetMode,
  H2EvidenceValue,
  H2Provenance,
  H2ProvenanceMode,
  H2ReviewState,
  H2SafetyStatus,
  H2SeriesResponse,
  H2Severity,
} from '@opendashboard/h2-contracts'

export const H2_CODE_LABELS = {
  C01: '电解槽功率指令振荡',
  C02: '设备可用容量未同步导致功率指令持续偏差',
  C03: '储能充放电方向异常',
  C04: 'PCC上下网功率边界跟踪异常',
  C05: '上下网电量配额执行异常',
  C06: '多电解槽负荷分配异常',
  C07: '储能SOC目标轨迹与调节裕度管理异常',
} as const satisfies Readonly<Record<H2AnomalyCode, string>>

export const H2_SEVERITY_LABELS = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '严重',
} as const satisfies Readonly<Record<H2Severity, string>>

export const H2_REVIEW_LABELS = {
  open: '待复核',
  confirmed: '已确认',
  dismissed: '已驳回',
  resolved: '已闭环',
} as const satisfies Readonly<Record<H2ReviewState, string>>

export const H2_CLAIM_LABELS = {
  fact: '事实',
  calculation: '计算',
  inference: '推断',
  recommendation: '建议',
} as const satisfies Readonly<Record<H2ClaimKind, string>>

export const H2_PROVENANCE_LABELS = {
  FIXTURE: '固定样例',
  LIVE_ANALYSIS: '本地实时分析',
  DERIVED: '确定性派生',
  MODEL: '模型输出',
  RULE: '规则输出',
  LLM_RENDERED: '语言模型渲染',
} as const satisfies Readonly<Record<H2ProvenanceMode, string>>

export const H2_SAFETY_LABELS = {
  passed: '通过',
  warning: '需注意',
  failed: '未通过',
  unknown: '证据不足',
  not_applicable: '不适用',
} as const satisfies Readonly<Record<H2SafetyStatus, string>>

/** Official power directions used consistently in overview, charts, and diagnosis. */
export const H2_SIGN_CONVENTIONS = [
  { id: 'pcc', label: 'PCC', copy: '正值上网（送出），负值下网（受电）' },
  { id: 'bess', label: '储能', copy: '正值放电，负值充电' },
] as const

const H2_FIELD_SIGN_COPY = {
  pcc_power_actual_kw: H2_SIGN_CONVENTIONS[0].copy,
  pcc_power_kw: H2_SIGN_CONVENTIONS[0].copy,
  bess_power_cmd_kw: H2_SIGN_CONVENTIONS[1].copy,
  bess_power_actual_kw: H2_SIGN_CONVENTIONS[1].copy,
  bess_dispatch_command_kw: H2_SIGN_CONVENTIONS[1].copy,
  bess_power_kw: H2_SIGN_CONVENTIONS[1].copy,
} as const satisfies Readonly<Record<string, string>>

export interface H2FieldDictionaryRow {
  readonly name: string
  readonly chineseName: string
  readonly role: string
  readonly unit: string
  readonly sign: string
  readonly required: boolean
}

export function toH2FieldDictionaryRows(
  fields: readonly H2DatasetField[],
): readonly H2FieldDictionaryRow[] {
  return fields.map((field) => ({
    name: field.name,
    chineseName: field.displayNameZh,
    role: field.role,
    unit: field.unit ?? '',
    sign: H2_FIELD_SIGN_COPY[field.name as keyof typeof H2_FIELD_SIGN_COPY] ?? '',
    required: field.required,
  }))
}

export const H2_QUALITY_LABELS = {
  passed: '质量检查通过',
  warning: '存在质量警告',
  blocked: '分析已阻断',
} as const satisfies Readonly<Record<H2DataQualityStatus, string>>

export const H2_MODE_COPY = {
  FIXTURE: {
    label: 'FIXTURE · 固定样例',
    description: '合成脱敏数据，仅用于可重复演示，不代表官方数据或成绩。',
  },
  LIVE_ANALYSIS: {
    label: 'LIVE_ANALYSIS · 本地数据',
    description: '来自已导入数据的本地分析结果，建议仍需人工确认。',
  },
} as const satisfies Readonly<
  Record<H2DatasetMode, { readonly label: string; readonly description: string }>
>

type H2ProvenancePresentationKind =
  | 'fixture'
  | 'explicit_validation_slice'
  | 'explicit_full_validation'
  | 'hint_validation_slice'
  | 'hint_full_validation'
  | 'local'

export interface H2ProvenancePresentation {
  readonly label: string
  readonly description: string
}

const H2_PROVENANCE_PRESENTATION = {
  fixture: H2_MODE_COPY.FIXTURE,
  explicit_validation_slice: {
    label: 'LIVE_ANALYSIS · 验证集切片',
    description: '来自公开验证数据的本地准备切片；不是完整验证集、隐藏测试结果或官方成绩。',
  },
  explicit_full_validation: {
    label: 'LIVE_ANALYSIS · 完整验证集',
    description: '来自完整公开验证数据的本地分析；不是隐藏测试结果、官方成绩或生产证明。',
  },
  hint_validation_slice: {
    label: 'LIVE_ANALYSIS · 未核验文件名提示（验证集切片）',
    description: '文件名或数据集名称看起来像验证集切片，但来源身份未核验；只有独立 manifest/receipt 才能确认公共来源身份。',
  },
  hint_full_validation: {
    label: 'LIVE_ANALYSIS · 未核验文件名提示（完整验证集）',
    description: '文件名或数据集名称看起来像完整验证集，但来源身份未核验；只有独立 manifest/receipt 才能确认公共来源身份。',
  },
  local: H2_MODE_COPY.LIVE_ANALYSIS,
} as const satisfies Readonly<
  Record<H2ProvenancePresentationKind, H2ProvenancePresentation>
>

export function getH2ProvenancePresentation(
  provenance: H2Provenance,
  sourceHints: readonly string[] = [],
): H2ProvenancePresentation {
  return H2_PROVENANCE_PRESENTATION[classifyH2Provenance(provenance, sourceHints)]
}

export function getH2ProvenanceLabel(
  provenance: H2Provenance,
  sourceHints: readonly string[] = [],
): string {
  return getH2ProvenancePresentation(provenance, sourceHints).label
}

function classifyH2Provenance(
  provenance: H2Provenance,
  sourceHints: readonly string[],
): H2ProvenancePresentationKind {
  if (provenance.mode === 'FIXTURE') return 'fixture'

  const explicitEvidence = normalizeH2ProvenanceEvidence([
    provenance.source,
    ...provenance.limitations,
  ])
  if (hasH2ValidationSliceMarker(explicitEvidence)) return 'explicit_validation_slice'
  if (hasH2FullValidationMarker(explicitEvidence)) return 'explicit_full_validation'

  const hintEvidence = normalizeH2ProvenanceEvidence(sourceHints)
  if (hasH2ValidationSliceMarker(hintEvidence)) return 'hint_validation_slice'
  if (hasH2FullValidationMarker(hintEvidence)) return 'hint_full_validation'
  return 'local'
}

function normalizeH2ProvenanceEvidence(values: readonly string[]): string {
  return values.join(' ').toLocaleLowerCase('zh-CN')
}

function hasH2ValidationSliceMarker(evidence: string): boolean {
  return evidence.includes('validation slice') ||
    evidence.includes('validation-slice') ||
    evidence.includes('validation_slice') ||
    evidence.includes('验证集切片')
}

function hasH2FullValidationMarker(evidence: string): boolean {
  return evidence.includes('full validation') ||
    evidence.includes('full-validation') ||
    evidence.includes('full_validation') ||
    evidence.includes('完整验证集')
}

export interface H2OverviewMetric {
  readonly label: string
  readonly value: string
  readonly detail: string
  readonly tone: 'neutral' | 'positive' | 'warning'
}

export interface H2EventFilterState {
  readonly code: H2AnomalyCode | 'all'
  readonly severity: H2Severity | 'all'
  readonly reviewState: H2ReviewState | 'all'
  readonly equipmentQuery: string
  readonly minConfidence: number
  readonly startsAtOrAfter: string
  readonly endsAtOrBefore: string
}

export const INITIAL_EVENT_FILTERS: H2EventFilterState = {
  code: 'all',
  severity: 'all',
  reviewState: 'all',
  equipmentQuery: '',
  minConfidence: 0,
  startsAtOrAfter: '',
  endsAtOrBefore: '',
}

// C-P0-3 会话2：事件排序（18 分表 #2 四要素之一）。排序键覆盖 时间/严重度/置信度，
// 与筛选状态分离（排序只改变展示顺序，不改变筛选结果与源数据）。
export type H2EventSortKey = 'startTime' | 'severity' | 'confidence'
export type H2EventSortDirection = 'asc' | 'desc'

export interface H2EventSortState {
  readonly key: H2EventSortKey
  readonly direction: H2EventSortDirection
}

export const INITIAL_EVENT_SORT: H2EventSortState = { key: 'startTime', direction: 'desc' }

export function sortH2Events(
  events: readonly H2AnomalyEvent[],
  sort: H2EventSortState,
): readonly H2AnomalyEvent[] {
  const severityRank = new Map(H2_SEVERITIES.map((severity, index) => [severity, H2_SEVERITIES.length - index]))
  const factor = sort.direction === 'asc' ? 1 : -1
  return [...events].sort((left, right) => {
    if (sort.key === 'severity') {
      return ((severityRank.get(left.severity) ?? 0) - (severityRank.get(right.severity) ?? 0)) * factor
    }
    if (sort.key === 'confidence') {
      return (left.confidence - right.confidence) * factor
    }
    return (Date.parse(left.startTime) - Date.parse(right.startTime)) * factor
  })
}

const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Shanghai',
})

const numberFormatter = new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 2,
})

export function formatH2Timestamp(value: string): string {
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? '时间未知' : dateTimeFormatter.format(timestamp)
}

export function formatH2Duration(startTime: string, endTime: string): string {
  const start = Date.parse(startTime)
  const end = Date.parse(endTime)
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return '时长未知'
  }

  return `${Math.round((end - start) / 60_000) + 1} 分钟`
}

export function formatH2Number(value: number, unit?: string): string {
  const suffix = unit ? ` ${unit}` : ''
  return `${numberFormatter.format(value)}${suffix}`
}

export function formatH2Confidence(value: number): string {
  return `${Math.round(value * 100)}%`
}

export function formatEvidenceValue(
  value: H2EvidenceValue | undefined,
  unit?: string,
): string {
  if (value === undefined) {
    return '—'
  }
  if (typeof value === 'number') {
    return formatH2Number(value, unit)
  }
  return String(value)
}

export function createOverviewMetrics(run: H2AnalysisRun): readonly H2OverviewMetric[] {
  const openCount = run.events.filter(({ reviewState }) => reviewState === 'open').length
  const severeCount = run.eventCountsBySeverity.high + run.eventCountsBySeverity.critical

  return [
    {
      label: '数据规模',
      value: `${numberFormatter.format(run.dataset.rowCount)} 行`,
      detail: `${run.dataset.samplingIntervalMinutes} 分钟采样`,
      tone: 'neutral',
    },
    {
      label: '异常事件',
      value: `${run.events.length} 个`,
      detail: 'C01–C07 统一事件契约',
      tone: run.events.length > 0 ? 'warning' : 'positive',
    },
    {
      label: '高风险 / 待复核',
      value: `${severeCount} / ${openCount}`,
      detail: '严重度与复核状态分开呈现',
      tone: severeCount > 0 || openCount > 0 ? 'warning' : 'positive',
    },
    {
      label: '数据质量',
      value: H2_QUALITY_LABELS[run.quality.status],
      detail:
        run.quality.status === 'blocked'
          ? `${run.quality.blockingReasons.length} 个阻断原因`
          : `${run.quality.checks.length} 项检查`,
      tone: run.quality.status === 'passed' ? 'positive' : 'warning',
    },
  ]
}

export type H2SixElementKpiKey = 'pv' | 'bess' | 'pcc' | 'quota' | 'elz' | 'anomaly'

export interface H2SixElementKpi {
  readonly key: H2SixElementKpiKey
  /** 18 分表 #1 原文措辞：光伏、储能、PCC、配额、电解槽和异常 KPI */
  readonly label: string
  readonly value: string
  readonly detail: string
  readonly tone: 'neutral' | 'positive' | 'warning'
  /** KPI 卡下钻目标页（要素→分析页，异常→事件中心） */
  readonly navigateRoute: 'analysis' | 'events'
}

/** 电解槽运行状态文案：直读 fields.json elz*_run_state 的 sign 定义（0停机，1待机，2运行，3降额） */
const H2_ELZ_RUN_STATE_LABELS: Readonly<Record<number, string>> = {
  0: '停机',
  1: '待机',
  2: '运行',
  3: '降额',
}

type H2SeriesStatus = 'idle' | 'loading' | 'ready' | 'error'

/**
 * C-P0-2 六要素 KPI 装配：光伏/储能/PCC/配额/电解槽/异常。
 * 数值一律取序列最新值（getLatestSeriesValue）或 run 契约计数，前端不自算口径；
 * 中文名/单位从 run.dataset.fields 单源取（fields.json → displayNameZh/unit）；
 * 缺列如实呈现（红线 #3），不造假序列。
 */
export function createSixElementKpis(
  run: H2AnalysisRun,
  series: H2SeriesResponse | null,
  seriesStatus: H2SeriesStatus,
): readonly H2SixElementKpi[] {
  if (seriesStatus !== 'ready' || !series) {
    const fallback = getSixElementStatusCopy(seriesStatus)
    return SIX_ELEMENT_KEYS.map((key) => ({
      key,
      label: SIX_ELEMENT_LABELS[key],
      value: fallback.value,
      detail: fallback.detail,
      tone: 'neutral' as const,
      navigateRoute: key === 'anomaly' ? ('events' as const) : ('analysis' as const),
    }))
  }

  const fields = new Map(run.dataset.fields.map((field) => [field.name, field]))
  const latest = (variables: readonly string[]): number | null => {
    const variable = variables.find((candidate) => series.variables.includes(candidate))
    return variable ? getLatestSeriesValue(series, variable) : null
  }
  const unitOf = (name: string): string => fields.get(name)?.unit ?? ''

  const pv = latest(['pv_actual_kw'])
  const pvForecast = latest(['pv_forecast_kw'])
  const soc = latest(['bess_soc_pct', 'bess_soc_percent'])
  const socTarget = latest(['soc_target_pct'])
  const bessPower = latest(['bess_power_actual_kw', 'bess_power_kw'])
  const pcc = latest(['pcc_power_actual_kw', 'pcc_power_kw'])
  const exportLimit = latest(['grid_export_power_limit_kw', 'pcc_export_limit_kw'])
  const exportUsed = latest(['grid_export_energy_used_kwh_day'])
  const exportQuota = latest(['grid_export_energy_quota_kwh_day'])
  const importUsed = latest(['grid_import_energy_used_kwh_day'])
  const importQuota = latest(['grid_import_energy_quota_kwh_day'])
  const elzPowers = [
    latest(['elz1_power_actual_kw']),
    latest(['elz2_power_actual_kw']),
    latest(['elz3_power_actual_kw']),
  ]
  const elzStates = [
    latest(['elz1_run_state']),
    latest(['elz2_run_state']),
    latest(['elz3_run_state']),
  ]

  const openCount = run.events.filter(({ reviewState }) => reviewState === 'open').length
  const severeCount = run.eventCountsBySeverity.high + run.eventCountsBySeverity.critical

  return [
    {
      key: 'pv',
      label: SIX_ELEMENT_LABELS.pv,
      value: pv === null
        ? missingValue()
        : formatH2Number(pv, unitOf('pv_actual_kw')),
      detail: pvForecast === null
        ? missingDetail('pv_forecast_kw')
        : `预测 ${formatH2Number(pvForecast, unitOf('pv_forecast_kw'))}`,
      tone: 'neutral',
      navigateRoute: 'analysis',
    },
    {
      key: 'bess',
      label: SIX_ELEMENT_LABELS.bess,
      value: soc === null
        ? missingValue()
        : formatH2Number(soc, unitOf('bess_soc_pct')),
      detail: soc === null
        ? missingDetail('bess_soc_pct')
        : [
            bessPower === null ? null : `${formatH2Number(bessPower, unitOf('bess_power_actual_kw'))}（正放电 · 负充电）`,
            socTarget === null ? null : `目标 ${formatH2Number(socTarget, unitOf('soc_target_pct'))}`,
          ].filter((part): part is string => part !== null).join(' · ') || missingDetail('bess_power_actual_kw'),
      tone: 'neutral',
      navigateRoute: 'analysis',
    },
    {
      key: 'pcc',
      label: SIX_ELEMENT_LABELS.pcc,
      value: pcc === null
        ? missingValue()
        : formatH2Number(pcc, unitOf('pcc_power_actual_kw')),
      detail: pcc === null
        ? missingDetail('pcc_power_actual_kw')
        : exportLimit === null
          ? `上网边界 ${missingValue()}`
          : `上网边界 ${formatH2Number(exportLimit, unitOf('grid_export_power_limit_kw'))}`,
      tone: pcc !== null && exportLimit !== null && pcc > exportLimit ? 'warning' : 'neutral',
      navigateRoute: 'analysis',
    },
    {
      key: 'quota',
      label: SIX_ELEMENT_LABELS.quota,
      value: exportUsed === null || exportQuota === null
        ? missingValue()
        : `${formatH2Number(exportUsed)} / ${formatH2Number(exportQuota, unitOf('grid_export_energy_used_kwh_day'))}`,
      detail: exportUsed === null || exportQuota === null
        ? missingDetail('grid_export_energy_used_kwh_day')
        : importUsed === null || importQuota === null
          ? '当日上网累计 · 下网数据未提供'
          : `当日上网累计 · 下网 ${formatH2Number(importUsed)} / ${formatH2Number(importQuota, unitOf('grid_import_energy_used_kwh_day'))}`,
      tone: exportUsed !== null && exportQuota !== null && exportUsed >= exportQuota
        ? 'warning'
        : 'neutral',
      navigateRoute: 'analysis',
    },
    {
      key: 'elz',
      label: SIX_ELEMENT_LABELS.elz,
      value: elzPowers.some((power) => power === null)
        ? missingValue()
        : formatH2Number(
            elzPowers.reduce<number>((sum, power) => sum + (power ?? 0), 0),
            unitOf('elz1_power_actual_kw'),
          ),
      detail: elzPowers.some((power) => power === null)
        ? missingDetail('elz1_power_actual_kw')
        : ELZ_EQUIPMENT_IDS.map((id, index) => {
            const state = elzStates[index] ?? null
            const stateLabel = state === null ? '' : `（${H2_ELZ_RUN_STATE_LABELS[state] ?? '状态未知'}）`
            return `${id} ${formatH2Number(elzPowers[index] ?? 0, unitOf('elz1_power_actual_kw'))}${stateLabel}`
          }).join(' · '),
      tone: 'neutral',
      navigateRoute: 'analysis',
    },
    {
      key: 'anomaly',
      label: SIX_ELEMENT_LABELS.anomaly,
      value: `${run.events.length} 个`,
      detail: `高风险 ${severeCount} · 待复核 ${openCount}`,
      tone: run.events.length > 0 ? 'warning' : 'positive',
      navigateRoute: 'events',
    },
  ]
}

/** 设备名与台账一致（equipment.json）：ELZ01/ELZ02/ELZ03 */
const ELZ_EQUIPMENT_IDS = ['ELZ01', 'ELZ02', 'ELZ03'] as const

const SIX_ELEMENT_KEYS = ['pv', 'bess', 'pcc', 'quota', 'elz', 'anomaly'] as const satisfies readonly H2SixElementKpiKey[]

const SIX_ELEMENT_LABELS = {
  pv: '光伏',
  bess: '储能',
  pcc: 'PCC 功率',
  quota: '电量配额',
  elz: '电解槽',
  anomaly: '异常事件',
} as const satisfies Readonly<Record<H2SixElementKpiKey, string>>

function missingValue(): string {
  return '字段未提供'
}

function missingDetail(fieldName: string): string {
  return `当前数据集无 ${fieldName}`
}

function getSixElementStatusCopy(
  status: H2SeriesStatus,
): { readonly value: string; readonly detail: string } {
  if (status === 'loading') return { value: '读取中', detail: '正在读取当前运行 KPI 序列。' }
  if (status === 'error') return { value: '暂不可用', detail: 'KPI 序列读取失败；未用占位数值替代。' }
  return { value: missingValue(), detail: '当前字段清单没有 KPI 所需变量。' }
}

export function filterH2Events(
  events: readonly H2AnomalyEvent[],
  filters: H2EventFilterState,
): readonly H2AnomalyEvent[] {
  const normalizedEquipment = filters.equipmentQuery.trim().toLocaleLowerCase('zh-CN')

  return events.filter((event) => {
    const matchesEquipment =
      normalizedEquipment.length === 0 ||
      event.affectedEquipment.some(({ id, kind, displayName }) =>
        `${id} ${kind} ${displayName}`.toLocaleLowerCase('zh-CN').includes(normalizedEquipment),
      )

    return (
      (filters.code === 'all' || event.code === filters.code) &&
      (filters.severity === 'all' || event.severity === filters.severity) &&
      (filters.reviewState === 'all' || event.reviewState === filters.reviewState) &&
      event.confidence >= filters.minConfidence &&
      (filters.startsAtOrAfter === '' || event.startTime >= filters.startsAtOrAfter) &&
      (filters.endsAtOrBefore === '' || event.endTime <= filters.endsAtOrBefore) &&
      matchesEquipment
    )
  })
}

export function findH2Event(
  events: readonly H2AnomalyEvent[],
  eventId?: string,
): H2AnomalyEvent | null {
  if (eventId) {
    return events.find((event) => event.eventId === eventId) ?? null
  }

  return events.find(({ code }) => code === 'C03') ?? events[0] ?? null
}

export function getLatestSeriesValue(
  series: H2SeriesResponse | null,
  variable: string,
): number | null {
  if (!series) {
    return null
  }

  for (let index = series.points.length - 1; index >= 0; index -= 1) {
    const point = series.points[index]
    const value = point?.values[variable]
    if (typeof value === 'number') {
      return value
    }
  }

  return null
}

export function datasetHasValidationLabels(run: H2AnalysisRun): boolean {
  return run.dataset.fields.some(({ role }) => role === 'label')
}
