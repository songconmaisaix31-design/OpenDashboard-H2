import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const directory = resolve(fileURLToPath(new URL('.', import.meta.url)))
const contractsDirectory = resolve(directory, '../../../packages/h2-contracts')

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
]

const reportKinds = [
  'single_event_diagnosis',
  'period_summary',
  'pcc_daily_compliance',
  'analysis_result_json',
  'submission_csv',
  'validation_metrics',
  'quality_report',
  'review_audit_json',
]

const submissionColumns = [
  'pred_event_id',
  'start_time',
  'end_time',
  'anomaly_code',
  'anomaly_subtype',
  'severity',
  'primary_control_object',
  'affected_equipment',
  'confidence',
  'evidence_json',
  'root_cause',
  'recommended_action',
  'primary_impact_metric',
  'estimated_impact_value',
  'first_detection_time',
  'requires_human_confirmation',
]

function read(relativePath) {
  return readFileSync(resolve(contractsDirectory, relativePath), 'utf8')
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath))
}

function stringArrayFromSource(source, constantName) {
  const match = source.match(new RegExp(`export const ${constantName} = \\[([\\s\\S]*?)\\] as const`))
  assert.ok(match, `${constantName} must remain a published const array`)
  return [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1])
}

describe('H2 Sentinel P1 frozen contract conformance', () => {
  it('publishes only the exact official Q01-Q10 identifiers and Chinese prompts', () => {
    const source = read('src/assistant.ts')
    const extracted = [...source.matchAll(
      /\{\s*questionId:\s*'(Q\d{2})',\s*prompt:\s*'([^']+)',?\s*\}/g,
    )].map(([, questionId, prompt]) => [questionId, prompt])
    const requestSchema = readJson('schema/assistant-request.schema.json')
    const answerSchema = readJson('schema/assistant-answer.schema.json')

    assert.deepEqual(extracted, officialQuestions)
    assert.deepEqual(
      requestSchema.properties.questionId.enum,
      officialQuestions.map(([questionId]) => questionId),
    )
    assert.deepEqual(
      answerSchema.properties.questionId.enum,
      officialQuestions.map(([questionId]) => questionId),
    )
    assert.doesNotMatch(JSON.stringify([requestSchema, answerSchema]), /H2Q\d{2}/)
    assert.equal(answerSchema.properties.mode.const, 'DETERMINISTIC_TEMPLATE')
    assert.equal(answerSchema.properties.refusedControlClaim.const, true)
    assert.deepEqual(answerSchema.allOf[0].then.required, ['eventId', 'generatedReport'])
    assert.equal(answerSchema.properties.generatedReport.properties.mediaType.const, 'text/html')
  })

  it('freezes review actions, optimistic concurrency bounds, and unverified actor attribution', () => {
    const reviewSource = read('src/review.ts')
    const requestSchema = readJson('schema/review-event-request.schema.json')
    const auditSchema = readJson('schema/review-audit-export.schema.json')

    assert.deepEqual(stringArrayFromSource(reviewSource, 'H2_REVIEW_ACTIONS'), [
      'confirm',
      'reject',
      'resolve',
      'reopen',
      'add_note',
    ])
    assert.equal(requestSchema.additionalProperties, false)
    assert.equal(requestSchema.properties.expectedRevision.minimum, 0)
    assert.equal(requestSchema.properties.requestId.maxLength, 128)
    assert.equal(requestSchema.properties.actor.properties.displayName.maxLength, 64)
    assert.equal(requestSchema.properties.note.maxLength, 2000)
    assert.equal(
      auditSchema.properties.actorIdentityNotice.const,
      'local_operator_labels_are_unverified',
    )
    assert.match(reviewSource, /current === 'open' && action === 'confirm'/)
    assert.match(reviewSource, /current === 'open' && action === 'reject'/)
    assert.match(reviewSource, /current === 'confirmed' && action === 'resolve'/)
    assert.match(reviewSource, /review\.invalid_transition/)
  })

  it('keeps all eight report kinds while leaving the frozen submission schema review-free', () => {
    const reportSchema = readJson('schema/report-request.schema.json')
    const submissionSource = read('src/submission.ts')

    assert.deepEqual(reportSchema.properties.kind.enum, reportKinds)
    assert.equal(reportSchema.additionalProperties, false)
    assert.deepEqual(
      stringArrayFromSource(submissionSource, 'H2_SUBMISSION_COLUMNS'),
      submissionColumns,
    )
    assert.doesNotMatch(
      submissionColumns.join(','),
      /review|actor|note|revision|request_id/i,
    )
    assert.match(
      read('schema/report-descriptor.schema.json'),
      /sha256:\[a-f0-9\]\{64\}/,
    )
  })
})
