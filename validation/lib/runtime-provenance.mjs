import { toInstant } from './metrics.mjs'

export const REQUIRED_HUMAN_CONFIRMATION_DECLARATION = '所有操作建议均须人工确认'

const unsafeControlText = /(?:并非|不是|否认|无需|不需|不须|不必|免于|绕过).{0,12}(?:人工|确认)|(?:人工确认|确认).{0,8}(?:并非|不是|不再是).{0,8}(?:必需|必要|条件)|(?:自动|直接).{0,12}(?:执行|控制|下发|操作)|(?:系统|应用).{0,12}(?:可以|可|能够|将会).{0,12}(?:执行|控制|下发).{0,12}(?:设备|指令|操作)?|(?:无需|不经|绕过)人工确认/u
const standaloneDeclaration = new RegExp(
  `>\\s*${REQUIRED_HUMAN_CONFIRMATION_DECLARATION}\\s*<`,
  'u',
)

export function hasRequiredHumanConfirmation(value) {
  return value === REQUIRED_HUMAN_CONFIRMATION_DECLARATION
}

export function documentHasRequiredHumanConfirmation(value) {
  return typeof value === 'string' && standaloneDeclaration.test(value) &&
    !unsafeControlText.test(value)
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== ''
}

function sameArray(left, right) {
  return Array.isArray(left) && Array.isArray(right) &&
    left.length === right.length && left.every((entry, index) => entry === right[index])
}

function sameBaseProvenance(left, right) {
  return (
    left.mode === right.mode && left.source === right.source &&
    left.datasetFingerprint === right.datasetFingerprint &&
    left.ruleVersion === right.ruleVersion &&
    left.configurationVersion === right.configurationVersion &&
    sameArray(left.limitations, right.limitations)
  )
}

function hasOnlyKeys(value, allowedKeys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).every((key) => allowedKeys.includes(key))
}

const BASE_PROVENANCE_KEYS = [
  'mode', 'source', 'generatedAt', 'datasetFingerprint', 'ruleVersion',
  'configurationVersion', 'limitations',
]

function snapshotTimeRange(value, label) {
  const start = toInstant(value?.startTime)
  const end = toInstant(value?.endTime)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    throw new Error(`${label} time range is invalid.`)
  }
  return { startTime: value.startTime, endTime: value.endTime }
}

export function snapshotLiveProvenance(value, label) {
  if (
    value?.mode !== 'LIVE_ANALYSIS' || !nonEmptyString(value.source) ||
    typeof value.generatedAt !== 'string' ||
    !Number.isFinite(toInstant(value.generatedAt)) ||
    typeof value.datasetFingerprint !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(value.datasetFingerprint) ||
    !(value.modelVersion === undefined || value.modelVersion === null ||
      nonEmptyString(value.modelVersion)) ||
    !nonEmptyString(value.ruleVersion) || !nonEmptyString(value.configurationVersion) ||
    !Array.isArray(value.limitations) ||
    value.limitations.some((entry) => !nonEmptyString(entry))
  ) throw new Error(`${label} LIVE_ANALYSIS provenance is incomplete.`)
  return {
    mode: value.mode,
    source: value.source,
    generatedAt: value.generatedAt,
    datasetFingerprint: value.datasetFingerprint,
    modelVersion: value.modelVersion ?? null,
    ruleVersion: value.ruleVersion,
    configurationVersion: value.configurationVersion,
    limitations: [...value.limitations],
  }
}

export function assertImportedDataset(imported, { filename, rowCount, fingerprint }) {
  const dataset = imported?.dataset
  if (
    dataset?.mode !== 'LIVE_ANALYSIS' || !nonEmptyString(dataset.datasetId) ||
    dataset.sourceFilename !== filename ||
    dataset.rowCount !== rowCount || dataset.fingerprint !== fingerprint ||
    dataset.provenance?.datasetFingerprint !== fingerprint ||
    !hasOnlyKeys(dataset.provenance, [...BASE_PROVENANCE_KEYS, 'modelVersion'])
  ) throw new Error('Imported dataset identity does not match the submitted detector rows.')
  const timeRange = snapshotTimeRange(dataset.timeRange, 'Imported dataset')
  const provenance = snapshotLiveProvenance(dataset.provenance, 'Import')
  if (provenance.modelVersion !== null) {
    throw new Error('Import provenance must define the base identity before model execution.')
  }
  return {
    datasetId: dataset.datasetId,
    sourceFilename: dataset.sourceFilename,
    rowCount: dataset.rowCount,
    fingerprint: dataset.fingerprint,
    timeRange,
    provenance,
  }
}

export function assertAnalysisRun(run, imported) {
  const dataset = imported.dataset
  if (
    !nonEmptyString(run?.runId) || run?.status !== 'completed' ||
    run?.dataset?.datasetId !== dataset.datasetId ||
    run.dataset.mode !== 'LIVE_ANALYSIS' ||
    run.dataset.sourceFilename !== dataset.sourceFilename ||
    run.dataset.rowCount !== dataset.rowCount ||
    run.dataset.fingerprint !== dataset.fingerprint ||
    run.provenance?.datasetFingerprint !== dataset.fingerprint ||
    run.dataset.timeRange?.startTime !== dataset.timeRange?.startTime ||
    run.dataset.timeRange?.endTime !== dataset.timeRange?.endTime ||
    !hasOnlyKeys(run.provenance, [...BASE_PROVENANCE_KEYS, 'modelVersion'])
  ) throw new Error('Analysis run identity does not match the verified import.')
  const timeRange = snapshotTimeRange(run.dataset.timeRange, 'Analysis run')
  const importProvenance = snapshotLiveProvenance(dataset.provenance, 'Import')
  const analysisProvenance = snapshotLiveProvenance(run.provenance, 'Analysis')
  const startedAt = toInstant(run.startedAt)
  const completedAt = toInstant(run.completedAt)
  if (
    !Number.isFinite(startedAt) || !Number.isFinite(completedAt) ||
    startedAt > completedAt || run.startedAt !== analysisProvenance.generatedAt ||
    importProvenance.modelVersion !== null ||
    !nonEmptyString(analysisProvenance.modelVersion) ||
    importProvenance.generatedAt !== analysisProvenance.generatedAt ||
    !sameBaseProvenance(importProvenance, analysisProvenance)
  ) throw new Error('Analysis provenance must inherit the exact verified import identity.')
  return {
    runId: run.runId,
    status: run.status,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    sourceFilename: run.dataset.sourceFilename,
    rowCount: run.dataset.rowCount,
    fingerprint: run.dataset.fingerprint,
    timeRange,
    provenance: analysisProvenance,
  }
}

export function assertRendererProvenance(
  value,
  analysisProvenance,
  completedAt,
  rendererVersion,
  label,
) {
  const expectedKeys = [
    'mode', 'source', 'generatedAt', 'datasetFingerprint', 'modelVersion',
    'ruleVersion', 'configurationVersion', 'rendererVersion', 'limitations',
  ].sort()
  const actualKeys = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? Object.keys(value).sort()
    : []
  const renderer = snapshotLiveProvenance(value, label)
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index]) ||
    value.rendererVersion !== rendererVersion ||
    renderer.generatedAt !== completedAt ||
    renderer.modelVersion !== analysisProvenance.modelVersion ||
    !sameBaseProvenance(renderer, analysisProvenance)
  ) throw new Error(`${label} must inherit the exact analysis provenance and renderer identity.`)
  return { ...renderer, rendererVersion }
}
