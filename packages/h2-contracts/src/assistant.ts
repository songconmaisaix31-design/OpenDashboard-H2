import type { H2AnomalyEvent } from './anomaly.ts'
import type { H2ClaimKind, H2Provenance } from './provenance.ts'
import type { H2ReportArtifact } from './report.ts'

export const H2_ASSISTANT_QUESTIONS = [
  {
    questionId: 'Q01',
    prompt: 'PCC正值和负值分别代表什么？',
  },
  {
    questionId: 'Q02',
    prompt: '如何区分PCC功率越限与电量配额异常？',
  },
  {
    questionId: 'Q03',
    prompt: '储能方向异常如何影响PCC功率？',
  },
  {
    questionId: 'Q04',
    prompt: '如何判断SOC调节备用是否不足？',
  },
  {
    questionId: 'Q05',
    prompt: '设备降额但EMS未同步如何定位？',
  },
  {
    questionId: 'Q06',
    prompt: '如何区分云团变化和控制指令振荡？',
  },
  {
    questionId: 'Q07',
    prompt: '如何评价多台电解槽负荷分配？',
  },
  {
    questionId: 'Q08',
    prompt: '哪些建议必须人工确认？',
  },
  {
    questionId: 'Q09',
    prompt: '生成测试集异常诊断报告。',
  },
  {
    questionId: 'Q10',
    prompt: 'PCC合规日报包含哪些内容？',
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
  readonly generatedReport?: H2ReportArtifact
  readonly refusedControlClaim: true
  readonly provenance: H2Provenance
}
