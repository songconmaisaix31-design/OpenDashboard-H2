import type {
  H2AnalysisRun,
  H2AssistantAnswer,
  H2DatasetManifest,
  H2DatasetMode,
  H2EventReview,
  H2ReportArtifact,
  H2ReviewAction,
  H2AnomalyEvent,
} from '@opendashboard/h2-contracts'

export interface H2Workspace {
  readonly mode: H2DatasetMode
  readonly datasets: readonly H2DatasetManifest[]
  readonly run: H2AnalysisRun
  readonly events: readonly H2AnomalyEvent[]
}

export type H2WorkspaceState =
  | { readonly status: 'loading'; readonly message: string }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'empty'; readonly mode: H2DatasetMode }
  | { readonly status: 'ready'; readonly workspace: H2Workspace }

export type H2PendingOperation =
  | 'assistant'
  | 'event-report'
  | 'period-report'
  | 'pcc-report'
  | 'analysis-json'
  | 'validation-metrics'
  | 'quality-report'
  | 'review-audit'
  | 'submission'
  | 'import'

export interface H2CommandState {
  readonly pending: H2PendingOperation | null
  readonly notice: string | null
  readonly error: string | null
  readonly assistantAnswer: H2AssistantAnswer | null
  readonly artifact: H2ReportArtifact | null
  readonly importProgress: H2ImportProgressState | null
  readonly assistantRendering: H2AssistantRenderingDisplay | null
}

export type H2AssistantRenderingDisplay =
  | {
      readonly status: 'rendered'
      readonly text: string
      readonly citationIds: readonly string[]
      readonly provenanceLabel: string
    }
  | {
      readonly status: 'disabled' | 'fallback'
      readonly message: string
    }

export interface H2ImportProgressState {
  readonly phase: 'preparing' | 'uploading' | 'retrying' | 'finalizing'
  readonly uploadedBytes: number
  readonly totalBytes: number
  readonly completedChunks: number
  readonly totalChunks: number
}

export const INITIAL_H2_COMMAND_STATE: H2CommandState = {
  pending: null,
  notice: null,
  error: null,
  assistantAnswer: null,
  artifact: null,
  importProgress: null,
  assistantRendering: null,
}

export function beginH2ArtifactExport(
  state: H2CommandState,
  pending: H2PendingOperation,
): H2CommandState {
  return {
    ...state,
    pending,
    notice: null,
    error: null,
    artifact: null,
  }
}

export function failH2ArtifactExport(
  state: H2CommandState,
  error: string,
): H2CommandState {
  return {
    ...state,
    pending: null,
    notice: null,
    error,
    artifact: null,
  }
}

export interface H2ReviewCommandState {
  readonly review: H2EventReview | null
  readonly loading: boolean
  readonly pending: H2ReviewAction | null
  readonly error: string | null
  readonly notice: string | null
}

export const INITIAL_H2_REVIEW_COMMAND_STATE: H2ReviewCommandState = {
  review: null,
  loading: false,
  pending: null,
  error: null,
  notice: null,
}
