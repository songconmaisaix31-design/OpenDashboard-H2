export function parseCsvText(text, label = 'CSV') {
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
      throw new Error(`${label} has characters after a closing CSV quote.`)
    }
    if (character === '"') {
      if (cell !== '') throw new Error(`${label} has a quote inside an unquoted field.`)
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

  if (quoted) throw new Error(`${label} has an unterminated quoted field.`)
  if (cell !== '' || row.length > 0 || quoteClosed) pushRow()
  if (rows.length === 0) throw new Error(`${label} must include a header row.`)

  const columns = rows[0].map((header, index) =>
    (index === 0 ? header.replace(/^\uFEFF/, '') : header).trim(),
  )
  if (columns.some((header) => header === '')) {
    throw new Error(`${label} header names must be non-empty.`)
  }
  if (new Set(columns).size !== columns.length) {
    throw new Error(`${label} header names must be unique.`)
  }

  const body = rows.slice(1)
  for (const cells of body) {
    if (cells.length !== columns.length) {
      throw new Error(`${label} rows must contain exactly ${columns.length} columns.`)
    }
  }
  return { columns, rows: body }
}

export function serializeCsv(columns, rows) {
  return `${[columns, ...rows]
    .map((row) => row.map(formatCsvCell).join(','))
    .join('\n')}\n`
}

export function formatCsvCell(value) {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\n\r]/.test(text)
    ? `"${text.replaceAll('"', '""')}"`
    : text
}

export function decodeUtf8Strict(bytes, label = 'Input') {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new Error(`${label} must be valid UTF-8.`)
  }
}
