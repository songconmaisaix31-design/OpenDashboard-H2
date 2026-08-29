import type { H2AssistantAnswer } from './assistant.ts'
import type { H2Provenance, H2ProvenanceMode } from './provenance.ts'

export type H2LlmRenderingProvenance = H2Provenance & {
  readonly mode: 'LLM_RENDERED'
  readonly modelVersion: string
  readonly rendererVersion: string
}

export type H2DeterministicRenderingProvenance = H2Provenance & {
  readonly mode: Exclude<H2ProvenanceMode, 'LLM_RENDERED'>
}

export type H2AssistantRenderingFallbackReason =
  | 'not_requested'
  | 'not_configured'
  | 'policy_disabled'
  | 'provider_unavailable'
  | 'timeout'
  | 'invalid_output'

interface H2AssistantRenderingBase {
  readonly schemaVersion: 1
  readonly deterministicAnswerId: H2AssistantAnswer['answerId']
  readonly provenance: H2Provenance
}

export interface H2AssistantRenderedResult extends H2AssistantRenderingBase {
  readonly status: 'rendered'
  readonly renderedText: string
  readonly citationIds: readonly string[]
  readonly provenance: H2LlmRenderingProvenance
}

export interface H2AssistantRenderingFallbackResult
  extends H2AssistantRenderingBase {
  readonly status: 'fallback'
  readonly reason: Exclude<
    H2AssistantRenderingFallbackReason,
    'not_requested' | 'not_configured' | 'policy_disabled'
  >
  readonly provenance: H2DeterministicRenderingProvenance
}

export interface H2AssistantRenderingDisabledResult
  extends H2AssistantRenderingBase {
  readonly status: 'disabled'
  readonly reason: Extract<
    H2AssistantRenderingFallbackReason,
    'not_requested' | 'not_configured' | 'policy_disabled'
  >
  readonly provenance: H2DeterministicRenderingProvenance
}

export type H2AssistantRenderingResult =
  | H2AssistantRenderedResult
  | H2AssistantRenderingFallbackResult
  | H2AssistantRenderingDisabledResult
