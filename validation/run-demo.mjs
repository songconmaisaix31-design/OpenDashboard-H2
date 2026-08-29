import { randomUUID } from 'node:crypto'
import {
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { cpus } from 'node:os'
import { fileURLToPath } from 'node:url'

import { validateSubmissionText } from './check-submission.mjs'
import { assertExactCleanCandidate } from './lib/candidate.mjs'
import { decodeUtf8Strict, parseCsvText } from './lib/csv.mjs'
import {
  ANOMALY_CODES,
  assertOfficialTimeseriesColumns,
  isLabelColumn,
  repositoryRoot,
} from './lib/official-contract.mjs'
import { freeLoopbackPort, requestEnvelope, startLauncher } from './lib/launcher.mjs'
import { toInstant } from './lib/metrics.mjs'
import { OFFICIAL_SOURCES, sha256 } from './lib/official-sources.mjs'
import {
  ensureIgnoredOutputDirectory,
  ensureIgnoredOutputPath,
  repositoryRelativePath,
  writeFileAtomic,
} from './lib/output.mjs'
import {
  assertAnalysisRun,
  assertImportedDataset,
  assertRendererProvenance,
  documentHasRequiredHumanConfirmation,
  hasRequiredHumanConfirmation,
  hasUnsafeAnswerText,
} from './lib/runtime-provenance.mjs'
import { validateDemoReceipt } from '../tests/h2-sentinel/scripts/validate-demo-receipt.mjs'

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
    '    --output <new-generated-artifacts-root>',
    '    --candidate-commit <40-character-clean-HEAD-sha>',
  ].join('\n'))
}

function safeErrorMessage(error) {
  const message = error instanceof Error ? error.message : ''
  return /\b(?:ENOENT|EACCES|EPERM)\b|(?:[A-Za-z]:[\\/]|\/home\/|\/Users\/)/.test(message)
    ? 'Measured demo could not access the required manifest, detector input, or generated artifact.'
    : message || 'Measured demo failed.'
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
  let manifestBytes
  try {
    manifestBytes = readFileSync(manifestPath)
  } catch {
    throw new Error('Slice manifest could not be read.')
  }
  let manifest
  try {
    manifest = JSON.parse(decodeUtf8Strict(manifestBytes, 'Slice manifest'))
  } catch {
    throw new Error('Slice manifest must be valid UTF-8 JSON.')
  }
  if (
    manifest.schemaVersion !== 1 ||
    manifest.manifestKind !== 'h2_public_validation_slice' ||
    manifest.selectedEvent?.code !== 'C04' ||
    manifest.provenance?.scope !== 'VALIDATION_SLICE'
  ) {
    throw new Error('Slice manifest identity is invalid.')
  }
  const official = OFFICIAL_SOURCES.validation
  const timeseriesSource = manifest.sources?.timeseries
  const labelSource = manifest.sources?.labels
  if (
    timeseriesSource?.sha256 !== official.timeseries.sha256 ||
    basename(timeseriesSource.relativePath ?? '') !== official.timeseries.filename ||
    timeseriesSource.rowCount !== official.timeseries.rowCount ||
    timeseriesSource.firstTimestamp !== official.timeseries.firstTimestamp ||
    timeseriesSource.lastTimestamp !== official.timeseries.lastTimestamp ||
    labelSource?.sha256 !== official.labels.sha256 ||
    basename(labelSource.relativePath ?? '') !== official.labels.filename ||
    labelSource.rowCount !== official.labels.rowCount ||
    labelSource.eventCount !== official.labels.eventCount ||
    labelSource.uniqueEventIdCount !== official.labels.eventCount ||
    labelSource.firstStart !== official.labels.firstStart ||
    labelSource.lastEnd !== official.labels.lastEnd ||
    Object.entries(official.labels.byCode).some(
      ([code, count]) => labelSource.byCode?.[code] !== count,
    )
  ) throw new Error('Slice manifest source identity is not the verified official validation source.')
  const overlappingIdentities = manifest.overlappingLabels?.map(
    ({ eventId, code, startTime, endTime }) => ({ eventId, code, startTime, endTime }),
  )
  if (
    JSON.stringify(manifest.selectedEvent) !==
      JSON.stringify(official.directedDemo.selectedEvent) ||
    JSON.stringify(overlappingIdentities) !==
      JSON.stringify(official.directedDemo.overlappingLabels)
  ) throw new Error('Slice manifest directed event does not match the verified official labels.')
  const detectorPath = safeManifestFile(manifestPath, manifest.slice?.filename)
  let detectorBytes
  try {
    detectorBytes = readFileSync(detectorPath)
  } catch {
    throw new Error('Detector input validation-slice.csv could not be read.')
  }
  if (sha256(detectorBytes) !== manifest.slice.sha256) {
    throw new Error('Detector input hash does not match the slice manifest.')
  }
  const detectorText = decodeUtf8Strict(detectorBytes, 'Detector input')
  const detector = parseCsvText(detectorText, 'Detector input')
  assertOfficialTimeseriesColumns(detector.columns)
  if (detector.columns.some(isLabelColumn)) {
    throw new Error('Detector input contains a public label column.')
  }
  const timestampIndex = detector.columns.indexOf('timestamp')
  const firstTimestamp = detector.rows[0]?.[timestampIndex]
  const lastTimestamp = detector.rows.at(-1)?.[timestampIndex]
  if (
    detector.rows.length !== manifest.slice.rowCount ||
    toInstant(firstTimestamp) !== toInstant(manifest.slice.observedTimeRange?.startTime) ||
    toInstant(lastTimestamp) !== toInstant(manifest.slice.observedTimeRange?.endTime)
  ) throw new Error('Detector input row count or observed range does not match the slice manifest.')
  return {
    manifest,
    manifestBytes,
    detectorBytes,
    detectorText,
    detectorRowCount: detector.rows.length,
    detectorFingerprint: sha256(detectorBytes),
  }
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

function escapeHtmlText(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

export function assertQ09Answer(
  answer,
  {
    runId,
    eventId,
    sourceFilename,
    fingerprint,
    displayLabel,
    analysisProvenance,
    completedAt,
    expectedCode,
    evidenceIds,
  },
) {
  const report = answer?.generatedReport
  const descriptor = report?.descriptor
  if (
    answer?.schemaVersion !== 1 ||
    answer.questionId !== 'Q09' ||
    answer.runId !== runId ||
    answer.eventId !== eventId ||
    answer.mode !== 'DETERMINISTIC_TEMPLATE' ||
    answer.generatedAt !== completedAt ||
    answer.refusedControlClaim !== true ||
    descriptor?.schemaVersion !== 1 ||
    descriptor.runId !== runId ||
    descriptor.eventId !== eventId ||
    descriptor.kind !== 'single_event_diagnosis' ||
    descriptor.format !== 'html' ||
    descriptor.status !== 'ready' ||
    descriptor.generatedAt !== completedAt ||
    expectedCode !== 'C04' ||
    report.mediaType !== 'text/html' ||
    typeof descriptor.reportId !== 'string' || descriptor.reportId.trim() === '' ||
    typeof descriptor.filename !== 'string' || !descriptor.filename.endsWith('-diagnosis.html')
  ) throw new Error('Q09 answer and single-event diagnosis identity do not match the measured run.')
  assertArtifactHash(report, 'Q09 diagnosis report')
  assertRendererProvenance(
    answer.provenance,
    analysisProvenance,
    completedAt,
    'deterministic-assistant-p1-v1',
    'Q09 answer provenance',
  )
  assertRendererProvenance(
    descriptor.provenance,
    analysisProvenance,
    completedAt,
    'jinja-report-p1-v1',
    'Q09 report provenance',
  )
  const reportCitations = Array.isArray(answer.citations)
    ? answer.citations.filter(({ sourceType }) => sourceType === 'report')
    : []
  if (
    reportCitations.length !== 1 ||
    reportCitations[0].sourceId !== descriptor.reportId ||
    reportCitations[0].eventId !== eventId ||
    !Array.isArray(answer.sections) ||
    !answer.sections.some((section) =>
      Array.isArray(section.citationIds) &&
      section.citationIds.includes(reportCitations[0].citationId))
  ) throw new Error('Q09 must contain exactly one matching report citation.')
  if (answer.sections.some((section) => hasUnsafeAnswerText(section?.text))) {
    throw new Error('Q09 answer sections contain unsafe safety or control language.')
  }
  if (
    typeof descriptor.safetyDisclaimer !== 'string' ||
    !hasRequiredHumanConfirmation(descriptor.safetyDisclaimer) ||
    !documentHasRequiredHumanConfirmation(report.content)
  ) throw new Error('Q09 must retain the required human-confirmation text.')
  for (const requiredBinding of [eventId, sourceFilename, fingerprint, displayLabel]) {
    if (!report.content.includes(requiredBinding)) {
      throw new Error('Q09 diagnosis report does not bind the selected event and actual service provenance.')
    }
  }
  if (
    !Array.isArray(evidenceIds) || evidenceIds.length === 0 ||
    new Set(evidenceIds).size !== evidenceIds.length ||
    !report.content.includes(
      `<code>${escapeHtmlText(eventId)}</code> · ${expectedCode} /`,
    ) ||
    evidenceIds.some((evidenceId) =>
      typeof evidenceId !== 'string' || evidenceId.trim() === '' ||
      !report.content.includes(`<code>${escapeHtmlText(evidenceId)}</code>`))
  ) {
    throw new Error('Q09 diagnosis report does not bind the selected C04 evidence identities.')
  }
  return {
    schemaVersion: answer.schemaVersion,
    answerId: answer.answerId,
    runId: answer.runId,
    questionId: answer.questionId,
    mode: answer.mode,
    generatedAt: answer.generatedAt,
    eventId: answer.eventId,
    sections: answer.sections,
    citations: answer.citations,
    refusedControlClaim: answer.refusedControlClaim,
    provenance: answer.provenance,
    generatedReport: {
      descriptor,
      mediaType: report.mediaType,
    },
  }
}

export function assertEvidenceReviewIdentity(event, runId, eventId, expectedCode) {
  if (
    event?.eventId !== eventId ||
    expectedCode !== 'C04' || event.code !== expectedCode ||
    !ANOMALY_CODES.includes(event.code) ||
    !Array.isArray(event.evidence) || event.evidence.length === 0
  ) {
    throw new Error('The evidence review does not match the selected run event.')
  }
  const evidenceIds = event.evidence.map((entry) => entry?.evidenceId)
  if (
    evidenceIds.some((id) => typeof id !== 'string' || id.trim() === '') ||
    new Set(evidenceIds).size !== evidenceIds.length
  ) throw new Error('The selected event has invalid detector evidence identities.')
  return {
    runId,
    eventId,
    anomalyCode: event.code,
    evidenceIds,
    evidenceCount: evidenceIds.length,
  }
}

export function assertHumanReviewIdentity(receipt, request) {
  const entry = receipt?.entry
  const review = receipt?.review
  const actorKeys = entry?.actor !== null && typeof entry?.actor === 'object'
    ? Object.keys(entry.actor).sort()
    : []
  if (
    receipt?.schemaVersion !== 1 || receipt.replayed !== false ||
    entry?.requestId !== request.requestId || entry.action !== request.action ||
    entry.revision !== 1 || actorKeys.join(',') !== 'displayName,kind' ||
    entry.actor.kind !== request.actor.kind ||
    entry.actor.displayName !== request.actor.displayName ||
    review?.runId !== request.runId || review.eventId !== request.eventId ||
    review.currentState !== 'confirmed' || review.revision !== entry.revision
  ) throw new Error('Human review receipt identity does not match the measured confirmation.')
  return {
    runId: review.runId,
    eventId: review.eventId,
    requestId: entry.requestId,
    action: entry.action,
    revision: entry.revision,
    actor: entry.actor,
    replayed: receipt.replayed,
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
  mkdirSync(runDirectory, { recursive: false })
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
    const importedDataset = assertImportedDataset(imported, {
      filename: 'validation-slice.csv',
      rowCount: slice.detectorRowCount,
      fingerprint: slice.detectorFingerprint,
    })
    const analysis = await measuredStage(stages, 'analysis', () =>
      requestEnvelope(
        session.ready.analyticsUrl,
        '/api/v1/h2-sentinel/datasets:analyze',
        { datasetId: imported.dataset.datasetId },
      ),
    )
    const analysisRun = assertAnalysisRun(analysis, imported)
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
    const evidenceReview = assertEvidenceReviewIdentity(
      evidenceEvent,
      analysis.runId,
      candidate.eventId,
      slice.manifest.selectedEvent.code,
    )
    const evidenceResponseContent = `${JSON.stringify(evidenceEvent, null, 2)}\n`

    const reviewRequest = {
      schemaVersion: 1,
      requestId: `demo-${sequence}-${randomUUID()}`,
      runId: analysis.runId,
      eventId: candidate.eventId,
      action: 'confirm',
      expectedRevision: 0,
      actor: { kind: 'local_operator', displayName: 'demo_operator' },
      note: 'Measured local demo review; actor label is unverified.',
    }
    const review = await measuredStage(stages, 'human_review', () =>
      requestEnvelope(
        session.ready.analyticsUrl,
        `/api/v1/h2-sentinel/runs/${encodeURIComponent(analysis.runId)}/events/${
          encodeURIComponent(candidate.eventId)
        }:review`,
        reviewRequest,
      ),
    )
    const humanReview = assertHumanReviewIdentity(review, reviewRequest)

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
    const q09 = assertQ09Answer(answer, {
      runId: analysis.runId,
      eventId: candidate.eventId,
      sourceFilename: importedDataset.sourceFilename,
      fingerprint: analysisRun.fingerprint,
      displayLabel: 'LIVE_ANALYSIS · 验证集切片',
      analysisProvenance: analysisRun.provenance,
      completedAt: analysisRun.completedAt,
      expectedCode: slice.manifest.selectedEvent.code,
      evidenceIds: evidenceReview.evidenceIds,
    })

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
      const evidencePath = `${runDirectoryName}/evidence-response.json`
      const auditPath = `${runDirectoryName}/review-audit.json`
      const submissionPath = `${runDirectoryName}/submission.csv`
      writeFileAtomic(resolve(outputDirectory, diagnosisPath), answer.generatedReport.content)
      writeFileAtomic(resolve(outputDirectory, evidencePath), evidenceResponseContent)
      writeFileAtomic(resolve(outputDirectory, auditPath), audit.content)
      writeFileAtomic(resolve(outputDirectory, submissionPath), submission.content)
      return {
        diagnosisReport: artifactRecord(diagnosisPath, answer.generatedReport.content),
        evidenceResponse: artifactRecord(evidencePath, evidenceResponseContent),
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
      importedDataset,
      analysisRun,
      evidenceReview: {
        ...evidenceReview,
        artifact: { ...artifacts.evidenceResponse },
      },
      humanReview,
      q09,
      publicLabelsUsedAsDetectorInput: false,
      artifacts,
    }
  } finally {
    const stopped = await session.stop()
    if (stopped.timedOut) throw new Error('The local launcher required forced cleanup.')
  }
  return result
}

function pathContains(parent, candidate) {
  const value = relative(parent, candidate)
  return value === '' || (!isAbsolute(value) && value !== '..' && !value.startsWith(`..${sep}`))
}

export async function runMeasuredDemo(options) {
  assertExactCleanCandidate(options.candidateCommit)
  const slice = loadSlice(options.manifest)
  const outputCandidate = ensureIgnoredOutputPath(options.output)
  const manifestDirectory = realpathSync(dirname(options.manifest))
  if (
    pathContains(manifestDirectory, outputCandidate) ||
    pathContains(outputCandidate, manifestDirectory)
  ) throw new Error('Demo artifacts root must be fresh and separate from the slice manifest directory.')
  const outputDirectory = ensureIgnoredOutputDirectory(outputCandidate)
  const runs = []
  for (const sequence of [1, 2]) {
    runs.push(await runOnce({ sequence, slice, outputDirectory }))
    assertExactCleanCandidate(options.candidateCommit)
  }
  const candidate = assertExactCleanCandidate(options.candidateCommit)
  const receipt = {
    schemaVersion: 2,
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
    verifiedManifestScope: {
      scope: 'VALIDATION_SLICE',
      displayLabel: 'LIVE_ANALYSIS · 验证集切片',
      publicLabelsMaySelectDirectedDemoBeforeAnalysis: true,
      publicLabelsUsedAsDetectorInput: false,
      sourceIdentity: slice.manifest.sources,
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
  writeFileAtomic(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`)
  const validation = await validateDemoReceipt({
    receiptPath,
    manifestPath: options.manifest,
    artifactsRoot: outputDirectory,
    expectedCommit: candidate.commit,
  })
  assertExactCleanCandidate(candidate.commit)
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
    console.error(`ERROR ${safeErrorMessage(error)}`)
    process.exitCode = 1
  }
}
