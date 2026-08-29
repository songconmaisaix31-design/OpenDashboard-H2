import { ANOMALY_CODES } from './official-contract.mjs'

export function toInstant(value) {
  if (typeof value !== 'string' || value.trim() === '') return Number.NaN
  const match = value.trim().match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?(?:(Z)|([+-])(\d{2}):(\d{2}))?$/,
  )
  if (match === null) return Number.NaN
  const [, yearText, monthText, dayText, hourText, minuteText, secondText,
    millisecondText = '000', _utc, offsetSign, offsetHourText = '00',
    offsetMinuteText = '00'] = match
  const components = [
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    millisecondText,
    offsetHourText,
    offsetMinuteText,
  ].map(Number)
  const [year, month, day, hour, minute, second, millisecond, offsetHour,
    offsetMinute] = components
  if (
    month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 ||
    minute > 59 || second > 59 || millisecond > 999 || offsetHour > 23 ||
    offsetMinute > 59
  ) return Number.NaN
  const calendar = new Date(0)
  calendar.setUTCFullYear(year, month - 1, day)
  calendar.setUTCHours(hour, minute, second, millisecond)
  if (
    calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day || calendar.getUTCHours() !== hour ||
    calendar.getUTCMinutes() !== minute || calendar.getUTCSeconds() !== second ||
    calendar.getUTCMilliseconds() !== millisecond
  ) return Number.NaN
  const offsetMinutes = (offsetHour * 60) + offsetMinute
  const signedOffset = offsetSign === '+' ? offsetMinutes : offsetSign === '-' ? -offsetMinutes : 0
  return calendar.getTime() - signedOffset * 60_000
}

export function toCanonicalUtcInstant(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
  ) return Number.NaN
  return toInstant(value)
}

export function computeMetrics({ tp, fp, fn }) {
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp)
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn)
  return {
    tp,
    fp,
    fn,
    precision,
    recall,
    f1: precision + recall === 0
      ? 0
      : (2 * precision * recall) / (precision + recall),
  }
}

function normalizedEvent(event, label) {
  if (
    typeof event?.id !== 'string' || event.id.trim() === '' ||
    !ANOMALY_CODES.includes(event.code)
  ) throw new Error(`${label} event identity is invalid.`)
  const start = toInstant(event.startTime)
  const end = toInstant(event.endTime)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    throw new Error(`${label} event has an invalid interval: ${event.id}`)
  }
  const firstDetection = event.firstDetectionTime === undefined
    ? undefined
    : toInstant(event.firstDetectionTime)
  if (firstDetection !== undefined && !Number.isFinite(firstDetection)) {
    throw new Error(`${label} event has an invalid first-detection time: ${event.id}`)
  }
  return { ...event, start, end, firstDetection }
}

function assertUniqueEventIds(events, label) {
  const ids = events.map(({ id }) => id)
  if (new Set(ids).size !== ids.length) {
    throw new Error(`${label} event IDs must be unique.`)
  }
}

function summarizeTiming(values) {
  if (values.length === 0) return { count: 0, meanMinutes: null, meanAbsoluteMinutes: null }
  return {
    count: values.length,
    meanMinutes: values.reduce((total, value) => total + value, 0) / values.length,
    meanAbsoluteMinutes: values.reduce((total, value) => total + Math.abs(value), 0) / values.length,
  }
}

function greedyMatches({ groundTruth, predictions, graceMinutes, sameCode }) {
  const graceMs = graceMinutes * 60_000
  const truth = groundTruth
    .map((event) => normalizedEvent(event, 'Ground-truth'))
    .sort((left, right) => left.start - right.start || left.id.localeCompare(right.id))
  const predicted = predictions.map((event) => normalizedEvent(event, 'Predicted'))
  assertUniqueEventIds(truth, 'Ground-truth')
  assertUniqueEventIds(predicted, 'Predicted')
  const used = new Set()
  const matches = []
  for (const expected of truth) {
    const match = predicted
      .filter((candidate) =>
        !used.has(candidate.id) &&
        (!sameCode || candidate.code === expected.code) &&
        candidate.start <= expected.end + graceMs &&
        candidate.end >= expected.start - graceMs,
      )
      .sort((left, right) => left.start - right.start || left.id.localeCompare(right.id))[0]
    if (match === undefined) continue
    used.add(match.id)
    matches.push({ expected, predicted: match })
  }
  return { truth, predicted, matches, used }
}

export function matchEvents({ groundTruth, predictions, graceMinutes = 10 }) {
  const { truth, predicted, matches, used } = greedyMatches({
    groundTruth,
    predictions,
    graceMinutes,
    sameCode: true,
  })
  const overall = computeMetrics({
    tp: matches.length,
    fp: predicted.length - matches.length,
    fn: truth.length - matches.length,
  })
  const detailedMatches = matches.map(({ expected, predicted: actual }) => ({
    groundTruthId: expected.id,
    predictionId: actual.id,
    code: expected.code,
    groundTruthStart: expected.startTime,
    groundTruthEnd: expected.endTime,
    predictionStart: actual.startTime,
    predictionEnd: actual.endTime,
    firstDetectionTime: actual.firstDetectionTime ?? null,
    firstDetectionDelayMinutes: actual.firstDetection === undefined
      ? null
      : (actual.firstDetection - expected.start) / 60_000,
    startBoundaryErrorMinutes: (actual.start - expected.start) / 60_000,
    endBoundaryErrorMinutes: (actual.end - expected.end) / 60_000,
  }))
  return {
    ...overall,
    matches: detailedMatches,
    timing: {
      firstDetectionDelay: summarizeTiming(
        detailedMatches.map(({ firstDetectionDelayMinutes }) => firstDetectionDelayMinutes)
          .filter(Number.isFinite),
      ),
      startBoundaryError: summarizeTiming(
        detailedMatches.map(({ startBoundaryErrorMinutes }) => startBoundaryErrorMinutes),
      ),
      endBoundaryError: summarizeTiming(
        detailedMatches.map(({ endBoundaryErrorMinutes }) => endBoundaryErrorMinutes),
      ),
    },
    unmatchedGroundTruth: truth
      .filter((event) => !matches.some(({ expected }) => expected.id === event.id))
      .map(({ id, code }) => ({ id, code })),
    unmatchedPredictions: predicted
      .filter(({ id }) => !used.has(id))
      .map(({ id, code }) => ({ id, code })),
    byCode: ANOMALY_CODES.map((code) => {
      const truthCount = truth.filter((event) => event.code === code).length
      const predictionCount = predicted.filter((event) => event.code === code).length
      const truePositive = matches.filter(({ expected }) => expected.code === code).length
      return {
        code,
        groundTruth: truthCount,
        predictions: predictionCount,
        ...computeMetrics({
          tp: truePositive,
          fp: predictionCount - truePositive,
          fn: truthCount - truePositive,
        }),
      }
    }),
  }
}

export function classifyEvents({ groundTruth, predictions, graceMinutes = 10 }) {
  const { truth, predicted, matches, used } = greedyMatches({
    groundTruth,
    predictions,
    graceMinutes,
    sameCode: false,
  })
  const correctCode = matches.filter(
    ({ expected, predicted: actual }) => expected.code === actual.code,
  ).length
  const detectionPrecision = predicted.length === 0 ? 0 : matches.length / predicted.length
  const detectionRecall = truth.length === 0 ? 0 : matches.length / truth.length
  return {
    matches: matches.length,
    correctCode,
    detectionPrecision,
    detectionRecall,
    detectionF1: detectionPrecision + detectionRecall === 0
      ? 0
      : (2 * detectionPrecision * detectionRecall) /
        (detectionPrecision + detectionRecall),
    classificationAccuracy: matches.length === 0 ? 0 : correctCode / matches.length,
    eventAccuracy: truth.length === 0 ? 0 : correctCode / truth.length,
    matchedPairs: matches.map(({ expected, predicted: actual }) => ({
      groundTruthId: expected.id,
      predictionId: actual.id,
      groundTruthCode: expected.code,
      predictionCode: actual.code,
    })),
    unmatchedGroundTruth: truth
      .filter((event) => !matches.some(({ expected }) => expected.id === event.id))
      .map(({ id, code }) => ({ id, code })),
    unmatchedPredictions: predicted
      .filter(({ id }) => !used.has(id))
      .map(({ id, code }) => ({ id, code })),
  }
}

// —— ADR-004 / api.md IF-4：官方 detection_expectation 指标（P0-5）——
// C05/C07 测提前预警 lead_time（first_detection − GT start，目标 >0）；
// 其余 5 类测"开始后 10 分钟内检出率"（分母 = 该 5 类全部 GT 事件，目标 1）。
export const ADVANCE_WARNING_CODES = ['C05', 'C07']

// 从单一事实源 ANOMALY_CODES 派生，避免手写 5 类清单漂移
const WITHIN_WINDOW_CODES = ANOMALY_CODES.filter(
  (code) => !ADVANCE_WARNING_CODES.includes(code),
)

function leadTimeSummary(advanceTruth, matchByTruthId) {
  const perEvent = []
  const unmatchedEventIds = []
  let unmeasurableMatches = 0
  for (const truth of advanceTruth) {
    const match = matchByTruthId.get(truth.id)
    if (match === undefined) {
      unmatchedEventIds.push(truth.id)
      continue
    }
    if (!Number.isFinite(match.firstDetectionDelayMinutes)) {
      unmeasurableMatches += 1
      continue
    }
    perEvent.push({
      groundTruthId: truth.id,
      code: truth.code,
      leadTimeMinutes: match.firstDetectionDelayMinutes,
    })
  }
  const values = perEvent.map(({ leadTimeMinutes }) => leadTimeMinutes)
  const nonPositiveCount = values.filter((value) => value <= 0).length
  return {
    codes: ADVANCE_WARNING_CODES,
    target: 'lead_time_minutes > 0',
    groundTruthEvents: advanceTruth.length,
    unmatchedEventIds,
    unmeasurableMatches,
    measuredEvents: values.length,
    minMinutes: values.length === 0 ? null : Math.min(...values),
    meanMinutes: values.length === 0
      ? null
      : values.reduce((total, value) => total + value, 0) / values.length,
    maxMinutes: values.length === 0 ? null : Math.max(...values),
    nonPositiveCount,
    allPositive: values.length > 0 && nonPositiveCount === 0,
    perEvent,
  }
}

function withinWindowSummary(windowTruth, matchByTruthId, withinMinutes) {
  let detectedWithinWindow = 0
  const unmatchedEventIds = []
  let unmeasurableMatches = 0
  const overdueEventIds = []
  for (const truth of windowTruth) {
    const match = matchByTruthId.get(truth.id)
    if (match === undefined) {
      unmatchedEventIds.push(truth.id)
      continue
    }
    if (!Number.isFinite(match.firstDetectionDelayMinutes)) {
      unmeasurableMatches += 1
      continue
    }
    // 负值（先于官方 start 检出）同样满足"开始后 10 分钟内发现"
    if (match.firstDetectionDelayMinutes <= withinMinutes) detectedWithinWindow += 1
    else overdueEventIds.push(truth.id)
  }
  return {
    codes: WITHIN_WINDOW_CODES,
    withinMinutes,
    target: 'rate = 1',
    groundTruthEvents: windowTruth.length,
    unmatchedEventIds,
    unmeasurableMatches,
    detectedWithinWindow,
    overdueEventIds,
    rate: windowTruth.length === 0
      ? null
      : detectedWithinWindow / windowTruth.length,
    meetsTarget: windowTruth.length === 0
      ? null
      : detectedWithinWindow === windowTruth.length,
  }
}

export function detectionExpectationMetrics({ groundTruth, matches, withinMinutes = 10 }) {
  if (!Number.isFinite(withinMinutes) || withinMinutes < 0) {
    throw new Error('detectionExpectationMetrics requires a non-negative withinMinutes.')
  }
  const matchByTruthId = new Map(matches.map((match) => [match.groundTruthId, match]))
  const advanceTruth = groundTruth.filter(({ code }) => ADVANCE_WARNING_CODES.includes(code))
  const windowTruth = groundTruth.filter(({ code }) => WITHIN_WINDOW_CODES.includes(code))
  return {
    definition: 'official detection_expectation per ADR-004 / api.md IF-4; lead_time uses matched predictions only; the within-window rate counts every ground-truth event of the five codes in its denominator',
    leadTime: leadTimeSummary(advanceTruth, matchByTruthId),
    detectionWithinWindow: withinWindowSummary(windowTruth, matchByTruthId, withinMinutes),
  }
}

export function mergePredictions(predictions, { gapMinutes = 2 } = {}) {
  const gapMs = gapMinutes * 60_000
  const merged = []
  assertUniqueEventIds(
    predictions.map((event) => normalizedEvent(event, 'Predicted')),
    'Predicted',
  )
  for (const code of ANOMALY_CODES) {
    const ordered = predictions
      .filter((event) => event.code === code)
      .map((event) => normalizedEvent(event, 'Predicted'))
      .sort((left, right) => left.start - right.start || left.id.localeCompare(right.id))
    let current = null
    for (const event of ordered) {
      if (current !== null && event.start - current.end <= gapMs) {
        if (event.end > current.end) {
          current.end = event.end
          current.endTime = event.endTime
        }
        if (
          event.firstDetection !== undefined &&
          (current.firstDetection === undefined || event.firstDetection < current.firstDetection)
        ) {
          current.firstDetection = event.firstDetection
          current.firstDetectionTime = event.firstDetectionTime
        }
        current.ids.push(event.id)
      } else {
        current = { ...event, ids: [event.id] }
        merged.push(current)
      }
    }
  }
  return merged.map(({ start: _start, end: _end, ...event }) => event)
}
