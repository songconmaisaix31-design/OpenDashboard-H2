import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { validateSubmissionText } from './check-submission.mjs'
import { currentCandidate } from './lib/candidate.mjs'
import { OFFICIAL_FIELDS } from './lib/official-contract.mjs'
import { OFFICIAL_SOURCES, sha256 } from './lib/official-sources.mjs'
import { inspectOfficialTimeseries } from './lib/official-timeseries.mjs'
import { freeLoopbackPort, requestEnvelope, startLauncher } from './lib/launcher.mjs'
import {
  createGeneratedRunDirectory,
  ensureIgnoredOutputDirectory,
  repositoryRelativePath,
  writeFileAtomic,
} from './lib/output.mjs'
import { assertAnalysisRun, assertImportedDataset } from './lib/runtime-provenance.mjs'

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
    'Usage: node validation/offline-deploy-smoke.mjs --official-data <data-directory> [--output <new-generated-directory>]',
  )
}

function safeErrorMessage(error) {
  const message = error instanceof Error ? error.message : ''
  return /\b(?:ENOENT|EACCES|EPERM)\b|(?:[A-Za-z]:[\\/]|\/home\/|\/Users\/)/.test(message)
    ? 'Offline smoke could not access a required official source or generated artifact.'
    : message || 'Offline smoke failed.'
}

export async function runOfflineDeploySmoke(options) {
  const candidate = currentCandidate()
  if (!candidate.trackedTreeClean) {
    throw new Error('Offline test-set evidence requires a clean working tree.')
  }
  const sourceContract = OFFICIAL_SOURCES.test.timeseries
  const sourcePath = resolve(options.officialData, sourceContract.filename)
  if (!existsSync(sourcePath)) throw new Error(`Required official file is missing: ${sourceContract.filename}`)
  const sourceIdentity = await inspectOfficialTimeseries(sourcePath, sourceContract)
  let sourceText
  try {
    sourceText = readFileSync(sourcePath, 'utf8')
  } catch {
    throw new Error(`Official source ${sourceContract.filename} could not be read.`)
  }
  const submittedFingerprint = sha256(Buffer.from(sourceText, 'utf8'))
  const outputDirectory = options.output === null || options.output === undefined
    ? createGeneratedRunDirectory('offline-deploy-smoke', candidate.commit)
    : ensureIgnoredOutputDirectory(options.output)
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
      { filename: sourceContract.filename, text: sourceText },
      { timeoutMs: 180_000 },
    )
    const importIdentity = assertImportedDataset(imported, {
      filename: sourceContract.filename,
      rowCount: sourceIdentity.rowCount,
      fingerprint: submittedFingerprint,
    })
    steps.push({
      step: 'import',
      durationMs: Math.max(1, Math.round(performance.now() - importStartedAt)),
      status: 'passed',
      ...importIdentity,
    })

    const analyzeStartedAt = performance.now()
    const run = await requestEnvelope(
      session.ready.analyticsUrl,
      '/api/v1/h2-sentinel/datasets:analyze',
      { datasetId: imported.dataset.datasetId },
      { timeoutMs: 180_000 },
    )
    const analysisIdentity = assertAnalysisRun(run, imported)
    steps.push({
      step: 'analysis',
      durationMs: Math.max(1, Math.round(performance.now() - analyzeStartedAt)),
      eventCount: run.events.length,
      byCode: run.eventCountsByCode,
      status: 'passed',
      ...analysisIdentity,
    })

    const exportStartedAt = performance.now()
    const submission = await requestEnvelope(
      session.ready.webUrl,
      '/api/v1/h2-sentinel/submissions:export',
      { runId: run.runId },
      { timeoutMs: 180_000 },
    )
    const submissionPath = resolve(outputDirectory, 'submission-testset.csv')
    writeFileAtomic(submissionPath, submission.content)
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
    if (completedCandidate.commit !== candidate.commit || !completedCandidate.trackedTreeClean) {
      throw new Error('Candidate state changed during the offline test-set smoke.')
    }
    report = {
      schemaVersion: 2,
      reportKind: 'h2_offline_testset_smoke',
      contractVersion: 'offline-testset-smoke-v3',
      candidateCommit: candidate.commit,
      trackedTreeClean: true,
      verdict: steps.every(({ status }) => status === 'passed') ? 'passed' : 'blocked',
      dataset: {
        source: sourceIdentity,
        submittedImportFingerprint: submittedFingerprint,
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
          'Artifact and source references contain verified filenames and hashes, never workstation paths.',
        ],
      },
    }
    writeFileAtomic(
      resolve(outputDirectory, 'offline-deploy-smoke.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    )
  } finally {
    const stopped = await session.stop()
    if (stopped.timedOut) throw new Error('The local launcher required forced cleanup.')
  }
  const writtenCandidate = currentCandidate()
  if (writtenCandidate.commit !== candidate.commit || !writtenCandidate.trackedTreeClean) {
    throw new Error('Candidate state changed while completing the offline test-set smoke.')
  }
  return {
    report,
    reportPath: repositoryRelativePath(resolve(outputDirectory, 'offline-deploy-smoke.json')),
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
    console.error(`ERROR ${safeErrorMessage(error)}`)
    process.exitCode = 1
  }
}
