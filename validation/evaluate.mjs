import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { currentCandidate } from './lib/candidate.mjs'
import { decodeUtf8Strict, parseCsvText } from './lib/csv.mjs'
import {
  ANOMALY_CODES,
  normalizeUtcTimestamp,
} from './lib/official-contract.mjs'
import {
  EVALUATION_WINDOWS,
  OFFICIAL_SOURCES,
  assertLabelSourceIdentity,
  sha256,
} from './lib/official-sources.mjs'
import { streamOfficialTimeseriesWindow } from './lib/official-timeseries.mjs'
import { freeLoopbackPort, requestEnvelope, startLauncher } from './lib/launcher.mjs'
import { classifyEvents, matchEvents, mergePredictions, toInstant } from './lib/metrics.mjs'
import {
  createGeneratedRunDirectory,
  ensureIgnoredOutputPath,
  repositoryRelativePath,
  writeFileAtomic,
} from './lib/output.mjs'
import { assertAnalysisRun, assertImportedDataset } from './lib/runtime-provenance.mjs'

const directory = dirname(fileURLToPath(import.meta.url))
function parseArguments(argv) {
  const known = new Set([
    '--mode', '--set', '--official-data', '--limit-days', '--grace-minutes', '--output',
  ])
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
  const mode = values.get('--mode') ?? 'local'
  if (mode !== 'local') throw new Error('--mode must be local')
  const set = values.get('--set') ?? 'validation'
  if (!(set in EVALUATION_WINDOWS)) throw new Error('--set must be validation or train-last-90')
  const officialData = values.get('--official-data')
  if (!officialData) throw new Error('--official-data is required')
  const limitDaysText = values.get('--limit-days') ?? '0'
  const graceMinutesText = values.get('--grace-minutes') ?? '10'
  if (!/^\d+$/.test(limitDaysText) || !/^\d+(?:\.\d+)?$/.test(graceMinutesText)) {
    throw new Error('Evaluation numeric arguments must be decimal values.')
  }
  const limitDays = Number(limitDaysText)
  const graceMinutes = Number(graceMinutesText)
  if (!Number.isSafeInteger(limitDays) || limitDays < 0) {
    throw new Error('--limit-days must be a non-negative integer')
  }
  if (!Number.isFinite(graceMinutes) || graceMinutes < 0 || graceMinutes > 120) {
    throw new Error('--grace-minutes must be between 0 and 120')
  }
  return {
    help: false,
    mode,
    set,
    officialData: resolve(officialData),
    limitDays,
    graceMinutes,
    output: values.has('--output') ? resolve(values.get('--output')) : null,
  }
}

function printUsage() {
  console.log([
    'Usage:',
    '  node validation/evaluate.mjs --mode local --official-data <data-directory>',
    '    [--set validation|train-last-90] [--limit-days <count>]',
    '    [--grace-minutes <count>] [--output <new-generated-report-path>]',
  ].join('\n'))
}

function officialFile(directoryPath, filename) {
  const path = resolve(directoryPath, filename)
  if (!existsSync(path)) throw new Error(`Required official file is missing: ${filename}`)
  return path
}

function loadGroundTruth(officialData, contract) {
  const bytes = readFileSync(officialFile(officialData, contract.filename))
  const { columns, rows } = parseCsvText(
    decodeUtf8Strict(bytes, 'Official labels'),
    'Official labels',
  )
  const index = new Map(columns.map((column, columnIndex) => [column, columnIndex]))
  for (const column of ['event_id', 'anomaly_code', 'start_time', 'end_time']) {
    if (!index.has(column)) throw new Error(`Official labels are missing ${column}.`)
  }
  const events = rows.map((row) => ({
    id: row[index.get('event_id')].trim(),
    code: row[index.get('anomaly_code')].trim(),
    startTime: normalizeUtcTimestamp(row[index.get('start_time')]),
    endTime: normalizeUtcTimestamp(row[index.get('end_time')]),
  }))
  for (const event of events) {
    if (
      !ANOMALY_CODES.includes(event.code) ||
      !Number.isFinite(toInstant(event.startTime)) ||
      !Number.isFinite(toInstant(event.endTime)) ||
      toInstant(event.startTime) > toInstant(event.endTime)
    ) throw new Error('Official labels contain an invalid event.')
  }
  const identity = assertLabelSourceIdentity({ bytes, rowCount: rows.length, events, contract })
  return { bytes, events, identity }
}

export function labelsInWindow(events, chunks) {
  if (chunks.length === 0) return []
  const start = toInstant(`${chunks[0].day}T00:00:00Z`)
  const end = toInstant(`${chunks.at(-1).day}T23:59:59.999Z`)
  return events.filter((event) =>
    toInstant(event.startTime) <= end && toInstant(event.endTime) >= start,
  )
}

async function collectPredictions(predictionSource, set) {
  const webPort = await freeLoopbackPort()
  const analyticsPort = await freeLoopbackPort()
  const session = await startLauncher({ webPort, analyticsPort })
  const predictions = []
  const importedChunks = []
  let runtimeIdentity = null
  let streamedSource = null
  try {
    streamedSource = await streamOfficialTimeseriesWindow({
      ...predictionSource,
      onChunk: async (chunk) => {
        const filename = `${set}-${chunk.day}.csv`
        const fingerprint = sha256(Buffer.from(chunk.text, 'utf8'))
        const imported = await requestEnvelope(
          session.ready.analyticsUrl,
          '/api/v1/h2-sentinel/datasets:import',
          { filename, text: chunk.text },
        )
        const importedIdentity = assertImportedDataset(imported, {
          filename,
          rowCount: chunk.rowCount,
          fingerprint,
        })
        const run = await requestEnvelope(
          session.ready.analyticsUrl,
          '/api/v1/h2-sentinel/datasets:analyze',
          { datasetId: imported.dataset.datasetId },
        )
        const analysisIdentity = assertAnalysisRun(run, imported)
        if (run.events.some((event) => !Number.isFinite(toInstant(event.firstDetectionTime)))) {
          throw new Error('Analysis events require valid firstDetectionTime provenance.')
        }
        const { provenance: analysisProvenance } = analysisIdentity
        const currentRuntimeIdentity = JSON.stringify({
          modelVersion: analysisProvenance.modelVersion,
          ruleVersion: analysisProvenance.ruleVersion,
          configurationVersion: analysisProvenance.configurationVersion,
        })
        if (runtimeIdentity !== null && runtimeIdentity !== currentRuntimeIdentity) {
          throw new Error('Detector runtime identity changed during one evaluation run.')
        }
        runtimeIdentity = currentRuntimeIdentity
        importedChunks.push({
          day: chunk.day,
          sourceFilename: filename,
          rowCount: imported.dataset.rowCount,
          predictionCount: run.events.length,
          fingerprint,
          importProvenance: importedIdentity.provenance,
          analysisRunId: run.runId,
          analysisProvenance: analysisIdentity.provenance,
        })
        predictions.push(...run.events)
      },
    })
  } finally {
    const stopped = await session.stop()
    if (stopped.timedOut) throw new Error('The local launcher required forced cleanup.')
  }
  return {
    predictions,
    importedChunks,
    runtime: runtimeIdentity === null ? null : JSON.parse(runtimeIdentity),
    timeseriesIdentity: streamedSource.identity,
    selectedWindow: streamedSource.selectedWindow,
  }
}

export async function collectPredictionsThenLoadLabels({
  predictionSource,
  set,
  officialData,
  labelContract,
  collectPredictionsFn = collectPredictions,
  loadGroundTruthFn = loadGroundTruth,
}) {
  const predictionResult = await collectPredictionsFn(predictionSource, set)
  const labels = loadGroundTruthFn(officialData, labelContract)
  return {
    ...predictionResult,
    labels,
    groundTruth: labelsInWindow(labels.events, predictionResult.importedChunks),
  }
}

function codeCounts(events) {
  return Object.fromEntries(
    ANOMALY_CODES.map((code) => [code, events.filter((event) => event.code === code).length]),
  )
}

function macroMetrics(byCode) {
  return Object.fromEntries(
    ['precision', 'recall', 'f1'].map((metric) => [
      metric,
      ANOMALY_CODES.reduce((total, code) => total + byCode[code][metric], 0) /
        ANOMALY_CODES.length,
    ]),
  )
}

export async function evaluateOfficialData(options) {
  const candidate = currentCandidate()
  if (!candidate.trackedTreeClean) throw new Error('Official evaluation requires a clean working tree.')
  const window = EVALUATION_WINDOWS[options.set]
  const sourceContract = OFFICIAL_SOURCES[window.source]
  const timeseriesPath = officialFile(
    options.officialData,
    sourceContract.timeseries.filename,
  )
  const {
    predictions,
    importedChunks,
    runtime,
    labels,
    groundTruth,
    timeseriesIdentity,
    selectedWindow,
  } = await collectPredictionsThenLoadLabels({
    predictionSource: {
      path: timeseriesPath,
      contract: sourceContract.timeseries,
      minimumUtcDay: window.minimumUtcDay,
      limitDays: options.limitDays,
    },
    set: options.set,
    officialData: options.officialData,
    labelContract: sourceContract.labels,
  })
  if (importedChunks.length === 0 || selectedWindow.rowCount === 0) {
    throw new Error('No UTC day remains after applying the requested window.')
  }
  const selectedRowCount = importedChunks.reduce((total, chunk) => total + chunk.rowCount, 0)
  if (selectedRowCount !== selectedWindow.rowCount) {
    throw new Error('Imported chunk rows do not match the streamed evaluation window.')
  }
  if (
    options.limitDays === 0 &&
    (selectedRowCount !== window.rowCount || groundTruth.length !== window.labelCount ||
      ANOMALY_CODES.some((code) => codeCounts(groundTruth)[code] !== window.byCode[code]))
  ) throw new Error('The complete evaluation window does not match the official row and label contract.')
  const merged = mergePredictions(predictions.map((event) => ({
    id: event.eventId,
    code: event.code,
    startTime: event.startTime,
    endTime: event.endTime,
    firstDetectionTime: event.firstDetectionTime,
  })))
  const matching = matchEvents({ groundTruth, predictions: merged, graceMinutes: options.graceMinutes })
  const classification = classifyEvents({
    groundTruth,
    predictions: merged,
    graceMinutes: options.graceMinutes,
  })
  const byCodeMetrics = Object.fromEntries(
    matching.byCode.map((entry) => [entry.code, entry]),
  )
  const completedCandidate = currentCandidate()
  if (completedCandidate.commit !== candidate.commit || !completedCandidate.trackedTreeClean) {
    throw new Error('Candidate state changed during official evaluation.')
  }
  const report = {
    schemaVersion: 2,
    reportKind: 'h2_official_validation_evaluation',
    contractVersion: 'event-match-v2',
    evaluationRunId: randomUUID(),
    candidateCommit: candidate.commit,
    trackedTreeClean: true,
    set: options.set,
    parameters: {
      graceMinutes: options.graceMinutes,
      mergeGapMinutes: 2,
      limitDays: options.limitDays,
      minimumUtcDay: window.minimumUtcDay,
      matching: 'greedy one-to-one same-code interval overlap with symmetric grace',
      chunking: 'UTC calendar day; adjacent same-code predictions merge across boundaries',
      firstDetectionDelayMinutes: 'prediction first_detection_time minus ground-truth start; negative means early warning',
      boundaryErrorMinutes: 'prediction boundary minus corresponding ground-truth boundary',
      zeroDenominatorMetrics: 'precision=0 when tp+fp=0; recall=0 when tp+fn=0; f1=0 when precision+recall=0',
      macroAveraging: 'unweighted arithmetic mean across C01-C07 precision, recall, and f1',
      runtimeInputMapping: 'verified official 69-field UTC-day chunk submitted unchanged; no labels',
    },
    dataset: {
      source: timeseriesIdentity,
      labels: labels.identity,
      evaluatedWindow: {
        complete: options.limitDays === 0,
        firstUtcDay: selectedWindow.firstUtcDay,
        lastUtcDay: selectedWindow.lastUtcDay,
        rowCount: selectedRowCount,
        labelEventCount: groundTruth.length,
      },
      publicLabelsUsedAsDetectorInput: false,
      labelAccessPhase: 'evaluation_only_after_analysis; labels never detector input',
      chunks: importedChunks,
    },
    groundTruth: {
      count: groundTruth.length,
      totalPublicLabels: labels.events.length,
      byCode: codeCounts(groundTruth),
    },
    predictions: {
      rawCount: predictions.length,
      mergedCount: merged.length,
      runtime,
      byCode: codeCounts(merged),
    },
    metrics: {
      overall: {
        tp: matching.tp,
        fp: matching.fp,
        fn: matching.fn,
        precision: matching.precision,
        recall: matching.recall,
        f1: matching.f1,
      },
      timing: matching.timing,
      classification,
      macro: macroMetrics(byCodeMetrics),
      byCode: byCodeMetrics,
    },
    matches: matching.matches,
    unmatchedGroundTruth: matching.unmatchedGroundTruth,
    unmatchedPredictions: matching.unmatchedPredictions,
    provenance: {
      generatedAt: new Date().toISOString(),
      tool: 'validation/evaluate.mjs',
      limitations: [
        'This is a local public-data evaluation under the named event-matching contract, not an organizer score.',
        'The report contains relative source filenames and verified hashes, never workstation paths.',
        'A limited-day run is not comparable to a complete-window evaluation.',
      ],
    },
  }

  const outputPath = options.output === null || options.output === undefined
    ? resolve(createGeneratedRunDirectory('official-evaluation', candidate.commit), `evaluate-${options.set}.json`)
    : ensureIgnoredOutputPath(options.output)
  writeFileAtomic(outputPath, `${JSON.stringify(report, null, 2)}\n`)
  const writtenCandidate = currentCandidate()
  if (writtenCandidate.commit !== candidate.commit || !writtenCandidate.trackedTreeClean) {
    throw new Error('Candidate state changed while writing the official evaluation report.')
  }
  return { report, outputPath }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath.toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  try {
    const options = parseArguments(process.argv.slice(2))
    if (options.help) {
      printUsage()
    } else {
      const { report, outputPath } = await evaluateOfficialData(options)
      console.log(JSON.stringify({
        status: 'evaluated',
        set: report.set,
        candidateCommit: report.candidateCommit,
        metrics: report.metrics.overall,
        reportPath: repositoryRelativePath(outputPath),
        organizerScore: false,
      }))
    }
  } catch (error) {
    console.error(`ERROR ${error instanceof Error ? error.message : 'Evaluation failed.'}`)
    process.exitCode = 1
  }
}
