import {
  H2_ASSISTANT_QUESTIONS,
  H2_NLU_MAX_INPUT_CHARS,
  type H2AnomalyCode,
  type H2AnomalyEvent,
  type H2AssistantQuestionId,
} from '@opendashboard/h2-contracts'

export const H2_ASSISTANT_FOLLOW_UP_MAX_CHARACTERS = H2_NLU_MAX_INPUT_CHARS

export type H2AssistantFollowUpResolution =
  | {
      readonly status: 'matched'
      readonly questionId: H2AssistantQuestionId
      readonly prompt: string
      readonly message: string
    }
  | {
      readonly status: 'refused'
      readonly message: string
    }

const H2_ASSISTANT_FOLLOW_UP_RULES = [
  { questionId: 'Q01', tokenGroups: [['pcc', '并网点'], ['正值', '正负'], ['负值', '正负']] },
  { questionId: 'Q02', tokenGroups: [['pcc', '并网点'], ['越限', '功率限值'], ['配额', '电量']] },
  { questionId: 'Q03', tokenGroups: [['储能', 'bess'], ['方向', '充放电'], ['pcc', '并网点']] },
  { questionId: 'Q04', tokenGroups: [['soc'], ['备用', '裕度']] },
  { questionId: 'Q05', tokenGroups: [['降额', '可用容量'], ['ems', '系统'], ['同步']] },
  { questionId: 'Q06', tokenGroups: [['云团', '光伏波动'], ['振荡', '波动'], ['指令', '控制']] },
  { questionId: 'Q07', tokenGroups: [['电解槽'], ['负荷分配', '分配']] },
  { questionId: 'Q08', tokenGroups: [['建议', '操作'], ['人工确认', '人确认', '确认']] },
  { questionId: 'Q09', tokenGroups: [['诊断报告'], ['生成', '导出', '测试集']] },
  { questionId: 'Q10', tokenGroups: [['pcc', '并网点'], ['合规日报', '日报']] },
] as const satisfies readonly {
  readonly questionId: H2AssistantQuestionId
  readonly tokenGroups: readonly (readonly string[])[]
}[]

/** Routes only the closed Q01-Q10 vocabulary and refuses unknown or ambiguous wording. */
export function resolveH2AssistantFollowUp(
  input: string,
): H2AssistantFollowUpResolution {
  const trimmed = input.trim()
  if (trimmed.length === 0) {
    return { status: 'refused', message: '请输入一个与 Q01–Q10 相关的问题。' }
  }
  if (trimmed.length > H2_ASSISTANT_FOLLOW_UP_MAX_CHARACTERS) {
    return {
      status: 'refused',
      message: `输入超过 ${H2_ASSISTANT_FOLLOW_UP_MAX_CHARACTERS} 个字符；未调用数据源，也未生成答案。`,
    }
  }

  const normalized = normalizeH2FollowUp(trimmed)
  if (hasH2EquipmentControlIntent(normalized)) {
    return {
      status: 'refused',
      message: '检测到设备控制或设定值请求；氢哨无控制权限，未路由到 Q01–Q10，也未下发任何指令。',
    }
  }
  const idMatch = /^q(?:0[1-9]|10|[1-9])$/u.exec(normalized)
  if (idMatch) {
    const questionId = `Q${idMatch[0].slice(1).padStart(2, '0')}` as H2AssistantQuestionId
    return matchedH2FollowUp(questionId)
  }

  const exactQuestion = H2_ASSISTANT_QUESTIONS.find(
    ({ prompt }) => normalizeH2FollowUp(prompt) === normalized,
  )
  if (exactQuestion) return matchedH2FollowUp(exactQuestion.questionId)

  const matches = H2_ASSISTANT_FOLLOW_UP_RULES.filter(({ tokenGroups }) =>
    tokenGroups.every((alternatives) =>
      alternatives.some((token) => normalized.includes(normalizeH2FollowUp(token))),
    ),
  )
  const [match] = matches
  if (!match || matches.length !== 1) {
    return {
      status: 'refused',
      message: matches.length > 1
        ? '输入同时匹配多个官方问题；未调用数据源。请直接选择一个 Q01–Q10。'
        : '未识别为 Q01–Q10 的受支持表达；未调用数据源，也未生成答案。',
    }
  }

  return matchedH2FollowUp(match.questionId)
}

function hasH2EquipmentControlIntent(normalized: string): boolean {
  const equipment = ['电解槽', '储能', 'bess', 'pcc', 'ems', '继电器']
  const actions = ['下发', '执行', '直接控制', '远程控制', '设定值', '调功率', '启停', '开机', '关机']
  return equipment.some((token) => normalized.includes(normalizeH2FollowUp(token))) &&
    actions.some((token) => normalized.includes(normalizeH2FollowUp(token)))
}

/** Resolves wording and current-event compatibility as one fail-closed intent. */
export function resolveH2AssistantIntent(
  input: string,
  event: H2AnomalyEvent | null,
): H2AssistantFollowUpResolution {
  const resolution = resolveH2AssistantFollowUp(input)
  if (resolution.status === 'refused') return resolution
  const requirement = getH2AssistantEventRequirement(resolution.questionId, event)
  return requirement.valid
    ? resolution
    : { status: 'refused', message: requirement.message }
}

function matchedH2FollowUp(
  questionId: H2AssistantQuestionId,
): Extract<H2AssistantFollowUpResolution, { readonly status: 'matched' }> {
  const question = H2_ASSISTANT_QUESTIONS.find((item) => item.questionId === questionId)
  if (!question) throw new Error('Official H2 assistant question is missing.')
  return {
    status: 'matched',
    questionId,
    prompt: question.prompt,
    message: `已确定性匹配 ${questionId}；将按官方问题和当前证据回答。`,
  }
}

function normalizeH2FollowUp(input: string): string {
  return input
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[\s，。？！、,:：;；!?（）()\[\]{}'"“”‘’/\\_-]+/gu, '')
}

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
