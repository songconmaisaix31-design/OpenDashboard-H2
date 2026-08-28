import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { validateSubmissionText } from './check-submission.mjs'
import { currentCandidate } from './lib/candidate.mjs'
import { decodeUtf8Strict, parseCsvText } from './lib/csv.mjs'
import {
  OFFICIAL_FIELDS,
  assertOfficialTimeseriesColumns,
  normalizeOfficialCsv,
  repositoryRoot,
} from './lib/official-contract.mjs'
import { freeLoopbackPort, requestEnvelope, startLauncher } from './lib/launcher.mjs'
import { ensureIgnoredOutputDirectory, repositoryRelativePath } from './lib/output.mjs'

const TEST_SET_FILENAME = '03_test_timeseries.csv'
const DEFAULT_OUTPUT = resolve(
  repositoryRoot,
  'tests/h2-sentinel/reports/generated/offline-deploy-smoke',
)

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

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
    output: values.get('--output') ? resolve(values.get('--output')) : DEFAULT_OUTPUT,
  }
}

function printUsage() {
  console.log(
    'Usage: node validation/offline-deploy-smoke.mjs --official-data <data-directory> [--output <ignored-directory>]',
  )
}

export async function runOfflineDeploySmoke(options) {
  if (existsSync(options.output)) {
    throw new Error('Offline-smoke output directory must not already exist.')
  }
  const candidate = currentCandidate()
  if (!candidate.trackedTreeClean) {
    throw new Error('Offline test-set evidence requires a clean working tree.')
  }
  const sourceBytes = readFileSync(resolve(options.officialData, TEST_SET_FILENAME))
  const sourceText = decodeUtf8Strict(sourceBytes, 'Official test timeseries')
  const parsed = parseCsvText(sourceText, 'Official test timeseries')
  assertOfficialTimeseriesColumns(parsed.columns)
  if (parsed.rows.length === 0) throw new Error('Official test timeseries contains no rows.')
  const normalized = normalizeOfficialCsv(sourceText, 'Official test timeseries')
  const outputDirectory = ensureIgnoredOutputDirectory(options.output)
  const webPort = await freeLoopbackPort()
  const analyticsPort = await freeLoopbackPort()
  const session = await startLauncher({ webPort, analyticsPort })
  const steps = []
  let report
  try {
    const importStartedAt = performance.now()
    const imported = await requestEnvelope(
      session.ready.analyticsUrl,
      '/api/v1/h2-sentinel/datasets:import',
      { filename: TEST_SET_FILENAME, text: normalized },
      { timeoutMs: 180_000 },
    )
    steps.push({
      step: 'import',
      durationMs: Math.max(1, Math.round(performance.now() - importStartedAt)),
      rowCount: imported.dataset.rowCount,
      fingerprint: imported.dataset.fingerprint,
      status: imported.dataset.rowCount === parsed.rows.length ? 'passed' : 'failed',
    })

    const analyzeStartedAt = performance.now()
    const run = await requestEnvelope(
      session.ready.analyticsUrl,
      '/api/v1/h2-sentinel/datasets:analyze',
      { datasetId: imported.dataset.datasetId },
      { timeoutMs: 180_000 },
    )
    steps.push({
      step: 'analysis',
      durationMs: Math.max(1, Math.round(performance.now() - analyzeStartedAt)),
      runId: run.runId,
      eventCount: run.events.length,
      detectorVersion: run.provenance?.modelVersion ?? null,
      byCode: run.eventCountsByCode,
      status: 'passed',
    })

    const exportStartedAt = performance.now()
    const submission = await requestEnvelope(
      session.ready.webUrl,
      '/api/v1/h2-sentinel/submissions:export',
      { runId: run.runId },
      { timeoutMs: 180_000 },
    )
    const submissionPath = resolve(outputDirectory, 'submission-testset.csv')
    writeFileSync(submissionPath, submission.content, 'utf8')
    const check = validateSubmissionText(submission.content)
    steps.push({
      step: 'submission_export',
      durationMs: Math.max(1, Math.round(performance.now() - exportStartedAt)),
      relativePath: 'submission-testset.csv',
      sha256: sha256(Buffer.from(submission.content, 'utf8')),
      rowCount: check.rowCount,
      checkerValid: check.valid,
      checkerIssues: check.issues.slice(0, 20),
      status: check.valid ? 'passed' : 'failed',
    })

    const completedCandidate = currentCandidate()
    if (
      completedCandidate.commit !== candidate.commit ||
      !completedCandidate.trackedTreeClean
    ) {
      throw new Error('Candidate state changed during the offline test-set smoke.')
    }

    report = {
      schemaVersion: 1,
      reportKind: 'h2_offline_testset_smoke',
      contractVersion: 'offline-testset-smoke-v2',
      candidateCommit: candidate.commit,
      trackedTreeClean: true,
      verdict: steps.every(({ status }) => status === 'passed') ? 'passed' : 'blocked',
      dataset: {
        filename: TEST_SET_FILENAME,
        sha256: sha256(sourceBytes),
        rowCount: parsed.rows.length,
        officialFieldCount: OFFICIAL_FIELDS.length,
        publicLabelsUsedAsDetectorInput: false,
      },
      steps,
      provenance: {
        generatedAt: new Date().toISOString(),
        tool: 'validation/offline-deploy-smoke.mjs',
        scope: 'local loopback import, analysis, and exact-format submission export',
        limitations: [
          'This smoke does not use public labels and does not produce an organizer score.',
          'A passing local smoke is not deployment, production, hidden-test, or network-isolation proof.',
          'Artifact and source references are repository-relative names; workstation paths are omitted.',
        ],
      },
    }
    writeFileSync(
      resolve(outputDirectory, 'offline-deploy-smoke.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8',
    )
  } finally {
    const stopped = await session.stop()
    if (stopped.timedOut) throw new Error('The local launcher required forced cleanup.')
  }
  return {
    report,
    reportPath: repositoryRelativePath(
      resolve(outputDirectory, 'offline-deploy-smoke.json'),
    ),
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath.toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  try {
    const options = parseArguments(process.argv.slice(2))
    if (options.help) {
      printUsage()
    } else {
      const result = await runOfflineDeploySmoke(options)
      console.log(JSON.stringify({
        verdict: result.report.verdict,
        candidateCommit: result.report.candidateCommit,
        reportPath: result.reportPath,
        organizerScore: false,
      }))
      if (result.report.verdict !== 'passed') process.exitCode = 1
    }
  } catch (error) {
    console.error(`ERROR ${error instanceof Error ? error.message : 'Offline smoke failed.'}`)
    process.exitCode = 1
  }
}
