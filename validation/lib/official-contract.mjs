import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseCsvText, serializeCsv } from './csv.mjs'

const directory = dirname(fileURLToPath(import.meta.url))
export const repositoryRoot = resolve(directory, '../..')

const fieldSnapshot = JSON.parse(
  readFileSync(
    resolve(
      repositoryRoot,
      'tests/h2-sentinel/fixtures/official-timeseries-columns.json',
    ),
    'utf8',
  ),
)

if (
  fieldSnapshot.schemaVersion !== 1 ||
  fieldSnapshot.count !== 69 ||
  !Array.isArray(fieldSnapshot.fields) ||
  fieldSnapshot.fields.length !== 69 ||
  new Set(fieldSnapshot.fields).size !== 69
) {
  throw new Error('The frozen official timeseries vocabulary is invalid.')
}

export const OFFICIAL_FIELDS = Object.freeze([...fieldSnapshot.fields])
export const ANOMALY_CODES = Object.freeze([
  'C01',
  'C02',
  'C03',
  'C04',
  'C05',
  'C06',
  'C07',
])

export const SUBTYPES_BY_CODE = new Map([
  ['C01', ['SETPOINT_OSCILLATION']],
  ['C02', ['CAPACITY_NOT_SYNCHRONIZED']],
  ['C03', ['BESS_DIRECTION_REVERSED']],
  ['C04', ['EXPORT_POWER_LIMIT_NOT_TRACKED', 'IMPORT_POWER_LIMIT_NOT_TRACKED']],
  ['C05', ['EXPORT_ENERGY_QUOTA_RISK', 'IMPORT_ENERGY_QUOTA_RISK']],
  ['C06', ['AVOIDABLE_START_STOP', 'INEFFICIENT_POWER_ALLOCATION']],
  ['C07', ['CHARGE_HEADROOM_SHORTFALL', 'DISCHARGE_RESERVE_SHORTFALL']],
])

export const PRIMARY_CONTROL_OBJECT_BY_CODE = new Map([
  ['C01', 'EMS电解槽群控与功率分配模块'],
  ['C02', 'EMS设备状态与容量同步模块'],
  ['C03', 'EMS储能功率控制与接口映射模块'],
  ['C04', 'EMS并网点功率边界控制模块'],
  ['C05', 'EMS周期电量配额与日内能量计划模块'],
  ['C06', 'EMS电解槽群控分配模块'],
  ['C07', 'EMS储能SOC计划与调节备用管理模块'],
])

export const PRIMARY_IMPACT_METRIC_BY_CODE = new Map([
  ['C01', 'bess_extra_regulation_energy_kwh'],
  ['C02', 'unserved_elz_energy_kwh'],
  ['C03', 'abnormal_grid_exchange_energy_kwh'],
  ['C04', 'pcc_power_limit_violation_energy_kwh'],
  ['C05', 'grid_energy_quota_deviation_kwh'],
  ['C06', 'extra_energy_consumption_kwh'],
  ['C07', 'bess_regulation_reserve_shortfall_kwh'],
])

export const OFFICIAL_SEVERITIES = Object.freeze(['高', '中'])
export const SEVERITY_BY_CODE = new Map([
  ['C01', '中'],
  ['C02', '高'],
  ['C03', '高'],
  ['C04', '高'],
  ['C05', '高'],
  ['C06', '中'],
  ['C07', '高'],
])
export const OFFICIAL_EQUIPMENT_TOKENS = new Set([
  'BESS',
  'PCC',
  'PV',
  'ELZ',
  'ELZ1',
  'ELZ2',
  'ELZ3',
])

export const EQUIPMENT_TOKENS_BY_CODE = new Map([
  ['C03', Object.freeze(['BESS', 'PCC'])],
  ['C04', Object.freeze(['PCC', 'BESS', 'ELZ', 'PV'])],
  ['C05', Object.freeze(['PCC', 'BESS', 'ELZ'])],
  ['C06', Object.freeze(['ELZ1', 'ELZ2', 'ELZ3'])],
  ['C07', Object.freeze(['BESS', 'PCC', 'PV', 'ELZ'])],
])

const LABEL_COLUMNS = new Set([
  'event_id',
  'eventid',
  'label_event_id',
  'anomaly_code',
  'event_code',
  'anomaly_subtype',
  'event_start_time',
  'event_end_time',
  'start_time',
  'end_time',
  'severity',
  'ground_truth',
  'ground_truth_label',
  'event_label',
  'is_anomaly',
  '事件id',
  '事件编号',
  '异常事件id',
  '异常编码',
  '异常类别',
  '异常类型',
  '开始时间',
  '事件开始时间',
  '结束时间',
  '事件结束时间',
])

function normalizeHeader(value) {
  return value.trim().toLowerCase().replace(/[\s./-]+/g, '_')
}

export function isLabelColumn(header) {
  const normalized = normalizeHeader(header)
  return (
    LABEL_COLUMNS.has(normalized) ||
    normalized === 'label' ||
    normalized.startsWith('label_') ||
    normalized.endsWith('_label') ||
    normalized.startsWith('ground_truth_')
  )
}

export function assertOfficialTimeseriesColumns(columns) {
  const actual = new Set(columns)
  const expected = new Set(OFFICIAL_FIELDS)
  const missing = OFFICIAL_FIELDS.filter((field) => !actual.has(field))
  const unexpected = columns.filter((field) => !expected.has(field))
  if (
    columns.length !== OFFICIAL_FIELDS.length ||
    actual.size !== columns.length ||
    missing.length > 0 ||
    unexpected.length > 0
  ) {
    const details = [
      missing.length > 0 ? `missing: ${missing.join(', ')}` : null,
      unexpected.length > 0 ? `unexpected: ${unexpected.join(', ')}` : null,
    ].filter(Boolean)
    throw new Error(
      `Detector input must contain exactly the official 69-field vocabulary${
        details.length > 0 ? ` (${details.join('; ')})` : ''
      }.`,
    )
  }
  if (columns.some(isLabelColumn)) {
    throw new Error('Detector input must not contain public label columns.')
  }
}

export function normalizeOfficialCsv(text, label = 'Official timeseries') {
  const { columns, rows } = parseCsvText(text, label)
  assertOfficialTimeseriesColumns(columns)
  const timestampIndex = columns.indexOf('timestamp')
  const normalizedRows = rows.map((row) =>
    row.map((cell, index) =>
      index === timestampIndex ? normalizeUtcTimestamp(cell) : cell,
    ),
  )
  return serializeCsv(columns, normalizedRows)
}

export function normalizeUtcTimestamp(value) {
  const trimmed = value.trim()
  if (/(?:Z|[+-]\d{2}:\d{2})$/i.test(trimmed)) return trimmed
  const isoLike = trimmed.replace(' ', 'T')
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(isoLike)) {
    return `${isoLike}Z`
  }
  return trimmed
}

export function validateEquipmentTokenSet(code, tokens) {
  if (
    tokens.length === 0 ||
    new Set(tokens).size !== tokens.length ||
    tokens.some((token) => !OFFICIAL_EQUIPMENT_TOKENS.has(token))
  ) {
    return 'contains a duplicate, empty, or non-official token'
  }
  if (code === 'C01') {
    const electrolyzers = tokens.filter((token) => /^ELZ[1-3]$/.test(token))
    return tokens.length === 4 &&
      tokens.includes('BESS') &&
      tokens.includes('PCC') &&
      electrolyzers.length === 2
      ? null
      : 'must be BESS,PCC plus two distinct ELZ1/ELZ2/ELZ3 tokens'
  }
  if (code === 'C02') {
    return tokens.length === 1 && /^ELZ[1-3]$/.test(tokens[0])
      ? null
      : 'must be exactly one of ELZ1, ELZ2, or ELZ3'
  }
  const configured = EQUIPMENT_TOKENS_BY_CODE.get(code)
  if (configured === undefined) return null
  const expected = new Set(configured)
  const actual = new Set(tokens)
  return actual.size === expected.size && [...expected].every((token) => actual.has(token))
    ? null
    : `must be exactly [${[...expected].join(',')}] for ${code}`
}
