import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  H2_ASSISTANT_QUESTIONS,
  H2_FIXTURE_ASSISTANT_ANSWER,
  H2_REVIEW_ACTIONS,
  nextH2ReviewState,
  type H2EventReview,
  type H2ReportKind,
  type H2ReviewEventRequest,
  type H2ReviewMutationReceipt,
  type H2SentinelDataSource,
} from '../src/index.ts'

const officialQuestions = [
  ['Q01', 'PCC正值和负值分别代表什么？'],
  ['Q02', '如何区分PCC功率越限与电量配额异常？'],
  ['Q03', '储能方向异常如何影响PCC功率？'],
  ['Q04', '如何判断SOC调节备用是否不足？'],
  ['Q05', '设备降额但EMS未同步如何定位？'],
  ['Q06', '如何区分云团变化和控制指令振荡？'],
  ['Q07', '如何评价多台电解槽负荷分配？'],
  ['Q08', '哪些建议必须人工确认？'],
  ['Q09', '生成测试集异常诊断报告。'],
  ['Q10', 'PCC合规日报包含哪些内容？'],
] as const

describe('H2 P1 contracts', () => {
  it('freeze official assistant IDs, order, and Chinese prompts', () => {
    assert.deepEqual(
      H2_ASSISTANT_QUESTIONS.map(({ questionId, prompt }) => [
        questionId,
        prompt,
      ]),
      officialQuestions,
    )
    assert(
      H2_ASSISTANT_QUESTIONS.every(
        ({ questionId }) => !questionId.startsWith('H2Q'),
      ),
    )
  })

  it('keep every answer section citation referentially complete', () => {
    const citationById = new Map(
      H2_FIXTURE_ASSISTANT_ANSWER.citations.map((citation) => [
        citation.citationId,
        citation,
      ]),
    )
    const referenced = new Set<string>()

    for (const section of H2_FIXTURE_ASSISTANT_ANSWER.sections) {
      assert(section.citationIds.length > 0)
      assert.equal(new Set(section.citationIds).size, section.citationIds.length)
      for (const citationId of section.citationIds) {
        const citation = citationById.get(citationId)
        assert(citation)
        assert.equal(citation.claimKind, section.claimKind)
        referenced.add(citationId)
      }
    }
    assert.equal(referenced.size, H2_FIXTURE_ASSISTANT_ANSWER.citations.length)
    assert.equal(H2_FIXTURE_ASSISTANT_ANSWER.refusedControlClaim, true)
  })

  it('compute every allowed review transition and reject forbidden pairs', () => {
    assert.deepEqual(H2_REVIEW_ACTIONS, [
      'confirm',
      'reject',
      'resolve',
      'reopen',
      'add_note',
    ])
    assert.equal(nextH2ReviewState('open', 'confirm'), 'confirmed')
    assert.equal(nextH2ReviewState('open', 'reject'), 'dismissed')
    assert.equal(nextH2ReviewState('confirmed', 'resolve'), 'resolved')
    assert.equal(nextH2ReviewState('confirmed', 'reopen'), 'open')
    assert.equal(nextH2ReviewState('dismissed', 'reopen'), 'open')
    assert.equal(nextH2ReviewState('resolved', 'reopen'), 'open')
    assert.equal(nextH2ReviewState('resolved', 'add_note'), 'resolved')
    assert.throws(
      () => nextH2ReviewState('dismissed', 'confirm'),
      /review\.invalid_transition/,
    )
    assert.throws(
      () => nextH2ReviewState('open', 'resolve'),
      /review\.invalid_transition/,
    )
  })
})

const reportKinds: readonly H2ReportKind[] = [
  'single_event_diagnosis',
  'period_summary',
  'pcc_daily_compliance',
  'analysis_result_json',
  'submission_csv',
  'validation_metrics',
  'quality_report',
  'review_audit_json',
]

function consumeReviewBoundary(
  source: H2SentinelDataSource,
  request: H2ReviewEventRequest,
): Promise<readonly [H2EventReview, H2ReviewMutationReceipt]> {
  return Promise.all([
    source.getEventReview(request.runId, request.eventId),
    source.reviewEvent(request),
  ])
}

void reportKinds
void consumeReviewBoundary
