import {
  H2_ASSISTANT_QUESTIONS,
  H2_FIXTURE_ANALYSIS_RUN,
  H2_FIXTURE_ASSISTANT_ANSWER,
  H2_FIXTURE_DATASET,
  H2_FIXTURE_QUALITY_REPORT,
  H2_FIXTURE_REPORT_DESCRIPTOR,
  H2_FIXTURE_PROVENANCE,
  H2_GOLDEN_C03_EVENT,
  H2_GOLDEN_C04_EVENT,
  serializeH2SubmissionRows,
  toH2SubmissionRow,
  type H2AnomalyEvent,
  type H2AssistantRequest,
  type H2CsvImportRequest,
  type H2CsvImportResult,
  type H2EventFilter,
  type H2ReportArtifact,
  type H2ReportFormat,
  type H2ReportKind,
  type H2ReportMediaType,
  type H2ReportRequest,
  type H2SentinelDataSource,
  type H2SeriesRequest,
  type H2SeriesPoint,
  type H2SeriesResponse,
} from '@opendashboard/h2-contracts'

import { H2EmsAdapterError } from './errors.ts'
import { sha256 } from './sha256.ts'

const fixtureEvents = [H2_GOLDEN_C03_EVENT, H2_GOLDEN_C04_EVENT] as const

type FixtureReportProfile = Readonly<{
  format: H2ReportFormat
  mediaType: H2ReportMediaType
  filename: string
  title: string
}>

const fixtureReportProfiles = {
  single_event_diagnosis: {
    format: 'html',
    mediaType: 'text/html',
    filename: 'single_event_diagnosis-run-fixture-h2-sentinel-golden.html',
    title: 'Single event diagnosis',
  },
  period_summary: {
    format: 'html',
    mediaType: 'text/html',
    filename: 'period_summary-run-fixture-h2-sentinel-golden.html',
    title: 'Period summary',
  },
  analysis_result_json: {
    format: 'json',
    mediaType: 'application/json',
    filename: 'analysis_result_json-run-fixture-h2-sentinel-golden.json',
    title: 'Analysis result',
  },
  submission_csv: {
    format: 'csv',
    mediaType: 'text/csv',
    filename: 'submission_csv-run-fixture-h2-sentinel-golden.csv',
    title: 'Submission CSV',
  },
  validation_metrics: {
    format: 'json',
    mediaType: 'application/json',
    filename: 'validation_metrics-run-fixture-h2-sentinel-golden.json',
    title: 'Validation metrics',
  },
  quality_report: {
    format: 'html',
    mediaType: 'text/html',
    filename: 'quality_report-run-fixture-h2-sentinel-golden.html',
    title: 'Data quality report',
  },
} as const satisfies Readonly<Record<H2ReportKind, FixtureReportProfile>>

const fixtureSubmissionExportProfile = {
  format: 'csv',
  mediaType: 'text/csv',
  filename: 'h2-fixture-submission.csv',
  title: 'Submission CSV',
} as const satisfies FixtureReportProfile

/** Bundled sanitized rows keep Fixture charts usable without filesystem access. */
const fixtureSeries = [
  ['2026-01-05T10:20:00Z', 820, 230, 590, 500, 140, 55, 500, 450, -240],
  ['2026-01-05T10:21:00Z', 815, 230, 590, 505, 135, 55.2, 500, 450, -240],
  ['2026-01-05T10:22:00Z', 810, 230, 590, 500, 140, 55.4, 500, 450, -240],
  ['2026-01-05T10:23:00Z', 805, 230, 590, 500, 145, 55.6, 500, 450, -240],
  ['2026-01-05T10:24:00Z', 800, 230, 590, 500, 140, 55.8, 500, 450, -240],
  ['2026-01-05T10:25:00Z', 798, 230, 590, 500, 138, 56, 500, 450, -240],
  ['2026-01-05T10:26:00Z', 796, 230, 590, 500, 136, 56.2, 500, 450, -240],
  ['2026-01-05T10:27:00Z', 794, 230, 590, 500, 134, 56.4, 500, 450, -240],
  ['2026-01-05T10:28:00Z', 792, 230, 590, 500, 132, 56.6, 500, 450, -240],
  ['2026-01-05T10:29:00Z', 790, 230, 590, 500, 130, 56.8, 500, 450, -240],
  ['2026-01-05T10:30:00Z', 788, 230, 590, 500, 128, 57, 500, 450, -240],
  ['2026-01-05T10:31:00Z', 786, 230, 590, 500, 126, 57.2, 500, 450, -240],
  ['2026-01-05T10:32:00Z', 784, 230, 720, 500, 124, 57.4, 500, 450, -240],
  ['2026-01-05T10:33:00Z', 782, 230, 720, 500, 122, 57.6, 500, 450, -240],
  ['2026-01-05T10:34:00Z', 780, 230, 720, 500, 120, 57.8, 500, 450, -240],
  ['2026-01-05T10:35:00Z', 778, 230, 720, 500, 118, 58, 500, 450, -240],
  ['2026-01-05T10:36:00Z', 776, 230, 720, 500, 116, 58.2, 500, 450, -240],
  ['2026-01-05T10:37:00Z', 774, 230, 720, 500, 114, 58.4, 500, 450, -240],
  ['2026-01-05T10:38:00Z', 772, 230, 720, 500, 112, 58.6, 500, 450, -240],
  ['2026-01-05T10:39:00Z', 770, 230, 720, 500, 110, 58.8, 500, 450, -240],
  ['2026-01-05T10:40:00Z', 768, 230, 590, 500, 108, 59, 500, 450, -240],
  ['2026-01-05T10:41:00Z', 766, 230, 590, 500, 106, 59.2, 500, 450, -240],
] as const

const fixtureSeriesVariables = [
  'pv_actual_kw',
  'bess_power_kw',
  'pcc_power_kw',
  'total_electrolyzer_power_kw',
  'auxiliary_load_kw',
  'bess_soc_percent',
  'pcc_export_limit_kw',
  'pcc_import_limit_kw',
  'bess_dispatch_command_kw',
] as const

const fixturePoints: readonly H2SeriesPoint[] = fixtureSeries.map(
  ([
    timestamp,
    pvActual,
    bessPower,
    pccPower,
    electrolyzerPower,
    auxiliaryLoad,
    bessSoc,
    exportLimit,
    importLimit,
    bessCommand,
  ]) => ({
    timestamp,
    values: {
      pv_actual_kw: pvActual,
      bess_power_kw: bessPower,
      pcc_power_kw: pccPower,
      total_electrolyzer_power_kw: electrolyzerPower,
      auxiliary_load_kw: auxiliaryLoad,
      bess_soc_percent: bessSoc,
      pcc_export_limit_kw: exportLimit,
      pcc_import_limit_kw: importLimit,
      bess_dispatch_command_kw: bessCommand,
    },
  }),
)

/**
 * Provides only immutable, sanitized contract fixtures. It deliberately does
 * not accept CSV input so a Fixture session cannot be mistaken for analysis.
 */
export function createFixtureH2EmsDataSource(): H2SentinelDataSource {
  return {
    async getMode() {
      return 'FIXTURE'
    },
    async listDatasets() {
      return [H2_FIXTURE_DATASET]
    },
    async importCsv(request: H2CsvImportRequest): Promise<H2CsvImportResult> {
      if (request.filename.length === 0 || request.text.length === 0) {
        throw new H2EmsAdapterError('invalid_fixture_request', false)
      }
      throw new H2EmsAdapterError('fixture_import_disabled', false)
    },
    async getDataQuality(datasetId) {
      assertFixtureDataset(datasetId)
      return H2_FIXTURE_QUALITY_REPORT
    },
    async runAnalysis(datasetId) {
      assertFixtureDataset(datasetId)
      return H2_FIXTURE_ANALYSIS_RUN
    },
    async getOverview(runId) {
      assertFixtureRun(runId)
      return H2_FIXTURE_ANALYSIS_RUN
    },
    async listEvents(runId, filter) {
      assertFixtureRun(runId)
      return fixtureEvents.filter((event) => matchesFilter(event, filter))
    },
    async getEvent(runId, eventId) {
      assertFixtureRun(runId)
      const event = fixtureEvents.find((item) => item.eventId === eventId)
      if (!event) throw new H2EmsAdapterError('invalid_fixture_request', false)
      return event
    },
    async getSeries(request) {
      assertFixtureRun(request.runId)
      return createFixtureSeries(request)
    },
    async ask(request) {
      assertFixtureAssistantRequest(request)
      return H2_FIXTURE_ASSISTANT_ANSWER
    },
    async exportReport(request) {
      assertFixtureRun(request.runId)
      return createFixtureReport(request)
    },
    async exportSubmission(runId) {
      assertFixtureRun(runId)
      const content = serializeH2SubmissionRows(
        fixtureEvents.map((event) => toH2SubmissionRow(event)),
      )
      return createArtifact('submission_csv', fixtureSubmissionExportProfile, content)
    },
  }
}
function assertFixtureDataset(datasetId: string): void {
  if (datasetId !== H2_FIXTURE_DATASET.datasetId) {
    throw new H2EmsAdapterError('invalid_fixture_request', false)
  }
}

function assertFixtureRun(runId: string): void {
  if (runId !== H2_FIXTURE_ANALYSIS_RUN.runId) {
    throw new H2EmsAdapterError('invalid_fixture_request', false)
  }
}

function assertFixtureAssistantRequest(request: H2AssistantRequest): void {
  assertFixtureRun(request.runId)
  if (!H2_ASSISTANT_QUESTIONS.some(({ questionId }) => questionId === request.questionId)) {
    throw new H2EmsAdapterError('invalid_fixture_request', false)
  }
  if (request.eventId && !fixtureEvents.some((event) => event.eventId === request.eventId)) {
    throw new H2EmsAdapterError('invalid_fixture_request', false)
  }
}

function matchesFilter(event: H2AnomalyEvent, filter?: H2EventFilter): boolean {
  if (!filter) return true
  return (
    (!filter.codes || filter.codes.includes(event.code)) &&
    (!filter.severities || filter.severities.includes(event.severity)) &&
    (!filter.equipmentIds || event.affectedEquipment.some(({ id }) => filter.equipmentIds?.includes(id))) &&
    (!filter.reviewStates || filter.reviewStates.includes(event.reviewState)) &&
    (filter.minConfidence === undefined || event.confidence >= filter.minConfidence) &&
    (!filter.startsAtOrAfter || event.startTime >= filter.startsAtOrAfter) &&
    (!filter.endsAtOrBefore || event.endTime <= filter.endsAtOrBefore)
  )
}

function createFixtureSeries(request: H2SeriesRequest): H2SeriesResponse {
  if (
    request.variables.length === 0 ||
    new Set(request.variables).size !== request.variables.length ||
    !request.variables.every(isFixtureSeriesVariable) ||
    !isFixtureTimeRange(request.startTime, request.endTime) ||
    (request.eventId && !fixtureEvents.some((event) => event.eventId === request.eventId))
  ) {
    throw new H2EmsAdapterError('invalid_fixture_request', false)
  }
  const points = fixturePoints
    .filter(
      ({ timestamp }) =>
        timestamp >= request.startTime && timestamp <= request.endTime,
    )
    .map(({ timestamp, values }) => ({
      timestamp,
      values: selectFixtureValues(values, request.variables),
    }))
  if (points.length === 0) {
    throw new H2EmsAdapterError('invalid_fixture_request', false)
  }
  return {
    runId: request.runId,
    variables: [...request.variables],
    points,
  }
}

function selectFixtureValues(
  values: Readonly<Record<string, number | null>>,
  variables: readonly string[],
): Readonly<Record<string, number | null>> {
  const selected: Record<string, number | null> = {}
  for (const variable of variables) {
    const value = values[variable]
    if (value === undefined) {
      throw new H2EmsAdapterError('invalid_fixture_request', false)
    }
    selected[variable] = value
  }
  return selected
}

function isFixtureSeriesVariable(
  value: string,
): value is (typeof fixtureSeriesVariables)[number] {
  return fixtureSeriesVariables.includes(
    value as (typeof fixtureSeriesVariables)[number],
  )
}

function isFixtureTimeRange(startTime: string, endTime: string): boolean {
  return (
    Number.isFinite(Date.parse(startTime)) &&
    Number.isFinite(Date.parse(endTime)) &&
    startTime <= endTime &&
    startTime >= H2_FIXTURE_DATASET.timeRange.startTime &&
    endTime <= H2_FIXTURE_DATASET.timeRange.endTime
  )
}

async function createFixtureReport(
  request: H2ReportRequest,
): Promise<H2ReportArtifact> {
  const event = request.eventId
    ? fixtureEvents.find((item) => item.eventId === request.eventId)
    : undefined
  if (request.eventId && !event) throw new H2EmsAdapterError('invalid_fixture_request', false)

  const profile = fixtureReportProfiles[request.kind]
  const content = createFixtureReportContent(
    request.kind,
    profile,
    event,
  )
  return createArtifact(
    request.kind,
    profile,
    content,
    event?.eventId,
  )
}

function createFixtureReportContent(
  kind: H2ReportKind,
  profile: FixtureReportProfile,
  event: H2AnomalyEvent | undefined,
): string {
  switch (profile.format) {
    case 'html':
      return createFixtureHtmlReport(kind, profile.title, event)
    case 'json':
      return createFixtureJsonReport(kind, event)
    case 'csv':
      return serializeH2SubmissionRows(
        fixtureEvents.map((fixtureEvent) => toH2SubmissionRow(fixtureEvent)),
      )
  }
}

function createFixtureHtmlReport(
  kind: H2ReportKind,
  title: string,
  event: H2AnomalyEvent | undefined,
): string {
  const eventIdentity = event?.eventId ?? 'Not applicable'
  const humanConfirmation = event?.requiresHumanConfirmation ?? true
  const limitations = H2_FIXTURE_PROVENANCE.limitations
    .map((limitation) => `        <li>${escapeHtml(limitation)}</li>`)
    .join('\n')

  return [
    '<!doctype html>',
    '<html lang="en">',
    '  <head>',
    '    <meta charset="utf-8">',
    `    <title>${escapeHtml(title)} | H2 Sentinel</title>`,
    '  </head>',
    '  <body>',
    '    <main>',
    `      <h1>${escapeHtml(title)}</h1>`,
    '      <p>This Fixture report is sanitized demonstration evidence, not an official competition result.</p>',
    '      <dl>',
    `        <dt>Report kind</dt><dd>${escapeHtml(kind)}</dd>`,
    `        <dt>Run ID</dt><dd>${escapeHtml(H2_FIXTURE_ANALYSIS_RUN.runId)}</dd>`,
    `        <dt>Event ID</dt><dd>${escapeHtml(eventIdentity)}</dd>`,
    `        <dt>Provenance mode</dt><dd>${escapeHtml(H2_FIXTURE_PROVENANCE.mode)}</dd>`,
    `        <dt>Provenance source</dt><dd>${escapeHtml(H2_FIXTURE_PROVENANCE.source)}</dd>`,
    `        <dt>Dataset fingerprint</dt><dd>${escapeHtml(H2_FIXTURE_PROVENANCE.datasetFingerprint ?? 'Not available')}</dd>`,
    '      </dl>',
    `      <p>${escapeHtml(H2_FIXTURE_REPORT_DESCRIPTOR.safetyDisclaimer)}</p>`,
    `      <p>Human confirmation required: ${escapeHtml(String(humanConfirmation))}.</p>`,
    '      <h2>Fixture limitations</h2>',
    '      <ul>',
    limitations,
    '      </ul>',
    '    </main>',
    '  </body>',
    '</html>',
    '',
  ].join('\n')
}

function createFixtureJsonReport(
  kind: H2ReportKind,
  event: H2AnomalyEvent | undefined,
): string {
  const payload =
    kind === 'validation_metrics'
      ? {
          schemaVersion: 1,
          reportKind: kind,
          runId: H2_FIXTURE_ANALYSIS_RUN.runId,
          quality: H2_FIXTURE_QUALITY_REPORT,
          provenance: H2_FIXTURE_PROVENANCE,
        }
      : {
          schemaVersion: 1,
          reportKind: kind,
          run: H2_FIXTURE_ANALYSIS_RUN,
          event: event ?? null,
          provenance: H2_FIXTURE_PROVENANCE,
        }

  return `${JSON.stringify(payload, null, 2)}\n`
}

async function createArtifact(
  kind: H2ReportKind,
  profile: FixtureReportProfile,
  content: string,
  eventId?: string,
): Promise<H2ReportArtifact> {
  assertSafeFixtureFilename(profile.filename, profile.format)
  const { eventId: _fixtureEventId, ...fixtureDescriptor } = H2_FIXTURE_REPORT_DESCRIPTOR
  const descriptor = {
    ...fixtureDescriptor,
    reportId: `fixture-${kind}-${eventId ?? H2_FIXTURE_ANALYSIS_RUN.runId}`,
    kind,
    format: profile.format,
    filename: profile.filename,
    contentHash: await sha256(content),
    ...(eventId ? { eventId } : {}),
    provenance: H2_FIXTURE_PROVENANCE,
  } as const
  return {
    descriptor,
    mediaType: profile.mediaType,
    content,
  }
}

function assertSafeFixtureFilename(
  filename: string,
  format: H2ReportFormat,
): void {
  const extension = format === 'html' ? '.html' : format === 'json' ? '.json' : '.csv'
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(filename) || !filename.endsWith(extension)) {
    throw new Error('Invalid Fixture report filename configuration.')
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      case "'":
        return '&#39;'
      default:
        return character
    }
  })
}
