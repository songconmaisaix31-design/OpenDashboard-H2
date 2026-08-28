import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { Transform } from 'node:stream'

import { serializeCsv } from './csv.mjs'
import {
  OFFICIAL_FIELDS,
  assertOfficialTimeseriesColumns,
  normalizeUtcTimestamp,
} from './official-contract.mjs'
import { toInstant } from './metrics.mjs'

const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/
const MAX_PHYSICAL_LINE_CHARACTERS = 1024 * 1024

function fail(message) {
  const error = new Error(message)
  error.name = 'OfficialTimeseriesValidationError'
  throw error
}

function parseCsvLine(line, rowNumber) {
  if (line.length > MAX_PHYSICAL_LINE_CHARACTERS) {
    fail('Official timeseries contains an overlong CSV row.')
  }
  if (line.includes('\u0000') || line.includes('\uFFFD')) {
    fail('Official timeseries must be valid UTF-8 without NUL bytes.')
  }
  const cells = []
  let cell = ''
  let quoted = false
  let quoteClosed = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (quoted) {
      if (character === '"' && line[index + 1] === '"') {
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
    if (quoteClosed) {
      if (character !== ',') {
        fail(`Official timeseries row ${rowNumber} has data after a closing quote.`)
      }
      cells.push(cell)
      cell = ''
      quoteClosed = false
      continue
    }
    if (character === '"') {
      if (cell !== '') fail(`Official timeseries row ${rowNumber} has an invalid quote.`)
      quoted = true
    } else if (character === ',') {
      cells.push(cell)
      cell = ''
    } else {
      cell += character
    }
  }
  if (quoted) fail(`Official timeseries row ${rowNumber} has an unterminated quote.`)
  cells.push(cell)
  return cells
}

function canonicalTimestamp(instant) {
  return new Date(instant).toISOString().replace('.000Z', 'Z')
}

function selectionOptions(options) {
  const hasInterval = options.interval !== undefined && options.interval !== null
  if (hasInterval) {
    const { startMilliseconds, endMilliseconds } = options.interval
    if (
      !Number.isFinite(startMilliseconds) || !Number.isFinite(endMilliseconds) ||
      startMilliseconds > endMilliseconds || options.minimumUtcDay !== undefined ||
      options.limitDays !== undefined
    ) fail('Official timeseries interval selection is invalid.')
    return { kind: 'interval', startMilliseconds, endMilliseconds }
  }
  const minimumUtcDay = options.minimumUtcDay ?? null
  const limitDays = options.limitDays ?? 0
  if (
    (minimumUtcDay !== null && !/^\d{4}-\d{2}-\d{2}$/.test(minimumUtcDay)) ||
    !Number.isSafeInteger(limitDays) || limitDays < 0
  ) fail('Official timeseries UTC-day selection is invalid.')
  return { kind: 'days', minimumUtcDay, limitDays }
}

function identityMatches(left, right) {
  return (
    left.filename === right.filename && left.sha256 === right.sha256 &&
    left.rowCount === right.rowCount && left.fieldCount === right.fieldCount &&
    left.firstTimestamp === right.firstTimestamp && left.lastTimestamp === right.lastTimestamp
  )
}

async function scanOfficialTimeseries(
  path,
  contract,
  {
    selection = null,
    onChunk,
    onSelectedRow,
    createReadStreamFn = createReadStream,
  } = {},
) {
  if (
    typeof contract?.filename !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(contract.sha256 ?? '') ||
    !Number.isSafeInteger(contract.rowCount) || contract.rowCount <= 0 ||
    typeof contract.firstTimestamp !== 'string' || typeof contract.lastTimestamp !== 'string'
  ) fail('Official timeseries contract is incomplete.')

  const hash = createHash('sha256')
  let source
  try {
    source = createReadStreamFn(path)
  } catch {
    throw new Error('Official timeseries could not be opened for streaming.')
  }
  const hashingStream = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk)
      callback(null, chunk)
    },
  })
  source.once('error', (error) => hashingStream.destroy(error))
  source.pipe(hashingStream)
  const lines = createInterface({ input: hashingStream, crlfDelay: Infinity, terminal: false })

  let columns = null
  let timestampIndex = -1
  let rowCount = 0
  let previousTimestamp = -Infinity
  let firstTimestamp = null
  let lastTimestamp = null
  let activeDay = null
  let eligibleDayCount = 0
  let selectedChunkDay = null
  let selectedChunkRows = []
  let selectedRowCount = 0
  let selectedFirstTimestamp = null
  let selectedLastTimestamp = null
  let selectedFirstUtcDay = null
  let selectedLastUtcDay = null

  const flushChunk = async () => {
    if (selectedChunkDay === null || selectedChunkRows.length === 0) return
    if (typeof onChunk === 'function') {
      await onChunk({
        day: selectedChunkDay,
        rowCount: selectedChunkRows.length,
        text: serializeCsv(columns, selectedChunkRows),
      })
    }
    selectedChunkDay = null
    selectedChunkRows = []
  }

  try {
    let physicalLine = 0
    for await (const line of lines) {
      physicalLine += 1
      const csvLine = physicalLine === 1 && line.startsWith('\uFEFF')
        ? line.slice(1)
        : line
      if (csvLine === '') fail(`Official timeseries row ${physicalLine} must not be blank.`)
      if (csvLine.includes('\uFEFF')) {
        fail('Official timeseries may contain a UTF-8 BOM only before the header.')
      }
      const cells = parseCsvLine(csvLine, physicalLine)
      if (columns === null) {
        columns = cells
        try {
          assertOfficialTimeseriesColumns(columns)
        } catch (error) {
          fail(error instanceof Error ? error.message : 'Official timeseries header is invalid.')
        }
        if (columns.some((column, index) => column !== OFFICIAL_FIELDS[index])) {
          fail('Official timeseries header must preserve the exact 69-field order.')
        }
        timestampIndex = columns.indexOf('timestamp')
        continue
      }
      if (cells.length !== columns.length) {
        fail(`Official timeseries row ${physicalLine} does not contain exactly 69 fields.`)
      }
      const normalizedTimestamp = normalizeUtcTimestamp(cells[timestampIndex])
      const instant = toInstant(normalizedTimestamp)
      if (!Number.isFinite(instant) || instant <= previousTimestamp) {
        fail('Official timeseries timestamps must be valid, unique, and strictly increasing.')
      }
      for (let index = 0; index < cells.length; index += 1) {
        if (index === timestampIndex) continue
        const value = cells[index]
        if (
          value !== value.trim() || !DECIMAL_PATTERN.test(value) ||
          !Number.isFinite(Number(value))
        ) fail('Official timeseries values must be finite numbers in canonical decimal syntax.')
      }

      const day = new Date(instant).toISOString().slice(0, 10)
      if (day !== activeDay) {
        await flushChunk()
        activeDay = day
        if (
          selection?.kind === 'days' &&
          (selection.minimumUtcDay === null || day >= selection.minimumUtcDay)
        ) eligibleDayCount += 1
      }
      const selected = selection?.kind === 'interval'
        ? instant >= selection.startMilliseconds && instant <= selection.endMilliseconds
        : selection?.kind === 'days' &&
          (selection.minimumUtcDay === null || day >= selection.minimumUtcDay) &&
          (selection.limitDays === 0 || eligibleDayCount <= selection.limitDays)

      rowCount += 1
      previousTimestamp = instant
      firstTimestamp ??= canonicalTimestamp(instant)
      lastTimestamp = canonicalTimestamp(instant)
      if (!selected) continue

      const normalizedRow = [...cells]
      normalizedRow[timestampIndex] = normalizedTimestamp
      selectedRowCount += 1
      selectedFirstTimestamp ??= new Date(instant).toISOString()
      selectedLastTimestamp = new Date(instant).toISOString()
      selectedFirstUtcDay ??= day
      selectedLastUtcDay = day
      if (typeof onSelectedRow === 'function') {
        await onSelectedRow({ columns, row: normalizedRow, instant, day })
      }
      if (typeof onChunk === 'function') {
        selectedChunkDay ??= day
        selectedChunkRows.push(normalizedRow)
      }
    }
    await flushChunk()
  } catch (error) {
    if (error?.name === 'OfficialTimeseriesValidationError') throw error
    if (typeof error?.code === 'string') {
      throw new Error('Official timeseries could not be streamed from the supplied package.')
    }
    throw error
  } finally {
    lines.close()
    source.destroy()
    hashingStream.destroy()
  }

  if (columns === null) fail('Official timeseries must include a header row.')
  const actualHash = `sha256:${hash.digest('hex')}`
  if (actualHash !== contract.sha256) {
    fail(`Official timeseries SHA-256 does not match ${contract.filename}.`)
  }
  if (rowCount !== contract.rowCount) {
    fail(`Official timeseries row count does not match ${contract.filename}.`)
  }
  if (firstTimestamp !== contract.firstTimestamp || lastTimestamp !== contract.lastTimestamp) {
    fail(`Official timeseries range does not match ${contract.filename}.`)
  }
  return {
    identity: {
      filename: contract.filename,
      sha256: actualHash,
      rowCount,
      fieldCount: columns.length,
      firstTimestamp,
      lastTimestamp,
    },
    selectedWindow: {
      rowCount: selectedRowCount,
      firstTimestamp: selectedFirstTimestamp,
      lastTimestamp: selectedLastTimestamp,
      firstUtcDay: selectedFirstUtcDay,
      lastUtcDay: selectedLastUtcDay,
    },
  }
}

export async function inspectOfficialTimeseries(path, contract, dependencies = {}) {
  return (await scanOfficialTimeseries(path, contract, dependencies)).identity
}

export async function streamOfficialTimeseriesWindow(options, dependencies = {}) {
  const selection = selectionOptions(options)
  const verifiedIdentity = await inspectOfficialTimeseries(
    options.path,
    options.contract,
    dependencies,
  )
  const result = await scanOfficialTimeseries(options.path, options.contract, {
    ...dependencies,
    selection,
    onChunk: options.onChunk,
    onSelectedRow: options.onSelectedRow,
  })
  if (!identityMatches(result.identity, verifiedIdentity)) {
    fail('Official timeseries identity changed between verification and selection.')
  }
  return result
}
