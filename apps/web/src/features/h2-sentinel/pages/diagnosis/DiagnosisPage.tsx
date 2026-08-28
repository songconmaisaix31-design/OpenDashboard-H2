import type { H2AnomalyEvent, H2SeriesResponse } from '@opendashboard/h2-contracts'
import type { H2NavigationTarget } from '../../routes.ts'
import type { H2ReviewDraft } from '../../model/review.ts'
import type { H2ReviewCommandState } from '../../model/view-state.ts'
import {
  formatH2Confidence,
  formatH2Duration,
  formatH2Timestamp,
  H2_CLAIM_LABELS,
  H2_CODE_LABELS,
  H2_PROVENANCE_LABELS,
  H2_REVIEW_LABELS,
  H2_SEVERITY_LABELS,
  H2_SIGN_CONVENTIONS,
} from '../../model/presentation.ts'
import { createEventChartOption } from '../../model/chart-options.ts'
import { EChartsCanvas } from '../../components/charts/EChartsCanvas.tsx'
import { PageHeader } from '../../components/common/PageHeader.tsx'
import { SignConventionNote } from '../../components/common/SignConventionNote.tsx'
import { StatusBadge } from '../../components/common/StatusBadge.tsx'
import { EvidencePanel } from '../../components/evidence/EvidencePanel.tsx'
import { ImpactPanel } from '../../components/impact/ImpactPanel.tsx'
import { EventReviewPanel } from '../../components/review/EventReviewPanel.tsx'
import { SafetyPanel } from '../../components/safety/SafetyPanel.tsx'

export interface DiagnosisPageProps {
  readonly event: H2AnomalyEvent | null
  readonly events: readonly H2AnomalyEvent[]
  readonly onNavigate: (target: H2NavigationTarget) => void
  readonly onReloadReview: () => void
  readonly onReview: (draft: H2ReviewDraft) => void
  readonly reviewState: H2ReviewCommandState
  readonly series: H2SeriesResponse | null
  readonly seriesError: string | null
}

export function DiagnosisPage({
  event,
  events,
  onNavigate,
  onReloadReview,
  onReview,
  reviewState,
  series,
  seriesError,
}: DiagnosisPageProps) {
  if (!event) {
    return (
      <div className="h2-page">
        <PageHeader description="指定事件不存在或当前数据源未返回该事件。" eyebrow="Safe unknown state" icon="diagnosis" title="无法打开诊断详情" />
        <section className="h2-panel h2-empty-panel" role="status">
          <strong>没有可核验的事件数据</strong>
          <p>系统不会用其他事件或推测内容替代。请返回事件中心重新选择。</p>
          <button className="h2-button h2-button--primary" onClick={() => onNavigate({ route: 'events' })} type="button">返回事件中心</button>
        </section>
      </div>
    )
  }

  return (
    <div className="h2-page h2-diagnosis-page">
      <PageHeader
        actions={
          <div className="h2-case-switcher" aria-label="黄金案例快捷切换">
            {(['C03', 'C04'] as const).map((code) => {
              const targetEvent = events.find((candidate) => candidate.code === code)
              return (
                <button
                  aria-pressed={event.code === code}
                  className={event.code === code ? 'is-active' : ''}
                  disabled={!targetEvent}
                  key={code}
                  onClick={() => targetEvent && onNavigate({ route: 'diagnosis', eventId: targetEvent.eventId })}
                  type="button"
                >
                  {code}
                </button>
              )
            })}
          </div>
        }
        description={event.title}
        eyebrow={`${event.code} · ${event.subtype}`}
        icon="diagnosis"
        title={H2_CODE_LABELS[event.code]}
      />

      <section aria-label="事件概况" className="h2-event-hero">
        <div className="h2-event-hero__signal"><span>{event.code}</span><small>异常代码</small></div>
        <div className="h2-event-hero__body">
          <div className="h2-badge-row">
            <StatusBadge tone="danger">{H2_SEVERITY_LABELS[event.severity]}风险</StatusBadge>
            <StatusBadge tone="warning">置信度 {formatH2Confidence(event.confidence)}</StatusBadge>
            <StatusBadge tone="neutral">{H2_REVIEW_LABELS[event.reviewState]}</StatusBadge>
            <StatusBadge tone={event.provenance.mode === 'FIXTURE' ? 'fixture' : 'live'}>{H2_PROVENANCE_LABELS[event.provenance.mode]}</StatusBadge>
          </div>
          <dl className="h2-event-hero__facts">
            <div><dt>事件区间</dt><dd>{formatH2Timestamp(event.startTime)}–{formatH2Timestamp(event.endTime)}</dd></div>
            <div><dt>持续时间</dt><dd>{formatH2Duration(event.startTime, event.endTime)}</dd></div>
            <div><dt>首次发现</dt><dd>{formatH2Timestamp(event.firstDetectionTime)}</dd></div>
            <div><dt>主要控制对象</dt><dd>{event.primaryControlObject.displayName}</dd></div>
            <div><dt>受影响设备</dt><dd>{event.affectedEquipment.map(({ displayName }) => displayName).join('、')}</dd></div>
            <div><dt>功率符号约定</dt><dd>{H2_SIGN_CONVENTIONS.map(({ label, copy }) => `${label}：${copy}`).join('；')}</dd></div>
          </dl>
        </div>
      </section>

      <section className="h2-panel h2-chart-panel">
        <div className="h2-panel__heading">
          <div><p className="h2-eyebrow">Synchronized evidence</p><h2>时间对齐趋势与事件区间</h2></div>
          <span>单位 kW · 阴影为事件区间</span>
        </div>
        <SignConventionNote compact />
        {series ? (
          <EChartsCanvas ariaLabel={`${event.code} 事件时间对齐证据图，含约束线与事件区间`} option={createEventChartOption(series, event)} />
        ) : (
          <div className="h2-chart-empty" role="status"><strong>趋势数据暂不可用</strong><p>{seriesError ?? '事件结构化证据仍可核验，系统不会绘制推测曲线。'}</p></div>
        )}
      </section>

      <EvidencePanel evidence={event.evidence} />

      <div className="h2-diagnosis-grid">
        <section className="h2-panel h2-cause-panel">
          <div className="h2-panel__heading"><div><p className="h2-eyebrow">Why it may happen</p><h2>可能原因</h2></div><StatusBadge tone="planned">{H2_CLAIM_LABELS[event.rootCauseKind]}</StatusBadge></div>
          <p className="h2-cause-panel__copy">{event.rootCause}</p>
          <div className="h2-boundary-callout"><strong>事实边界</strong><span>这里是基于证据的推断，不是直接设备故障判定。</span></div>
        </section>
        <ImpactPanel event={event} />
      </div>

      <SafetyPanel event={event} />

      <EventReviewPanel
        onReload={onReloadReview}
        onSubmit={onReview}
        state={reviewState}
      />

      <section className="h2-panel h2-provenance-detail">
        <div className="h2-panel__heading"><div><p className="h2-eyebrow">Traceability</p><h2>版本与来源</h2></div><StatusBadge tone="fixture">{H2_PROVENANCE_LABELS[event.provenance.mode]}</StatusBadge></div>
        <dl className="h2-key-values h2-key-values--four">
          <div><dt>数据指纹</dt><dd>{event.provenance.datasetFingerprint ?? '未提供'}</dd></div>
          <div><dt>模型版本</dt><dd>{event.provenance.modelVersion ?? '此结果未声明模型版本'}</dd></div>
          <div><dt>规则版本</dt><dd>{event.provenance.ruleVersion ?? '未提供'}</dd></div>
          <div><dt>配置版本</dt><dd>{event.provenance.configurationVersion ?? '未提供'}</dd></div>
        </dl>
        <ul className="h2-limitations">{event.provenance.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
      </section>
    </div>
  )
}
