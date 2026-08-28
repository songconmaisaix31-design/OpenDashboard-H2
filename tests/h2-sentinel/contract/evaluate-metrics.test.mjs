import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  classifyEvents,
  computeMetrics,
  matchEvents,
  mergePredictions,
  toInstant,
} from '../../../validation/lib/metrics.mjs'

function event(id, code, startTime, endTime, firstDetectionTime) {
  return {
    id,
    code,
    startTime,
    endTime,
    ...(firstDetectionTime === undefined ? {} : { firstDetectionTime }),
  }
}

describe('H2 Sentinel event-matching contract', () => {
  it('treats official naive timestamps as UTC', () => {
    assert.equal(
      toInstant('2026-01-05 10:24:00'),
      toInstant('2026-01-05T10:24:00Z'),
    )
    assert.equal(Number.isNaN(toInstant('not-a-time')), true)
    assert.equal(Number.isNaN(toInstant('2026-02-30T10:24:00Z')), true)
    assert.equal(Number.isNaN(toInstant('2026-01-05T24:00:00Z')), true)
  })

  it('scores a one-to-one same-code overlap and never reuses a prediction', () => {
    const result = matchEvents({
      groundTruth: [
        event('g1', 'C04', '2026-01-05T10:00:00Z', '2026-01-05T10:30:00Z'),
        event('g2', 'C04', '2026-01-05T10:31:00Z', '2026-01-05T11:00:00Z'),
      ],
      predictions: [
        event('p1', 'C04', '2026-01-05T10:05:00Z', '2026-01-05T10:59:00Z'),
      ],
    })
    assert.equal(result.tp, 1)
    assert.equal(result.fp, 0)
    assert.equal(result.fn, 1)
    assert.deepEqual(result.unmatchedGroundTruth, [{ id: 'g2', code: 'C04' }])
    assert.deepEqual(result.unmatchedPredictions, [])
  })

  it('applies the grace window without accepting a wrong anomaly code', () => {
    const truth = [
      event('g1', 'C03', '2026-01-05T10:00:00Z', '2026-01-05T11:00:00Z'),
    ]
    assert.equal(matchEvents({
      groundTruth: truth,
      predictions: [
        event('p1', 'C03', '2026-01-05T09:55:00Z', '2026-01-05T09:58:00Z'),
      ],
      graceMinutes: 10,
    }).tp, 1)
    assert.equal(matchEvents({
      groundTruth: truth,
      predictions: [
        event('p2', 'C04', '2026-01-05T10:10:00Z', '2026-01-05T10:50:00Z'),
      ],
    }).tp, 0)
  })

  it('reports precision, recall, and F1 for every C01-C07 class', () => {
    const result = matchEvents({
      groundTruth: [
        event('g1', 'C03', '2026-01-05T10:00:00Z', '2026-01-05T11:00:00Z'),
      ],
      predictions: [
        event('p1', 'C03', '2026-01-05T10:00:00Z', '2026-01-05T11:00:00Z'),
        event('p2', 'C05', '2026-01-06T10:00:00Z', '2026-01-06T11:00:00Z'),
      ],
    })
    assert.deepEqual(result.byCode.map(({ code }) => code), [
      'C01',
      'C02',
      'C03',
      'C04',
      'C05',
      'C06',
      'C07',
    ])
    assert.equal(result.precision, 0.5)
    assert.equal(result.recall, 1)
    assert.equal(result.f1, 2 / 3)
    assert.deepEqual(computeMetrics({ tp: 0, fp: 0, fn: 0 }), {
      tp: 0,
      fp: 0,
      fn: 0,
      precision: 0,
      recall: 0,
      f1: 0,
    })
  })

  it('merges adjacent same-code predictions across UTC-day chunks', () => {
    const merged = mergePredictions([
      event('a', 'C04', '2026-01-05T23:59:00Z', '2026-01-06T00:01:00Z', '2026-01-05T23:58:00Z'),
      event('b', 'C04', '2026-01-06T00:02:00Z', '2026-01-06T00:10:00Z', '2026-01-05T23:57:00Z'),
      event('c', 'C03', '2026-01-06T00:02:00Z', '2026-01-06T00:10:00Z'),
    ])
    assert.equal(merged.length, 2)
    const c04 = merged.find(({ code }) => code === 'C04')
    assert.equal(c04.startTime, '2026-01-05T23:59:00Z')
    assert.equal(c04.endTime, '2026-01-06T00:10:00Z')
    assert.equal(c04.firstDetectionTime, '2026-01-05T23:57:00Z')
    assert.deepEqual(c04.ids, ['a', 'b'])
  })

  it('preserves first detection and reports signed delay plus boundary errors', () => {
    const result = matchEvents({
      groundTruth: [
        event('g1', 'C04', '2026-01-05T10:00:00Z', '2026-01-05T10:30:00Z'),
      ],
      predictions: [
        event(
          'p1',
          'C04',
          '2026-01-05T10:02:00Z',
          '2026-01-05T10:27:00Z',
          '2026-01-05T09:55:00Z',
        ),
      ],
    })
    assert.deepEqual(
      {
        firstDetectionTime: result.matches[0].firstDetectionTime,
        firstDetectionDelayMinutes: result.matches[0].firstDetectionDelayMinutes,
        startBoundaryErrorMinutes: result.matches[0].startBoundaryErrorMinutes,
        endBoundaryErrorMinutes: result.matches[0].endBoundaryErrorMinutes,
      },
      {
        firstDetectionTime: '2026-01-05T09:55:00Z',
        firstDetectionDelayMinutes: -5,
        startBoundaryErrorMinutes: 2,
        endBoundaryErrorMinutes: -3,
      },
    )
    assert.deepEqual(result.timing.firstDetectionDelay, {
      count: 1,
      meanMinutes: -5,
      meanAbsoluteMinutes: 5,
    })
  })

  it('separates detection overlap from code classification accuracy', () => {
    const result = classifyEvents({
      groundTruth: [
        event('g1', 'C03', '2026-01-05T10:00:00Z', '2026-01-05T11:00:00Z'),
      ],
      predictions: [
        event('p1', 'C04', '2026-01-05T10:10:00Z', '2026-01-05T10:50:00Z'),
      ],
    })
    assert.equal(result.detectionF1, 1)
    assert.equal(result.classificationAccuracy, 0)
    assert.deepEqual(result.matchedPairs, [{
      groundTruthId: 'g1',
      predictionId: 'p1',
      groundTruthCode: 'C03',
      predictionCode: 'C04',
    }])
  })

  it('rejects duplicate ground-truth and prediction identities before matching', () => {
    const truth = event('duplicate', 'C03', '2026-01-05T10:00:00Z', '2026-01-05T11:00:00Z')
    const prediction = event('duplicate', 'C03', '2026-01-05T10:00:00Z', '2026-01-05T11:00:00Z')
    assert.throws(
      () => matchEvents({ groundTruth: [truth, { ...truth }], predictions: [] }),
      /Ground-truth event IDs must be unique/,
    )
    assert.throws(
      () => matchEvents({ groundTruth: [], predictions: [prediction, { ...prediction }] }),
      /Predicted event IDs must be unique/,
    )
    assert.throws(
      () => mergePredictions([prediction, { ...prediction, code: 'C04' }]),
      /Predicted event IDs must be unique/,
    )
  })
})
