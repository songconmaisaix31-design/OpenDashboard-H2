import type { H2SentinelDataSource, H2CsvImportResult } from './data-source.ts'

export const H2_STREAMING_IMPORT_LIMITS = {
  maxBytes: 256 * 1024 * 1024,
  maxRows: 600_000,
  chunkBytes: 8 * 1024 * 1024,
} as const

export type H2CsvUploadSessionStatus = 'open' | 'finalized' | 'expired'

export interface H2CsvUploadSessionCreateRequest {
  readonly schemaVersion: 1
  readonly requestId: string
  readonly filename: string
  readonly declaredBytes: number
  readonly expectedContentHash?: string
}

export interface H2CsvUploadSession {
  readonly schemaVersion: 1
  readonly sessionId: string
  readonly filename: string
  readonly status: H2CsvUploadSessionStatus
  readonly declaredBytes: number
  readonly receivedBytes: number
  readonly nextChunkIndex: number
  readonly expiresAt: string
}

export interface H2CsvUploadChunkRequest {
  readonly schemaVersion: 1
  readonly requestId: string
  readonly sessionId: string
  readonly chunkIndex: number
  readonly offsetBytes: number
  readonly byteLength: number
  readonly contentHash: string
}

export interface H2CsvUploadChunkReceipt {
  readonly schemaVersion: 1
  readonly sessionId: string
  readonly acceptedChunkIndex: number
  readonly receivedBytes: number
  readonly nextChunkIndex: number
  readonly replayed: boolean
}

export interface H2CsvUploadFinalizeRequest {
  readonly schemaVersion: 1
  readonly requestId: string
  readonly sessionId: string
  readonly totalChunks: number
  readonly totalBytes: number
  readonly contentHash: string
}

export interface H2CsvUploadFinalizeReceipt {
  readonly schemaVersion: 1
  readonly sessionId: string
  readonly status: 'finalized'
  readonly totalChunks: number
  readonly totalBytes: number
  readonly contentHash: string
  readonly replayed: boolean
  readonly result: H2CsvImportResult
}

export interface H2StreamingCsvDataSource extends H2SentinelDataSource {
  createCsvUploadSession(
    request: H2CsvUploadSessionCreateRequest,
  ): Promise<H2CsvUploadSession>
  uploadCsvChunk(
    request: H2CsvUploadChunkRequest,
    bytes: Uint8Array,
  ): Promise<H2CsvUploadChunkReceipt>
  finalizeCsvUpload(
    request: H2CsvUploadFinalizeRequest,
  ): Promise<H2CsvUploadFinalizeReceipt>
}
