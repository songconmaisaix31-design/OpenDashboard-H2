import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  SUBMISSION_COLUMNS,
  serializeSubmission,
} from '../../../validation/lib/submission.mjs'
import { prepareValidationSlice } from '../scripts/prepare-validation-slice.mjs'
import { validateDemoReceipt } from '../scripts/validate-demo-receipt.mjs'
import {
  assertEvidenceReviewIdentity,
  assertHumanReviewIdentity,
  assertQ09Answer,
} from '../../../validation/run-demo.mjs'
import {
  assertAnalysisRun,
  documentHasRequiredHumanConfirmation,
  hasUnsafeAnswerText,
} from '../../../validation/lib/runtime-provenance.mjs'

const directory = resolve(fileURLToPath(new URL('.', import.meta.url)))
const repositoryRoot = resolve(directory, '../../..')
const generatedRoot = resolve(repositoryRoot, 'tests/h2-sentinel/reports/generated')
const officialFieldFixture = JSON.parse(
  await readFile(
    resolve(repositoryRoot, 'tests/h2-sentinel/fixtures/official-timeseries-columns.json'),
    'utf8',
  ),
)
const timeseriesColumns = [...officialFieldFixture.fields]

const diagnosisSections = [
  '报告范围与数据来源',
  '异常概览',
  '证据链',
  '原因判断：事实与推断',
  '影响量化',
  '安全检查',
  '建议与人工确认',
  '人工复核记录',
  '版本与溯源',
  '安全声明与限制',
]
const ANALYSIS_GENERATED_AT = '2026-01-05T12:45:00Z'
const ANALYSIS_COMPLETED_AT = '2026-01-05T12:45:01Z'
const ANALYSIS_MODEL_VERSION = 'deterministic-c01-c07-v4'
const SHORT_SAFETY_DECLARATION = '所有操作建议均须人工确认'
const COMPLETE_SAFETY_STATEMENT =
  '本应用仅提供监视、诊断、量化和建议，不下发设备指令；所有操作建议均须人工确认。'
const GENERATED_REPORT_SECTION_TEXT =
  '报告按证据、事实与推断、影响、安全检查、人工复核和限制分区；查看报告后仍须由人工决定后续处置。'
const REAL_C04_CONTROL_DENIAL_TEXTS = [
  '事件证明存在越限，但不授权自动控制动作。',
  '本建议需人工确认后执行，服务不自动闭环下发。',
]
const LEGITIMATE_CONTROL_DENIAL_TEXTS = [
  ...REAL_C04_CONTROL_DENIAL_TEXTS,
  '系统不具备设备控制权限。',
  '所有运行建议都只是辅助信息，执行任何操作前均须人工确认；本应用不具备设备控制、设定值修改或模式切换权限。',
]
const CONTROL_AUTHORITY_MODALITIES = ['会', '将', '能', '可以', '可', '可能', '能够', '将会']
const CONTROL_AUTHORITY_SUBJECTS = ['系统', '应用', '服务', '平台']
const ACTIVE_CONTROL_AUTHORITY_TEXTS = CONTROL_AUTHORITY_MODALITIES.map(
  (modality) => `系统${modality}下发设备指令。`,
)
const PASSIVE_CONTROL_AUTHORITY_TEXTS = CONTROL_AUTHORITY_MODALITIES.map(
  (modality) => `设备指令${modality}由系统下发。`,
)
const MODAL_CONTROL_AUTHORITY_TEXTS = [
  ...ACTIVE_CONTROL_AUTHORITY_TEXTS,
  ...PASSIVE_CONTROL_AUTHORITY_TEXTS,
]
const RESIDUAL_CONTROL_AUTHORITY_TEXTS = [
  ...CONTROL_AUTHORITY_SUBJECTS.flatMap((subject) => [
    `${subject}下发设备指令。`,
    ...CONTROL_AUTHORITY_MODALITIES.map(
      (modality) => `${subject}${modality}下发设备指令。`,
    ),
    `设备指令由${subject}下发。`,
    ...CONTROL_AUTHORITY_MODALITIES.map(
      (modality) => `设备指令${modality}被${subject}下发。`,
    ),
    ...['获得', '得到', '取得'].map(
      (authorization) => `${subject}此前${authorization}授权执行设备操作。`,
    ),
  ]),
]
const REQUIRED_REVIEW_CONTROL_AUTHORITY_TEXTS = [
  '设备指令将被系统下发。',
  '设备指令由系统下发。',
  '系统此前获得授权执行设备操作。',
  '服务可以下发设备指令。',
]
const REQUIRED_REVIEW_MIXED_UNSAFE_TEXTS = REAL_C04_CONTROL_DENIAL_TEXTS.flatMap(
  (denial) => REQUIRED_REVIEW_CONTROL_AUTHORITY_TEXTS.map(
    (claim) => `${denial}${claim}`,
  ),
)
const RESIDUAL_MIXED_UNSAFE_TEXTS = REAL_C04_CONTROL_DENIAL_TEXTS.flatMap(
  (denial) => RESIDUAL_CONTROL_AUTHORITY_TEXTS.map((claim) => `${denial}${claim}`),
)
const MIXED_REAL_C04_UNSAFE_TEXTS = REAL_C04_CONTROL_DENIAL_TEXTS.flatMap(
  (denial) => [
    ...MODAL_CONTROL_AUTHORITY_TEXTS.map((text) => `${denial}${text}`),
    `${denial}系统自动执行设备操作。`,
    `${denial}系统直接下发设备指令。`,
    `${denial}系统此前已获授权执行设备操作。`,
    `${denial}人工确认不是必须条件。`,
  ],
)
const UNSAFE_Q09_ANSWER_TEXTS = [
  '并非所有操作建议均须人工确认。',
  '人工确认不是必须条件。',
  '系统会自动发送设备指令。',
  '系统可以下发设备指令。',
  '应用可能控制设备。',
  '系统已被授权执行设备操作。',
  '应用被允许发送设备命令。',
  '设备指令可由系统下发。',
  '系统不具备设备控制权限，但设备指令可由系统下发。',
  ...MODAL_CONTROL_AUTHORITY_TEXTS,
  ...MODAL_CONTROL_AUTHORITY_TEXTS.map(
    (text) => `系统不具备设备控制权限，但${text}`,
  ),
  ...MIXED_REAL_C04_UNSAFE_TEXTS,
]
const INVALID_HUMAN_CONFIRMATION_DECLARATIONS = [
  '所有操作建议均须人工确认，但确认不是必需的。',
  '所有操作建议均须人工确认；人工确认并非必要条件。',
  '所有操作建议均须人工确认，但系统可以下发设备指令。',
]
const CONTROL_AUTHORITY_TEXTS = [
  '系统有权下发设备指令',
  '应用已获授权控制设备',
  '操作员确认后，系统获准发送设备命令',
  '系统拥有设备控制权限。',
  '应用具备下发设备指令的权限。',
  '设备指令可由系统下发。',
  '系统不具备设备控制权限，但设备指令可由系统下发。',
  ...MODAL_CONTROL_AUTHORITY_TEXTS,
  ...MODAL_CONTROL_AUTHORITY_TEXTS.map(
    (text) => `系统不具备设备控制权限，但${text}`,
  ),
  ...MIXED_REAL_C04_UNSAFE_TEXTS,
]

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function createTimeseries() {
  const rows = []
  for (let minute = 0; minute <= 120; minute += 10) {
    const timestamp = new Date(Date.UTC(2026, 0, 5, 9, minute)).toISOString()
    const officialValues = Object.fromEntries(
      officialFieldFixture.fields.map((field) => [field, '0']),
    )
    Object.assign(officialValues, {
      timestamp,
      pv_forecast_kw: '1000',
      pv_available_kw: '1000',
      pv_actual_kw: '1000',
      aux_load_kw: '20',
      bess_soc_pct: '50',
      pcc_power_actual_kw: minute >= 60 && minute <= 70 ? '720' : '450',
      grid_export_power_limit_kw: '500',
      grid_import_power_limit_kw: '600',
      ems_total_elz_target_kw: '300',
    })
    rows.push(officialFieldFixture.fields.map((field) => officialValues[field]))
  }
  return `${[timeseriesColumns, ...rows].map((row) => row.join(',')).join('\n')}\n`
}

function createLabels() {
  return [
    'event_id,anomaly_code,start_time,end_time,comment',
    'public-c04-later,C04,2026-01-05T10:20:00Z,2026-01-05T10:25:00Z,later',
    'public-c03-overlap,C03,2026-01-05T09:50:00Z,2026-01-05T10:00:00Z,overlap',
    'public-c04-earliest,C04,2026-01-05T10:00:00Z,2026-01-05T10:10:00Z,"earliest, selected"',
    'public-c01-outside,C01,2026-01-05T11:30:00Z,2026-01-05T11:35:00Z,outside',
    '',
  ].join('\n')
}

async function createPackage() {
  const packageRoot = await mkdtemp(join(tmpdir(), 'h2-public-validation-'))
  const dataDirectory = join(packageRoot, 'public-validation')
  await mkdir(dataDirectory)
  const timeseries = createTimeseries()
  const labels = createLabels()
  await Promise.all([
    writeFile(join(dataDirectory, 'validation-timeseries.csv'), timeseries, 'utf8'),
    writeFile(join(dataDirectory, 'validation-labels.csv'), labels, 'utf8'),
  ])
  return {
    packageRoot,
    timeseries,
    labels,
    timeseriesRelativePath: 'public-validation/validation-timeseries.csv',
    labelsRelativePath: 'public-validation/validation-labels.csv',
  }
}

function syntheticSourceContract(fixture) {
  return {
    timeseries: {
      filename: 'validation-timeseries.csv',
      sha256: sha256(fixture.timeseries),
      rowCount: 13,
      firstTimestamp: '2026-01-05T09:00:00Z',
      lastTimestamp: '2026-01-05T11:00:00Z',
    },
    labels: {
      filename: 'validation-labels.csv',
      sha256: sha256(fixture.labels),
      rowCount: 4,
      eventCount: 4,
      firstStart: '2026-01-05T09:50:00Z',
      lastEnd: '2026-01-05T11:35:00Z',
      byCode: { C01: 1, C03: 1, C04: 2 },
    },
    directedDemo: {
      selectedEvent: {
        eventId: 'public-c04-earliest',
        code: 'C04',
        startTime: '2026-01-05T10:00:00.000Z',
        endTime: '2026-01-05T10:10:00.000Z',
      },
      overlappingLabels: [
        {
          eventId: 'public-c03-overlap',
          code: 'C03',
          startTime: '2026-01-05T09:50:00.000Z',
          endTime: '2026-01-05T10:00:00.000Z',
        },
        {
          eventId: 'public-c04-earliest',
          code: 'C04',
          startTime: '2026-01-05T10:00:00.000Z',
          endTime: '2026-01-05T10:10:00.000Z',
        },
        {
          eventId: 'public-c04-later',
          code: 'C04',
          startTime: '2026-01-05T10:20:00.000Z',
          endTime: '2026-01-05T10:25:00.000Z',
        },
      ],
    },
    verifiedScope: {
      mode: 'TEST_FIXTURE',
      scope: 'self_consistent_fixture_contract',
      displayLabel: 'SELF_CONSISTENT_FIXTURE_CONTRACT · Test fixture',
    },
  }
}

async function runPrepare(fixture, outputDirectory, overrides = {}) {
  try {
    const value = await prepareValidationSlice({
      packagePath: fixture.packageRoot,
      timeseriesPath: fixture.timeseriesRelativePath,
      labelsPath: fixture.labelsRelativePath,
      timeseriesHash: overrides.timeseriesHash ?? sha256(fixture.timeseries),
      labelsHash: overrides.labelsHash ?? sha256(fixture.labels),
      outputPath: outputDirectory,
    }, syntheticSourceContract(fixture))
    return { status: 0, stdout: JSON.stringify(value), stderr: '' }
  } catch (error) {
    return { status: 1, stdout: '', stderr: error.message }
  }
}

async function prepareFixtureSlice(caseName) {
  await mkdir(generatedRoot, { recursive: true })
  const caseRoot = await mkdtemp(join(generatedRoot, `${caseName}-`))
  const fixture = await createPackage()
  const outputDirectory = join(caseRoot, 'prepared')
  const result = await runPrepare(fixture, outputDirectory)
  assert.equal(result.status, 0, result.stderr)
  const manifestPath = join(outputDirectory, 'validation-slice-manifest.json')
  const manifestBytes = await readFile(manifestPath)
  return {
    caseRoot,
    fixture,
    outputDirectory,
    manifestPath,
    manifestBytes,
    manifest: JSON.parse(manifestBytes.toString('utf8')),
    sourceContract: syntheticSourceContract(fixture),
    result,
  }
}

function artifactRecord(relativePath, content) {
  return { relativePath, sha256: sha256(content) }
}

async function writeRunArtifacts(
  root,
  sequence,
  runId,
  analyzedEventId,
  detectorFingerprint,
  displayLabel,
) {
  const runDirectory = join(root, `run-${sequence}`)
  await mkdir(runDirectory)
  const diagnosis = [
    '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"></head><body>',
    ...diagnosisSections.map((heading) => `<h2>${heading}</h2><p>验证内容。</p>`),
    `<p><code>${analyzedEventId}</code> · C04 / EXPORT_POWER_LIMIT_NOT_TRACKED</p>`,
    `<p>validation-slice.csv · ${detectorFingerprint} · ${displayLabel}</p>`,
    `<p><code>evidence-${sequence}-1</code></p>`,
    ...REAL_C04_CONTROL_DENIAL_TEXTS.map((text) => `<p>${text}</p>`),
    `<p>${COMPLETE_SAFETY_STATEMENT}</p></body></html>`,
  ].join('')
  const evidenceResponse = `${JSON.stringify({
    schemaVersion: 1,
    eventId: analyzedEventId,
    code: 'C04',
    evidence: [{ evidenceId: `evidence-${sequence}-1` }],
  }, null, 2)}\n`
  const audit = `${JSON.stringify({
    schemaVersion: 1,
    exportKind: 'event_review_audit',
    runId,
    actorIdentityNotice: 'local_operator_labels_are_unverified',
    events: [{
      event: { eventId: analyzedEventId },
      review: {
        currentState: 'confirmed',
        revision: 1,
        entries: [{
          requestId: `demo-review-${sequence}`,
          action: 'confirm',
          revision: 1,
          actor: { kind: 'local_operator', displayName: 'demo_operator' },
        }],
      },
    }],
  })}\n`
  assert.equal(SUBMISSION_COLUMNS.length, 16)
  const submission = serializeSubmission([{
    pred_event_id: analyzedEventId,
    start_time: '2026-01-05T10:00:00Z',
    end_time: '2026-01-05T10:10:00Z',
    anomaly_code: 'C04',
    anomaly_subtype: 'EXPORT_POWER_LIMIT_NOT_TRACKED',
    severity: '高',
    primary_control_object: 'EMS并网点功率边界控制模块',
    affected_equipment: 'PCC,BESS,ELZ,PV',
    confidence: '0.9',
    evidence_json: '[{"evidence_id":"EV-001"}]',
    root_cause: 'Bounded evidence-grounded cause.',
    recommended_action: 'Verify locally before human-confirmed action.',
    primary_impact_metric: 'pcc_power_limit_violation_energy_kwh',
    estimated_impact_value: '1.0',
    first_detection_time: '2026-01-05T10:00:00Z',
    requires_human_confirmation: 'true',
  }])
  await Promise.all([
    writeFile(join(runDirectory, 'diagnosis.html'), diagnosis, 'utf8'),
    writeFile(join(runDirectory, 'evidence-response.json'), evidenceResponse, 'utf8'),
    writeFile(join(runDirectory, 'review-audit.json'), audit, 'utf8'),
    writeFile(join(runDirectory, 'submission.csv'), submission, 'utf8'),
  ])
  return {
    diagnosisReport: artifactRecord(`run-${sequence}/diagnosis.html`, diagnosis),
    evidenceResponse: artifactRecord(
      `run-${sequence}/evidence-response.json`,
      evidenceResponse,
    ),
    reviewAudit: artifactRecord(`run-${sequence}/review-audit.json`, audit),
    submissionCsv: artifactRecord(`run-${sequence}/submission.csv`, submission),
  }
}

function runtimeProvenance(fingerprint, modelVersion = null) {
  return {
    mode: 'LIVE_ANALYSIS',
    source: 'test-fixture-import',
    generatedAt: ANALYSIS_GENERATED_AT,
    datasetFingerprint: fingerprint,
    modelVersion,
    ruleVersion: 'test-rule-v1',
    configurationVersion: 'test-configuration-v1',
    limitations: ['Self-consistent test fixture only.'],
  }
}

function rendererProvenance(fingerprint, rendererVersion) {
  return {
    mode: 'LIVE_ANALYSIS',
    source: 'test-fixture-import',
    generatedAt: ANALYSIS_COMPLETED_AT,
    datasetFingerprint: fingerprint,
    modelVersion: ANALYSIS_MODEL_VERSION,
    ruleVersion: 'test-rule-v1',
    configurationVersion: 'test-configuration-v1',
    rendererVersion,
    limitations: ['Self-consistent test fixture only.'],
  }
}

function q09Binding(runId, eventId, fingerprint, contentHash) {
  const reportId = `report-single_event_diagnosis-${eventId}`
  const reportCitationId = 'citation-Q09-generated_report-2'
  return {
    schemaVersion: 1,
    answerId: `answer-Q09-${eventId}`,
    runId,
    questionId: 'Q09',
    mode: 'DETERMINISTIC_TEMPLATE',
    generatedAt: ANALYSIS_COMPLETED_AT,
    eventId,
    sections: [
      {
        sectionId: 'report_scope',
        claimKind: 'fact',
        text: `已针对当前运行事件 ${eventId} 生成单事件诊断报告。`,
        citationIds: ['citation-Q09-report_scope-1'],
      },
      {
        sectionId: 'generated_report',
        claimKind: 'recommendation',
        text: GENERATED_REPORT_SECTION_TEXT,
        citationIds: [reportCitationId],
      },
    ],
    citations: [
      {
        citationId: 'citation-Q09-report_scope-1',
        claimKind: 'fact',
        sourceType: 'event',
        sourceId: eventId,
        eventId,
      },
      {
        citationId: reportCitationId,
        claimKind: 'recommendation',
        sourceType: 'report',
        sourceId: reportId,
        eventId,
      },
    ],
    refusedControlClaim: true,
    provenance: rendererProvenance(fingerprint, 'deterministic-assistant-p1-v1'),
    generatedReport: {
      descriptor: {
        schemaVersion: 1,
        reportId,
        runId,
        kind: 'single_event_diagnosis',
        format: 'html',
        status: 'ready',
        generatedAt: ANALYSIS_COMPLETED_AT,
        filename: `${eventId}-diagnosis.html`,
        contentHash,
        eventId,
        warnings: [],
        safetyDisclaimer: COMPLETE_SAFETY_STATEMENT,
        provenance: rendererProvenance(fingerprint, 'jinja-report-p1-v1'),
      },
      mediaType: 'text/html',
    },
  }
}

function runnerQ09Answer(runId, eventId, fingerprint, displayLabel) {
  const content = [
    '<!doctype html><html lang="zh-CN"><body>',
    `<p><code>${eventId}</code> · C04 / EXPORT_POWER_LIMIT_NOT_TRACKED</p>`,
    `<p>validation-slice.csv · ${fingerprint} · ${displayLabel}</p>`,
    '<p><code>evidence-1</code></p>',
    ...REAL_C04_CONTROL_DENIAL_TEXTS.map((text) => `<p>${text}</p>`),
    `<p>${COMPLETE_SAFETY_STATEMENT}</p>`,
    '</body></html>',
  ].join('')
  const answer = q09Binding(runId, eventId, fingerprint, sha256(content))
  return {
    ...answer,
    generatedReport: {
      ...answer.generatedReport,
      content,
    },
  }
}

function measuredRun({
  sequence,
  runId,
  analyzedEventId,
  startedAt,
  completedAt,
  totalDurationMs,
  artifacts,
  detectorFingerprint,
  detectorRowCount,
}) {
  const timeRange = {
    startTime: '2026-01-05T09:30:00Z',
    endTime: '2026-01-05T10:40:00Z',
  }
  return {
    executionId: `demo-execution-${sequence}`,
    sequence,
    status: 'passed',
    runId,
    analyzedEventId,
    startedAt,
    completedAt,
    totalDurationMs,
    stageDurations: [
      { stage: 'import', durationMs: 10_000 },
      { stage: 'analysis', durationMs: 30_000 },
      { stage: 'evidence_review', durationMs: 15_000 },
      { stage: 'human_review', durationMs: 15_000 },
      { stage: 'q09_report', durationMs: 25_000 },
      { stage: 'artifact_export', durationMs: 15_000 },
    ],
    importedDataset: {
      datasetId: `fixture-dataset-${sequence}`,
      sourceFilename: 'validation-slice.csv',
      rowCount: detectorRowCount,
      fingerprint: detectorFingerprint,
      timeRange,
      provenance: runtimeProvenance(detectorFingerprint),
    },
    evidenceReview: {
      runId,
      eventId: analyzedEventId,
      anomalyCode: 'C04',
      evidenceIds: [`evidence-${sequence}-1`],
      evidenceCount: 1,
      artifact: { ...artifacts.evidenceResponse },
    },
    humanReview: {
      runId,
      eventId: analyzedEventId,
      requestId: `demo-review-${sequence}`,
      action: 'confirm',
      revision: 1,
      actor: { kind: 'local_operator', displayName: 'demo_operator' },
      replayed: false,
    },
    analysisRun: {
      runId,
      status: 'completed',
      startedAt: ANALYSIS_GENERATED_AT,
      completedAt: ANALYSIS_COMPLETED_AT,
      sourceFilename: 'validation-slice.csv',
      rowCount: detectorRowCount,
      fingerprint: detectorFingerprint,
      timeRange,
      provenance: runtimeProvenance(detectorFingerprint, ANALYSIS_MODEL_VERSION),
    },
    q09: q09Binding(
      runId,
      analyzedEventId,
      detectorFingerprint,
      artifacts.diagnosisReport.sha256,
    ),
    publicLabelsUsedAsDetectorInput: false,
    artifacts,
  }
}

async function createReceiptFixture(caseName) {
  const prepared = await prepareFixtureSlice(caseName)
  const artifactsRoot = join(prepared.caseRoot, 'artifacts')
  await mkdir(artifactsRoot)
  const firstArtifacts = await writeRunArtifacts(
    artifactsRoot,
    1,
    'run-validation-1',
    'detected-c04-1',
    prepared.manifest.slice.sha256,
    prepared.sourceContract.verifiedScope.displayLabel,
  )
  const secondArtifacts = await writeRunArtifacts(
    artifactsRoot,
    2,
    'run-validation-2',
    'detected-c04-2',
    prepared.manifest.slice.sha256,
    prepared.sourceContract.verifiedScope.displayLabel,
  )
  const candidateCommit = 'a'.repeat(40)
  const receipt = {
    schemaVersion: 2,
    receiptKind: 'h2_validation_slice_demo',
    recordedAt: '2026-08-28T12:05:00Z',
    candidateCommit,
    targetEnvironment: {
      machine: 'qa-test-machine',
      os: 'Windows test fixture',
      cpu: 'test cpu',
      nodeVersion: 'v22.0.0',
    },
    servicesStartedBeforeTimer: true,
    timedScopeExcludes: ['installation', 'launcher_startup'],
    verifiedManifestScope: {
      scope: prepared.sourceContract.verifiedScope.scope,
      displayLabel: prepared.sourceContract.verifiedScope.displayLabel,
      publicLabelsMaySelectDirectedDemoBeforeAnalysis: true,
      publicLabelsUsedAsDetectorInput: false,
      sourceIdentity: prepared.manifest.sources,
    },
    sourceHashes: {
      timeseries: prepared.manifest.sources.timeseries.sha256,
      labels: prepared.manifest.sources.labels.sha256,
      sliceManifest: sha256(prepared.manifestBytes),
      detectorInput: prepared.manifest.slice.sha256,
    },
    selectedEvent: prepared.manifest.selectedEvent,
    runs: [
      measuredRun({
        sequence: 1,
        runId: 'run-validation-1',
        analyzedEventId: 'detected-c04-1',
        startedAt: '2026-08-28T12:00:00Z',
        completedAt: '2026-08-28T12:02:00Z',
        totalDurationMs: 120_000,
        artifacts: firstArtifacts,
        detectorFingerprint: prepared.manifest.slice.sha256,
        detectorRowCount: prepared.manifest.slice.rowCount,
      }),
      measuredRun({
        sequence: 2,
        runId: 'run-validation-2',
        analyzedEventId: 'detected-c04-2',
        startedAt: '2026-08-28T12:02:10Z',
        completedAt: '2026-08-28T12:04:20Z',
        totalDurationMs: 130_000,
        artifacts: secondArtifacts,
        detectorFingerprint: prepared.manifest.slice.sha256,
        detectorRowCount: prepared.manifest.slice.rowCount,
      }),
    ],
    claims: {
      organizerScore: false,
      fullValidation: false,
      hiddenTest: false,
      deployment: false,
      productionProof: false,
      fixtureSubstitution: false,
    },
  }
  const receiptPath = join(artifactsRoot, 'demo-receipt.json')
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8')
  return {
    ...prepared,
    artifactsRoot,
    receipt,
    receiptPath,
    candidateCommit,
  }
}

async function runReceiptValidator(fixture, receiptPath = fixture.receiptPath) {
  try {
    const value = await validateDemoReceipt({
      receiptPath,
      manifestPath: fixture.manifestPath,
      artifactsRoot: fixture.artifactsRoot,
      expectedCommit: fixture.candidateCommit,
    }, fixture.sourceContract)
    return { status: 0, stdout: JSON.stringify(value), stderr: '' }
  } catch (error) {
    return { status: 1, stdout: '', stderr: error.message }
  }
}

async function runReceiptMutation(fixture, name, mutate) {
  const receipt = structuredClone(fixture.receipt)
  await mutate(receipt)
  const path = join(fixture.artifactsRoot, `${name}.json`)
  await writeFile(path, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8')
  return runReceiptValidator(fixture, path)
}

async function cleanup(fixture) {
  await Promise.all([
    rm(fixture.caseRoot, { recursive: true, force: true }),
    rm(fixture.fixture.packageRoot, { recursive: true, force: true }),
  ])
}

describe('P1 public-validation slice preparation', () => {
  it('selects the earliest C04 event, pads 30 minutes, verifies hashes, and keeps labels external', async () => {
    const fixture = await prepareFixtureSlice('slice-success')
    try {
      const output = JSON.parse(fixture.result.stdout)
      const slice = await readFile(join(fixture.outputDirectory, 'validation-slice.csv'), 'utf8')
      const rows = slice.trimEnd().split('\n')

      assert.equal(output.status, 'prepared')
      assert.equal(fixture.manifest.provenance.scope, 'self_consistent_fixture_contract')
      assert.notEqual(fixture.manifest.provenance.scope, 'VALIDATION_SLICE')
      assert.equal(output.selectedEventId, 'public-c04-earliest')
      assert.equal(fixture.manifest.selectedEvent.eventId, 'public-c04-earliest')
      assert.deepEqual(fixture.manifest.slice.requestedTimeRange, {
        startTime: '2026-01-05T09:30:00.000Z',
        endTime: '2026-01-05T10:40:00.000Z',
      })
      assert.equal(fixture.manifest.slice.rowCount, 8)
      assert.equal(rows.length, 9)
      assert.doesNotMatch(rows[0], /ground_truth_label|event_id|anomaly_subtype/)
      assert.deepEqual(rows[0].split(','), officialFieldFixture.fields)
      assert.equal(fixture.manifest.slice.columns.length, 69)
      assert.deepEqual(fixture.manifest.slice.columns, officialFieldFixture.fields)
      assert.deepEqual(fixture.manifest.slice.removedLabelColumns, [])
      assert.deepEqual(
        fixture.manifest.overlappingLabels.map(({ eventId }) => eventId),
        ['public-c03-overlap', 'public-c04-earliest', 'public-c04-later'],
      )
      assert.equal(fixture.manifest.slice.sha256, sha256(slice))
      assert.equal(fixture.manifest.sources.timeseries.sha256, sha256(fixture.fixture.timeseries))
      assert.equal(fixture.manifest.sources.labels.sha256, sha256(fixture.fixture.labels))
      assert.ok(!fixture.result.stdout.includes(fixture.fixture.packageRoot))
      assert.ok(!fixture.result.stdout.includes(fixture.outputDirectory))
      assert.ok(!slice.includes(fixture.fixture.packageRoot))
      assert.ok(!JSON.stringify(fixture.manifest).includes(fixture.fixture.packageRoot))
    } finally {
      await cleanup(fixture)
    }
  })

  it('fails closed on a source-hash mismatch before creating output', async () => {
    await mkdir(generatedRoot, { recursive: true })
    const caseRoot = await mkdtemp(join(generatedRoot, 'slice-hash-failure-'))
    const fixture = await createPackage()
    const outputDirectory = join(caseRoot, 'prepared')
    try {
      const result = await runPrepare(fixture, outputDirectory, {
        timeseriesHash: `sha256:${'0'.repeat(64)}`,
      })
      assert.equal(result.status, 1)
      assert.match(result.stderr, /SHA-256 does not match/)
      await assert.rejects(readFile(join(outputDirectory, 'validation-slice.csv')))
    } finally {
      await Promise.all([
        rm(caseRoot, { recursive: true, force: true }),
        rm(fixture.packageRoot, { recursive: true, force: true }),
      ])
    }
  })

  it('fails closed when the public label schema is incomplete', async () => {
    await mkdir(generatedRoot, { recursive: true })
    const caseRoot = await mkdtemp(join(generatedRoot, 'slice-schema-failure-'))
    const fixture = await createPackage()
    fixture.labels = 'event_id,anomaly_code,start_time\npublic-c04,C04,2026-01-05T10:00:00Z\n'
    await writeFile(
      join(fixture.packageRoot, fixture.labelsRelativePath),
      fixture.labels,
      'utf8',
    )
    try {
      const result = await runPrepare(fixture, join(caseRoot, 'prepared'))
      assert.equal(result.status, 1)
      assert.match(result.stderr, /exactly one endTime column/)
    } finally {
      await Promise.all([
        rm(caseRoot, { recursive: true, force: true }),
        rm(fixture.packageRoot, { recursive: true, force: true }),
      ])
    }
  })

  it('fails closed when a required detector value is not numeric', async () => {
    await mkdir(generatedRoot, { recursive: true })
    const caseRoot = await mkdtemp(join(generatedRoot, 'slice-numeric-failure-'))
    const fixture = await createPackage()
    fixture.timeseries = fixture.timeseries.replace(
      ',1000,1000,1000,',
      ',not-a-number,1000,1000,',
    )
    await writeFile(
      join(fixture.packageRoot, fixture.timeseriesRelativePath),
      fixture.timeseries,
      'utf8',
    )
    try {
      const result = await runPrepare(fixture, join(caseRoot, 'prepared'))
      assert.equal(result.status, 1)
      assert.match(result.stderr, /values must be finite numbers/)
    } finally {
      await Promise.all([
        rm(caseRoot, { recursive: true, force: true }),
        rm(fixture.packageRoot, { recursive: true, force: true }),
      ])
    }
  })

  it('rejects timeseries input contaminated with public-label columns', async () => {
    await mkdir(generatedRoot, { recursive: true })
    const caseRoot = await mkdtemp(join(generatedRoot, 'slice-label-column-failure-'))
    const fixture = await createPackage()
    const lines = fixture.timeseries.trimEnd().split('\n')
    fixture.timeseries = `${lines.map((line, index) =>
      index === 0 ? `${line},ground_truth_label` : `${line},C04`
    ).join('\n')}\n`
    await writeFile(
      join(fixture.packageRoot, fixture.timeseriesRelativePath),
      fixture.timeseries,
      'utf8',
    )
    try {
      const result = await runPrepare(fixture, join(caseRoot, 'prepared'))
      assert.equal(result.status, 1)
      assert.match(result.stderr, /exactly the official 69-field vocabulary/)
    } finally {
      await Promise.all([
        rm(caseRoot, { recursive: true, force: true }),
        rm(fixture.packageRoot, { recursive: true, force: true }),
      ])
    }
  })

  it('rejects an explicit output path outside the canonical generated prefix', async () => {
    const fixture = await createPackage()
    const outputDirectory = join(directory, `unignored-output-${process.pid}-${Date.now()}`)
    try {
      const result = await runPrepare(fixture, outputDirectory)
      assert.equal(result.status, 1)
      assert.match(result.stderr, /tests\/h2-sentinel\/reports\/generated/)
      await assert.rejects(readFile(join(outputDirectory, 'validation-slice.csv')))
    } finally {
      await rm(fixture.packageRoot, { recursive: true, force: true })
    }
  })
})

describe('P1 measured demo receipt validation', () => {
  it('keeps exact C04 denials bounded and rejects residual control authority', () => {
    for (const denial of REAL_C04_CONTROL_DENIAL_TEXTS) {
      assert.equal(hasUnsafeAnswerText(denial), false)
      const safeDocument = `<html><body><p>${denial}</p><p>${COMPLETE_SAFETY_STATEMENT}</p></body></html>`
      assert.equal(documentHasRequiredHumanConfirmation(safeDocument), true)
    }
    assert.equal(hasUnsafeAnswerText(COMPLETE_SAFETY_STATEMENT), false)
    assert.equal(
      documentHasRequiredHumanConfirmation(
        `<html><body><p>${COMPLETE_SAFETY_STATEMENT}</p></body></html>`,
      ),
      true,
    )

    for (const text of RESIDUAL_MIXED_UNSAFE_TEXTS) {
      assert.equal(hasUnsafeAnswerText(text), true, text)
      const unsafeDocument = `<html><body><p>${text}</p><p>${COMPLETE_SAFETY_STATEMENT}</p></body></html>`
      assert.equal(documentHasRequiredHumanConfirmation(unsafeDocument), false, text)
    }
  })

  it('runner preserves the real completed Analytics lifecycle identity', () => {
    const fingerprint = `sha256:${'a'.repeat(64)}`
    const dataset = {
      datasetId: 'dataset-validation',
      mode: 'LIVE_ANALYSIS',
      sourceFilename: 'validation-slice.csv',
      rowCount: 101,
      fingerprint,
      timeRange: {
        startTime: '2026-01-05T09:30:00Z',
        endTime: ANALYSIS_GENERATED_AT,
      },
      provenance: runtimeProvenance(fingerprint),
    }
    const response = {
      schemaVersion: 1,
      runId: 'run-validation',
      status: 'completed',
      startedAt: ANALYSIS_GENERATED_AT,
      completedAt: ANALYSIS_COMPLETED_AT,
      dataset,
      provenance: runtimeProvenance(fingerprint, ANALYSIS_MODEL_VERSION),
      events: [],
    }
    const identity = assertAnalysisRun(response, { dataset })
    assert.equal(identity.status, 'completed')
    assert.equal(identity.completedAt, ANALYSIS_COMPLETED_AT)
    assert.equal(identity.provenance.generatedAt, ANALYSIS_GENERATED_AT)

    for (const mutate of [
      (run) => { run.status = 'running' },
      (run) => { run.completedAt = '2026-01-05T10:39:59Z' },
      (run) => { run.startedAt = ANALYSIS_COMPLETED_AT },
    ]) {
      const invalid = structuredClone(response)
      mutate(invalid)
      assert.throws(() => assertAnalysisRun(invalid, { dataset }))
    }
  })

  it('runner binds non-empty evidence and the exact non-replayed review receipt', () => {
    const request = {
      requestId: 'demo-review-1',
      runId: 'run-validation',
      eventId: 'detected-c04',
      action: 'confirm',
      actor: { kind: 'local_operator', displayName: 'demo_operator' },
    }
    const evidence = {
      eventId: request.eventId,
      code: 'C04',
      evidence: [{ evidenceId: 'evidence-1' }],
    }
    const receipt = {
      schemaVersion: 1,
      replayed: false,
      entry: { requestId: request.requestId, action: 'confirm', revision: 1, actor: request.actor },
      review: {
        runId: request.runId,
        eventId: request.eventId,
        currentState: 'confirmed',
        revision: 1,
      },
    }
    assert.deepEqual(
      assertEvidenceReviewIdentity(evidence, request.runId, request.eventId, 'C04'),
      {
        runId: request.runId,
        eventId: request.eventId,
        anomalyCode: 'C04',
        evidenceIds: ['evidence-1'],
        evidenceCount: 1,
      },
    )
    assert.equal(assertHumanReviewIdentity(receipt, request).replayed, false)

    for (const mutate of [
      (value) => { value.eventId = 'wrong-event' },
      (value) => { value.code = 'C03' },
      (value) => { value.evidence = [] },
    ]) {
      const invalid = structuredClone(evidence)
      mutate(invalid)
      assert.throws(
        () => assertEvidenceReviewIdentity(invalid, request.runId, request.eventId, 'C04'),
      )
    }
    for (const mutate of [
      (value) => { value.replayed = true },
      (value) => { value.entry.requestId = 'wrong-request' },
      (value) => { value.entry.action = 'reject' },
      (value) => { value.entry.revision = 2 },
      (value) => { value.entry.actor.displayName = 'different-operator' },
      (value) => { value.review.runId = 'wrong-run' },
      (value) => { value.review.eventId = 'wrong-event' },
    ]) {
      const invalid = structuredClone(receipt)
      mutate(invalid)
      assert.throws(() => assertHumanReviewIdentity(invalid, request))
    }
  })

  it('accepts the real C04 Q09 lifecycle shape and rejects every identity or safety drift', () => {
    const expected = {
      runId: 'run-validation',
      eventId: 'detected-c04',
      sourceFilename: 'validation-slice.csv',
      fingerprint: `sha256:${'a'.repeat(64)}`,
      displayLabel: 'LIVE_ANALYSIS · 验证集切片',
      completedAt: ANALYSIS_COMPLETED_AT,
      expectedCode: 'C04',
      evidenceIds: ['evidence-1'],
      analysisProvenance: runtimeProvenance(
        `sha256:${'a'.repeat(64)}`,
        ANALYSIS_MODEL_VERSION,
      ),
    }
    const valid = runnerQ09Answer(
      expected.runId,
      expected.eventId,
      expected.fingerprint,
      expected.displayLabel,
    )
    assert.equal(assertQ09Answer(valid, expected).questionId, 'Q09')
    assert.notEqual(expected.analysisProvenance.generatedAt, valid.generatedAt)
    assert.equal(expected.analysisProvenance.generatedAt, '2026-01-05T12:45:00Z')
    assert.equal(valid.generatedAt, '2026-01-05T12:45:01Z')
    assert.equal(valid.provenance.modelVersion, 'deterministic-c01-c07-v4')
    assert.equal(valid.sections[1].text, GENERATED_REPORT_SECTION_TEXT)
    assert.equal(valid.generatedReport.descriptor.safetyDisclaimer, COMPLETE_SAFETY_STATEMENT)
    for (const text of LEGITIMATE_CONTROL_DENIAL_TEXTS) {
      const safeDenial = structuredClone(valid)
      safeDenial.sections[1].text = text
      assert.equal(assertQ09Answer(safeDenial, expected).questionId, 'Q09')
    }
    for (const text of RESIDUAL_MIXED_UNSAFE_TEXTS) {
      const unsafeResidual = structuredClone(valid)
      unsafeResidual.sections[1].text = text
      assert.throws(() => assertQ09Answer(unsafeResidual, expected), text)
    }

    const cases = [
      (answer) => { answer.questionId = 'Q08' },
      (answer) => { answer.runId = 'different-run' },
      (answer) => { answer.eventId = 'different-event' },
      (answer) => { answer.refusedControlClaim = false },
      (answer) => { answer.generatedAt = '2026-01-05T12:45:02Z' },
      (answer) => { answer.generatedReport.descriptor.kind = 'period_summary' },
      (answer) => { answer.generatedReport.descriptor.generatedAt = '2026-01-05T12:45:02Z' },
      (answer) => { answer.generatedReport.mediaType = 'application/json' },
      (answer) => { answer.generatedReport.descriptor.contentHash = `sha256:${'0'.repeat(64)}` },
      (answer) => {
        const citation = structuredClone(answer.citations[1])
        citation.citationId = 'citation-Q09-extra-report'
        answer.citations.push(citation)
      },
      (answer) => { answer.provenance.rendererVersion = 'different-renderer' },
      (answer) => { answer.generatedReport.descriptor.provenance.rendererVersion = 'different-renderer' },
      (answer) => { answer.provenance.source = 'contradictory-source' },
      (answer) => { answer.provenance.ruleVersion = 'contradictory-rule' },
      (answer) => { answer.provenance.configurationVersion = 'contradictory-configuration' },
      (answer) => { answer.provenance.modelVersion = 'contradictory-model' },
      (answer) => { answer.provenance.generatedAt = '2026-01-05T10:41:00Z' },
      (answer) => { answer.provenance.limitations = ['Contradictory limitation.'] },
      (answer) => { answer.generatedReport.descriptor.provenance.source = 'contradictory-source' },
      (answer) => { answer.generatedReport.descriptor.provenance.ruleVersion = 'contradictory-rule' },
      (answer) => {
        answer.generatedReport.descriptor.provenance.configurationVersion =
          'contradictory-configuration'
      },
      (answer) => {
        answer.generatedReport.descriptor.provenance.modelVersion = 'contradictory-model'
      },
      (answer) => {
        answer.generatedReport.descriptor.provenance.generatedAt = '2026-01-05T10:41:00Z'
      },
      (answer) => {
        answer.generatedReport.descriptor.provenance.limitations =
          ['Contradictory limitation.']
      },
      (answer) => {
        answer.generatedReport.descriptor.safetyDisclaimer = '建议仅供参考。'
        answer.generatedReport.content = answer.generatedReport.content.replace(
          '所有操作建议均须人工确认',
          '建议仅供参考',
        )
        answer.generatedReport.descriptor.contentHash = sha256(answer.generatedReport.content)
      },
      (answer) => {
        answer.generatedReport.descriptor.safetyDisclaimer = SHORT_SAFETY_DECLARATION
      },
      ...UNSAFE_Q09_ANSWER_TEXTS.map((text) =>
        (answer) => { answer.sections[1].text = text }),
      (answer) => {
        answer.generatedReport.descriptor.safetyDisclaimer =
          '无需人工确认；所有操作建议均须人工确认。'
      },
      ...INVALID_HUMAN_CONFIRMATION_DECLARATIONS.map((text) =>
        (answer) => { answer.generatedReport.descriptor.safetyDisclaimer = text }),
      (answer) => {
        answer.generatedReport.content = answer.generatedReport.content.replace(
          '</body>',
          '<p>系统可以下发设备指令。</p></body>',
        )
        answer.generatedReport.descriptor.contentHash = sha256(answer.generatedReport.content)
      },
      ...CONTROL_AUTHORITY_TEXTS.map((text) => (answer) => {
        answer.generatedReport.content = answer.generatedReport.content.replace(
          '</body>',
          `<p>${text}</p></body>`,
        )
        answer.generatedReport.descriptor.contentHash = sha256(answer.generatedReport.content)
      }),
      (answer) => {
        answer.generatedReport.content = answer.generatedReport.content.replace(
          COMPLETE_SAFETY_STATEMENT,
          SHORT_SAFETY_DECLARATION,
        )
        answer.generatedReport.descriptor.contentHash = sha256(answer.generatedReport.content)
      },
      (answer) => {
        answer.generatedReport.content = answer.generatedReport.content.replace(
          ' · C04 /',
          ' · C03 /',
        )
        answer.generatedReport.descriptor.contentHash = sha256(answer.generatedReport.content)
      },
      (answer) => {
        answer.generatedReport.content = answer.generatedReport.content.replace(
          '<code>evidence-1</code>',
          '<code>forged-evidence</code>',
        )
        answer.generatedReport.descriptor.contentHash = sha256(answer.generatedReport.content)
      },
      (answer) => {
        answer.generatedReport.content = answer.generatedReport.content.replace(
          expected.displayLabel,
          'unverified-scope',
        )
        answer.generatedReport.descriptor.contentHash = sha256(answer.generatedReport.content)
      },
    ]
    for (const mutate of cases) {
      const answer = structuredClone(valid)
      mutate(answer)
      assert.throws(() => assertQ09Answer(answer, expected))
    }
  })

  it('accepts two consecutive self-consistent fixture-contract runs under 180 seconds', async () => {
    const fixture = await createReceiptFixture('receipt-success')
    try {
      const result = await runReceiptValidator(fixture)
      assert.equal(result.status, 0, result.stderr)
      const output = JSON.parse(result.stdout)
      assert.deepEqual(output.durationsMs, [120_000, 130_000])
      assert.equal(output.eachUnder180Seconds, true)
      assert.equal(output.consecutiveRuns, 2)
      assert.equal(output.provenanceScope, 'self_consistent_fixture_contract')
      assert.notEqual(
        fixture.receipt.runs[0].analysisRun.provenance.generatedAt,
        fixture.receipt.runs[0].q09.generatedAt,
      )
      assert.ok(Object.values(output.unsupportedClaims).every((value) => value === false))
      for (const [index, text] of LEGITIMATE_CONTROL_DENIAL_TEXTS.entries()) {
        const safeDenialResult = await runReceiptMutation(
          fixture,
          `q09-safe-control-denial-${index + 1}`,
          (receipt) => { receipt.runs[0].q09.sections[1].text = text },
        )
        assert.equal(safeDenialResult.status, 0, safeDenialResult.stderr)
      }
    } finally {
      await cleanup(fixture)
    }
  })

  it('rejects 180 seconds, detector-input drift, and artifact hash drift', async () => {
    const fixture = await createReceiptFixture('receipt-failure')
    try {
      const slowReceipt = structuredClone(fixture.receipt)
      slowReceipt.runs[1].totalDurationMs = 180_000
      slowReceipt.runs[1].completedAt = '2026-08-28T12:05:10Z'
      const slowPath = join(fixture.artifactsRoot, 'slow-receipt.json')
      await writeFile(slowPath, `${JSON.stringify(slowReceipt, null, 2)}\n`, 'utf8')
      const slowResult = await runReceiptValidator(fixture, slowPath)
      assert.equal(slowResult.status, 1)
      assert.match(slowResult.stderr, /less than 180 seconds/)

      const detectorInputPath = join(fixture.outputDirectory, 'validation-slice.csv')
      const detectorInput = await readFile(detectorInputPath)
      await writeFile(detectorInputPath, Buffer.concat([detectorInput, Buffer.from('\n')]))
      const detectorDriftResult = await runReceiptValidator(fixture)
      assert.equal(detectorDriftResult.status, 1)
      assert.match(detectorDriftResult.stderr, /Detector input SHA-256 does not match/)
      await writeFile(detectorInputPath, detectorInput)

      const originalManifest = await readFile(fixture.manifestPath)
      const spoofedManifest = structuredClone(fixture.manifest)
      spoofedManifest.selectedEvent.eventId = 'self-consistent-lookalike'
      spoofedManifest.overlappingLabels[1].eventId = 'self-consistent-lookalike'
      const spoofedManifestBytes = Buffer.from(`${JSON.stringify(spoofedManifest, null, 2)}\n`)
      await writeFile(fixture.manifestPath, spoofedManifestBytes)
      const spoofedReceipt = structuredClone(fixture.receipt)
      spoofedReceipt.selectedEvent = spoofedManifest.selectedEvent
      spoofedReceipt.sourceHashes.sliceManifest = sha256(spoofedManifestBytes)
      const spoofedReceiptPath = join(fixture.artifactsRoot, 'spoofed-source-receipt.json')
      await writeFile(spoofedReceiptPath, `${JSON.stringify(spoofedReceipt, null, 2)}\n`)
      const spoofedResult = await runReceiptValidator(fixture, spoofedReceiptPath)
      assert.equal(spoofedResult.status, 1)
      assert.match(spoofedResult.stderr, /independent source contract/)
      await writeFile(fixture.manifestPath, originalManifest)

      const duplicateExecutionReceipt = structuredClone(fixture.receipt)
      duplicateExecutionReceipt.runs[1].executionId =
        duplicateExecutionReceipt.runs[0].executionId
      const duplicateExecutionPath = join(
        fixture.artifactsRoot,
        'duplicate-execution-receipt.json',
      )
      await writeFile(
        duplicateExecutionPath,
        `${JSON.stringify(duplicateExecutionReceipt, null, 2)}\n`,
        'utf8',
      )
      const duplicateExecutionResult = await runReceiptValidator(
        fixture,
        duplicateExecutionPath,
      )
      assert.equal(duplicateExecutionResult.status, 1)
      assert.match(duplicateExecutionResult.stderr, /distinct execution IDs/)

      const auditPath = join(fixture.artifactsRoot, 'run-1/review-audit.json')
      const audit = await readFile(auditPath, 'utf8')
      const invalidAuditValue = JSON.parse(audit)
      invalidAuditValue.events[0].review = {
        currentState: 'open',
        revision: 0,
        entries: [],
      }
      const invalidAudit = `${JSON.stringify(invalidAuditValue)}\n`
      await writeFile(auditPath, invalidAudit, 'utf8')
      const invalidAuditReceipt = structuredClone(fixture.receipt)
      invalidAuditReceipt.runs[0].artifacts.reviewAudit.sha256 = sha256(invalidAudit)
      const invalidAuditReceiptPath = join(
        fixture.artifactsRoot,
        'invalid-audit-receipt.json',
      )
      await writeFile(
        invalidAuditReceiptPath,
        `${JSON.stringify(invalidAuditReceipt, null, 2)}\n`,
        'utf8',
      )
      const invalidAuditResult = await runReceiptValidator(
        fixture,
        invalidAuditReceiptPath,
      )
      assert.equal(invalidAuditResult.status, 1)
      assert.match(invalidAuditResult.stderr, /confirmed revision 1/)
      await writeFile(auditPath, audit, 'utf8')

      const evidencePath = join(fixture.artifactsRoot, 'run-1/evidence-response.json')
      const evidenceResponse = await readFile(evidencePath, 'utf8')
      const forgedCodeValue = JSON.parse(evidenceResponse)
      forgedCodeValue.code = 'C03'
      const forgedCodeResponse = `${JSON.stringify(forgedCodeValue, null, 2)}\n`
      await writeFile(evidencePath, forgedCodeResponse, 'utf8')
      const forgedCodeReceipt = structuredClone(fixture.receipt)
      const forgedCodeHash = sha256(forgedCodeResponse)
      forgedCodeReceipt.runs[0].evidenceReview.anomalyCode = 'C03'
      forgedCodeReceipt.runs[0].artifacts.evidenceResponse.sha256 = forgedCodeHash
      forgedCodeReceipt.runs[0].evidenceReview.artifact.sha256 = forgedCodeHash
      const forgedCodeReceiptPath = join(
        fixture.artifactsRoot,
        'forged-evidence-code-receipt.json',
      )
      await writeFile(
        forgedCodeReceiptPath,
        `${JSON.stringify(forgedCodeReceipt, null, 2)}\n`,
        'utf8',
      )
      const forgedCodeResult = await runReceiptValidator(fixture, forgedCodeReceiptPath)
      assert.equal(forgedCodeResult.status, 1)
      assert.match(forgedCodeResult.stderr, /measured run event/)
      await writeFile(evidencePath, evidenceResponse, 'utf8')

      const forgedEvidenceValue = JSON.parse(evidenceResponse)
      forgedEvidenceValue.evidence = [{ evidenceId: 'forged-evidence' }]
      const forgedEvidenceResponse = `${JSON.stringify(forgedEvidenceValue, null, 2)}\n`
      await writeFile(evidencePath, forgedEvidenceResponse, 'utf8')
      const forgedEvidenceReceipt = structuredClone(fixture.receipt)
      const forgedEvidenceHash = sha256(forgedEvidenceResponse)
      forgedEvidenceReceipt.runs[0].evidenceReview.evidenceIds = ['forged-evidence']
      forgedEvidenceReceipt.runs[0].evidenceReview.evidenceCount = 1
      forgedEvidenceReceipt.runs[0].artifacts.evidenceResponse.sha256 = forgedEvidenceHash
      forgedEvidenceReceipt.runs[0].evidenceReview.artifact.sha256 = forgedEvidenceHash
      const forgedEvidenceReceiptPath = join(
        fixture.artifactsRoot,
        'forged-evidence-receipt.json',
      )
      await writeFile(
        forgedEvidenceReceiptPath,
        `${JSON.stringify(forgedEvidenceReceipt, null, 2)}\n`,
        'utf8',
      )
      const forgedEvidenceResult = await runReceiptValidator(
        fixture,
        forgedEvidenceReceiptPath,
      )
      assert.equal(forgedEvidenceResult.status, 1)
      assert.match(forgedEvidenceResult.stderr, /canonical evidence response artifact/)
      await writeFile(evidencePath, evidenceResponse, 'utf8')

      const diagnosisPath = join(fixture.artifactsRoot, 'run-1/diagnosis.html')
      const diagnosis = await readFile(diagnosisPath, 'utf8')
      const unboundDiagnosis = diagnosis.replace(
        fixture.sourceContract.verifiedScope.displayLabel,
        'unbound-source-scope',
      )
      await writeFile(diagnosisPath, unboundDiagnosis, 'utf8')
      const unboundDiagnosisReceipt = structuredClone(fixture.receipt)
      const unboundDiagnosisHash = sha256(unboundDiagnosis)
      unboundDiagnosisReceipt.runs[0].artifacts.diagnosisReport.sha256 = unboundDiagnosisHash
      unboundDiagnosisReceipt.runs[0].q09.generatedReport.descriptor.contentHash =
        unboundDiagnosisHash
      const unboundDiagnosisReceiptPath = join(
        fixture.artifactsRoot,
        'unbound-diagnosis-receipt.json',
      )
      await writeFile(
        unboundDiagnosisReceiptPath,
        `${JSON.stringify(unboundDiagnosisReceipt, null, 2)}\n`,
      )
      const unboundDiagnosisResult = await runReceiptValidator(
        fixture,
        unboundDiagnosisReceiptPath,
      )
      assert.equal(unboundDiagnosisResult.status, 1)
      assert.match(unboundDiagnosisResult.stderr, /selected event and actual source provenance/)
      await writeFile(diagnosisPath, diagnosis, 'utf8')

      const submissionPath = join(fixture.artifactsRoot, 'run-1/submission.csv')
      const submission = await readFile(submissionPath, 'utf8')
      const invalidSubmission = submission.replace(
        'PCC,BESS,ELZ,PV',
        'BESS01,PCC',
      )
      await writeFile(submissionPath, invalidSubmission, 'utf8')
      const invalidSubmissionReceipt = structuredClone(fixture.receipt)
      invalidSubmissionReceipt.runs[0].artifacts.submissionCsv.sha256 =
        sha256(invalidSubmission)
      const invalidSubmissionReceiptPath = join(
        fixture.artifactsRoot,
        'invalid-submission-receipt.json',
      )
      await writeFile(
        invalidSubmissionReceiptPath,
        `${JSON.stringify(invalidSubmissionReceipt, null, 2)}\n`,
        'utf8',
      )
      const invalidSubmissionResult = await runReceiptValidator(
        fixture,
        invalidSubmissionReceiptPath,
      )
      assert.equal(invalidSubmissionResult.status, 1)
      assert.match(invalidSubmissionResult.stderr, /failed the official checker/)
      await writeFile(submissionPath, submission, 'utf8')

      const driftReceipt = structuredClone(fixture.receipt)
      driftReceipt.runs[0].artifacts.diagnosisReport.sha256 = `sha256:${'0'.repeat(64)}`
      const driftPath = join(fixture.artifactsRoot, 'drift-receipt.json')
      await writeFile(driftPath, `${JSON.stringify(driftReceipt, null, 2)}\n`, 'utf8')
      const driftResult = await runReceiptValidator(fixture, driftPath)
      assert.equal(driftResult.status, 1)
      assert.match(driftResult.stderr, /does not match the artifact bytes/)
    } finally {
      await cleanup(fixture)
    }
  })

  it('rejects each Q09 answer, report, citation, provenance, and safety-text drift', async () => {
    const fixture = await createReceiptFixture('receipt-q09-failure')
    const receiptOnlyCases = [
      {
        name: 'q09-question-drift',
        mutate: (receipt) => { receipt.runs[0].q09.questionId = 'Q08' },
        message: /exact Q09, runId, eventId/,
      },
      {
        name: 'q09-run-drift',
        mutate: (receipt) => { receipt.runs[0].q09.runId = 'different-run' },
        message: /exact Q09, runId, eventId/,
      },
      {
        name: 'q09-event-drift',
        mutate: (receipt) => { receipt.runs[0].q09.eventId = 'different-event' },
        message: /exact Q09, runId, eventId/,
      },
      {
        name: 'q09-control-refusal-drift',
        mutate: (receipt) => { receipt.runs[0].q09.refusedControlClaim = false },
        message: /exact Q09, runId, eventId/,
      },
      {
        name: 'q09-answer-generated-at-drift',
        mutate: (receipt) => { receipt.runs[0].q09.generatedAt = '2026-01-05T12:45:02Z' },
        message: /exact Q09, runId, eventId/,
      },
      {
        name: 'q09-descriptor-drift',
        mutate: (receipt) => {
          receipt.runs[0].q09.generatedReport.descriptor.kind = 'period_summary'
        },
        message: /report descriptor or content hash/,
      },
      {
        name: 'q09-descriptor-generated-at-drift',
        mutate: (receipt) => {
          receipt.runs[0].q09.generatedReport.descriptor.generatedAt =
            '2026-01-05T12:45:02Z'
        },
        message: /report descriptor or content hash/,
      },
      {
        name: 'q09-media-drift',
        mutate: (receipt) => {
          receipt.runs[0].q09.generatedReport.mediaType = 'application/json'
        },
        message: /mediaType must be text\/html/,
      },
      {
        name: 'q09-content-hash-drift',
        mutate: (receipt) => {
          receipt.runs[0].q09.generatedReport.descriptor.contentHash =
            `sha256:${'0'.repeat(64)}`
        },
        message: /report descriptor or content hash/,
      },
      {
        name: 'q09-extra-report-citation',
        mutate: (receipt) => {
          const citation = structuredClone(receipt.runs[0].q09.citations[1])
          citation.citationId = 'citation-Q09-generated_report-extra'
          receipt.runs[0].q09.citations.push(citation)
          receipt.runs[0].q09.sections[1].citationIds.push(citation.citationId)
        },
        message: /exactly one matching report citation/,
      },
      {
        name: 'q09-report-citation-mismatch',
        mutate: (receipt) => {
          receipt.runs[0].q09.citations[1].sourceId = 'different-report'
        },
        message: /exactly one matching report citation/,
      },
      {
        name: 'q09-answer-provenance-drift',
        mutate: (receipt) => {
          receipt.runs[0].q09.provenance.datasetFingerprint = `sha256:${'1'.repeat(64)}`
        },
        message: /LIVE_ANALYSIS renderer provenance/,
      },
      ...[
        ['source', 'contradictory-source'],
        ['ruleVersion', 'contradictory-rule'],
        ['configurationVersion', 'contradictory-configuration'],
        ['modelVersion', 'contradictory-model'],
        ['generatedAt', '2026-01-05T10:41:00Z'],
        ['limitations', ['Contradictory limitation.']],
      ].map(([field, value]) => ({
        name: `q09-answer-${field}-contradiction`,
        mutate: (receipt) => { receipt.runs[0].q09.provenance[field] = value },
        message: /LIVE_ANALYSIS renderer provenance/,
      })),
      {
        name: 'q09-report-provenance-drift',
        mutate: (receipt) => {
          receipt.runs[0].q09.generatedReport.descriptor.provenance.rendererVersion =
            'different-renderer'
        },
        message: /LIVE_ANALYSIS renderer provenance/,
      },
      ...[
        ['source', 'contradictory-source'],
        ['ruleVersion', 'contradictory-rule'],
        ['configurationVersion', 'contradictory-configuration'],
        ['modelVersion', 'contradictory-model'],
        ['generatedAt', '2026-01-05T10:41:00Z'],
        ['limitations', ['Contradictory limitation.']],
      ].map(([field, value]) => ({
        name: `q09-report-${field}-contradiction`,
        mutate: (receipt) => {
          receipt.runs[0].q09.generatedReport.descriptor.provenance[field] = value
        },
        message: /LIVE_ANALYSIS renderer provenance/,
      })),
      ...UNSAFE_Q09_ANSWER_TEXTS.map((text, index) => ({
        name: `q09-answer-unsafe-text-${index + 1}`,
        mutate: (receipt) => { receipt.runs[0].q09.sections[1].text = text },
        message: /unsafe safety or control language/,
      })),
      ...REQUIRED_REVIEW_MIXED_UNSAFE_TEXTS.map((text, index) => ({
        name: `q09-answer-residual-control-authority-${index + 1}`,
        mutate: (receipt) => { receipt.runs[0].q09.sections[1].text = text },
        message: /unsafe safety or control language/,
      })),
      {
        name: 'q09-disclaimer-short-declaration',
        mutate: (receipt) => {
          receipt.runs[0].q09.generatedReport.descriptor.safetyDisclaimer =
            SHORT_SAFETY_DECLARATION
        },
        message: /human-confirmation disclaimer/,
      },
      {
        name: 'q09-disclaimer-direct-control',
        mutate: (receipt) => {
          receipt.runs[0].q09.generatedReport.descriptor.safetyDisclaimer =
            '系统可直接控制设备；所有操作建议均须人工确认。'
        },
        message: /human-confirmation disclaimer/,
      },
      ...INVALID_HUMAN_CONFIRMATION_DECLARATIONS.map((text, index) => ({
        name: `q09-disclaimer-closed-declaration-${index + 1}`,
        mutate: (receipt) => {
          receipt.runs[0].q09.generatedReport.descriptor.safetyDisclaimer = text
        },
        message: /human-confirmation disclaimer/,
      })),
    ]
    try {
      for (const testCase of receiptOnlyCases) {
        const result = await runReceiptMutation(fixture, testCase.name, testCase.mutate)
        assert.equal(result.status, 1, testCase.name)
        assert.match(result.stderr, testCase.message, testCase.name)
      }

      const diagnosisPath = join(fixture.artifactsRoot, 'run-1/diagnosis.html')
      const diagnosis = await readFile(diagnosisPath, 'utf8')
      for (const testCase of [
        {
          name: 'q09-report-provenance-text-drift',
          content: diagnosis.replace(
            fixture.sourceContract.verifiedScope.displayLabel,
            'unverified-scope',
          ),
          message: /selected event and actual source provenance/,
        },
        {
          name: 'q09-report-short-declaration',
          content: diagnosis.replace(
            COMPLETE_SAFETY_STATEMENT,
            SHORT_SAFETY_DECLARATION,
          ),
          message: /human-confirmation safety boundary/,
        },
        {
          name: 'q09-report-safety-text-drift',
          content: diagnosis.replace('所有操作建议均须人工确认', '建议仅供参考'),
          message: /human-confirmation safety boundary/,
        },
        {
          name: 'q09-report-safety-negation',
          content: diagnosis.replace(
            '所有操作建议均须人工确认',
            '并非所有操作建议均须人工确认',
          ),
          message: /human-confirmation safety boundary/,
        },
        {
          name: 'q09-report-direct-control',
          content: diagnosis.replace(
            '所有操作建议均须人工确认',
            '系统可直接控制设备；所有操作建议均须人工确认',
          ),
          message: /human-confirmation safety boundary/,
        },
        ...CONTROL_AUTHORITY_TEXTS.map((text, index) => ({
          name: `q09-report-control-authority-${index + 1}`,
          content: diagnosis.replace('</body>', `<p>${text}</p></body>`),
          message: /human-confirmation safety boundary/,
        })),
        ...REQUIRED_REVIEW_MIXED_UNSAFE_TEXTS.map((text, index) => ({
          name: `q09-report-residual-control-authority-${index + 1}`,
          content: diagnosis.replace('</body>', `<p>${text}</p></body>`),
          message: /human-confirmation safety boundary/,
        })),
      ]) {
        await writeFile(diagnosisPath, testCase.content, 'utf8')
        const result = await runReceiptMutation(fixture, testCase.name, (receipt) => {
          const contentHash = sha256(testCase.content)
          receipt.runs[0].artifacts.diagnosisReport.sha256 = contentHash
          receipt.runs[0].q09.generatedReport.descriptor.contentHash = contentHash
        })
        assert.equal(result.status, 1, testCase.name)
        assert.match(result.stderr, testCase.message, testCase.name)
        await writeFile(diagnosisPath, diagnosis, 'utf8')
      }
    } finally {
      await cleanup(fixture)
    }
  })

  it('rejects contradictory runtime provenance and review receipt identities', async () => {
    const fixture = await createReceiptFixture('receipt-identity-failure')
    const cases = [
      ...[
        ['source', 'contradictory-source'],
        ['ruleVersion', 'contradictory-rule'],
        ['configurationVersion', 'contradictory-configuration'],
        ['generatedAt', '2026-01-05T10:41:00Z'],
        ['limitations', ['Contradictory limitation.']],
      ].map(([field, value]) => ({
        name: `analysis-${field}-contradiction`,
        mutate: (receipt) => { receipt.runs[0].analysisRun.provenance[field] = value },
        message: field === 'generatedAt'
          ? /completed Analytics lifecycle identity/
          : /import and analysis identities do not match/,
      })),
      {
        name: 'evidence-wrong-event',
        mutate: (receipt) => { receipt.runs[0].evidenceReview.eventId = 'wrong-event' },
        message: /non-empty evidence to the measured run event/,
      },
      {
        name: 'evidence-wrong-run',
        mutate: (receipt) => { receipt.runs[0].evidenceReview.runId = 'wrong-run' },
        message: /non-empty evidence to the measured run event/,
      },
      {
        name: 'evidence-empty',
        mutate: (receipt) => { receipt.runs[0].evidenceReview.evidenceIds = [] },
        message: /non-empty evidence to the measured run event/,
      },
      {
        name: 'evidence-forged-nonempty',
        mutate: (receipt) => {
          receipt.runs[0].evidenceReview.evidenceIds = ['forged-evidence']
        },
        message: /canonical evidence response artifact/,
      },
      {
        name: 'evidence-count-drift',
        mutate: (receipt) => { receipt.runs[0].evidenceReview.evidenceCount = 2 },
        message: /non-empty evidence to the measured run event/,
      },
      {
        name: 'evidence-code-drift',
        mutate: (receipt) => { receipt.runs[0].evidenceReview.anomalyCode = 'C03' },
        message: /non-empty evidence to the measured run event/,
      },
      {
        name: 'evidence-artifact-path-drift',
        mutate: (receipt) => {
          receipt.runs[0].evidenceReview.artifact.relativePath =
            receipt.runs[0].artifacts.reviewAudit.relativePath
        },
        message: /non-empty evidence to the measured run event/,
      },
      {
        name: 'evidence-artifact-hash-drift',
        mutate: (receipt) => {
          receipt.runs[0].evidenceReview.artifact.sha256 = `sha256:${'0'.repeat(64)}`
        },
        message: /non-empty evidence to the measured run event/,
      },
      {
        name: 'analysis-not-completed',
        mutate: (receipt) => { receipt.runs[0].analysisRun.status = 'running' },
        message: /completed Analytics lifecycle identity/,
      },
      {
        name: 'analysis-completion-before-start',
        mutate: (receipt) => {
          receipt.runs[0].analysisRun.completedAt = '2026-01-05T10:39:59Z'
        },
        message: /completed Analytics lifecycle identity/,
      },
      {
        name: 'review-replay',
        mutate: (receipt) => { receipt.runs[0].humanReview.replayed = true },
        message: /exact non-replayed confirmation receipt identity/,
      },
      {
        name: 'review-wrong-run',
        mutate: (receipt) => { receipt.runs[0].humanReview.runId = 'wrong-run' },
        message: /exact non-replayed confirmation receipt identity/,
      },
      {
        name: 'review-wrong-event',
        mutate: (receipt) => { receipt.runs[0].humanReview.eventId = 'wrong-event' },
        message: /exact non-replayed confirmation receipt identity/,
      },
      {
        name: 'review-wrong-request',
        mutate: (receipt) => { receipt.runs[0].humanReview.requestId = 'wrong-request' },
        message: /review audit.*confirmed revision 1/,
      },
      {
        name: 'review-wrong-action',
        mutate: (receipt) => { receipt.runs[0].humanReview.action = 'reject' },
        message: /exact non-replayed confirmation receipt identity/,
      },
      {
        name: 'review-wrong-revision',
        mutate: (receipt) => { receipt.runs[0].humanReview.revision = 2 },
        message: /exact non-replayed confirmation receipt identity/,
      },
      {
        name: 'review-wrong-actor',
        mutate: (receipt) => {
          receipt.runs[0].humanReview.actor.displayName = 'different-operator'
        },
        message: /review audit.*confirmed revision 1/,
      },
    ]
    try {
      for (const testCase of cases) {
        const result = await runReceiptMutation(fixture, testCase.name, testCase.mutate)
        assert.equal(result.status, 1, testCase.name)
        assert.match(result.stderr, testCase.message, testCase.name)
      }
    } finally {
      await cleanup(fixture)
    }
  })

  it('rejects non-canonical, reversed, and manifest-mismatched runtime ranges', async () => {
    const fixture = await createReceiptFixture('receipt-range-failure')
    const cases = [
      {
        name: 'import-noncanonical-range',
        mutate: (receipt) => {
          receipt.runs[0].importedDataset.timeRange.startTime =
            '2026-01-05T09:30:00+00:00'
        },
        message: /canonical ISO UTC calendar timestamp/,
      },
      {
        name: 'import-reversed-range',
        mutate: (receipt) => {
          receipt.runs[0].importedDataset.timeRange.startTime =
            '2026-01-05T10:41:00Z'
        },
        message: /startTime must not follow endTime/,
      },
      {
        name: 'import-manifest-range-drift',
        mutate: (receipt) => {
          receipt.runs[0].importedDataset.timeRange.startTime =
            '2026-01-05T09:31:00Z'
        },
        message: /manifest observed and verified source ranges/,
      },
      {
        name: 'analysis-manifest-range-drift',
        mutate: (receipt) => {
          receipt.runs[0].analysisRun.timeRange.endTime =
            '2026-01-05T10:39:00Z'
        },
        message: /manifest observed and verified source ranges/,
      },
    ]
    try {
      for (const testCase of cases) {
        const result = await runReceiptMutation(fixture, testCase.name, testCase.mutate)
        assert.equal(result.status, 1, testCase.name)
        assert.match(result.stderr, testCase.message, testCase.name)
      }
    } finally {
      await cleanup(fixture)
    }
  })
})
