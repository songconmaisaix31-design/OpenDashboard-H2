import type {
  H2AnomalyEvent,
  H2ReportArtifact,
  H2ReportKind,
} from '@opendashboard/h2-contracts'
import {
  formatH2Timestamp,
  getH2ProvenanceLabel,
} from '../../model/presentation.ts'
import type { H2PendingOperation } from '../../model/view-state.ts'
import { PageHeader } from '../../components/common/PageHeader.tsx'
import { StatusBadge } from '../../components/common/StatusBadge.tsx'

interface ReportDefinition {
  readonly kind: H2ReportKind | 'submission'
  readonly operation: H2PendingOperation
  readonly title: string
  readonly description: string
  readonly format: string
  readonly icon: string
}

const reports = [
  { kind: 'single_event_diagnosis', operation: 'event-report', title: '氢哨异常诊断报告', description: '所选事件的证据、影响、安全检查、人工复核和来源版本。', format: 'HTML', icon: '◎' },
  { kind: 'period_summary', operation: 'period-report', title: '氢哨运行摘要', description: '当前数据时间范围内的事件、复核状态、质量与有限影响摘要。', format: 'HTML', icon: '⌁' },
  { kind: 'pcc_daily_compliance', operation: 'pcc-report', title: 'PCC 合规日报', description: '数据起始日的功率限值、越限区间、电量配额证据与复核状态。', format: 'HTML', icon: 'PCC' },
  { kind: 'analysis_result_json', operation: 'analysis-json', title: '结构化分析结果', description: '保留稳定英文机器字段的规范化分析结果。', format: 'JSON', icon: '{}' },
  { kind: 'validation_metrics', operation: 'validation-metrics', title: '验证指标', description: '仅在标签、数据切分、匹配定义和版本齐全时可生成；不会伪造零值。', format: 'JSON', icon: '∑' },
  { kind: 'quality_report', operation: 'quality-report', title: '氢哨数据质量报告', description: '数据行数、时间范围、质量检查、警告、阻断和来源限制。', format: 'HTML', icon: '✓' },
  { kind: 'review_audit_json', operation: 'review-audit', title: '人工复核审计', description: '包含全部事件和完整修订日志；本地操作人名称不代表认证身份。', format: 'JSON', icon: 'REV' },
  { kind: 'submission', operation: 'submission', title: '竞赛提交结果', description: '严格按冻结的 16 列生成；人工复核不会改变事件身份或提交字段。', format: 'CSV', icon: '⇩' },
] as const satisfies readonly ReportDefinition[]

export interface ReportsPageProps {
  readonly artifact: H2ReportArtifact | null
  readonly error: string | null
  readonly event: H2AnomalyEvent | null
  readonly notice: string | null
  readonly onDownload: (artifact: H2ReportArtifact) => void
  readonly onExport: (definition: ReportDefinition) => void
  readonly pending: H2PendingOperation | null
}

export function ReportsPage({ artifact, error, event, notice, onDownload, onExport, pending }: ReportsPageProps) {
  return (
    <div className="h2-page h2-reports-page">
      <PageHeader description="中文 HTML 用于评审阅读，JSON 与 CSV 保留稳定机器字段；所有文件名、媒体类型和哈希都来自数据源描述符。" eyebrow="Deterministic exports" icon="reports" title="报告中心" />

      <section aria-label="可用导出" className="h2-report-grid">
        {reports.map((report) => {
          const needsEvent = report.kind === 'single_event_diagnosis'
          return (
            <article className="h2-report-card" key={report.kind}>
              <div className="h2-report-card__icon" aria-hidden="true">{report.icon}</div>
              <StatusBadge tone={report.kind === 'submission' ? 'warning' : 'neutral'}>{report.format}</StatusBadge>
              <h2>{report.title}</h2>
              <p>{report.description}</p>
              <small>{needsEvent ? `当前事件：${event?.eventId ?? '未选择'}` : report.kind === 'pcc_daily_compliance' ? '范围：数据起始自然日' : '范围：当前分析运行'}</small>
              <button className="h2-button h2-button--secondary" disabled={pending !== null || (needsEvent && !event)} onClick={() => onExport(report)} type="button">{pending === report.operation ? '正在生成…' : '生成导出'}</button>
            </article>
          )
        })}
      </section>

      <div aria-live="polite" className="h2-message-stack">
        {error ? <p className="h2-message h2-message--error">{error}</p> : null}
        {notice ? <p className="h2-message h2-message--success">{notice}</p> : null}
      </div>

      {artifact ? (
        <section className="h2-panel h2-artifact-panel">
          <div className="h2-panel__heading"><div><p className="h2-eyebrow">Latest artifact</p><h2>{artifact.descriptor.filename}</h2></div><StatusBadge tone={artifact.descriptor.status === 'ready' ? 'positive' : 'danger'}>{artifact.descriptor.status === 'ready' ? '可下载' : '生成失败'}</StatusBadge></div>
          <dl className="h2-key-values h2-key-values--four"><div><dt>报告类型</dt><dd>{artifact.descriptor.kind}</dd></div><div><dt>生成时间</dt><dd>{formatH2Timestamp(artifact.descriptor.generatedAt)}</dd></div><div><dt>媒体类型</dt><dd>{artifact.mediaType}</dd></div><div><dt>来源</dt><dd>{getH2ProvenanceLabel(artifact.descriptor.provenance)}</dd></div><div><dt>内容哈希</dt><dd><code>{artifact.descriptor.contentHash}</code></dd></div></dl>
          {artifact.descriptor.warnings.length > 0 ? <div className="h2-report-warnings"><strong>生成警告</strong><ul>{artifact.descriptor.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div> : null}
          <div className="h2-safety-disclaimer"><strong>安全声明</strong><p>{artifact.descriptor.safetyDisclaimer}</p></div>
          <details className="h2-artifact-preview"><summary>以纯文本安全预览</summary><pre>{artifact.content}</pre></details>
          <button className="h2-button h2-button--primary" disabled={artifact.descriptor.status !== 'ready'} onClick={() => onDownload(artifact)} type="button">下载 {artifact.descriptor.filename}</button>
        </section>
      ) : (
        <section className="h2-panel h2-empty-panel"><strong>尚未生成报告</strong><p>选择一个导出类型。生成结果将显示文件名、媒体类型、完整哈希、来源和安全声明。</p></section>
      )}

      <aside className="h2-report-boundary"><StatusBadge tone="neutral">来源可见</StatusBadge><p>FIXTURE、验证集切片与其他 LIVE_ANALYSIS 来源会明确区分；本地结果不等于官方成绩、隐藏测试或生产证明。</p></aside>
    </div>
  )
}

export type { ReportDefinition }
