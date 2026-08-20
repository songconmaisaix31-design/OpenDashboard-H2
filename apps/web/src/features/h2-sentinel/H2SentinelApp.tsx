import { useCallback, useEffect, useState } from 'react'

import type {
  H2AssistantQuestionId,
  H2DatasetManifest,
  H2ReportArtifact,
  H2ReportRequest,
  H2SentinelDataSource,
} from '@opendashboard/h2-contracts'
import { H2SentinelView } from './H2SentinelView.tsx'
import {
  INITIAL_H2_COMMAND_STATE,
  type H2CommandState,
  type H2Workspace,
  type H2WorkspaceState,
} from './model/view-state.ts'
import {
  H2CsvInputError,
  hydrateH2Workspace,
  importH2CsvWorkspace,
} from './model/workspace-loader.ts'
import {
  parseH2SentinelHash,
  toH2SentinelHash,
  type H2NavigationTarget,
  type H2SentinelRoute,
} from './routes.ts'
import type { ReportDefinition } from './pages/reports/ReportsPage.tsx'
import './styles/h2-sentinel.css'

export interface H2SentinelAppProps {
  /** H6 resolves the statically reviewed H2 plugin service and injects it here. */
  readonly dataSource: H2SentinelDataSource
  readonly initialEventId?: string
  readonly initialRoute?: H2SentinelRoute
  readonly syncHash?: boolean
}

export function H2SentinelApp({
  dataSource,
  initialEventId,
  initialRoute,
  syncHash = true,
}: H2SentinelAppProps) {
  const [workspaceState, setWorkspaceState] = useState<H2WorkspaceState>({
    status: 'loading',
    message: '正在通过注入的 H2SentinelDataSource 读取运行、事件与时间序列。',
  })
  const [commandState, setCommandState] = useState<H2CommandState>(INITIAL_H2_COMMAND_STATE)
  const [navigation, setNavigation] = useState<H2NavigationTarget>(() => {
    if (initialRoute) {
      return initialEventId ? { route: initialRoute, eventId: initialEventId } : { route: initialRoute }
    }
    return typeof window === 'undefined' ? { route: 'overview' } : parseH2SentinelHash(window.location.hash)
  })
  const [loadAttempt, setLoadAttempt] = useState(0)

  const hydrateWorkspace = useCallback(
    (datasets: readonly H2DatasetManifest[], dataset: H2DatasetManifest): Promise<H2Workspace> =>
      hydrateH2Workspace(dataSource, datasets, dataset),
    [dataSource],
  )

  useEffect(() => {
    let disposed = false
    setWorkspaceState({
      status: 'loading',
      message: '正在通过注入的 H2SentinelDataSource 读取运行、事件与时间序列。',
    })
    setCommandState(INITIAL_H2_COMMAND_STATE)

    void Promise.all([dataSource.getMode(), dataSource.listDatasets()])
      .then(async ([mode, datasets]) => {
        const dataset = datasets[0]
        if (!dataset) {
          if (!disposed) setWorkspaceState({ status: 'empty', mode })
          return
        }

        const workspace = await hydrateWorkspace(datasets, dataset)
        if (!disposed) setWorkspaceState({ status: 'ready', workspace })
      })
      .catch(() => {
        if (!disposed) {
          setWorkspaceState({
            status: 'error',
            message: '无法读取 H2 数据源。未尝试访问远程主机，也未生成推测结果。',
          })
        }
      })

    return () => {
      disposed = true
    }
  }, [dataSource, hydrateWorkspace, loadAttempt])

  useEffect(() => {
    if (!syncHash || typeof window === 'undefined') {
      return
    }

    const handleHashChange = (): void => setNavigation(parseH2SentinelHash(window.location.hash))
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [syncHash])

  function navigate(target: H2NavigationTarget): void {
    setNavigation(target)
    if (syncHash && typeof window !== 'undefined') {
      window.history.replaceState(null, '', toH2SentinelHash(target))
    }
  }

  async function ask(questionId: H2AssistantQuestionId): Promise<void> {
    if (workspaceState.status !== 'ready' || commandState.pending) return
    const selectedEvent = workspaceState.workspace.events.find(({ eventId }) => eventId === navigation.eventId)
      ?? workspaceState.workspace.events.find(({ code }) => code === 'C03')

    setCommandState((current) => ({ ...current, pending: 'assistant', error: null, notice: null }))
    try {
      const request = selectedEvent
        ? { runId: workspaceState.workspace.run.runId, questionId, eventId: selectedEvent.eventId, allowLlmRendering: false }
        : { runId: workspaceState.workspace.run.runId, questionId, allowLlmRendering: false }
      const assistantAnswer = await dataSource.ask(request)
      setCommandState((current) => ({ ...current, pending: null, assistantAnswer }))
    } catch {
      setCommandState((current) => ({ ...current, pending: null, error: '运行助手未能返回确定性答案；没有调用外部语言模型。' }))
    }
  }

  async function exportArtifact(definition: ReportDefinition): Promise<void> {
    if (workspaceState.status !== 'ready' || commandState.pending) return
    const { run, events } = workspaceState.workspace
    const selectedEvent = events.find(({ eventId }) => eventId === navigation.eventId)
      ?? events.find(({ code }) => code === 'C03')

    setCommandState((current) => ({ ...current, pending: definition.operation, error: null, notice: null }))
    try {
      let artifact: H2ReportArtifact
      if (definition.kind === 'submission') {
        artifact = await dataSource.exportSubmission(run.runId)
      } else {
        const request = createReportRequest(definition.kind, run.runId, run.dataset.timeRange, selectedEvent?.eventId)
        artifact = await dataSource.exportReport(request)
      }
      setCommandState((current) => ({ ...current, pending: null, artifact, notice: `已生成 ${artifact.descriptor.filename}` }))
    } catch {
      setCommandState((current) => ({ ...current, pending: null, error: '导出失败；没有写入未知路径，也没有生成替代内容。' }))
    }
  }

  async function importCsv(file: File): Promise<void> {
    if (
      (workspaceState.status !== 'ready' && workspaceState.status !== 'empty') ||
      commandState.pending
    ) return

    setCommandState((current) => ({ ...current, pending: 'import', error: null, notice: null }))
    try {
      const { workspace, qualityStatus } = await importH2CsvWorkspace(dataSource, file)
      setWorkspaceState({ status: 'ready', workspace })
      setCommandState({
        ...INITIAL_H2_COMMAND_STATE,
        notice: `已导入 ${workspace.run.dataset.name}；质量状态：${qualityStatus}。`,
      })
    } catch (error) {
      const message =
        error instanceof H2CsvInputError
          ? error.code === 'too_large'
            ? 'CSV 超过 5 MiB 上限；未开始导入。'
            : '只接受明确选择的 .csv 文件。'
          : 'CSV 导入或分析失败；当前运行保持不变。'
      setCommandState((current) => ({ ...current, pending: null, error: message }))
    }
  }

  return (
    <H2SentinelView
      commandState={commandState}
      navigation={navigation}
      onAsk={(questionId) => void ask(questionId)}
      onDownload={downloadArtifact}
      onExport={(definition) => void exportArtifact(definition)}
      onImport={(file) => void importCsv(file)}
      onNavigate={navigate}
      onRetry={() => setLoadAttempt((attempt) => attempt + 1)}
      workspaceState={workspaceState}
    />
  )
}

function createReportRequest(
  kind: Exclude<ReportDefinition['kind'], 'submission'>,
  runId: string,
  timeRange: H2ReportRequest['timeRange'],
  eventId?: string,
): H2ReportRequest {
  if (kind === 'single_event_diagnosis' && eventId) {
    return { runId, kind, eventId }
  }
  if (kind === 'period_summary' && timeRange) {
    return { runId, kind, timeRange }
  }
  return { runId, kind }
}

function downloadArtifact(artifact: H2ReportArtifact): void {
  const objectUrl = URL.createObjectURL(new Blob([artifact.content], { type: artifact.mediaType }))
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = artifact.descriptor.filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(objectUrl)
}
