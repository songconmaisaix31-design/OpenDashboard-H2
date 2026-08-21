import type { H2AnomalyEvent } from '@opendashboard/h2-contracts'
import type { H2NavigationTarget } from '../../routes.ts'
import type { H2Workspace } from '../../model/view-state.ts'
import {
  createOverviewMetrics,
  formatH2Confidence,
  formatH2Number,
  formatH2Timestamp,
  getLatestSeriesValue,
  H2_CODE_LABELS,
  H2_REVIEW_LABELS,
  H2_SEVERITY_LABELS,
} from '../../model/presentation.ts'
import { createPccChartOption, createSocChartOption } from '../../model/chart-options.ts'
import { EChartsCanvas } from '../../components/charts/EChartsCanvas.tsx'
import { PageHeader } from '../../components/common/PageHeader.tsx'
import { StatusBadge } from '../../components/common/StatusBadge.tsx'

export interface OverviewPageProps {
  readonly onNavigate: (target: H2NavigationTarget) => void
  readonly workspace: H2Workspace
}

export function OverviewPage({ onNavigate, workspace }: OverviewPageProps) {
  const metrics = createOverviewMetrics(workspace.run)
  const latestPcc = getLatestSeriesValue(workspace.series, 'pcc_power_kw')
  const latestSoc = getLatestSeriesValue(workspace.series, 'bess_soc_percent')

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

      <section aria-labelledby="h2-golden-title" className="h2-golden-path">
        <div className="h2-panel__heading">
          <div>
            <p className="h2-eyebrow">Golden cases</p>
            <h2 id="h2-golden-title">黄金诊断路径</h2>
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
          {workspace.series ? (
            <EChartsCanvas
              ariaLabel="并网点实际功率、送出边界和受电边界时间序列图"
              option={createPccChartOption(workspace.series)}
            />
          ) : (
            <ChartUnavailable message={workspace.seriesError} />
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
          {workspace.series ? (
            <EChartsCanvas
              ariaLabel="储能荷电状态时间序列图"
              option={createSocChartOption(workspace.series)}
            />
          ) : (
            <ChartUnavailable message={workspace.seriesError} />
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
