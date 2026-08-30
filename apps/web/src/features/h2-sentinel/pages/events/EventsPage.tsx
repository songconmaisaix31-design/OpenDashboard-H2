import { useMemo } from 'react'

import {
  H2_ANOMALY_CODES,
  H2_SEVERITIES,
  type H2ReviewState,
  type H2SentinelDataSource,
} from '@opendashboard/h2-contracts'
import type { H2NavigationTarget } from '../../routes.ts'
import type { H2Workspace } from '../../model/view-state.ts'
import {
  filterH2Events,
  findH2Event,
  formatH2Confidence,
  formatH2Duration,
  formatH2Number,
  formatH2Timestamp,
  H2_CODE_LABELS,
  H2_PROVENANCE_LABELS,
  H2_REVIEW_LABELS,
  H2_SEVERITY_LABELS,
  INITIAL_EVENT_FILTERS,
  type H2EventFilterState,
} from '../../model/presentation.ts'
import {
  createEventChartOption,
  getEventChartUnitSummary,
} from '../../model/chart-options.ts'
import {
  createH2DiagnosisSeriesQuery,
  useH2Series,
} from '../../model/series-loader.ts'
import { EChartsCanvas } from '../../components/charts/EChartsCanvas.tsx'
import { SignConventionNote } from '../../components/common/SignConventionNote.tsx'
import { PageHeader } from '../../components/common/PageHeader.tsx'
import { StatusBadge } from '../../components/common/StatusBadge.tsx'

const reviewStates = ['open', 'confirmed', 'dismissed', 'resolved'] as const satisfies readonly H2ReviewState[]

export interface EventsPageProps {
  readonly dataSource: H2SentinelDataSource
  readonly eventFilters: H2EventFilterState
  readonly onEventFiltersChange: (filters: H2EventFilterState) => void
  readonly onNavigate: (target: H2NavigationTarget) => void
  readonly onSelectEvent: (eventId: string | null) => void
  readonly selectedEventId: string | null
  readonly workspace: H2Workspace
}

export function EventsPage({
  dataSource,
  eventFilters,
  onEventFiltersChange,
  onNavigate,
  onSelectEvent,
  selectedEventId,
  workspace,
}: EventsPageProps) {
  // C-P0-3：筛选状态提升到 App 层（受控），跳诊断页返回后不丢失。
  const filters = eventFilters
  const runProvenance = workspace.run.provenance
  const filteredEvents = useMemo(
    () => filterH2Events(workspace.events, filters),
    [filters, workspace.events],
  )

  // C-P0-3：全局选中事件驱动页内联动曲线；与诊断页共用同一查询（事件窗）与图表装配，保证时间轴一致（红线 #1）。
  const selectedEvent = selectedEventId
    ? findH2Event(workspace.events, selectedEventId)
    : null
  const seriesState = useH2Series(
    dataSource,
    selectedEvent ? createH2DiagnosisSeriesQuery(workspace.run, selectedEvent) : null,
  )
  const series = seriesState.status === 'ready' ? seriesState.series : null
  const selectedInFilter = selectedEvent
    ? filteredEvents.some(({ eventId }) => eventId === selectedEvent.eventId)
    : false

  function updateFilters(patch: Partial<H2EventFilterState>): void {
    onEventFiltersChange({ ...filters, ...patch })
  }

  function selectRow(eventId: string): void {
    if (eventId !== selectedEventId) onSelectEvent(eventId)
  }

  return (
    <div className="h2-page h2-events-page">
      <PageHeader
        description="按异常类型、风险、设备、置信度和复核状态定位事件；筛选只改变视图，不修改分析结果。选中行可在下方查看联动曲线。"
        eyebrow="Anomaly event center"
        icon="events"
        title="异常事件中心"
      />

      <section aria-label="事件筛选" className="h2-panel h2-filter-panel">
        <label>
          <span>异常类型</span>
          <select value={filters.code} onChange={(event) => updateFilters({ code: event.currentTarget.value as H2EventFilterState['code'] })}>
            <option value="all">全部 C01–C07</option>
            {H2_ANOMALY_CODES.map((code) => <option key={code} value={code}>{code} · {H2_CODE_LABELS[code]}</option>)}
          </select>
        </label>
        <label>
          <span>严重度</span>
          <select value={filters.severity} onChange={(event) => updateFilters({ severity: event.currentTarget.value as H2EventFilterState['severity'] })}>
            <option value="all">全部严重度</option>
            {H2_SEVERITIES.map((severity) => <option key={severity} value={severity}>{H2_SEVERITY_LABELS[severity]}</option>)}
          </select>
        </label>
        <label>
          <span>复核状态</span>
          <select value={filters.reviewState} onChange={(event) => updateFilters({ reviewState: event.currentTarget.value as H2EventFilterState['reviewState'] })}>
            <option value="all">全部状态</option>
            {reviewStates.map((state) => <option key={state} value={state}>{H2_REVIEW_LABELS[state]}</option>)}
          </select>
        </label>
        <label>
          <span>设备</span>
          <input value={filters.equipmentQuery} onChange={(event) => updateFilters({ equipmentQuery: event.currentTarget.value })} placeholder="BESS / PCC / 设备 ID" type="search" />
        </label>
        <label>
          <span>最低置信度 · {formatH2Confidence(filters.minConfidence)}</span>
          <input max="1" min="0" onChange={(event) => updateFilters({ minConfidence: Number(event.currentTarget.value) })} step="0.05" type="range" value={filters.minConfidence} />
        </label>
        <label>
          <span>开始时间不早于</span>
          <input value={filters.startsAtOrAfter} onChange={(event) => updateFilters({ startsAtOrAfter: event.currentTarget.value })} placeholder="ISO 8601 时间" type="text" />
        </label>
        <label>
          <span>结束时间不晚于</span>
          <input value={filters.endsAtOrBefore} onChange={(event) => updateFilters({ endsAtOrBefore: event.currentTarget.value })} placeholder="ISO 8601 时间" type="text" />
        </label>
        <button className="h2-button h2-button--ghost" onClick={() => onEventFiltersChange(INITIAL_EVENT_FILTERS)} type="button">清除筛选</button>
      </section>

      <div aria-live="polite" className="h2-result-count">显示 {filteredEvents.length} / {workspace.events.length} 个事件</div>

      {filteredEvents.length === 0 ? (
        <section className="h2-panel h2-empty-panel">
          <strong>没有匹配事件</strong>
          <p>调整筛选条件。源分析结果没有被修改。</p>
        </section>
      ) : (
        <section aria-label="异常事件列表" className="h2-panel h2-table-panel">
          <div className="h2-table-scroll">
            <table className="h2-table h2-table--selectable">
              <thead><tr><th>事件</th><th>时间与时长</th><th>控制对象 / 设备</th><th>影响</th><th>置信度</th><th>来源</th><th><span className="h2-visually-hidden">操作</span></th></tr></thead>
              <tbody>
                {filteredEvents.map((event) => (
                  <tr
                    aria-selected={event.eventId === selectedEventId}
                    className={event.eventId === selectedEventId ? 'is-selected' : undefined}
                    key={event.eventId}
                    onClick={() => selectRow(event.eventId)}
                    onKeyDown={(keyboardEvent) => {
                      if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
                        keyboardEvent.preventDefault()
                        selectRow(event.eventId)
                      }
                    }}
                    tabIndex={0}
                  >
                    <td><div className="h2-table__event"><span className="h2-code">{event.code}</span><span><strong>{H2_CODE_LABELS[event.code]}</strong><small>{event.eventId} · {H2_SEVERITY_LABELS[event.severity]}风险 · {H2_REVIEW_LABELS[event.reviewState]}</small></span></div></td>
                    <td><strong>{formatH2Timestamp(event.startTime)}</strong><small>{formatH2Duration(event.startTime, event.endTime)} · 首次发现 {formatH2Timestamp(event.firstDetectionTime)}</small></td>
                    <td><strong>{event.primaryControlObject.displayName}</strong><small>{event.affectedEquipment.map(({ displayName }) => displayName).join('、')}</small></td>
                    <td><strong>{formatH2Number(event.impact.value, event.impact.unit)}</strong><small>{event.impact.metric}</small></td>
                    <td><strong>{formatH2Confidence(event.confidence)}</strong></td>
                    <td><StatusBadge tone={runProvenance.mode === 'FIXTURE' ? 'fixture' : 'live'}>{H2_PROVENANCE_LABELS[runProvenance.mode]}</StatusBadge></td>
                    <td>
                      <button
                        aria-label={`打开 ${event.eventId} 诊断`}
                        className="h2-icon-button"
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation()
                          onNavigate({ route: 'diagnosis', eventId: event.eventId })
                        }}
                        type="button"
                      >
                        →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {selectedEvent ? (
        <section aria-label="所选事件联动曲线" className="h2-panel h2-chart-panel h2-linkage-panel">
          <div className="h2-panel__heading">
            <div><p className="h2-eyebrow">Linked trend</p><h2>联动曲线 · {selectedEvent.code} {H2_CODE_LABELS[selectedEvent.code]}</h2></div>
            <div className="h2-linkage-panel__meta">
              <span>{getEventChartUnitSummary(selectedEvent)} · 与诊断页同源事件窗口，阴影为事件区间</span>
              {!selectedInFilter ? <small className="h2-linkage-panel__hint">当前筛选未包含所选事件；曲线仍显示所选事件，未替换为其他数据。</small> : null}
            </div>
          </div>
          <SignConventionNote compact />
          {series ? (
            <EChartsCanvas ariaLabel={`${selectedEvent.code} 事件联动曲线，含证据变量序列与事件区间底纹`} option={createEventChartOption(series, selectedEvent)} />
          ) : (
            <div className="h2-chart-empty" role="status"><strong>趋势数据暂不可用</strong><p>{getLinkageSeriesMessage(seriesState.status)}</p></div>
          )}
          <div className="h2-linkage-panel__actions">
            <button className="h2-button h2-button--primary" onClick={() => onNavigate({ route: 'diagnosis', eventId: selectedEvent.eventId })} type="button">查看完整证据链 →</button>
          </div>
        </section>
      ) : null}
    </div>
  )
}

function getLinkageSeriesMessage(status: 'idle' | 'loading' | 'ready' | 'error'): string {
  if (status === 'loading') return '正在读取所选事件窗口的时间序列。'
  if (status === 'error') return '所选事件趋势读取失败；未显示其他事件或推测曲线。'
  return '所选事件没有可请求的测量或约束变量；结构化证据可在诊断页独立核验。'
}
