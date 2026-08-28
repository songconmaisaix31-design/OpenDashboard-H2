import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { decodeUtf8Strict } from './lib/csv.mjs'
import {
  ANOMALY_CODES,
  OFFICIAL_SEVERITIES,
  PRIMARY_CONTROL_OBJECT_BY_CODE,
  PRIMARY_IMPACT_METRIC_BY_CODE,
  SUBTYPES_BY_CODE,
  validateEquipmentTokenSet,
} from './lib/official-contract.mjs'
import { toInstant } from './lib/metrics.mjs'
import { SUBMISSION_COLUMNS, parseSubmission } from './lib/submission.mjs'

const MAX_SUBMISSION_BYTES = 64 * 1024 * 1024
const MOJIBAKE_PATTERN = /[\uFFFD�]|锟斤拷|烫烫烫|屯屯屯|鈥/

function validateAffectedEquipment(code, field, issues, label) {
  if (/\s/.test(field)) {
    issues.push(`${label} affected_equipment must not contain spaces`)
    return
  }
  const problem = validateEquipmentTokenSet(code, field.split(','))
  if (problem !== null) {
    issues.push(`${label} affected_equipment "${field}" ${problem}`)
  }
}

export function validateSubmissionText(text) {
  const issues = []
  const warnings = []
  if (text.includes('\0')) {
    return { valid: false, issues: ['submission contains a NUL byte'], warnings, rowCount: 0 }
  }
  if (MOJIBAKE_PATTERN.test(text)) {
    return {
      valid: false,
      issues: ['submission contains replacement characters or mojibake sequences'],
      warnings,
      rowCount: 0,
    }
  }

  let parsed
  try {
    parsed = parseSubmission(text)
  } catch (error) {
    return {
      valid: false,
      issues: [error instanceof Error ? error.message : 'submission CSV is malformed'],
      warnings,
      rowCount: 0,
    }
  }
  const { columns, rows } = parsed
  if (
    columns.length !== SUBMISSION_COLUMNS.length ||
    columns.some((column, index) => column !== SUBMISSION_COLUMNS[index])
  ) {
    issues.push('header must preserve the exact official 16-column order')
    return { valid: false, issues, warnings, rowCount: 0, columns }
  }

  const seenIds = new Set()
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    const label = `row ${index + 2}`
    const missing = SUBMISSION_COLUMNS.filter((column) => row[column].trim() === '')
    if (missing.length > 0) {
      issues.push(`${label} has empty values for: ${missing.join(', ')}`)
    }

    const eventId = row.pred_event_id.trim()
    if (seenIds.has(eventId)) issues.push(`${label} duplicates pred_event_id "${eventId}"`)
    seenIds.add(eventId)

    const code = row.anomaly_code.trim()
    if (!ANOMALY_CODES.includes(code)) {
      issues.push(`${label} has invalid anomaly_code "${code}"`)
      continue
    }
    if (!SUBTYPES_BY_CODE.get(code).includes(row.anomaly_subtype.trim())) {
      issues.push(`${label} has invalid anomaly_subtype for ${code}`)
    }
    if (!OFFICIAL_SEVERITIES.includes(row.severity.trim())) {
      issues.push(`${label} has invalid official severity "${row.severity}"`)
    }
    const expectedControl = PRIMARY_CONTROL_OBJECT_BY_CODE.get(code)
    if (row.primary_control_object.trim() !== expectedControl) {
      issues.push(`${label} primary_control_object does not match ${code}`)
    }
    validateAffectedEquipment(code, row.affected_equipment.trim(), issues, label)

    const confidence = Number(row.confidence)
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      issues.push(`${label} has invalid confidence "${row.confidence}"`)
    }
    try {
      const evidence = JSON.parse(row.evidence_json)
      if (!Array.isArray(evidence) || evidence.length === 0) {
        issues.push(`${label} evidence_json must be a non-empty array`)
      }
    } catch {
      issues.push(`${label} evidence_json is not valid JSON`)
    }
    if (row.root_cause.trim() === '') issues.push(`${label} has an empty root_cause`)
    if (row.recommended_action.trim() === '') {
      issues.push(`${label} has an empty recommended_action`)
    }
    if (row.primary_impact_metric.trim() !== PRIMARY_IMPACT_METRIC_BY_CODE.get(code)) {
      issues.push(`${label} primary_impact_metric does not match ${code}`)
    }
    if (!Number.isFinite(Number(row.estimated_impact_value))) {
      issues.push(`${label} has an invalid estimated_impact_value`)
    }

    const start = toInstant(row.start_time)
    const end = toInstant(row.end_time)
    const firstDetection = toInstant(row.first_detection_time)
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
      issues.push(`${label} has an invalid event interval`)
    }
    if (
      !Number.isFinite(firstDetection) ||
      (Number.isFinite(start) && Number.isFinite(end) &&
        (firstDetection < start || firstDetection > end))
    ) {
      issues.push(`${label} first_detection_time is outside the event interval`)
    }
    if (!['true', 'false'].includes(row.requires_human_confirmation.trim())) {
      issues.push(`${label} requires_human_confirmation must be true or false`)
    }
  }

  if (rows.length === 0) issues.push('submission must contain at least one event row')
  return {
    valid: issues.length === 0,
    issues,
    warnings,
    rowCount: rows.length,
    columns,
  }
}

export function validateSubmissionFile(path) {
  const resolved = resolve(path)
  let metadata
  try {
    metadata = statSync(resolved)
  } catch {
    return { valid: false, issues: ['submission file could not be read'], warnings: [], rowCount: 0 }
  }
  if (!metadata.isFile()) {
    return { valid: false, issues: ['submission path is not a file'], warnings: [], rowCount: 0 }
  }
  if (metadata.size > MAX_SUBMISSION_BYTES) {
    return { valid: false, issues: [`submission exceeds ${MAX_SUBMISSION_BYTES} bytes`], warnings: [], rowCount: 0 }
  }
  try {
    return validateSubmissionText(
      decodeUtf8Strict(readFileSync(resolved), 'Submission CSV'),
    )
  } catch {
    return { valid: false, issues: ['submission is not valid UTF-8'], warnings: [], rowCount: 0 }
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath.toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  const candidates = process.argv.slice(2)
  if (candidates.length === 0) {
    console.error('Usage: node validation/check-submission.mjs <submission.csv>')
    process.exitCode = 2
  } else {
    let invalid = false
    for (const candidate of candidates) {
      const result = validateSubmissionFile(candidate)
      console.log(JSON.stringify(result, null, 2))
      invalid ||= !result.valid
    }
    process.exitCode = invalid ? 1 : 0
  }
}
