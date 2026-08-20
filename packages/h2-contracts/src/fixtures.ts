import type { H2AnalysisRun } from './analysis-run.ts'
import type { H2AnomalyEvent } from './anomaly.ts'
import type { H2AssistantAnswer } from './assistant.ts'
import type { H2DatasetManifest } from './dataset.ts'
import type { H2Provenance } from './provenance.ts'
import type { H2DataQualityReport } from './quality.ts'
import type { H2ReportDescriptor } from './report.ts'

const fixtureGeneratedAt = '2026-01-05T10:45:00Z'

export const H2_FIXTURE_PROVENANCE = {
  mode: 'FIXTURE',
  source: 'sanitized-golden-fixture',
  generatedAt: fixtureGeneratedAt,
  datasetFingerprint:
    'sha256:799ff8549663152c784ad8d687d0df7108e295cf3d96311b122ad146c624f9ca',
  ruleVersion: 'h2-rules-v1',
  configurationVersion: 'official-constraints-v1',
  limitations: [
    'Synthetic, sanitized C03/C04 contract fixture only.',
    'Not an official competition dataset or score artifact.',
  ],
} as const satisfies H2Provenance

export const H2_FIXTURE_DATASET = {
  schemaVersion: 1,
  datasetId: 'fixture-h2-sentinel-golden',
  name: 'H2 Sentinel sanitized golden fixture',
  mode: 'FIXTURE',
  sourceFilename: 'tiny-valid-timeseries.csv',
  fingerprint:
    'sha256:799ff8549663152c784ad8d687d0df7108e295cf3d96311b122ad146c624f9ca',
  rowCount: 22,
  timeRange: {
    startTime: '2026-01-05T10:20:00Z',
    endTime: '2026-01-05T10:41:00Z',
  },
  samplingIntervalMinutes: 1,
  fields: [
    {
      name: 'timestamp',
      displayNameZh: '时间戳',
      role: 'timestamp',
      required: true,
    },
    {
      name: 'bess_power_kw',
      displayNameZh: '储能功率',
      role: 'measurement',
      required: true,
      unit: 'kW',
    },
    {
      name: 'pcc_power_kw',
      displayNameZh: '并网点功率',
      role: 'measurement',
      required: true,
      unit: 'kW',
    },
    {
      name: 'pcc_export_limit_kw',
      displayNameZh: '并网点送出上限',
      role: 'constraint',
      required: true,
      unit: 'kW',
    },
    {
      name: 'pv_actual_kw',
      displayNameZh: '光伏实际功率',
      role: 'measurement',
      required: true,
      unit: 'kW',
    },
    {
      name: 'total_electrolyzer_power_kw',
      displayNameZh: '电解槽总功率',
      role: 'measurement',
      required: true,
      unit: 'kW',
    },
    {
      name: 'auxiliary_load_kw',
      displayNameZh: '辅助负荷',
      role: 'measurement',
      required: true,
      unit: 'kW',
    },
    {
      name: 'bess_soc_percent',
      displayNameZh: '储能荷电状态',
      role: 'measurement',
      required: true,
      unit: 'percent',
    },
    {
      name: 'pcc_import_limit_kw',
      displayNameZh: '并网点受电上限',
      role: 'constraint',
      required: true,
      unit: 'kW',
    },
    {
      name: 'bess_dispatch_command_kw',
      displayNameZh: '储能调度指令',
      role: 'measurement',
      required: true,
      unit: 'kW',
    },
  ],
  provenance: H2_FIXTURE_PROVENANCE,
} as const satisfies H2DatasetManifest

export const H2_FIXTURE_QUALITY_REPORT = {
  schemaVersion: 1,
  reportId: 'quality-fixture-h2-sentinel-golden',
  datasetId: H2_FIXTURE_DATASET.datasetId,
  status: 'passed',
  generatedAt: fixtureGeneratedAt,
  rowCount: H2_FIXTURE_DATASET.rowCount,
  timeRange: H2_FIXTURE_DATASET.timeRange,
  checks: [
    {
      checkId: 'quality-field-mapping',
      code: 'field_mapping',
      status: 'passed',
      severity: 'info',
      affectedFields: ['timestamp', 'bess_power_kw', 'pcc_power_kw'],
      message: 'Required fixture fields are present.',
      evidenceIds: [],
      provenance: H2_FIXTURE_PROVENANCE,
    },
  ],
  warnings: [],
  blockingReasons: [],
  provenance: H2_FIXTURE_PROVENANCE,
} as const satisfies H2DataQualityReport

export const H2_GOLDEN_C03_EVENT = {
  schemaVersion: 1,
  eventId: 'C03-20260105-001',
  code: 'C03',
  subtype: 'BESS_DIRECTION_REVERSED',
  title: 'BESS power direction conflicts with the dispatch command',
  startTime: '2026-01-05T10:20:00Z',
  endTime: '2026-01-05T10:41:00Z',
  firstDetectionTime: '2026-01-05T10:24:00Z',
  severity: 'high',
  confidence: 0.94,
  primaryControlObject: {
    type: 'BESS_CONTROL',
    id: 'bess-control',
    displayName: 'BESS control interface',
  },
  affectedEquipment: [
    {
      kind: 'BESS',
      id: 'bess-01',
      displayName: 'Battery energy storage system',
    },
    {
      kind: 'PCC',
      id: 'pcc-01',
      displayName: 'Point of common coupling',
    },
  ],
  evidence: [
    {
      schemaVersion: 1,
      evidenceId: 'C03-EV-001',
      kind: 'measurement',
      claimKind: 'fact',
      timestamp: '2026-01-05T10:24:00Z',
      variable: 'bess_dispatch_command_kw',
      actualValue: -240,
      referenceValue: 'charge',
      unit: 'kW',
      comparator: '=',
      source: 'fixture-timeseries',
      conclusion: 'The EMS command requested BESS charging.',
      provenance: H2_FIXTURE_PROVENANCE,
    },
    {
      schemaVersion: 1,
      evidenceId: 'C03-EV-002',
      kind: 'measurement',
      claimKind: 'fact',
      timestamp: '2026-01-05T10:24:00Z',
      variable: 'bess_power_kw',
      actualValue: 230,
      referenceValue: 'charge',
      unit: 'kW',
      comparator: '!=',
      source: 'fixture-timeseries',
      conclusion:
        'Positive BESS power indicates discharge, opposite to the charge command.',
      provenance: H2_FIXTURE_PROVENANCE,
    },
    {
      schemaVersion: 1,
      evidenceId: 'C03-EV-003',
      kind: 'derived_metric',
      claimKind: 'calculation',
      interval: {
        startTime: '2026-01-05T10:20:00Z',
        endTime: '2026-01-05T10:41:00Z',
      },
      variable: 'abnormal_grid_exchange_energy_kwh',
      actualValue: 112.4,
      referenceValue: 0,
      unit: 'kWh',
      comparator: '>',
      source: 'impact-c03-v1',
      conclusion:
        'The reversed BESS response is associated with abnormal grid exchange.',
      provenance: H2_FIXTURE_PROVENANCE,
    },
  ],
  impact: {
    metric: 'abnormal_grid_exchange_energy_kwh',
    value: 112.4,
    unit: 'kWh',
    formulaVersion: 'impact-c03-v1',
    assumptions: [
      'Minute-level samples are integrated as average power over one minute.',
      'PCC power uses positive export and negative import convention.',
    ],
    evidenceIds: ['C03-EV-003'],
    provenance: H2_FIXTURE_PROVENANCE,
  },
  safetyChecks: [
    {
      checkId: 'C03-SAFE-001',
      title: 'BESS sign convention confirmed',
      status: 'passed',
      message: 'Positive BESS power is interpreted as discharge.',
      constraintId: 'sign-convention-bess-v1',
      evidenceIds: ['C03-EV-001', 'C03-EV-002'],
      provenance: H2_FIXTURE_PROVENANCE,
    },
    {
      checkId: 'C03-SAFE-002',
      title: 'SOC remains inside configured range',
      status: 'passed',
      message: 'Fixture SOC remains between 20% and 90%.',
      constraintId: 'bess-soc-range-v1',
      evidenceIds: ['C03-EV-002'],
      provenance: H2_FIXTURE_PROVENANCE,
    },
  ],
  recommendations: [
    {
      recommendationId: 'C03-REC-001',
      actionKind: 'check',
      summary:
        'Verify BESS command and feedback sign mapping before changing dispatch.',
      rationale:
        'The contract separates a likely interface mapping issue from a proven equipment fault.',
      safetyCheckIds: ['C03-SAFE-001', 'C03-SAFE-002'],
      evidenceIds: ['C03-EV-001', 'C03-EV-002'],
      requiresHumanConfirmation: true,
      provenance: H2_FIXTURE_PROVENANCE,
    },
  ],
  rootCause:
    'Likely BESS command/feedback sign mapping mismatch; this is an inference from fixture evidence, not a direct equipment-control finding.',
  rootCauseKind: 'inference',
  reviewState: 'open',
  provenance: H2_FIXTURE_PROVENANCE,
  requiresHumanConfirmation: true,
} as const satisfies H2AnomalyEvent

export const H2_GOLDEN_C04_EVENT = {
  schemaVersion: 1,
  eventId: 'C04-20260105-001',
  code: 'C04',
  subtype: 'EXPORT_POWER_LIMIT_NOT_TRACKED',
  title: 'PCC export power exceeds the active boundary',
  startTime: '2026-01-05T10:32:00Z',
  endTime: '2026-01-05T10:39:00Z',
  firstDetectionTime: '2026-01-05T10:34:00Z',
  severity: 'high',
  confidence: 0.91,
  primaryControlObject: {
    type: 'PCC_BOUNDARY_CONTROL',
    id: 'pcc-boundary-control',
    displayName: 'PCC boundary controller',
  },
  affectedEquipment: [
    {
      kind: 'PCC',
      id: 'pcc-01',
      displayName: 'Point of common coupling',
    },
    {
      kind: 'GRID',
      id: 'grid-connection',
      displayName: 'Grid interconnection',
    },
  ],
  evidence: [
    {
      schemaVersion: 1,
      evidenceId: 'C04-EV-001',
      kind: 'measurement',
      claimKind: 'fact',
      timestamp: '2026-01-05T10:34:00Z',
      variable: 'pcc_power_kw',
      actualValue: 720,
      referenceValue: 500,
      unit: 'kW',
      comparator: '>',
      source: 'fixture-timeseries',
      conclusion: 'PCC export power exceeds the active export limit.',
      provenance: H2_FIXTURE_PROVENANCE,
    },
    {
      schemaVersion: 1,
      evidenceId: 'C04-EV-002',
      kind: 'constraint',
      claimKind: 'fact',
      timestamp: '2026-01-05T10:34:00Z',
      variable: 'pcc_export_limit_kw',
      actualValue: 500,
      referenceValue: 500,
      unit: 'kW',
      comparator: '=',
      source: 'fixture-constraints',
      conclusion: 'The configured export boundary is active for this interval.',
      provenance: H2_FIXTURE_PROVENANCE,
    },
    {
      schemaVersion: 1,
      evidenceId: 'C04-EV-003',
      kind: 'derived_metric',
      claimKind: 'calculation',
      interval: {
        startTime: '2026-01-05T10:32:00Z',
        endTime: '2026-01-05T10:39:00Z',
      },
      variable: 'pcc_power_limit_violation_energy_kwh',
      actualValue: 29.333333333333332,
      referenceValue: 0,
      unit: 'kWh',
      comparator: '>',
      source: 'impact-c04-v1',
      conclusion:
        'Export-limit violation energy is integrated over the highlighted interval.',
      provenance: H2_FIXTURE_PROVENANCE,
    },
  ],
  impact: {
    metric: 'pcc_power_limit_violation_energy_kwh',
    value: 29.333333333333332,
    unit: 'kWh',
    formulaVersion: 'impact-c04-v1',
    assumptions: [
      'Only positive export excess contributes to this fixture event.',
      'Minute-level samples are integrated as average power over one minute.',
    ],
    evidenceIds: ['C04-EV-001', 'C04-EV-002', 'C04-EV-003'],
    provenance: H2_FIXTURE_PROVENANCE,
  },
  safetyChecks: [
    {
      checkId: 'C04-SAFE-001',
      title: 'PCC sign convention confirmed',
      status: 'passed',
      message: 'Positive PCC power is interpreted as export to the grid.',
      constraintId: 'sign-convention-pcc-v1',
      evidenceIds: ['C04-EV-001'],
      provenance: H2_FIXTURE_PROVENANCE,
    },
    {
      checkId: 'C04-SAFE-002',
      title: 'Recommendation is advisory only',
      status: 'passed',
      message: 'The fixture produces checks, not automatic setpoint changes.',
      constraintId: 'human-confirmation-v1',
      evidenceIds: ['C04-EV-001', 'C04-EV-002'],
      provenance: H2_FIXTURE_PROVENANCE,
    },
  ],
  recommendations: [
    {
      recommendationId: 'C04-REC-001',
      actionKind: 'check',
      summary:
        'Inspect PCC boundary synchronization and meter feedback before any dispatch change.',
      rationale:
        'The event proves a boundary-tracking violation but does not authorize automatic control.',
      safetyCheckIds: ['C04-SAFE-001', 'C04-SAFE-002'],
      evidenceIds: ['C04-EV-001', 'C04-EV-002'],
      requiresHumanConfirmation: true,
      provenance: H2_FIXTURE_PROVENANCE,
    },
  ],
  rootCause:
    'Likely PCC boundary synchronization or tracking issue; the fixture supports a compliance-oriented check, not a direct control action.',
  rootCauseKind: 'inference',
  reviewState: 'open',
  provenance: H2_FIXTURE_PROVENANCE,
  requiresHumanConfirmation: true,
} as const satisfies H2AnomalyEvent

export const H2_FIXTURE_ANALYSIS_RUN = {
  schemaVersion: 1,
  runId: 'run-fixture-h2-sentinel-golden',
  dataset: H2_FIXTURE_DATASET,
  quality: H2_FIXTURE_QUALITY_REPORT,
  status: 'completed',
  startedAt: '2026-01-05T10:45:00Z',
  completedAt: '2026-01-05T10:45:01Z',
  eventCountsByCode: {
    C01: 0,
    C02: 0,
    C03: 1,
    C04: 1,
    C05: 0,
    C06: 0,
    C07: 0,
  },
  eventCountsBySeverity: {
    low: 0,
    medium: 0,
    high: 2,
    critical: 0,
  },
  events: [H2_GOLDEN_C03_EVENT, H2_GOLDEN_C04_EVENT],
  warnings: [],
  provenance: H2_FIXTURE_PROVENANCE,
} as const satisfies H2AnalysisRun

export const H2_FIXTURE_ASSISTANT_ANSWER = {
  schemaVersion: 1,
  answerId: 'answer-H2Q03-C03-20260105-001',
  runId: H2_FIXTURE_ANALYSIS_RUN.runId,
  questionId: 'H2Q03',
  mode: 'DETERMINISTIC_TEMPLATE',
  generatedAt: fixtureGeneratedAt,
  eventId: H2_GOLDEN_C03_EVENT.eventId,
  sections: [
    {
      sectionId: 'summary',
      claimKind: 'calculation',
      text:
        'The fixture links the reversed BESS response to abnormal PCC exchange through structured evidence and the C03 impact formula.',
      citationIds: ['citation-C03-EV-001', 'citation-C03-EV-003'],
    },
  ],
  citations: [
    {
      citationId: 'citation-C03-EV-001',
      claimKind: 'fact',
      sourceType: 'evidence',
      sourceId: 'C03-EV-001',
      eventId: H2_GOLDEN_C03_EVENT.eventId,
    },
    {
      citationId: 'citation-C03-EV-003',
      claimKind: 'calculation',
      sourceType: 'evidence',
      sourceId: 'C03-EV-003',
      eventId: H2_GOLDEN_C03_EVENT.eventId,
    },
  ],
  refusedControlClaim: true,
  provenance: H2_FIXTURE_PROVENANCE,
} as const satisfies H2AssistantAnswer

export const H2_FIXTURE_REPORT_DESCRIPTOR = {
  schemaVersion: 1,
  reportId: 'report-C03-20260105-001',
  runId: H2_FIXTURE_ANALYSIS_RUN.runId,
  kind: 'single_event_diagnosis',
  format: 'html',
  status: 'ready',
  generatedAt: fixtureGeneratedAt,
  filename: 'C03-20260105-001-diagnosis.html',
  contentHash:
    'sha256:2222222222222222222222222222222222222222222222222222222222222222',
  eventId: H2_GOLDEN_C03_EVENT.eventId,
  warnings: [],
  safetyDisclaimer:
    'H2 Sentinel recommendations are advisory and require human confirmation.',
  provenance: H2_FIXTURE_PROVENANCE,
} as const satisfies H2ReportDescriptor
