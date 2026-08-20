import {
  H2_FIXTURE_ANALYSIS_RUN,
  H2_FIXTURE_ASSISTANT_ANSWER,
  H2_FIXTURE_DATASET,
  H2_FIXTURE_PROVENANCE,
  H2_FIXTURE_QUALITY_REPORT,
  H2_FIXTURE_REPORT_DESCRIPTOR,
  H2_GOLDEN_C03_EVENT,
  H2_GOLDEN_C04_EVENT,
  serializeH2SubmissionRows,
  toH2SubmissionRow,
  type H2AnalysisRun,
  type H2AnomalyEvent,
  type H2AssistantAnswer,
  type H2AssistantRequest,
  type H2CsvImportRequest,
  type H2CsvImportResult,
  type H2DataQualityReport,
  type H2DatasetManifest,
  type H2DatasetMode,
  type H2EventFilter,
  type H2ReportArtifact,
  type H2ReportRequest,
  type H2SentinelDataSource,
  type H2SeriesRequest,
  type H2SeriesResponse,
} from '@opendashboard/h2-contracts'

export const CORRECTED_C04_IMPACT_KWH = 29.333333333333332

export const H2_WEB_FIXTURE_C04_EVENT = {
  ...H2_GOLDEN_C04_EVENT,
  evidence: H2_GOLDEN_C04_EVENT.evidence.map((item) =>
    item.evidenceId === 'C04-EV-003'
      ? { ...item, actualValue: CORRECTED_C04_IMPACT_KWH }
      : item,
  ),
  impact: {
    ...H2_GOLDEN_C04_EVENT.impact,
    value: CORRECTED_C04_IMPACT_KWH,
  },
} as H2AnomalyEvent

export const H2_WEB_FIXTURE_EVENTS = [
  H2_GOLDEN_C03_EVENT,
  H2_WEB_FIXTURE_C04_EVENT,
] as const satisfies readonly H2AnomalyEvent[]

export const H2_WEB_FIXTURE_RUN = {
  ...H2_FIXTURE_ANALYSIS_RUN,
  events: H2_WEB_FIXTURE_EVENTS,
} as H2AnalysisRun

export function createH2WebFixtureDataSource(
  options: {
    readonly empty?: boolean
    readonly failSeries?: boolean
  } = {},
): H2SentinelDataSource {
  const series = createFixtureSeries()

  return {
    async getMode(): Promise<H2DatasetMode> {
      return 'FIXTURE'
    },
    async listDatasets(): Promise<readonly H2DatasetManifest[]> {
      return options.empty ? [] : [H2_FIXTURE_DATASET]
    },
    async importCsv(_request: H2CsvImportRequest): Promise<H2CsvImportResult> {
      throw new Error('Fixture preview does not import files.')
    },
    async getDataQuality(datasetId: string): Promise<H2DataQualityReport> {
      assertReference(datasetId, H2_FIXTURE_DATASET.datasetId)
      return H2_FIXTURE_QUALITY_REPORT
    },
    async runAnalysis(datasetId: string): Promise<H2AnalysisRun> {
      assertReference(datasetId, H2_FIXTURE_DATASET.datasetId)
      return H2_WEB_FIXTURE_RUN
    },
    async getOverview(runId: string): Promise<H2AnalysisRun> {
      assertReference(runId, H2_WEB_FIXTURE_RUN.runId)
      return H2_WEB_FIXTURE_RUN
    },
    async listEvents(runId: string, filter?: H2EventFilter): Promise<readonly H2AnomalyEvent[]> {
      assertReference(runId, H2_WEB_FIXTURE_RUN.runId)
      return H2_WEB_FIXTURE_EVENTS.filter((event) => matchesFilter(event, filter))
    },
    async getEvent(runId: string, eventId: string): Promise<H2AnomalyEvent> {
      assertReference(runId, H2_WEB_FIXTURE_RUN.runId)
      const event = H2_WEB_FIXTURE_EVENTS.find((candidate) => candidate.eventId === eventId)
      if (!event) throw new Error('Unknown fixture event.')
      return event
    },
    async getSeries(request: H2SeriesRequest): Promise<H2SeriesResponse> {
      assertReference(request.runId, H2_WEB_FIXTURE_RUN.runId)
      if (options.failSeries) throw new Error('Fixture series failure.')
      return {
        ...series,
        variables: request.variables,
        points: series.points.map((point) => ({
          timestamp: point.timestamp,
          values: Object.fromEntries(
            request.variables.map((variable) => [variable, point.values[variable] ?? null]),
          ),
        })),
      }
    },
    async ask(request: H2AssistantRequest): Promise<H2AssistantAnswer> {
      assertReference(request.runId, H2_WEB_FIXTURE_RUN.runId)
      if (request.questionId === H2_FIXTURE_ASSISTANT_ANSWER.questionId) {
        return H2_FIXTURE_ASSISTANT_ANSWER
      }
      return {
        ...H2_FIXTURE_ASSISTANT_ANSWER,
        answerId: `answer-${request.questionId}-fixture`,
        questionId: request.questionId,
        ...(request.eventId ? { eventId: request.eventId } : {}),
        sections: [
          {
            sectionId: 'fixture-boundary',
            claimKind: 'fact',
            text: '此固定样例回答来自结构化模板；不会发出设备控制指令。',
            citationIds: [],
          },
        ],
        citations: [],
      }
    },
    async exportReport(request: H2ReportRequest): Promise<H2ReportArtifact> {
      assertReference(request.runId, H2_WEB_FIXTURE_RUN.runId)
      const format = request.kind === 'analysis_result_json' ? 'json' : 'html'
      const mediaType = format === 'json' ? 'application/json' : 'text/html'
      const filename = `h2-fixture-${request.kind}.${format}`
      const content =
        format === 'json'
          ? `${JSON.stringify(H2_WEB_FIXTURE_RUN, null, 2)}\n`
          : `<main><h1>H2 Sentinel Fixture Report</h1><p>Advisory only. Human confirmation required.</p></main>`

      return {
        descriptor: {
          ...H2_FIXTURE_REPORT_DESCRIPTOR,
          reportId: `report-fixture-${request.kind}`,
          kind: request.kind,
          format,
          filename,
          ...(request.eventId ? { eventId: request.eventId } : {}),
        },
        mediaType,
        content,
      }
    },
    async exportSubmission(runId: string): Promise<H2ReportArtifact> {
      assertReference(runId, H2_WEB_FIXTURE_RUN.runId)
      return {
        descriptor: {
          ...H2_FIXTURE_REPORT_DESCRIPTOR,
          reportId: 'report-fixture-submission',
          kind: 'submission_csv',
          format: 'csv',
          filename: 'submission.csv',
        },
        mediaType: 'text/csv',
        content: serializeH2SubmissionRows(H2_WEB_FIXTURE_EVENTS.map(toH2SubmissionRow)),
      }
    },
  }
}

function createFixtureSeries(): H2SeriesResponse {
  const points = Array.from({ length: 22 }, (_, index) => {
    const minute = 20 + index
    const isC04Interval = minute >= 32 && minute <= 39
    return {
      timestamp: `2026-01-05T10:${String(minute).padStart(2, '0')}:00Z`,
      values: {
        pv_actual_kw: 820 - index * 2.6,
        bess_power_kw: 230,
        pcc_power_kw: isC04Interval ? 720 : 590,
        total_electrolyzer_power_kw: 500,
        auxiliary_load_kw: 140 - index * 1.6,
        bess_soc_percent: 55 + index * 0.2,
        pcc_export_limit_kw: 500,
        pcc_import_limit_kw: 450,
        bess_dispatch_command_kw: -240,
      },
    }
  })

  return {
    runId: H2_WEB_FIXTURE_RUN.runId,
    variables: H2_FIXTURE_DATASET.fields
      .filter(({ role }) => role === 'measurement' || role === 'constraint')
      .map(({ name }) => name),
    points,
  }
}

function matchesFilter(event: H2AnomalyEvent, filter?: H2EventFilter): boolean {
  if (!filter) return true
  return (
    (!filter.codes || filter.codes.includes(event.code)) &&
    (!filter.severities || filter.severities.includes(event.severity)) &&
    (!filter.reviewStates || filter.reviewStates.includes(event.reviewState)) &&
    (filter.minConfidence === undefined || event.confidence >= filter.minConfidence) &&
    (!filter.equipmentIds || event.affectedEquipment.some(({ id }) => filter.equipmentIds?.includes(id)))
  )
}

function assertReference(actual: string, expected: string): void {
  if (actual !== expected) throw new Error('Unknown fixture reference.')
}

export { H2_FIXTURE_PROVENANCE }
