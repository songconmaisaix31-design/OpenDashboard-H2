import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { decodeUtf8Strict, parseCsvText, serializeCsv } from './lib/csv.mjs'
import { currentCandidate } from './lib/candidate.mjs'
import {
  ANOMALY_CODES,
  assertOfficialTimeseriesColumns,
  normalizeOfficialCsv,
  normalizeUtcTimestamp,
  repositoryRoot,
} from './lib/official-contract.mjs'
import { freeLoopbackPort, requestEnvelope, startLauncher } from './lib/launcher.mjs'
import { classifyEvents, matchEvents, mergePredictions, toInstant } from './lib/metrics.mjs'
import { ensureIgnoredOutputPath, repositoryRelativePath } from './lib/output.mjs'

const directory = dirname(fileURLToPath(import.meta.url))
const SET_PRESETS = {
  validation: {
    timeseries: '02_validation_timeseries.csv',
    labels: '05_validation_event_labels.csv',
    minDay: null,
  },
  'train-last-90': {
    timeseries: '01_train_timeseries.csv',
    labels: '04_train_event_labels.csv',
    minDay: '2025-10-03',
  },
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

function parseArguments(argv) {
  const known = new Set([
    '--mode',
    '--set',
    '--official-data',
    '--limit-days',
    '--grace-minutes',
    '--output',
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
  if (!(set in SET_PRESETS)) {
    throw new Error('--set must be validation or train-last-90')
  }
  const officialData = values.get('--official-data')
  if (!officialData) throw new Error('--official-data is required')
  const limitDays = Number(values.get('--limit-days') ?? 0)
  const graceMinutes = Number(values.get('--grace-minutes') ?? 10)
  if (!Number.isInteger(limitDays) || limitDays < 0) {
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
    output: values.get('--output'),
  }
}

function printUsage() {
  console.log([
    'Usage:',
    '  node validation/evaluate.mjs --mode local --official-data <data-directory>',
    '    [--set validation|train-last-90] [--limit-days <count>]',
    '    [--grace-minutes <count>] [--output <ignored-report-path>]',
  ].join('\n'))
}

function officialFile(directoryPath, filename) {
  const path = resolve(directoryPath, filename)
  if (!existsSync(path)) throw new Error(`Required official file is missing: ${filename}`)
  return path
}

function loadGroundTruth(officialData, filename) {
  const bytes = readFileSync(officialFile(officialData, filename))
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
    if (!ANOMALY_CODES.includes(event.code)) {
      throw new Error('Official labels contain an anomaly code outside C01-C07.')
    }
    if (!Number.isFinite(toInstant(event.startTime)) || !Number.isFinite(toInstant(event.endTime))) {
      throw new Error('Official labels contain an invalid timestamp.')
    }
  }
  return { bytes, events }
}

function chunkRowsByUtcDay(columns, rows) {
  const timestampIndex = columns.indexOf('timestamp')
  const byDay = new Map()
  let previous = -Infinity
  for (const row of rows) {
    const normalized = normalizeUtcTimestamp(row[timestampIndex])
    const instant = toInstant(normalized)
    if (!Number.isFinite(instant) || instant <= previous) {
      throw new Error('Official timeseries timestamps must be valid, unique, and increasing.')
    }
    previous = instant
    const day = new Date(instant).toISOString().slice(0, 10)
    const dayRows = byDay.get(day) ?? []
    const next = [...row]
    next[timestampIndex] = normalized
    dayRows.push(next)
    byDay.set(day, dayRows)
  }
  return [...byDay.entries()].map(([day, dayRows]) => ({
    day,
    rows: dayRows,
    text: serializeCsv(columns, dayRows),
  }))
}

function selectedChunks(chunks, { minDay, limitDays }) {
  const eligible = minDay === null
    ? chunks
    : chunks.filter(({ day }) => day >= minDay)
  return limitDays === 0 ? eligible : eligible.slice(0, limitDays)
}

function labelsInWindow(events, chunks) {
  if (chunks.length === 0) return []
  const start = Date.parse(`${chunks[0].day}T00:00:00Z`)
  const end = Date.parse(`${chunks.at(-1).day}T23:59:59.999Z`)
  return events.filter((event) =>
    toInstant(event.startTime) <= end && toInstant(event.endTime) >= start,
  )
}

async function collectPredictions(chunks, set) {
  const webPort = await freeLoopbackPort()
  const analyticsPort = await freeLoopbackPort()
  const session = await startLauncher({ webPort, analyticsPort })
  const predictions = []
  const importedChunks = []
  let detectorVersion = null
  try {
    for (const chunk of chunks) {
      const normalized = normalizeOfficialCsv(chunk.text)
      const imported = await requestEnvelope(
        session.ready.analyticsUrl,
        '/api/v1/h2-sentinel/datasets:import',
        { filename: `${set}-${chunk.day}.csv`, text: normalized },
      )
      const run = await requestEnvelope(
        session.ready.analyticsUrl,
        '/api/v1/h2-sentinel/datasets:analyze',
        { datasetId: imported.dataset.datasetId },
      )
      const currentVersion = run.provenance?.modelVersion ?? null
      if (detectorVersion !== null && currentVersion !== detectorVersion) {
        throw new Error('Detector version changed during one evaluation run.')
      }
      detectorVersion = currentVersion
      importedChunks.push({
        day: chunk.day,
        rows: imported.dataset.rowCount,
        predictions: run.events.length,
        fingerprint: imported.dataset.fingerprint,
      })
      predictions.push(...run.events)
    }
  } finally {
    const stopped = await session.stop()
    if (stopped.timedOut) {
      throw new Error('The local launcher required forced cleanup.')
    }
  }
  return { predictions, importedChunks, detectorVersion }
}

export async function evaluateOfficialData(options) {
  const candidate = currentCandidate()
  if (!candidate.trackedTreeClean) {
    throw new Error('Official evaluation requires a clean working tree.')
  }
  const preset = SET_PRESETS[options.set]
  const timeseriesPath = officialFile(options.officialData, preset.timeseries)
  const timeseriesBytes = readFileSync(timeseriesPath)
  const timeseriesText = decodeUtf8Strict(timeseriesBytes, 'Official timeseries')
  const { columns, rows } = parseCsvText(timeseriesText, 'Official timeseries')
  assertOfficialTimeseriesColumns(columns)
  if (rows.length === 0) throw new Error('Official timeseries contains no rows.')
  const chunks = selectedChunks(chunkRowsByUtcDay(columns, rows), {
    minDay: preset.minDay,
    limitDays: options.limitDays,
  })
  if (chunks.length === 0) throw new Error('No UTC day remains after applying the requested window.')

  const { predictions, importedChunks, detectorVersion } = await collectPredictions(
    chunks,
    options.set,
  )
  const labels = loadGroundTruth(options.officialData, preset.labels)
  const groundTruth = labelsInWindow(labels.events, chunks)
  const merged = mergePredictions(
    predictions.map((event) => ({
      id: event.eventId,
      code: event.code,
      startTime: event.startTime,
      endTime: event.endTime,
    })),
  )
  const matching = matchEvents({
    groundTruth,
    predictions: merged,
    graceMinutes: options.graceMinutes,
  })
  const classification = classifyEvents({
    groundTruth,
    predictions: merged,
    graceMinutes: options.graceMinutes,
  })
  const completedCandidate = currentCandidate()
  if (
    completedCandidate.commit !== candidate.commit ||
    !completedCandidate.trackedTreeClean
  ) {
    throw new Error('Candidate state changed during official evaluation.')
  }
  const report = {
    schemaVersion: 1,
    reportKind: 'h2_official_validation_evaluation',
    contractVersion: 'event-match-v1',
    candidateCommit: candidate.commit,
    trackedTreeClean: true,
    set: options.set,
    parameters: {
      graceMinutes: options.graceMinutes,
      mergeGapMinutes: 2,
      limitDays: options.limitDays,
      minimumUtcDay: preset.minDay,
      matching: 'greedy one-to-one same-code interval overlap with symmetric grace',
      chunking: 'UTC calendar day; adjacent same-code predictions merge across boundaries',
    },
    dataset: {
      timeseries: { filename: preset.timeseries, sha256: sha256(timeseriesBytes) },
      labels: { filename: preset.labels, sha256: sha256(labels.bytes) },
      officialFieldCount: columns.length,
      publicLabelsUsedAsDetectorInput: false,
      labelAccessPhase: 'evaluation_only_after_analysis',
      chunks: importedChunks,
    },
    groundTruth: {
      count: groundTruth.length,
      totalPublicLabels: labels.events.length,
      byCode: Object.fromEntries(
        ANOMALY_CODES.map((code) => [
          code,
          groundTruth.filter((event) => event.code === code).length,
        ]),
      ),
    },
    predictions: {
      rawCount: predictions.length,
      mergedCount: merged.length,
      detectorVersion,
      byCode: Object.fromEntries(
        ANOMALY_CODES.map((code) => [
          code,
          merged.filter((event) => event.code === code).length,
        ]),
      ),
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
      classification,
      byCode: Object.fromEntries(
        matching.byCode.map((entry) => [entry.code, entry]),
      ),
    },
    matches: matching.matches,
    unmatchedGroundTruth: matching.unmatchedGroundTruth,
    unmatchedPredictions: matching.unmatchedPredictions,
    provenance: {
      generatedAt: new Date().toISOString(),
      tool: 'validation/evaluate.mjs',
      limitations: [
        'This is a local public-data evaluation under the named event-matching contract, not an organizer score.',
        'The report contains relative source filenames and hashes, never workstation paths.',
        'A limited-day run is not comparable to a complete-window evaluation.',
      ],
    },
  }

  const defaultOutput = resolve(
    repositoryRoot,
    `tests/h2-sentinel/reports/generated/official-evaluation/evaluate-${options.set}.json`,
  )
  const outputPath = ensureIgnoredOutputPath(options.output ?? defaultOutput)
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
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
