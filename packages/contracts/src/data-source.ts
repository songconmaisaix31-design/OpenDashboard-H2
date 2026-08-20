import type { DemoEvidenceReport, DemoPhase, DemoSnapshot } from './demo.ts'

export type DemoCommandName =
  | 'collectEvidence'
  | 'requestRestart'
  | 'approveAction'
  | 'verifyRecovery'
  | 'resetDemo'
  | 'exportEvidence'

export interface DemoCommandContext {
  readonly runId: string
  /**
   * Scoped to the run. Replaying the same command and input returns the first
   * value with `replayed: true`; reusing the key for different input returns
   * `idempotency_conflict`.
   */
  readonly idempotencyKey: string
}

export interface CollectEvidenceInput extends DemoCommandContext {
  readonly incidentId: string
}

export interface RequestRestartInput extends DemoCommandContext {
  readonly targetId: string
}

export interface ApproveActionInput extends DemoCommandContext {
  readonly approvalId: string
}

export interface VerifyRecoveryInput extends DemoCommandContext {
  readonly targetId: string
}

export type ResetDemoInput = DemoCommandContext

export type ExportEvidenceInput = DemoCommandContext

export type DemoCommandErrorCode =
  | 'invalid_demo_transition'
  | 'invalid_demo_reference'
  | 'idempotency_conflict'

export interface DemoCommandError {
  readonly code: DemoCommandErrorCode
  readonly command: DemoCommandName
  readonly phase: DemoPhase
  readonly message: string
}

export type DemoCommandResult<T> =
  | {
      readonly ok: true
      readonly value: T
      readonly replayed: boolean
    }
  | {
      readonly ok: false
      readonly snapshot: DemoSnapshot
      readonly error: DemoCommandError
    }

/**
 * The only presentation-to-engine boundary. T1 supplies the fixture-backed
 * implementation; T2 consumes this port without importing provider data.
 */
export interface DemoDataSource {
  loadInitialSnapshot(): Promise<DemoSnapshot>
  collectEvidence(
    input: CollectEvidenceInput,
  ): Promise<DemoCommandResult<DemoSnapshot>>
  requestRestart(
    input: RequestRestartInput,
  ): Promise<DemoCommandResult<DemoSnapshot>>
  approveAction(
    input: ApproveActionInput,
  ): Promise<DemoCommandResult<DemoSnapshot>>
  verifyRecovery(
    input: VerifyRecoveryInput,
  ): Promise<DemoCommandResult<DemoSnapshot>>
  resetDemo(input: ResetDemoInput): Promise<DemoCommandResult<DemoSnapshot>>
  exportEvidence(
    input: ExportEvidenceInput,
  ): Promise<DemoCommandResult<DemoEvidenceReport>>
}
