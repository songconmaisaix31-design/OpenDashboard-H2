import type { ReactNode } from 'react'

import type { H2AnalysisRun, H2DatasetMode } from '@opendashboard/h2-contracts'
import {
  toH2SentinelHash,
  type H2NavigationTarget,
  type H2SentinelRoute,
} from '../../routes.ts'
import { H2_MODE_COPY, formatH2Timestamp } from '../../model/presentation.ts'
import { ProvenanceBanner } from '../provenance/ProvenanceBanner.tsx'
import { StatusBadge } from './StatusBadge.tsx'

const navigation = [
  { route: 'overview', label: '系统总览', icon: '⌁' },
  { route: 'events', label: '异常事件', icon: '!' },
  { route: 'diagnosis', label: '诊断详情', icon: '◎' },
  { route: 'analysis', label: '数据分析', icon: '⌇' },
  { route: 'assistant', label: '运行助手', icon: '◇' },
  { route: 'reports', label: '报告中心', icon: '↗' },
] as const satisfies readonly {
  readonly route: H2SentinelRoute
  readonly label: string
  readonly icon: string
}[]

export interface H2ShellProps {
  readonly activeRoute: H2SentinelRoute
  readonly children: ReactNode
  readonly mode: H2DatasetMode
  readonly onNavigate: (target: H2NavigationTarget) => void
  readonly run: H2AnalysisRun
}

export function H2Shell({ activeRoute, children, mode, onNavigate, run }: H2ShellProps) {
  return (
    <div className="h2-app">
      <a className="h2-skip-link" href="#h2-main">
        跳到主要内容
      </a>
      <aside className="h2-sidebar">
        <div className="h2-brand">
          <span aria-hidden="true" className="h2-brand__mark">H2</span>
          <div>
            <strong>氢哨</strong>
            <span>H2 Sentinel</span>
          </div>
        </div>

        <nav aria-label="H2 Sentinel 主导航" className="h2-nav">
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
                  onNavigate(target)
                }}
              >
                <span aria-hidden="true" className="h2-nav__icon">{item.icon}</span>
                <span>{item.label}</span>
              </a>
            )
          })}
        </nav>

        <div className="h2-sidebar__boundary">
          <StatusBadge tone="planned">只读决策支持</StatusBadge>
          <p>不执行设备控制，不自动改变调度；所有建议均需人工确认。</p>
        </div>
      </aside>

      <div className="h2-stage">
        <header className="h2-topbar">
          <div>
            <span className="h2-topbar__station">弱电网友好型绿氢系统</span>
            <span className="h2-topbar__run">运行 {run.runId}</span>
          </div>
          <div className="h2-topbar__status">
            <StatusBadge icon={mode === 'FIXTURE' ? '◇' : '●'} tone={mode === 'FIXTURE' ? 'fixture' : 'live'}>
              {H2_MODE_COPY[mode].label}
            </StatusBadge>
            <span>更新 {formatH2Timestamp(run.completedAt ?? run.startedAt)}</span>
          </div>
        </header>

        <main className="h2-main" id="h2-main" tabIndex={-1}>
          <ProvenanceBanner mode={mode} provenance={run.provenance} />
          {children}
        </main>
      </div>
    </div>
  )
}
