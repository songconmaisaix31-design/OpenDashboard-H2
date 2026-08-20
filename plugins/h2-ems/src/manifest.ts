import type { PluginManifestV1 } from '../../../packages/contracts/src/index.ts'

/** Audit metadata for the reviewed in-process H2 plugin; not a sandbox. */
export const H2_EMS_MANIFEST = {
  schemaVersion: 1,
  apiVersion: 1,
  id: 'opendashboard.h2-ems',
  version: '1.0.0',
  displayName: 'OpenDashboard H2 EMS',
  tier: 1,
  activation: 'startup',
  requires: [],
  capabilities: ['target:read', 'observation:publish', 'evidence:write'],
  provenance: 'official',
} as const satisfies PluginManifestV1
