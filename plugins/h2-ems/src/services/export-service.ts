import type {
  H2ReportArtifact,
  H2ReportRequest,
  H2SentinelDataSource,
} from '../../../../packages/h2-contracts/src/index.ts'

export function exportH2EmsReport(
  source: H2SentinelDataSource,
  request: H2ReportRequest,
): Promise<H2ReportArtifact> {
  return source.exportReport(request)
}
