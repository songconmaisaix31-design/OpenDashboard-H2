import type {
  H2AssistantQuestionId,
  H2ReportArtifact,
  H2SentinelDataSource,
} from '@opendashboard/h2-contracts'
import { H2Shell } from './components/common/H2Shell.tsx'
import { EmptyDatasetState } from './components/common/EmptyDatasetState.tsx'
import { ViewState } from './components/common/ViewState.tsx'
import { findH2Event, type H2EventFilterState } from './model/presentation.ts'
import type { H2ReviewDraft } from './model/review.ts'
import type { H2AssistantSubmissionResult } from './model/assistant.ts'
import type {
  H2CommandState,
  H2ReviewCommandState,
  H2WorkspaceState,
} from './model/view-state.ts'
import type { H2NavigationTarget } from './routes.ts'
import { OverviewPage } from './pages/overview/OverviewPage.tsx'
import { EventsPage } from './pages/events/EventsPage.tsx'
import { DiagnosisPage } from './pages/diagnosis/DiagnosisPage.tsx'
import { AnalysisPage } from './pages/analysis/AnalysisPage.tsx'
import { AssistantPage } from './pages/assistant/AssistantPage.tsx'
import { ReportsPage, type ReportDefinition } from './pages/reports/ReportsPage.tsx'

export interface H2SentinelViewProps {
  readonly commandState: H2CommandState
  readonly dataSource: H2SentinelDataSource
  readonly eventFilters: H2EventFilterState
  readonly navigation: H2NavigationTarget
  readonly onEventFiltersChange: (filters: H2EventFilterState) => void
  readonly onAsk: (questionId: H2AssistantQuestionId, allowLlmRendering: boolean) => void
  readonly onSubmitFollowUp: (input: string, allowLlmRendering: boolean) => Promise<H2AssistantSubmissionResult>
  readonly onDownload: (artifact: H2ReportArtifact) => void
  readonly onExport: (definition: ReportDefinition) => void
  readonly onImport: (file: File) => void
  readonly onCancelImport: () => void
  readonly onNavigate: (target: H2NavigationTarget) => void
  readonly onReloadReview: () => void
  readonly onRetry: () => void
  readonly onReview: (draft: H2ReviewDraft) => void
  readonly onSelectEvent: (eventId: string | null) => void
  readonly reviewState: H2ReviewCommandState
  readonly selectedEventId: string | null
  readonly workspaceState: H2WorkspaceState
}

export function H2SentinelView({
  commandState,
  dataSource,
  eventFilters,
  navigation,
  onAsk,
  onEventFiltersChange,
  onSubmitFollowUp,
  onDownload,
  onExport,
  onImport,
  onCancelImport,
  onNavigate,
  onReloadReview,
  onRetry,
  onReview,
  onSelectEvent,
  reviewState,
  selectedEventId,
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
        importProgress={commandState.importProgress}
        mode={workspaceState.mode}
        onImport={onImport}
        onCancelImport={onCancelImport}
        onRetry={onRetry}
        pending={commandState.pending === 'import'}
      />
    )
  }

  const { workspace } = workspaceState
  const selectedEvent = findH2Event(
    workspace.events,
    (navigation.route === 'diagnosis'
      ? navigation.eventId ?? selectedEventId
      : selectedEventId) ?? undefined,
  )

  return (
    <H2Shell
      activeRoute={navigation.route}
      onNavigate={onNavigate}
      run={workspace.run}
    >
      {navigation.route === 'overview' ? (
        <OverviewPage dataSource={dataSource} onNavigate={onNavigate} workspace={workspace} />
      ) : null}
      {navigation.route === 'events' ? (
        <EventsPage
          dataSource={dataSource}
          eventFilters={eventFilters}
          onEventFiltersChange={onEventFiltersChange}
          onNavigate={onNavigate}
          onSelectEvent={onSelectEvent}
          selectedEventId={selectedEventId}
          workspace={workspace}
        />
      ) : null}
      {navigation.route === 'diagnosis' ? (
        <DiagnosisPage
          dataSource={dataSource}
          event={selectedEvent}
          events={workspace.events}
          onNavigate={onNavigate}
          onReloadReview={onReloadReview}
          onReview={onReview}
          reviewState={reviewState}
          run={workspace.run}
        />
      ) : null}
      {navigation.route === 'analysis' ? (
        <AnalysisPage
          dataSource={dataSource}
          importError={commandState.error}
          importNotice={commandState.notice}
          importPending={commandState.pending === 'import'}
          importProgress={commandState.importProgress}
          onCancelImport={onCancelImport}
          onImport={onImport}
          workspace={workspace}
        />
      ) : null}
      {navigation.route === 'assistant' ? (
        <AssistantPage
          answer={commandState.assistantAnswer}
          modeDisplay={commandState.assistantMode}
          error={commandState.error}
          event={selectedEvent}
          events={workspace.events}
          onAsk={onAsk}
          onDownload={onDownload}
          onSelectEvent={onSelectEvent}
          onSubmitFollowUp={onSubmitFollowUp}
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
