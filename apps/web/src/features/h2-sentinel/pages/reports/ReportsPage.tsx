import type { H2AnomalyEvent, H2ReportArtifact, H2ReportKind } from '@opendashboard/h2-contracts'
import { formatH2Timestamp, H2_PROVENANCE_LABELS } from '../../model/presentation.ts'
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
  { kind: 'single_event_diagnosis', operation: 'event-report', title: '单事件诊断报告', description: '证据、影响、安全检查与来源版本。', format: 'HTML', icon: '◎' },
  { kind: 'period_summary', operation: 'period-report', title: '运行周期摘要', description: '选定时间范围内的事件与合规摘要。', format: 'HTML', icon: '⌁' },
  { kind: 'analysis_result_json', operation: 'analysis-json', title: '结构化分析结果', description: '可追溯的规范化分析结果。', format: 'JSON', icon: '{}' },
  { kind: 'quality_report', operation: 'quality-report', title: '数据质量报告', description: '质量检查、警告与阻断原因。', format: 'HTML', icon: '✓' },
  { kind: 'submission', operation: 'submission', title: '竞赛提交结果', description: '严格按冻结列顺序生成。', format: 'CSV', icon: '⇩' },
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
      <PageHeader description="导出可审计的人类可读报告与机器可读结果；不包含密钥或绝对本地路径。" eyebrow="Deterministic exports" title="报告中心" />

      <section aria-label="可用导出" className="h2-report-grid">
        {reports.map((report) => (
          <article className="h2-report-card" key={report.kind}>
            <div className="h2-report-card__icon" aria-hidden="true">{report.icon}</div>
            <StatusBadge tone={report.kind === 'submission' ? 'warning' : 'neutral'}>{report.format}</StatusBadge>
            <h2>{report.title}</h2>
            <p>{report.description}</p>
            <small>{report.kind === 'single_event_diagnosis' ? `当前事件：${event?.eventId ?? '未选择'}` : '当前分析运行'}</small>
            <button className="h2-button h2-button--secondary" disabled={pending !== null || (report.kind === 'single_event_diagnosis' && !event)} onClick={() => onExport(report)} type="button">{pending === report.operation ? '正在生成…' : '生成导出'}</button>
          </article>
        ))}
      </section>

      <div aria-live="polite" className="h2-message-stack">
        {error ? <p className="h2-message h2-message--error">{error}</p> : null}
        {notice ? <p className="h2-message h2-message--success">{notice}</p> : null}
      </div>

      {artifact ? (
        <section className="h2-panel h2-artifact-panel">
          <div className="h2-panel__heading"><div><p className="h2-eyebrow">Latest artifact</p><h2>{artifact.descriptor.filename}</h2></div><StatusBadge tone={artifact.descriptor.status === 'ready' ? 'positive' : 'danger'}>{artifact.descriptor.status}</StatusBadge></div>
          <dl className="h2-key-values h2-key-values--four"><div><dt>报告类型</dt><dd>{artifact.descriptor.kind}</dd></div><div><dt>生成时间</dt><dd>{formatH2Timestamp(artifact.descriptor.generatedAt)}</dd></div><div><dt>媒体类型</dt><dd>{artifact.mediaType}</dd></div><div><dt>来源</dt><dd>{H2_PROVENANCE_LABELS[artifact.descriptor.provenance.mode]}</dd></div><div><dt>内容哈希</dt><dd><code>{artifact.descriptor.contentHash}</code></dd></div></dl>
          <div className="h2-safety-disclaimer"><strong>安全声明</strong><p>{artifact.descriptor.safetyDisclaimer}</p></div>
          <details className="h2-artifact-preview"><summary>查看内容预览</summary><pre>{artifact.content}</pre></details>
          <button className="h2-button h2-button--primary" disabled={artifact.descriptor.status !== 'ready'} onClick={() => onDownload(artifact)} type="button">下载 {artifact.descriptor.filename}</button>
        </section>
      ) : (
        <section className="h2-panel h2-empty-panel"><strong>尚未生成报告</strong><p>选择一个导出类型。生成结果将显示文件名、哈希、来源和安全声明。</p></section>
      )}

      <aside className="h2-report-boundary"><StatusBadge tone="fixture">来源可见</StatusBadge><p>重复导出同一运行应保持内容确定性；时间戳差异必须由数据源明确说明。Fixture 报告不代表官方得分。</p></aside>
    </div>
  )
}

export type { ReportDefinition }
