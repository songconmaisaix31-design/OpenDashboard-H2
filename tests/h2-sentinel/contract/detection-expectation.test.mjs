import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  ADVANCE_WARNING_CODES,
  detectionExpectationMetrics,
  matchEvents,
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

// 与 evaluate.mjs 接线一致：matches 来自 matchEvents 的真实输出
function expectationFor({ groundTruth, predictions, withinMinutes }) {
  const matching = matchEvents({ groundTruth, predictions, graceMinutes: 10 })
  return detectionExpectationMetrics({
    groundTruth,
    matches: matching.matches,
    ...(withinMinutes === undefined ? {} : { withinMinutes }),
  })
}

describe('H2 Sentinel detection_expectation metrics (ADR-004 / api.md IF-4)', () => {
  it('partitions C01-C07 into advance-warning and within-window code sets', () => {
    assert.deepEqual(ADVANCE_WARNING_CODES, ['C05', 'C07'])
    const expectation = expectationFor({ groundTruth: [], predictions: [] })
    assert.deepEqual(expectation.leadTime.codes, ['C05', 'C07'])
    assert.deepEqual(expectation.detectionWithinWindow.codes, [
      'C01', 'C02', 'C03', 'C04', 'C06',
    ])
  })

  it('measures positive lead time for matched C05/C07 events', () => {
    const expectation = expectationFor({
      groundTruth: [
        event('g1', 'C05', '2026-01-05T10:00:00Z', '2026-01-05T11:00:00Z'),
        event('g2', 'C07', '2026-01-05T12:00:00Z', '2026-01-05T13:00:00Z'),
      ],
      predictions: [
        event('p1', 'C05', '2026-01-05T10:03:00Z', '2026-01-05T11:00:00Z', '2026-01-05T10:03:00Z'),
        event('p2', 'C07', '2026-01-05T12:02:00Z', '2026-01-05T13:00:00Z', '2026-01-05T12:02:00Z'),
      ],
    })
    const leadTime = expectation.leadTime
    assert.equal(leadTime.groundTruthEvents, 2)
    assert.equal(leadTime.measuredEvents, 2)
    assert.deepEqual(leadTime.unmatchedEventIds, [])
    assert.equal(leadTime.minMinutes, 2)
    assert.equal(leadTime.meanMinutes, 2.5)
    assert.equal(leadTime.maxMinutes, 3)
    assert.equal(leadTime.nonPositiveCount, 0)
    assert.equal(leadTime.allPositive, true)
    assert.deepEqual(leadTime.perEvent, [
      { groundTruthId: 'g1', code: 'C05', leadTimeMinutes: 3 },
      { groundTruthId: 'g2', code: 'C07', leadTimeMinutes: 2 },
    ])
  })

  it('counts non-positive lead time and unmatched advance-warning events separately', () => {
    const expectation = expectationFor({
      groundTruth: [
        event('g1', 'C05', '2026-01-05T10:00:00Z', '2026-01-05T11:00:00Z'),
        event('g2', 'C07', '2026-01-05T12:00:00Z', '2026-01-05T13:00:00Z'),
        event('g3', 'C05', '2026-01-06T10:00:00Z', '2026-01-06T11:00:00Z'),
      ],
      predictions: [
        // delay 0 → 非正
        event('p1', 'C05', '2026-01-05T10:00:00Z', '2026-01-05T11:00:00Z', '2026-01-05T10:00:00Z'),
        // delay -1（先于官方 start 检出）→ 非正
        event('p2', 'C07', '2026-01-05T12:00:00Z', '2026-01-05T13:00:00Z', '2026-01-05T11:59:00Z'),
      ],
    })
    const leadTime = expectation.leadTime
    assert.equal(leadTime.groundTruthEvents, 3)
    assert.equal(leadTime.measuredEvents, 2)
    assert.deepEqual(leadTime.unmatchedEventIds, ['g3'])
    assert.equal(leadTime.minMinutes, -1)
    assert.equal(leadTime.nonPositiveCount, 2)
    assert.equal(leadTime.allPositive, false)
  })

  it('treats a matched prediction without first-detection provenance as unmeasurable', () => {
    const expectation = expectationFor({
      groundTruth: [event('g1', 'C05', '2026-01-05T10:00:00Z', '2026-01-05T11:00:00Z')],
      predictions: [event('p1', 'C05', '2026-01-05T10:05:00Z', '2026-01-05T11:00:00Z')],
    })
    assert.equal(expectation.leadTime.measuredEvents, 0)
    assert.equal(expectation.leadTime.unmeasurableMatches, 1)
    assert.equal(expectation.leadTime.minMinutes, null)
    assert.equal(expectation.leadTime.allPositive, false)
    assert.equal(expectation.detectionWithinWindow.unmeasurableMatches, 0)
  })

  it('counts unmatched and overdue five-code events in the detection-rate denominator', () => {
    const expectation = expectationFor({
      groundTruth: [
        event('g1', 'C01', '2026-01-05T09:00:00Z', '2026-01-05T10:00:00Z'),
        event('g2', 'C03', '2026-01-05T14:00:00Z', '2026-01-05T15:00:00Z'),
        event('g3', 'C06', '2026-01-05T16:00:00Z', '2026-01-05T17:00:00Z'),
        event('g4', 'C02', '2026-01-05T18:00:00Z', '2026-01-05T19:00:00Z'),
        event('g5', 'C04', '2026-01-05T20:00:00Z', '2026-01-05T21:00:00Z'),
      ],
      predictions: [
        // delay 5 → 达标
        event('p1', 'C01', '2026-01-05T09:05:00Z', '2026-01-05T10:00:00Z', '2026-01-05T09:05:00Z'),
        // g2 无预测 → FN 计分母
        // delay -5（提前检出）→ 同样达标
        event('p3', 'C06', '2026-01-05T16:00:00Z', '2026-01-05T17:00:00Z', '2026-01-05T15:55:00Z'),
        // delay 20 → 超窗
        event('p4', 'C02', '2026-01-05T18:00:00Z', '2026-01-05T19:00:00Z', '2026-01-05T18:20:00Z'),
        // 匹配但无 first_detection → 不可测，不计达标
        event('p5', 'C04', '2026-01-05T20:05:00Z', '2026-01-05T21:00:00Z'),
      ],
    })
    const within = expectation.detectionWithinWindow
    assert.equal(within.groundTruthEvents, 5)
    assert.equal(within.detectedWithinWindow, 2)
    assert.deepEqual(within.unmatchedEventIds, ['g2'])
    assert.deepEqual(within.overdueEventIds, ['g4'])
    assert.equal(within.unmeasurableMatches, 1)
    assert.equal(within.rate, 0.4)
    assert.equal(within.meetsTarget, false)
  })

  it('accepts a delay of exactly the within-window boundary and rejects one beyond it', () => {
    const groundTruth = [event('g1', 'C01', '2026-01-05T09:00:00Z', '2026-01-05T10:00:00Z')]
    const boundary = expectationFor({
      groundTruth,
      predictions: [
        event('p1', 'C01', '2026-01-05T09:10:00Z', '2026-01-05T10:00:00Z', '2026-01-05T09:10:00Z'),
      ],
    })
    assert.equal(boundary.detectionWithinWindow.detectedWithinWindow, 1)
    assert.equal(boundary.detectionWithinWindow.rate, 1)
    const overdue = expectationFor({
      groundTruth,
      predictions: [
        event('p1', 'C01', '2026-01-05T09:10:00Z', '2026-01-05T10:00:00Z', '2026-01-05T09:10:01Z'),
      ],
    })
    assert.equal(overdue.detectionWithinWindow.detectedWithinWindow, 0)
    assert.deepEqual(overdue.detectionWithinWindow.overdueEventIds, ['g1'])
  })

  it('reports null rates for empty code groups instead of fabricating values', () => {
    const expectation = expectationFor({
      groundTruth: [
        event('g1', 'C03', '2026-01-05T10:00:00Z', '2026-01-05T11:00:00Z'),
        event('g2', 'C07', '2026-01-05T12:00:00Z', '2026-01-05T13:00:00Z'),
      ],
      predictions: [
        event('p1', 'C03', '2026-01-05T10:05:00Z', '2026-01-05T11:00:00Z', '2026-01-05T10:05:00Z'),
        event('p2', 'C07', '2026-01-05T12:02:00Z', '2026-01-05T13:00:00Z', '2026-01-05T12:02:00Z'),
      ],
    })
    assert.equal(expectation.leadTime.measuredEvents, 1)
    const within = expectation.detectionWithinWindow
    assert.equal(within.groundTruthEvents, 1)
    assert.equal(within.rate, 1)
    const emptyLead = expectationFor({
      groundTruth: [event('g1', 'C01', '2026-01-05T10:00:00Z', '2026-01-05T11:00:00Z')],
      predictions: [event('p1', 'C01', '2026-01-05T10:01:00Z', '2026-01-05T11:00:00Z', '2026-01-05T10:01:00Z')],
    })
    assert.equal(emptyLead.leadTime.groundTruthEvents, 0)
    assert.equal(emptyLead.leadTime.measuredEvents, 0)
    assert.equal(emptyLead.leadTime.allPositive, false)
    const emptyWithin = expectationFor({
      groundTruth: [event('g1', 'C05', '2026-01-05T10:00:00Z', '2026-01-05T11:00:00Z')],
      predictions: [event('p1', 'C05', '2026-01-05T10:01:00Z', '2026-01-05T11:00:00Z', '2026-01-05T10:01:00Z')],
    })
    assert.equal(emptyWithin.detectionWithinWindow.groundTruthEvents, 0)
    assert.equal(emptyWithin.detectionWithinWindow.rate, null)
    assert.equal(emptyWithin.detectionWithinWindow.meetsTarget, null)
  })

  it('rejects a negative within-window bound', () => {
    assert.throws(
      () => detectionExpectationMetrics({ groundTruth: [], matches: [], withinMinutes: -1 }),
      /non-negative withinMinutes/,
    )
  })
})
