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
  readonly assistantMode: H2AssistantModeDisplay | null
}

export type H2AssistantModeDisplay =
  | {
      readonly status: 'rendered'
      readonly message: string
    }
  | {
      readonly status: 'deterministic' | 'fallback'
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
  assistantMode: null,
}

export function getH2AssistantModeDisplay(
  answer: H2AssistantAnswer,
  allowLlmRendering: boolean,
): H2AssistantModeDisplay {
  if (answer.mode === 'LLM_RENDERED' && answer.provenance.mode === 'LLM_RENDERED') {
    return {
      status: 'rendered',
      message: `已由 ${answer.provenance.source} 重述；事实、引用与控制边界仍由确定性答案约束。`,
    }
  }
  if (answer.mode !== 'DETERMINISTIC_TEMPLATE' || answer.provenance.mode === 'LLM_RENDERED') {
    return {
      status: 'fallback',
      message: '答案模式与来源不一致；按安全回退状态展示，不能视为可信语言重述。',
    }
  }
  return allowLlmRendering
    ? { status: 'fallback', message: '可选语言重述未返回；已保留确定性答案与原始引用。' }
    : { status: 'deterministic', message: '未请求可选语言重述；下方为确定性答案。' }
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
