import { toInstant } from './metrics.mjs'

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== ''
}

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
    dataset.provenance?.datasetFingerprint !== fingerprint
  ) throw new Error('Imported dataset identity does not match the submitted detector rows.')
  const timeRange = snapshotTimeRange(dataset.timeRange, 'Imported dataset')
  return {
    datasetId: dataset.datasetId,
    sourceFilename: dataset.sourceFilename,
    rowCount: dataset.rowCount,
    fingerprint: dataset.fingerprint,
    timeRange,
    provenance: snapshotLiveProvenance(dataset.provenance, 'Import'),
  }
}

export function assertAnalysisRun(run, imported) {
  const dataset = imported.dataset
  if (
    !nonEmptyString(run?.runId) || run?.dataset?.datasetId !== dataset.datasetId ||
    run.dataset.mode !== 'LIVE_ANALYSIS' ||
    run.dataset.sourceFilename !== dataset.sourceFilename ||
    run.dataset.rowCount !== dataset.rowCount ||
    run.dataset.fingerprint !== dataset.fingerprint ||
    run.provenance?.datasetFingerprint !== dataset.fingerprint ||
    run.dataset.timeRange?.startTime !== dataset.timeRange?.startTime ||
    run.dataset.timeRange?.endTime !== dataset.timeRange?.endTime
  ) throw new Error('Analysis run identity does not match the verified import.')
  const timeRange = snapshotTimeRange(run.dataset.timeRange, 'Analysis run')
  return {
    runId: run.runId,
    sourceFilename: run.dataset.sourceFilename,
    rowCount: run.dataset.rowCount,
    fingerprint: run.dataset.fingerprint,
    timeRange,
    provenance: snapshotLiveProvenance(run.provenance, 'Analysis'),
  }
}
