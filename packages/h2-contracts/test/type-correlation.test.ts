import {
  serializeH2SubmissionRows,
  toH2SubmissionRow,
  type H2AnomalyEvent,
  type H2AnalysisRun,
  type H2CsvImportRequest,
  type H2DataQualityReport,
  type H2ReportArtifact,
  type H2ReportDescriptor,
  type H2ReportMediaType,
  type H2ReportRequest,
  type H2SentinelDataSource,
  type H2SubmissionRow,
} from '../src/index.ts'

type H2C03Event = Extract<H2AnomalyEvent, { readonly code: 'C03' }>
type H2C03SubmissionRow = Extract<
  H2SubmissionRow,
  { readonly anomaly_code: 'C03' }
>

// @ts-expect-error C03 only accepts BESS_DIRECTION_REVERSED.
const invalidEventSubtype: H2C03Event['subtype'] =
  'EXPORT_POWER_LIMIT_NOT_TRACKED'

// @ts-expect-error C03 only accepts abnormal_grid_exchange_energy_kwh.
const invalidImpactMetric: H2C03SubmissionRow['primary_impact_metric'] =
  'pcc_power_limit_violation_energy_kwh'

void invalidEventSubtype
void invalidImpactMetric

function serializeWideEvent(event: H2AnomalyEvent): string {
  const row: H2SubmissionRow = toH2SubmissionRow(event)
  return serializeH2SubmissionRows([row])
}

void serializeWideEvent

function consumeLiveImportFlow(
  source: H2SentinelDataSource,
  request: H2CsvImportRequest,
): Promise<H2AnalysisRun> {
  return source.importCsv(request).then(async ({ dataset, quality }) => {
    const importedQuality: H2DataQualityReport = quality
    const currentQuality: H2DataQualityReport = await source.getDataQuality(
      dataset.datasetId,
    )
    void importedQuality
    void currentQuality
    return source.runAnalysis(dataset.datasetId)
  })
}

type Assert<TValue extends true> = TValue
type H2CsvImportRequestKeys = keyof H2CsvImportRequest
type HasOnlyPathFreeImportFields = Exclude<
  H2CsvImportRequestKeys,
  'filename' | 'text'
> extends never
  ? true
  : false
const pathFreeImportRequest: Assert<HasOnlyPathFreeImportFields> = true

void consumeLiveImportFlow
void pathFreeImportRequest

function consumeReportArtifacts(
  source: H2SentinelDataSource,
  request: H2ReportRequest,
): Promise<H2ReportArtifact> {
  return source.exportReport(request).then(async (artifact) => {
    const descriptor: H2ReportDescriptor = artifact.descriptor
    const mediaType: H2ReportMediaType = artifact.mediaType
    const content: string = artifact.content
    void descriptor
    void mediaType
    void content
    return source.exportSubmission(request.runId)
  })
}

const periodSummaryRequest: H2ReportRequest = {
  runId: 'run-contract-surface',
  kind: 'period_summary',
  timeRange: {
    startTime: '2026-01-05T10:20:00Z',
    endTime: '2026-01-05T10:41:00Z',
  },
}

void consumeReportArtifacts
void periodSummaryRequest
