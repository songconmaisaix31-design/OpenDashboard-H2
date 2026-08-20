import type {
  H2AssistantQuestionId,
  H2ReportArtifact,
} from '../../../../../packages/h2-contracts/src/index.ts'
import { H2Shell } from './components/common/H2Shell.tsx'
import { EmptyDatasetState } from './components/common/EmptyDatasetState.tsx'
import { ViewState } from './components/common/ViewState.tsx'
import { findH2Event } from './model/presentation.ts'
import type { H2CommandState, H2WorkspaceState } from './model/view-state.ts'
import type { H2NavigationTarget } from './routes.ts'
import { OverviewPage } from './pages/overview/OverviewPage.tsx'
import { EventsPage } from './pages/events/EventsPage.tsx'
import { DiagnosisPage } from './pages/diagnosis/DiagnosisPage.tsx'
import { AnalysisPage } from './pages/analysis/AnalysisPage.tsx'
import { AssistantPage } from './pages/assistant/AssistantPage.tsx'
import { ReportsPage, type ReportDefinition } from './pages/reports/ReportsPage.tsx'

export interface H2SentinelViewProps {
  readonly commandState: H2CommandState
  readonly navigation: H2NavigationTarget
  readonly onAsk: (questionId: H2AssistantQuestionId) => void
  readonly onDownload: (artifact: H2ReportArtifact) => void
  readonly onExport: (definition: ReportDefinition) => void
  readonly onImport: (file: File) => void
  readonly onNavigate: (target: H2NavigationTarget) => void
  readonly onRetry: () => void
  readonly workspaceState: H2WorkspaceState
}

export function H2SentinelView({
  commandState,
  navigation,
  onAsk,
  onDownload,
  onExport,
  onImport,
  onNavigate,
  onRetry,
  workspaceState,
}: H2SentinelViewProps) {
  if (workspaceState.status === 'loading') {
    return (
      <ViewState
        description={workspaceState.message}
        eyebrow="H2 Sentinel · 数据源边界"
        title="正在加载可核验运行…"
      />
    )
  }

  if (workspaceState.status === 'error') {
    return (
      <ViewState
        actionLabel="重新加载"
        description={workspaceState.message}
        eyebrow="Fail closed"
        onAction={onRetry}
        title="数据源暂不可用"
        tone="error"
      />
    )
  }

  if (workspaceState.status === 'empty') {
    return (
      <EmptyDatasetState
        error={commandState.error}
        mode={workspaceState.mode}
        onImport={onImport}
        onRetry={onRetry}
        pending={commandState.pending === 'import'}
      />
    )
  }

  const { workspace } = workspaceState
  const selectedEvent = findH2Event(workspace.events, navigation.eventId)

  return (
    <H2Shell
      activeRoute={navigation.route}
      mode={workspace.mode}
      onNavigate={onNavigate}
      run={workspace.run}
    >
      {navigation.route === 'overview' ? (
        <OverviewPage onNavigate={onNavigate} workspace={workspace} />
      ) : null}
      {navigation.route === 'events' ? (
        <EventsPage onNavigate={onNavigate} workspace={workspace} />
      ) : null}
      {navigation.route === 'diagnosis' ? (
        <DiagnosisPage
          event={selectedEvent}
          events={workspace.events}
          onNavigate={onNavigate}
          series={workspace.series}
          seriesError={workspace.seriesError}
        />
      ) : null}
      {navigation.route === 'analysis' ? (
        <AnalysisPage
          importError={commandState.error}
          importNotice={commandState.notice}
          importPending={commandState.pending === 'import'}
          onImport={onImport}
          workspace={workspace}
        />
      ) : null}
      {navigation.route === 'assistant' ? (
        <AssistantPage
          answer={commandState.assistantAnswer}
          error={commandState.error}
          event={selectedEvent}
          onAsk={onAsk}
          pending={commandState.pending === 'assistant'}
        />
      ) : null}
      {navigation.route === 'reports' ? (
        <ReportsPage
          artifact={commandState.artifact}
          error={commandState.error}
          event={selectedEvent}
          notice={commandState.notice}
          onDownload={onDownload}
          onExport={onExport}
          pending={commandState.pending}
        />
      ) : null}
    </H2Shell>
  )
}
