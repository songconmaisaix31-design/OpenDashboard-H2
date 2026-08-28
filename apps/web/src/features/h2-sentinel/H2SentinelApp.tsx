import { useCallback, useEffect, useState } from 'react'

import type {
  H2DatasetManifest,
  H2EventReview,
  H2ReportArtifact,
  H2SentinelDataSource,
} from '@opendashboard/h2-contracts'
import { H2SentinelView } from './H2SentinelView.tsx'
import { getH2AssistantEventRequirement } from './model/assistant.ts'
import { createH2ReportRequest } from './model/reporting.ts'
import {
  createH2ReviewRequestId,
  h2ReviewFailureMessage,
  isH2ReviewConflict,
  validateH2ReviewDraft,
  type H2ReviewDraft,
} from './model/review.ts'
import {
  INITIAL_H2_COMMAND_STATE,
  INITIAL_H2_REVIEW_COMMAND_STATE,
  type H2CommandState,
  type H2ReviewCommandState,
  type H2Workspace,
  type H2WorkspaceState,
} from './model/view-state.ts'
import {
  H2_CSV_MAX_BYTES,
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
import './styles/hugo-stack-refactor.css'

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
  const initialNavigation = initialRoute
    ? initialEventId
      ? { route: initialRoute, eventId: initialEventId }
      : { route: initialRoute }
    : typeof window === 'undefined'
      ? { route: 'overview' as const }
      : parseH2SentinelHash(window.location.hash)
  const [workspaceState, setWorkspaceState] = useState<H2WorkspaceState>({
    status: 'loading',
    message: '正在通过注入的 H2SentinelDataSource 读取运行、事件与时间序列。',
  })
  const [commandState, setCommandState] = useState<H2CommandState>(INITIAL_H2_COMMAND_STATE)
  const [reviewState, setReviewState] = useState<H2ReviewCommandState>(INITIAL_H2_REVIEW_COMMAND_STATE)
  const [navigation, setNavigation] = useState<H2NavigationTarget>(initialNavigation)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(
    initialEventId ?? initialNavigation.eventId ?? null,
  )
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [reviewLoadAttempt, setReviewLoadAttempt] = useState(0)

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
    setReviewState(INITIAL_H2_REVIEW_COMMAND_STATE)

    void Promise.all([dataSource.getMode(), dataSource.listDatasets()])
      .then(async ([mode, datasets]) => {
        const dataset = datasets[0]
        if (!dataset) {
          if (!disposed) setWorkspaceState({ status: 'empty', mode })
          return
        }

        const workspace = await hydrateWorkspace(datasets, dataset)
        if (!disposed) {
          setWorkspaceState({ status: 'ready', workspace })
          setSelectedEventId((current) => {
            if (current && workspace.events.some(({ eventId }) => eventId === current)) {
              return current
            }
            return workspace.events.find(({ code }) => code === 'C03')?.eventId
              ?? workspace.events[0]?.eventId
              ?? null
          })
        }
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

  const activeRunId = workspaceState.status === 'ready'
    ? workspaceState.workspace.run.runId
    : null

  useEffect(() => {
    let disposed = false
    if (!activeRunId || !selectedEventId) {
      setReviewState(INITIAL_H2_REVIEW_COMMAND_STATE)
      return () => {
        disposed = true
      }
    }

    setReviewState({
      ...INITIAL_H2_REVIEW_COMMAND_STATE,
      loading: true,
    })
    void dataSource.getEventReview(activeRunId, selectedEventId)
      .then((review) => {
        if (!disposed) {
          setReviewState({
            ...INITIAL_H2_REVIEW_COMMAND_STATE,
            review,
          })
          setWorkspaceState((current) => projectReviewIntoWorkspace(current, review))
        }
      })
      .catch(() => {
        if (!disposed) {
          setReviewState({
            ...INITIAL_H2_REVIEW_COMMAND_STATE,
            error: '无法读取人工复核日志；未生成占位记录。',
          })
        }
      })

    return () => {
      disposed = true
    }
  }, [activeRunId, dataSource, reviewLoadAttempt, selectedEventId])

  useEffect(() => {
    if (!syncHash || typeof window === 'undefined') return
    const handleHashChange = (): void => {
      const target = parseH2SentinelHash(window.location.hash)
      setNavigation(target)
      if (target.eventId) setSelectedEventId(target.eventId)
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [syncHash])

  function navigate(target: H2NavigationTarget): void {
    setNavigation(target)
    if (target.eventId) setSelectedEventId(target.eventId)
    if (syncHash && typeof window !== 'undefined') {
      window.history.replaceState(null, '', toH2SentinelHash(target))
    }
  }

  async function ask(questionId: Parameters<H2SentinelDataSource['ask']>[0]['questionId']): Promise<void> {
    if (workspaceState.status !== 'ready' || commandState.pending) return
    const selectedEvent = selectedEventId
      ? workspaceState.workspace.events.find(({ eventId }) => eventId === selectedEventId) ?? null
      : null
    const requirement = getH2AssistantEventRequirement(questionId, selectedEvent)
    if (!requirement.valid) {
      setCommandState((current) => ({ ...current, error: requirement.message, notice: null }))
      return
    }

    setCommandState((current) => ({ ...current, pending: 'assistant', error: null, notice: null }))
    try {
      const request = selectedEvent
        ? { runId: workspaceState.workspace.run.runId, questionId, eventId: selectedEvent.eventId, allowLlmRendering: false }
        : { runId: workspaceState.workspace.run.runId, questionId, allowLlmRendering: false }
      const assistantAnswer = await dataSource.ask(request)
      setCommandState((current) => ({
        ...current,
        pending: null,
        assistantAnswer,
        ...(assistantAnswer.generatedReport ? { artifact: assistantAnswer.generatedReport } : {}),
      }))
    } catch {
      setCommandState((current) => ({ ...current, pending: null, error: '运行助手未能返回符合合同的确定性中文答案；没有调用外部语言模型。' }))
    }
  }

  async function exportArtifact(definition: ReportDefinition): Promise<void> {
    if (workspaceState.status !== 'ready' || commandState.pending) return
    const { run, events } = workspaceState.workspace
    const selectedEvent = selectedEventId
      ? events.find(({ eventId }) => eventId === selectedEventId)
      : undefined

    setCommandState((current) => ({ ...current, pending: definition.operation, error: null, notice: null }))
    try {
      const artifact = definition.kind === 'submission'
        ? await dataSource.exportSubmission(run.runId)
        : await dataSource.exportReport(
            createH2ReportRequest(
              definition.kind,
              run.runId,
              run.dataset.timeRange,
              selectedEvent?.eventId,
            ),
          )
      setCommandState((current) => ({ ...current, pending: null, artifact, notice: `已生成 ${artifact.descriptor.filename}` }))
    } catch (error: unknown) {
      setCommandState((current) => ({
        ...current,
        pending: null,
        error: h2ReportFailureMessage(error, definition.kind),
      }))
    }
  }

  async function reviewEvent(draft: H2ReviewDraft): Promise<void> {
    if (
      workspaceState.status !== 'ready' ||
      !selectedEventId ||
      !reviewState.review ||
      reviewState.pending
    ) return
    const validation = validateH2ReviewDraft(draft)
    if (!validation.valid) {
      setReviewState((current) => ({ ...current, error: validation.message, notice: null }))
      return
    }

    setReviewState((current) => ({ ...current, pending: draft.action, error: null, notice: null }))
    try {
      const receipt = await dataSource.reviewEvent({
        schemaVersion: 1,
        requestId: createH2ReviewRequestId(),
        runId: workspaceState.workspace.run.runId,
        eventId: selectedEventId,
        action: draft.action,
        expectedRevision: reviewState.review.revision,
        actor: validation.actor,
        ...(validation.note === undefined ? {} : { note: validation.note }),
      })
      setReviewState({
        ...INITIAL_H2_REVIEW_COMMAND_STATE,
        review: receipt.review,
        notice: receipt.replayed
          ? '该复核请求已处理，本次返回原始记录，没有重复追加。'
          : `已保存修订 ${receipt.review.revision}。`,
      })
      setWorkspaceState((current) => projectReviewIntoWorkspace(current, receipt.review))
    } catch (error: unknown) {
      if (isH2ReviewConflict(error)) {
        await reloadReviewAfterConflict()
        return
      }
      setReviewState((current) => ({
        ...current,
        pending: null,
        error: h2ReviewFailureMessage(error),
      }))
    }
  }

  async function reloadReviewAfterConflict(): Promise<void> {
    if (workspaceState.status !== 'ready' || !selectedEventId) return
    try {
      const review = await dataSource.getEventReview(
        workspaceState.workspace.run.runId,
        selectedEventId,
      )
      setReviewState({
        ...INITIAL_H2_REVIEW_COMMAND_STATE,
        review,
        notice: '检测到并发修订冲突，已重新加载最新状态；未覆盖其他操作人的记录。',
      })
      setWorkspaceState((current) => projectReviewIntoWorkspace(current, review))
    } catch {
      setReviewState((current) => ({
        ...current,
        pending: null,
        error: '检测到修订冲突，但最新日志加载失败；没有覆盖或重试写入。',
      }))
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
      setSelectedEventId(
        workspace.events.find(({ code }) => code === 'C03')?.eventId
          ?? workspace.events[0]?.eventId
          ?? null,
      )
      setCommandState({
        ...INITIAL_H2_COMMAND_STATE,
        notice: `已导入 ${workspace.run.dataset.name}；质量状态：${qualityStatus}。`,
      })
    } catch (error) {
      const message = error instanceof H2CsvInputError
        ? error.code === 'too_large'
          ? `CSV 超过 ${H2_CSV_MAX_BYTES / (1024 * 1024)} MiB 上限；未开始导入。`
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
      onReloadReview={() => setReviewLoadAttempt((attempt) => attempt + 1)}
      onRetry={() => setLoadAttempt((attempt) => attempt + 1)}
      onReview={(draft) => void reviewEvent(draft)}
      onSelectEvent={setSelectedEventId}
      reviewState={reviewState}
      selectedEventId={selectedEventId}
      workspaceState={workspaceState}
    />
  )
}

function projectReviewIntoWorkspace(
  state: H2WorkspaceState,
  review: H2EventReview,
): H2WorkspaceState {
  if (state.status !== 'ready' || state.workspace.run.runId !== review.runId) return state
  const events = state.workspace.events.map((event) =>
    event.eventId === review.eventId
      ? { ...event, reviewState: review.currentState }
      : event,
  )
  return {
    status: 'ready',
    workspace: {
      ...state.workspace,
      events,
      run: { ...state.workspace.run, events },
    },
  }
}

function h2ReportFailureMessage(
  error: unknown,
  kind: ReportDefinition['kind'],
): string {
  const codes = readH2ErrorCodes(error)
  if (
    kind === 'validation_metrics' &&
    codes.includes('report.metrics_unavailable')
  ) {
    return '未加载公开标签、数据切分或匹配定义，未生成验证指标；没有用零值替代。'
  }
  if (codes.includes('report.invalid_scope') || codes.includes('report_invalid_scope')) {
    return '报告范围与类型不匹配；没有生成替代文件。'
  }
  if (codes.includes('report.evidence_unavailable')) {
    return '所选范围缺少生成该报告所需的证据；没有补造内容。'
  }
  return '导出失败；没有写入未知路径，也没有生成替代内容。'
}

function readH2ErrorCodes(error: unknown): readonly string[] {
  if (typeof error !== 'object' || error === null) return []
  const codes: string[] = []
  if ('code' in error && typeof error.code === 'string') codes.push(error.code)
  if ('remoteCode' in error && typeof error.remoteCode === 'string') codes.push(error.remoteCode)
  return codes
}

function downloadArtifact(artifact: H2ReportArtifact): void {
  const mediaType = artifact.mediaType.startsWith('text/') || artifact.mediaType === 'application/json'
    ? `${artifact.mediaType};charset=utf-8`
    : artifact.mediaType
  const objectUrl = URL.createObjectURL(new Blob([artifact.content], { type: mediaType }))
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = artifact.descriptor.filename
  document.body.append(anchor)
  try {
    anchor.click()
  } finally {
    anchor.remove()
    globalThis.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
  }
}
