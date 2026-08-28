import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { assertExactCleanCandidate, currentCandidate } from './lib/candidate.mjs'
import { ANOMALY_CODES } from './lib/official-contract.mjs'
import { EVALUATION_WINDOWS, OFFICIAL_SOURCES, sha256 } from './lib/official-sources.mjs'
import { computeMetrics, toInstant } from './lib/metrics.mjs'
import {
  createGeneratedRunDirectory,
  ensureIgnoredOutputPath,
  repositoryRelativePath,
  writeFileAtomic,
} from './lib/output.mjs'

const evaluatorPath = resolve(fileURLToPath(new URL('.', import.meta.url)), 'evaluate.mjs')
const RED_THRESHOLD = 0.15

function parseArguments(argv) {
  const known = new Set(['--official-data', '--output'])
  const values = new Map()
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === '--help') return { help: true }
    if (!known.has(flag)) throw new Error(`Unknown argument: ${flag}`)
    if (values.has(flag)) throw new Error(`Duplicate argument: ${flag}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
    values.set(flag, value)
    index += 1
  }
  const officialData = values.get('--official-data')
  if (!officialData) throw new Error('--official-data is required')
  return {
    help: false,
    officialData: resolve(officialData),
    output: values.has('--output') ? resolve(values.get('--output')) : null,
  }
}

function printUsage() {
  console.log(
    'Usage: node validation/overfit-sentinel.mjs --official-data <data-directory> [--output <new-generated-report-path>]',
  )
}

function runEvaluation({ officialData, set, output }) {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(
      process.execPath,
      [evaluatorPath, '--mode', 'local', '--set', set, '--official-data', officialData, '--output', output],
      { timeout: 30 * 60 * 1000, windowsHide: true },
      (error) => {
        if (error) {
          rejectPromise(new Error(`Fresh ${set} evaluation failed.`))
          return
        }
        resolvePromise()
      },
    )
  })
}

function assertFiniteNumbers(value, label) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${label} contains a non-finite number.`)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertFiniteNumbers(entry, `${label}[${index}]`))
    return
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      assertFiniteNumbers(entry, `${label}.${key}`)
    }
  }
}

function hasExactKeys(value, keys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
}

function hasCodeKeys(value) {
  return hasExactKeys(value, ANOMALY_CODES)
}

function codeCountsMatch(value, expected) {
  return hasCodeKeys(value) && ANOMALY_CODES.every((code) => value[code] === expected[code])
}

function sourceIdentityMatches(value, expected) {
  return hasExactKeys(
    value,
    ['filename', 'sha256', 'rowCount', 'fieldCount', 'firstTimestamp', 'lastTimestamp'],
  ) &&
    value.filename === expected.filename && value.sha256 === expected.sha256 &&
    value.rowCount === expected.rowCount && value.fieldCount === 69 &&
    value.firstTimestamp === expected.firstTimestamp &&
    value.lastTimestamp === expected.lastTimestamp
}

function labelIdentityMatches(value, expected) {
  return hasExactKeys(
    value,
    [
      'filename', 'sha256', 'rowCount', 'eventCount', 'uniqueEventIdCount',
      'firstStart', 'lastEnd', 'byCode',
    ],
  ) &&
    value.filename === expected.filename && value.sha256 === expected.sha256 &&
    value.rowCount === expected.rowCount && value.eventCount === expected.eventCount &&
    value.uniqueEventIdCount === expected.eventCount &&
    value.firstStart === expected.firstStart && value.lastEnd === expected.lastEnd &&
    codeCountsMatch(value.byCode, expected.byCode)
}

function liveProvenanceMatches(value, fingerprint, runtime, expectedModelVersion) {
  return hasExactKeys(
    value,
    [
      'mode', 'source', 'generatedAt', 'datasetFingerprint', 'modelVersion',
      'ruleVersion', 'configurationVersion', 'limitations',
    ],
  ) &&
    value.mode === 'LIVE_ANALYSIS' &&
    typeof value.source === 'string' && value.source.trim() !== '' &&
    Number.isFinite(toInstant(value.generatedAt)) &&
    value.datasetFingerprint === fingerprint &&
    value.modelVersion === expectedModelVersion &&
    value.ruleVersion === runtime.ruleVersion &&
    value.configurationVersion === runtime.configurationVersion &&
    Array.isArray(value.limitations) &&
    value.limitations.every((entry) => typeof entry === 'string' && entry.trim() !== '')
}

function expectedUtcDays(source, window) {
  const firstDay = window.minimumUtcDay ?? source.timeseries.firstTimestamp.slice(0, 10)
  const count = window.rowCount / 1_440
  if (!Number.isSafeInteger(count) || count <= 0) return []
  const first = toInstant(`${firstDay}T00:00:00Z`)
  return Array.from({ length: count }, (_, index) =>
    new Date(first + index * 86_400_000).toISOString().slice(0, 10),
  )
}

function evaluationDatasetMatches(value, expectedSet, source, window) {
  const runtime = value.predictions?.runtime
  const days = expectedUtcDays(source, window)
  const chunks = value.dataset?.chunks
  const expectedPredictionKeys = ['rawCount', 'mergedCount', 'runtime', 'byCode']
  if (
    !hasExactKeys(
      value.dataset,
      [
        'source', 'labels', 'evaluatedWindow', 'publicLabelsUsedAsDetectorInput',
        'labelAccessPhase', 'chunks',
      ],
    ) ||
    !sourceIdentityMatches(value.dataset.source, source.timeseries) ||
    !labelIdentityMatches(value.dataset.labels, source.labels) ||
    !hasExactKeys(
      value.dataset.evaluatedWindow,
      ['complete', 'firstUtcDay', 'lastUtcDay', 'rowCount', 'labelEventCount'],
    ) ||
    value.dataset.evaluatedWindow.complete !== true ||
    value.dataset.evaluatedWindow.firstUtcDay !== days[0] ||
    value.dataset.evaluatedWindow.lastUtcDay !== days.at(-1) ||
    value.dataset.evaluatedWindow.rowCount !== window.rowCount ||
    value.dataset.evaluatedWindow.labelEventCount !== window.labelCount ||
    value.dataset.publicLabelsUsedAsDetectorInput !== false ||
    value.dataset.labelAccessPhase !== 'evaluation_only_after_analysis; labels never detector input' ||
    !hasExactKeys(value.groundTruth, ['count', 'totalPublicLabels', 'byCode']) ||
    value.groundTruth.count !== window.labelCount ||
    value.groundTruth.totalPublicLabels !== source.labels.eventCount ||
    !codeCountsMatch(value.groundTruth.byCode, window.byCode) ||
    !hasExactKeys(value.predictions, expectedPredictionKeys) ||
    !hasExactKeys(runtime, ['modelVersion', 'ruleVersion', 'configurationVersion']) ||
    !(runtime.modelVersion === null ||
      (typeof runtime.modelVersion === 'string' && runtime.modelVersion.trim() !== '')) ||
    typeof runtime.ruleVersion !== 'string' || runtime.ruleVersion.trim() === '' ||
    typeof runtime.configurationVersion !== 'string' ||
    runtime.configurationVersion.trim() === '' ||
    !Number.isSafeInteger(value.predictions.rawCount) || value.predictions.rawCount < 0 ||
    !Number.isSafeInteger(value.predictions.mergedCount) ||
    value.predictions.mergedCount < 0 ||
    value.predictions.mergedCount > value.predictions.rawCount ||
    !hasCodeKeys(value.predictions.byCode) ||
    ANOMALY_CODES.some((code) =>
      !Number.isSafeInteger(value.predictions.byCode[code]) ||
      value.predictions.byCode[code] < 0) ||
    Object.values(value.predictions.byCode).reduce((total, count) => total + count, 0) !==
      value.predictions.mergedCount ||
    !Array.isArray(chunks) || chunks.length !== days.length
  ) return false

  let importedRows = 0
  let rawPredictions = 0
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index]
    if (
      !hasExactKeys(
        chunk,
        [
          'day', 'sourceFilename', 'rowCount', 'predictionCount', 'fingerprint',
          'importProvenance', 'analysisRunId', 'analysisProvenance',
        ],
      ) ||
      chunk.day !== days[index] ||
      chunk.sourceFilename !== `${expectedSet}-${days[index]}.csv` ||
      chunk.rowCount !== 1_440 ||
      !Number.isSafeInteger(chunk.predictionCount) || chunk.predictionCount < 0 ||
      typeof chunk.fingerprint !== 'string' ||
      !/^sha256:[a-f0-9]{64}$/.test(chunk.fingerprint) ||
      typeof chunk.analysisRunId !== 'string' || chunk.analysisRunId.trim() === '' ||
      !liveProvenanceMatches(chunk.importProvenance, chunk.fingerprint, runtime, null) ||
      !liveProvenanceMatches(
        chunk.analysisProvenance,
        chunk.fingerprint,
        runtime,
        runtime.modelVersion,
      )
    ) return false
    importedRows += chunk.rowCount
    rawPredictions += chunk.predictionCount
  }
  return importedRows === window.rowCount && rawPredictions === value.predictions.rawCount
}

function evaluationMetricsMatch(metrics) {
  const nonNegativeInteger = (value) => Number.isSafeInteger(value) && value >= 0
  const unitInterval = (value) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
  const eventMetricsMatch = (value, keys) => {
    if (
      !hasExactKeys(value, keys) ||
      !['tp', 'fp', 'fn'].every((key) => nonNegativeInteger(value[key])) ||
      !['precision', 'recall', 'f1'].every((key) => unitInterval(value[key]))
    ) return false
    const derived = computeMetrics(value)
    return ['precision', 'recall', 'f1'].every((key) => value[key] === derived[key])
  }
  const timingSummaryMatches = (summary) => {
    if (!hasExactKeys(summary, ['count', 'meanMinutes', 'meanAbsoluteMinutes']) ||
      !nonNegativeInteger(summary.count)) return false
    if (summary.count === 0) {
      return summary.meanMinutes === null && summary.meanAbsoluteMinutes === null
    }
    return typeof summary.meanMinutes === 'number' && Number.isFinite(summary.meanMinutes) &&
      typeof summary.meanAbsoluteMinutes === 'number' &&
      Number.isFinite(summary.meanAbsoluteMinutes) &&
      summary.meanAbsoluteMinutes >= Math.abs(summary.meanMinutes)
  }
  if (
    !hasExactKeys(metrics, ['overall', 'timing', 'classification', 'macro', 'byCode']) ||
    !eventMetricsMatch(metrics.overall, ['tp', 'fp', 'fn', 'precision', 'recall', 'f1']) ||
    !hasExactKeys(
      metrics.classification,
      [
        'matches', 'correctCode', 'detectionPrecision', 'detectionRecall',
        'detectionF1', 'classificationAccuracy', 'eventAccuracy',
      ],
    ) ||
    !['matches', 'correctCode'].every(
      (key) => nonNegativeInteger(metrics.classification[key]),
    ) ||
    metrics.classification.correctCode > metrics.classification.matches ||
    ![
      'detectionPrecision', 'detectionRecall', 'detectionF1',
      'classificationAccuracy', 'eventAccuracy',
    ].every((key) => unitInterval(metrics.classification[key])) ||
    !hasExactKeys(
      metrics.timing,
      ['firstDetectionDelay', 'startBoundaryError', 'endBoundaryError'],
    ) ||
    !hasExactKeys(metrics.macro, ['precision', 'recall', 'f1']) ||
    !['precision', 'recall', 'f1'].every((key) => unitInterval(metrics.macro[key])) ||
    !hasCodeKeys(metrics.byCode)
  ) return false
  const codeMetricsMatch = ANOMALY_CODES.every((code) =>
      eventMetricsMatch(
        metrics.byCode[code],
        ['code', 'groundTruth', 'predictions', 'tp', 'fp', 'fn', 'precision', 'recall', 'f1'],
      ) && metrics.byCode[code].code === code &&
      nonNegativeInteger(metrics.byCode[code].groundTruth) &&
      nonNegativeInteger(metrics.byCode[code].predictions))
  if (!Object.values(metrics.timing).every(timingSummaryMatches) || !codeMetricsMatch) return false
  return ['precision', 'recall', 'f1'].every((metric) =>
    metrics.macro[metric] === ANOMALY_CODES.reduce(
      (total, code) => total + metrics.byCode[code][metric],
      0,
    ) / ANOMALY_CODES.length,
  )
}

function evaluationMetricCountsMatch(value) {
  const { overall, timing, classification, byCode } = value.metrics
  const classificationPrecision = value.predictions.mergedCount === 0
    ? 0
    : classification.matches / value.predictions.mergedCount
  const classificationRecall = value.groundTruth.count === 0
    ? 0
    : classification.matches / value.groundTruth.count
  const classificationF1 = classificationPrecision + classificationRecall === 0
    ? 0
    : (2 * classificationPrecision * classificationRecall) /
      (classificationPrecision + classificationRecall)
  return (
    overall.tp + overall.fn === value.groundTruth.count &&
    overall.tp + overall.fp === value.predictions.mergedCount &&
    timing.firstDetectionDelay.count <= overall.tp &&
    timing.startBoundaryError.count === overall.tp &&
    timing.endBoundaryError.count === overall.tp &&
    classification.matches <= Math.min(
      value.groundTruth.count,
      value.predictions.mergedCount,
    ) &&
    classification.detectionPrecision === classificationPrecision &&
    classification.detectionRecall === classificationRecall &&
    classification.detectionF1 === classificationF1 &&
    classification.classificationAccuracy === (
      classification.matches === 0 ? 0 : classification.correctCode / classification.matches
    ) &&
    classification.eventAccuracy === (
      value.groundTruth.count === 0 ? 0 : classification.correctCode / value.groundTruth.count
    ) &&
    ANOMALY_CODES.every((code) =>
      byCode[code].groundTruth === value.groundTruth.byCode[code] &&
      byCode[code].predictions === value.predictions.byCode[code] &&
      byCode[code].tp + byCode[code].fn === byCode[code].groundTruth &&
      byCode[code].tp + byCode[code].fp === byCode[code].predictions) &&
    ANOMALY_CODES.reduce((total, code) => total + byCode[code].tp, 0) === overall.tp &&
    ANOMALY_CODES.reduce((total, code) => total + byCode[code].fp, 0) === overall.fp &&
    ANOMALY_CODES.reduce((total, code) => total + byCode[code].fn, 0) === overall.fn
  )
}

export function assertEvaluationIdentity(value, expectedSet, expectedCommit) {
  const window = EVALUATION_WINDOWS[expectedSet]
  const source = OFFICIAL_SOURCES[window.source]
  assertFiniteNumbers(value?.metrics, `${expectedSet} metrics`)
  assertFiniteNumbers(value?.parameters, `${expectedSet} configuration`)
  assertFiniteNumbers(value?.dataset, `${expectedSet} dataset`)
  if (
    value?.schemaVersion !== 2 ||
    value.reportKind !== 'h2_official_validation_evaluation' ||
    value.contractVersion !== 'event-match-v2' ||
    value.set !== expectedSet ||
    value.candidateCommit !== expectedCommit ||
    value.trackedTreeClean !== true ||
    typeof value.evaluationRunId !== 'string' || value.evaluationRunId.trim() === '' ||
    !hasExactKeys(
      value.parameters,
      [
        'graceMinutes', 'mergeGapMinutes', 'limitDays', 'minimumUtcDay', 'matching',
        'chunking', 'firstDetectionDelayMinutes', 'boundaryErrorMinutes',
        'zeroDenominatorMetrics', 'macroAveraging',
      ],
    ) ||
    !Number.isFinite(value.parameters.graceMinutes) ||
    value.parameters.graceMinutes < 0 || value.parameters.graceMinutes > 120 ||
    value.parameters.mergeGapMinutes !== 2 || value.parameters.limitDays !== 0 ||
    value.parameters?.minimumUtcDay !== window.minimumUtcDay ||
    value.parameters.matching !==
      'greedy one-to-one same-code interval overlap with symmetric grace' ||
    value.parameters.chunking !==
      'UTC calendar day; adjacent same-code predictions merge across boundaries' ||
    value.parameters.firstDetectionDelayMinutes !==
      'prediction first_detection_time minus ground-truth start; negative means early warning' ||
    value.parameters.boundaryErrorMinutes !==
      'prediction boundary minus corresponding ground-truth boundary' ||
    value.parameters.zeroDenominatorMetrics !==
      'precision=0 when tp+fp=0; recall=0 when tp+fn=0; f1=0 when precision+recall=0' ||
    value.parameters.macroAveraging !==
      'unweighted arithmetic mean across C01-C07 precision, recall, and f1' ||
    !evaluationDatasetMatches(value, expectedSet, source, window) ||
    !evaluationMetricsMatch(value.metrics) ||
    !evaluationMetricCountsMatch(value) ||
    !hasExactKeys(value.provenance, ['generatedAt', 'tool', 'limitations']) ||
    !Number.isFinite(toInstant(value.provenance.generatedAt)) ||
    value.provenance.tool !== 'validation/evaluate.mjs' ||
    !Array.isArray(value.provenance.limitations) || value.provenance.limitations.length === 0
  ) throw new Error(`The ${expectedSet} evaluation report has stale or mismatched identity.`)
  return value
}

function readEvaluation(path, expectedSet, expectedCommit) {
  return assertEvaluationIdentity(
    JSON.parse(readFileSync(path, 'utf8')),
    expectedSet,
    expectedCommit,
  )
}

export async function runOverfitSentinel(options) {
  const candidate = currentCandidate()
  if (!candidate.trackedTreeClean) throw new Error('Overfit evidence requires a clean working tree.')
  const outputDirectory = createGeneratedRunDirectory('overfit-sentinel', candidate.commit)
  const validationPath = resolve(outputDirectory, 'evaluate-validation.json')
  const trainPath = resolve(outputDirectory, 'evaluate-train-last-90.json')

  assertExactCleanCandidate(candidate.commit)
  await runEvaluation({ officialData: options.officialData, set: 'validation', output: validationPath })
  assertExactCleanCandidate(candidate.commit)
  await runEvaluation({ officialData: options.officialData, set: 'train-last-90', output: trainPath })
  assertExactCleanCandidate(candidate.commit)

  const validationBytes = readFileSync(validationPath)
  const trainBytes = readFileSync(trainPath)
  const validation = readEvaluation(validationPath, 'validation', candidate.commit)
  const train = readEvaluation(trainPath, 'train-last-90', candidate.commit)
  if (validation.evaluationRunId === train.evaluationRunId) {
    throw new Error('Fresh evaluator reports require distinct evaluation run IDs.')
  }
  const validationF1 = validation.metrics.overall.f1
  const trainF1 = train.metrics.overall.f1
  const absoluteDelta = Math.abs(validationF1 - trainF1)
  if (![validationF1, trainF1, absoluteDelta].every(Number.isFinite)) {
    throw new Error('Overfit metrics must be finite.')
  }
  const red = absoluteDelta > RED_THRESHOLD
  const report = {
    schemaVersion: 2,
    reportKind: 'h2_overfit_sentinel',
    contractVersion: 'overfit-sentinel-v2',
    candidateCommit: candidate.commit,
    threshold: { absoluteF1DeltaRedAbove: RED_THRESHOLD },
    windows: {
      validation: {
        evaluationRunId: validation.evaluationRunId,
        report: repositoryRelativePath(validationPath),
        reportSha256: sha256(validationBytes),
        source: validation.dataset.source,
        labels: validation.dataset.labels,
        evaluatedWindow: validation.dataset.evaluatedWindow,
        chunks: validation.dataset.chunks,
        groundTruth: validation.groundTruth,
        runtime: validation.predictions.runtime,
        parameters: validation.parameters,
        metrics: validation.metrics,
      },
      trainLast90: {
        evaluationRunId: train.evaluationRunId,
        report: repositoryRelativePath(trainPath),
        reportSha256: sha256(trainBytes),
        source: train.dataset.source,
        labels: train.dataset.labels,
        evaluatedWindow: train.dataset.evaluatedWindow,
        chunks: train.dataset.chunks,
        groundTruth: train.groundTruth,
        runtime: train.predictions.runtime,
        parameters: train.parameters,
        metrics: train.metrics,
      },
    },
    result: { validationF1, trainLast90F1: trainF1, absoluteDelta, red },
    provenance: {
      generatedAt: new Date().toISOString(),
      tool: 'validation/overfit-sentinel.mjs',
      limitations: [
        'The train-last-90 public window is a disjoint sentinel window, not a hidden or organizer test set.',
        'The verdict compares local event-level F1 values under event-match-v2 and is not an organizer score.',
      ],
    },
  }
  assertFiniteNumbers(report, 'Combined overfit report')
  assertExactCleanCandidate(candidate.commit)
  const outputPath = options.output === null || options.output === undefined
    ? resolve(outputDirectory, 'overfit-sentinel.json')
    : ensureIgnoredOutputPath(options.output)
  writeFileAtomic(outputPath, `${JSON.stringify(report, null, 2)}\n`)
  assertExactCleanCandidate(candidate.commit)
  return { report, outputPath }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath.toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  try {
    const options = parseArguments(process.argv.slice(2))
    if (options.help) {
      printUsage()
    } else {
      const { report, outputPath } = await runOverfitSentinel(options)
      console.log(JSON.stringify({
        status: report.result.red ? 'red' : 'green',
        candidateCommit: report.candidateCommit,
        absoluteF1Delta: report.result.absoluteDelta,
        reportPath: repositoryRelativePath(outputPath),
        organizerScore: false,
      }))
      if (report.result.red) process.exitCode = 1
    }
  } catch (error) {
    console.error(`ERROR ${error instanceof Error ? error.message : 'Overfit sentinel failed.'}`)
    process.exitCode = 1
  }
}
