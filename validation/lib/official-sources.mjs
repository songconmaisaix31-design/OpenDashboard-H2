import { createHash } from 'node:crypto'

import { ANOMALY_CODES } from './official-contract.mjs'
import { toInstant } from './metrics.mjs'

export const OFFICIAL_SOURCES = Object.freeze({
  train: Object.freeze({
    timeseries: Object.freeze({
      filename: '01_train_timeseries.csv',
      sha256: 'sha256:67513c9b1d443d25eb1258a6f58252c02cdb438f701a7921e2f8dacc365a6c51',
      rowCount: 525_600,
      firstTimestamp: '2025-01-01T00:00:00Z',
      lastTimestamp: '2025-12-31T23:59:00Z',
    }),
    labels: Object.freeze({
      filename: '04_train_event_labels.csv',
      sha256: 'sha256:50f84b18f905b584b3e3f9d35ed02438179b392af2090c27827f7f659993720f',
      rowCount: 280,
      eventCount: 280,
      firstStart: '2025-01-01T15:19:00Z',
      lastEnd: '2025-12-31T18:36:00Z',
      byCode: Object.freeze(Object.fromEntries(ANOMALY_CODES.map((code) => [code, 40]))),
    }),
  }),
  validation: Object.freeze({
    timeseries: Object.freeze({
      filename: '02_validation_timeseries.csv',
      sha256: 'sha256:182728b3a4c5326503a90a04325adcf97fddc290c59ed1e319fa7e8be97d9666',
      rowCount: 129_600,
      firstTimestamp: '2026-01-01T00:00:00Z',
      lastTimestamp: '2026-03-31T23:59:00Z',
    }),
    labels: Object.freeze({
      filename: '05_validation_event_labels.csv',
      sha256: 'sha256:47989467020fad5499168179716ce93da4585e8204dad80b71cfd803231d0cf4',
      rowCount: 70,
      eventCount: 70,
      firstStart: '2026-01-01T11:33:00Z',
      lastEnd: '2026-03-28T12:13:00Z',
      byCode: Object.freeze(Object.fromEntries(ANOMALY_CODES.map((code) => [code, 10]))),
    }),
    directedDemo: Object.freeze({
      selectedEvent: Object.freeze({
        eventId: 'VA0034',
        code: 'C04',
        startTime: '2026-01-22T11:19:00.000Z',
        endTime: '2026-01-22T12:15:00.000Z',
      }),
      overlappingLabels: Object.freeze([
        Object.freeze({
          eventId: 'VA0034',
          code: 'C04',
          startTime: '2026-01-22T11:19:00.000Z',
          endTime: '2026-01-22T12:15:00.000Z',
        }),
      ]),
    }),
  }),
  test: Object.freeze({
    timeseries: Object.freeze({
      filename: '03_test_timeseries.csv',
      sha256: 'sha256:88f3a5c15fb5c42d265475f2998fe9f6c271dcef16f43daee7626f6704504cd9',
      rowCount: 172_800,
      firstTimestamp: '2026-04-01T00:00:00Z',
      lastTimestamp: '2026-07-29T23:59:00Z',
    }),
  }),
})

export const EVALUATION_WINDOWS = Object.freeze({
  validation: Object.freeze({
    source: 'validation',
    minimumUtcDay: null,
    rowCount: 129_600,
    labelCount: 70,
    byCode: OFFICIAL_SOURCES.validation.labels.byCode,
  }),
  'train-last-90': Object.freeze({
    source: 'train',
    minimumUtcDay: '2025-10-03',
    rowCount: 129_600,
    labelCount: 62,
    byCode: Object.freeze({ C01: 9, C02: 12, C03: 8, C04: 9, C05: 11, C06: 2, C07: 11 }),
  }),
})

export function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function canonicalTimestamp(value, label) {
  const instant = toInstant(value)
  if (!Number.isFinite(instant)) throw new Error(`${label} is not a valid calendar timestamp.`)
  return new Date(instant).toISOString().replace('.000Z', 'Z')
}

export function assertLabelSourceIdentity({ bytes, rowCount, events, contract }) {
  if (sha256(bytes) !== contract.sha256) {
    throw new Error(`Official label SHA-256 does not match ${contract.filename}.`)
  }
  if (rowCount !== contract.rowCount || events.length !== contract.eventCount) {
    throw new Error(`Official label row or event count does not match ${contract.filename}.`)
  }
  const ids = events.map(({ id }) => id)
  if (ids.some((id) => typeof id !== 'string' || id.trim() === '') || new Set(ids).size !== ids.length) {
    throw new Error('Official labels require unique, non-empty event_id values.')
  }
  const firstStart = canonicalTimestamp(
    events.reduce((minimum, event) => toInstant(event.startTime) < toInstant(minimum) ? event.startTime : minimum, events[0].startTime),
    'First label start',
  )
  const lastEnd = canonicalTimestamp(
    events.reduce((maximum, event) => toInstant(event.endTime) > toInstant(maximum) ? event.endTime : maximum, events[0].endTime),
    'Last label end',
  )
  const byCode = Object.fromEntries(
    ANOMALY_CODES.map((code) => [code, events.filter((event) => event.code === code).length]),
  )
  if (
    firstStart !== contract.firstStart || lastEnd !== contract.lastEnd ||
    ANOMALY_CODES.some((code) => byCode[code] !== contract.byCode[code])
  ) {
    throw new Error(`Official label range or code counts do not match ${contract.filename}.`)
  }
  return {
    filename: contract.filename,
    sha256: contract.sha256,
    rowCount,
    eventCount: events.length,
    uniqueEventIdCount: new Set(ids).size,
    firstStart,
    lastEnd,
    byCode,
  }
}
