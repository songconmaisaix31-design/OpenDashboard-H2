/** Shared, provider-neutral data model consumed by the demo engine and UI. */

export type DemoMode = 'fixture' | 'live'

export type DemoPhase =
  | 'incident_open'
  | 'evidence_collected'
  | 'approval_pending'
  | 'action_confirmed'
  | 'recovered'

interface ProvenanceBase {
  readonly source: string
  readonly observedAt: string
  readonly limitations: readonly string[]
}

export interface FixtureProvenance extends ProvenanceBase {
  readonly mode: 'fixture'
  readonly mocked: true
}

export interface LiveProvenance extends ProvenanceBase {
  readonly mode: 'live'
  readonly mocked: false
}

/** The discriminant prevents fixture data from being represented as live data. */
export type Provenance = FixtureProvenance | LiveProvenance

export interface DemoTarget {
  readonly id: string
  readonly name: string
  readonly kind: 'application'
  readonly health: 'degraded' | 'healthy'
  readonly versionControl: 'git' | 'none' | 'unknown'
  readonly provenance: Provenance
}

export interface DemoIncident {
  readonly id: string
  readonly targetId: string
  readonly ruleId: 'api-error-burst'
  readonly status: 'open' | 'investigating' | 'recovered'
  readonly severity: 'high'
  readonly fingerprint: string
  readonly evidenceIds: readonly string[]
  readonly provenance: Provenance
}

export type DemoEvidenceKind = 'http' | 'trace' | 'log' | 'resource'

export interface DemoEvidence {
  readonly id: string
  readonly kind: DemoEvidenceKind
  readonly summary: string
  readonly redacted: true
  readonly provenance: Provenance
}

export interface DemoWorkflow {
  readonly id: 'api-500-triage'
  readonly access: 'read-only'
  readonly status: 'ready' | 'completed'
  readonly summary: string | null
  readonly evidenceIds: readonly string[]
  readonly provenance: Provenance
}

interface DemoApprovalBase {
  readonly id: string
  readonly targetId: string
  readonly action: 'simulated-managed-runtime-restart'
  readonly requestedAt: string
  readonly provenance: FixtureProvenance
}

export type DemoApproval =
  | (DemoApprovalBase & {
      readonly status: 'pending'
      readonly grantedAt: null
    })
  | (DemoApprovalBase & {
      readonly status: 'granted'
      readonly grantedAt: string
    })

export interface DemoAction {
  readonly id: string
  readonly approvalId: string
  readonly targetId: string
  readonly action: 'managed-runtime-restart'
  readonly executionMode: 'simulated'
  readonly status: 'confirmed'
  readonly confirmedAt: string
  readonly provenance: FixtureProvenance
}

export interface DemoVerification {
  readonly id: string
  readonly targetId: string
  readonly status: 'passed'
  readonly verifiedAt: string
  readonly provenance: FixtureProvenance
}

export type DemoAuditEvent =
  | 'evidence.collected'
  | 'approval.requested'
  | 'approval.granted'
  | 'action.confirmed'
  | 'recovery.verified'

export interface DemoAuditEntry {
  readonly id: string
  readonly event: DemoAuditEvent
  readonly occurredAt: string
  readonly actor: 'demo-user' | 'fixture-provider'
  readonly mocked: true
  readonly provenance: FixtureProvenance
}

export interface DemoProviderHealth {
  readonly id: string
  readonly status: 'mocked' | 'degraded' | 'healthy' | 'planned'
  readonly provenance: Provenance
}

/** Complete UI-readable state. Consumers never need provider-specific fields. */
export interface DemoSnapshot {
  readonly schemaVersion: 1
  readonly runId: string
  readonly phase: DemoPhase
  readonly target: DemoTarget
  readonly incident: DemoIncident
  readonly workflow: DemoWorkflow
  readonly providerHealth: readonly DemoProviderHealth[]
  readonly evidence: readonly DemoEvidence[]
  readonly approval: DemoApproval | null
  readonly action: DemoAction | null
  readonly verification: DemoVerification | null
  readonly audit: readonly DemoAuditEntry[]
}

export interface DemoEvidenceReport {
  readonly schemaVersion: 1
  readonly runId: string
  readonly mode: 'fixture'
  readonly mocked: true
  readonly generatedAt: string
  readonly before: {
    readonly targetHealth: 'degraded'
    readonly incidentStatus: 'open'
  }
  readonly after: {
    readonly targetHealth: 'healthy'
    readonly incidentStatus: 'recovered'
  } | null
  readonly evidence: readonly DemoEvidence[]
  readonly approval: DemoApproval | null
  readonly action: DemoAction | null
  readonly verification: DemoVerification | null
  readonly audit: readonly DemoAuditEntry[]
  readonly unverifiedClaims: readonly string[]
}
