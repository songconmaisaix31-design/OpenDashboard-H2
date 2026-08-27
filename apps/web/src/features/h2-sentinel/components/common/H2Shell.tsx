import { useState, type ReactNode } from 'react'

import type { H2AnalysisRun, H2DatasetMode } from '@opendashboard/h2-contracts'
import {
  toH2SentinelHash,
  type H2NavigationTarget,
  type H2SentinelRoute,
} from '../../routes.ts'
import { formatH2Timestamp, getH2ProvenanceLabel } from '../../model/presentation.ts'
import { ProvenanceBanner } from '../provenance/ProvenanceBanner.tsx'
import { H2Icon, type H2IconName } from './H2Icon.tsx'
import { StackWidget, StackWidgetRow } from './StackWidget.tsx'
import { StatusBadge } from './StatusBadge.tsx'

const navigation = [
  {
    route: 'overview',
    label: '系统总览',
    description: '关键指标与黄金路径',
    icon: 'overview',
  },
  {
    route: 'events',
    label: '异常事件',
    description: '筛选与定位事件',
    icon: 'events',
  },
  {
    route: 'diagnosis',
    label: '诊断详情',
    description: '证据、影响与安全',
    icon: 'diagnosis',
  },
  {
    route: 'analysis',
    label: '数据分析',
    description: '质量门禁与趋势',
    icon: 'analysis',
  },
  {
    route: 'assistant',
    label: '运行助手',
    description: '确定性问答解释',
    icon: 'assistant',
  },
  {
    route: 'reports',
    label: '报告中心',
    description: '结构化结果导出',
    icon: 'reports',
  },
] as const satisfies readonly {
  readonly route: H2SentinelRoute
  readonly label: string
  readonly description: string
  readonly icon: H2IconName
}[]

export interface H2ShellProps {
  readonly activeRoute: H2SentinelRoute
  readonly children: ReactNode
  readonly mode: H2DatasetMode
  readonly onNavigate: (target: H2NavigationTarget) => void
  readonly run: H2AnalysisRun
}

export function H2Shell({ activeRoute, children, mode, onNavigate, run }: H2ShellProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const activePage = navigation.find(({ route }) => route === activeRoute) ?? navigation[0]

  function navigate(target: H2NavigationTarget): void {
    setMenuOpen(false)
    onNavigate(target)
  }

  return (
    <div className={menuOpen ? 'h2-app is-menu-open' : 'h2-app'}>
      <a className="h2-skip-link" href="#h2-main">
        跳到主要内容
      </a>

      <button
        aria-label="关闭导航"
        className="h2-sidebar-backdrop"
        onClick={() => setMenuOpen(false)}
        tabIndex={menuOpen ? 0 : -1}
        type="button"
      />

      <aside className="h2-sidebar" aria-label="H2 Sentinel 应用侧栏">
        <div className="h2-profile-card">
          <div aria-hidden="true" className="h2-profile-card__cover">
            <span />
            <span />
            <span />
          </div>
          <button
            aria-label="关闭导航"
            className="h2-sidebar__close"
            onClick={() => setMenuOpen(false)}
            type="button"
          >
            <H2Icon name="close" size={18} />
          </button>
          <div aria-hidden="true" className="h2-profile-card__avatar">
            H<sub>2</sub>
          </div>
          <div className="h2-profile-card__body">
            <p>Evidence-first EMS copilot</p>
            <strong>氢哨 · H2 Sentinel</strong>
            <span>弱并网绿电制氢异常诊断与运行辅助</span>
            <div className="h2-profile-card__tags" aria-label="产品标签">
              <span>只读</span>
              <span>离线</span>
              <span>可追溯</span>
            </div>
          </div>
        </div>

        <nav aria-label="H2 Sentinel 主导航" className="h2-nav">
          <p className="h2-nav__title">Navigation</p>
          {navigation.map((item) => {
            const target = { route: item.route } satisfies H2NavigationTarget
            return (
              <a
                aria-current={activeRoute === item.route ? 'page' : undefined}
                className={activeRoute === item.route ? 'h2-nav__item is-active' : 'h2-nav__item'}
                href={toH2SentinelHash(target)}
                key={item.route}
                onClick={(event) => {
                  event.preventDefault()
                  navigate(target)
                }}
              >
                <span aria-hidden="true" className="h2-nav__icon">
                  <H2Icon name={item.icon} size={18} />
                </span>
                <span className="h2-nav__copy">
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
                <H2Icon className="h2-nav__chevron" name="chevron-right" size={14} />
              </a>
            )
          })}
        </nav>

        <div className="h2-sidebar__boundary">
          <div>
            <H2Icon name="shield" size={17} />
            <strong>控制边界</strong>
          </div>
          <p>不执行设备控制，不自动改变调度；所有建议均需人工确认。</p>
          <StatusBadge tone="planned">只读决策支持</StatusBadge>
        </div>
      </aside>

      <div className="h2-stage">
        <header className="h2-topbar">
          <div className="h2-topbar__leading">
            <button
              aria-expanded={menuOpen}
              aria-label="打开导航"
              className="h2-mobile-menu"
              onClick={() => setMenuOpen(true)}
              type="button"
            >
              <H2Icon name="menu" size={20} />
            </button>
            <span className="h2-topbar__page-icon" aria-hidden="true">
              <H2Icon name={activePage.icon} size={17} />
            </span>
            <div>
              <span className="h2-topbar__station">{activePage.label}</span>
              <span className="h2-topbar__run">{activePage.description}</span>
            </div>
          </div>
          <div className="h2-topbar__status">
            <StatusBadge
              icon={mode === 'FIXTURE' ? '◇' : '●'}
              tone={mode === 'FIXTURE' ? 'fixture' : 'live'}
            >
              {getH2ProvenanceLabel(run.provenance, [
                run.dataset.name,
                run.dataset.sourceFilename,
              ])}
            </StatusBadge>
            <span>更新 {formatH2Timestamp(run.completedAt ?? run.startedAt)}</span>
          </div>
        </header>

        <main className="h2-main" id="h2-main" tabIndex={-1}>
          <div className="h2-shell-grid">
            <div className="h2-content-column">
              <ProvenanceBanner
                mode={mode}
                provenance={run.provenance}
                sourceHints={[run.dataset.name, run.dataset.sourceFilename]}
              />
              {children}
            </div>

            <aside className="h2-widget-rail" aria-label="运行上下文">
              <StackWidget
                eyebrow="Live context"
                icon="activity"
                title="当前运行"
                tone="accent"
              >
                <StackWidgetRow label="运行 ID" value={<code>{run.runId}</code>} />
                <StackWidgetRow label="状态" value={run.status} />
                <StackWidgetRow
                  label="更新时间"
                  value={formatH2Timestamp(run.completedAt ?? run.startedAt)}
                />
              </StackWidget>

              <StackWidget eyebrow="Dataset" icon="database" title="数据集摘要">
                <StackWidgetRow label="名称" value={run.dataset.name} />
                <StackWidgetRow label="记录数" value={formatCompactNumber(run.dataset.rowCount)} />
                <StackWidgetRow label="字段" value={`${run.dataset.fields.length} 个`} />
                <StackWidgetRow
                  label="采样"
                  value={`${run.dataset.samplingIntervalMinutes} 分钟`}
                />
              </StackWidget>

              <StackWidget
                eyebrow="Human in the loop"
                footer={<span>建议不会自动下发到设备</span>}
                icon="shield"
                title="安全边界"
                tone="safe"
              >
                <p className="h2-widget-copy">
                  诊断结果用于运行辅助，不替代 EMS，也不直接控制电解槽、储能或 PCC。
                </p>
                <div className="h2-widget-checks">
                  <span>✓ 来源可见</span>
                  <span>✓ 事实与推断分离</span>
                  <span>✓ 必须人工确认</span>
                </div>
              </StackWidget>
            </aside>
          </div>
        </main>
      </div>
    </div>
  )
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: 1,
    notation: value >= 10_000 ? 'compact' : 'standard',
  }).format(value)
}
