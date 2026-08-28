import { createHash } from 'node:crypto'
import { readFile, realpath, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateSubmissionText } from '../../../validation/check-submission.mjs'
import { assertOfficialTimeseriesColumns } from '../../../validation/lib/official-contract.mjs'
import { OFFICIAL_SOURCES } from '../../../validation/lib/official-sources.mjs'
import { toCanonicalUtcInstant, toInstant } from '../../../validation/lib/metrics.mjs'
import { hasRequiredHumanConfirmation } from '../../../validation/lib/runtime-provenance.mjs'
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
    '  node tests/h2-sentinel/scripts/validate-demo-receipt.mjs `',
    '    --receipt <demo-receipt.json> `',
    '    --manifest <validation-slice-manifest.json> `',
    '    --artifacts-root <run-artifact-directory> `',
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
  const milliseconds = toInstant(value)
  if (!Number.isFinite(milliseconds)) fail(`${label} must be a valid ISO-8601 timestamp.`)
  return milliseconds
}

function parseCanonicalTimestamp(value, label) {
  assertString(value, label)
  const milliseconds = toCanonicalUtcInstant(value)
  if (!Number.isFinite(milliseconds)) {
    fail(`${label} must be a canonical ISO UTC calendar timestamp.`)
  }
  return milliseconds
}

function validateCanonicalRange(range, label) {
  assertExactKeys(range, ['startTime', 'endTime'], label)
  const start = parseCanonicalTimestamp(range.startTime, `${label} startTime`)
  const end = parseCanonicalTimestamp(range.endTime, `${label} endTime`)
  if (start > end) fail(`${label} startTime must not follow endTime.`)
  return { start, end }
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

function expectedVerifiedScope(sourceContract) {
  return sourceContract.verifiedScope ?? {
    mode: 'LIVE_ANALYSIS',
    scope: 'VALIDATION_SLICE',
    displayLabel: 'LIVE_ANALYSIS · 验证集切片',
  }
}

function validateManifest(manifest, sourceContract) {
  const verifiedScope = expectedVerifiedScope(sourceContract)
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
    manifest.provenance.mode !== verifiedScope.mode ||
    manifest.provenance.scope !== verifiedScope.scope ||
    manifest.provenance.displayLabel !== verifiedScope.displayLabel
  ) {
    fail('Slice manifest must retain the independently verified source scope.')
  }
  if (!Array.isArray(manifest.provenance.limitations) || manifest.provenance.limitations.length < 3) {
    fail('Slice manifest must state bounded validation limitations.')
  }
  assertExactKeys(manifest.sources, ['timeseries', 'labels'], 'Slice sources')
  assertExactKeys(
    manifest.sources.timeseries,
    ['relativePath', 'sha256', 'rowCount', 'firstTimestamp', 'lastTimestamp'],
    'Slice timeseries source',
  )
  assertExactKeys(
    manifest.sources.labels,
    [
      'relativePath', 'sha256', 'rowCount', 'eventCount', 'uniqueEventIdCount',
      'firstStart', 'lastEnd', 'byCode',
    ],
    'Slice label source',
  )
  for (const [name, source] of Object.entries(manifest.sources)) {
    assertSafeRelativePath(source.relativePath, `Slice ${name} source path`)
    assertHash(source.sha256, `Slice ${name} source hash`)
  }
  if (
    basename(manifest.sources.timeseries.relativePath) !== sourceContract.timeseries.filename ||
    manifest.sources.timeseries.sha256 !== sourceContract.timeseries.sha256 ||
    manifest.sources.timeseries.rowCount !== sourceContract.timeseries.rowCount ||
    manifest.sources.timeseries.firstTimestamp !== sourceContract.timeseries.firstTimestamp ||
    manifest.sources.timeseries.lastTimestamp !== sourceContract.timeseries.lastTimestamp ||
    basename(manifest.sources.labels.relativePath) !== sourceContract.labels.filename ||
    manifest.sources.labels.sha256 !== sourceContract.labels.sha256 ||
    manifest.sources.labels.rowCount !== sourceContract.labels.rowCount ||
    manifest.sources.labels.eventCount !== sourceContract.labels.eventCount ||
    manifest.sources.labels.uniqueEventIdCount !== sourceContract.labels.eventCount ||
    manifest.sources.labels.firstStart !== sourceContract.labels.firstStart ||
    manifest.sources.labels.lastEnd !== sourceContract.labels.lastEnd ||
    Object.entries(sourceContract.labels.byCode).some(
      ([code, count]) => manifest.sources.labels.byCode?.[code] !== count,
    )
  ) fail('Slice manifest does not match the verified source identity.')
  const sourceRange = validateCanonicalRange({
    startTime: manifest.sources.timeseries.firstTimestamp,
    endTime: manifest.sources.timeseries.lastTimestamp,
  }, 'Slice timeseries source range')
  validateCanonicalRange({
    startTime: manifest.sources.labels.firstStart,
    endTime: manifest.sources.labels.lastEnd,
  }, 'Slice label source range')
  assertExactKeys(manifest.selectedEvent, ['eventId', 'code', 'startTime', 'endTime'], 'Slice selected event')
  assertString(manifest.selectedEvent.eventId, 'Slice selected event ID')
  if (manifest.selectedEvent.code !== 'C04') fail('Slice selected event must be C04.')
  const selectedStart = parseCanonicalTimestamp(
    manifest.selectedEvent.startTime,
    'Slice selected event startTime',
  )
  const selectedEnd = parseCanonicalTimestamp(
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
  const { start: requestedStart, end: requestedEnd } = validateCanonicalRange(
    manifest.slice.requestedTimeRange,
    'Slice requested time range',
  )
  const observedRange = validateCanonicalRange(
    manifest.slice.observedTimeRange,
    'Slice observed time range',
  )
  const { start: observedStart, end: observedEnd } = observedRange
  if (requestedStart !== selectedStart - PADDING_MS || requestedEnd !== selectedEnd + PADDING_MS) {
    fail('Slice requested time range must pad the selected event by exactly 30 minutes.')
  }
  if (observedStart < requestedStart || observedEnd > requestedEnd || observedEnd < observedStart) {
    fail('Slice observed time range must be ordered and remain inside the requested range.')
  }
  if (observedStart < sourceRange.start || observedEnd > sourceRange.end) {
    fail('Slice observed time range must remain inside the verified source range.')
  }
  if (!Number.isInteger(manifest.slice.rowCount) || manifest.slice.rowCount < 2) {
    fail('Slice manifest rowCount must be an integer of at least two.')
  }
  if (!Array.isArray(manifest.slice.columns)) fail('Slice manifest must list detector columns.')
  manifest.slice.columns.forEach((column) => assertString(column, 'Slice detector column', 128))
  try {
    assertOfficialTimeseriesColumns(manifest.slice.columns)
  } catch (error) {
    fail(error instanceof Error ? error.message : 'Slice detector columns are invalid.')
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
  const overlappingIdentities = manifest.overlappingLabels.map(
    ({ eventId, code, startTime, endTime }) => ({ eventId, code, startTime, endTime }),
  )
  if (
    JSON.stringify(manifest.selectedEvent) !==
      JSON.stringify(sourceContract.directedDemo?.selectedEvent) ||
    JSON.stringify(overlappingIdentities) !==
      JSON.stringify(sourceContract.directedDemo?.overlappingLabels)
  ) fail('Selected event and overlapping labels do not match the independent source contract.')
  return { sourceRange, observedRange }
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
  try {
    assertOfficialTimeseriesColumns(csv.headers)
  } catch (error) {
    fail(error instanceof Error ? error.message : 'Detector input columns are invalid.')
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
      if (
        value === '' ||
        !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) ||
        !Number.isFinite(Number(value))
      ) {
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

function validateReceiptShape(receipt, verifiedScope) {
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
      'verifiedManifestScope',
      'sourceHashes',
      'selectedEvent',
      'runs',
      'claims',
    ],
    'Demo receipt',
  )
  if (receipt.schemaVersion !== 2 || receipt.receiptKind !== 'h2_validation_slice_demo') {
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
  assertExactKeys(
    receipt.verifiedManifestScope,
    [
      'scope',
      'displayLabel',
      'publicLabelsMaySelectDirectedDemoBeforeAnalysis',
      'publicLabelsUsedAsDetectorInput',
      'sourceIdentity',
    ],
    'Verified manifest scope',
  )
  if (
    receipt.verifiedManifestScope.scope !== verifiedScope.scope ||
    receipt.verifiedManifestScope.displayLabel !== verifiedScope.displayLabel ||
    receipt.verifiedManifestScope.publicLabelsMaySelectDirectedDemoBeforeAnalysis !== true ||
    receipt.verifiedManifestScope.publicLabelsUsedAsDetectorInput !== false
  ) {
    fail('Demo receipt must distinguish verified manifest scope from service provenance.')
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
  validateCanonicalRange({
    startTime: receipt.selectedEvent.startTime,
    endTime: receipt.selectedEvent.endTime,
  }, 'Demo selected event range')
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

function validateHtml(content, label, bindings) {
  if (!/^<!doctype html>/i.test(content) || !/<html lang=["']zh-CN["']>/i.test(content)) {
    fail(`${label} must be a Simplified Chinese HTML document.`)
  }
  let previous = -1
  for (const heading of REQUIRED_DIAGNOSIS_SECTIONS) {
    const position = content.indexOf(heading)
    if (position <= previous) fail(`${label} is missing the required ordered Chinese sections.`)
    previous = position
  }
  if (!hasRequiredHumanConfirmation(content)) {
    fail(`${label} must retain the human-confirmation safety boundary.`)
  }
  if (/<script\b|https?:\/\//i.test(content)) {
    fail(`${label} must not contain scripts or remote resources.`)
  }
  for (const binding of [
    bindings.analyzedEventId,
    bindings.sourceFilename,
    bindings.fingerprint,
    bindings.displayLabel,
  ]) {
    if (!content.includes(binding)) {
      fail(`${label} must bind the selected event and actual source provenance.`)
    }
  }
}

function validateAudit(content, runId, analyzedEventId, humanReview, label) {
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
  const reviewed = value.events.find(
    (entry) => entry?.event?.eventId === analyzedEventId,
  )
  if (
    reviewed?.review?.currentState !== 'confirmed' ||
    reviewed.review.revision !== 1 ||
    !Array.isArray(reviewed.review.entries) ||
    !reviewed.review.entries.some((entry) =>
      entry?.requestId === humanReview.requestId &&
      entry.action === humanReview.action &&
      entry.revision === humanReview.revision &&
      JSON.stringify(entry.actor) === JSON.stringify(humanReview.actor))
  ) {
    fail(`${label} must retain the analyzed event at confirmed revision 1.`)
  }
}

function validateSubmission(content, analyzedEventId, label) {
  const result = validateSubmissionText(content)
  if (!result.valid) {
    fail(`${label} failed the official checker: ${result.issues.slice(0, 3).join(' | ')}`)
  }
  const firstLine = content.split(/\r?\n/, 1)[0]
  if (firstLine !== SUBMISSION_HEADER) {
    fail(`${label} must preserve the exact 16-column submission header.`)
  }
  const escapedId = analyzedEventId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (!new RegExp(`(?:^|\\r?\\n)${escapedId},`).test(content)) {
    fail(`${label} must retain the analyzed event identity.`)
  }
}

function validateLiveProvenance(provenance, label, fingerprint, kind) {
  assertExactKeys(
    provenance,
    [
      'mode', 'source', 'generatedAt', 'datasetFingerprint', 'modelVersion',
      'ruleVersion', 'configurationVersion', 'limitations',
    ],
    label,
  )
  if (
    provenance.mode !== 'LIVE_ANALYSIS' ||
    provenance.datasetFingerprint !== fingerprint ||
    typeof provenance.source !== 'string' || provenance.source.trim() === '' ||
    typeof provenance.ruleVersion !== 'string' || provenance.ruleVersion.trim() === '' ||
    typeof provenance.configurationVersion !== 'string' ||
    provenance.configurationVersion.trim() === '' ||
    !Array.isArray(provenance.limitations)
  ) fail(`${label} must retain complete actual LIVE_ANALYSIS provenance.`)
  parseTimestamp(provenance.generatedAt, `${label} generatedAt`)
  if (kind === 'import') {
    if (provenance.modelVersion !== null) fail(`${label} must define the import base identity.`)
  } else {
    assertString(provenance.modelVersion, `${label} modelVersion`)
  }
  provenance.limitations.forEach((entry) => assertString(entry, `${label} limitation`, 512))
  return provenance
}

function sameBaseProvenance(left, right) {
  return (
    left.mode === right.mode && left.source === right.source &&
    left.generatedAt === right.generatedAt &&
    left.datasetFingerprint === right.datasetFingerprint &&
    left.modelVersion === right.modelVersion &&
    left.ruleVersion === right.ruleVersion &&
    left.configurationVersion === right.configurationVersion &&
    left.limitations.length === right.limitations.length &&
    left.limitations.every((entry, index) => entry === right.limitations[index])
  )
}

function validateRendererProvenance(provenance, label, analysisProvenance, rendererVersion) {
  assertExactKeys(
    provenance,
    [
      'mode', 'source', 'generatedAt', 'datasetFingerprint', 'modelVersion',
      'ruleVersion', 'configurationVersion', 'rendererVersion', 'limitations',
    ],
    label,
  )
  if (
    provenance.mode !== 'LIVE_ANALYSIS' ||
    provenance.rendererVersion !== rendererVersion ||
    !sameBaseProvenance(provenance, analysisProvenance)
  ) fail(`${label} must retain complete actual LIVE_ANALYSIS renderer provenance.`)
  assertString(provenance.source, `${label} source`)
  assertString(provenance.ruleVersion, `${label} ruleVersion`)
  assertString(provenance.configurationVersion, `${label} configurationVersion`)
  parseTimestamp(provenance.generatedAt, `${label} generatedAt`)
  if (!Array.isArray(provenance.limitations) || provenance.limitations.length === 0) {
    fail(`${label} must retain non-empty limitations.`)
  }
  provenance.limitations.forEach((entry) => assertString(entry, `${label} limitation`, 512))
}

function validateQ09Binding(q09, expected, label) {
  assertExactKeys(
    q09,
    [
      'schemaVersion', 'answerId', 'runId', 'questionId', 'mode', 'generatedAt',
      'eventId', 'sections', 'citations', 'refusedControlClaim', 'provenance',
      'generatedReport',
    ],
    label,
  )
  if (
    q09.schemaVersion !== 1 || q09.questionId !== 'Q09' ||
    q09.runId !== expected.runId || q09.eventId !== expected.eventId ||
    q09.mode !== 'DETERMINISTIC_TEMPLATE' || q09.refusedControlClaim !== true
  ) fail(`${label} must bind exact Q09, runId, eventId, and deterministic mode.`)
  assertString(q09.answerId, `${label} answerId`)
  parseTimestamp(q09.generatedAt, `${label} generatedAt`)
  validateRendererProvenance(
    q09.provenance,
    `${label} answer provenance`,
    expected.analysisProvenance,
    'deterministic-assistant-p1-v1',
  )

  if (!Array.isArray(q09.sections) || q09.sections.length === 0) {
    fail(`${label} must retain answer sections.`)
  }
  if (!Array.isArray(q09.citations) || q09.citations.length === 0) {
    fail(`${label} must retain answer citations.`)
  }
  const citationById = new Map()
  for (const citation of q09.citations) {
    const keys = citation?.eventId === undefined
      ? ['citationId', 'claimKind', 'sourceType', 'sourceId']
      : ['citationId', 'claimKind', 'sourceType', 'sourceId', 'eventId']
    assertExactKeys(citation, keys, `${label} citation`)
    assertString(citation.citationId, `${label} citationId`)
    assertString(citation.sourceId, `${label} citation sourceId`)
    if (
      !['fact', 'calculation', 'inference', 'recommendation'].includes(citation.claimKind) ||
      ![
        'event', 'evidence', 'constraint', 'variable', 'knowledge_base', 'report',
      ].includes(citation.sourceType)
    ) fail(`${label} citation vocabulary is invalid.`)
    if (citationById.has(citation.citationId)) fail(`${label} citation IDs must be unique.`)
    citationById.set(citation.citationId, citation)
  }
  const referencedCitationIds = new Set()
  for (const section of q09.sections) {
    assertExactKeys(
      section,
      ['sectionId', 'claimKind', 'text', 'citationIds'],
      `${label} section`,
    )
    assertString(section.sectionId, `${label} sectionId`)
    assertString(section.text, `${label} section text`, 1_024)
    if (!['fact', 'calculation', 'inference', 'recommendation'].includes(section.claimKind)) {
      fail(`${label} section claim kind is invalid.`)
    }
    if (!Array.isArray(section.citationIds) || section.citationIds.length === 0) {
      fail(`${label} sections must cite their sources.`)
    }
    if (new Set(section.citationIds).size !== section.citationIds.length) {
      fail(`${label} section citation IDs must be unique.`)
    }
    for (const citationId of section.citationIds) {
      assertString(citationId, `${label} section citationId`)
      if (!citationById.has(citationId)) fail(`${label} contains a dangling citation.`)
      if (citationById.get(citationId).claimKind !== section.claimKind) {
        fail(`${label} citation claim kind does not match its section.`)
      }
      referencedCitationIds.add(citationId)
    }
  }
  if (
    referencedCitationIds.size !== citationById.size ||
    [...citationById.keys()].some((citationId) => !referencedCitationIds.has(citationId))
  ) fail(`${label} must bind every citation to an answer section.`)

  assertExactKeys(q09.generatedReport, ['descriptor', 'mediaType'], `${label} report`)
  if (q09.generatedReport.mediaType !== 'text/html') {
    fail(`${label} report mediaType must be text/html.`)
  }
  const descriptor = q09.generatedReport.descriptor
  assertExactKeys(
    descriptor,
    [
      'schemaVersion', 'reportId', 'runId', 'kind', 'format', 'status',
      'generatedAt', 'filename', 'contentHash', 'eventId', 'warnings',
      'safetyDisclaimer', 'provenance',
    ],
    `${label} report descriptor`,
  )
  if (
    descriptor.schemaVersion !== 1 || descriptor.runId !== expected.runId ||
    descriptor.eventId !== expected.eventId ||
    descriptor.kind !== 'single_event_diagnosis' || descriptor.format !== 'html' ||
    descriptor.status !== 'ready' || descriptor.contentHash !== expected.diagnosisHash
  ) fail(`${label} report descriptor or content hash does not match the measured artifact.`)
  assertString(descriptor.reportId, `${label} reportId`)
  assertString(descriptor.filename, `${label} report filename`)
  if (!/^[^\\/]+-diagnosis\.html$/.test(descriptor.filename)) {
    fail(`${label} report filename must identify a diagnosis HTML artifact.`)
  }
  assertHash(descriptor.contentHash, `${label} report content hash`)
  parseTimestamp(descriptor.generatedAt, `${label} report generatedAt`)
  if (!Array.isArray(descriptor.warnings)) fail(`${label} report warnings must be an array.`)
  descriptor.warnings.forEach((warning) => assertString(warning, `${label} report warning`, 512))
  assertString(descriptor.safetyDisclaimer, `${label} safety disclaimer`, 512)
  if (!hasRequiredHumanConfirmation(descriptor.safetyDisclaimer)) {
    fail(`${label} must retain the required human-confirmation disclaimer.`)
  }
  validateRendererProvenance(
    descriptor.provenance,
    `${label} report provenance`,
    expected.analysisProvenance,
    'jinja-report-p1-v1',
  )
  const reportCitations = q09.citations.filter(({ sourceType }) => sourceType === 'report')
  if (
    reportCitations.length !== 1 ||
    reportCitations[0].sourceId !== descriptor.reportId ||
    reportCitations[0].eventId !== expected.eventId
  ) fail(`${label} must retain exactly one matching report citation.`)
  if (!q09.sections.some(({ text }) => hasRequiredHumanConfirmation(text))) {
    fail(`${label} must retain required human-confirmation answer text.`)
  }
}

function validateRuntimeIdentity(identity, kind, detector, label) {
  const idField = kind === 'import' ? 'datasetId' : 'runId'
  assertExactKeys(
    identity,
    [idField, 'sourceFilename', 'rowCount', 'fingerprint', 'timeRange', 'provenance'],
    label,
  )
  assertString(identity[idField], `${label} ${idField}`)
  if (
    identity.sourceFilename !== 'validation-slice.csv' ||
    identity.rowCount !== detector.rowCount ||
    identity.fingerprint !== detector.fingerprint
  ) fail(`${label} does not match the verified detector input identity.`)
  const timeRange = validateCanonicalRange(identity.timeRange, `${label} timeRange`)
  if (
    timeRange.start !== detector.observedRange.start ||
    timeRange.end !== detector.observedRange.end ||
    timeRange.start < detector.sourceRange.start ||
    timeRange.end > detector.sourceRange.end
  ) fail(`${label} range does not match the manifest observed and verified source ranges.`)
  const provenance = validateLiveProvenance(
    identity.provenance,
    `${label} provenance`,
    detector.fingerprint,
    kind,
  )
  return { ...timeRange, provenance }
}

function validateEvidenceReview(identity, runId, eventId, label) {
  assertExactKeys(identity, ['runId', 'eventId', 'evidenceIds'], label)
  if (
    identity.runId !== runId || identity.eventId !== eventId ||
    !Array.isArray(identity.evidenceIds) || identity.evidenceIds.length === 0 ||
    identity.evidenceIds.some((id) => typeof id !== 'string' || id.trim() === '') ||
    new Set(identity.evidenceIds).size !== identity.evidenceIds.length
  ) fail(`${label} must bind non-empty evidence to the measured run event.`)
}

function validateHumanReview(identity, runId, eventId, label) {
  assertExactKeys(
    identity,
    ['runId', 'eventId', 'requestId', 'action', 'revision', 'actor', 'replayed'],
    label,
  )
  assertExactKeys(identity.actor, ['kind', 'displayName'], `${label} actor`)
  if (
    identity.runId !== runId || identity.eventId !== eventId ||
    typeof identity.requestId !== 'string' || identity.requestId.trim() === '' ||
    identity.action !== 'confirm' || identity.revision !== 1 ||
    identity.actor.kind !== 'local_operator' ||
    typeof identity.actor.displayName !== 'string' || identity.actor.displayName.trim() === '' ||
    identity.replayed !== false
  ) fail(`${label} must bind the exact non-replayed confirmation receipt identity.`)
}

async function validateRun(
  run,
  expectedSequence,
  artifactsRoot,
  usedArtifactPaths,
  detector,
) {
  const runLabel = `Measured run ${expectedSequence}`
  assertExactKeys(
    run,
    [
      'executionId',
      'sequence',
      'status',
      'runId',
      'analyzedEventId',
      'startedAt',
      'completedAt',
      'totalDurationMs',
      'stageDurations',
      'importedDataset',
      'analysisRun',
      'evidenceReview',
      'humanReview',
      'q09',
      'publicLabelsUsedAsDetectorInput',
      'artifacts',
    ],
    runLabel,
  )
  assertString(run.executionId, `${runLabel} executionId`)
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
  if (run.publicLabelsUsedAsDetectorInput !== false) {
    fail(`${runLabel} must use Live analysis without passing public labels to the detector.`)
  }
  const importRange = validateRuntimeIdentity(
    run.importedDataset,
    'import',
    detector,
    `${runLabel} import`,
  )
  const analysisRange = validateRuntimeIdentity(
    run.analysisRun,
    'analysis',
    detector,
    `${runLabel} analysis`,
  )
  if (
    run.runId !== run.analysisRun.runId ||
    run.importedDataset.sourceFilename !== run.analysisRun.sourceFilename ||
    run.importedDataset.rowCount !== run.analysisRun.rowCount ||
    run.importedDataset.fingerprint !== run.analysisRun.fingerprint ||
    importRange.start !== analysisRange.start || importRange.end !== analysisRange.end ||
    !sameBaseProvenance(
      { ...importRange.provenance, modelVersion: analysisRange.provenance.modelVersion },
      analysisRange.provenance,
    )
  ) fail(`${runLabel} import and analysis identities do not match.`)
  validateEvidenceReview(run.evidenceReview, run.runId, run.analyzedEventId, `${runLabel} evidence review`)
  validateHumanReview(run.humanReview, run.runId, run.analyzedEventId, `${runLabel} human review`)
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
    {
      analyzedEventId: run.analyzedEventId,
      sourceFilename: run.analysisRun.sourceFilename,
      fingerprint: run.analysisRun.fingerprint,
      displayLabel: detector.displayLabel,
    },
  )
  validateQ09Binding(run.q09, {
    runId: run.runId,
    eventId: run.analyzedEventId,
    fingerprint: run.analysisRun.fingerprint,
    diagnosisHash: run.artifacts.diagnosisReport.sha256,
    analysisProvenance: run.analysisRun.provenance,
  }, `${runLabel} Q09`)
  validateAudit(
    decodeUtf8(artifactBytes.reviewAudit, `${runLabel} review audit`),
    run.runId,
    run.analyzedEventId,
    run.humanReview,
    `${runLabel} review audit`,
  )
  validateSubmission(
    decodeUtf8(artifactBytes.submissionCsv, `${runLabel} submission`),
    run.analyzedEventId,
    `${runLabel} submission`,
  )
  return {
    startedAt,
    completedAt,
    executionId: run.executionId,
    runId: run.runId,
    durationMs: run.totalDurationMs,
  }
}

export async function validateDemoReceipt(
  options,
  sourceContract = OFFICIAL_SOURCES.validation,
) {
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
  const manifestDirectory = dirname(manifestPath)
  if (
    artifactsRoot === manifestDirectory ||
    isWithin(artifactsRoot, manifestDirectory) ||
    isWithin(manifestDirectory, artifactsRoot)
  ) fail('Artifact root must be fresh and separate from the slice manifest directory.')
  let receiptPath
  try {
    receiptPath = await realpath(resolve(options.receiptPath))
  } catch {
    fail('Demo receipt could not be resolved.')
  }
  if (dirname(receiptPath) !== artifactsRoot) {
    fail('Demo receipt must be written directly under the declared artifact root.')
  }
  const [receiptBytes, manifestBytes] = await Promise.all([
    readBytes(receiptPath, 'Demo receipt'),
    readBytes(manifestPath, 'Slice manifest'),
  ])
  const receipt = parseJson(receiptBytes, 'Demo receipt')
  const manifest = parseJson(manifestBytes, 'Slice manifest')
  const manifestIdentity = validateManifest(manifest, sourceContract)
  validateReceiptShape(receipt, expectedVerifiedScope(sourceContract))
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
  if (
    JSON.stringify(receipt.verifiedManifestScope.sourceIdentity) !==
    JSON.stringify(manifest.sources)
  ) fail('Demo receipt verified manifest scope does not match the prepared source identity.')

  const usedArtifactPaths = new Set()
  const detector = {
    rowCount: manifest.slice.rowCount,
    fingerprint: manifest.slice.sha256,
    displayLabel: receipt.verifiedManifestScope.displayLabel,
    sourceRange: manifestIdentity.sourceRange,
    observedRange: manifestIdentity.observedRange,
  }
  const first = await validateRun(
    receipt.runs[0], 1, artifactsRoot, usedArtifactPaths, detector,
  )
  const second = await validateRun(
    receipt.runs[1], 2, artifactsRoot, usedArtifactPaths, detector,
  )
  if (first.executionId === second.executionId) {
    fail('Measured runs must have distinct execution IDs.')
  }
  if (second.startedAt < first.completedAt) {
    fail('Measured run 2 must start after measured run 1 completes.')
  }
  return {
    status: 'valid',
    receiptKind: receipt.receiptKind,
    candidateCommit: receipt.candidateCommit,
    provenanceScope: receipt.verifiedManifestScope.scope,
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
