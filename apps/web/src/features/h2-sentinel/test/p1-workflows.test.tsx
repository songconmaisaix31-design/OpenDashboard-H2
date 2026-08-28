import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  H2_ASSISTANT_QUESTIONS,
  H2_FIXTURE_PROVENANCE,
  H2_FIXTURE_REPORT_DESCRIPTOR,
  H2_GOLDEN_C03_EVENT,
  H2_GOLDEN_C04_EVENT,
  type H2EventReview,
  type H2Provenance,
  type H2ReportArtifact,
} from '@opendashboard/h2-contracts'
import { EventReviewPanel } from '../components/review/EventReviewPanel.tsx'
import {
  getH2AssistantEventRequirement,
  H2_ASSISTANT_FOLLOW_UP_MAX_CHARACTERS,
  resolveH2AssistantFollowUp,
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
  isH2ReviewConflict,
  validateH2ReviewDraft,
} from '../model/review.ts'
import { AssistantAnswer, AssistantPage } from '../pages/assistant/AssistantPage.tsx'
import { ReportsPage } from '../pages/reports/ReportsPage.tsx'
import { createH2WebFixtureDataSource } from './fixture-data-source.ts'

const noop = () => undefined

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
    assert.equal(resolveH2AssistantFollowUp('PCC 越限配额合规日报').status, 'refused')
    assert.equal(
      resolveH2AssistantFollowUp('x'.repeat(H2_ASSISTANT_FOLLOW_UP_MAX_CHARACTERS + 1)).status,
      'refused',
    )
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
        pending
      />,
    )
    assert.match(markup, /只路由到 Q01–Q10，不开放通用聊天/)
    assert.match(markup, /maxLength="120"/)
    assert.match(markup, /disabled=""/)
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

  it('builds exact report scopes and labels Fixture, validation slice, and Live distinctly', () => {
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
      getH2ProvenanceLabel(liveProvenance('public_validation_slice')),
      'LIVE_ANALYSIS · 验证集切片',
    )
    assert.equal(
      getH2ProvenanceLabel(liveProvenance('full_validation_dataset')),
      'LIVE_ANALYSIS · 完整验证集',
    )
    assert.equal(getH2ProvenanceLabel(liveProvenance('local-import')), 'LIVE_ANALYSIS · 本地数据')
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
