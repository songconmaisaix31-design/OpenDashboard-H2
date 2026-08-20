import type { H2AnomalyEvent } from './anomaly.ts'
import type { H2ClaimKind, H2Provenance } from './provenance.ts'

export const H2_ASSISTANT_QUESTIONS = [
  {
    questionId: 'H2Q01',
    prompt: 'What do positive and negative PCC power mean?',
  },
  {
    questionId: 'H2Q02',
    prompt:
      'How is a PCC power-limit anomaly different from an energy-quota anomaly?',
  },
  {
    questionId: 'H2Q03',
    prompt: 'How does a BESS direction anomaly affect PCC power?',
  },
  {
    questionId: 'H2Q04',
    prompt: 'How is an SOC regulation-reserve shortfall identified?',
  },
  {
    questionId: 'H2Q05',
    prompt: 'How can a capacity downgrade that was not synchronized be located?',
  },
  {
    questionId: 'H2Q06',
    prompt:
      'How can cloud-induced PV fluctuation be distinguished from setpoint oscillation?',
  },
  {
    questionId: 'H2Q07',
    prompt: 'How is multi-electrolyzer load allocation evaluated?',
  },
  {
    questionId: 'H2Q08',
    prompt: 'Which recommendations require human confirmation?',
  },
  {
    questionId: 'H2Q09',
    prompt: 'Generate a diagnosis report for the selected test anomaly.',
  },
  {
    questionId: 'H2Q10',
    prompt: 'What should a daily PCC compliance report contain?',
  },
] as const

export type H2AssistantQuestionId =
  (typeof H2_ASSISTANT_QUESTIONS)[number]['questionId']

export interface H2AssistantQuestion {
  readonly questionId: H2AssistantQuestionId
  readonly prompt: string
}

export type H2AssistantAnswerMode =
  | 'DETERMINISTIC_TEMPLATE'
  | 'LLM_RENDERED'

export interface H2AssistantCitation {
  readonly citationId: string
  readonly claimKind: H2ClaimKind
  readonly sourceType:
    | 'event'
    | 'evidence'
    | 'constraint'
    | 'variable'
    | 'knowledge_base'
    | 'report'
  readonly sourceId: string
  readonly eventId?: H2AnomalyEvent['eventId']
}

export interface H2AssistantAnswerSection {
  readonly sectionId: string
  readonly claimKind: H2ClaimKind
  readonly text: string
  readonly citationIds: readonly string[]
}

export interface H2AssistantRequest {
  readonly runId: string
  readonly questionId: H2AssistantQuestionId
  readonly eventId?: string
  readonly allowLlmRendering: boolean
}

export interface H2AssistantAnswer {
  readonly schemaVersion: 1
  readonly answerId: string
  readonly runId: string
  readonly questionId: H2AssistantQuestionId
  readonly mode: H2AssistantAnswerMode
  readonly generatedAt: string
  readonly eventId?: string
  readonly sections: readonly H2AssistantAnswerSection[]
  readonly citations: readonly H2AssistantCitation[]
  readonly refusedControlClaim: boolean
  readonly provenance: H2Provenance
}
