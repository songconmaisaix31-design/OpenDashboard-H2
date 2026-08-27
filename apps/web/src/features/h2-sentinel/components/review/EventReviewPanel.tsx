import { useState } from 'react'

import type { H2ReviewAction } from '@opendashboard/h2-contracts'
import {
  formatH2Timestamp,
  H2_REVIEW_LABELS,
} from '../../model/presentation.ts'
import {
  getH2ReviewActions,
  type H2ReviewDraft,
} from '../../model/review.ts'
import type { H2ReviewCommandState } from '../../model/view-state.ts'
import { StatusBadge } from '../common/StatusBadge.tsx'

const actionLabels = {
  confirm: '确认事件',
  reject: '驳回事件',
  resolve: '记录闭环',
  reopen: '重新打开',
  add_note: '添加备注',
} as const satisfies Readonly<Record<H2ReviewAction, string>>

export interface EventReviewPanelProps {
  readonly onReload: () => void
  readonly onSubmit: (draft: H2ReviewDraft) => void
  readonly state: H2ReviewCommandState
}

export function EventReviewPanel({ onReload, onSubmit, state }: EventReviewPanelProps) {
  const [actorName, setActorName] = useState('')
  const [note, setNote] = useState('')
  const [action, setAction] = useState<H2ReviewAction>('confirm')

  if (state.loading && !state.review) {
    return (
      <section aria-busy="true" className="h2-panel h2-review-panel">
        <div className="h2-panel__heading"><div><p className="h2-eyebrow">Human review journal</p><h2>正在读取人工复核记录…</h2></div></div>
      </section>
    )
  }

  if (!state.review) {
    return (
      <section className="h2-panel h2-review-panel">
        <div className="h2-panel__heading"><div><p className="h2-eyebrow">Human review journal</p><h2>人工复核记录暂不可用</h2></div></div>
        {state.error ? <p className="h2-message h2-message--error">{state.error}</p> : null}
        <button className="h2-button h2-button--secondary" onClick={onReload} type="button">重新加载复核记录</button>
      </section>
    )
  }

  const availableActions = getH2ReviewActions(state.review.currentState)
  const selectedAction = availableActions.includes(action) ? action : availableActions[0]
  const noteRequired = selectedAction !== 'confirm'
  const entries = [...state.review.entries].sort((left, right) => left.revision - right.revision)

  return (
    <section aria-labelledby="h2-review-title" className="h2-panel h2-review-panel">
      <div className="h2-panel__heading">
        <div><p className="h2-eyebrow">Append-only local journal</p><h2 id="h2-review-title">人工复核与审计记录</h2></div>
        <div className="h2-badge-row">
          <StatusBadge tone="neutral">{H2_REVIEW_LABELS[state.review.currentState]}</StatusBadge>
          <StatusBadge tone="planned">修订 {state.review.revision}</StatusBadge>
        </div>
      </div>

      <aside className="h2-review-identity-notice">
        <strong>本地归属未验证</strong>
        <p>操作人名称由本机用户填写，仅用于本地审计归属，不代表已认证身份或授权。</p>
      </aside>

      <form
        className="h2-review-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (!selectedAction) return
          onSubmit({ action: selectedAction, actorName, note })
        }}
      >
        <fieldset disabled={state.pending !== null}>
          <legend>选择复核操作</legend>
          <div className="h2-review-actions">
            {availableActions.map((candidate) => (
              <button
                aria-pressed={selectedAction === candidate}
                className={selectedAction === candidate ? 'is-active' : ''}
                key={candidate}
                onClick={() => setAction(candidate)}
                type="button"
              >
                {actionLabels[candidate]}
              </button>
            ))}
          </div>
          <label>
            <span>本地操作人名称</span>
            <input
              autoComplete="off"
              maxLength={64}
              onChange={(event) => setActorName(event.currentTarget.value)}
              placeholder="例如：本地值班员"
              value={actorName}
            />
          </label>
          <label>
            <span>复核备注{noteRequired ? '（必填）' : '（可选）'}</span>
            <textarea
              maxLength={2_000}
              onChange={(event) => setNote(event.currentTarget.value)}
              placeholder="记录判断依据，不要填写凭据或敏感信息。"
              rows={4}
              value={note}
            />
          </label>
          <div className="h2-review-form__footer">
            <small>每次写入使用当前修订号；并发冲突会自动重新加载，不会覆盖他人记录。</small>
            <button className="h2-button h2-button--primary" type="submit">
              {state.pending ? '正在保存…' : `保存：${selectedAction ? actionLabels[selectedAction] : '复核操作'}`}
            </button>
          </div>
        </fieldset>
      </form>

      <div aria-live="polite" className="h2-message-stack">
        {state.error ? <p className="h2-message h2-message--error">{state.error}</p> : null}
        {state.notice ? <p className="h2-message h2-message--success">{state.notice}</p> : null}
      </div>

      <div className="h2-review-journal">
        <div className="h2-panel__heading"><div><p className="h2-eyebrow">Ordered by revision</p><h3>修订日志</h3></div><button className="h2-button h2-button--ghost" disabled={state.loading || state.pending !== null} onClick={onReload} type="button">重新加载</button></div>
        {entries.length === 0 ? (
          <p className="h2-review-journal__empty">当前事件尚无人工复核条目。</p>
        ) : (
          <ol>
            {entries.map((entry) => (
              <li key={entry.entryId}>
                <div><strong>修订 {entry.revision} · {actionLabels[entry.action]}</strong><time dateTime={entry.createdAt}>{formatH2Timestamp(entry.createdAt)}</time></div>
                <p>{H2_REVIEW_LABELS[entry.previousState]} → {H2_REVIEW_LABELS[entry.nextState]}</p>
                {entry.note ? <blockquote>{entry.note}</blockquote> : null}
                <small>{entry.actor.displayName} · 本地未验证归属</small>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}
