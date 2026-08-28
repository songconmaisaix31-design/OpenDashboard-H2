import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { assertEvaluationIdentity } from '../../../validation/overfit-sentinel.mjs'
import { EVALUATION_WINDOWS, OFFICIAL_SOURCES } from '../../../validation/lib/official-sources.mjs'
import {
  classifyEvents,
  matchEvents,
} from '../../../validation/lib/metrics.mjs'

const candidateCommit = 'a'.repeat(40)

function evaluationReport() {
  const source = OFFICIAL_SOURCES.validation
  const window = EVALUATION_WINDOWS.validation
  const runtime = {
    modelVersion: 'detector-v1',
    ruleVersion: 'rules-v1',
    configurationVersion: 'configuration-v1',
  }
  const firstDay = new Date('2026-01-01T00:00:00Z').getTime()
  const days = Array.from({ length: 90 }, (_, index) =>
    new Date(firstDay + index * 86_400_000).toISOString().slice(0, 10),
  )
  const chunks = days.map((day, index) => {
    const fingerprint = `sha256:${String(index).padStart(64, '0')}`
    const provenance = {
      mode: 'LIVE_ANALYSIS',
      source: 'in-memory-csv-import',
      generatedAt: `${day}T23:59:00Z`,
      datasetFingerprint: fingerprint,
      ...runtime,
      limitations: ['Local deterministic analysis.'],
    }
    return {
      day,
      sourceFilename: `validation-${day}.csv`,
      rowCount: 1_440,
      predictionCount: 0,
      fingerprint,
      importProvenance: { ...provenance, modelVersion: null },
      analysisRunId: `run-${index}`,
      analysisProvenance: { ...provenance },
    }
  })
  const zeroPredictionCounts = Object.fromEntries(
    Object.keys(window.byCode).map((code) => [code, 0]),
  )
  const byCodeMetrics = Object.fromEntries(
    Object.entries(window.byCode).map(([code, groundTruth]) => [code, {
      code,
      groundTruth,
      predictions: 0,
      tp: 0,
      fp: 0,
      fn: groundTruth,
      precision: 0,
      recall: 0,
      f1: 0,
    }]),
  )
  let truthSequence = 0
  const evaluatedGroundTruth = Object.entries(window.byCode).flatMap(([code, count]) =>
    Array.from({ length: count }, (_, index) => {
      const start = firstDay + truthSequence * 3_600_000
      truthSequence += 1
      return {
        id: `${code}-truth-${index}`,
        code,
        startTime: new Date(start).toISOString(),
        endTime: new Date(start + 30 * 60_000).toISOString(),
      }
    }),
  )
  const unmatchedGroundTruth = evaluatedGroundTruth.map(({ id, code }) => ({ id, code }))
  return {
    schemaVersion: 2,
    reportKind: 'h2_official_validation_evaluation',
    contractVersion: 'event-match-v2',
    set: 'validation',
    candidateCommit,
    trackedTreeClean: true,
    evaluationRunId: 'fresh-evaluation-run',
    parameters: {
      graceMinutes: 10,
      mergeGapMinutes: 2,
      limitDays: 0,
      minimumUtcDay: null,
      matching: 'greedy one-to-one same-code interval overlap with symmetric grace',
      chunking: 'UTC calendar day; adjacent same-code predictions merge across boundaries',
      firstDetectionDelayMinutes: 'prediction first_detection_time minus ground-truth start; negative means early warning',
      boundaryErrorMinutes: 'prediction boundary minus corresponding ground-truth boundary',
      zeroDenominatorMetrics: 'precision=0 when tp+fp=0; recall=0 when tp+fn=0; f1=0 when precision+recall=0',
      macroAveraging: 'unweighted arithmetic mean across C01-C07 precision, recall, and f1',
      runtimeInputMapping: 'verified official 69-field UTC-day chunk submitted unchanged; no labels',
    },
    dataset: {
      source: { ...source.timeseries, fieldCount: 69 },
      labels: { ...source.labels, uniqueEventIdCount: source.labels.eventCount },
      evaluatedWindow: {
        complete: true,
        firstUtcDay: days[0],
        lastUtcDay: days.at(-1),
        rowCount: window.rowCount,
        labelEventCount: window.labelCount,
      },
      publicLabelsUsedAsDetectorInput: false,
      labelAccessPhase: 'evaluation_only_after_analysis; labels never detector input',
      chunks,
    },
    groundTruth: {
      count: window.labelCount,
      totalPublicLabels: source.labels.eventCount,
      byCode: { ...window.byCode },
    },
    predictions: {
      rawCount: 0,
      mergedCount: 0,
      runtime,
      byCode: zeroPredictionCounts,
    },
    evaluatedEvents: {
      groundTruth: evaluatedGroundTruth,
      predictions: [],
    },
    metrics: {
      overall: { tp: 0, fp: 0, fn: 70, precision: 0, recall: 0, f1: 0 },
      timing: {
        firstDetectionDelay: { count: 0, meanMinutes: null, meanAbsoluteMinutes: null },
        startBoundaryError: { count: 0, meanMinutes: null, meanAbsoluteMinutes: null },
        endBoundaryError: { count: 0, meanMinutes: null, meanAbsoluteMinutes: null },
      },
      classification: {
        matches: 0,
        correctCode: 0,
        detectionPrecision: 0,
        detectionRecall: 0,
        detectionF1: 0,
        classificationAccuracy: 0,
        eventAccuracy: 0,
        matchedPairs: [],
        unmatchedGroundTruth: structuredClone(unmatchedGroundTruth),
        unmatchedPredictions: [],
      },
      macro: { precision: 0, recall: 0, f1: 0 },
      byCode: byCodeMetrics,
    },
    matches: [],
    unmatchedGroundTruth,
    unmatchedPredictions: [],
    provenance: {
      generatedAt: '2026-04-01T00:00:00Z',
      tool: 'validation/evaluate.mjs',
      limitations: ['Local public-data evaluation.'],
    },
  }
}

function refreshStructuralEvaluation(report) {
  const groundTruth = report.evaluatedEvents.groundTruth
  const predictions = report.evaluatedEvents.predictions
  const matching = matchEvents({
    groundTruth,
    predictions,
    graceMinutes: report.parameters.graceMinutes,
  })
  const classification = classifyEvents({
    groundTruth,
    predictions,
    graceMinutes: report.parameters.graceMinutes,
  })
  report.groundTruth.count = groundTruth.length
  report.groundTruth.byCode = Object.fromEntries(
    Object.keys(report.groundTruth.byCode).map((code) => [
      code,
      groundTruth.filter((event) => event.code === code).length,
    ]),
  )
  report.dataset.evaluatedWindow.labelEventCount = groundTruth.length
  report.predictions.rawCount = predictions.length
  report.predictions.mergedCount = predictions.length
  report.predictions.byCode = Object.fromEntries(
    Object.keys(report.predictions.byCode).map((code) => [
      code,
      predictions.filter((event) => event.code === code).length,
    ]),
  )
  report.dataset.chunks.forEach((chunk) => { chunk.predictionCount = 0 })
  report.dataset.chunks[0].predictionCount = predictions.length
  report.matches = matching.matches
  report.unmatchedGroundTruth = matching.unmatchedGroundTruth
  report.unmatchedPredictions = matching.unmatchedPredictions
  report.metrics.overall = Object.fromEntries(
    ['tp', 'fp', 'fn', 'precision', 'recall', 'f1'].map((key) => [key, matching[key]]),
  )
  report.metrics.timing = matching.timing
  report.metrics.classification = classification
  report.metrics.byCode = Object.fromEntries(
    matching.byCode.map((entry) => [entry.code, entry]),
  )
  report.metrics.macro = Object.fromEntries(
    ['precision', 'recall', 'f1'].map((metric) => [
      metric,
      Object.values(report.metrics.byCode).reduce(
        (total, entry) => total + entry[metric],
        0,
      ) / 7,
    ]),
  )
  return report
}

function evaluationReportWithMatch() {
  const report = evaluationReport()
  const truth = report.evaluatedEvents.groundTruth[0]
  const start = new Date(truth.startTime).getTime()
  report.evaluatedEvents.predictions.push({
    id: 'prediction-1',
    code: truth.code,
    startTime: new Date(start + 2 * 60_000).toISOString(),
    endTime: new Date(start + 27 * 60_000).toISOString(),
    firstDetectionTime: new Date(start - 5 * 60_000).toISOString(),
  })
  return refreshStructuralEvaluation(report)
}

function evaluationReportWithForgedClassificationMatch() {
  const report = evaluationReport()
  const groundTruth = report.evaluatedEvents.groundTruth.find(({ code }) => code === 'C02')
  const prediction = {
    id: 'C02-prediction-unmatched',
    code: 'C02',
    startTime: '2026-03-15T10:00:00.000Z',
    endTime: '2026-03-15T10:30:00.000Z',
  }
  report.evaluatedEvents.predictions.push(prediction)
  refreshStructuralEvaluation(report)
  const classificationPrecision = 1
  const classificationRecall = 1 / report.groundTruth.count
  report.metrics.classification = {
    matches: 1,
    correctCode: 1,
    detectionPrecision: classificationPrecision,
    detectionRecall: classificationRecall,
    detectionF1: (2 * classificationPrecision * classificationRecall) /
      (classificationPrecision + classificationRecall),
    classificationAccuracy: 1,
    eventAccuracy: 1 / report.groundTruth.count,
    matchedPairs: [{
      groundTruthId: groundTruth.id,
      predictionId: prediction.id,
      groundTruthCode: 'C02',
      predictionCode: 'C02',
    }],
    unmatchedGroundTruth: report.metrics.classification.unmatchedGroundTruth.filter(
      ({ id }) => id !== groundTruth.id,
    ),
    unmatchedPredictions: [],
  }
  return report
}

function evaluationReportWithCrossCodeOverlaps() {
  const report = evaluationReport()
  const c01 = report.evaluatedEvents.groundTruth.find(({ code }) => code === 'C01')
  const c02 = report.evaluatedEvents.groundTruth.find(({ code }) => code === 'C02')
  Object.assign(c01, {
    startTime: '2026-01-10T10:00:00.000Z',
    endTime: '2026-01-10T10:30:00.000Z',
  })
  Object.assign(c02, {
    startTime: '2026-03-10T10:00:00.000Z',
    endTime: '2026-03-10T10:30:00.000Z',
  })
  report.evaluatedEvents.predictions.push(
    {
      id: 'prediction-c02-january',
      code: 'C02',
      startTime: '2026-01-10T10:05:00.000Z',
      endTime: '2026-01-10T10:25:00.000Z',
    },
    {
      id: 'prediction-c01-march',
      code: 'C01',
      startTime: '2026-03-10T10:05:00.000Z',
      endTime: '2026-03-10T10:25:00.000Z',
    },
  )
  return refreshStructuralEvaluation(report)
}

describe('H2 Sentinel overfit report binding', () => {
  it('accepts a complete finite report bound to the candidate and official source', () => {
    const report = evaluationReport()
    assert.equal(assertEvaluationIdentity(report, 'validation', candidateCommit), report)
  })

  it('accepts metrics reconstructed from one structural match', () => {
    const report = evaluationReportWithMatch()
    assert.equal(assertEvaluationIdentity(report, 'validation', candidateCommit), report)
  })

  it('accepts canonical cross-code classification for overlapping events', () => {
    const report = evaluationReportWithCrossCodeOverlaps()
    assert.equal(report.metrics.classification.correctCode, 0)
    assert.equal(assertEvaluationIdentity(report, 'validation', candidateCommit), report)
  })

  it('rejects a two-month C01/C02 cross-swap with self-consistent scalars', () => {
    const report = evaluationReportWithCrossCodeOverlaps()
    const [januaryPair, marchPair] = report.metrics.classification.matchedPairs
    report.metrics.classification.matchedPairs = [
      {
        groundTruthId: januaryPair.groundTruthId,
        predictionId: marchPair.predictionId,
        groundTruthCode: januaryPair.groundTruthCode,
        predictionCode: marchPair.predictionCode,
      },
      {
        groundTruthId: marchPair.groundTruthId,
        predictionId: januaryPair.predictionId,
        groundTruthCode: marchPair.groundTruthCode,
        predictionCode: januaryPair.predictionCode,
      },
    ]
    report.metrics.classification.correctCode = 2
    report.metrics.classification.classificationAccuracy = 1
    report.metrics.classification.eventAccuracy = 2 / report.groundTruth.count
    assert.throws(
      () => assertEvaluationIdentity(report, 'validation', candidateCommit),
      /stale or mismatched identity/,
    )
  })

  it('rejects a forged same-code classification match whose events remain unmatched', () => {
    const report = evaluationReportWithForgedClassificationMatch()
    assert.throws(
      () => assertEvaluationIdentity(report, 'validation', candidateCommit),
      /stale or mismatched identity/,
    )
  })

  it('fails closed on stale candidate, complete source/provenance mismatch, and non-finite values', () => {
    const staleCandidate = evaluationReport()
    staleCandidate.candidateCommit = 'b'.repeat(40)
    assert.throws(
      () => assertEvaluationIdentity(staleCandidate, 'validation', candidateCommit),
      /stale or mismatched identity/,
    )

    const wrongSource = evaluationReport()
    wrongSource.dataset.source.sha256 = `sha256:${'0'.repeat(64)}`
    assert.throws(
      () => assertEvaluationIdentity(wrongSource, 'validation', candidateCommit),
      /stale or mismatched identity/,
    )

    const wrongLabels = evaluationReport()
    wrongLabels.dataset.labels.uniqueEventIdCount = 69
    assert.throws(
      () => assertEvaluationIdentity(wrongLabels, 'validation', candidateCommit),
      /stale or mismatched identity/,
    )

    const wrongImportProvenance = evaluationReport()
    wrongImportProvenance.dataset.chunks[0].analysisProvenance.datasetFingerprint =
      `sha256:${'f'.repeat(64)}`
    assert.throws(
      () => assertEvaluationIdentity(wrongImportProvenance, 'validation', candidateCommit),
      /stale or mismatched identity/,
    )

    for (const mutate of [
      (value) => { value.source = 'contradictory-source' },
      (value) => { value.ruleVersion = 'contradictory-rule' },
      (value) => { value.configurationVersion = 'contradictory-configuration' },
      (value) => { value.generatedAt = '2026-01-01T23:58:00Z' },
      (value) => { value.limitations = ['Contradictory limitation.'] },
    ]) {
      const contradictoryProvenance = evaluationReport()
      mutate(contradictoryProvenance.dataset.chunks[0].analysisProvenance)
      assert.throws(
        () => assertEvaluationIdentity(contradictoryProvenance, 'validation', candidateCommit),
        /stale or mismatched identity/,
      )
    }

    const wrongLabelPhase = evaluationReport()
    wrongLabelPhase.dataset.labelAccessPhase = 'before_analysis'
    assert.throws(
      () => assertEvaluationIdentity(wrongLabelPhase, 'validation', candidateCommit),
      /stale or mismatched identity/,
    )

    const nonFinite = evaluationReport()
    nonFinite.metrics.overall.f1 = Number.NaN
    assert.throws(
      () => assertEvaluationIdentity(nonFinite, 'validation', candidateCommit),
      /non-finite number/,
    )

    const nonFiniteConfiguration = evaluationReport()
    nonFiniteConfiguration.parameters.graceMinutes = Number.POSITIVE_INFINITY
    assert.throws(
      () => assertEvaluationIdentity(nonFiniteConfiguration, 'validation', candidateCommit),
      /non-finite number/,
    )

    const coercedMetric = evaluationReport()
    coercedMetric.metrics.overall.f1 = '0'
    assert.throws(
      () => assertEvaluationIdentity(coercedMetric, 'validation', candidateCommit),
      /stale or mismatched identity/,
    )

    const inconsistentMetrics = evaluationReport()
    inconsistentMetrics.metrics.byCode.C01.fn -= 1
    assert.throws(
      () => assertEvaluationIdentity(inconsistentMetrics, 'validation', candidateCommit),
      /stale or mismatched identity/,
    )

    const impossibleOverallF1 = evaluationReport()
    impossibleOverallF1.metrics.overall.f1 = 1
    assert.throws(
      () => assertEvaluationIdentity(impossibleOverallF1, 'validation', candidateCommit),
      /stale or mismatched identity/,
    )

    const impossibleCodePrecision = evaluationReport()
    impossibleCodePrecision.metrics.byCode.C01.precision = 1
    assert.throws(
      () => assertEvaluationIdentity(impossibleCodePrecision, 'validation', candidateCommit),
      /stale or mismatched identity/,
    )

    const impossibleMacroF1 = evaluationReport()
    impossibleMacroF1.metrics.macro.f1 = 1
    assert.throws(
      () => assertEvaluationIdentity(impossibleMacroF1, 'validation', candidateCommit),
      /stale or mismatched identity/,
    )

    const clearedStructuralArrays = evaluationReport()
    clearedStructuralArrays.unmatchedGroundTruth = []
    assert.throws(
      () => assertEvaluationIdentity(clearedStructuralArrays, 'validation', candidateCommit),
      /stale or mismatched identity/,
    )

    const clearedMatchesWithForgedCounts = evaluationReportWithMatch()
    clearedMatchesWithForgedCounts.matches = []
    assert.throws(
      () => assertEvaluationIdentity(clearedMatchesWithForgedCounts, 'validation', candidateCommit),
      /stale or mismatched identity/,
    )

    const clearedClassificationArrays = evaluationReport()
    clearedClassificationArrays.metrics.classification.unmatchedGroundTruth = []
    assert.throws(
      () => assertEvaluationIdentity(clearedClassificationArrays, 'validation', candidateCommit),
      /stale or mismatched identity/,
    )

    const duplicateEventId = evaluationReport()
    duplicateEventId.unmatchedGroundTruth[1].id = duplicateEventId.unmatchedGroundTruth[0].id
    assert.throws(
      () => assertEvaluationIdentity(duplicateEventId, 'validation', candidateCommit),
      /stale or mismatched identity/,
    )
  })
})
