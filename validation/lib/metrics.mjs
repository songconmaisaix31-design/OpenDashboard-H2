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
      .map(({ id }) => id),
    unmatchedPredictions: predicted
      .filter(({ id }) => !used.has(id))
      .map(({ id }) => id),
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
  const { truth, predicted, matches } = greedyMatches({
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
  }
}

export function mergePredictions(predictions, { gapMinutes = 2 } = {}) {
  const gapMs = gapMinutes * 60_000
  const merged = []
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
