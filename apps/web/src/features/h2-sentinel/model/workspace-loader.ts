import type {
  H2DatasetManifest,
  H2SentinelDataSource,
} from '@opendashboard/h2-contracts'
import type { H2Workspace } from './view-state.ts'

/** Matches the Local service's accepted single-file boundary before browser content is read. */
export const H2_CSV_MAX_BYTES = 96 * 1024 * 1024
/** The Local service remains authoritative for row-count validation. */
export const H2_CSV_MAX_ROWS = 180_000

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

  return {
    mode: run.dataset.mode,
    datasets,
    run,
    events,
  }
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
