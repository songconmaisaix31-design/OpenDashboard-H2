import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { cpus } from 'node:os'
import { fileURLToPath } from 'node:url'

import { validateSubmissionText } from './check-submission.mjs'
import { assertExactCleanCandidate } from './lib/candidate.mjs'
import { decodeUtf8Strict, parseCsvText } from './lib/csv.mjs'
import {
  assertOfficialTimeseriesColumns,
  isLabelColumn,
  repositoryRoot,
} from './lib/official-contract.mjs'
import { freeLoopbackPort, requestEnvelope, startLauncher } from './lib/launcher.mjs'
import { toInstant } from './lib/metrics.mjs'
import { ensureIgnoredOutputDirectory, repositoryRelativePath } from './lib/output.mjs'
import { validateDemoReceipt } from '../tests/h2-sentinel/scripts/validate-demo-receipt.mjs'

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function parseArguments(argv) {
  const known = new Set(['--manifest', '--output', '--candidate-commit'])
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
  for (const flag of known) {
    if (!values.has(flag)) throw new Error(`${flag} is required`)
  }
  return {
    help: false,
    manifest: resolve(values.get('--manifest')),
    output: resolve(values.get('--output')),
    candidateCommit: values.get('--candidate-commit').toLowerCase(),
  }
}

function printUsage() {
  console.log([
    'Usage:',
    '  node validation/run-demo.mjs --manifest <validation-slice-manifest.json>',
    '    --output <ignored-artifact-directory>',
    '    --candidate-commit <40-character-clean-HEAD-sha>',
  ].join('\n'))
}

function safeManifestFile(manifestPath, filename) {
  if (
    typeof filename !== 'string' ||
    filename.length === 0 ||
    isAbsolute(filename) ||
    filename.split(/[\\/]+/).some((part) => part === '..' || part === '')
  ) {
    throw new Error('Slice manifest contains an unsafe detector filename.')
  }
  const root = realpathSync(dirname(manifestPath))
  const path = realpathSync(resolve(root, filename))
  const fromRoot = relative(root, path)
  if (
    fromRoot === '' ||
    fromRoot === '..' ||
    fromRoot.startsWith(`..${sep}`) ||
    isAbsolute(fromRoot) ||
    !statSync(path).isFile()
  ) {
    throw new Error('Detector input must be a file adjacent to the slice manifest.')
  }
  return path
}

function loadSlice(manifestPath) {
  const manifestBytes = readFileSync(manifestPath)
  const manifest = JSON.parse(decodeUtf8Strict(manifestBytes, 'Slice manifest'))
  if (
    manifest.schemaVersion !== 1 ||
    manifest.manifestKind !== 'h2_public_validation_slice' ||
    manifest.selectedEvent?.code !== 'C04' ||
    manifest.provenance?.scope !== 'VALIDATION_SLICE'
  ) {
    throw new Error('Slice manifest identity is invalid.')
  }
  const detectorPath = safeManifestFile(manifestPath, manifest.slice?.filename)
  const detectorBytes = readFileSync(detectorPath)
  if (sha256(detectorBytes) !== manifest.slice.sha256) {
    throw new Error('Detector input hash does not match the slice manifest.')
  }
  const detectorText = decodeUtf8Strict(detectorBytes, 'Detector input')
  const detector = parseCsvText(detectorText, 'Detector input')
  assertOfficialTimeseriesColumns(detector.columns)
  if (detector.columns.some(isLabelColumn)) {
    throw new Error('Detector input contains a public label column.')
  }
  return { manifest, manifestBytes, detectorBytes, detectorText }
}

function artifactRecord(relativePath, content) {
  return {
    relativePath,
    sha256: sha256(Buffer.from(content, 'utf8')),
  }
}

function assertArtifactHash(artifact, label) {
  if (
    !artifact ||
    typeof artifact.content !== 'string' ||
    artifact.descriptor?.contentHash !== sha256(Buffer.from(artifact.content, 'utf8'))
  ) {
    throw new Error(`${label} content hash is invalid.`)
  }
}

function overlapsSelectedEvent(event, selectedEvent) {
  const eventStart = toInstant(event.startTime)
  const eventEnd = toInstant(event.endTime)
  const selectedStart = toInstant(selectedEvent.startTime)
  const selectedEnd = toInstant(selectedEvent.endTime)
  return event.code === 'C04' && eventStart <= selectedEnd && eventEnd >= selectedStart
}

async function measuredStage(stages, stage, operation) {
  const startedAt = performance.now()
  const value = await operation()
  stages.push({
    stage,
    durationMs: Math.max(1, Math.floor(performance.now() - startedAt)),
  })
  return value
}

async function runOnce({ sequence, slice, outputDirectory }) {
  const webPort = await freeLoopbackPort()
  const analyticsPort = await freeLoopbackPort()
  const session = await startLauncher({ webPort, analyticsPort })
  const stages = []
  const runDirectoryName = `run-${sequence}`
  const runDirectory = resolve(outputDirectory, runDirectoryName)
  mkdirSync(runDirectory, { recursive: true })
  const measuredStart = performance.now()
  const startedAt = new Date()
  let result
  try {
    const imported = await measuredStage(stages, 'import', () =>
      requestEnvelope(
        session.ready.analyticsUrl,
        '/api/v1/h2-sentinel/datasets:import',
        { filename: 'validation-slice.csv', text: slice.detectorText },
      ),
    )
    const analysis = await measuredStage(stages, 'analysis', () =>
      requestEnvelope(
        session.ready.analyticsUrl,
        '/api/v1/h2-sentinel/datasets:analyze',
        { datasetId: imported.dataset.datasetId },
      ),
    )
    const candidate = analysis.events
      .filter((event) => overlapsSelectedEvent(event, slice.manifest.selectedEvent))
      .sort((left, right) => left.startTime.localeCompare(right.startTime))[0]
    if (candidate === undefined) {
      throw new Error('Analysis did not produce a C04 event overlapping the selected public event.')
    }

    const evidenceEvent = await measuredStage(stages, 'evidence_review', () =>
      requestEnvelope(
        session.ready.analyticsUrl,
        '/api/v1/h2-sentinel/runs/event',
        { runId: analysis.runId, eventId: candidate.eventId },
      ),
    )
    if (!Array.isArray(evidenceEvent.evidence) || evidenceEvent.evidence.length === 0) {
      throw new Error('The selected event has no detector evidence to review.')
    }

    const review = await measuredStage(stages, 'human_review', () =>
      requestEnvelope(
        session.ready.analyticsUrl,
        `/api/v1/h2-sentinel/runs/${encodeURIComponent(analysis.runId)}/events/${
          encodeURIComponent(candidate.eventId)
        }:review`,
        {
          schemaVersion: 1,
          requestId: `demo-${sequence}-${randomUUID()}`,
          runId: analysis.runId,
          eventId: candidate.eventId,
          action: 'confirm',
          expectedRevision: 0,
          actor: { kind: 'local_operator', displayName: 'demo_operator' },
          note: 'Measured local demo review; actor label is unverified.',
        },
      ),
    )
    if (review.review?.currentState !== 'confirmed' || review.review?.revision !== 1) {
      throw new Error('Human review did not reach confirmed revision 1.')
    }

    const answer = await measuredStage(stages, 'q09_report', () =>
      requestEnvelope(
        session.ready.analyticsUrl,
        '/api/v1/h2-sentinel/assistant:ask',
        {
          runId: analysis.runId,
          questionId: 'Q09',
          eventId: candidate.eventId,
          allowLlmRendering: false,
        },
      ),
    )
    if (answer.mode !== 'DETERMINISTIC_TEMPLATE' || answer.eventId !== candidate.eventId) {
      throw new Error('Q09 did not return the deterministic selected-event answer.')
    }
    assertArtifactHash(answer.generatedReport, 'Q09 diagnosis report')

    const artifacts = await measuredStage(stages, 'artifact_export', async () => {
      const audit = await requestEnvelope(
        session.ready.analyticsUrl,
        '/api/v1/h2-sentinel/reports:export',
        { runId: analysis.runId, kind: 'review_audit_json' },
      )
      const submission = await requestEnvelope(
        session.ready.analyticsUrl,
        '/api/v1/h2-sentinel/submissions:export',
        { runId: analysis.runId },
      )
      assertArtifactHash(audit, 'Review-audit report')
      assertArtifactHash(submission, 'Submission report')
      const submissionCheck = validateSubmissionText(submission.content)
      if (!submissionCheck.valid) {
        throw new Error(`Submission checker failed: ${submissionCheck.issues.slice(0, 3).join(' | ')}`)
      }
      const diagnosisPath = `${runDirectoryName}/diagnosis.html`
      const auditPath = `${runDirectoryName}/review-audit.json`
      const submissionPath = `${runDirectoryName}/submission.csv`
      writeFileSync(resolve(outputDirectory, diagnosisPath), answer.generatedReport.content, 'utf8')
      writeFileSync(resolve(outputDirectory, auditPath), audit.content, 'utf8')
      writeFileSync(resolve(outputDirectory, submissionPath), submission.content, 'utf8')
      return {
        diagnosisReport: artifactRecord(diagnosisPath, answer.generatedReport.content),
        reviewAudit: artifactRecord(auditPath, audit.content),
        submissionCsv: artifactRecord(submissionPath, submission.content),
      }
    })

    const totalDurationMs = Math.max(
      stages.reduce((total, stage) => total + stage.durationMs, 0),
      Math.ceil(performance.now() - measuredStart),
    )
    result = {
      executionId: randomUUID(),
      sequence,
      status: 'passed',
      runId: analysis.runId,
      analyzedEventId: candidate.eventId,
      startedAt: startedAt.toISOString(),
      completedAt: new Date(startedAt.getTime() + totalDurationMs).toISOString(),
      totalDurationMs,
      stageDurations: stages,
      provenanceMode: analysis.provenance?.mode,
      publicLabelsUsedAsDetectorInput: false,
      artifacts,
    }
  } finally {
    const stopped = await session.stop()
    if (stopped.timedOut) throw new Error('The local launcher required forced cleanup.')
  }
  return result
}

export async function runMeasuredDemo(options) {
  assertExactCleanCandidate(options.candidateCommit)
  const slice = loadSlice(options.manifest)
  if (existsSync(options.output)) {
    throw new Error('Demo output directory must not already exist.')
  }
  const outputDirectory = ensureIgnoredOutputDirectory(options.output)
  const runs = []
  for (const sequence of [1, 2]) {
    runs.push(await runOnce({ sequence, slice, outputDirectory }))
  }
  const candidate = assertExactCleanCandidate(options.candidateCommit)
  const receipt = {
    schemaVersion: 1,
    receiptKind: 'h2_validation_slice_demo',
    recordedAt: new Date().toISOString(),
    candidateCommit: candidate.commit,
    targetEnvironment: {
      machine: 'local-redacted',
      os: process.platform,
      cpu: `${process.arch} (${cpus().length} logical processors; model redacted)`,
      nodeVersion: process.version,
    },
    servicesStartedBeforeTimer: true,
    timedScopeExcludes: ['installation', 'launcher_startup'],
    provenance: {
      mode: 'LIVE_ANALYSIS',
      scope: 'VALIDATION_SLICE',
      displayLabel: 'LIVE_ANALYSIS · 验证集切片',
    },
    sourceHashes: {
      timeseries: slice.manifest.sources.timeseries.sha256,
      labels: slice.manifest.sources.labels.sha256,
      sliceManifest: sha256(slice.manifestBytes),
      detectorInput: sha256(slice.detectorBytes),
    },
    selectedEvent: slice.manifest.selectedEvent,
    runs,
    claims: {
      organizerScore: false,
      fullValidation: false,
      hiddenTest: false,
      deployment: false,
      productionProof: false,
      fixtureSubstitution: false,
    },
  }
  const receiptPath = resolve(outputDirectory, 'demo-receipt.json')
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8')
  const validation = await validateDemoReceipt({
    receiptPath,
    manifestPath: options.manifest,
    artifactsRoot: outputDirectory,
    expectedCommit: candidate.commit,
  })
  return {
    receipt,
    validation,
    receiptPath: repositoryRelativePath(receiptPath),
    artifactsRoot: repositoryRelativePath(outputDirectory),
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath.toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  try {
    const options = parseArguments(process.argv.slice(2))
    if (options.help) {
      printUsage()
    } else {
      const result = await runMeasuredDemo(options)
      console.log(JSON.stringify({
        status: 'passed',
        candidateCommit: result.receipt.candidateCommit,
        durationsMs: result.validation.durationsMs,
        receiptPath: result.receiptPath,
        artifactsRoot: result.artifactsRoot,
        timingScope: 'scripted local workflow; installation and launcher startup excluded',
        organizerScore: false,
      }))
    }
  } catch (error) {
    console.error(`ERROR ${error instanceof Error ? error.message : 'Measured demo failed.'}`)
    process.exitCode = 1
  }
}
