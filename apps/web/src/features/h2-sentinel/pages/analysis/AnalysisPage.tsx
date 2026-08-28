import { useMemo, useState } from 'react'

import type { H2Workspace } from '../../model/view-state.ts'
import {
  datasetHasValidationLabels,
  formatH2Timestamp,
  H2_QUALITY_LABELS,
  toH2FieldDictionaryRows,
} from '../../model/presentation.ts'
import { createVariableChartOption } from '../../model/chart-options.ts'
import { H2_CSV_MAX_BYTES } from '../../model/workspace-loader.ts'
import { EChartsCanvas } from '../../components/charts/EChartsCanvas.tsx'
import { PageHeader } from '../../components/common/PageHeader.tsx'
import { SignConventionNote } from '../../components/common/SignConventionNote.tsx'
import { StatusBadge } from '../../components/common/StatusBadge.tsx'

export interface AnalysisPageProps {
  readonly importError: string | null
  readonly importPending: boolean
  readonly importNotice: string | null
  readonly onImport: (file: File) => void
  readonly workspace: H2Workspace
}

export function AnalysisPage({ importError, importNotice, importPending, onImport, workspace }: AnalysisPageProps) {
  const chartableFields = useMemo(
    () => workspace.run.dataset.fields.filter((field) => field.role === 'measurement' || field.role === 'constraint'),
    [workspace.run.dataset.fields],
  )
  const [selectedVariable, setSelectedVariable] = useState(chartableFields[0]?.name ?? '')
  const selectedField = chartableFields.find(({ name }) => name === selectedVariable) ?? chartableFields[0]
  const hasLabels = datasetHasValidationLabels(workspace.run)

  return (
    <div className="h2-page h2-analysis-page">
      <PageHeader description="质量检查先于异常分析；没有标签时不展示伪造的评估指标。" eyebrow="Data quality & model evidence" icon="analysis" title="数据分析" />

      <section className="h2-panel h2-dataset-card">
        <div>
          <p className="h2-eyebrow">Active dataset</p>
          <h2>{workspace.run.dataset.name}</h2>
          <p>{workspace.run.dataset.sourceFilename}</p>
        </div>
        <dl className="h2-key-values h2-key-values--four">
          <div><dt>数据集 ID</dt><dd>{workspace.run.dataset.datasetId}</dd></div>
          <div><dt>行数</dt><dd>{workspace.run.dataset.rowCount}</dd></div>
          <div><dt>时间范围</dt><dd>{formatH2Timestamp(workspace.run.dataset.timeRange.startTime)}–{formatH2Timestamp(workspace.run.dataset.timeRange.endTime)}</dd></div>
          <div><dt>采样间隔</dt><dd>{workspace.run.dataset.samplingIntervalMinutes} 分钟</dd></div>
        </dl>
        <div className="h2-dataset-card__fingerprint"><span>SHA-256 指纹</span><code>{workspace.run.dataset.fingerprint}</code></div>
      </section>

      <section className="h2-panel h2-import-panel">
        <div><p className="h2-eyebrow">Live analysis input</p><h2>导入本地 CSV</h2><p>浏览器只读取你明确选择的 CSV 文本，并通过注入的数据源端口交给本地分析适配器。</p></div>
        <label className="h2-file-picker">
          <span>{importPending ? '正在导入与分析…' : '选择 CSV 文件'}</span>
          <input
            accept=".csv,text/csv"
            disabled={importPending}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              if (file) onImport(file)
              event.currentTarget.value = ''
            }}
            type="file"
          />
        </label>
        <p className="h2-file-policy">仅接受 .csv，最大 {H2_CSV_MAX_BYTES / (1024 * 1024)} MiB。</p>
        <div aria-live="polite" className="h2-message-stack">
          {importError ? <p className="h2-message h2-message--error">{importError}</p> : null}
          {importNotice ? <p className="h2-message h2-message--success">{importNotice}</p> : null}
        </div>
      </section>

      <div className="h2-analysis-grid">
        <section className="h2-panel h2-quality-panel">
          <div className="h2-panel__heading"><div><p className="h2-eyebrow">Quality gate</p><h2>{H2_QUALITY_LABELS[workspace.run.quality.status]}</h2></div><StatusBadge tone={workspace.run.quality.status === 'passed' ? 'positive' : 'warning'}>{workspace.run.quality.status.toLocaleUpperCase('en-US')}</StatusBadge></div>
          {workspace.run.quality.blockingReasons.length > 0 ? <div className="h2-blocking-reasons"><strong>阻断原因</strong><ul>{workspace.run.quality.blockingReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div> : null}
          <div className="h2-quality-list">
            {workspace.run.quality.checks.map((check) => (
              <article key={check.checkId}>
                <span className={`h2-quality-indicator h2-quality-indicator--${check.status}`} aria-hidden="true" />
                <div><strong>{check.code}</strong><p>{check.message}</p><small>{check.affectedFields.join('、') || '全局检查'}</small></div>
                <StatusBadge tone={check.status === 'passed' ? 'positive' : 'warning'}>{check.status}</StatusBadge>
              </article>
            ))}
          </div>
        </section>

        <section className="h2-panel h2-validation-panel">
          <div className="h2-panel__heading"><div><p className="h2-eyebrow">Validation evidence</p><h2>验证指标</h2></div><StatusBadge tone={hasLabels ? 'live' : 'planned'}>{hasLabels ? '验证集' : '不可用'}</StatusBadge></div>
          {hasLabels ? <p>当前数据集声明了标签字段；具体指标必须由数据源返回的版本化验证产物提供。</p> : <div className="h2-safe-absence"><strong>此数据集没有标签</strong><p>不会显示混淆矩阵、F1 或“官方成绩”。Fixture 仅验证交互与契约路径。</p></div>}
        </section>
      </div>

      <SignConventionNote />

      <section className="h2-panel h2-chart-panel">
        <div className="h2-panel__heading"><div><p className="h2-eyebrow">Variable explorer</p><h2>变量趋势</h2></div>{selectedField ? <label className="h2-inline-select"><span className="h2-visually-hidden">选择变量</span><select value={selectedField.name} onChange={(event) => setSelectedVariable(event.currentTarget.value)}>{chartableFields.map((field) => <option key={field.name} value={field.name}>{field.displayNameZh} · {field.unit ?? '无单位'}</option>)}</select></label> : null}</div>
        {workspace.series && selectedField ? <EChartsCanvas ariaLabel={`${selectedField.displayNameZh}时间序列图`} option={createVariableChartOption(workspace.series, selectedField)} /> : <div className="h2-chart-empty"><strong>变量趋势不可用</strong><p>{workspace.seriesError ?? '当前数据源没有返回可绘制序列。'}</p></div>}
      </section>

      <section className="h2-panel h2-field-dictionary">
        <div className="h2-panel__heading"><div><p className="h2-eyebrow">Field dictionary</p><h2>字段字典</h2></div><span>{workspace.run.dataset.fields.length} 个字段</span></div>
        <div className="h2-table-scroll"><table className="h2-table"><thead><tr><th>中文名称</th><th>字段键</th><th>角色</th><th>单位</th><th>符号约定</th><th>必填</th></tr></thead><tbody>{toH2FieldDictionaryRows(workspace.run.dataset.fields).map((field) => <tr key={field.name}><td><strong>{field.chineseName}</strong></td><td><code>{field.name}</code></td><td>{field.role}</td><td>{field.unit || '—'}</td><td>{field.sign || '—'}</td><td>{field.required ? '是' : '否'}</td></tr>)}</tbody></table></div>
      </section>

      <section className="h2-panel h2-run-log"><div className="h2-panel__heading"><div><p className="h2-eyebrow">Run log</p><h2>分析运行记录</h2></div><StatusBadge tone={workspace.run.status === 'completed' ? 'positive' : 'warning'}>{workspace.run.status}</StatusBadge></div><ol><li><time>{formatH2Timestamp(workspace.run.startedAt)}</time><span>启动分析运行</span></li><li><time>{formatH2Timestamp(workspace.run.quality.generatedAt)}</time><span>完成数据质量门禁</span></li>{workspace.run.completedAt ? <li><time>{formatH2Timestamp(workspace.run.completedAt)}</time><span>完成事件聚合与证据组装</span></li> : null}</ol>{workspace.run.warnings.length > 0 ? <ul>{workspace.run.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}</section>
    </div>
  )
}
