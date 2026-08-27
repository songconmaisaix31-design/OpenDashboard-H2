import type {
  H2AnomalyCode,
  H2AnomalyEvent,
  H2AssistantQuestionId,
} from '@opendashboard/h2-contracts'

interface H2AssistantEventRule {
  readonly required: boolean
  readonly allowedCodes?: readonly H2AnomalyCode[]
}
const H2_ASSISTANT_EVENT_RULES = {
  Q01: { required: false },
  Q02: { required: false, allowedCodes: ['C04', 'C05'] },
  Q03: { required: true, allowedCodes: ['C03'] },
  Q04: { required: false, allowedCodes: ['C07'] },
  Q05: { required: false, allowedCodes: ['C02'] },
  Q06: { required: false, allowedCodes: ['C01'] },
  Q07: { required: false, allowedCodes: ['C06'] },
  Q08: { required: false },
  Q09: { required: true },
  Q10: { required: false, allowedCodes: ['C04', 'C05'] },
} as const satisfies Readonly<Record<H2AssistantQuestionId, H2AssistantEventRule>>

export interface H2AssistantEventRequirement {
  readonly valid: boolean
  readonly message: string
}

export function getH2AssistantEventRequirement(
  questionId: H2AssistantQuestionId,
  event: H2AnomalyEvent | null,
): H2AssistantEventRequirement {
  const rule = H2_ASSISTANT_EVENT_RULES[questionId]
  if (!event) {
    return rule.required
      ? { valid: false, message: '该问题必须先选择一个当前运行中的事件。' }
      : { valid: true, message: '该问题可基于当前运行回答，也可选择事件补充上下文。' }
  }

  if (
    'allowedCodes' in rule &&
    !rule.allowedCodes.some((code) => code === event.code)
  ) {
    return {
      valid: false,
      message: `该问题只接受 ${rule.allowedCodes.join(' / ')} 事件；请更换事件或清除可选事件上下文。`,
    }
  }

  return {
    valid: true,
    message: `将引用事件 ${event.eventId} 的当前运行证据。`,
  }
}
