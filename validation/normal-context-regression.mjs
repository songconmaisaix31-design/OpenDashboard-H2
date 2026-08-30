import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { currentCandidate } from './lib/candidate.mjs'
import { decodeUtf8Strict, parseCsvText } from './lib/csv.mjs'
import { ANOMALY_CODES, normalizeUtcTimestamp, repositoryRoot } from './lib/official-contract.mjs'
import {
  NORMAL_CONTEXTS,
  NORMAL_CONTEXT_CODES,
  OFFICIAL_SOURCES,
  assertNormalContextIdentity,
  sha256,
} from './lib/official-sources.mjs'
import { streamOfficialTimeseriesWindow } from './lib/official-timeseries.mjs'
import { freeLoopbackPort, requestEnvelope, startLauncher } from './lib/launcher.mjs'
import { mergePredictions, toInstant } from './lib/metrics.mjs'
import {
  createGeneratedRunDirectory,
  ensureIgnoredOutputPath,
  repositoryRelativePath,
  writeFileAtomic,
} from './lib/output.mjs'
import { assertAnalysisRun, assertImportedDataset } from './lib/runtime-provenance.mjs'

const directory = dirname(fileURLToPath(import.meta.url))

// 尺子口径参数：与 evaluate.mjs 的合并规则对齐；任何改动都视为口径变更，须经契约流程并显式重冻结基线。
const BUFFER_DAYS = 1
const MERGE_GAP_MINUTES = 2
const CONTEXT_SPLITS = Object.freeze(['train', 'validation'])
const CONTEXT_COLUMNS = Object.freeze([
  'split',
  'context_id',
  'start_time',
  'end_time',
  'context_code',
  'description',
  'review_result',
])
export const NORMAL_CONTEXT_BASELINE_PATH = resolve(
  directory,
  'baseline/normal-context-baseline.json',
)
const BASELINE_RELATIVE_PATH = 'validation/baseline/normal-context-baseline.json'
const MILLISECONDS_PER_DAY = 86_400_000

function parseArguments(argv) {
  const valueFlags = new Set(['--official-data', '--mode', '--output'])
  const booleanFlags = new Set(['--force'])
  const values = new Map()
  const flags = new Set()
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === '--help') return { help: true }
    if (booleanFlags.has(flag)) {
      if (flags.has(flag)) throw new Error(`Duplicate argument: ${flag}`)
      flags.add(flag)
      continue
    }
    if (!valueFlags.has(flag)) throw new Error(`Unknown argument: ${flag}`)
    if (values.has(flag)) throw new Error(`Duplicate argument: ${flag}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
    values.set(flag, value)
    index += 1
  }
  const officialData = values.get('--official-data')
  if (!officialData) throw new Error('--official-data is required')
  const mode = values.get('--mode') ?? 'report'
  if (!['report', 'freeze', 'check'].includes(mode)) {
    throw new Error('--mode must be report, freeze, or check')
  }
  return {
    help: false,
    mode,
    officialData: resolve(officialData),
    force: flags.has('--force'),
    output: values.has('--output') ? resolve(values.get('--output')) : null,
  }
}

function printUsage() {
  console.log([
    'Usage:',
    "  node validation/normal-context-regression.mjs --official-data <data-directory>",
    '    [--mode report|freeze|check] [--force] [--output <new-generated-report-path>]',
  ].join('\n'))
}

function officialFile(directoryPath, filename) {
  const path = resolve(directoryPath, filename)
  if (!existsSync(path)) throw new Error(`Required official file is missing: ${filename}`)
  return path
}

function loadNormalContexts(officialData) {
  const bytes = readFileSync(officialFile(officialData, NORMAL_CONTEXTS.filename))
  const { columns, rows } = parseCsvText(
    decodeUtf8Strict(bytes, 'Official normal contexts'),
    'Official normal contexts',
  )
  if (columns.some((column, index) => column !== CONTEXT_COLUMNS[index])) {
    throw new Error('Official normal contexts must preserve the exact 7-column order.')
  }
  const index = new Map(columns.map((column, columnIndex) => [column, columnIndex]))
  const contexts = rows.map((row) => ({
    id: row[index.get('context_id')].trim(),
    split: row[index.get('split')].trim(),
    code: row[index.get('context_code')].trim(),
    startTime: normalizeUtcTimestamp(row[index.get('start_time')]),
    endTime: normalizeUtcTimestamp(row[index.get('end_time')]),
    description: row[index.get('description')].trim(),
    reviewResult: row[index.get('review_result')].trim(),
  }))
  for (const context of contexts) {
    const start = toInstant(context.startTime)
    const end = toInstant(context.endTime)
    if (
      !Number.isFinite(start) || !Number.isFinite(end) || start > end ||
      context.description === '' || context.reviewResult === ''
    ) throw new Error('Official normal contexts contain an invalid window.')
  }
  const identity = assertNormalContextIdentity({
    bytes,
    rowCount: rows.length,
    contexts,
    contract: NORMAL_CONTEXTS,
  })
  return { contexts, identity }
}

// 每个 split 需要分析的 UTC 日集合：窗口覆盖日前后各扩 BUFFER_DAYS，
// 保证跨日事件的合并连续性；缓冲日上不与任何窗口相交的事件不计入 FP。
export function requiredDaysForSplit(contexts, split, bufferDays = BUFFER_DAYS) {
  const days = new Set()
  for (const context of contexts) {
    if (context.split !== split) continue
    const start = toInstant(context.startTime)
    const end = toInstant(context.endTime)
    for (
      let cursor = Math.floor(start / MILLISECONDS_PER_DAY) - bufferDays;
      cursor <= Math.floor(end / MILLISECONDS_PER_DAY) + bufferDays;
      cursor += 1
    ) days.add(new Date(cursor * MILLISECONDS_PER_DAY).toISOString().slice(0, 10))
  }
  return days
}

// 与 evaluate.mjs 相同的进程内检测管线：一个 Local launcher 会话内逐 UTC 日 chunk
// 导入并分析（train 与 validation 两个源文件顺序流式），运行时身份必须全程一致。
async function collectNormalContextPredictions({ officialData, daySets }) {
  const webPort = await freeLoopbackPort()
  const analyticsPort = await freeLoopbackPort()
  const session = await startLauncher({ webPort, analyticsPort })
  const predictions = []
  const importedChunks = []
  let runtimeIdentity = null
  const timeseriesIdentities = {}
  try {
    for (const split of CONTEXT_SPLITS) {
      const days = daySets.get(split)
      if (days === undefined || days.size === 0) {
        throw new Error(`No UTC day remains for the ${split} normal contexts.`)
      }
      const source = OFFICIAL_SOURCES[split]
      const streamed = await streamOfficialTimeseriesWindow({
        path: officialFile(officialData, source.timeseries.filename),
        contract: source.timeseries,
        utcDays: days,
        onChunk: async (chunk) => {
          const filename = `normal-context-${split}-${chunk.day}.csv`
          const fingerprint = sha256(Buffer.from(chunk.text, 'utf8'))
          const imported = await requestEnvelope(
            session.ready.analyticsUrl,
            '/api/v1/h2-sentinel/datasets:import',
            { filename, text: chunk.text },
          )
          assertImportedDataset(imported, {
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
            throw new Error('Detector runtime identity changed during one regression run.')
          }
          runtimeIdentity = currentRuntimeIdentity
          importedChunks.push({
            split,
            day: chunk.day,
            sourceFilename: filename,
            rowCount: imported.dataset.rowCount,
            predictionCount: run.events.length,
            fingerprint,
            analysisRunId: run.runId,
          })
          predictions.push(...run.events)
        },
      })
      timeseriesIdentities[split] = streamed.identity
    }
  } finally {
    const stopped = await session.stop()
    if (stopped.timedOut) throw new Error('The local launcher required forced cleanup.')
  }
  return {
    predictions,
    importedChunks,
    runtime: runtimeIdentity === null ? null : JSON.parse(runtimeIdentity),
    timeseriesIdentities,
  }
}

// FP 归因与分列汇总：合并后预测事件区间与窗口闭区间相交（无 grace）即计为该窗口 FP。
export function summarizeNormalContextFps({ contexts, predictions }) {
  const normalized = predictions.map((event) => {
    const start = toInstant(event.startTime)
    const end = toInstant(event.endTime)
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
      throw new Error(`Predicted event has an invalid interval: ${event.id}`)
    }
    return { ...event, start, end }
  })
  const attributed = contexts.map((context) => {
    const start = toInstant(context.startTime)
    const end = toInstant(context.endTime)
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
      throw new Error(`Normal context has an invalid interval: ${context.id}`)
    }
    const fpEvents = normalized
      .filter((event) => event.start <= end && event.end >= start)
      .sort((left, right) => left.start - right.start || left.id.localeCompare(right.id))
      .map(({ id, code, startTime, endTime }) => ({ id, code, startTime, endTime }))
    return {
      id: context.id,
      split: context.split,
      code: context.code,
      startTime: context.startTime,
      endTime: context.endTime,
      fpEventCount: fpEvents.length,
      fpEvents,
    }
  })
  const summarize = (subset) => {
    const contextCount = subset.length
    const contextsWithFp = subset.filter((context) => context.fpEventCount > 0).length
    const fpEventCount = subset.reduce((total, context) => total + context.fpEventCount, 0)
    return {
      contexts: contextCount,
      contextsWithFp,
      fpEventCount,
      fpRate: contextCount === 0 ? 0 : contextsWithFp / contextCount,
    }
  }
  const byCode = NORMAL_CONTEXT_CODES.map((code) => ({
    code,
    ...summarize(attributed.filter((context) => context.code === code)),
  }))
  const bySplit = CONTEXT_SPLITS.map((split) => ({
    split,
    ...summarize(attributed.filter((context) => context.split === split)),
  }))
  const predictedCodeMatrix = Object.fromEntries(NORMAL_CONTEXT_CODES.map((code) => [
    code,
    Object.fromEntries(ANOMALY_CODES.map((anomalyCode) => [
      anomalyCode,
      attributed
        .filter((context) => context.code === code)
        .reduce(
          (total, context) =>
            total + context.fpEvents.filter((event) => event.code === anomalyCode).length,
          0,
        ),
    ])),
  ]))
  return {
    contexts: attributed,
    summary: { byCode, bySplit, overall: summarize(attributed), predictedCodeMatrix },
  }
}

// 门禁比较：N01-N07 各列 + 总览，contextsWithFp 与 fpEventCount 均不得高于基线。
export function compareNormalContextSummaries(current, baseline) {
  const columns = [
    ...NORMAL_CONTEXT_CODES.map((code) => ({ key: code, code })),
    { key: 'overall', code: null },
  ]
  const violations = []
  const improvements = []
  const columnsCompared = []
  for (const { key, code } of columns) {
    const currentEntry = key === 'overall'
      ? current.overall
      : current.byCode.find((entry) => entry.code === code)
    const baselineEntry = key === 'overall'
      ? baseline.overall
      : baseline.byCode.find((entry) => entry.code === code)
    if (currentEntry === undefined || baselineEntry === undefined) {
      throw new Error('Normal-context summaries must define every N01-N07 column and the overall row.')
    }
    if (currentEntry.contexts !== baselineEntry.contexts) {
      throw new Error('Normal-context column sizes differ; the frozen baseline no longer matches the official source.')
    }
    const delta = {
      column: key,
      baselineContextsWithFp: baselineEntry.contextsWithFp,
      currentContextsWithFp: currentEntry.contextsWithFp,
      baselineFpEventCount: baselineEntry.fpEventCount,
      currentFpEventCount: currentEntry.fpEventCount,
    }
    columnsCompared.push(delta)
    if (
      currentEntry.contextsWithFp > baselineEntry.contextsWithFp ||
      currentEntry.fpEventCount > baselineEntry.fpEventCount
    ) violations.push(delta)
    else if (
      currentEntry.contextsWithFp < baselineEntry.contextsWithFp ||
      currentEntry.fpEventCount < baselineEntry.fpEventCount
    ) improvements.push(delta)
  }
  return { passed: violations.length === 0, violations, improvements, columnsCompared }
}

function baselineTracked() {
  const result = spawnSync(
    'git',
    ['ls-files', '--error-unmatch', '--', BASELINE_RELATIVE_PATH],
    {
      cwd: repositoryRoot,
      shell: false,
      stdio: 'ignore',
      windowsHide: true,
    },
  )
  if (result.error || ![0, 1].includes(result.status)) {
    throw new Error('Normal-context baseline tracking state could not be verified.')
  }
  return result.status === 0
}

// 基线写入不经过 output.mjs（其原子写仅限 generated 根），此处保持同等纪律：
// 目标必须未被 git 跟踪、临时文件 + 原子 rename。
function writeBaselineAtomic(content) {
  if (baselineTracked()) throw new Error('The normal-context baseline must not be a tracked path.')
  mkdirSync(dirname(NORMAL_CONTEXT_BASELINE_PATH), { recursive: true })
  const temporary = resolve(
    dirname(NORMAL_CONTEXT_BASELINE_PATH),
    `.${basename(NORMAL_CONTEXT_BASELINE_PATH)}.${randomUUID()}.tmp`,
  )
  try {
    writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx' })
    renameSync(temporary, NORMAL_CONTEXT_BASELINE_PATH)
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary)
  }
  return NORMAL_CONTEXT_BASELINE_PATH
}

function loadFrozenBaseline() {
  if (!existsSync(NORMAL_CONTEXT_BASELINE_PATH)) {
    throw new Error('The normal-context baseline is not frozen yet; run --mode freeze first.')
  }
  const baseline = JSON.parse(readFileSync(NORMAL_CONTEXT_BASELINE_PATH, 'utf8'))
  if (
    baseline?.baselineKind !== 'h2_normal_context_fp_baseline' ||
    baseline?.schemaVersion !== 1 ||
    !Array.isArray(baseline?.summary?.byCode) ||
    baseline?.summary?.overall === undefined
  ) throw new Error('The frozen normal-context baseline is invalid.')
  return baseline
}

function rulerParameters() {
  return {
    bufferDays: BUFFER_DAYS,
    mergeGapMinutes: MERGE_GAP_MINUTES,
    fpDefinition: 'merged same-code prediction interval intersects the normal-context window with inclusive bounds and no grace',
    daySelection: 'UTC calendar days covering every context window plus a symmetric buffer; buffer-day-only events are not false positives',
    gateRule: 'per-code and overall contextsWithFp and fpEventCount must not exceed the frozen baseline',
  }
}

export async function runNormalContextRegression(options) {
  const candidate = currentCandidate()
  if (!candidate.trackedTreeClean) {
    throw new Error('Normal-context regression requires a clean working tree.')
  }
  const { contexts, identity: contextsIdentity } = loadNormalContexts(options.officialData)
  const daySets = new Map(
    CONTEXT_SPLITS.map((split) => [split, requiredDaysForSplit(contexts, split)]),
  )
  const collected = await collectNormalContextPredictions({
    officialData: options.officialData,
    daySets,
  })
  for (const context of contexts) {
    const source = collected.timeseriesIdentities[context.split]
    if (
      toInstant(context.startTime) < toInstant(source.firstTimestamp) ||
      toInstant(context.endTime) > toInstant(source.lastTimestamp)
    ) throw new Error(`Normal context ${context.id} lies outside its split timeseries range.`)
  }
  const merged = mergePredictions(collected.predictions.map((event) => ({
    id: event.eventId,
    code: event.code,
    startTime: event.startTime,
    endTime: event.endTime,
    firstDetectionTime: event.firstDetectionTime,
  })))
  const { contexts: attributed, summary } = summarizeNormalContextFps({
    contexts,
    predictions: merged,
  })
  const completedCandidate = currentCandidate()
  if (completedCandidate.commit !== candidate.commit || !completedCandidate.trackedTreeClean) {
    throw new Error('Candidate state changed during normal-context regression.')
  }
  const parameters = rulerParameters()
  const report = {
    schemaVersion: 1,
    reportKind: 'h2_normal_context_regression',
    regressionRunId: randomUUID(),
    candidateCommit: candidate.commit,
    trackedTreeClean: true,
    mode: options.mode,
    parameters,
    dataset: {
      contexts: contextsIdentity,
      timeseries: collected.timeseriesIdentities,
      analyzedDays: Object.fromEntries(CONTEXT_SPLITS.map((split) => {
        const ordered = [...daySets.get(split)].sort()
        return [split, {
          count: ordered.length,
          firstUtcDay: ordered[0],
          lastUtcDay: ordered.at(-1),
        }]
      })),
      publicLabelsUsedAsDetectorInput: false,
      rulerOnlyNoTrainingUse: true,
      chunks: collected.importedChunks,
    },
    predictions: {
      rawCount: collected.predictions.length,
      mergedCount: merged.length,
      runtime: collected.runtime,
    },
    summary,
    contexts: attributed,
    provenance: {
      generatedAt: new Date().toISOString(),
      tool: 'validation/normal-context-regression.mjs',
      limitations: [
        'This is a local public-data false-positive regression under the documented overlap rule, not an organizer score.',
        'The report contains relative source filenames and verified hashes, never workstation paths.',
        'N01-N07 serve only as the false-alarm ruler and never as training augmentation (ADR-002).',
      ],
    },
  }

  const outputPath = options.output === null || options.output === undefined
    ? resolve(
      createGeneratedRunDirectory('normal-context-regression', candidate.commit),
      'normal-context-regression.json',
    )
    : ensureIgnoredOutputPath(options.output)
  writeFileAtomic(outputPath, `${JSON.stringify(report, null, 2)}\n`)
  const writtenCandidate = currentCandidate()
  if (writtenCandidate.commit !== candidate.commit || !writtenCandidate.trackedTreeClean) {
    throw new Error('Candidate state changed while writing the regression report.')
  }

  if (options.mode === 'freeze') {
    if (existsSync(NORMAL_CONTEXT_BASELINE_PATH) && !options.force) {
      throw new Error('The normal-context baseline already exists; re-freeze requires --force.')
    }
    const baseline = {
      schemaVersion: 1,
      baselineKind: 'h2_normal_context_fp_baseline',
      frozenAt: new Date().toISOString(),
      candidateCommit: candidate.commit,
      runtime: collected.runtime,
      parameters,
      sourceIdentities: {
        contexts: contextsIdentity,
        timeseries: collected.timeseriesIdentities,
      },
      summary,
      tool: 'validation/normal-context-regression.mjs',
    }
    writeBaselineAtomic(`${JSON.stringify(baseline, null, 2)}\n`)
    const frozenCandidate = currentCandidate()
    if (frozenCandidate.commit !== candidate.commit || !frozenCandidate.trackedTreeClean) {
      throw new Error('Candidate state changed while freezing the normal-context baseline.')
    }
    return { report, summary, outputPath, baselinePath: NORMAL_CONTEXT_BASELINE_PATH }
  }

  if (options.mode === 'check') {
    const baseline = loadFrozenBaseline()
    if (JSON.stringify(baseline.parameters) !== JSON.stringify(parameters)) {
      throw new Error(
        'The ruler parameters changed since the baseline was frozen; re-freeze consciously with --mode freeze --force.',
      )
    }
    const comparison = compareNormalContextSummaries(summary, baseline.summary)
    return { report, summary, outputPath, comparison, baseline }
  }

  return { report, summary, outputPath }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath.toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  try {
    const options = parseArguments(process.argv.slice(2))
    if (options.help) {
      printUsage()
    } else if (options.mode === 'check') {
      const result = await runNormalContextRegression(options)
      console.log(JSON.stringify({
        status: result.comparison.passed ? 'passed' : 'failed',
        mode: options.mode,
        candidateCommit: result.report.candidateCommit,
        baselineCommit: result.baseline.candidateCommit,
        summary: { byCode: result.summary.byCode, overall: result.summary.overall },
        violations: result.comparison.violations,
        improvements: result.comparison.improvements,
        reportPath: repositoryRelativePath(result.outputPath),
      }))
      if (!result.comparison.passed) process.exitCode = 1
    } else {
      const result = await runNormalContextRegression(options)
      console.log(JSON.stringify({
        status: 'evaluated',
        mode: options.mode,
        candidateCommit: result.report.candidateCommit,
        summary: { byCode: result.summary.byCode, overall: result.summary.overall },
        reportPath: repositoryRelativePath(result.outputPath),
        ...(result.baselinePath === undefined
          ? {}
          : { baselinePath: repositoryRelativePath(result.baselinePath) }),
      }))
    }
  } catch (error) {
    console.error(
      `ERROR ${error instanceof Error ? error.message : 'Normal-context regression failed.'}`,
    )
    process.exitCode = 1
  }
}
