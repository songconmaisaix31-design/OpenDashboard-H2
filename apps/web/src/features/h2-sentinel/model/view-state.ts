import type {
  H2AnalysisRun,
  H2AssistantAnswer,
  H2DatasetManifest,
  H2DatasetMode,
  H2ReportArtifact,
  H2SeriesResponse,
  H2AnomalyEvent,
} from '@opendashboard/h2-contracts'

export interface H2Workspace {
  readonly mode: H2DatasetMode
  readonly datasets: readonly H2DatasetManifest[]
  readonly run: H2AnalysisRun
  readonly events: readonly H2AnomalyEvent[]
  readonly series: H2SeriesResponse | null
  readonly seriesError: string | null
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
  | 'analysis-json'
  | 'quality-report'
  | 'submission'
  | 'import'

export interface H2CommandState {
  readonly pending: H2PendingOperation | null
  readonly notice: string | null
  readonly error: string | null
  readonly assistantAnswer: H2AssistantAnswer | null
  readonly artifact: H2ReportArtifact | null
}

export const INITIAL_H2_COMMAND_STATE: H2CommandState = {
  pending: null,
  notice: null,
  error: null,
  assistantAnswer: null,
  artifact: null,
}
