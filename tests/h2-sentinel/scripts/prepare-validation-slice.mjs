import { createHash } from 'node:crypto'
import {
  readFile,
  realpath,
  stat,
} from 'node:fs/promises'
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  OFFICIAL_FIELDS,
  isLabelColumn as isOfficialLabelColumn,
  normalizeUtcTimestamp,
} from '../../../validation/lib/official-contract.mjs'
import { OFFICIAL_SOURCES } from '../../../validation/lib/official-sources.mjs'
import { streamOfficialTimeseriesWindow } from '../../../validation/lib/official-timeseries.mjs'
import { toInstant } from '../../../validation/lib/metrics.mjs'
import {
  ensureIgnoredOutputDirectory,
  ensureIgnoredOutputPath,
  writeFileAtomic,
} from '../../../validation/lib/output.mjs'

const SCRIPT_VERSION = 'p1-validation-slice-v3'
const SLICE_FILENAME = 'validation-slice.csv'
const MANIFEST_FILENAME = 'validation-slice-manifest.json'
const PADDING_MS = 30 * 60 * 1000

export const REQUIRED_TIMESERIES_COLUMNS = OFFICIAL_FIELDS

const LABEL_COLUMN_ALIASES = {
  eventId: [
    'event_id',
    'eventid',
    'label_event_id',
    '事件id',
    '事件编号',
    '异常事件id',
  ],
  code: [
    'anomaly_code',
    'event_code',
    'code',
    '异常编码',
    '异常类别',
    '异常类型',
  ],
  startTime: [
    'start_time',
    'starttime',
    'event_start_time',
    '开始时间',
    '事件开始时间',
  ],
  endTime: [
    'end_time',
    'endtime',
    'event_end_time',
    '结束时间',
    '事件结束时间',
  ],
}

const directory = dirname(fileURLToPath(import.meta.url))

function fail(message) {
  throw new Error(message)
}

function parseArguments(argv) {
  const known = new Set([
    '--package',
    '--timeseries',
    '--labels',
    '--timeseries-sha256',
    '--labels-sha256',
    '--output',
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
    packagePath: values.get('--package'),
    timeseriesPath: values.get('--timeseries'),
    labelsPath: values.get('--labels'),
    timeseriesHash: values.get('--timeseries-sha256'),
    labelsHash: values.get('--labels-sha256'),
    outputPath: values.get('--output'),
  }
}

function printUsage() {
  console.log([
    'Usage:',
    '  node tests/h2-sentinel/scripts/prepare-validation-slice.mjs \\',
    '    --package <official-package-directory> \\',
    '    --timeseries <package-relative-validation-timeseries.csv> \\',
    '    --labels <package-relative-validation-event-labels.csv> \\',
    '    --timeseries-sha256 <expected-sha256> \\',
    '    --labels-sha256 <expected-sha256> \\',
    '    --output <new-canonical-generated-directory>',
  ].join('\n'))
}

function normalizeExpectedHash(value, label) {
  const normalized = value.trim().toLowerCase().replace(/^sha256:/, '')
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    fail(`${label} must be a 64-character SHA-256 value.`)
  }
  return `sha256:${normalized}`
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
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

function normalizeRelativePath(value, label) {
  if (
    !value ||
    isAbsolute(value) ||
    value.includes('\0') ||
    value.split(/[\\/]+/).some((segment) => segment === '..')
  ) {
    fail(`${label} must be a package-relative file path.`)
  }
  return value
}

async function officialFile(packageRoot, relativePath, label) {
  const safeRelativePath = normalizeRelativePath(relativePath, label)
  const candidate = resolve(packageRoot, safeRelativePath)
  let canonical
  try {
    canonical = await realpath(candidate)
  } catch {
    fail(`${label} does not resolve to a readable file in the official package.`)
  }
  if (!isWithin(packageRoot, canonical)) {
    fail(`${label} must remain inside the official package directory.`)
  }
  let metadata
  try {
    metadata = await stat(canonical)
  } catch {
    fail(`${label} could not be inspected.`)
  }
  if (!metadata.isFile()) fail(`${label} must resolve to a file.`)
  return {
    absolutePath: canonical,
    relativePath: relative(packageRoot, canonical).split(sep).join('/'),
  }
}

function generatedOutputDirectory(outputPath, packageRoot) {
  const canonicalCandidate = ensureIgnoredOutputPath(resolve(outputPath))
  if (
    isWithin(packageRoot, canonicalCandidate) ||
    isWithin(canonicalCandidate, packageRoot) ||
    canonicalCandidate === packageRoot
  ) {
    fail('Output directory must be separate from the official package directory.')
  }
  return ensureIgnoredOutputDirectory(canonicalCandidate)
}

export function parseCsv(text, label) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  let quoteClosed = false

  const pushCell = () => {
    row.push(cell)
    cell = ''
    quoteClosed = false
  }
  const pushRow = () => {
    pushCell()
    if (row.some((value) => value.trim() !== '')) rows.push(row)
    row = []
  }

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
        quoteClosed = true
      } else {
        cell += character
      }
      continue
    }
    if (quoteClosed && character !== ',' && character !== '\n' && character !== '\r') {
      fail(`${label} has characters after a closing CSV quote.`)
    }
    if (character === '"') {
      if (cell !== '') fail(`${label} has a quote inside an unquoted CSV field.`)
      quoted = true
    } else if (character === ',') {
      pushCell()
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      pushRow()
    } else {
      cell += character
    }
  }
  if (quoted) fail(`${label} has an unterminated quoted CSV field.`)
  if (cell !== '' || row.length > 0 || quoteClosed) pushRow()
  if (rows.length === 0) fail(`${label} must include a header row.`)

  const headers = rows[0].map((header, index) =>
    (index === 0 ? header.replace(/^\uFEFF/, '') : header).trim(),
  )
  if (headers.some((header) => header === '')) {
    fail(`${label} header names must be non-empty.`)
  }
  const normalizedHeaders = headers.map(normalizeHeader)
  if (new Set(normalizedHeaders).size !== normalizedHeaders.length) {
    fail(`${label} header names must be unique after normalization.`)
  }
  const body = rows.slice(1)
  body.forEach((cells) => {
    if (cells.length !== headers.length) {
      fail(`${label} rows must contain exactly the header column count.`)
    }
  })
  if (body.length === 0) fail(`${label} must include at least one data row.`)
  return { headers, rows: body }
}

function decodeUtf8(bytes, label) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    fail(`${label} must be valid UTF-8.`)
  }
}

function normalizeHeader(value) {
  return value.trim().toLowerCase().replace(/[\s./-]+/g, '_')
}

function resolveLabelColumns(headers) {
  const normalizedHeaders = headers.map(normalizeHeader)
  return Object.fromEntries(
    Object.entries(LABEL_COLUMN_ALIASES).map(([field, aliases]) => {
      const normalizedAliases = new Set(aliases.map(normalizeHeader))
      const matches = normalizedHeaders
        .map((header, index) => ({ header, index }))
        .filter(({ header }) => normalizedAliases.has(header))
      if (matches.length !== 1) {
        fail(`Validation labels must contain exactly one ${field} column.`)
      }
      return [field, matches[0].index]
    }),
  )
}

function parseTimestamp(value, label) {
  const candidate = normalizeUtcTimestamp(value)
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(candidate)) {
    fail(`${label} must use ISO-8601 or official UTC-naive timestamp syntax.`)
  }
  const milliseconds = toInstant(candidate)
  if (!Number.isFinite(milliseconds)) fail(`${label} contains an invalid timestamp.`)
  return { milliseconds, iso: new Date(milliseconds).toISOString() }
}

function validateLabels(csv) {
  const columns = resolveLabelColumns(csv.headers)
  const seenEventIds = new Set()
  return csv.rows
    .map((cells, index) => {
      const eventId = cells[columns.eventId].trim()
      const code = cells[columns.code].trim().toUpperCase()
      if (!eventId || eventId.length > 128) {
        fail('Validation label event IDs must be non-empty and bounded.')
      }
      if (seenEventIds.has(eventId)) fail('Validation label event IDs must be unique.')
      seenEventIds.add(eventId)
      if (!/^C0[1-7]$/.test(code)) {
        fail('Validation label anomaly codes must use C01 through C07.')
      }
      const start = parseTimestamp(cells[columns.startTime], 'Validation label start time')
      const end = parseTimestamp(cells[columns.endTime], 'Validation label end time')
      if (end.milliseconds < start.milliseconds) {
        fail('Validation label end time must not precede its start time.')
      }
      return {
        eventId,
        code,
        startTime: start.iso,
        endTime: end.iso,
        startMilliseconds: start.milliseconds,
        endMilliseconds: end.milliseconds,
        sourceRowNumber: index + 2,
        sourceFields: Object.fromEntries(
          csv.headers.map((header, columnIndex) => [header, cells[columnIndex]]),
        ),
      }
    })
    .sort((left, right) =>
      left.startMilliseconds - right.startMilliseconds ||
      left.endMilliseconds - right.endMilliseconds ||
      left.eventId.localeCompare(right.eventId),
    )
}

export const isLabelColumn = isOfficialLabelColumn

function serializeCsv(headers, rows) {
  const encode = (value) => {
    const text = String(value)
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
  }
  return `${[headers, ...rows].map((row) => row.map(encode).join(',')).join('\n')}\n`
}

async function readOfficialBytes(path, label) {
  try {
    return await readFile(path)
  } catch {
    fail(`${label} could not be read.`)
  }
}

function writeOutputs(outputDirectory, csvContent, manifestContent) {
  try {
    writeFileAtomic(resolve(outputDirectory, SLICE_FILENAME), csvContent)
    writeFileAtomic(resolve(outputDirectory, MANIFEST_FILENAME), manifestContent)
  } catch {
    fail('Validation slice outputs could not be written to the new directory.')
  }
}

export async function prepareValidationSlice(
  options,
  sourceContract = OFFICIAL_SOURCES.validation,
) {
  const verifiedScope = sourceContract.verifiedScope ?? (
    sourceContract.timeseries.sha256 === OFFICIAL_SOURCES.validation.timeseries.sha256 &&
    sourceContract.labels.sha256 === OFFICIAL_SOURCES.validation.labels.sha256
      ? {
          mode: 'LIVE_ANALYSIS',
          scope: 'VALIDATION_SLICE',
          displayLabel: 'LIVE_ANALYSIS · 验证集切片',
        }
      : null
  )
  if (
    verifiedScope === null ||
    !['VALIDATION_SLICE', 'self_consistent_fixture_contract'].includes(verifiedScope.scope)
  ) fail('A non-official source contract requires an explicit fixture-only scope.')
  let packageRoot
  try {
    packageRoot = await realpath(resolve(options.packagePath))
  } catch {
    fail('Official package directory could not be resolved.')
  }
  let packageMetadata
  try {
    packageMetadata = await stat(packageRoot)
  } catch {
    fail('Official package directory could not be inspected.')
  }
  if (!packageMetadata.isDirectory()) fail('Official package path must be a directory.')

  const [timeseries, labels] = await Promise.all([
    officialFile(packageRoot, options.timeseriesPath, 'Validation timeseries'),
    officialFile(packageRoot, options.labelsPath, 'Validation labels'),
  ])
  if (timeseries.absolutePath === labels.absolutePath) {
    fail('Validation timeseries and labels must be separate files.')
  }
  const labelsBytes = await readOfficialBytes(labels.absolutePath, 'Validation labels')
  const actualLabelsHash = sha256(labelsBytes)
  if (
    basename(timeseries.relativePath) !== sourceContract.timeseries.filename ||
    basename(labels.relativePath) !== sourceContract.labels.filename
  ) fail('Validation source filenames do not match the verified source contract.')
  if (
    normalizeExpectedHash(options.timeseriesHash, 'Timeseries hash') !==
      sourceContract.timeseries.sha256
  ) {
    fail('Validation timeseries SHA-256 does not match the expected value.')
  }
  if (
    actualLabelsHash !== normalizeExpectedHash(options.labelsHash, 'Labels hash') ||
    actualLabelsHash !== sourceContract.labels.sha256
  ) {
    fail('Validation labels SHA-256 does not match the expected value.')
  }

  const labelsCsv = parseCsv(decodeUtf8(labelsBytes, 'Validation labels'), 'Validation labels')
  const events = validateLabels(labelsCsv)
  if (
    labelsCsv.rows.length !== sourceContract.labels.rowCount ||
    events.length !== sourceContract.labels.eventCount ||
    new Set(events.map(({ eventId }) => eventId)).size !== sourceContract.labels.eventCount
  ) fail('Validation label row and unique event counts do not match the verified source contract.')
  const firstLabelStart = new Date(Math.min(...events.map(({ startMilliseconds }) => startMilliseconds)))
    .toISOString().replace('.000Z', 'Z')
  const lastLabelEnd = new Date(Math.max(...events.map(({ endMilliseconds }) => endMilliseconds)))
    .toISOString().replace('.000Z', 'Z')
  const labelCountsByCode = Object.fromEntries(
    [...new Set(events.map(({ code }) => code))].map((code) => [
      code,
      events.filter((event) => event.code === code).length,
    ]),
  )
  if (
    firstLabelStart !== sourceContract.labels.firstStart ||
    lastLabelEnd !== sourceContract.labels.lastEnd ||
    Object.entries(sourceContract.labels.byCode).some(
      ([code, count]) => labelCountsByCode[code] !== count,
    )
  ) fail('Validation label range or anomaly counts do not match the verified source contract.')
  const selectedEvent = events.find(({ code }) => code === 'C04')
  if (!selectedEvent) fail('Validation labels do not contain a public C04 event.')
  const sliceStart = selectedEvent.startMilliseconds - PADDING_MS
  const sliceEnd = selectedEvent.endMilliseconds + PADDING_MS

  const selectedRows = []
  const streamedTimeseries = await streamOfficialTimeseriesWindow({
    path: timeseries.absolutePath,
    contract: sourceContract.timeseries,
    interval: { startMilliseconds: sliceStart, endMilliseconds: sliceEnd },
    onSelectedRow: ({ row }) => selectedRows.push(row),
  })
  const { identity: timeseriesIdentity, selectedWindow } = streamedTimeseries
  if (
    toInstant(timeseriesIdentity.firstTimestamp) > sliceStart ||
    toInstant(timeseriesIdentity.lastTimestamp) < sliceEnd
  ) fail('Validation timeseries does not cover the full padded event interval.')
  if (selectedRows.length < 2 || selectedRows.length !== selectedWindow.rowCount) {
    fail('Validation timeseries slice must contain at least two streamed rows.')
  }
  const slice = {
    detectorHeaders: OFFICIAL_FIELDS,
    detectorRows: selectedRows,
    removedLabelColumns: [],
    firstTimestamp: selectedWindow.firstTimestamp,
    lastTimestamp: selectedWindow.lastTimestamp,
  }
  const sliceContent = serializeCsv(slice.detectorHeaders, slice.detectorRows)
  const sliceBytes = Buffer.from(sliceContent, 'utf8')
  const overlappingLabels = events
    .filter(
      ({ startMilliseconds, endMilliseconds }) =>
        startMilliseconds <= sliceEnd && endMilliseconds >= sliceStart,
    )
    .map(({ startMilliseconds, endMilliseconds, ...event }) => event)
  const selectedIdentity = {
    eventId: selectedEvent.eventId,
    code: selectedEvent.code,
    startTime: selectedEvent.startTime,
    endTime: selectedEvent.endTime,
  }
  const overlappingIdentities = overlappingLabels.map(
    ({ eventId, code, startTime, endTime }) => ({ eventId, code, startTime, endTime }),
  )
  if (
    JSON.stringify(selectedIdentity) !==
      JSON.stringify(sourceContract.directedDemo?.selectedEvent) ||
    JSON.stringify(overlappingIdentities) !==
      JSON.stringify(sourceContract.directedDemo?.overlappingLabels)
  ) fail('Directed demo selection does not match the independently verified label contract.')
  const limitations = verifiedScope.scope === 'VALIDATION_SLICE'
    ? [
        'Public validation labels may select this directed QA demo before analysis and remain only in the manifest.',
        'The detector input contains no public label columns.',
        'This slice is not full validation, a hidden-test result, or an organizer score.',
      ]
    : [
        'This self-consistent fixture contract is test-only and is not an official validation source.',
        'Fixture labels remain outside detector input.',
        'This fixture cannot support validation-slice, hidden-test, or organizer claims.',
      ]

  const manifest = {
    schemaVersion: 1,
    manifestKind: 'h2_public_validation_slice',
    scriptVersion: SCRIPT_VERSION,
    generatedAt: new Date().toISOString(),
    provenance: {
      mode: verifiedScope.mode,
      scope: verifiedScope.scope,
      displayLabel: verifiedScope.displayLabel,
      limitations,
    },
    sources: {
      timeseries: {
        relativePath: timeseries.relativePath,
        sha256: timeseriesIdentity.sha256,
        rowCount: timeseriesIdentity.rowCount,
        firstTimestamp: timeseriesIdentity.firstTimestamp,
        lastTimestamp: timeseriesIdentity.lastTimestamp,
      },
      labels: {
        relativePath: labels.relativePath,
        sha256: actualLabelsHash,
        rowCount: labelsCsv.rows.length,
        eventCount: events.length,
        uniqueEventIdCount: new Set(events.map(({ eventId }) => eventId)).size,
        firstStart: firstLabelStart,
        lastEnd: lastLabelEnd,
        byCode: labelCountsByCode,
      },
    },
    selectedEvent: selectedIdentity,
    slice: {
      filename: SLICE_FILENAME,
      requestedTimeRange: {
        startTime: new Date(sliceStart).toISOString(),
        endTime: new Date(sliceEnd).toISOString(),
      },
      observedTimeRange: {
        startTime: slice.firstTimestamp,
        endTime: slice.lastTimestamp,
      },
      rowCount: slice.detectorRows.length,
      columns: slice.detectorHeaders,
      removedLabelColumns: slice.removedLabelColumns,
      sha256: sha256(sliceBytes),
    },
    overlappingLabels,
  }
  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`
  const outputDirectory = generatedOutputDirectory(options.outputPath, packageRoot)
  writeOutputs(outputDirectory, sliceContent, manifestContent)
  return {
    status: 'prepared',
    scriptVersion: SCRIPT_VERSION,
    selectedEventId: selectedEvent.eventId,
    selectedEventCode: selectedEvent.code,
    rowCount: slice.detectorRows.length,
    sliceSha256: manifest.slice.sha256,
    sourceHashes: {
      timeseries: timeseriesIdentity.sha256,
      labels: actualLabelsHash,
    },
    outputs: [SLICE_FILENAME, MANIFEST_FILENAME],
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath.toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  try {
    const options = parseArguments(process.argv.slice(2))
    if (options.help) {
      printUsage()
    } else {
      const result = await prepareValidationSlice(options)
      console.log(JSON.stringify(result))
    }
  } catch (error) {
    console.error(`ERROR ${error instanceof Error ? error.message : 'Validation slice preparation failed.'}`)
    process.exitCode = 1
  }
}
