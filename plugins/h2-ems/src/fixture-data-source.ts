import {
  H2_ASSISTANT_QUESTIONS,
  H2_REVIEW_ACTIONS,
  H2_FIXTURE_ANALYSIS_RUN,
  H2_FIXTURE_DATASET,
  H2_FIXTURE_QUALITY_REPORT,
  H2_FIXTURE_REPORT_DESCRIPTOR,
  H2_FIXTURE_PROVENANCE,
  H2_GOLDEN_C03_EVENT,
  H2_GOLDEN_C04_EVENT,
  nextH2ReviewState,
  serializeH2SubmissionRows,
  toH2SubmissionRow,
  type H2AnalysisRun,
  type H2AnomalyEvent,
  type H2AssistantAnswer,
  type H2AssistantCitation,
  type H2AssistantQuestionId,
  type H2AssistantRequest,
  type H2CsvImportRequest,
  type H2CsvImportResult,
  type H2EventFilter,
  type H2EventReview,
  type H2ReportArtifact,
  type H2ReportFormat,
  type H2ReportKind,
  type H2ReportMediaType,
  type H2ReportRequest,
  type H2ReviewAction,
  type H2ReviewAuditExport,
  type H2ReviewEntry,
  type H2ReviewEventRequest,
  type H2ReviewMutationReceipt,
  type H2ReviewState,
  type H2SentinelDataSource,
  type H2SeriesRequest,
  type H2SeriesPoint,
  type H2SeriesResponse,
  type H2TimeRange,
} from '@opendashboard/h2-contracts'

import { H2EmsAdapterError } from './errors.ts'
import { sha256 } from './sha256.ts'

const fixtureEvents = [H2_GOLDEN_C03_EVENT, H2_GOLDEN_C04_EVENT] as const

type FixtureReportProfile = Readonly<{
  format: H2ReportFormat
  mediaType: H2ReportMediaType
  filename: string
  title: string
}>

const fixtureReportProfiles = {
  single_event_diagnosis: {
    format: 'html',
    mediaType: 'text/html',
    filename: 'single_event_diagnosis-run-fixture-h2-sentinel-golden.html',
    title: '氢哨异常诊断报告',
  },
  period_summary: {
    format: 'html',
    mediaType: 'text/html',
    filename: 'period_summary-run-fixture-h2-sentinel-golden.html',
    title: '氢哨运行摘要',
  },
  pcc_daily_compliance: {
    format: 'html',
    mediaType: 'text/html',
    filename: 'pcc_daily_compliance-run-fixture-h2-sentinel-golden.html',
    title: 'PCC合规日报',
  },
  analysis_result_json: {
    format: 'json',
    mediaType: 'application/json',
    filename: 'analysis_result_json-run-fixture-h2-sentinel-golden.json',
    title: '结构化分析结果',
  },
  submission_csv: {
    format: 'csv',
    mediaType: 'text/csv',
    filename: 'submission_csv-run-fixture-h2-sentinel-golden.csv',
    title: '竞赛提交结果',
  },
  validation_metrics: {
    format: 'json',
    mediaType: 'application/json',
    filename: 'validation_metrics-run-fixture-h2-sentinel-golden.json',
    title: '验证指标',
  },
  quality_report: {
    format: 'html',
    mediaType: 'text/html',
    filename: 'quality_report-run-fixture-h2-sentinel-golden.html',
    title: '氢哨数据质量报告',
  },
  review_audit_json: {
    format: 'json',
    mediaType: 'application/json',
    filename: 'review-audit-run-fixture-h2-sentinel-golden.json',
    title: '人工复核审计',
  },
} as const satisfies Readonly<Record<H2ReportKind, FixtureReportProfile>>

const fixtureSubmissionExportProfile = {
  format: 'csv',
  mediaType: 'text/csv',
  filename: 'h2-fixture-submission.csv',
  title: 'Submission CSV',
} as const satisfies FixtureReportProfile

const fixtureReviewStates = [
  'open',
  'confirmed',
  'dismissed',
  'resolved',
] as const satisfies readonly H2ReviewState[]

const fixtureReviewStateLabels = {
  open: '待复核',
  confirmed: '已确认',
  dismissed: '已驳回',
  resolved: '已闭环',
} as const satisfies Readonly<Record<H2ReviewState, string>>

const fixtureReviewActionLabels = {
  confirm: '确认事件',
  reject: '驳回事件',
  resolve: '记录闭环',
  reopen: '重新打开',
  add_note: '添加备注',
} as const satisfies Readonly<Record<H2ReviewAction, string>>

const fixtureTextZh: Readonly<Record<string, string>> = {
  'Synthetic, sanitized C03/C04 contract fixture only.': '仅包含合成、脱敏的 C03/C04 合同固定样例。',
  'Not an official competition dataset or score artifact.': '不是官方竞赛数据集或成绩产物。',
  'Battery energy storage system': '电池储能系统',
  'Point of common coupling': '并网点',
  'Grid interconnection': '电网连接点',
  'The EMS command requested BESS charging.': 'EMS 指令要求储能充电。',
  'Positive BESS power indicates discharge, opposite to the charge command.': '储能功率为正表示放电，与充电指令方向相反。',
  'The reversed BESS response is associated with abnormal grid exchange.': '储能反向响应与异常并网交换同时出现。',
  'PCC export power exceeds the active export limit.': 'PCC 送电功率超过当前生效的送电上限。',
  'The configured export boundary is active for this interval.': '配置的送电边界在该区间内生效。',
  'Export-limit violation energy is integrated over the highlighted interval.': '送电越限电量在标记区间内积分得到。',
  'Likely BESS command/feedback sign mapping mismatch; this is an inference from fixture evidence, not a direct equipment-control finding.': '可能存在储能指令与反馈的符号映射不一致；这是基于固定样例证据的推断。',
  'Likely PCC boundary synchronization or tracking issue; the fixture supports a compliance-oriented check, not a direct control action.': '可能存在 PCC 边界同步或跟踪问题；固定样例只支持合规核查，不支持直接控制。',
  'Minute-level samples are integrated as average power over one minute.': '分钟级采样按一分钟平均功率积分。',
  'PCC power uses positive export and negative import convention.': 'PCC 功率采用正值送电、负值受电约定。',
  'Only positive export excess contributes to this fixture event.': '该固定样例事件只累计正向送电超限部分。',
  'BESS sign convention confirmed': '已确认储能功率符号约定',
  'Positive BESS power is interpreted as discharge.': '储能功率正值按放电解释。',
  'SOC remains inside configured range': 'SOC 保持在配置范围内',
  'Fixture SOC remains between 20% and 90%.': '固定样例 SOC 保持在 20% 至 90% 之间。',
  'PCC sign convention confirmed': '已确认 PCC 功率符号约定',
  'Positive PCC power is interpreted as export to the grid.': 'PCC 功率正值按向电网送电解释。',
  'Recommendation is advisory only': '建议仅供决策支持',
  'The fixture produces checks, not automatic setpoint changes.': '固定样例只生成核查建议，不自动改变设定值。',
  'Verify BESS command and feedback sign mapping before changing dispatch.': '改变调度前，核查储能指令与反馈的符号映射。',
  'The contract separates a likely interface mapping issue from a proven equipment fault.': '合同明确区分可能的接口映射问题与已证实的设备故障。',
  'Inspect PCC boundary synchronization and meter feedback before any dispatch change.': '任何调度变更前，检查 PCC 边界同步与电表反馈。',
  'The event proves a boundary-tracking violation but does not authorize automatic control.': '事件证明存在边界跟踪异常，但不授予自动控制权限。',
  'Required fixture fields are present.': '固定样例必需字段均已提供。',
}

/** Bundled sanitized rows keep Fixture charts usable without filesystem access. */
const fixtureSeries = [
  ['2026-01-05T10:20:00Z', 820, 230, 590, 500, 140, 55, 500, 450, -240],
  ['2026-01-05T10:21:00Z', 815, 230, 590, 505, 135, 55.2, 500, 450, -240],
  ['2026-01-05T10:22:00Z', 810, 230, 590, 500, 140, 55.4, 500, 450, -240],
  ['2026-01-05T10:23:00Z', 805, 230, 590, 500, 145, 55.6, 500, 450, -240],
  ['2026-01-05T10:24:00Z', 800, 230, 590, 500, 140, 55.8, 500, 450, -240],
  ['2026-01-05T10:25:00Z', 798, 230, 590, 500, 138, 56, 500, 450, -240],
  ['2026-01-05T10:26:00Z', 796, 230, 590, 500, 136, 56.2, 500, 450, -240],
  ['2026-01-05T10:27:00Z', 794, 230, 590, 500, 134, 56.4, 500, 450, -240],
  ['2026-01-05T10:28:00Z', 792, 230, 590, 500, 132, 56.6, 500, 450, -240],
  ['2026-01-05T10:29:00Z', 790, 230, 590, 500, 130, 56.8, 500, 450, -240],
  ['2026-01-05T10:30:00Z', 788, 230, 590, 500, 128, 57, 500, 450, -240],
  ['2026-01-05T10:31:00Z', 786, 230, 590, 500, 126, 57.2, 500, 450, -240],
  ['2026-01-05T10:32:00Z', 784, 230, 720, 500, 124, 57.4, 500, 450, -240],
  ['2026-01-05T10:33:00Z', 782, 230, 720, 500, 122, 57.6, 500, 450, -240],
  ['2026-01-05T10:34:00Z', 780, 230, 720, 500, 120, 57.8, 500, 450, -240],
  ['2026-01-05T10:35:00Z', 778, 230, 720, 500, 118, 58, 500, 450, -240],
  ['2026-01-05T10:36:00Z', 776, 230, 720, 500, 116, 58.2, 500, 450, -240],
  ['2026-01-05T10:37:00Z', 774, 230, 720, 500, 114, 58.4, 500, 450, -240],
  ['2026-01-05T10:38:00Z', 772, 230, 720, 500, 112, 58.6, 500, 450, -240],
  ['2026-01-05T10:39:00Z', 770, 230, 720, 500, 110, 58.8, 500, 450, -240],
  ['2026-01-05T10:40:00Z', 768, 230, 590, 500, 108, 59, 500, 450, -240],
  ['2026-01-05T10:41:00Z', 766, 230, 590, 500, 106, 59.2, 500, 450, -240],
] as const

/**
 * C-P0-2 六要素 KPI 扩展列：与 fixtureSeries 行序一一对应，不动既有 10 列。
 * 列含义 [elz1P, elz2P, elz3P, elz1S, elz2S, elz3S, expUsed, expQuota, impUsed, impQuota]：
 * - 电解槽分配 ELZ01 运行 500（≥ 单台稳定下限 300，见 constraints.json）、ELZ02/03 待机 0，三台和=既有总量 500 恒定；
 * - 配额口径来自官方 CSV 实测（train=validation 一致）：上网 5200.0 / 下网 24500.0 kWh/day；
 * - expUsed 为当日累计上网电量合成序列（按当分钟 PCC 功率/60 递推：590 段 +9.833/min、720 段 +12/min）；
 * - impUsed=0（fixture PCC 恒为正=纯上网场景）。
 */
const fixtureKpiExtension = [
  [500, 0, 0, 2, 1, 1, 830.0, 5200.0, 0, 24500.0],
  [500, 0, 0, 2, 1, 1, 839.8, 5200.0, 0, 24500.0],
  [500, 0, 0, 2, 1, 1, 849.6, 5200.0, 0, 24500.0],
  [500, 0, 0, 2, 1, 1, 859.5, 5200.0, 0, 24500.0],
  [500, 0, 0, 2, 1, 1, 869.3, 5200.0, 0, 24500.0],
  [500, 0, 0, 2, 1, 1, 879.1, 5200.0, 0, 24500.0],
  [500, 0, 0, 2, 1, 1, 889.0, 5200.0, 0, 24500.0],
  [500, 0, 0, 2, 1, 1, 898.8, 5200.0, 0, 24500.0],
  [500, 0, 0, 2, 1, 1, 908.6, 5200.0, 0, 24500.0],
  [500, 0, 0, 2, 1, 1, 918.5, 5200.0, 0, 24500.0],
  [500, 0, 0, 2, 1, 1, 928.3, 5200.0, 0, 24500.0],
  [500, 0, 0, 2, 1, 1, 938.1, 5200.0, 0, 24500.0],
  [500, 0, 0, 2, 1, 1, 950.1, 5200.0, 0, 24500.0],
  [500, 0, 0, 2, 1, 1, 962.1, 5200.0, 0, 24500.0],
  [500, 0, 0, 2, 1, 1, 974.1, 5200.0, 0, 24500.0],
  [500, 0, 0, 2, 1, 1, 986.1, 5200.0, 0, 24500.0],
  [500, 0, 0, 2, 1, 1, 998.1, 5200.0, 0, 24500.0],
  [500, 0, 0, 2, 1, 1, 1010.1, 5200.0, 0, 24500.0],
  [500, 0, 0, 2, 1, 1, 1022.1, 5200.0, 0, 24500.0],
  [500, 0, 0, 2, 1, 1, 1034.1, 5200.0, 0, 24500.0],
  [500, 0, 0, 2, 1, 1, 1044.0, 5200.0, 0, 24500.0],
  [500, 0, 0, 2, 1, 1, 1053.8, 5200.0, 0, 24500.0],
] as const

const fixtureSeriesVariableSources = {
  pv_forecast_kw: 'pv_forecast_kw',
  pv_actual_kw: 'pv_actual_kw',
  bess_power_actual_kw: 'bess_power_kw',
  bess_power_kw: 'bess_power_kw',
  pcc_power_actual_kw: 'pcc_power_kw',
  pcc_power_kw: 'pcc_power_kw',
  total_electrolyzer_power_kw: 'total_electrolyzer_power_kw',
  aux_load_kw: 'auxiliary_load_kw',
  auxiliary_load_kw: 'auxiliary_load_kw',
  soc_target_pct: 'soc_target_pct',
  bess_soc_pct: 'bess_soc_percent',
  bess_soc_percent: 'bess_soc_percent',
  grid_export_power_limit_kw: 'pcc_export_limit_kw',
  pcc_export_limit_kw: 'pcc_export_limit_kw',
  grid_import_power_limit_kw: 'pcc_import_limit_kw',
  pcc_import_limit_kw: 'pcc_import_limit_kw',
  bess_power_cmd_kw: 'bess_dispatch_command_kw',
  bess_dispatch_command_kw: 'bess_dispatch_command_kw',
  // C-P0-2 六要素 KPI 扩展：官方字段名（口径与数值来源见 fixtureKpiExtension 注释）
  elz1_power_actual_kw: 'elz1_power_actual_kw',
  elz2_power_actual_kw: 'elz2_power_actual_kw',
  elz3_power_actual_kw: 'elz3_power_actual_kw',
  elz1_run_state: 'elz1_run_state',
  elz2_run_state: 'elz2_run_state',
  elz3_run_state: 'elz3_run_state',
  grid_export_energy_used_kwh_day: 'grid_export_energy_used_kwh_day',
  grid_export_energy_quota_kwh_day: 'grid_export_energy_quota_kwh_day',
  grid_import_energy_used_kwh_day: 'grid_import_energy_used_kwh_day',
  grid_import_energy_quota_kwh_day: 'grid_import_energy_quota_kwh_day',
} as const

type FixtureSeriesVariable = keyof typeof fixtureSeriesVariableSources

const fixturePoints: readonly H2SeriesPoint[] = fixtureSeries.map(
  ([
      timestamp,
      pvActual,
      bessPower,
      pccPower,
      electrolyzerPower,
      auxiliaryLoad,
      bessSoc,
      exportLimit,
      importLimit,
      bessCommand,
    ],
    index,
  ) => {
    // C-P0-2：按行序对齐解包 KPI 扩展列（见 fixtureKpiExtension 注释）
    const [
      elz1Power,
      elz2Power,
      elz3Power,
      elz1State,
      elz2State,
      elz3State,
      exportUsed,
      exportQuota,
      importUsed,
      importQuota,
    ] = fixtureKpiExtension[index] ?? [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    return {
      timestamp,
      values: {
        pv_forecast_kw: 1900,
        pv_actual_kw: pvActual,
        bess_power_kw: bessPower,
        pcc_power_kw: pccPower,
        total_electrolyzer_power_kw: electrolyzerPower,
        auxiliary_load_kw: auxiliaryLoad,
        soc_target_pct: 55,
        bess_soc_percent: bessSoc,
        pcc_export_limit_kw: exportLimit,
        pcc_import_limit_kw: importLimit,
        bess_dispatch_command_kw: bessCommand,
        // C-P0-2 六要素 KPI 扩展：官方字段名作为值键（同名源键直映射）
        elz1_power_actual_kw: elz1Power,
        elz2_power_actual_kw: elz2Power,
        elz3_power_actual_kw: elz3Power,
        elz1_run_state: elz1State,
        elz2_run_state: elz2State,
        elz3_run_state: elz3State,
        grid_export_energy_used_kwh_day: exportUsed,
        grid_export_energy_quota_kwh_day: exportQuota,
        grid_import_energy_used_kwh_day: importUsed,
        grid_import_energy_quota_kwh_day: importQuota,
      },
    }
  },
)

/**
 * Provides only immutable, sanitized contract fixtures. It deliberately does
 * not accept CSV input so a Fixture session cannot be mistaken for analysis.
 */
export function createFixtureH2EmsDataSource(): H2SentinelDataSource {
  const reviews = new Map<string, H2EventReview>()
  const requests = new Map<string, FixtureReviewReplay>()

  return {
    async getMode() {
      return 'FIXTURE'
    },
    async listDatasets() {
      return [H2_FIXTURE_DATASET]
    },
    async importCsv(request: H2CsvImportRequest): Promise<H2CsvImportResult> {
      if (request.filename.length === 0 || request.text.length === 0) {
        throw new H2EmsAdapterError('invalid_fixture_request', false)
      }
      throw new H2EmsAdapterError('fixture_import_disabled', false)
    },
    async getDataQuality(datasetId) {
      assertFixtureDataset(datasetId)
      return H2_FIXTURE_QUALITY_REPORT
    },
    async runAnalysis(datasetId) {
      assertFixtureDataset(datasetId)
      return projectFixtureRun(reviews)
    },
    async getOverview(runId) {
      assertFixtureRun(runId)
      return projectFixtureRun(reviews)
    },
    async listEvents(runId, filter) {
      assertFixtureRun(runId)
      return projectFixtureEvents(reviews).filter((event) => matchesFilter(event, filter))
    },
    async getEvent(runId, eventId) {
      assertFixtureRun(runId)
      const event = projectFixtureEvents(reviews).find((item) => item.eventId === eventId)
      if (!event) throw new H2EmsAdapterError('invalid_fixture_request', false)
      return event
    },
    async getEventReview(runId, eventId) {
      assertFixtureRun(runId)
      assertFixtureEvent(eventId)
      return getFixtureReview(reviews, eventId)
    },
    async reviewEvent(request) {
      assertFixtureRun(request.runId)
      assertFixtureEvent(request.eventId)
      return applyFixtureReview(reviews, requests, request)
    },
    async getSeries(request) {
      assertFixtureRun(request.runId)
      return createFixtureSeries(request)
    },
    async ask(request) {
      assertFixtureAssistantRequest(request)
      return createFixtureAssistantAnswer(request, reviews)
    },
    async exportReport(request) {
      assertFixtureRun(request.runId)
      return createFixtureReport(request, reviews)
    },
    async exportSubmission(runId) {
      assertFixtureRun(runId)
      const content = serializeH2SubmissionRows(
        fixtureEvents.map((event) => toH2SubmissionRow(event)),
      )
      return createArtifact('submission_csv', fixtureSubmissionExportProfile, content)
    },
  }
}

interface FixtureReviewReplay {
  readonly signature: string
  readonly receipt: H2ReviewMutationReceipt
}

function assertFixtureEvent(eventId: string): void {
  if (!fixtureEvents.some((event) => event.eventId === eventId)) {
    throw new H2EmsAdapterError('invalid_fixture_request', false)
  }
}

function getFixtureReview(
  reviews: Map<string, H2EventReview>,
  eventId: string,
): H2EventReview {
  const existing = reviews.get(eventId)
  if (existing) return snapshotReview(existing)

  const review = {
    schemaVersion: 1,
    reviewId: `review-${H2_FIXTURE_ANALYSIS_RUN.runId}-${eventId}`,
    runId: H2_FIXTURE_ANALYSIS_RUN.runId,
    eventId,
    initialState: 'open',
    currentState: 'open',
    revision: 0,
    entries: [],
    provenance: H2_FIXTURE_PROVENANCE,
  } as const satisfies H2EventReview
  reviews.set(eventId, review)
  return snapshotReview(review)
}

function applyFixtureReview(
  reviews: Map<string, H2EventReview>,
  requests: Map<string, FixtureReviewReplay>,
  input: H2ReviewEventRequest,
): H2ReviewMutationReceipt {
  validateFixtureReviewRequest(input)
  const signature = JSON.stringify({
    schemaVersion: input.schemaVersion,
    requestId: input.requestId,
    runId: input.runId,
    eventId: input.eventId,
    action: input.action,
    expectedRevision: input.expectedRevision,
    actor: {
      kind: input.actor.kind,
      displayName: input.actor.displayName,
    },
    ...(input.note === undefined ? {} : { note: input.note }),
  })
  const replay = requests.get(input.requestId)
  if (replay) {
    if (replay.signature !== signature) {
      throw new H2EmsAdapterError(
        'review_idempotency_conflict',
        false,
        'review.idempotency_conflict',
      )
    }
    return snapshotReceipt(replay.receipt, true)
  }

  const current = getFixtureReview(reviews, input.eventId)
  if (input.expectedRevision !== current.revision) {
    throw new H2EmsAdapterError('review_conflict', false, 'review.conflict')
  }

  let nextState: H2ReviewState
  try {
    nextState = nextH2ReviewState(current.currentState, input.action)
  } catch {
    throw new H2EmsAdapterError(
      'review_invalid_transition',
      false,
      'review.invalid_transition',
    )
  }

  const revision = current.revision + 1
  const entry: H2ReviewEntry = {
    schemaVersion: 1,
    entryId: `${current.reviewId}-entry-${revision}`,
    requestId: input.requestId,
    revision,
    action: input.action,
    previousState: current.currentState,
    nextState,
    ...(input.note === undefined ? {} : { note: input.note }),
    actor: { ...input.actor },
    createdAt: new Date().toISOString(),
  }
  const review: H2EventReview = {
    ...current,
    currentState: nextState,
    revision,
    entries: [...current.entries, entry],
  }
  reviews.set(input.eventId, review)

  const receipt: H2ReviewMutationReceipt = {
    schemaVersion: 1,
    replayed: false,
    entry: snapshotEntry(entry),
    review: snapshotReview(review),
  }
  requests.set(input.requestId, { signature, receipt: snapshotReceipt(receipt, false) })
  return snapshotReceipt(receipt, false)
}

function validateFixtureReviewRequest(input: H2ReviewEventRequest): void {
  if (
    !hasExactKeys(
      input,
      [
        'schemaVersion',
        'requestId',
        'runId',
        'eventId',
        'action',
        'expectedRevision',
        'actor',
      ],
      ['note'],
    ) ||
    !hasExactKeys(input.actor, ['kind', 'displayName']) ||
    input.schemaVersion !== 1 ||
    input.runId !== H2_FIXTURE_ANALYSIS_RUN.runId ||
    !isFixtureRequestId(input.requestId) ||
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0 ||
    input.actor.kind !== 'local_operator' ||
    !H2_REVIEW_ACTIONS.some((action) => action === input.action) ||
    !isFixtureActorName(input.actor.displayName) ||
    (input.note !== undefined && !isFixtureNote(input.note))
  ) {
    throw new H2EmsAdapterError('invalid_fixture_request', false, 'request.invalid')
  }
  if (reviewActionRequiresNote(input.action) && !input.note) {
    throw new H2EmsAdapterError(
      'review_note_required',
      false,
      'review.note_required',
    )
  }
}

function hasExactKeys(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const allowed = new Set([...required, ...optional])
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  )
}

function isFixtureRequestId(value: string): boolean {
  return value.trim() === value && /^[\x20-\x7e]{1,128}$/u.test(value)
}

function isFixtureActorName(value: string): boolean {
  return (
    value.trim() === value &&
    value.length > 0 &&
    Array.from(value).length <= 64 &&
    !/[\u0000-\u001f\u007f]/u.test(value)
  )
}

function isFixtureNote(value: string): boolean {
  return (
    value.trim() === value &&
    value.length > 0 &&
    Array.from(value).length <= 2_000 &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
  )
}

function reviewActionRequiresNote(action: H2ReviewAction): boolean {
  return action !== 'confirm'
}

function snapshotEntry(entry: H2ReviewEntry): H2ReviewEntry {
  return { ...entry, actor: { ...entry.actor } }
}

function snapshotReview(review: H2EventReview): H2EventReview {
  return {
    ...review,
    entries: review.entries.map(snapshotEntry),
  }
}

function snapshotReceipt(
  receipt: H2ReviewMutationReceipt,
  replayed: boolean,
): H2ReviewMutationReceipt {
  return {
    ...receipt,
    replayed,
    entry: snapshotEntry(receipt.entry),
    review: snapshotReview(receipt.review),
  }
}

function projectFixtureEvents(
  reviews: Map<string, H2EventReview>,
): readonly H2AnomalyEvent[] {
  return fixtureEvents.map((event) => ({
    ...event,
    reviewState: getFixtureReview(reviews, event.eventId).currentState,
  }))
}

function projectFixtureRun(reviews: Map<string, H2EventReview>): H2AnalysisRun {
  return {
    ...H2_FIXTURE_ANALYSIS_RUN,
    events: projectFixtureEvents(reviews),
  }
}

function assertFixtureDataset(datasetId: string): void {
  if (datasetId !== H2_FIXTURE_DATASET.datasetId) {
    throw new H2EmsAdapterError('invalid_fixture_request', false)
  }
}

function assertFixtureRun(runId: string): void {
  if (runId !== H2_FIXTURE_ANALYSIS_RUN.runId) {
    throw new H2EmsAdapterError('invalid_fixture_request', false)
  }
}

function assertFixtureAssistantRequest(request: H2AssistantRequest): void {
  assertFixtureRun(request.runId)
  if (!H2_ASSISTANT_QUESTIONS.some(({ questionId }) => questionId === request.questionId)) {
    throw new H2EmsAdapterError('invalid_fixture_request', false)
  }
  const event = request.eventId
    ? fixtureEvents.find((candidate) => candidate.eventId === request.eventId)
    : undefined
  if (request.eventId && !event) {
    throw new H2EmsAdapterError('invalid_fixture_request', false, 'assistant.event_not_found')
  }
  if ((request.questionId === 'Q03' || request.questionId === 'Q09') && !event) {
    throw new H2EmsAdapterError(
      'assistant_event_required',
      false,
      'assistant.event_required',
    )
  }
  const allowedCodes = fixtureAssistantEventCodes[request.questionId]
  if (
    event &&
    allowedCodes &&
    !allowedCodes.some((code: H2AnomalyEvent['code']) => code === event.code)
  ) {
    throw new H2EmsAdapterError(
      'assistant_event_mismatch',
      false,
      'assistant.event_mismatch',
    )
  }
}

const fixtureAssistantEventCodes = {
  Q01: undefined,
  Q02: ['C04', 'C05'],
  Q03: ['C03'],
  Q04: ['C07'],
  Q05: ['C02'],
  Q06: ['C01'],
  Q07: ['C06'],
  Q08: undefined,
  Q09: undefined,
  Q10: ['C04', 'C05'],
} as const satisfies Readonly<
  Record<H2AssistantQuestionId, readonly H2AnomalyEvent['code'][] | undefined>
>

const fixtureAssistantTemplates = {
  Q01: {
    claimKind: 'fact',
    text: 'PCC 功率为正表示向电网送电，为负表示从电网受电；这与储能功率正值表示放电、负值表示充电的约定不同。',
  },
  Q02: {
    claimKind: 'fact',
    text: 'PCC 功率越限比较瞬时功率与动态进出线边界，单位为 kW；电量配额异常累计一个自然日的进出线电量并与配额比较，单位为 kWh。C04 对应功率边界，C05 对应日累计电量风险。',
  },
  Q03: {
    claimKind: 'inference',
    text: '所选 C03 事件显示储能充放电指令与实际方向相反，并与 PCC 功率变化同时出现；这支持检查符号映射和反馈链路，但不足以单独证明设备故障因果。',
  },
  Q04: {
    claimKind: 'calculation',
    text: 'SOC 调节备用需要同时比较实际与目标 SOC、充放电功率余量、可用能量容量和目标时间窗；该判断用于提前预警，不等同于已经发生越限。当前 Fixture 未包含完整 C07 事件，因此不生成具体余量数值。',
  },
  Q05: {
    claimKind: 'inference',
    text: '定位设备降额未同步，应在同一时间窗比较设备可用容量、EMS 容量模型和已下发设定值，再确认受影响设备；当前 Fixture 没有 C02 事件，不能虚构降额对象或幅度。',
  },
  Q06: {
    claimKind: 'inference',
    text: '区分云团变化与控制指令振荡，需要对齐光伏或天气变化、电解槽指令周期性及多设备响应时序；单个告警或单个采样点不足以下结论。当前 Fixture 不包含 C01 事件。',
  },
  Q07: {
    claimKind: 'calculation',
    text: '多台电解槽负荷分配应比较单机上下限、稳定区间、爬坡、启停和效率曲线对应的能耗基线；现有合同没有电解槽健康分数，当前 Fixture 也不提供 C06 事件。',
  },
  Q08: {
    claimKind: 'recommendation',
    text: '所有运行建议都只是决策支持，检查、监视、升级处置和报告类建议在执行前都必须由人员确认；运行助手不具备设备控制权限。',
  },
  Q10: {
    claimKind: 'fact',
    text: 'PCC 合规日报包含实际功率与动态上下限、越限区间和持续时间、越限电量、日累计进出线电量与配额、C04/C05 事件及复核状态、数据质量、来源和安全声明。缺少配额证据时应明确不计算结论。',
  },
} as const satisfies Readonly<
  Record<Exclude<H2AssistantQuestionId, 'Q09'>, {
    readonly claimKind: H2AssistantCitation['claimKind']
    readonly text: string
  }>
>

async function createFixtureAssistantAnswer(
  request: H2AssistantRequest,
  reviews: Map<string, H2EventReview>,
): Promise<H2AssistantAnswer> {
  const event = request.eventId
    ? projectFixtureEvents(reviews).find((candidate) => candidate.eventId === request.eventId)
    : undefined

  if (request.questionId === 'Q09') {
    const eventId = request.eventId
    if (!eventId || !event) {
      throw new H2EmsAdapterError(
        'assistant_event_required',
        false,
        'assistant.event_required',
      )
    }
    const firstEvidence = event.evidence[0]
    if (!firstEvidence) {
      throw new H2EmsAdapterError(
        'invalid_fixture_request',
        false,
        'assistant.evidence_unavailable',
      )
    }
    const generatedReport = await createFixtureReport(
      {
        runId: request.runId,
        kind: 'single_event_diagnosis',
        eventId,
      },
      reviews,
    )
    const citation: H2AssistantCitation = {
      citationId: `citation-report-${generatedReport.descriptor.reportId}`,
      claimKind: 'fact',
      sourceType: 'report',
      sourceId: generatedReport.descriptor.reportId,
      eventId,
    }
    const evidenceCitation: H2AssistantCitation = {
      citationId: `citation-evidence-${firstEvidence.evidenceId}`,
      claimKind: 'fact',
      sourceType: 'evidence',
      sourceId: firstEvidence.evidenceId,
      eventId,
    }
    return {
      schemaVersion: 1,
      answerId: `answer-Q09-${eventId}`,
      runId: request.runId,
      questionId: 'Q09',
      mode: 'DETERMINISTIC_TEMPLATE',
      generatedAt: H2_FIXTURE_PROVENANCE.generatedAt,
      eventId,
      sections: [
        {
          sectionId: 'selected_event_evidence',
          claimKind: 'fact',
          text: `报告范围绑定当前运行中的所选事件 ${eventId}，并保留该事件的结构化证据链。`,
          citationIds: [evidenceCitation.citationId],
        },
        {
          sectionId: 'generated_diagnosis_report',
          claimKind: 'fact',
          text: `已生成中文单事件诊断报告。该报告来自 FIXTURE 固定样例，不是测试集结果、隐藏标签或官方得分。`,
          citationIds: [citation.citationId],
        },
      ],
      citations: [evidenceCitation, citation],
      generatedReport,
      refusedControlClaim: true,
      provenance: H2_FIXTURE_PROVENANCE,
    }
  }

  const template = fixtureAssistantTemplates[request.questionId]
  const citations: readonly H2AssistantCitation[] = event
    ? event.evidence.map((item) => ({
        citationId: `citation-evidence-${item.evidenceId}`,
        claimKind: template.claimKind,
        sourceType: 'evidence',
        sourceId: item.evidenceId,
        eventId: event.eventId,
      }))
    : [{
        citationId: `citation-knowledge-${request.questionId}`,
        claimKind: template.claimKind,
        sourceType: 'knowledge_base',
        sourceId: `official-question-${request.questionId}`,
      }]

  return {
    schemaVersion: 1,
    answerId: `answer-${request.questionId}-${event?.eventId ?? 'run'}`,
    runId: request.runId,
    questionId: request.questionId,
    mode: 'DETERMINISTIC_TEMPLATE',
    generatedAt: H2_FIXTURE_PROVENANCE.generatedAt,
    ...(event ? { eventId: event.eventId } : {}),
    sections: [{
      sectionId: `answer-${request.questionId.toLowerCase()}`,
      claimKind: template.claimKind,
      text: template.text,
      citationIds: citations.map(({ citationId }) => citationId),
    }],
    citations,
    refusedControlClaim: true,
    provenance: H2_FIXTURE_PROVENANCE,
  }
}

function matchesFilter(event: H2AnomalyEvent, filter?: H2EventFilter): boolean {
  if (!filter) return true
  return (
    (!filter.codes || filter.codes.includes(event.code)) &&
    (!filter.severities || filter.severities.includes(event.severity)) &&
    (!filter.equipmentIds || event.affectedEquipment.some(({ id }) => filter.equipmentIds?.includes(id))) &&
    (!filter.reviewStates || filter.reviewStates.includes(event.reviewState)) &&
    (filter.minConfidence === undefined || event.confidence >= filter.minConfidence) &&
    (!filter.startsAtOrAfter || event.startTime >= filter.startsAtOrAfter) &&
    (!filter.endsAtOrBefore || event.endTime <= filter.endsAtOrBefore)
  )
}

function createFixtureSeries(request: H2SeriesRequest): H2SeriesResponse {
  if (
    request.variables.length === 0 ||
    new Set(request.variables).size !== request.variables.length ||
    !request.variables.every(isFixtureSeriesVariable) ||
    !isFixtureTimeRange(request.startTime, request.endTime) ||
    (request.eventId && !fixtureEvents.some((event) => event.eventId === request.eventId))
  ) {
    throw new H2EmsAdapterError('invalid_fixture_request', false)
  }
  const points = fixturePoints
    .filter(
      ({ timestamp }) =>
        timestamp >= request.startTime && timestamp <= request.endTime,
    )
    .map(({ timestamp, values }) => ({
      timestamp,
      values: selectFixtureValues(values, request.variables),
    }))
  if (points.length === 0) {
    throw new H2EmsAdapterError('invalid_fixture_request', false)
  }
  return {
    runId: request.runId,
    variables: [...request.variables],
    points,
  }
}

function selectFixtureValues(
  values: Readonly<Record<string, number | null>>,
  variables: readonly string[],
): Readonly<Record<string, number | null>> {
  const selected: Record<string, number | null> = {}
  for (const variable of variables) {
    if (!isFixtureSeriesVariable(variable)) {
      throw new H2EmsAdapterError('invalid_fixture_request', false)
    }
    const value = values[fixtureSeriesVariableSources[variable]]
    if (value === undefined) {
      throw new H2EmsAdapterError('invalid_fixture_request', false)
    }
    selected[variable] = value
  }
  return selected
}

function isFixtureSeriesVariable(
  value: string,
): value is FixtureSeriesVariable {
  return Object.hasOwn(fixtureSeriesVariableSources, value)
}

function isFixtureTimeRange(startTime: string, endTime: string): boolean {
  return (
    Number.isFinite(Date.parse(startTime)) &&
    Number.isFinite(Date.parse(endTime)) &&
    startTime <= endTime &&
    startTime >= H2_FIXTURE_DATASET.timeRange.startTime &&
    endTime <= H2_FIXTURE_DATASET.timeRange.endTime
  )
}

async function createFixtureReport(
  request: H2ReportRequest,
  reviews: Map<string, H2EventReview>,
): Promise<H2ReportArtifact> {
  assertFixtureReportScope(request)
  const event = request.eventId
    ? projectFixtureEvents(reviews).find((item) => item.eventId === request.eventId)
    : undefined
  if (request.eventId && !event) throw new H2EmsAdapterError('invalid_fixture_request', false)

  const profile = fixtureReportProfiles[request.kind]
  const content = createFixtureReportContent(
    request.kind,
    profile,
    event,
    request.timeRange,
    reviews,
  )
  return createArtifact(
    request.kind,
    profile,
    content,
    event?.eventId,
  )
}

function createFixtureReportContent(
  kind: H2ReportKind,
  profile: FixtureReportProfile,
  event: H2AnomalyEvent | undefined,
  timeRange: H2TimeRange | undefined,
  reviews: Map<string, H2EventReview>,
): string {
  switch (profile.format) {
    case 'html':
      return createFixtureHtmlReport(kind, profile.title, event, timeRange, reviews)
    case 'json':
      return createFixtureJsonReport(kind, reviews)
    case 'csv':
      return serializeH2SubmissionRows(
        fixtureEvents.map((fixtureEvent) => toH2SubmissionRow(fixtureEvent)),
      )
  }
}

function createFixtureHtmlReport(
  kind: H2ReportKind,
  title: string,
  event: H2AnomalyEvent | undefined,
  timeRange: H2TimeRange | undefined,
  reviews: Map<string, H2EventReview>,
): string {
  const eventIdentity = event?.eventId ?? '不适用'
  const limitations = H2_FIXTURE_PROVENANCE.limitations
    .map((limitation) => `        <li>${escapeHtml(localizeFixtureText(limitation))}</li>`)
    .join('\n')
  const sections = createFixtureHtmlSections(kind, event, timeRange, reviews)

  return [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '  <head>',
    '    <meta charset="utf-8" />',
    `    <title>${escapeHtml(title)} | H2 Sentinel</title>`,
    '    <style>body{font-family:system-ui,sans-serif;line-height:1.6;max-width:960px;margin:auto;padding:24px;color:#10202b}code{overflow-wrap:anywhere}dt{font-weight:700}dd{margin:0 0 8px}</style>',
    '  </head>',
    '  <body>',
    '    <main>',
    `      <h1>${escapeHtml(title)}</h1>`,
    '      <p><strong>FIXTURE · 固定样例</strong>：这是合成脱敏演示证据，不是公开验证集、隐藏测试结果或官方成绩。</p>',
    '      <h2>报告范围与数据来源</h2>',
    '      <dl>',
    `        <dt>报告类型</dt><dd>${escapeHtml(kind)}</dd>`,
    `        <dt>运行 ID</dt><dd>${escapeHtml(H2_FIXTURE_ANALYSIS_RUN.runId)}</dd>`,
    `        <dt>事件 ID</dt><dd>${escapeHtml(eventIdentity)}</dd>`,
    `        <dt>来源模式</dt><dd>${escapeHtml(H2_FIXTURE_PROVENANCE.mode)}</dd>`,
    `        <dt>来源标识</dt><dd>${escapeHtml(H2_FIXTURE_PROVENANCE.source)}</dd>`,
    `        <dt>数据指纹</dt><dd><code>${escapeHtml(H2_FIXTURE_PROVENANCE.datasetFingerprint ?? '未提供')}</code></dd>`,
    `        <dt>源时间范围</dt><dd>${escapeHtml((timeRange ?? H2_FIXTURE_DATASET.timeRange).startTime)} 至 ${escapeHtml((timeRange ?? H2_FIXTURE_DATASET.timeRange).endTime)}</dd>`,
    `        <dt>生成时间</dt><dd>${escapeHtml(H2_FIXTURE_REPORT_DESCRIPTOR.generatedAt)}</dd>`,
    '      </dl>',
    sections,
    '      <h2>安全声明与限制</h2>',
    `      <p>${escapeHtml(H2_FIXTURE_REPORT_DESCRIPTOR.safetyDisclaimer)}</p>`,
    '      <p>所有建议仅供人工判断，必须人工确认；本应用不下发设备指令。</p>',
    '      <p>未加载公开标签，未生成验证指标。</p>',
    '      <h3>Fixture 限制</h3>',
    '      <ul>',
    limitations,
    '      </ul>',
    '    </main>',
    '  </body>',
    '</html>',
    '',
  ].join('\n')
}

function createFixtureJsonReport(
  kind: H2ReportKind,
  reviews: Map<string, H2EventReview>,
): string {
  if (kind === 'review_audit_json') {
    const payload: H2ReviewAuditExport = {
      schemaVersion: 1,
      exportKind: 'event_review_audit',
      runId: H2_FIXTURE_ANALYSIS_RUN.runId,
      datasetFingerprint: H2_FIXTURE_DATASET.fingerprint,
      generatedAt: H2_FIXTURE_REPORT_DESCRIPTOR.generatedAt,
      actorIdentityNotice: 'local_operator_labels_are_unverified',
      events: projectFixtureEvents(reviews)
        .slice()
        .sort((left, right) =>
          left.startTime.localeCompare(right.startTime) ||
          left.eventId.localeCompare(right.eventId),
        )
        .map((event) => ({
          event: {
            eventId: event.eventId,
            code: event.code,
            subtype: event.subtype,
            startTime: event.startTime,
            endTime: event.endTime,
          },
          review: getFixtureReview(reviews, event.eventId),
        })),
      provenance: H2_FIXTURE_PROVENANCE,
    }
    return `${JSON.stringify(payload, null, 2)}\n`
  }

  const payload = kind === 'validation_metrics'
    ? {
        schemaVersion: 1,
        reportKind: kind,
        runId: H2_FIXTURE_ANALYSIS_RUN.runId,
        available: false,
        message: '未加载公开标签，未生成验证指标。',
        provenance: H2_FIXTURE_PROVENANCE,
      }
    : {
        schemaVersion: 1,
        reportKind: kind,
        run: projectFixtureRun(reviews),
        provenance: H2_FIXTURE_PROVENANCE,
      }

  return `${JSON.stringify(payload, null, 2)}\n`
}

function createFixtureHtmlSections(
  kind: H2ReportKind,
  event: H2AnomalyEvent | undefined,
  timeRange: H2TimeRange | undefined,
  reviews: Map<string, H2EventReview>,
): string {
  if (kind === 'single_event_diagnosis' && event) {
    const review = getFixtureReview(reviews, event.eventId)
    const evidence = event.evidence.map((item) =>
      `<li><code>${escapeHtml(item.evidenceId)}</code> · 变量 <code>${escapeHtml(item.variable ?? '未提供')}</code> · 实际值 ${escapeHtml(String(item.actualValue ?? '未提供'))}${item.unit ? ` ${escapeHtml(item.unit)}` : ''} · 参考值 ${escapeHtml(String(item.referenceValue ?? '未提供'))} · 比较符 ${escapeHtml(item.comparator ?? '未提供')}。${escapeHtml(localizeFixtureText(item.conclusion))}</li>`,
    ).join('')
    const impactEvidence = event.evidence.find(({ evidenceId }) =>
      event.impact.evidenceIds.includes(evidenceId),
    )
    const impactWindow = impactEvidence?.interval
      ? `${impactEvidence.interval.startTime} 至 ${impactEvidence.interval.endTime}`
      : `${event.startTime} 至 ${event.endTime}`
    const assumptions = event.impact.assumptions
      .map((assumption) => `<li>${escapeHtml(localizeFixtureText(assumption))}</li>`)
      .join('')
    const safetyChecks = event.safetyChecks.map((check) =>
      `<li><code>${escapeHtml(check.checkId)}</code> · ${escapeHtml(check.status)}：${escapeHtml(localizeFixtureText(check.title))}。${escapeHtml(localizeFixtureText(check.message))}</li>`,
    ).join('')
    const recommendations = event.recommendations.map((recommendation) =>
      `<li><code>${escapeHtml(recommendation.recommendationId)}</code> · ${escapeHtml(recommendation.actionKind)}：${escapeHtml(localizeFixtureText(recommendation.summary))}<br />依据：${escapeHtml(localizeFixtureText(recommendation.rationale))}；必须人工确认：${recommendation.requiresHumanConfirmation ? '是' : '否'}。</li>`,
    ).join('')
    const journal = review.entries.length === 0
      ? '<p>尚无人工复核记录。</p>'
      : `<ol>${review.entries.map((entry) =>
          `<li>修订 ${entry.revision} · ${escapeHtml(fixtureReviewActionLabels[entry.action])}（<code>${escapeHtml(entry.action)}</code>）· ${escapeHtml(fixtureReviewStateLabels[entry.previousState])} → ${escapeHtml(fixtureReviewStateLabels[entry.nextState])} · ${escapeHtml(entry.createdAt)} · 本地操作人 ${escapeHtml(entry.actor.displayName)}（身份未验证）${entry.note ? `：${escapeHtml(entry.note)}` : ''}</li>`,
        ).join('')}</ol>`
    return [
      `      <h2>异常概览</h2><p>${escapeHtml(event.code)} · ${escapeHtml(event.subtype)} · 严重度 ${escapeHtml(event.severity)} · ${escapeHtml(event.startTime)} 至 ${escapeHtml(event.endTime)} · 首次发现 ${escapeHtml(event.firstDetectionTime)}。</p><p>受影响设备：${event.affectedEquipment.map((item) => `${escapeHtml(localizeFixtureText(item.displayName))}（<code>${escapeHtml(item.id)}</code>）`).join('、')}。</p>`,
      `      <h2>证据链</h2><ul>${evidence}</ul>`,
      `      <h2>原因判断：事实与推断</h2><p><strong>推断：</strong>${escapeHtml(localizeFixtureText(event.rootCause))} 该结论不等同于直接设备故障判定。</p>`,
      `      <h2>影响量化</h2><p><code>${escapeHtml(event.impact.metric)}</code> = ${escapeHtml(String(event.impact.value))} ${escapeHtml(event.impact.unit)}；计算窗口 ${escapeHtml(impactWindow)}；公式版本 <code>${escapeHtml(event.impact.formulaVersion)}</code>。</p><p>计算假设：</p><ul>${assumptions}</ul>`,
      `      <h2>安全检查</h2><ul>${safetyChecks}</ul><p>安全检查结果不会转化为控制指令。</p>`,
      `      <h2>建议与人工确认</h2><ul>${recommendations}</ul>`,
      `      <h2>人工复核记录</h2><p>当前状态：${escapeHtml(fixtureReviewStateLabels[review.currentState])}（<code>${escapeHtml(review.currentState)}</code>），修订 ${review.revision}。操作人名称仅为本地未验证归属，不代表认证身份。</p>${journal}`,
      `      <h2>版本与溯源</h2><p>规则 <code>${escapeHtml(H2_FIXTURE_PROVENANCE.ruleVersion ?? '未提供')}</code>；配置 <code>${escapeHtml(H2_FIXTURE_PROVENANCE.configurationVersion ?? '未提供')}</code>；模型版本：未声明；渲染由本地 Fixture 适配器完成。</p>`,
    ].join('\n')
  }

  if (kind === 'pcc_daily_compliance') {
    const relatedEvents = projectFixtureEvents(reviews)
      .filter(({ code }) => code === 'C04' || code === 'C05')
      .map((item) => `<li>${escapeHtml(item.code)} · <code>${escapeHtml(item.eventId)}</code> · ${escapeHtml(fixtureReviewStateLabels[item.reviewState])}</li>`)
      .join('')
    return [
      `      <h2>日报日期与时间基准</h2><p>${escapeHtml(timeRange?.startTime ?? '')} 至 ${escapeHtml(timeRange?.endTime ?? '')}</p>`,
      '      <h2>PCC 实际功率与动态限值</h2><p>固定样例在 C04 证据时点的 <code>pcc_power_kw</code> 为 720 kW，生效的 <code>pcc_export_limit_kw</code> 为 500 kW；<code>pcc_import_limit_kw</code> 字段存在，但该事件不是受电越限。</p>',
      '      <h2>越限区间、持续时间与电量</h2><p>送电越限区间为 2026-01-05T10:32:00Z 至 2026-01-05T10:39:00Z，共 8 个分钟采样点；<code>pcc_power_limit_violation_energy_kwh</code> = 29.333333333333332 kWh，公式版本 <code>impact-c04-v1</code>。固定样例未检测到受电越限区间。</p>',
      '      <h2>日累计电量与配额</h2><p>证据不足，未计算该项合规结论。</p>',
      `      <h2>事件与人工复核</h2><ul>${relatedEvents || '<li>当前范围没有 C04/C05 事件。</li>'}</ul>`,
      `      <h2>数据质量、公式与溯源</h2><p>质量状态 ${escapeHtml(H2_FIXTURE_QUALITY_REPORT.status)}，${H2_FIXTURE_QUALITY_REPORT.rowCount} 行；规则 <code>${escapeHtml(H2_FIXTURE_PROVENANCE.ruleVersion ?? '未提供')}</code>；Fixture 仅覆盖合成脱敏 C03/C04。</p>`,
    ].join('\n')
  }

  if (kind === 'quality_report') {
    const checks = H2_FIXTURE_QUALITY_REPORT.checks
      .map((check) => `<li><code>${escapeHtml(check.code)}</code> · ${escapeHtml(check.status)}：${escapeHtml(localizeFixtureText(check.message))}；影响字段 ${check.affectedFields.map((field) => `<code>${escapeHtml(field)}</code>`).join('、') || '无'}。</li>`)
      .join('')
    return `      <h2>数据范围与质量结论</h2><p>${H2_FIXTURE_QUALITY_REPORT.rowCount} 行；${escapeHtml(H2_FIXTURE_QUALITY_REPORT.timeRange.startTime)} 至 ${escapeHtml(H2_FIXTURE_QUALITY_REPORT.timeRange.endTime)}；质量状态 ${escapeHtml(H2_FIXTURE_QUALITY_REPORT.status)}。</p><h2>质量检查详情</h2><ul>${checks}</ul><p>当前合同未提供缺失值、重复时间戳、不规则采样、非法范围和功率平衡残差的独立检查项，因此不把这些类别推断为零或已通过。</p><h2>阻断、降级与限制</h2><p>当前固定样例没有阻断原因或质量警告；未加载公开标签，未生成验证指标。</p><h2>版本与溯源</h2><p>FIXTURE 固定样例；规则 <code>${escapeHtml(H2_FIXTURE_PROVENANCE.ruleVersion ?? '未提供')}</code>。</p>`
  }

  const orderedEvents = projectFixtureEvents(reviews).slice().sort((left, right) =>
    left.startTime.localeCompare(right.startTime) || left.eventId.localeCompare(right.eventId),
  )
  const reviewCounts = fixtureReviewStates.map((state) =>
    `${fixtureReviewStateLabels[state]}（${state}）${orderedEvents.filter((eventItem) => eventItem.reviewState === state).length} 个`,
  ).join('；')
  const eventSummary = orderedEvents.map((item) =>
    `<li>${escapeHtml(item.code)} · <code>${escapeHtml(item.eventId)}</code> · ${escapeHtml(item.startTime)} 至 ${escapeHtml(item.endTime)} · ${escapeHtml(fixtureReviewStateLabels[item.reviewState])} · <code>${escapeHtml(item.impact.metric)}</code> = ${escapeHtml(String(item.impact.value))} ${escapeHtml(item.impact.unit)}</li>`,
  ).join('')
  return `      <h2>运行范围与质量</h2><p>${escapeHtml(H2_FIXTURE_DATASET.timeRange.startTime)} 至 ${escapeHtml(H2_FIXTURE_DATASET.timeRange.endTime)}；${H2_FIXTURE_QUALITY_REPORT.rowCount} 行；质量状态 ${escapeHtml(H2_FIXTURE_QUALITY_REPORT.status)}。</p><h2>事件计数</h2><p>按代码：C03 1 个，C04 1 个，其余 C01–C07 为 0 个；按严重度：high 2 个，其余为 0 个。</p><h2>事件与复核摘要</h2><p>${escapeHtml(reviewCounts)}。</p><ul>${eventSummary}</ul><h2>影响与限制</h2><p>不同单位的影响不合并；未加载公开标签，未生成验证指标。</p><h2>版本与溯源</h2><p>FIXTURE 固定样例；规则 <code>${escapeHtml(H2_FIXTURE_PROVENANCE.ruleVersion ?? '未提供')}</code>。</p>`
}

function assertFixtureReportScope(request: H2ReportRequest): void {
  const invalid = (): never => {
    throw new H2EmsAdapterError('report_invalid_scope', false, 'report.invalid_scope')
  }
  if (request.kind === 'single_event_diagnosis') {
    if (!request.eventId || request.timeRange) invalid()
    return
  }
  if (request.eventId) invalid()
  if (request.kind === 'period_summary') {
    if (request.timeRange && !isValidTimeRange(request.timeRange)) invalid()
    return
  }
  if (request.kind === 'pcc_daily_compliance') {
    if (
      !request.timeRange ||
      !isCalendarDayRange(request.timeRange) ||
      !containsFixtureDatasetRange(request.timeRange)
    ) invalid()
    return
  }
  if (request.timeRange) invalid()
}

function isValidTimeRange(timeRange: H2TimeRange): boolean {
  const start = Date.parse(timeRange.startTime)
  const end = Date.parse(timeRange.endTime)
  return Number.isFinite(start) && Number.isFinite(end) && start < end
}

function containsFixtureDatasetRange(timeRange: H2TimeRange): boolean {
  return (
    Date.parse(timeRange.startTime) <= Date.parse(H2_FIXTURE_DATASET.timeRange.startTime) &&
    Date.parse(timeRange.endTime) >= Date.parse(H2_FIXTURE_DATASET.timeRange.endTime)
  )
}

function isCalendarDayRange(timeRange: H2TimeRange): boolean {
  const startMatch = /^\d{4}-\d{2}-\d{2}T00:00:00(?:\.000)?(Z|[+-]\d{2}:\d{2})$/u.exec(timeRange.startTime)
  const endMatch = /^\d{4}-\d{2}-\d{2}T00:00:00(?:\.000)?(Z|[+-]\d{2}:\d{2})$/u.exec(timeRange.endTime)
  return (
    startMatch !== null &&
    endMatch !== null &&
    startMatch[1] === endMatch[1] &&
    Date.parse(timeRange.endTime) - Date.parse(timeRange.startTime) === 86_400_000
  )
}

async function createArtifact(
  kind: H2ReportKind,
  profile: FixtureReportProfile,
  content: string,
  eventId?: string,
): Promise<H2ReportArtifact> {
  assertSafeFixtureFilename(profile.filename, profile.format)
  const { eventId: _fixtureEventId, ...fixtureDescriptor } = H2_FIXTURE_REPORT_DESCRIPTOR
  const descriptor = {
    ...fixtureDescriptor,
    reportId: `fixture-${kind}-${eventId ?? H2_FIXTURE_ANALYSIS_RUN.runId}`,
    kind,
    format: profile.format,
    filename: profile.filename,
    contentHash: await sha256(content),
    ...(eventId ? { eventId } : {}),
    provenance: H2_FIXTURE_PROVENANCE,
  } as const
  return {
    descriptor,
    mediaType: profile.mediaType,
    content,
  }
}

function assertSafeFixtureFilename(
  filename: string,
  format: H2ReportFormat,
): void {
  const extension = format === 'html' ? '.html' : format === 'json' ? '.json' : '.csv'
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(filename) || !filename.endsWith(extension)) {
    throw new Error('Invalid Fixture report filename configuration.')
  }
}

function localizeFixtureText(value: string): string {
  return fixtureTextZh[value] ?? value
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      case "'":
        return '&#39;'
      default:
        return character
    }
  })
}
