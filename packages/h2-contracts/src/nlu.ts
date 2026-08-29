import type { H2AssistantQuestionId } from './assistant.ts'
import type { H2TimeRange } from './provenance.ts'

export const H2_NLU_MAX_INPUT_CHARS = 500 as const

export type H2NluRefusalReason =
  | 'input_too_long'
  | 'unsupported_intent'
  | 'ambiguous_intent'
  | 'low_confidence'

export interface H2NluRequest {
  readonly schemaVersion: 1
  readonly text: string
  readonly runId: string
}

export interface H2NluMatchedResult {
  readonly schemaVersion: 1
  readonly status: 'matched'
  readonly questionId: H2AssistantQuestionId
  readonly confidence: number
  readonly eventId?: string
  readonly timeRange?: H2TimeRange
}

export interface H2NluRefusedResult {
  readonly schemaVersion: 1
  readonly status: 'refused'
  readonly reason: H2NluRefusalReason
  readonly confidence: number
  readonly allowedQuestionIds: readonly H2AssistantQuestionId[]
}

export type H2NluResult = H2NluMatchedResult | H2NluRefusedResult
