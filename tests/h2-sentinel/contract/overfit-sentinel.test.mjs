import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { assertEvaluationIdentity } from '../../../validation/overfit-sentinel.mjs'
import { EVALUATION_WINDOWS, OFFICIAL_SOURCES } from '../../../validation/lib/official-sources.mjs'

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
      runtimeInputMapping: 'official 69-field row projected to the frozen 10-field loopback detector contract; no labels',
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
      },
      macro: { precision: 0, recall: 0, f1: 0 },
      byCode: byCodeMetrics,
    },
    provenance: {
      generatedAt: '2026-04-01T00:00:00Z',
      tool: 'validation/evaluate.mjs',
      limitations: ['Local public-data evaluation.'],
    },
  }
}

describe('H2 Sentinel overfit report binding', () => {
  it('accepts a complete finite report bound to the candidate and official source', () => {
    const report = evaluationReport()
    assert.equal(assertEvaluationIdentity(report, 'validation', candidateCommit), report)
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
  })
})
