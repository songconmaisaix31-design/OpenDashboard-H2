import { ANOMALY_CODES } from './official-contract.mjs'

export function toInstant(value) {
  if (typeof value !== 'string' || value.trim() === '') return Number.NaN
  const isoLike = value.trim().replace(' ', 'T')
  return Date.parse(
    /(?:Z|[+-]\d{2}:\d{2})$/i.test(isoLike) ? isoLike : `${isoLike}Z`,
  )
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
  return { ...event, start, end }
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
  return {
    ...overall,
    matches: matches.map(({ expected, predicted: actual }) => ({
      groundTruthId: expected.id,
      predictionId: actual.id,
      code: expected.code,
      groundTruthStart: expected.startTime,
      groundTruthEnd: expected.endTime,
      predictionStart: actual.startTime,
      predictionEnd: actual.endTime,
    })),
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
        current.ids.push(event.id)
      } else {
        current = { ...event, ids: [event.id] }
        merged.push(current)
      }
    }
  }
  return merged.map(({ start: _start, end: _end, ...event }) => event)
}
