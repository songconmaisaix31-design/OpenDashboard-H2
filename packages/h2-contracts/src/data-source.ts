import type { H2AnalysisRun } from './analysis-run.ts'
import type { H2AnomalyCode, H2AnomalyEvent, H2Severity } from './anomaly.ts'
import type { H2AssistantAnswer, H2AssistantRequest } from './assistant.ts'
import type { H2DatasetManifest, H2DatasetMode } from './dataset.ts'
import type { H2TimeRange } from './provenance.ts'
import type { H2DataQualityReport } from './quality.ts'
import type { H2ReportArtifact, H2ReportKind } from './report.ts'

export interface H2EventFilter {
  readonly codes?: readonly H2AnomalyCode[]
  readonly severities?: readonly H2Severity[]
  readonly equipmentIds?: readonly string[]
  readonly reviewStates?: readonly H2AnomalyEvent['reviewState'][]
  readonly minConfidence?: number
  readonly startsAtOrAfter?: string
  readonly endsAtOrBefore?: string
}

export interface H2SeriesRequest {
  readonly runId: string
  readonly variables: readonly string[]
  readonly startTime: string
  readonly endTime: string
  readonly eventId?: string
}

export interface H2SeriesPoint {
  readonly timestamp: string
  readonly values: Readonly<Record<string, number | null>>
}

export interface H2SeriesResponse {
  readonly runId: string
  readonly variables: readonly string[]
  readonly points: readonly H2SeriesPoint[]
}

export interface H2ReportRequest {
  readonly runId: string
  readonly kind: H2ReportKind
  readonly eventId?: string
  readonly timeRange?: H2TimeRange
}

export interface H2CsvImportRequest {
  readonly filename: string
  readonly text: string
}

export interface H2CsvImportResult {
  readonly dataset: H2DatasetManifest
  readonly quality: H2DataQualityReport
}

export interface H2SentinelDataSource {
  getMode(): Promise<H2DatasetMode>
  listDatasets(): Promise<readonly H2DatasetManifest[]>
  importCsv(request: H2CsvImportRequest): Promise<H2CsvImportResult>
  getDataQuality(datasetId: string): Promise<H2DataQualityReport>
  runAnalysis(datasetId: string): Promise<H2AnalysisRun>
  getOverview(runId: string): Promise<H2AnalysisRun>
  listEvents(
    runId: string,
    filter?: H2EventFilter,
  ): Promise<readonly H2AnomalyEvent[]>
  getEvent(runId: string, eventId: string): Promise<H2AnomalyEvent>
  getSeries(request: H2SeriesRequest): Promise<H2SeriesResponse>
  ask(request: H2AssistantRequest): Promise<H2AssistantAnswer>
  exportReport(request: H2ReportRequest): Promise<H2ReportArtifact>
  exportSubmission(runId: string): Promise<H2ReportArtifact>
}
