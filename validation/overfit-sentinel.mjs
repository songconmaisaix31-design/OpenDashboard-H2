import { execFile } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { repositoryRoot } from './lib/official-contract.mjs'
import { ensureIgnoredOutputPath, repositoryRelativePath } from './lib/output.mjs'

const directory = dirname(fileURLToPath(import.meta.url))
const evaluatorPath = resolve(directory, 'evaluate.mjs')
const generatedDirectory = resolve(
  repositoryRoot,
  'tests/h2-sentinel/reports/generated/official-evaluation',
)
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
    output: values.get('--output'),
  }
}

function printUsage() {
  console.log(
    'Usage: node validation/overfit-sentinel.mjs --official-data <data-directory> [--output <ignored-report-path>]',
  )
}

function runEvaluation({ officialData, set, output }) {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(
      process.execPath,
      [
        evaluatorPath,
        '--mode',
        'local',
        '--set',
        set,
        '--official-data',
        officialData,
        '--output',
        output,
      ],
      { cwd: repositoryRoot, timeout: 30 * 60 * 1000, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          rejectPromise(
            new Error(`evaluate.mjs --set ${set} failed: ${stderr || error.message}`),
          )
          return
        }
        resolvePromise(stdout)
      },
    )
  })
}

function readEvaluation(path, expectedSet) {
  const value = JSON.parse(readFileSync(path, 'utf8'))
  if (
    value.reportKind !== 'h2_official_validation_evaluation' ||
    value.contractVersion !== 'event-match-v1' ||
    value.set !== expectedSet
  ) {
    throw new Error(`The ${expectedSet} evaluation report has the wrong identity.`)
  }
  return value
}

export async function runOverfitSentinel(options) {
  const validationPath = ensureIgnoredOutputPath(
    resolve(generatedDirectory, 'evaluate-validation.json'),
  )
  const trainPath = ensureIgnoredOutputPath(
    resolve(generatedDirectory, 'evaluate-train-last-90.json'),
  )
  await runEvaluation({
    officialData: options.officialData,
    set: 'validation',
    output: validationPath,
  })
  await runEvaluation({
    officialData: options.officialData,
    set: 'train-last-90',
    output: trainPath,
  })

  const validation = readEvaluation(validationPath, 'validation')
  const train = readEvaluation(trainPath, 'train-last-90')
  if (validation.candidateCommit !== train.candidateCommit) {
    throw new Error('Evaluation reports were not produced from the same candidate commit.')
  }
  if (!validation.trackedTreeClean || !train.trackedTreeClean) {
    throw new Error('Overfit evidence requires evaluation reports from a clean working tree.')
  }
  const validationF1 = validation.metrics.overall.f1
  const trainF1 = train.metrics.overall.f1
  const absoluteDelta = Math.abs(validationF1 - trainF1)
  const red = absoluteDelta > RED_THRESHOLD
  const report = {
    schemaVersion: 1,
    reportKind: 'h2_overfit_sentinel',
    contractVersion: 'overfit-sentinel-v1',
    candidateCommit: validation.candidateCommit,
    threshold: { absoluteF1DeltaRedAbove: RED_THRESHOLD },
    windows: {
      validation: {
        report: repositoryRelativePath(validationPath),
        source: validation.dataset.timeseries.filename,
        labels: validation.dataset.labels.filename,
        f1: validationF1,
        precision: validation.metrics.overall.precision,
        recall: validation.metrics.overall.recall,
      },
      trainLast90: {
        report: repositoryRelativePath(trainPath),
        source: train.dataset.timeseries.filename,
        labels: train.dataset.labels.filename,
        minimumUtcDay: train.parameters.minimumUtcDay,
        f1: trainF1,
        precision: train.metrics.overall.precision,
        recall: train.metrics.overall.recall,
      },
    },
    result: {
      validationF1,
      trainLast90F1: trainF1,
      absoluteDelta,
      red,
    },
    provenance: {
      generatedAt: new Date().toISOString(),
      tool: 'validation/overfit-sentinel.mjs',
      limitations: [
        'The train-last-90 public window is a disjoint sentinel window, not a hidden or organizer test set.',
        'The verdict compares local event-level F1 values under event-match-v1 and is not an organizer score.',
      ],
    },
  }
  const outputPath = ensureIgnoredOutputPath(
    options.output ?? resolve(generatedDirectory, 'overfit-sentinel.json'),
  )
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
