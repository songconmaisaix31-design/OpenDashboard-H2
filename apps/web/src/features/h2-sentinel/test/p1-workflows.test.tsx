import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  H2_ASSISTANT_QUESTIONS,
  H2_FIXTURE_PROVENANCE,
  H2_FIXTURE_REPORT_DESCRIPTOR,
  H2_GOLDEN_C03_EVENT,
  H2_GOLDEN_C04_EVENT,
  type H2EventReview,
  type H2NluRequest,
  type H2NluResult,
  type H2Provenance,
  type H2ReportArtifact,
} from '@opendashboard/h2-contracts'
import { ProvenanceBanner } from '../components/provenance/ProvenanceBanner.tsx'
import { EventReviewPanel } from '../components/review/EventReviewPanel.tsx'
import {
  getH2AssistantEventRequirement,
  H2_ASSISTANT_FOLLOW_UP_MAX_CHARACTERS,
  resolveH2AssistantIntent,
  resolveH2AssistantFollowUp,
  submitH2AssistantFollowUp,
} from '../model/assistant.ts'
import {
  getH2ProvenanceLabel,
} from '../model/presentation.ts'
import {
  createH2ReportRequest,
  h2DatasetCalendarDay,
} from '../model/reporting.ts'
import {
  getH2ReviewActions,
  isH2ReviewTargetCurrent,
  isH2ReviewConflict,
  type H2ReviewTarget,
  validateH2ReviewDraft,
} from '../model/review.ts'
import {
  beginH2ArtifactExport,
  failH2ArtifactExport,
  INITIAL_H2_COMMAND_STATE,
} from '../model/view-state.ts'
import { AssistantAnswer, AssistantPage } from '../pages/assistant/AssistantPage.tsx'
import { ReportsPage } from '../pages/reports/ReportsPage.tsx'
import { createH2WebFixtureDataSource } from './fixture-data-source.ts'

const noop = () => undefined
const noopSubmit = async () => ({ status: 'stale' } as const)

describe('H2 Sentinel P1 Web workflows', () => {
  it('renders exactly the ten official questions and blocks invalid event context', () => {
    const markup = renderToStaticMarkup(
      <AssistantPage
        answer={null}
        error={null}
        event={H2_GOLDEN_C03_EVENT}
        events={[H2_GOLDEN_C03_EVENT, H2_GOLDEN_C04_EVENT]}
        onAsk={noop}
        onDownload={noop}
        onSelectEvent={noop}
        onSubmitFollowUp={noopSubmit}
        pending={false}
      />,
    )

    for (const { prompt, questionId } of H2_ASSISTANT_QUESTIONS) {
      assert.match(markup, new RegExp(questionId))
      assert.match(markup, new RegExp(prompt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    }
    assert.doesNotMatch(markup, /H2Q\d{2}/)
    assert.equal(getH2AssistantEventRequirement('Q03', null).valid, false)
    assert.equal(getH2AssistantEventRequirement('Q03', H2_GOLDEN_C04_EVENT).valid, false)
    assert.equal(getH2AssistantEventRequirement('Q02', H2_GOLDEN_C04_EVENT).valid, true)
    assert.equal(getH2AssistantEventRequirement('Q04', null).valid, true)
    assert.equal(getH2AssistantEventRequirement('Q09', H2_GOLDEN_C03_EVENT).valid, true)
  })

  it('routes bounded follow-up wording to Q01-Q10 and refuses unknown or ambiguous input', () => {
    for (const question of H2_ASSISTANT_QUESTIONS) {
      assert.deepEqual(resolveH2AssistantFollowUp(question.prompt), {
        status: 'matched',
        questionId: question.questionId,
        prompt: question.prompt,
        message: `已确定性匹配 ${question.questionId}；将按官方问题和当前证据回答。`,
      })
    }

    const aliases = {
      Q01: 'PCC 正负值怎么理解？',
      Q02: 'PCC 功率越限和电量配额怎么区分？',
      Q03: '储能充放电方向会怎样影响并网点？',
      Q04: 'SOC 调节裕度和备用怎么判断？',
      Q05: '设备降额后 EMS 为什么没有同步？',
      Q06: '如何区分云团波动和控制指令振荡？',
      Q07: '多台电解槽的负荷分配怎么看？',
      Q08: '哪些操作建议需要人工确认？',
      Q09: '导出测试集诊断报告',
      Q10: 'PCC 合规日报写什么？',
    } as const
    for (const [questionId, wording] of Object.entries(aliases)) {
      const resolution = resolveH2AssistantFollowUp(wording)
      assert.equal(resolution.status, 'matched')
      if (resolution.status === 'matched') assert.equal(resolution.questionId, questionId)
    }

    assert.equal(resolveH2AssistantFollowUp('帮我随便聊聊').status, 'refused')
    assert.match(
      resolveH2AssistantFollowUp('请给电解槽下发启停和功率设定值').message,
      /无控制权限.*未下发任何指令/,
    )
    assert.equal(resolveH2AssistantFollowUp('PCC 越限配额合规日报').status, 'refused')
    assert.equal(
      resolveH2AssistantFollowUp('x'.repeat(H2_ASSISTANT_FOLLOW_UP_MAX_CHARACTERS + 1)).status,
      'refused',
    )
    assert.equal(
      resolveH2AssistantIntent('PCC 合规日报写什么？', H2_GOLDEN_C03_EVENT).status,
      'refused',
    )
    const compatibleIntent = resolveH2AssistantIntent(
      'PCC 合规日报写什么？',
      H2_GOLDEN_C04_EVENT,
    )
    assert.equal(compatibleIntent.status, 'matched')
    if (compatibleIntent.status === 'matched') {
      assert.equal(compatibleIntent.questionId, 'Q10')
    }
  })

  it('uses backend NLU and sends allowLlmRendering in one ask call', async () => {
    const fixture = createH2WebFixtureDataSource()
    const nluRequests: H2NluRequest[] = []
    const askRequests: Parameters<typeof fixture.ask>[0][] = []
    const result = await submitH2AssistantFollowUp({
      allowLlmRendering: true,
      dataSource: {
        ...fixture,
        async resolveNlu(request) {
          nluRequests.push(request)
          return { schemaVersion: 1, status: 'matched', questionId: 'Q03', confidence: 0.94 }
        },
        async ask(request) {
          askRequests.push(request)
          return fixture.ask(request)
        },
      },
      event: H2_GOLDEN_C03_EVENT,
      events: [H2_GOLDEN_C03_EVENT, H2_GOLDEN_C04_EVENT],
      input: ' 储能方向为什么影响 PCC？ ',
      isCurrent: () => true,
      runId: 'run-fixture-h2-sentinel-golden',
    })

    assert.equal(result.status, 'answered')
    assert.deepEqual(nluRequests, [{
      schemaVersion: 1,
      runId: 'run-fixture-h2-sentinel-golden',
      text: '储能方向为什么影响 PCC？',
    }])
    assert.equal(askRequests.length, 1)
    assert.equal(askRequests[0]?.allowLlmRendering, true)
    assert.equal(askRequests[0]?.questionId, 'Q03')
  })

  it('rejects overlong input before invoking the NLU capability', async () => {
    const fixture = createH2WebFixtureDataSource()
    let nluCount = 0
    let askCount = 0
    const result = await submitH2AssistantFollowUp({
      allowLlmRendering: true,
      dataSource: {
        ...fixture,
        async resolveNlu() {
          nluCount += 1
          return { schemaVersion: 1, status: 'matched', questionId: 'Q01', confidence: 1 }
        },
        async ask(request) {
          askCount += 1
          return fixture.ask(request)
        },
      },
      event: H2_GOLDEN_C03_EVENT,
      events: [H2_GOLDEN_C03_EVENT],
      input: 'x'.repeat(H2_ASSISTANT_FOLLOW_UP_MAX_CHARACTERS + 1),
      isCurrent: () => true,
      runId: 'run-fixture-h2-sentinel-golden',
    })

    assert.equal(result.status, 'refused')
    assert.equal(nluCount, 0)
    assert.equal(askCount, 0)
  })

  it('renders backend NLU refusal safely and never asks', async () => {
    const fixture = createH2WebFixtureDataSource()
    let askCount = 0
    const result = await submitH2AssistantFollowUp({
      allowLlmRendering: false,
      dataSource: {
        ...fixture,
        async resolveNlu() {
          return {
            schemaVersion: 1,
            status: 'refused',
            reason: 'unsupported_intent',
            confidence: 0.99,
            allowedQuestionIds: H2_ASSISTANT_QUESTIONS.map(({ questionId }) => questionId),
          }
        },
        async ask(request) {
          askCount += 1
          return fixture.ask(request)
        },
      },
      event: H2_GOLDEN_C03_EVENT,
      events: [H2_GOLDEN_C03_EVENT, H2_GOLDEN_C04_EVENT],
      input: '<script>执行控制</script>',
      isCurrent: () => true,
      runId: 'run-fixture-h2-sentinel-golden',
    })

    assert.equal(result.status, 'refused')
    if (result.status === 'refused') {
      assert.match(result.message, /不属于 Q01–Q10/)
      assert.doesNotMatch(result.message, /script/iu)
    }
    assert.equal(askCount, 0)
  })

  it('rejects control input before NLU and matched intents with invalid event context', async () => {
    const fixture = createH2WebFixtureDataSource()
    let nluCount = 0
    let askCount = 0
    const dataSource = {
      ...fixture,
      async resolveNlu() {
        nluCount += 1
        return { schemaVersion: 1, status: 'matched', questionId: 'Q10', confidence: 0.99 } as const
      },
      async ask(request: Parameters<typeof fixture.ask>[0]) {
        askCount += 1
        return fixture.ask(request)
      },
    }
    const control = await submitH2AssistantFollowUp({
      allowLlmRendering: false,
      dataSource,
      event: H2_GOLDEN_C03_EVENT,
      events: [H2_GOLDEN_C03_EVENT],
      input: '请给储能下发功率设定值',
      isCurrent: () => true,
      runId: 'run-fixture-h2-sentinel-golden',
    })
    const invalidContext = await submitH2AssistantFollowUp({
      allowLlmRendering: false,
      dataSource,
      event: H2_GOLDEN_C03_EVENT,
      events: [H2_GOLDEN_C03_EVENT],
      input: '生成 PCC 合规日报',
      isCurrent: () => true,
      runId: 'run-fixture-h2-sentinel-golden',
    })

    assert.equal(control.status, 'refused')
    assert.equal(invalidContext.status, 'refused')
    assert.equal(nluCount, 1)
    assert.equal(askCount, 0)
  })

  it('uses the closed local resolver when NLU capability is absent', async () => {
    const fixture = createH2WebFixtureDataSource()
    let askCount = 0
    const result = await submitH2AssistantFollowUp({
      allowLlmRendering: false,
      dataSource: {
        ...fixture,
        async ask(request) {
          askCount += 1
          return fixture.ask(request)
        },
      },
      event: H2_GOLDEN_C03_EVENT,
      events: [H2_GOLDEN_C03_EVENT, H2_GOLDEN_C04_EVENT],
      input: 'PCC 正负值怎么理解？',
      isCurrent: () => true,
      runId: 'run-fixture-h2-sentinel-golden',
    })

    assert.equal(result.status, 'answered')
    if (result.status === 'answered') assert.match(result.routingMessage, /本地闭集规则/)
    assert.equal(askCount, 1)
  })

  it('does not ask after a pending NLU result becomes stale', async () => {
    const fixture = createH2WebFixtureDataSource()
    const deferred = deferredValue<H2NluResult>()
    let current = true
    let askCount = 0
    const submission = submitH2AssistantFollowUp({
      allowLlmRendering: true,
      dataSource: {
        ...fixture,
        resolveNlu: () => deferred.promise,
        async ask(request) {
          askCount += 1
          return fixture.ask(request)
        },
      },
      event: H2_GOLDEN_C03_EVENT,
      events: [H2_GOLDEN_C03_EVENT],
      input: '储能方向为什么影响 PCC？',
      isCurrent: () => current,
      runId: 'run-fixture-h2-sentinel-golden',
    })
    current = false
    deferred.resolve({ schemaVersion: 1, status: 'matched', questionId: 'Q03', confidence: 0.91 })

    assert.deepEqual(await submission, { status: 'stale' })
    assert.equal(askCount, 0)
  })

  it('contains no second-call assistant rendering flow', () => {
    const source = readFileSync(new URL('../H2SentinelApp.tsx', import.meta.url), 'utf8')
    assert.doesNotMatch(source, /renderAssistantAnswer|H2AssistantRenderingResult/)
  })

  it('renders the follow-up entry as disabled while an answer is pending', () => {
    const markup = renderToStaticMarkup(
      <AssistantPage
        answer={null}
        error={null}
        event={H2_GOLDEN_C03_EVENT}
        events={[H2_GOLDEN_C03_EVENT, H2_GOLDEN_C04_EVENT]}
        onAsk={noop}
        onDownload={noop}
        onSelectEvent={noop}
        onSubmitFollowUp={noopSubmit}
        pending
      />,
    )
    assert.match(markup, /只路由到 Q01–Q10，不开放通用聊天/)
    assert.match(markup, /maxLength="500"/)
    assert.match(markup, /disabled=""/)
    assert.match(markup, /请求可选语言重述/)
  })

  it('renders the Q09 report citation and an explicit Chinese download control', async () => {
    const answer = await createH2WebFixtureDataSource().ask({
      runId: 'run-fixture-h2-sentinel-golden',
      questionId: 'Q09',
      eventId: H2_GOLDEN_C03_EVENT.eventId,
      allowLlmRendering: false,
    })
    const markup = renderToStaticMarkup(<AssistantAnswer answer={answer} onDownload={noop} />)

    assert.match(markup, /Q09 报告已生成/)
    assert.match(markup, /下载中文诊断报告/)
    assert.match(markup, new RegExp(answer.generatedReport?.descriptor.filename ?? 'missing'))
    assert.match(markup, new RegExp(answer.generatedReport?.descriptor.contentHash ?? 'missing'))
    assert.match(markup, /report · fixture-single_event_diagnosis/)
  })

  it('labels optional LLM restatement, fallback, and deterministic states without hiding evidence', async () => {
    const answer = await createH2WebFixtureDataSource().ask({
      runId: 'run-fixture-h2-sentinel-golden',
      questionId: 'Q01',
      allowLlmRendering: false,
    })
    const renderedAnswer = {
      ...answer,
      mode: 'LLM_RENDERED',
      provenance: { ...answer.provenance, mode: 'LLM_RENDERED', source: 'StepFun' },
    } as const
    const rendered = renderToStaticMarkup(
      <AssistantAnswer
        answer={renderedAnswer}
        modeDisplay={{ status: 'rendered', message: '已由 StepFun 重述；引用边界保持不变。' }}
        onDownload={noop}
      />,
    )
    assert.match(rendered, /LLM 语言重述 · 非事实源/)
    assert.match(rendered, /拒绝直接控制/)
    assert.match(rendered, /答案引用与“拒绝直接控制”状态始终为准/)

    for (const modeDisplay of [
      { status: 'fallback', message: '语言重述不可用，已降级。' },
      { status: 'deterministic', message: '未请求语言重述。' },
    ] as const) {
      const markup = renderToStaticMarkup(<AssistantAnswer answer={answer} modeDisplay={modeDisplay} onDownload={noop} />)
      assert.match(markup, modeDisplay.status === 'fallback' ? /语言重述降级/ : /确定性模板/)
    }
  })

  it('validates local review drafts and renders an ordered, escaped journal', () => {
    assert.deepEqual(getH2ReviewActions('open'), ['confirm', 'reject', 'add_note'])
    assert.deepEqual(getH2ReviewActions('confirmed'), ['resolve', 'reopen', 'add_note'])
    assert.equal(validateH2ReviewDraft({ action: 'reject', actorName: 'operator', note: ' ' }).valid, false)
    assert.equal(validateH2ReviewDraft({ action: 'confirm', actorName: ' ', note: '' }).valid, false)
    assert.equal(validateH2ReviewDraft({ action: 'confirm', actorName: 'operator', note: '' }).valid, true)
    assert.equal(isH2ReviewConflict({ remoteCode: 'review.conflict' }), true)
    assert.equal(isH2ReviewConflict({ code: 'review_conflict' }), true)
    assert.equal(isH2ReviewConflict({ code: 'unknown' }), false)

    const review = reviewWithReversedEntries()
    const markup = renderToStaticMarkup(
      <EventReviewPanel
        onReload={noop}
        onSubmit={noop}
        state={{ review, loading: false, pending: null, error: null, notice: null }}
      />,
    )
    assert.match(markup, /本地归属未验证/)
    assert(markup.indexOf('修订 1 ·') < markup.indexOf('修订 2 ·'))
    assert.match(markup, /&lt;script&gt;operator&lt;\/script&gt;/)
    assert.match(markup, /&lt;img src=x&gt; 已核验/)
    assert.doesNotMatch(markup, /<script|<img/iu)
  })

  it('ignores a deferred event A review response after navigation to event B', async () => {
    const submittedTarget = {
      runId: 'run-1',
      eventId: 'event-a',
      revision: 0,
    } as const satisfies H2ReviewTarget
    const eventBTarget = {
      runId: 'run-1',
      eventId: 'event-b',
      revision: 0,
    } as const satisfies H2ReviewTarget
    const deferred = deferredValue<H2EventReview>()
    let activeTarget: H2ReviewTarget | null = submittedTarget
    let renderedReview = {
      ...reviewWithReversedEntries(),
      eventId: submittedTarget.eventId,
      revision: submittedTarget.revision,
      entries: [],
    } as H2EventReview
    const response = deferred.promise.then((review) => {
      if (isH2ReviewTargetCurrent(activeTarget, submittedTarget)) {
        renderedReview = review
      }
    })

    activeTarget = eventBTarget
    renderedReview = {
      ...renderedReview,
      eventId: eventBTarget.eventId,
      revision: eventBTarget.revision,
    }
    deferred.resolve({
      ...renderedReview,
      eventId: submittedTarget.eventId,
      revision: 1,
    })
    await response

    assert.equal(renderedReview.eventId, eventBTarget.eventId)
    assert.equal(renderedReview.revision, eventBTarget.revision)
  })

  it('invalidates an old artifact when a new export starts or fails', () => {
    const artifact = {
      descriptor: H2_FIXTURE_REPORT_DESCRIPTOR,
      mediaType: 'text/html',
      content: '<p>old report</p>',
    } as const satisfies H2ReportArtifact
    const started = beginH2ArtifactExport(
      { ...INITIAL_H2_COMMAND_STATE, artifact },
      'event-report',
    )
    assert.equal(started.artifact, null)
    const failed = failH2ArtifactExport(
      { ...started, artifact },
      '导出失败',
    )
    assert.equal(failed.artifact, null)
    assert.equal(failed.error, '导出失败')
  })

  it('builds exact report scopes and separates explicit provenance from filename hints', () => {
    assert.deepEqual(h2DatasetCalendarDay('2026-01-31T10:20:00+08:00'), {
      startTime: '2026-01-31T00:00:00+08:00',
      endTime: '2026-02-01T00:00:00+08:00',
    })
    assert.deepEqual(
      createH2ReportRequest(
        'single_event_diagnosis',
        'run-1',
        { startTime: '2026-01-31T10:20:00+08:00', endTime: '2026-01-31T11:20:00+08:00' },
        'event-1',
      ),
      { runId: 'run-1', kind: 'single_event_diagnosis', eventId: 'event-1' },
    )
    assert.equal(getH2ProvenanceLabel(H2_FIXTURE_PROVENANCE), 'FIXTURE · 固定样例')
    assert.equal(
      getH2ProvenanceLabel(H2_FIXTURE_PROVENANCE, ['validation-slice.csv']),
      'FIXTURE · 固定样例',
    )
    assert.equal(
      getH2ProvenanceLabel(liveProvenance('public_validation_slice')),
      'LIVE_ANALYSIS · 验证集切片',
    )
    assert.equal(
      getH2ProvenanceLabel(liveProvenance('full_validation_dataset')),
      'LIVE_ANALYSIS · 完整验证集',
    )
    assert.equal(
      getH2ProvenanceLabel({
        ...liveProvenance('local-import'),
        limitations: ['public_validation_slice'],
      }),
      'LIVE_ANALYSIS · 验证集切片',
    )
    assert.equal(
      getH2ProvenanceLabel(liveProvenance('local-import'), ['validation-slice.csv']),
      'LIVE_ANALYSIS · 未核验文件名提示（验证集切片）',
    )
    assert.equal(
      getH2ProvenanceLabel(liveProvenance('local-import'), ['full-validation.csv']),
      'LIVE_ANALYSIS · 未核验文件名提示（完整验证集）',
    )
    assert.equal(getH2ProvenanceLabel(liveProvenance('local-import')), 'LIVE_ANALYSIS · 本地数据')
  })

  it('describes filename-only validation hints without asserting a public source', () => {
    const hintedMarkup = renderToStaticMarkup(
      <ProvenanceBanner
        provenance={liveProvenance('local-import')}
        sourceHints={['validation-slice.csv']}
      />,
    )
    assert.match(hintedMarkup, /未核验文件名提示（验证集切片）/)
    assert.match(hintedMarkup, /独立 manifest\/receipt 才能确认公共来源身份/)
    assert.doesNotMatch(hintedMarkup, /来自公开验证数据/)

    const explicitMarkup = renderToStaticMarkup(
      <ProvenanceBanner
        provenance={liveProvenance('public_validation_slice')}
        sourceHints={['arbitrary.csv']}
      />,
    )
    assert.match(explicitMarkup, /LIVE_ANALYSIS · 验证集切片/)
    assert.match(explicitMarkup, /来自公开验证数据/)
    assert.doesNotMatch(explicitMarkup, /未核验文件名提示/)
  })

  it('shows every report kind and previews artifact content as inert text', () => {
    const artifact = {
      descriptor: {
        ...H2_FIXTURE_REPORT_DESCRIPTOR,
        kind: 'review_audit_json',
        format: 'json',
        filename: 'review-audit.json',
      },
      mediaType: 'application/json',
      content: '<img src=x onerror=alert(1)>',
    } as const satisfies H2ReportArtifact
    const markup = renderToStaticMarkup(
      <ReportsPage
        artifact={artifact}
        error={null}
        event={H2_GOLDEN_C03_EVENT}
        notice={null}
        onDownload={noop}
        onExport={noop}
        pending={null}
      />,
    )

    for (const title of [
      '氢哨异常诊断报告',
      '氢哨运行摘要',
      'PCC 合规日报',
      '结构化分析结果',
      '验证指标',
      '氢哨数据质量报告',
      '人工复核审计',
      '竞赛提交结果',
    ]) assert.match(markup, new RegExp(title))
    assert.match(markup, /&lt;img src=x onerror=alert\(1\)&gt;/)
    assert.doesNotMatch(markup, /<img/iu)
  })
})

function liveProvenance(source: string): H2Provenance {
  return {
    ...H2_FIXTURE_PROVENANCE,
    mode: 'LIVE_ANALYSIS',
    source,
  }
}

function reviewWithReversedEntries(): H2EventReview {
  const first = {
    schemaVersion: 1,
    entryId: 'entry-1',
    requestId: 'request-1',
    revision: 1,
    action: 'confirm',
    previousState: 'open',
    nextState: 'confirmed',
    actor: { kind: 'local_operator', displayName: '<script>operator</script>' },
    createdAt: '2026-01-05T11:00:00Z',
  } as const
  const second = {
    schemaVersion: 1,
    entryId: 'entry-2',
    requestId: 'request-2',
    revision: 2,
    action: 'resolve',
    previousState: 'confirmed',
    nextState: 'resolved',
    note: '<img src=x> 已核验',
    actor: { kind: 'local_operator', displayName: 'operator' },
    createdAt: '2026-01-05T11:01:00Z',
  } as const
  return {
    schemaVersion: 1,
    reviewId: 'review-1',
    runId: 'run-1',
    eventId: 'event-1',
    initialState: 'open',
    currentState: 'resolved',
    revision: 2,
    entries: [second, first],
    provenance: H2_FIXTURE_PROVENANCE,
  }
}

function deferredValue<T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
} {
  let resolvePromise: ((value: T) => void) | undefined
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })
  return {
    promise,
    resolve(value) {
      if (!resolvePromise) throw new Error('Deferred promise was not initialized.')
      resolvePromise(value)
    },
  }
}
