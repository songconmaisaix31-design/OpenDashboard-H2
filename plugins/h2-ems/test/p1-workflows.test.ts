import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, it } from 'node:test'

import {
  H2_ASSISTANT_QUESTIONS,
  H2_FIXTURE_ANALYSIS_RUN,
  H2_FIXTURE_EVENT_REVIEW,
  H2_FIXTURE_PROVENANCE,
  H2_GOLDEN_C03_EVENT,
  H2_GOLDEN_C04_EVENT,
  type H2AnomalyEvent,
  type H2AssistantQuestionId,
  type H2EventReview,
  type H2ReviewEntry,
  type H2ReviewEventRequest,
} from '@opendashboard/h2-contracts'
import {
  createFixtureH2EmsDataSource,
  createLiveH2EmsDataSource,
  H2EmsAdapterError,
} from '../src/index.ts'

const fixtureRunId = H2_FIXTURE_ANALYSIS_RUN.runId
const eventContextByQuestion: Partial<Record<H2AssistantQuestionId, string>> = {
  Q02: H2_GOLDEN_C04_EVENT.eventId,
  Q03: H2_GOLDEN_C03_EVENT.eventId,
  Q09: H2_GOLDEN_C03_EVENT.eventId,
  Q10: H2_GOLDEN_C04_EVENT.eventId,
}

const successEnvelope = (data: unknown): Response => Response.json({
  ok: true,
  status: 'success',
  data,
  warnings: [],
  provenance: H2_FIXTURE_PROVENANCE,
})

describe('H2 EMS P1 Fixture workflows', () => {
  it('answers every official question deterministically and binds Q09 to one Chinese report', async () => {
    const source = createFixtureH2EmsDataSource()

    for (const { questionId } of H2_ASSISTANT_QUESTIONS) {
      const eventId = eventContextByQuestion[questionId]
      const request = {
        runId: fixtureRunId,
        questionId,
        ...(eventId ? { eventId } : {}),
        allowLlmRendering: false,
      }
      const answer = await source.ask(request)
      const llmCompatibilityAnswer = await source.ask({
        ...request,
        allowLlmRendering: true,
      })

      assert.deepEqual(llmCompatibilityAnswer, answer)
      assert.equal(answer.questionId, questionId)
      assert.equal(answer.mode, 'DETERMINISTIC_TEMPLATE')
      assert.equal(answer.refusedControlClaim, true)
      assert(answer.sections.every(({ text }) => /[\u3400-\u9fff]/u.test(text)))
      const citationIds = new Set(answer.citations.map(({ citationId }) => citationId))
      assert(answer.sections.every(({ citationIds: references }) =>
        references.length > 0 && references.every((citationId) => citationIds.has(citationId)),
      ))

      if (questionId === 'Q09') {
        const report = answer.generatedReport
        assert(report)
        assert.equal(report.descriptor.eventId, eventId)
        assert.equal(report.descriptor.kind, 'single_event_diagnosis')
        assert.equal(report.mediaType, 'text/html')
        assert.match(report.content, /<html lang="zh-CN">/)
        assert.match(report.content, /FIXTURE · 固定样例/)
        assert.equal(
          report.descriptor.contentHash,
          `sha256:${createHash('sha256').update(report.content).digest('hex')}`,
        )
        assert.equal(
          answer.citations.filter(({ sourceType, sourceId }) =>
            sourceType === 'report' && sourceId === report.descriptor.reportId,
          ).length,
          1,
        )
      } else {
        assert.equal(answer.generatedReport, undefined)
      }
    }
  })

  it('enforces required and code-restricted event context with bounded error codes', async () => {
    const source = createFixtureH2EmsDataSource()
    await assert.rejects(
      () => source.ask({ runId: fixtureRunId, questionId: 'Q03', allowLlmRendering: false }),
      (error: unknown) => hasAdapterError(error, 'assistant_event_required', 'assistant.event_required'),
    )
    await assert.rejects(
      () => source.ask({
        runId: fixtureRunId,
        questionId: 'Q02',
        eventId: H2_GOLDEN_C03_EVENT.eventId,
        allowLlmRendering: false,
      }),
      (error: unknown) => hasAdapterError(error, 'assistant_event_mismatch', 'assistant.event_mismatch'),
    )
  })

  it('keeps review mutations append-only, exactly-once, escaped, and separate from detection', async () => {
    const source = createFixtureH2EmsDataSource()
    const eventId = H2_GOLDEN_C03_EVENT.eventId
    const eventBefore = await source.getEvent(fixtureRunId, eventId)
    const submissionBefore = await source.exportSubmission(fixtureRunId)
    const confirmRequest = {
      schemaVersion: 1,
      requestId: 'p1-review-confirm-1',
      runId: fixtureRunId,
      eventId,
      action: 'confirm',
      expectedRevision: 0,
      actor: { kind: 'local_operator', displayName: '<script>alert(1)</script>' },
    } as const satisfies H2ReviewEventRequest

    await assert.rejects(
      () => source.reviewEvent({
        ...confirmRequest,
        requestId: 'p1-review-extra-field',
        unexpected: true,
      } as H2ReviewEventRequest),
      (error: unknown) => hasAdapterError(error, 'invalid_fixture_request', 'request.invalid'),
    )

    const confirmed = await source.reviewEvent(confirmRequest)
    assert.equal(confirmed.review.currentState, 'confirmed')
    assert.equal(confirmed.review.revision, 1)
    assert.equal(confirmed.entry.revision, 1)

    await assert.rejects(
      () => source.reviewEvent({ ...confirmRequest, action: 'add_note', note: 'changed' }),
      (error: unknown) => hasAdapterError(error, 'review_idempotency_conflict', 'review.idempotency_conflict'),
    )
    await assert.rejects(
      () => source.reviewEvent({
        ...confirmRequest,
        requestId: 'p1-review-stale-1',
        action: 'add_note',
        note: 'stale revision',
      }),
      (error: unknown) => hasAdapterError(error, 'review_conflict', 'review.conflict'),
    )
    await assert.rejects(
      () => source.reviewEvent({
        ...confirmRequest,
        requestId: 'p1-review-resolve-without-note',
        action: 'resolve',
        expectedRevision: 1,
      }),
      (error: unknown) => hasAdapterError(error, 'review_note_required', 'review.note_required'),
    )

    const resolved = await source.reviewEvent({
      ...confirmRequest,
      requestId: 'p1-review-resolve-1',
      action: 'resolve',
      expectedRevision: 1,
      note: '<img src=x onerror=alert(1)> 已现场核验',
    })
    assert.deepEqual(resolved.review.entries.map(({ revision }) => revision), [1, 2])
    assert.equal(resolved.review.currentState, 'resolved')

    const replay = await source.reviewEvent(confirmRequest)
    assert.equal(replay.replayed, true)
    assert.equal(replay.review.revision, 1)
    assert.equal((await source.getEventReview(fixtureRunId, eventId)).revision, 2)

    const eventAfter = await source.getEvent(fixtureRunId, eventId)
    const submissionAfter = await source.exportSubmission(fixtureRunId)
    assert.deepEqual(withoutReviewState(eventAfter), withoutReviewState(eventBefore))
    assert.equal(eventAfter.reviewState, 'resolved')
    assert.equal(submissionAfter.content, submissionBefore.content)

    const diagnosis = await source.exportReport({
      runId: fixtureRunId,
      kind: 'single_event_diagnosis',
      eventId,
    })
    assert.match(diagnosis.content, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
    assert.match(diagnosis.content, /&lt;img src=x onerror=alert\(1\)&gt;/)
    assert.doesNotMatch(diagnosis.content, /<script|<img/iu)

    const audit = await source.exportReport({ runId: fixtureRunId, kind: 'review_audit_json' })
    const payload = JSON.parse(audit.content) as {
      actorIdentityNotice: string
      events: Array<{ event: { eventId: string }; review: H2EventReview }>
    }
    assert.equal(payload.actorIdentityNotice, 'local_operator_labels_are_unverified')
    assert.deepEqual(payload.events.map(({ event }) => event.eventId), [
      H2_GOLDEN_C03_EVENT.eventId,
      H2_GOLDEN_C04_EVENT.eventId,
    ])
    assert.equal(payload.events[0]?.review.entries[1]?.note, '<img src=x onerror=alert(1)> 已现场核验')
  })

  it('requires a calendar-day scope for PCC reports and never fabricates quota evidence', async () => {
    const source = createFixtureH2EmsDataSource()
    await assert.rejects(
      () => source.exportReport({ runId: fixtureRunId, kind: 'pcc_daily_compliance' }),
      (error: unknown) => hasAdapterError(error, 'report_invalid_scope', 'report.invalid_scope'),
    )
    await assert.rejects(
      () => source.exportReport({
        runId: fixtureRunId,
        kind: 'pcc_daily_compliance',
        timeRange: {
          startTime: '2026-01-06T00:00:00Z',
          endTime: '2026-01-07T00:00:00Z',
        },
      }),
      (error: unknown) => hasAdapterError(error, 'report_invalid_scope', 'report.invalid_scope'),
    )
    const report = await source.exportReport({
      runId: fixtureRunId,
      kind: 'pcc_daily_compliance',
      timeRange: {
        startTime: '2026-01-05T00:00:00Z',
        endTime: '2026-01-06T00:00:00Z',
      },
    })
    assert.match(report.content, /PCC合规日报/)
    assert.match(report.content, /证据不足，未计算该项合规结论/)
    assert.doesNotMatch(report.content, /配额[^<]{0,30}=\s*0/)
  })
})

describe('H2 EMS P1 Live review routes', () => {
  it('uses exact GET and POST review routes and validates receipt identity', async () => {
    const entry = confirmedEntry()
    const review = confirmedReview(entry)
    const receipt = { schemaVersion: 1, replayed: false, entry, review } as const
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const source = createLiveH2EmsDataSource({
      enabled: true,
      baseUrl: 'http://127.0.0.1:8123/',
      fetchFn: async (input, init) => {
        calls.push({ url: input.toString(), ...(init ? { init } : {}) })
        return successEnvelope(init?.method === 'POST' ? receipt : H2_FIXTURE_EVENT_REVIEW)
      },
    })
    const request = {
      schemaVersion: 1,
      requestId: entry.requestId,
      runId: fixtureRunId,
      eventId: H2_GOLDEN_C03_EVENT.eventId,
      action: 'confirm',
      expectedRevision: 0,
      actor: entry.actor,
    } as const satisfies H2ReviewEventRequest

    assert.equal((await source.getEventReview(request.runId, request.eventId)).revision, 0)
    assert.equal((await source.reviewEvent(request)).review.currentState, 'confirmed')
    assert.equal(new URL(calls[0]?.url ?? '').pathname, `/api/v1/h2-sentinel/runs/${fixtureRunId}/events/${request.eventId}/review`)
    assert.equal(calls[0]?.init?.method, 'GET')
    assert.equal(new URL(calls[1]?.url ?? '').pathname, `/api/v1/h2-sentinel/runs/${fixtureRunId}/events/${request.eventId}:review`)
    assert.equal(calls[1]?.init?.method, 'POST')
    assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), request)
  })

  it('preserves only the safe remote conflict code and rejects malformed journals', async () => {
    const conflictSource = createLiveH2EmsDataSource({
      enabled: true,
      baseUrl: 'http://127.0.0.1:8123/',
      fetchFn: async () => Response.json({
        ok: false,
        status: 'error',
        error: {
          code: 'review.conflict',
          message: '已存在更新版本。',
          retryable: false,
          incidentId: 'incident-redacted-review-conflict',
          details: [],
        },
        warnings: [],
        provenance: H2_FIXTURE_PROVENANCE,
      }, { status: 409 }),
    })
    await assert.rejects(
      () => conflictSource.reviewEvent({
        schemaVersion: 1,
        requestId: 'p1-live-conflict',
        runId: fixtureRunId,
        eventId: H2_GOLDEN_C03_EVENT.eventId,
        action: 'confirm',
        expectedRevision: 0,
        actor: { kind: 'local_operator', displayName: 'local operator' },
      }),
      (error: unknown) => hasAdapterError(error, 'remote_error', 'review.conflict'),
    )

    const malformed = { ...H2_FIXTURE_EVENT_REVIEW, revision: 1 }
    const malformedSource = createLiveH2EmsDataSource({
      enabled: true,
      baseUrl: 'http://127.0.0.1:8123/',
      fetchFn: async () => successEnvelope(malformed),
    })
    await assert.rejects(
      () => malformedSource.getEventReview(fixtureRunId, H2_GOLDEN_C03_EVENT.eventId),
      (error: unknown) => error instanceof H2EmsAdapterError && error.code === 'remote_response_invalid',
    )
  })
})

function confirmedEntry(): H2ReviewEntry {
  return {
    schemaVersion: 1,
    entryId: 'review-entry-live-1',
    requestId: 'p1-live-review-1',
    revision: 1,
    action: 'confirm',
    previousState: 'open',
    nextState: 'confirmed',
    actor: { kind: 'local_operator', displayName: 'local operator' },
    createdAt: '2026-01-05T11:00:00Z',
  }
}

function confirmedReview(entry: H2ReviewEntry): H2EventReview {
  return {
    ...H2_FIXTURE_EVENT_REVIEW,
    currentState: 'confirmed',
    revision: 1,
    entries: [entry],
  }
}

function hasAdapterError(
  error: unknown,
  code: H2EmsAdapterError['code'],
  remoteCode: string,
): boolean {
  return error instanceof H2EmsAdapterError &&
    error.code === code &&
    error.remoteCode === remoteCode
}

function withoutReviewState(event: H2AnomalyEvent): Omit<H2AnomalyEvent, 'reviewState'> {
  const { reviewState: _reviewState, ...analysisOwned } = event
  return analysisOwned
}
