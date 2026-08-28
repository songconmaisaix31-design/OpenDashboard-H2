import type {
  H2DatasetManifest,
  H2SentinelDataSource,
  H2SeriesResponse,
} from '@opendashboard/h2-contracts'
import type { H2Workspace } from './view-state.ts'

/** Matches the Local service's accepted single-file boundary before browser content is read. */
export const H2_CSV_MAX_BYTES = 96 * 1024 * 1024
/** The Local service remains authoritative for row-count validation. */
export const H2_CSV_MAX_ROWS = 180_000
export const H2_SERIES_REQUEST_MAX_VARIABLES = 32

export interface H2CsvFileInput {
  readonly name: string
  readonly size: number
  text(): Promise<string>
}

export interface H2ImportedWorkspace {
  readonly workspace: H2Workspace
  readonly qualityStatus: 'passed' | 'warning' | 'blocked'
}

export class H2CsvInputError extends Error {
  constructor(readonly code: 'invalid_type' | 'too_large') {
    super(code)
    this.name = 'H2CsvInputError'
  }
}

export async function hydrateH2Workspace(
  dataSource: H2SentinelDataSource,
  datasets: readonly H2DatasetManifest[],
  dataset: H2DatasetManifest,
): Promise<H2Workspace> {
  const run = await dataSource.runAnalysis(dataset.datasetId)
  const events = run.events
  const variables = run.dataset.fields
    .filter(({ role }) => role === 'measurement' || role === 'constraint')
    .map(({ name }) => name)

  try {
    const series = await loadH2Series(dataSource, run.runId, variables, run.dataset.timeRange)
    return {
      mode: run.dataset.mode,
      datasets,
      run,
      events,
      series,
      seriesError: null,
    }
  } catch {
    return {
      mode: run.dataset.mode,
      datasets,
      run,
      events,
      series: null,
      seriesError:
        '时间序列读取失败；没有绘制占位曲线。事件、证据和安全检查仍来自规范化结果。',
    }
  }
}

async function loadH2Series(
  dataSource: H2SentinelDataSource,
  runId: string,
  variables: readonly string[],
  timeRange: H2DatasetManifest['timeRange'],
): Promise<H2SeriesResponse> {
  if (new Set(variables).size !== variables.length) {
    throw new Error('Series variables must be unique before batching.')
  }
  if (variables.length === 0) {
    return { runId, variables: [], points: [] }
  }

  const batches = Array.from(
    { length: Math.ceil(variables.length / H2_SERIES_REQUEST_MAX_VARIABLES) },
    (_, index) => variables.slice(
      index * H2_SERIES_REQUEST_MAX_VARIABLES,
      (index + 1) * H2_SERIES_REQUEST_MAX_VARIABLES,
    ),
  )
  const responses: H2SeriesResponse[] = []
  for (const batch of batches) {
    responses.push(await dataSource.getSeries({
      runId,
      variables: batch,
      startTime: timeRange.startTime,
      endTime: timeRange.endTime,
    }))
  }

  return mergeH2SeriesBatches(runId, batches, responses)
}

function mergeH2SeriesBatches(
  runId: string,
  batches: readonly (readonly string[])[],
  responses: readonly H2SeriesResponse[],
): H2SeriesResponse {
  if (batches.length !== responses.length || responses.length === 0) {
    throw new Error('Series batch count does not match the request.')
  }

  const mergedPoints: Array<{
    readonly timestamp: string
    readonly values: Record<string, number | null>
  }> = []
  responses.forEach((response, batchIndex) => {
    const batch = batches[batchIndex]
    if (
      !batch ||
      response.runId !== runId ||
      !sameStrings(response.variables, batch)
    ) {
      throw new Error('Series batch identity does not match the request.')
    }
    if (batchIndex > 0 && response.points.length !== mergedPoints.length) {
      throw new Error('Series batches returned different point counts.')
    }

    response.points.forEach((point, pointIndex) => {
      const keys = Object.keys(point.values)
      if (
        keys.length !== batch.length ||
        !batch.every((variable) => Object.hasOwn(point.values, variable))
      ) {
        throw new Error('Series batch values do not match the requested variables.')
      }
      if (batchIndex === 0) {
        mergedPoints.push({ timestamp: point.timestamp, values: { ...point.values } })
        return
      }

      const mergedPoint = mergedPoints[pointIndex]
      if (!mergedPoint || mergedPoint.timestamp !== point.timestamp) {
        throw new Error('Series batches returned different timestamps.')
      }
      for (const variable of batch) {
        if (Object.hasOwn(mergedPoint.values, variable)) {
          throw new Error('Series batches returned overlapping variables.')
        }
        mergedPoint.values[variable] = point.values[variable] ?? null
      }
    })
  })

  return {
    runId,
    variables: batches.flatMap((batch) => [...batch]),
    points: mergedPoints,
  }
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

export async function importH2CsvWorkspace(
  dataSource: H2SentinelDataSource,
  file: H2CsvFileInput,
): Promise<H2ImportedWorkspace> {
  validateH2CsvFile(file)
  const text = await file.text()
  const result = await dataSource.importCsv({ filename: file.name, text })
  const listedDatasets = await dataSource.listDatasets()
  const datasets = listedDatasets.some(
    ({ datasetId }) => datasetId === result.dataset.datasetId,
  )
    ? listedDatasets
    : [...listedDatasets, result.dataset]
  const workspace = await hydrateH2Workspace(
    dataSource,
    datasets,
    result.dataset,
  )

  return { workspace, qualityStatus: result.quality.status }
}

export function validateH2CsvFile(
  file: Pick<H2CsvFileInput, 'name' | 'size'>,
): void {
  if (!file.name.toLocaleLowerCase('en-US').endsWith('.csv')) {
    throw new H2CsvInputError('invalid_type')
  }
  if (file.size > H2_CSV_MAX_BYTES) {
    throw new H2CsvInputError('too_large')
  }
}
