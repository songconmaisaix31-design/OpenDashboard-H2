import type {
  H2ReportKind,
  H2ReportRequest,
  H2TimeRange,
} from '@opendashboard/h2-contracts'

export function createH2ReportRequest(
  kind: H2ReportKind,
  runId: string,
  datasetTimeRange: H2TimeRange,
  eventId?: string,
): H2ReportRequest {
  if (kind === 'single_event_diagnosis') {
    if (!eventId) throw new RangeError('report.event_required')
    return { runId, kind, eventId }
  }
  if (kind === 'period_summary') {
    return { runId, kind, timeRange: datasetTimeRange }
  }
  if (kind === 'pcc_daily_compliance') {
    return { runId, kind, timeRange: h2DatasetCalendarDay(datasetTimeRange.startTime) }
  }
  return { runId, kind }
}
export function h2DatasetCalendarDay(timestamp: string): H2TimeRange {
  const match = /^(\d{4})-(\d{2})-(\d{2})T.*(Z|[+-]\d{2}:\d{2})$/u.exec(timestamp)
  if (!match) throw new RangeError('report.invalid_dataset_time')
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const nextDate = new Date(Date.UTC(year, month - 1, day + 1))
    .toISOString()
    .slice(0, 10)
  const date = `${match[1]}-${match[2]}-${match[3]}`
  const offset = match[4]
  return {
    startTime: `${date}T00:00:00${offset}`,
    endTime: `${nextDate}T00:00:00${offset}`,
  }
}
