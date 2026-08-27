import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

import {
  H2_FIXTURE_ANALYSIS_RUN,
  H2_FIXTURE_ASSISTANT_ANSWER,
  H2_FIXTURE_DATASET,
  H2_FIXTURE_PROVENANCE,
  H2_FIXTURE_QUALITY_REPORT,
  H2_GOLDEN_C03_EVENT,
  H2_GOLDEN_C04_EVENT,
  type H2AssistantRequest,
} from '@opendashboard/h2-contracts'
import {
  createFixtureH2EmsDataSource,
  createLiveH2EmsDataSource,
  H2EmsAdapterError,
} from '../src/index.ts'

type JsonRecord = Record<string, unknown>

const response = (value: unknown): Response =>
  ({
    ok: true,
    status: 200,
    json: async () => value,
  }) as Response

const envelope = (data: unknown): JsonRecord => ({
  ok: true,
  status: 'success',
  data,
  warnings: [],
  provenance: H2_FIXTURE_PROVENANCE,
})

const sourceFor = (body: unknown) =>
  createLiveH2EmsDataSource({
    enabled: true,
    baseUrl: 'http://127.0.0.1:8123/',
    fetchFn: async () => response(body),
  })

const clone = <T>(value: T): T => structuredClone(value)

const fixtureAssistantRequest = {
  runId: H2_FIXTURE_ASSISTANT_ANSWER.runId,
  questionId: H2_FIXTURE_ASSISTANT_ANSWER.questionId,
  eventId: H2_FIXTURE_ASSISTANT_ANSWER.eventId,
  allowLlmRendering: false,
} as const

function validLiveAssistantAnswer(): JsonRecord {
  return clone(H2_FIXTURE_ASSISTANT_ANSWER) as unknown as JsonRecord
}

async function rejectsInvalid(action: () => Promise<unknown>): Promise<void> {
  await assert.rejects(
    action,
    (error: unknown) =>
      error instanceof H2EmsAdapterError &&
      error.code === 'remote_response_invalid' &&
      !error.message.includes('password'),
  )
}

describe('H2 EMS remote response validation', () => {
  it('rejects malformed data and never exposes raw response text', async () => {
    await rejectsInvalid(() =>
      sourceFor({ invalid: 'password=not-for-ui' }).getMode(),
    )
  })

  it('enforces the closed envelope, warning, error, and provenance contracts', async () => {
    const warning = { code: 'partial', message: 'Partial result', evidenceIds: [] }
    const invalidEnvelopes: unknown[] = [
      { ...envelope('LIVE_ANALYSIS'), unexpected: true },
      { ...envelope('LIVE_ANALYSIS'), warnings: [warning] },
      { ...envelope('LIVE_ANALYSIS'), status: 'warning', warnings: [] },
      { ...envelope('LIVE_ANALYSIS'), status: 'warning', warnings: [{ ...warning, unexpected: true }] },
      { ...envelope('LIVE_ANALYSIS'), status: 'warning', warnings: [{ code: 'partial', message: 'Partial result' }] },
      { ...envelope('LIVE_ANALYSIS'), provenance: { ...H2_FIXTURE_PROVENANCE, mode: 'NOT_A_MODE' } },
      { ...envelope('LIVE_ANALYSIS'), provenance: { ...H2_FIXTURE_PROVENANCE, generatedAt: 'not-a-date' } },
      { ...envelope('LIVE_ANALYSIS'), provenance: { ...H2_FIXTURE_PROVENANCE, unexpected: true } },
      { ...envelope('LIVE_ANALYSIS'), provenance: { ...H2_FIXTURE_PROVENANCE, limitations: [7] } },
      {
        ok: false,
        status: 'error',
        error: {
          code: 'upstream_failure',
          message: 'Redacted',
          retryable: false,
          incidentId: 'incident-1',
          details: [],
          unexpected: true,
        },
        warnings: [],
        provenance: H2_FIXTURE_PROVENANCE,
      },
    ]

    for (const invalidEnvelope of invalidEnvelopes) {
      await rejectsInvalid(() => sourceFor(invalidEnvelope).getMode())
    }

    const validError = {
      ok: false,
      status: 'error',
      error: {
        code: 'upstream_failure',
        message: 'Redacted',
        retryable: true,
        incidentId: 'incident-1',
        details: [],
      },
      warnings: [warning],
      provenance: H2_FIXTURE_PROVENANCE,
    }
    await assert.rejects(
      () => sourceFor(validError).getMode(),
      (error: unknown) =>
        error instanceof H2EmsAdapterError &&
        error.code === 'remote_error' &&
        error.retryable,
    )
  })

  it('rejects the previously accepted shallow event and correlated nested mutations', async () => {
    const shallowEvent = {
      schemaVersion: 1,
      eventId: 'event-unsafe',
      code: 'C99',
      subtype: 'ANYTHING',
      title: 'Unsafe',
      startTime: '2026-01-01T00:00:00Z',
      endTime: '2026-01-01T00:01:00Z',
      firstDetectionTime: '2026-01-01T00:00:00Z',
      severity: 'extreme',
      confidence: 7,
      evidence: [],
      safetyChecks: [],
      recommendations: [],
      rootCause: 'Unknown',
      rootCauseKind: 'guess',
      reviewState: 'unchecked',
      requiresHumanConfirmation: false,
      provenance: { ...H2_FIXTURE_PROVENANCE, mode: 'NOT_A_MODE' },
    }
    await rejectsInvalid(() =>
      sourceFor(envelope(shallowEvent)).getEvent('run-1', 'event-unsafe'),
    )

    const mutations: Array<(event: JsonRecord) => void> = [
      (event) => { event.confidence = Number.NaN },
      (event) => { event.confidence = 1.01 },
      (event) => { event.firstDetectionTime = '2025-01-01T00:00:00Z' },
      (event) => { event.startTime = '2026-02-31T00:00:00Z' },
      (event) => { delete event.primaryControlObject },
      (event) => {
        ;(event.primaryControlObject as JsonRecord).type = 'UNSAFE_CONTROL'
      },
      (event) => {
        delete ((event.affectedEquipment as JsonRecord[])[0] as JsonRecord).displayName
      },
      (event) => {
        ;((event.evidence as JsonRecord[])[0] as JsonRecord).actualValue = Number.NaN
      },
      (event) => {
        ;((event.evidence as JsonRecord[])[0] as JsonRecord).kind = 'raw_secret'
      },
      (event) => { delete event.impact },
      (event) => {
        ;(event.impact as JsonRecord).metric = 'pcc_power_limit_violation_energy_kwh'
      },
      (event) => { event.subtype = 'EXPORT_POWER_LIMIT_NOT_TRACKED' },
      (event) => {
        ;((event.safetyChecks as JsonRecord[])[0] as JsonRecord).status = 'trusted'
      },
      (event) => {
        ;((event.recommendations as JsonRecord[])[0] as JsonRecord).requiresHumanConfirmation = false
      },
    ]

    for (const mutate of mutations) {
      const event = clone(H2_GOLDEN_C03_EVENT) as unknown as JsonRecord
      mutate(event)
      await rejectsInvalid(() =>
        sourceFor(envelope(event)).getEvent('run-1', H2_GOLDEN_C03_EVENT.eventId),
      )
    }
  })

  it('deeply validates dataset and quality payloads', async () => {
    const datasetMutations: Array<(dataset: JsonRecord) => void> = [
      (dataset) => { dataset.rowCount = -1 },
      (dataset) => { dataset.samplingIntervalMinutes = 0 },
      (dataset) => { dataset.fingerprint = 'not-a-sha256' },
      (dataset) => { dataset.sourceFilename = 'C:\\Users\\operator\\private.csv' },
      (dataset) => { dataset.sourceFilename = '../x.csv' },
      (dataset) => {
        dataset.timeRange = {
          startTime: '2026-01-02T00:00:00Z',
          endTime: '2026-01-01T00:00:00Z',
        }
      },
      (dataset) => {
        ;((dataset.fields as JsonRecord[])[0] as JsonRecord).role = 'secret'
      },
      (dataset) => {
        ;((dataset.fields as JsonRecord[])[0] as JsonRecord).unexpected = true
      },
    ]
    for (const mutate of datasetMutations) {
      const dataset = clone(H2_FIXTURE_DATASET) as unknown as JsonRecord
      mutate(dataset)
      await rejectsInvalid(() => sourceFor(envelope([dataset])).listDatasets())
    }

    const qualityMutations: Array<(quality: JsonRecord) => void> = [
      (quality) => { quality.status = 'trusted' },
      (quality) => { quality.rowCount = 1.5 },
      (quality) => {
        ;((quality.checks as JsonRecord[])[0] as JsonRecord).code = 'unchecked'
      },
      (quality) => {
        ;((quality.checks as JsonRecord[])[0] as JsonRecord).observedValue = Number.POSITIVE_INFINITY
      },
      (quality) => {
        ;((quality.checks as JsonRecord[])[0] as JsonRecord).provenance = { mode: 'FIXTURE' }
      },
    ]
    for (const mutate of qualityMutations) {
      const quality = clone(H2_FIXTURE_QUALITY_REPORT) as unknown as JsonRecord
      mutate(quality)
      await rejectsInvalid(() => sourceFor(envelope(quality)).getDataQuality('dataset-1'))
    }

    const importedDataset = clone(H2_FIXTURE_DATASET) as unknown as JsonRecord
    ;((importedDataset.fields as JsonRecord[])[0] as JsonRecord).required = 'yes'
    await rejectsInvalid(() =>
      sourceFor(envelope({
        dataset: importedDataset,
        quality: H2_FIXTURE_QUALITY_REPORT,
      })).importCsv({ filename: 'input.csv', text: 'timestamp\n' }),
    )
  })

  it('deeply validates analysis, series, and assistant payloads', async () => {
    const analysisMutations: Array<(run: JsonRecord) => void> = [
      (run) => { run.status = 'trusted' },
      (run) => { delete (run.eventCountsByCode as JsonRecord).C07 },
      (run) => { (run.eventCountsBySeverity as JsonRecord).critical = -1 },
      (run) => {
        ;((run.events as JsonRecord[])[0] as JsonRecord).confidence = 2
      },
    ]
    for (const mutate of analysisMutations) {
      const run = clone(H2_FIXTURE_ANALYSIS_RUN) as unknown as JsonRecord
      mutate(run)
      await rejectsInvalid(() => sourceFor(envelope(run)).getOverview('run-1'))
    }

    const invalidSeries = {
      runId: 'run-1',
      variables: ['pcc_power_kw'],
      points: [{ timestamp: 'not-a-date', values: { pcc_power_kw: Number.NaN } }],
    }
    await rejectsInvalid(() =>
      sourceFor(envelope(invalidSeries)).getSeries({
        runId: 'run-1',
        variables: ['pcc_power_kw'],
        startTime: '2026-01-01T00:00:00Z',
        endTime: '2026-01-01T00:01:00Z',
      }),
    )

    const assistantMutations: Array<(answer: JsonRecord) => void> = [
      (answer) => { answer.questionId = 'H2Q99' },
      (answer) => { answer.mode = 'UNTRUSTED_LLM' },
      (answer) => { answer.generatedAt = 'yesterday' },
      (answer) => { answer.sections = [] },
      (answer) => {
        ;((answer.sections as JsonRecord[])[0] as JsonRecord).claimKind = 'opinion'
      },
      (answer) => {
        ;((answer.citations as JsonRecord[])[0] as JsonRecord).sourceType = 'credential'
      },
    ]
    for (const mutate of assistantMutations) {
      const answer = clone(H2_FIXTURE_ASSISTANT_ANSWER) as unknown as JsonRecord
      mutate(answer)
      await rejectsInvalid(() => sourceFor(envelope(answer)).ask({
        runId: 'run-1',
        questionId: 'H2Q01' as unknown as H2AssistantRequest['questionId'],
        allowLlmRendering: false,
      }))
    }
  })

  it('rejects replayed request identities and internally contradictory payloads', async () => {
    const mismatchedImport = {
      dataset: H2_FIXTURE_DATASET,
      quality: {
        ...H2_FIXTURE_QUALITY_REPORT,
        datasetId: 'another-dataset',
        rowCount: H2_FIXTURE_QUALITY_REPORT.rowCount + 1,
      },
    }
    await rejectsInvalid(() =>
      sourceFor(envelope(mismatchedImport)).importCsv({
        filename: 'input.csv',
        text: 'timestamp\n',
      }),
    )

    const replayedQuality = {
      ...H2_FIXTURE_QUALITY_REPORT,
      datasetId: 'another-dataset',
    }
    await rejectsInvalid(() =>
      sourceFor(envelope(replayedQuality)).getDataQuality(H2_FIXTURE_DATASET.datasetId),
    )

    const mismatchedFingerprint = clone(H2_FIXTURE_DATASET) as unknown as JsonRecord
    mismatchedFingerprint.provenance = {
      ...H2_FIXTURE_PROVENANCE,
      datasetFingerprint: `sha256:${'0'.repeat(64)}`,
    }
    await rejectsInvalid(() =>
      sourceFor(envelope([mismatchedFingerprint])).listDatasets(),
    )

    const mismatchedCount = clone(H2_FIXTURE_ANALYSIS_RUN) as unknown as JsonRecord
    ;(mismatchedCount.eventCountsByCode as JsonRecord).C03 = 99
    await rejectsInvalid(() =>
      sourceFor(envelope(mismatchedCount)).getOverview(H2_FIXTURE_ANALYSIS_RUN.runId),
    )

    const replayedRun = clone(H2_FIXTURE_ANALYSIS_RUN) as unknown as JsonRecord
    ;(replayedRun.dataset as JsonRecord).datasetId = 'another-dataset'
    ;(replayedRun.quality as JsonRecord).datasetId = 'another-dataset'
    await rejectsInvalid(() =>
      sourceFor(envelope(replayedRun)).runAnalysis(H2_FIXTURE_DATASET.datasetId),
    )

    const replayedOverview = {
      ...H2_FIXTURE_ANALYSIS_RUN,
      runId: 'another-run',
    }
    await rejectsInvalid(() =>
      sourceFor(envelope(replayedOverview)).getOverview(H2_FIXTURE_ANALYSIS_RUN.runId),
    )

    const replayedEvent = {
      ...H2_GOLDEN_C03_EVENT,
      eventId: 'another-event',
    }
    await rejectsInvalid(() =>
      sourceFor(envelope(replayedEvent)).getEvent(
        H2_FIXTURE_ANALYSIS_RUN.runId,
        H2_GOLDEN_C03_EVENT.eventId,
      ),
    )

    const seriesRequest = {
      runId: H2_FIXTURE_ANALYSIS_RUN.runId,
      variables: ['pcc_power_kw', 'bess_power_kw'],
      startTime: '2026-01-05T10:20:00Z',
      endTime: '2026-01-05T10:21:00Z',
    }
    const replayedSeries = {
      runId: 'another-run',
      variables: [...seriesRequest.variables].reverse(),
      points: [{
        timestamp: seriesRequest.startTime,
        values: { pcc_power_kw: 1, bess_power_kw: 2 },
      }],
    }
    await rejectsInvalid(() =>
      sourceFor(envelope(replayedSeries)).getSeries(seriesRequest),
    )

    const assistantBase = validLiveAssistantAnswer()
    const replayedAnswer = {
      ...assistantBase,
      runId: 'another-run',
    }
    await rejectsInvalid(() =>
      sourceFor(envelope(replayedAnswer)).ask(fixtureAssistantRequest),
    )

    const forbiddenLlmAnswer = {
      ...assistantBase,
      mode: 'LLM_RENDERED',
    }
    await rejectsInvalid(() =>
      sourceFor(envelope(forbiddenLlmAnswer)).ask(fixtureAssistantRequest),
    )

    const falseControlBoundary = {
      ...assistantBase,
      refusedControlClaim: false,
    }
    await rejectsInvalid(() =>
      sourceFor(envelope(falseControlBoundary)).ask(fixtureAssistantRequest),
    )
  })

  it('rejects a CSV import result replayed under another filename', async () => {
    const fixtureText = await readFile(
      new URL('../../../packages/h2-contracts/fixtures/tiny-valid-timeseries.csv', import.meta.url),
      'utf8',
    )
    const canonicalResult = {
      dataset: H2_FIXTURE_DATASET,
      quality: H2_FIXTURE_QUALITY_REPORT,
    }

    await rejectsInvalid(() =>
      sourceFor(envelope(canonicalResult)).importCsv({
        filename: 'replayed.csv',
        text: fixtureText,
      }),
    )
  })

  it('rejects contradictory quality summaries with otherwise valid shapes', async () => {
    const message = H2_FIXTURE_QUALITY_REPORT.checks[0].message
    const mutations: Array<(quality: JsonRecord) => void> = [
      (quality) => {
        const check = (quality.checks as JsonRecord[])[0] as JsonRecord
        check.status = 'blocked'
        check.severity = 'blocking'
        quality.blockingReasons = [message]
      },
      (quality) => {
        quality.status = 'warning'
        quality.warnings = ['Unrelated warning']
      },
      (quality) => {
        const check = (quality.checks as JsonRecord[])[0] as JsonRecord
        check.status = 'warning'
        check.severity = 'info'
        quality.status = 'warning'
        quality.warnings = [message]
      },
      (quality) => {
        const check = (quality.checks as JsonRecord[])[0] as JsonRecord
        check.status = 'blocked'
        check.severity = 'blocking'
        quality.status = 'blocked'
        quality.blockingReasons = ['Different blocking reason']
      },
    ]

    for (const mutate of mutations) {
      const quality = clone(H2_FIXTURE_QUALITY_REPORT) as unknown as JsonRecord
      mutate(quality)
      await rejectsInvalid(() =>
        sourceFor(envelope(quality)).getDataQuality(H2_FIXTURE_DATASET.datasetId),
      )
    }
  })

  it('rejects a CSV import result replayed for different UTF-8 content', async () => {
    const canonicalResult = {
      dataset: H2_FIXTURE_DATASET,
      quality: H2_FIXTURE_QUALITY_REPORT,
    }
    await rejectsInvalid(() =>
      sourceFor(envelope(canonicalResult)).importCsv({
        filename: H2_FIXTURE_DATASET.sourceFilename,
        text: 'timestamp,reading\npassword=not-for-ui,1\n',
      }),
    )
  })

  it('binds series points to requested variables, range, and order', async () => {
    const request = {
      runId: H2_FIXTURE_ANALYSIS_RUN.runId,
      variables: ['pcc_power_kw', 'bess_power_kw'],
      startTime: '2026-01-05T10:20:00Z',
      endTime: '2026-01-05T10:22:00Z',
    }
    const valid = {
      runId: request.runId,
      variables: request.variables,
      points: [
        {
          timestamp: '2026-01-05T10:20:00Z',
          values: { pcc_power_kw: 10, bess_power_kw: -5 },
        },
        {
          timestamp: '2026-01-05T10:21:00Z',
          values: { pcc_power_kw: 11, bess_power_kw: -4 },
        },
      ],
    }
    const mutations: Array<(series: JsonRecord) => void> = [
      (series) => {
        delete (((series.points as JsonRecord[])[0] as JsonRecord).values as JsonRecord).bess_power_kw
      },
      (series) => {
        ;(((series.points as JsonRecord[])[0] as JsonRecord).values as JsonRecord).secret_value = 1
      },
      (series) => {
        ;((series.points as JsonRecord[])[0] as JsonRecord).timestamp = '2026-01-05T10:19:59Z'
      },
      (series) => {
        const points = series.points as JsonRecord[]
        ;[points[0], points[1]] = [points[1] as JsonRecord, points[0] as JsonRecord]
      },
    ]

    for (const mutate of mutations) {
      const series = clone(valid) as unknown as JsonRecord
      mutate(series)
      await rejectsInvalid(() => sourceFor(envelope(series)).getSeries(request))
    }
  })

  it('rejects dangling and duplicate assistant citations', async () => {
    const dangling = validLiveAssistantAnswer()
    ;((dangling.sections as JsonRecord[])[0] as JsonRecord).citationIds = ['missing-citation']
    await rejectsInvalid(() => sourceFor(envelope(dangling)).ask(fixtureAssistantRequest))

    const duplicate = validLiveAssistantAnswer()
    const firstCitation = (duplicate.citations as JsonRecord[])[0] as JsonRecord
    ;(duplicate.citations as JsonRecord[]).push(clone(firstCitation))
    await rejectsInvalid(() => sourceFor(envelope(duplicate)).ask(fixtureAssistantRequest))
  })

  it('accepts the canonical mixed-claim assistant citation chain', async () => {
    const answer = await sourceFor(
      envelope(validLiveAssistantAnswer()),
    ).ask(fixtureAssistantRequest)
    assert.equal(answer.answerId, H2_FIXTURE_ASSISTANT_ANSWER.answerId)
  })

  it('requires unique assistant section identifiers', async () => {
    const answer = validLiveAssistantAnswer()
    const sections = answer.sections as JsonRecord[]
    sections.push(clone(sections[0]!))
    await rejectsInvalid(() => sourceFor(envelope(answer)).ask(fixtureAssistantRequest))
  })

  it('requires each assistant section to cite a nonempty unique set', async () => {
    for (const citationIds of [[], ['citation-C03-EV-003', 'citation-C03-EV-003']]) {
      const answer = validLiveAssistantAnswer()
      ;((answer.sections as JsonRecord[])[0] as JsonRecord).citationIds = citationIds
      await rejectsInvalid(() => sourceFor(envelope(answer)).ask(fixtureAssistantRequest))
    }
  })

  it('keeps event-scoped assistant citations on the requested event', async () => {
    const mismatched = validLiveAssistantAnswer()
    ;((mismatched.citations as JsonRecord[])[0] as JsonRecord).eventId =
      H2_GOLDEN_C04_EVENT.eventId
    await rejectsInvalid(() => sourceFor(envelope(mismatched)).ask(fixtureAssistantRequest))

    for (const sourceType of ['event', 'evidence', 'constraint']) {
      const missing = validLiveAssistantAnswer()
      const citation = (missing.citations as JsonRecord[])[0] as JsonRecord
      citation.sourceType = sourceType
      delete citation.eventId
      await rejectsInvalid(() => sourceFor(envelope(missing)).ask(fixtureAssistantRequest))
    }
  })

  it('rejects assistant citations that no section uses', async () => {
    const answer = validLiveAssistantAnswer()
    const citations = answer.citations as JsonRecord[]
    citations.push({ ...clone(citations[0]!), citationId: 'unused-citation' })
    await rejectsInvalid(() => sourceFor(envelope(answer)).ask(fixtureAssistantRequest))
  })

  it('rejects duplicate and dangling event evidence and safety references', async () => {
    const mutations: Array<(event: JsonRecord) => void> = [
      (event) => {
        const evidence = event.evidence as JsonRecord[]
        evidence[1]!.evidenceId = evidence[0]!.evidenceId
      },
      (event) => {
        const checks = event.safetyChecks as JsonRecord[]
        checks[1]!.checkId = checks[0]!.checkId
      },
      (event) => {
        const recommendations = event.recommendations as JsonRecord[]
        recommendations.push(clone(recommendations[0]!))
      },
      (event) => {
        ;(event.impact as JsonRecord).evidenceIds = ['missing-evidence']
      },
      (event) => {
        const evidenceId = ((event.impact as JsonRecord).evidenceIds as string[])[0]
        ;(event.impact as JsonRecord).evidenceIds = [evidenceId, evidenceId]
      },
      (event) => {
        ;((event.safetyChecks as JsonRecord[])[0] as JsonRecord).evidenceIds = ['missing-evidence']
      },
      (event) => {
        const check = (event.safetyChecks as JsonRecord[])[0] as JsonRecord
        const evidenceId = (check.evidenceIds as string[])[0]
        check.evidenceIds = [evidenceId, evidenceId]
      },
      (event) => {
        ;((event.recommendations as JsonRecord[])[0] as JsonRecord).evidenceIds = ['missing-evidence']
      },
      (event) => {
        const recommendation = (event.recommendations as JsonRecord[])[0] as JsonRecord
        const evidenceId = (recommendation.evidenceIds as string[])[0]
        recommendation.evidenceIds = [evidenceId, evidenceId]
      },
      (event) => {
        ;((event.recommendations as JsonRecord[])[0] as JsonRecord).safetyCheckIds = ['missing-check']
      },
      (event) => {
        const recommendation = (event.recommendations as JsonRecord[])[0] as JsonRecord
        const checkId = (recommendation.safetyCheckIds as string[])[0]
        recommendation.safetyCheckIds = [checkId, checkId]
      },
    ]

    for (const mutate of mutations) {
      const event = clone(H2_GOLDEN_C03_EVENT) as unknown as JsonRecord
      mutate(event)
      await rejectsInvalid(() =>
        sourceFor(envelope(event)).getEvent(
          H2_FIXTURE_ANALYSIS_RUN.runId,
          H2_GOLDEN_C03_EVENT.eventId,
        ),
      )
    }
  })

  it('rejects duplicate event identities in an analysis run', async () => {
    const run = clone(H2_FIXTURE_ANALYSIS_RUN) as unknown as JsonRecord
    const events = run.events as JsonRecord[]
    events[1]!.eventId = events[0]!.eventId
    await rejectsInvalid(() =>
      sourceFor(envelope(run)).getOverview(H2_FIXTURE_ANALYSIS_RUN.runId),
    )
  })

  it('rejects duplicate event identities in a list response', async () => {
    const events = clone([
      H2_GOLDEN_C03_EVENT,
      H2_GOLDEN_C04_EVENT,
    ]) as unknown as JsonRecord[]
    events[1]!.eventId = events[0]!.eventId
    await rejectsInvalid(() =>
      sourceFor(envelope(events)).listEvents(H2_FIXTURE_ANALYSIS_RUN.runId),
    )
  })

  it('rejects provenance contradictions across quality, run, and event data', async () => {
    const foreignProvenance = {
      ...H2_FIXTURE_PROVENANCE,
      mode: 'LIVE_ANALYSIS',
      datasetFingerprint: `sha256:${'0'.repeat(64)}`,
    }
    const eventMutations: Array<(event: JsonRecord) => void> = [
      (event) => {
        ;((event.evidence as JsonRecord[])[0] as JsonRecord).provenance = foreignProvenance
      },
      (event) => {
        ;(event.impact as JsonRecord).provenance = foreignProvenance
      },
      (event) => {
        ;((event.safetyChecks as JsonRecord[])[0] as JsonRecord).provenance = foreignProvenance
      },
      (event) => {
        ;((event.recommendations as JsonRecord[])[0] as JsonRecord).provenance = foreignProvenance
      },
    ]

    for (const mutate of eventMutations) {
      const event = clone(H2_GOLDEN_C03_EVENT) as unknown as JsonRecord
      mutate(event)
      await rejectsInvalid(() =>
        sourceFor(envelope(event)).getEvent(
          H2_FIXTURE_ANALYSIS_RUN.runId,
          H2_GOLDEN_C03_EVENT.eventId,
        ),
      )
    }

    const runMutations: Array<(run: JsonRecord) => void> = [
      (run) => {
        const quality = run.quality as JsonRecord
        quality.provenance = foreignProvenance
        for (const check of quality.checks as JsonRecord[]) {
          check.provenance = foreignProvenance
        }
      },
      (run) => { run.provenance = foreignProvenance },
      (run) => {
        const event = (run.events as JsonRecord[])[0] as JsonRecord
        event.provenance = foreignProvenance
        ;(event.impact as JsonRecord).provenance = foreignProvenance
        for (const evidence of event.evidence as JsonRecord[]) {
          evidence.provenance = foreignProvenance
        }
        for (const check of event.safetyChecks as JsonRecord[]) {
          check.provenance = foreignProvenance
        }
        for (const recommendation of event.recommendations as JsonRecord[]) {
          recommendation.provenance = foreignProvenance
        }
      },
    ]

    for (const mutate of runMutations) {
      const run = clone(H2_FIXTURE_ANALYSIS_RUN) as unknown as JsonRecord
      mutate(run)
      await rejectsInvalid(() =>
        sourceFor(envelope(run)).getOverview(H2_FIXTURE_ANALYSIS_RUN.runId),
      )
    }
  })

  it('correlates report kind, format, media type, filename, status, and content hash', async () => {
    const valid = await createFixtureH2EmsDataSource().exportReport({
      runId: H2_FIXTURE_ANALYSIS_RUN.runId,
      kind: 'single_event_diagnosis',
      eventId: H2_GOLDEN_C03_EVENT.eventId,
    })
    const mutations: Array<(artifact: JsonRecord) => void> = [
      (artifact) => { (artifact.descriptor as JsonRecord).format = 'json' },
      (artifact) => { artifact.mediaType = 'application/json' },
      (artifact) => { (artifact.descriptor as JsonRecord).filename = 'diagnosis.json' },
      (artifact) => { (artifact.descriptor as JsonRecord).status = 'trusted' },
      (artifact) => { (artifact.descriptor as JsonRecord).generatedAt = 'invalid-date' },
      (artifact) => { (artifact.descriptor as JsonRecord).kind = 'unknown_report' },
      (artifact) => { (artifact.descriptor as JsonRecord).unexpected = true },
      (artifact) => { artifact.content = `${valid.content}\ntampered` },
    ]

    for (const mutate of mutations) {
      const artifact = clone(valid) as unknown as JsonRecord
      mutate(artifact)
      await rejectsInvalid(() =>
        sourceFor(envelope(artifact)).exportReport({
          runId: H2_FIXTURE_ANALYSIS_RUN.runId,
          kind: 'single_event_diagnosis',
          eventId: H2_GOLDEN_C03_EVENT.eventId,
        }),
      )
    }

    const replayed = clone(valid) as unknown as JsonRecord
    ;(replayed.descriptor as JsonRecord).runId = 'another-run'
    ;(replayed.descriptor as JsonRecord).contentHash = valid.descriptor.contentHash
    await rejectsInvalid(() =>
      sourceFor(envelope(replayed)).exportReport({
        runId: H2_FIXTURE_ANALYSIS_RUN.runId,
        kind: 'single_event_diagnosis',
        eventId: H2_GOLDEN_C03_EVENT.eventId,
      }),
    )

    await rejectsInvalid(() =>
      sourceFor(envelope(valid)).exportSubmission(H2_FIXTURE_ANALYSIS_RUN.runId),
    )

    const period = await createFixtureH2EmsDataSource().exportReport({
      runId: H2_FIXTURE_ANALYSIS_RUN.runId,
      kind: 'period_summary',
    })
    const periodWithUnexpectedEvent = clone(period) as unknown as JsonRecord
    ;(periodWithUnexpectedEvent.descriptor as JsonRecord).eventId = H2_GOLDEN_C03_EVENT.eventId
    await rejectsInvalid(() =>
      sourceFor(envelope(periodWithUnexpectedEvent)).exportReport({
        runId: H2_FIXTURE_ANALYSIS_RUN.runId,
        kind: 'period_summary',
      }),
    )
  })
})
