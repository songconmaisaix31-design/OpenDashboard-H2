import type {
  H2AnalysisRun,
  H2CsvUploadChunkRequest,
  H2DatasetManifest,
  H2SentinelDataSource,
  H2StreamingCsvDataSource,
} from '@opendashboard/h2-contracts'
import { H2_STREAMING_IMPORT_LIMITS } from '@opendashboard/h2-contracts'
import { H2Sha256, h2Sha256Hex } from './sha256.ts'
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

export interface H2StreamingCsvFileInput extends H2CsvFileInput {
  slice(start?: number, end?: number): { arrayBuffer(): Promise<ArrayBuffer> }
}

export interface H2StreamingImportProgress {
  readonly phase: 'preparing' | 'uploading' | 'retrying' | 'finalizing'
  readonly uploadedBytes: number
  readonly totalBytes: number
  readonly completedChunks: number
  readonly totalChunks: number
}

export interface H2StreamingImportOptions {
  readonly signal?: AbortSignal
  readonly onProgress?: (progress: H2StreamingImportProgress) => void
}

export interface H2ImportedWorkspace {
  readonly workspace: H2Workspace
  readonly qualityStatus: 'passed' | 'warning' | 'blocked'
}

export class H2CsvInputError extends Error {
  constructor(readonly code:
    | 'invalid_type'
    | 'too_large'
    | 'streaming_unavailable'
    | 'cancelled'
    | 'retryable_upload'
    | 'terminal_upload'
    | 'finalization_failed') {
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
  const mode = dataset.mode

  assertH2WorkspaceProvenanceConsistency(dataset, run)

  return {
    mode,
    datasets,
    run,
    events,
  }
}

function assertH2WorkspaceProvenanceConsistency(
  workspaceDataset: H2DatasetManifest,
  run: H2AnalysisRun,
): void {
  const runProvenance = run.provenance
  const hasContradictoryMode = [
    run.dataset.mode,
    run.dataset.provenance.mode,
    runProvenance.mode,
  ].some((mode) => mode !== workspaceDataset.mode)
  const hasContradictoryFingerprint = [
    run.dataset.fingerprint,
    run.dataset.provenance.datasetFingerprint,
    runProvenance.datasetFingerprint,
  ].some((fingerprint) => fingerprint !== workspaceDataset.fingerprint)
  const hasContradictoryEvent = run.events.some(({ provenance }) =>
    provenance.mode !== runProvenance.mode ||
    provenance.datasetFingerprint !== runProvenance.datasetFingerprint,
  )

  // Contradictory source identities must stop at hydration, before any page can relabel them.
  if (hasContradictoryMode || hasContradictoryFingerprint || hasContradictoryEvent) {
    throw new Error('H2 workspace provenance is internally inconsistent.')
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

export function h2CsvImportFailureMessage(error: H2CsvInputError): string {
  if (error.code === 'invalid_type') return '只接受明确选择的 .csv 文件。'
  if (error.code === 'too_large') return 'CSV 超过 256 MiB 分片导入上限；未开始导入。'
  if (error.code === 'streaming_unavailable') return '当前本地服务未启用分片导入；小文件仍可使用旧导入，完整训练集未被读取为整段文本。'
  if (error.code === 'cancelled') return '已取消分片导入；当前运行保持不变，服务端临时会话将按过期策略清理。'
  if (error.code === 'retryable_upload') return '分片上传在一次合同内幂等重试后仍失败；可重新选择同一文件创建新会话。'
  if (error.code === 'finalization_failed') return '分片字节数、块数或 SHA-256 最终校验未通过；未切换当前运行。'
  return '分片顺序、回执或请求合同出现终止性错误；未继续上传，也未切换当前运行。'
}

export async function importH2StreamingCsvWorkspace(
  dataSource: H2SentinelDataSource,
  file: H2StreamingCsvFileInput,
  options: H2StreamingImportOptions = {},
): Promise<H2ImportedWorkspace> {
  validateH2StreamingCsvFile(file)
  if (!isH2StreamingCsvDataSource(dataSource)) {
    throw new H2CsvInputError('streaming_unavailable')
  }

  const totalChunks = Math.ceil(file.size / H2_STREAMING_IMPORT_LIMITS.chunkBytes)
  const emit = (phase: H2StreamingImportProgress['phase'], uploadedBytes: number, completedChunks: number): void =>
    options.onProgress?.({ phase, uploadedBytes, totalBytes: file.size, completedChunks, totalChunks })
  assertNotCancelled(options.signal)
  emit('preparing', 0, 0)
  const session = await dataSource.createCsvUploadSession({
    schemaVersion: 1,
    requestId: createH2RequestId('session'),
    filename: file.name,
    declaredBytes: file.size,
  })
  const fullHash = new H2Sha256()

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    assertNotCancelled(options.signal)
    const offsetBytes = chunkIndex * H2_STREAMING_IMPORT_LIMITS.chunkBytes
    const endBytes = Math.min(offsetBytes + H2_STREAMING_IMPORT_LIMITS.chunkBytes, file.size)
    const bytes = new Uint8Array(await file.slice(offsetBytes, endBytes).arrayBuffer())
    fullHash.update(bytes)
    const request = {
      schemaVersion: 1,
      requestId: createH2RequestId(`chunk-${chunkIndex}`),
      sessionId: session.sessionId,
      chunkIndex,
      offsetBytes,
      byteLength: bytes.byteLength,
      contentHash: `sha256:${h2Sha256Hex(bytes)}`,
    } as const satisfies H2CsvUploadChunkRequest
    emit('uploading', offsetBytes, chunkIndex)
    const receipt = await uploadH2ChunkWithContractRetry(
      dataSource,
      request,
      bytes,
      () => emit('retrying', offsetBytes, chunkIndex),
    )
    if (
      receipt.acceptedChunkIndex !== chunkIndex ||
      receipt.nextChunkIndex !== chunkIndex + 1 ||
      receipt.receivedBytes !== endBytes
    ) throw new H2CsvInputError('terminal_upload')
    emit('uploading', endBytes, chunkIndex + 1)
  }

  assertNotCancelled(options.signal)
  emit('finalizing', file.size, totalChunks)
  let finalized
  try {
    finalized = await dataSource.finalizeCsvUpload({
      schemaVersion: 1,
      requestId: createH2RequestId('finalize'),
      sessionId: session.sessionId,
      totalChunks,
      totalBytes: file.size,
      contentHash: `sha256:${fullHash.digestHex()}`,
    })
  } catch {
    throw new H2CsvInputError('finalization_failed')
  }
  const listedDatasets = await dataSource.listDatasets()
  const datasets = listedDatasets.some(({ datasetId }) => datasetId === finalized.result.dataset.datasetId)
    ? listedDatasets
    : [...listedDatasets, finalized.result.dataset]
  const workspace = await hydrateH2Workspace(dataSource, datasets, finalized.result.dataset)
  return { workspace, qualityStatus: finalized.result.quality.status }
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

export function validateH2StreamingCsvFile(
  file: Pick<H2StreamingCsvFileInput, 'name' | 'size'>,
): void {
  if (!file.name.toLocaleLowerCase('en-US').endsWith('.csv')) {
    throw new H2CsvInputError('invalid_type')
  }
  if (file.size > H2_STREAMING_IMPORT_LIMITS.maxBytes) {
    throw new H2CsvInputError('too_large')
  }
}

export function isH2StreamingCsvDataSource(
  dataSource: H2SentinelDataSource,
): dataSource is H2StreamingCsvDataSource {
  const candidate = dataSource as Partial<H2StreamingCsvDataSource>
  return typeof candidate.createCsvUploadSession === 'function' &&
    typeof candidate.uploadCsvChunk === 'function' &&
    typeof candidate.finalizeCsvUpload === 'function'
}

async function uploadH2ChunkWithContractRetry(
  dataSource: H2StreamingCsvDataSource,
  request: H2CsvUploadChunkRequest,
  bytes: Uint8Array,
  onRetry: () => void,
) {
  try {
    return await dataSource.uploadCsvChunk(request, bytes)
  } catch (error: unknown) {
    if (!isExplicitlyRetryable(error)) throw new H2CsvInputError('terminal_upload')
    onRetry()
    try {
      // The immutable request ID, hash and bytes let the server replay safely.
      return await dataSource.uploadCsvChunk(request, bytes)
    } catch {
      throw new H2CsvInputError('retryable_upload')
    }
  }
}

function isExplicitlyRetryable(error: unknown): boolean {
  return typeof error === 'object' && error !== null &&
    'retryable' in error && error.retryable === true
}

function assertNotCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new H2CsvInputError('cancelled')
}

function createH2RequestId(scope: string): string {
  const suffix = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return `h2-web-${scope}-${suffix}`
}
