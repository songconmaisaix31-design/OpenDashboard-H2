import { useState } from 'react'

import {
  H2_ASSISTANT_QUESTIONS,
  type H2AssistantAnswer,
  type H2AssistantQuestionId,
  type H2AnomalyEvent,
  type H2ReportArtifact,
} from '@opendashboard/h2-contracts'
import {
  getH2AssistantEventRequirement,
  H2_ASSISTANT_FOLLOW_UP_MAX_CHARACTERS,
  resolveH2AssistantIntent,
} from '../../model/assistant.ts'
import {
  getH2ProvenanceLabel,
  H2_CLAIM_LABELS,
} from '../../model/presentation.ts'
import { PageHeader } from '../../components/common/PageHeader.tsx'
import { StatusBadge } from '../../components/common/StatusBadge.tsx'

export interface AssistantPageProps {
  readonly answer: H2AssistantAnswer | null
  readonly error: string | null
  readonly event: H2AnomalyEvent | null
  readonly events: readonly H2AnomalyEvent[]
  readonly onAsk: (questionId: H2AssistantQuestionId) => void
  readonly onDownload: (artifact: H2ReportArtifact) => void
  readonly onSelectEvent: (eventId: string | null) => void
  readonly pending: boolean
}

export function AssistantPage({
  answer,
  error,
  event,
  events,
  onAsk,
  onDownload,
  onSelectEvent,
  pending,
}: AssistantPageProps) {
  const [selectedQuestion, setSelectedQuestion] = useState<H2AssistantQuestionId>('Q03')
  const [followUpInput, setFollowUpInput] = useState('')
  const [followUpState, setFollowUpState] = useState<{
    readonly tone: 'error' | 'success'
    readonly message: string
  } | null>(null)
  const question = H2_ASSISTANT_QUESTIONS.find(
    ({ questionId }) => questionId === selectedQuestion,
  ) ?? H2_ASSISTANT_QUESTIONS[0]
  const requirement = getH2AssistantEventRequirement(selectedQuestion, event)
  const visibleAnswer = followUpState?.tone !== 'error' &&
    answer?.questionId === selectedQuestion &&
    (answer.eventId ?? null) === (event?.eventId ?? null)
    ? answer
    : null

  function submitFollowUp(submitEvent: React.FormEvent<HTMLFormElement>): void {
    submitEvent.preventDefault()
    const resolution = resolveH2AssistantIntent(followUpInput, event)
    if (resolution.status === 'refused') {
      setFollowUpState({ tone: 'error', message: resolution.message })
      return
    }

    setSelectedQuestion(resolution.questionId)
    setFollowUpState({ tone: 'success', message: resolution.message })
    onAsk(resolution.questionId)
  }

  return (
    <div className="h2-page h2-assistant-page">
      <PageHeader description="十个官方问题均由确定性中文模板回答；先验证事件上下文，再引用当前运行证据。外部 LLM 不是黄金路径依赖。" eyebrow="Deterministic operations assistant" icon="assistant" title="运行助手" />

      <section aria-labelledby="h2-follow-up-title" className="h2-panel h2-follow-up">
        <div>
          <p className="h2-eyebrow">Bounded follow-up</p>
          <h2 id="h2-follow-up-title">用自然表述匹配官方问题</h2>
          <p>只路由到 Q01–Q10，不开放通用聊天；未知或含糊输入会安全拒绝。</p>
        </div>
        <form onSubmit={submitFollowUp}>
          <label>
            <span className="h2-visually-hidden">输入 Q01–Q10 的自然表述</span>
            <input
              disabled={pending}
              maxLength={H2_ASSISTANT_FOLLOW_UP_MAX_CHARACTERS}
              onChange={(inputEvent) => {
                setFollowUpInput(inputEvent.currentTarget.value)
                setFollowUpState(null)
              }}
              placeholder="例如：PCC 正负值怎么理解？"
              type="text"
              value={followUpInput}
            />
          </label>
          <button
            className="h2-button h2-button--secondary"
            disabled={pending || followUpInput.trim().length === 0}
            type="submit"
          >
            匹配并回答
          </button>
        </form>
        <div aria-live="polite">
          {followUpState ? (
            <p className={`h2-message h2-message--${followUpState.tone}`}>
              {followUpState.message}
            </p>
          ) : null}
        </div>
      </section>

      <div className="h2-assistant-layout">
        <section aria-label="官方问题" className="h2-panel h2-question-list">
          <div className="h2-panel__heading"><div><p className="h2-eyebrow">Official Q01–Q10</p><h2>十个官方问题</h2></div><StatusBadge tone="positive">离线可用</StatusBadge></div>
          <ol>
            {H2_ASSISTANT_QUESTIONS.map(({ prompt, questionId }) => (
              <li key={questionId}>
                <button
                  aria-pressed={selectedQuestion === questionId}
                  className={selectedQuestion === questionId ? 'is-active' : ''}
                  onClick={() => {
                    setSelectedQuestion(questionId)
                    setFollowUpState(null)
                  }}
                  type="button"
                >
                  <span>{questionId}</span>
                  <strong>{prompt}</strong>
                </button>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="h2-answer-title" className="h2-panel h2-answer-panel">
          <div className="h2-answer-panel__prompt">
            <div><p className="h2-eyebrow">{question.questionId}</p><h2 id="h2-answer-title">{question.prompt}</h2></div>
            <button className="h2-button h2-button--primary" disabled={pending || !requirement.valid} onClick={() => onAsk(selectedQuestion)} type="button">{pending ? '正在组装证据…' : '基于证据回答'}</button>
          </div>

          <label className="h2-answer-panel__event-select">
            <span>事件上下文</span>
            <select
              aria-label="选择助手事件"
              onChange={(changeEvent) => onSelectEvent(changeEvent.currentTarget.value || null)}
              value={event?.eventId ?? ''}
            >
              <option value="">不选择事件</option>
              {events.map((candidate) => (
                <option key={candidate.eventId} value={candidate.eventId}>
                  {candidate.code} · {candidate.eventId}
                </option>
              ))}
            </select>
          </label>
          <p className={requirement.valid ? 'h2-context-message' : 'h2-context-message is-error'}>{requirement.message}</p>

          <div aria-live="polite">
            {error ? <p className="h2-message h2-message--error">{error}</p> : null}
            {visibleAnswer ? (
              <AssistantAnswer answer={visibleAnswer} onDownload={onDownload} />
            ) : (
              <div className="h2-assistant-empty"><span aria-hidden="true">◇</span><strong>等待提问</strong><p>回答将区分事实、计算、推断和建议，并展示可解析的证据或报告引用。</p></div>
            )}
          </div>
        </section>
      </div>

      <aside className="h2-control-boundary"><strong>控制边界</strong><p>运行助手只解释结构化结果。它不会直接控制电解槽、储能、PCC、继电器或调度设定值，所有建议都必须人工确认。</p></aside>
    </div>
  )
}

export function AssistantAnswer({
  answer,
  onDownload,
}: {
  readonly answer: H2AssistantAnswer
  readonly onDownload: (artifact: H2ReportArtifact) => void
}) {
  const generatedReport = answer.generatedReport
  return (
    <article className="h2-assistant-answer">
      <div className="h2-badge-row">
        <StatusBadge tone="positive">确定性模板</StatusBadge>
        <StatusBadge tone={answer.provenance.mode === 'FIXTURE' ? 'fixture' : 'live'}>{getH2ProvenanceLabel(answer.provenance)}</StatusBadge>
        <StatusBadge tone="danger">拒绝直接控制</StatusBadge>
      </div>
      {answer.sections.map((section) => (
        <section key={section.sectionId}>
          <StatusBadge tone={section.claimKind === 'fact' ? 'neutral' : 'warning'}>{H2_CLAIM_LABELS[section.claimKind]}</StatusBadge>
          <p>{section.text}</p>
          <small>引用：{section.citationIds.join('、')}</small>
        </section>
      ))}
      {generatedReport ? (
        <section className="h2-assistant-report">
          <div><StatusBadge tone="positive">Q09 报告已生成</StatusBadge><strong>{generatedReport.descriptor.filename}</strong></div>
          <p>报告事件：{generatedReport.descriptor.eventId} · 内容哈希：<code>{generatedReport.descriptor.contentHash}</code></p>
          <button className="h2-button h2-button--secondary" onClick={() => onDownload(generatedReport)} type="button">下载中文诊断报告</button>
        </section>
      ) : null}
      <details><summary>查看引用来源</summary><ul>{answer.citations.map((citation) => <li key={citation.citationId}><code>{citation.citationId}</code><span>{citation.sourceType} · {citation.sourceId}</span></li>)}</ul></details>
    </article>
  )
}
