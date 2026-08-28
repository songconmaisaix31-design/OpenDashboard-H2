import {
  H2_ANOMALY_CODES,
  type H2AnomalyEvent,
  type H2SentinelDataSource,
} from '@opendashboard/h2-contracts'
import type { H2NavigationTarget } from '../../routes.ts'
import type { H2Workspace } from '../../model/view-state.ts'
import {
  createOverviewMetrics,
  formatH2Confidence,
  formatH2Number,
  formatH2Timestamp,
  getH2ProvenanceLabel,
  getLatestSeriesValue,
  H2_CODE_LABELS,
  H2_QUALITY_LABELS,
  H2_REVIEW_LABELS,
  H2_SEVERITY_LABELS,
} from '../../model/presentation.ts'
import { createPccChartOption, createSocChartOption } from '../../model/chart-options.ts'
import {
  createH2OverviewSeriesQuery,
  useH2Series,
} from '../../model/series-loader.ts'
import { EChartsCanvas } from '../../components/charts/EChartsCanvas.tsx'
import { PageHeader } from '../../components/common/PageHeader.tsx'
import { SignConventionNote } from '../../components/common/SignConventionNote.tsx'
import { StatusBadge } from '../../components/common/StatusBadge.tsx'

export interface OverviewPageProps {
  readonly dataSource: H2SentinelDataSource
  readonly onNavigate: (target: H2NavigationTarget) => void
  readonly workspace: H2Workspace
}

export function OverviewPage({ dataSource, onNavigate, workspace }: OverviewPageProps) {
  const metrics = createOverviewMetrics(workspace.run)
  const seriesState = useH2Series(dataSource, createH2OverviewSeriesQuery(workspace.run))
  const series = seriesState.status === 'ready' ? seriesState.series : null
  const latestPcc = getLatestSeriesValue(series, 'pcc_power_actual_kw')
    ?? getLatestSeriesValue(series, 'pcc_power_kw')
  const latestSoc = getLatestSeriesValue(series, 'bess_soc_pct')
    ?? getLatestSeriesValue(series, 'bess_soc_percent')
  const seriesMessage = getOverviewSeriesMessage(seriesState.status)
  const representativeEvent = workspace.events[0]
  const qualityBlocked = workspace.run.quality.status === 'blocked'
  const judgePath = [
    {
      label: '数据源 / 导入',
      detail: workspace.run.dataset.sourceFilename,
      target: { route: 'analysis' },
    },
    {
      label: 'C01–C07 事件',
      detail: `${workspace.events.length} 个当前运行事件`,
      target: { route: 'events' },
    },
    {
      label: '证据链',
      detail: representativeEvent ? `${representativeEvent.code} · ${representativeEvent.evidence.length} 条证据` : '当前没有可核验证据',
      target: representativeEvent
        ? { route: 'diagnosis', eventId: representativeEvent.eventId }
        : null,
    },
    {
      label: '人工复核',
      detail: representativeEvent ? H2_REVIEW_LABELS[representativeEvent.reviewState] : '等待事件',
      target: representativeEvent
        ? { route: 'diagnosis', eventId: representativeEvent.eventId }
        : null,
    },
    {
      label: 'Q01–Q10 助手',
      detail: '确定性模板与证据引用',
      target: { route: 'assistant' },
    },
    {
      label: '报告 / 提交导出',
      detail: '下载带来源与哈希的产物',
      target: { route: 'reports' },
    },
  ] as const satisfies readonly {
    readonly label: string
    readonly detail: string
    readonly target: H2NavigationTarget | null
  }[]

  return (
    <div className="h2-page h2-overview-page">
      <PageHeader
        actions={
          <button
            className="h2-button h2-button--primary"
            onClick={() => onNavigate({ route: 'events' })}
            type="button"
          >
            查看异常事件
          </button>
        }
        description="把跨设备协同异常压缩成可核验的证据、影响与安全检查，让运行人员先理解，再决定。"
        eyebrow="Evidence-first operations"
        icon="overview"
        title="弱电网绿氢系统，异常一眼可查"
      />

      <section aria-label="核心运行指标" className="h2-metric-grid">
        {metrics.map((metric) => (
          <article className={`h2-metric h2-metric--${metric.tone}`} key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <p>{metric.detail}</p>
          </article>
        ))}
      </section>

      <section aria-labelledby="h2-judge-path-title" className="h2-panel h2-judge-path">
        <div className="h2-panel__heading">
          <div>
            <p className="h2-eyebrow">Judge golden path</p>
            <h2 id="h2-judge-path-title">一条路径完成核验、复核与导出</h2>
          </div>
          <StatusBadge tone={qualityBlocked ? 'danger' : 'positive'}>
            {H2_QUALITY_LABELS[workspace.run.quality.status]}
          </StatusBadge>
        </div>

        <dl className="h2-judge-context">
          <div><dt>数据集</dt><dd>{workspace.run.dataset.name}</dd></div>
          <div><dt>源文件</dt><dd>{workspace.run.dataset.sourceFilename}</dd></div>
          <div><dt>数据集 ID</dt><dd><code>{workspace.run.dataset.datasetId}</code></dd></div>
          <div><dt>来源</dt><dd>{getH2ProvenanceLabel(workspace.run.provenance, [workspace.run.dataset.name, workspace.run.dataset.sourceFilename])}</dd></div>
          <div className="h2-judge-context__fingerprint"><dt>SHA-256 指纹</dt><dd><code>{workspace.run.dataset.fingerprint}</code></dd></div>
        </dl>

        {qualityBlocked ? (
          <div className="h2-quality-block" role="alert">
            <strong>质量门禁已阻断后续分析</strong>
            <p>{workspace.run.quality.blockingReasons.join('；') || '数据源未提供可安全继续的原因。'} 未生成替代事件或推测结论。</p>
          </div>
        ) : null}

        <ol className="h2-judge-steps">
          {judgePath.map((step, index) => {
            const disabled = step.target === null || (qualityBlocked && index > 0)
            return (
              <li key={step.label}>
                <span aria-hidden="true">{index + 1}</span>
                <div><strong>{step.label}</strong><small>{step.detail}</small></div>
                <button
                  className="h2-text-button"
                  disabled={disabled}
                  onClick={() => step.target && onNavigate(step.target)}
                  type="button"
                >
                  {disabled ? '暂不可用' : '打开'}
                </button>
              </li>
            )
          })}
        </ol>

        <div aria-label="C01 到 C07 当前运行覆盖" className="h2-class-coverage">
          {H2_ANOMALY_CODES.map((code) => (
            <article key={code}>
              <span className={`h2-code h2-code--${code.toLocaleLowerCase('en-US')}`}>{code}</span>
              <strong>{H2_CODE_LABELS[code]}</strong>
              <small>{workspace.run.eventCountsByCode[code]} 个事件</small>
            </article>
          ))}
        </div>

        <SignConventionNote />
        <aside className="h2-no-control-boundary">
          <strong>无控制权限</strong>
          <p>氢哨只读取、诊断、解释和导出，不向电解槽、储能、PCC 或 EMS 下发指令；所有建议均需人工确认。</p>
        </aside>
      </section>

      <section aria-labelledby="h2-golden-title" className="h2-golden-path">
        <div className="h2-panel__heading">
          <div>
            <p className="h2-eyebrow">Fixture examples</p>
            <h2 id="h2-golden-title">C03 / C04 固定样例直达</h2>
          </div>
          <span>两次以内直达详情</span>
        </div>
        <div className="h2-golden-grid">
          {(['C03', 'C04'] as const).map((code) => {
            const event = workspace.events.find((candidate) => candidate.code === code)
            return (
              <GoldenCase
                code={code}
                event={event}
                key={code}
                onOpen={(eventId) => onNavigate({ route: 'diagnosis', eventId })}
              />
            )
          })}
        </div>
      </section>

      <div className="h2-dashboard-grid">
        <section className="h2-panel h2-chart-panel h2-dashboard-grid__wide">
          <div className="h2-panel__heading">
            <div>
              <p className="h2-eyebrow">PCC boundary</p>
              <h2>并网点功率与动态边界</h2>
            </div>
            <strong>{latestPcc === null ? '当前值未知' : formatH2Number(latestPcc, 'kW')}</strong>
          </div>
          {series ? (
            <EChartsCanvas
              ariaLabel="并网点实际功率、送出边界和受电边界时间序列图"
              option={createPccChartOption(series)}
            />
          ) : (
            <ChartUnavailable message={seriesMessage} />
          )}
        </section>

        <section className="h2-panel h2-chart-panel">
          <div className="h2-panel__heading">
            <div>
              <p className="h2-eyebrow">BESS state</p>
              <h2>储能 SOC 轨迹</h2>
            </div>
            <strong>{latestSoc === null ? '当前值未知' : formatH2Number(latestSoc, '%')}</strong>
          </div>
          {series ? (
            <EChartsCanvas
              ariaLabel="储能荷电状态时间序列图"
              option={createSocChartOption(series)}
            />
          ) : (
            <ChartUnavailable message={seriesMessage} />
          )}
        </section>

        <section className="h2-panel h2-latest-events">
          <div className="h2-panel__heading">
            <div>
              <p className="h2-eyebrow">Latest events</p>
              <h2>重要事件</h2>
            </div>
            <button className="h2-text-button" onClick={() => onNavigate({ route: 'events' })} type="button">
              全部事件 →
            </button>
          </div>
          <div className="h2-latest-events__list">
            {workspace.events.slice(0, 4).map((event) => (
              <button
                className="h2-event-row"
                key={event.eventId}
                onClick={() => onNavigate({ route: 'diagnosis', eventId: event.eventId })}
                type="button"
              >
                <span className={`h2-code h2-code--${event.code.toLocaleLowerCase('en-US')}`}>{event.code}</span>
                <span>
                  <strong>{H2_CODE_LABELS[event.code]}</strong>
                  <small>{formatH2Timestamp(event.startTime)} · {H2_REVIEW_LABELS[event.reviewState]}</small>
                </span>
                <StatusBadge tone="warning">{H2_SEVERITY_LABELS[event.severity]}风险</StatusBadge>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
function GoldenCase({
  code,
  event,
  onOpen,
}: {
  readonly code: 'C03' | 'C04'
  readonly event: H2AnomalyEvent | undefined
  readonly onOpen: (eventId: string) => void
}) {
  return (
    <article className={`h2-golden-card h2-golden-card--${code.toLocaleLowerCase('en-US')}`}>
      <div>
        <span className="h2-code">{code}</span>
        <StatusBadge tone={event ? 'warning' : 'planned'}>{event ? '样例就绪' : '事件不可用'}</StatusBadge>
      </div>
      <h3>{H2_CODE_LABELS[code]}</h3>
      <p>
        {code === 'C03'
          ? '对齐调度指令、储能实际方向与并网点响应。'
          : '对齐并网点实际功率、动态边界与超限区间。'}
      </p>
      {event ? (
        <dl>
          <div><dt>置信度</dt><dd>{formatH2Confidence(event.confidence)}</dd></div>
          <div><dt>影响</dt><dd>{formatH2Number(event.impact.value, event.impact.unit)}</dd></div>
        </dl>
      ) : null}
      <button
        className="h2-button h2-button--secondary"
        disabled={!event}
        onClick={() => event && onOpen(event.eventId)}
        type="button"
      >
        打开 {code} 诊断
      </button>
    </article>
  )
}

function ChartUnavailable({ message }: { readonly message: string | null }) {
  return (
    <div className="h2-chart-empty" role="status">
      <strong>趋势数据暂不可用</strong>
      <p>{message ?? '数据源没有返回所需时间序列；事件证据仍可独立核验。'}</p>
    </div>
  )
}

function getOverviewSeriesMessage(status: 'idle' | 'loading' | 'ready' | 'error'): string | null {
  if (status === 'loading') return '正在读取当前运行最近 24 小时的趋势。'
  if (status === 'error') return '最近 24 小时趋势读取失败；未绘制旧运行或占位曲线。'
  if (status === 'idle') return '当前字段清单没有概览图所需变量。'
  return null
}
