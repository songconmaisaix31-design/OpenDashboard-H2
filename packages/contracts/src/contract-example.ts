import type {
  DemoAuditEntry,
  DemoAuditEvent,
  DemoEvidence,
  DemoProviderHealth,
  DemoSnapshot,
  FixtureProvenance,
} from './demo.ts'

const observedAt = '2026-08-16T10:20:00.000Z'
const limitations = ['仅用于契约示例；未连接实时提供器。'] as const

const fixtureProvenance = (source: string): FixtureProvenance => ({
  source,
  mode: 'fixture',
  mocked: true,
  observedAt,
  limitations,
})

const evidence: readonly DemoEvidence[] = [
  {
    id: 'evidence-http-001',
    kind: 'http',
    summary: 'POST /orders 返回了一条已脱敏的 HTTP 500 响应。',
    redacted: true,
    provenance: fixtureProvenance('cordis'),
  },
  {
    id: 'evidence-trace-001',
    kind: 'trace',
    summary: '固定样例追踪把请求与 order-api 故障关联起来。',
    redacted: true,
    provenance: fixtureProvenance('fastapi-radar'),
  },
  {
    id: 'evidence-log-001',
    kind: 'log',
    summary: '一条脱敏样例日志记录了临时运行时故障锁。',
    redacted: true,
    provenance: fixtureProvenance('fastapi-radar'),
  },
  {
    id: 'evidence-resource-001',
    kind: 'resource',
    summary: '固定样例资源使用量保持在演示阈值内。',
    redacted: true,
    provenance: fixtureProvenance('agent-usage-manager'),
  },
]

const providerHealth: readonly DemoProviderHealth[] = [
  'cordis',
  'localops',
  'agent-usage-manager',
  'fastapi-radar',
  'hardware',
  'orca',
  'agentteams',
].map((id) => ({
  id,
  status: 'mocked',
  provenance: fixtureProvenance(id),
}))

type AuditRow = readonly [
  id: string,
  event: DemoAuditEvent,
  occurredAt: string,
  actor: DemoAuditEntry['actor'],
]

const auditRows: readonly AuditRow[] = [
  ['audit-001', 'evidence.collected', '2026-08-16T10:20:01.000Z', 'fixture-provider'],
  ['audit-002', 'approval.requested', '2026-08-16T10:20:02.000Z', 'demo-user'],
  ['audit-003', 'approval.granted', '2026-08-16T10:20:03.000Z', 'demo-user'],
  ['audit-004', 'action.confirmed', '2026-08-16T10:20:04.000Z', 'fixture-provider'],
  ['audit-005', 'recovery.verified', '2026-08-16T10:20:05.000Z', 'fixture-provider'],
]

const audit: readonly DemoAuditEntry[] = auditRows.map(([id, event, occurredAt, actor]) => ({
  id,
  event,
  occurredAt,
  actor,
  mocked: true,
  provenance: fixtureProvenance('open-dashboard-fixture'),
}))

/**
 * Read-only recovered-state example for contract compilation and isolated UI
 * tests. This is not the T1 runtime fixture or a state-machine implementation.
 */
export const CONTRACT_EXAMPLE_SNAPSHOT: DemoSnapshot = {
  schemaVersion: 1,
  runId: 'run-demo-001',
  phase: 'recovered',
  target: {
    id: 'target-order-api',
    name: 'order-api',
    kind: 'application',
    health: 'healthy',
    versionControl: 'git',
    provenance: fixtureProvenance('cordis'),
  },
  incident: {
    id: 'incident-api-error-burst-001',
    targetId: 'target-order-api',
    ruleId: 'api-error-burst',
    status: 'recovered',
    severity: 'high',
    fingerprint: 'fixture-api-error-burst-v1',
    evidenceIds: evidence.map(({ id }) => id),
    provenance: fixtureProvenance('fastapi-radar'),
  },
  workflow: {
    id: 'api-500-triage',
    access: 'read-only',
    status: 'completed',
    summary: '固定样例证据定位到一个临时运行时故障锁。',
    evidenceIds: evidence.map(({ id }) => id),
    provenance: fixtureProvenance('agentteams'),
  },
  providerHealth,
  evidence,
  approval: {
    id: 'approval-restart-001',
    targetId: 'target-order-api',
    action: 'simulated-managed-runtime-restart',
    status: 'granted',
    requestedAt: '2026-08-16T10:20:02.000Z',
    grantedAt: '2026-08-16T10:20:03.000Z',
    provenance: fixtureProvenance('localops'),
  },
  action: {
    id: 'action-restart-001',
    approvalId: 'approval-restart-001',
    targetId: 'target-order-api',
    action: 'managed-runtime-restart',
    executionMode: 'simulated',
    status: 'confirmed',
    confirmedAt: '2026-08-16T10:20:04.000Z',
    provenance: fixtureProvenance('localops'),
  },
  verification: {
    id: 'verification-recovery-001',
    targetId: 'target-order-api',
    status: 'passed',
    verifiedAt: '2026-08-16T10:20:05.000Z',
    provenance: fixtureProvenance('open-dashboard-fixture'),
  },
  audit,
}
