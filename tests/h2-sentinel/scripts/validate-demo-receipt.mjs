import { createHash } from 'node:crypto'
import { readFile, realpath, stat } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  REQUIRED_TIMESERIES_COLUMNS,
  isLabelColumn,
  parseCsv,
} from './prepare-validation-slice.mjs'

const MAX_DURATION_MS = 180_000
const PADDING_MS = 30 * 60 * 1000
const REQUIRED_STAGES = [
  'import',
  'analysis',
  'evidence_review',
  'human_review',
  'q09_report',
  'artifact_export',
]
const REQUIRED_DIAGNOSIS_SECTIONS = [
  '报告范围与数据来源',
  '异常概览',
  '证据链',
  '原因判断：事实与推断',
  '影响量化',
  '安全检查',
  '建议与人工确认',
  '人工复核记录',
  '版本与溯源',
  '安全声明与限制',
]
const SUBMISSION_HEADER = [
  'pred_event_id',
  'start_time',
  'end_time',
  'anomaly_code',
  'anomaly_subtype',
  'severity',
  'primary_control_object',
  'affected_equipment',
  'confidence',
  'evidence_json',
  'root_cause',
  'recommended_action',
  'primary_impact_metric',
  'estimated_impact_value',
  'first_detection_time',
  'requires_human_confirmation',
].join(',')

function fail(message) {
  throw new Error(message)
}

function parseArguments(argv) {
  const known = new Set([
    '--receipt',
    '--manifest',
    '--artifacts-root',
    '--expected-commit',
  ])
  const values = new Map()
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === '--help') return { help: true }
    if (!known.has(flag)) fail(`Unknown argument: ${flag}`)
    if (values.has(flag)) fail(`Duplicate argument: ${flag}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) fail(`Missing value for ${flag}`)
    values.set(flag, value)
    index += 1
  }
  for (const flag of known) {
    if (!values.has(flag)) fail(`Missing required argument: ${flag}`)
  }
  return {
    help: false,
    receiptPath: values.get('--receipt'),
    manifestPath: values.get('--manifest'),
    artifactsRoot: values.get('--artifacts-root'),
    expectedCommit: values.get('--expected-commit'),
  }
}

function printUsage() {
  console.log([
    'Usage:',
    '  node tests/h2-sentinel/scripts/validate-demo-receipt.mjs \\',
    '    --receipt <demo-receipt.json> \\',
    '    --manifest <validation-slice-manifest.json> \\',
    '    --artifacts-root <run-artifact-directory> \\',
    '    --expected-commit <40-character-commit-sha>',
  ].join('\n'))
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

function assertHash(value, label) {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    fail(`${label} must use the sha256:<64 lowercase hex> format.`)
  }
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object.`)
  }
}

function assertExactKeys(value, expectedKeys, label) {
  assertObject(value, label)
  const actual = Object.keys(value).sort()
  const expected = [...expectedKeys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`${label} must contain exactly the documented fields.`)
  }
}

function assertString(value, label, maximumLength = 256) {
  if (
    typeof value !== 'string' ||
    value.trim() !== value ||
    value.length === 0 ||
    value.length > maximumLength ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    fail(`${label} must be a non-empty bounded string without control characters.`)
  }
}

function parseTimestamp(value, label) {
  assertString(value, label)
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    fail(`${label} must include an explicit timezone.`)
  }
  const milliseconds = Date.parse(value)
  if (!Number.isFinite(milliseconds)) fail(`${label} must be a valid ISO-8601 timestamp.`)
  return milliseconds
}

function isWithin(parent, candidate) {
  const pathFromParent = relative(parent, candidate)
  return (
    pathFromParent !== '' &&
    pathFromParent !== '..' &&
    !pathFromParent.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromParent)
  )
}

function assertSafeRelativePath(value, label) {
  assertString(value, label)
  if (
    isAbsolute(value) ||
    value.includes('\0') ||
    value.split(/[\\/]+/).some((segment) => segment === '..' || segment === '')
  ) {
    fail(`${label} must be a normalized relative path.`)
  }
}

async function readBytes(path, label) {
  try {
    return await readFile(resolve(path))
  } catch {
    fail(`${label} could not be read.`)
  }
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(decodeUtf8(bytes, label))
  } catch {
    fail(`${label} must be valid UTF-8 JSON.`)
  }
}

function decodeUtf8(bytes, label) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    fail(`${label} must be valid UTF-8.`)
  }
}

async function artifactFile(artifactsRoot, relativePath, label) {
  assertSafeRelativePath(relativePath, `${label} relativePath`)
  let canonical
  try {
    canonical = await realpath(resolve(artifactsRoot, relativePath))
  } catch {
    fail(`${label} could not be resolved under the artifact root.`)
  }
  if (!isWithin(artifactsRoot, canonical)) {
    fail(`${label} must remain inside the artifact root.`)
  }
  let metadata
  try {
    metadata = await stat(canonical)
  } catch {
    fail(`${label} could not be inspected.`)
  }
  if (!metadata.isFile()) fail(`${label} must resolve to a file.`)
  return readBytes(canonical, label)
}

function validateManifest(manifest) {
  assertExactKeys(
    manifest,
    [
      'schemaVersion',
      'manifestKind',
      'scriptVersion',
      'generatedAt',
      'provenance',
      'sources',
      'selectedEvent',
      'slice',
      'overlappingLabels',
    ],
    'Slice manifest',
  )
  if (manifest.schemaVersion !== 1 || manifest.manifestKind !== 'h2_public_validation_slice') {
    fail('Slice manifest identity is invalid.')
  }
  assertString(manifest.scriptVersion, 'Slice manifest scriptVersion')
  parseTimestamp(manifest.generatedAt, 'Slice manifest generatedAt')
  assertExactKeys(manifest.provenance, ['mode', 'scope', 'displayLabel', 'limitations'], 'Slice provenance')
  if (
    manifest.provenance.mode !== 'LIVE_ANALYSIS' ||
    manifest.provenance.scope !== 'VALIDATION_SLICE' ||
    manifest.provenance.displayLabel !== 'LIVE_ANALYSIS · 验证集切片'
  ) {
    fail('Slice manifest must retain validation-slice provenance.')
  }
  if (!Array.isArray(manifest.provenance.limitations) || manifest.provenance.limitations.length < 3) {
    fail('Slice manifest must state bounded validation limitations.')
  }
  assertExactKeys(manifest.sources, ['timeseries', 'labels'], 'Slice sources')
  for (const [name, source] of Object.entries(manifest.sources)) {
    assertExactKeys(source, ['relativePath', 'sha256'], `Slice ${name} source`)
    assertSafeRelativePath(source.relativePath, `Slice ${name} source path`)
    assertHash(source.sha256, `Slice ${name} source hash`)
  }
  assertExactKeys(manifest.selectedEvent, ['eventId', 'code', 'startTime', 'endTime'], 'Slice selected event')
  assertString(manifest.selectedEvent.eventId, 'Slice selected event ID')
  if (manifest.selectedEvent.code !== 'C04') fail('Slice selected event must be C04.')
  const selectedStart = parseTimestamp(
    manifest.selectedEvent.startTime,
    'Slice selected event startTime',
  )
  const selectedEnd = parseTimestamp(
    manifest.selectedEvent.endTime,
    'Slice selected event endTime',
  )
  if (selectedEnd < selectedStart) fail('Slice selected event endTime must not precede startTime.')
  assertExactKeys(
    manifest.slice,
    [
      'filename',
      'requestedTimeRange',
      'observedTimeRange',
      'rowCount',
      'columns',
      'removedLabelColumns',
      'sha256',
    ],
    'Slice details',
  )
  if (manifest.slice.filename !== 'validation-slice.csv') {
    fail('Slice filename must be validation-slice.csv.')
  }
  assertExactKeys(
    manifest.slice.requestedTimeRange,
    ['startTime', 'endTime'],
    'Slice requested time range',
  )
  assertExactKeys(
    manifest.slice.observedTimeRange,
    ['startTime', 'endTime'],
    'Slice observed time range',
  )
  const requestedStart = parseTimestamp(
    manifest.slice.requestedTimeRange.startTime,
    'Slice requested startTime',
  )
  const requestedEnd = parseTimestamp(
    manifest.slice.requestedTimeRange.endTime,
    'Slice requested endTime',
  )
  const observedStart = parseTimestamp(
    manifest.slice.observedTimeRange.startTime,
    'Slice observed startTime',
  )
  const observedEnd = parseTimestamp(
    manifest.slice.observedTimeRange.endTime,
    'Slice observed endTime',
  )
  if (requestedStart !== selectedStart - PADDING_MS || requestedEnd !== selectedEnd + PADDING_MS) {
    fail('Slice requested time range must pad the selected event by exactly 30 minutes.')
  }
  if (observedStart < requestedStart || observedEnd > requestedEnd || observedEnd < observedStart) {
    fail('Slice observed time range must be ordered and remain inside the requested range.')
  }
  if (!Number.isInteger(manifest.slice.rowCount) || manifest.slice.rowCount < 2) {
    fail('Slice manifest rowCount must be an integer of at least two.')
  }
  if (!Array.isArray(manifest.slice.columns) || !manifest.slice.columns.includes('timestamp')) {
    fail('Slice manifest must list the detector timestamp column.')
  }
  manifest.slice.columns.forEach((column) => assertString(column, 'Slice detector column', 128))
  if (new Set(manifest.slice.columns).size !== manifest.slice.columns.length) {
    fail('Slice detector columns must be unique.')
  }
  if (!Array.isArray(manifest.slice.removedLabelColumns)) {
    fail('Slice manifest must record removed label columns.')
  }
  manifest.slice.removedLabelColumns.forEach((column) =>
    assertString(column, 'Slice removed label column', 128),
  )
  assertHash(manifest.slice.sha256, 'Detector input hash')
  if (!Array.isArray(manifest.overlappingLabels) || manifest.overlappingLabels.length === 0) {
    fail('Slice manifest must retain overlapping public labels outside detector input.')
  }
}

function validateDetectorInput(bytes, manifest) {
  if (sha256(bytes) !== manifest.slice.sha256) {
    fail('Detector input SHA-256 does not match the slice manifest.')
  }
  const csv = parseCsv(decodeUtf8(bytes, 'Detector input'), 'Detector input')
  if (JSON.stringify(csv.headers) !== JSON.stringify(manifest.slice.columns)) {
    fail('Detector input columns do not match the slice manifest.')
  }
  if (csv.rows.length !== manifest.slice.rowCount) {
    fail('Detector input row count does not match the slice manifest.')
  }
  if (csv.headers.some(isLabelColumn)) {
    fail('Detector input must not contain public label columns.')
  }
  if (REQUIRED_TIMESERIES_COLUMNS.some((column) => !csv.headers.includes(column))) {
    fail('Detector input is missing a required timeseries column.')
  }
  const timestampIndex = csv.headers.indexOf('timestamp')
  const numericColumns = REQUIRED_TIMESERIES_COLUMNS.filter((column) => column !== 'timestamp')
    .map((column) => ({ column, index: csv.headers.indexOf(column) }))
  let previousTimestamp = -Infinity
  const timestamps = csv.rows.map((row) => {
    const timestamp = parseTimestamp(row[timestampIndex], 'Detector input timestamp')
    if (timestamp <= previousTimestamp) {
      fail('Detector input timestamps must be strictly increasing and unique.')
    }
    for (const { column, index } of numericColumns) {
      const value = row[index].trim()
      if (value === '' || !Number.isFinite(Number(value))) {
        fail(`Detector input ${column} values must be finite numbers.`)
      }
    }
    previousTimestamp = timestamp
    return timestamp
  })
  if (
    new Date(timestamps[0]).toISOString() !== manifest.slice.observedTimeRange.startTime ||
    new Date(timestamps.at(-1)).toISOString() !== manifest.slice.observedTimeRange.endTime
  ) {
    fail('Detector input timestamps do not match the slice observed time range.')
  }
}

function validateReceiptShape(receipt) {
  assertExactKeys(
    receipt,
    [
      'schemaVersion',
      'receiptKind',
      'recordedAt',
      'candidateCommit',
      'targetEnvironment',
      'servicesStartedBeforeTimer',
      'timedScopeExcludes',
      'provenance',
      'sourceHashes',
      'selectedEvent',
      'runs',
      'claims',
    ],
    'Demo receipt',
  )
  if (receipt.schemaVersion !== 1 || receipt.receiptKind !== 'h2_validation_slice_demo') {
    fail('Demo receipt identity is invalid.')
  }
  parseTimestamp(receipt.recordedAt, 'Demo receipt recordedAt')
  if (!/^[a-f0-9]{40}$/.test(receipt.candidateCommit)) {
    fail('Demo receipt candidateCommit must be a full lowercase commit SHA.')
  }
  assertExactKeys(receipt.targetEnvironment, ['machine', 'os', 'cpu', 'nodeVersion'], 'Target environment')
  for (const [field, value] of Object.entries(receipt.targetEnvironment)) {
    assertString(value, `Target environment ${field}`)
  }
  if (receipt.servicesStartedBeforeTimer !== true) {
    fail('Demo receipt must disclose that services were started before timing.')
  }
  if (
    !Array.isArray(receipt.timedScopeExcludes) ||
    receipt.timedScopeExcludes.join(',') !== 'installation,launcher_startup'
  ) {
    fail('Demo receipt must exclude only installation and launcher startup from timing.')
  }
  assertExactKeys(receipt.provenance, ['mode', 'scope', 'displayLabel'], 'Demo provenance')
  if (
    receipt.provenance.mode !== 'LIVE_ANALYSIS' ||
    receipt.provenance.scope !== 'VALIDATION_SLICE' ||
    receipt.provenance.displayLabel !== 'LIVE_ANALYSIS · 验证集切片'
  ) {
    fail('Demo receipt must retain validation-slice provenance.')
  }
  assertExactKeys(
    receipt.sourceHashes,
    ['timeseries', 'labels', 'sliceManifest', 'detectorInput'],
    'Demo source hashes',
  )
  for (const [name, value] of Object.entries(receipt.sourceHashes)) {
    assertHash(value, `Demo ${name} hash`)
  }
  assertExactKeys(receipt.selectedEvent, ['eventId', 'code', 'startTime', 'endTime'], 'Demo selected event')
  if (receipt.selectedEvent.code !== 'C04') fail('Demo selected event must be C04.')
  assertString(receipt.selectedEvent.eventId, 'Demo selected event ID')
  parseTimestamp(receipt.selectedEvent.startTime, 'Demo selected event startTime')
  parseTimestamp(receipt.selectedEvent.endTime, 'Demo selected event endTime')
  assertExactKeys(
    receipt.claims,
    [
      'organizerScore',
      'fullValidation',
      'hiddenTest',
      'deployment',
      'productionProof',
      'fixtureSubstitution',
    ],
    'Demo claims',
  )
  if (Object.values(receipt.claims).some((value) => value !== false)) {
    fail('Demo receipt must keep every unsupported claim false.')
  }
  if (!Array.isArray(receipt.runs) || receipt.runs.length !== 2) {
    fail('Demo receipt must contain exactly two measured runs.')
  }
}

function validateStageDurations(stages, totalDurationMs, runLabel) {
  if (!Array.isArray(stages) || stages.length !== REQUIRED_STAGES.length) {
    fail(`${runLabel} must contain the complete ordered stage list.`)
  }
  const names = stages.map((stage) => {
    assertExactKeys(stage, ['stage', 'durationMs'], `${runLabel} stage`)
    assertString(stage.stage, `${runLabel} stage name`)
    if (!Number.isInteger(stage.durationMs) || stage.durationMs <= 0) {
      fail(`${runLabel} stage duration must be a positive integer.`)
    }
    return stage.stage
  })
  if (names.some((name, index) => name !== REQUIRED_STAGES[index])) {
    fail(`${runLabel} stages must use the documented order.`)
  }
  const stageTotal = stages.reduce((total, stage) => total + stage.durationMs, 0)
  if (stageTotal > totalDurationMs) {
    fail(`${runLabel} stage durations must not exceed the measured total.`)
  }
}

function validateHtml(content, label) {
  if (!/^<!doctype html>/i.test(content) || !/<html lang=["']zh-CN["']>/i.test(content)) {
    fail(`${label} must be a Simplified Chinese HTML document.`)
  }
  let previous = -1
  for (const heading of REQUIRED_DIAGNOSIS_SECTIONS) {
    const position = content.indexOf(heading)
    if (position <= previous) fail(`${label} is missing the required ordered Chinese sections.`)
    previous = position
  }
  if (!content.includes('所有操作建议均须人工确认')) {
    fail(`${label} must retain the human-confirmation safety boundary.`)
  }
  if (/<script\b|https?:\/\//i.test(content)) {
    fail(`${label} must not contain scripts or remote resources.`)
  }
}

function validateAudit(content, runId, label) {
  let value
  try {
    value = JSON.parse(content)
  } catch {
    fail(`${label} must contain valid JSON.`)
  }
  if (
    value.exportKind !== 'event_review_audit' ||
    value.runId !== runId ||
    value.actorIdentityNotice !== 'local_operator_labels_are_unverified' ||
    !Array.isArray(value.events)
  ) {
    fail(`${label} does not match the review-audit contract.`)
  }
}

function validateSubmission(content, analyzedEventId, label) {
  const firstLine = content.split(/\r?\n/, 1)[0]
  if (firstLine !== SUBMISSION_HEADER) {
    fail(`${label} must preserve the exact 16-column submission header.`)
  }
  const escapedId = analyzedEventId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (!new RegExp(`(?:^|\\r?\\n)${escapedId},`).test(content)) {
    fail(`${label} must retain the analyzed event identity.`)
  }
}

async function validateRun(run, expectedSequence, artifactsRoot, usedArtifactPaths) {
  const runLabel = `Measured run ${expectedSequence}`
  assertExactKeys(
    run,
    [
      'sequence',
      'status',
      'runId',
      'analyzedEventId',
      'startedAt',
      'completedAt',
      'totalDurationMs',
      'stageDurations',
      'provenanceMode',
      'publicLabelsUsedAsDetectorInput',
      'artifacts',
    ],
    runLabel,
  )
  if (run.sequence !== expectedSequence || run.status !== 'passed') {
    fail(`${runLabel} must be a passing run with the expected sequence.`)
  }
  assertString(run.runId, `${runLabel} runId`)
  assertString(run.analyzedEventId, `${runLabel} analyzedEventId`)
  const startedAt = parseTimestamp(run.startedAt, `${runLabel} startedAt`)
  const completedAt = parseTimestamp(run.completedAt, `${runLabel} completedAt`)
  if (!Number.isInteger(run.totalDurationMs) || run.totalDurationMs <= 0) {
    fail(`${runLabel} totalDurationMs must be a positive integer.`)
  }
  if (run.totalDurationMs >= MAX_DURATION_MS) {
    fail(`${runLabel} must complete in less than 180 seconds.`)
  }
  if (Math.abs(completedAt - startedAt - run.totalDurationMs) > 1_000) {
    fail(`${runLabel} timestamps must agree with totalDurationMs.`)
  }
  validateStageDurations(run.stageDurations, run.totalDurationMs, runLabel)
  if (run.provenanceMode !== 'LIVE_ANALYSIS' || run.publicLabelsUsedAsDetectorInput !== false) {
    fail(`${runLabel} must use Live analysis without passing public labels to the detector.`)
  }
  assertExactKeys(run.artifacts, ['diagnosisReport', 'reviewAudit', 'submissionCsv'], `${runLabel} artifacts`)

  const artifactBytes = {}
  for (const [name, artifact] of Object.entries(run.artifacts)) {
    assertExactKeys(artifact, ['relativePath', 'sha256'], `${runLabel} ${name}`)
    assertHash(artifact.sha256, `${runLabel} ${name} hash`)
    if (usedArtifactPaths.has(artifact.relativePath)) {
      fail('Each measured run must retain distinct artifact files.')
    }
    usedArtifactPaths.add(artifact.relativePath)
    const bytes = await artifactFile(artifactsRoot, artifact.relativePath, `${runLabel} ${name}`)
    if (sha256(bytes) !== artifact.sha256) {
      fail(`${runLabel} ${name} SHA-256 does not match the artifact bytes.`)
    }
    artifactBytes[name] = bytes
  }

  validateHtml(
    decodeUtf8(artifactBytes.diagnosisReport, `${runLabel} diagnosis report`),
    `${runLabel} diagnosis report`,
  )
  validateAudit(
    decodeUtf8(artifactBytes.reviewAudit, `${runLabel} review audit`),
    run.runId,
    `${runLabel} review audit`,
  )
  validateSubmission(
    decodeUtf8(artifactBytes.submissionCsv, `${runLabel} submission`),
    run.analyzedEventId,
    `${runLabel} submission`,
  )
  return { startedAt, completedAt, runId: run.runId, durationMs: run.totalDurationMs }
}

export async function validateDemoReceipt(options) {
  if (!/^[a-fA-F0-9]{40}$/.test(options.expectedCommit)) {
    fail('Expected commit must be a full 40-character commit SHA.')
  }
  const expectedCommit = options.expectedCommit.toLowerCase()
  let artifactsRoot
  try {
    artifactsRoot = await realpath(resolve(options.artifactsRoot))
  } catch {
    fail('Artifact root could not be resolved.')
  }
  let artifactsMetadata
  try {
    artifactsMetadata = await stat(artifactsRoot)
  } catch {
    fail('Artifact root could not be inspected.')
  }
  if (!artifactsMetadata.isDirectory()) fail('Artifact root must be a directory.')

  let manifestPath
  try {
    manifestPath = await realpath(resolve(options.manifestPath))
  } catch {
    fail('Slice manifest could not be resolved.')
  }
  const [receiptBytes, manifestBytes] = await Promise.all([
    readBytes(options.receiptPath, 'Demo receipt'),
    readBytes(manifestPath, 'Slice manifest'),
  ])
  const receipt = parseJson(receiptBytes, 'Demo receipt')
  const manifest = parseJson(manifestBytes, 'Slice manifest')
  validateReceiptShape(receipt)
  validateManifest(manifest)
  const detectorInputBytes = await artifactFile(
    dirname(manifestPath),
    manifest.slice.filename,
    'Detector input',
  )
  validateDetectorInput(detectorInputBytes, manifest)

  if (receipt.candidateCommit !== expectedCommit) {
    fail('Demo receipt candidateCommit does not match the expected integrated commit.')
  }
  if (receipt.sourceHashes.sliceManifest !== sha256(manifestBytes)) {
    fail('Demo receipt sliceManifest hash does not match the manifest bytes.')
  }
  if (
    receipt.sourceHashes.timeseries !== manifest.sources.timeseries.sha256 ||
    receipt.sourceHashes.labels !== manifest.sources.labels.sha256 ||
    receipt.sourceHashes.detectorInput !== manifest.slice.sha256
  ) {
    fail('Demo receipt source hashes do not match the prepared slice manifest.')
  }
  if (JSON.stringify(receipt.selectedEvent) !== JSON.stringify(manifest.selectedEvent)) {
    fail('Demo receipt selected event does not match the prepared slice manifest.')
  }

  const usedArtifactPaths = new Set()
  const first = await validateRun(receipt.runs[0], 1, artifactsRoot, usedArtifactPaths)
  const second = await validateRun(receipt.runs[1], 2, artifactsRoot, usedArtifactPaths)
  if (first.runId === second.runId) fail('Measured runs must have distinct run IDs.')
  if (second.startedAt < first.completedAt) {
    fail('Measured run 2 must start after measured run 1 completes.')
  }
  return {
    status: 'valid',
    receiptKind: receipt.receiptKind,
    candidateCommit: receipt.candidateCommit,
    provenanceScope: receipt.provenance.scope,
    consecutiveRuns: 2,
    durationsMs: [first.durationMs, second.durationMs],
    eachUnder180Seconds: true,
    unsupportedClaims: receipt.claims,
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath.toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  try {
    const options = parseArguments(process.argv.slice(2))
    if (options.help) {
      printUsage()
    } else {
      const result = await validateDemoReceipt(options)
      console.log(JSON.stringify(result))
    }
  } catch (error) {
    console.error(`ERROR ${error instanceof Error ? error.message : 'Demo receipt validation failed.'}`)
    process.exitCode = 1
  }
}
