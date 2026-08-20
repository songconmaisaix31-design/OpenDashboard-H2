import type {
  H2ReportArtifact,
  H2ReportRequest,
  H2SentinelDataSource,
} from '@opendashboard/h2-contracts'

export function exportH2EmsReport(
  source: H2SentinelDataSource,
  request: H2ReportRequest,
): Promise<H2ReportArtifact> {
  return source.exportReport(request)
}
