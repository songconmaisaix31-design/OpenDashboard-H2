export type {
  DemoAction,
  DemoApproval,
  DemoAuditEntry,
  DemoAuditEvent,
  DemoEvidence,
  DemoEvidenceKind,
  DemoEvidenceReport,
  DemoIncident,
  DemoMode,
  DemoPhase,
  DemoProviderHealth,
  DemoSnapshot,
  DemoTarget,
  DemoVerification,
  DemoWorkflow,
  FixtureProvenance,
  LiveProvenance,
  Provenance,
} from './demo.ts'

export type {
  ApproveActionInput,
  CollectEvidenceInput,
  DemoCommandContext,
  DemoCommandError,
  DemoCommandErrorCode,
  DemoCommandName,
  DemoCommandResult,
  DemoDataSource,
  ExportEvidenceInput,
  RequestRestartInput,
  ResetDemoInput,
  VerifyRecoveryInput,
} from './data-source.ts'

export type {
  Disposable,
  PluginActivation,
  PluginCapability,
  PluginContext,
  PluginDefinition,
  PluginManifestV1,
  PluginManifestValidationResult,
  PluginProvenance,
  PluginTier,
  ServiceToken,
} from './plugin.ts'

export { CONTRACT_EXAMPLE_SNAPSHOT } from './contract-example.ts'
export {
  assertPluginManifest,
  createServiceToken,
  PLUGIN_CAPABILITIES,
  validatePluginManifest,
} from './plugin.ts'
