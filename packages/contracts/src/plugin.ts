export const PLUGIN_CAPABILITIES = [
  'target:read',
  'observation:publish',
  'incident:write',
  'evidence:write',
  'action:fixture',
] as const

export type PluginCapability = (typeof PLUGIN_CAPABILITIES)[number]
export type PluginTier = 0 | 1 | 2
export type PluginActivation = 'startup' | 'on-demand'
export type PluginProvenance =
  | 'core'
  | 'official'
  | 'fixture'
  | 'third-party'

export interface PluginManifestV1 {
  readonly schemaVersion: 1
  readonly apiVersion: 1
  readonly id: string
  readonly version: string
  readonly displayName: string
  readonly tier: PluginTier
  readonly activation: PluginActivation
  readonly requires: readonly string[]
  readonly capabilities: readonly PluginCapability[]
  readonly provenance: PluginProvenance
}

declare const serviceTokenType: unique symbol

export interface ServiceToken<T> {
  readonly id: string
  readonly [serviceTokenType]?: (value: T) => T
}

export interface Disposable {
  dispose(): void | Promise<void>
}

export interface PluginContext {
  provide<T>(token: ServiceToken<T>, value: T): Disposable
  resolve<T>(token: ServiceToken<T>): T
}

export interface PluginDefinition {
  readonly manifest: PluginManifestV1
  activate(context: PluginContext): Disposable | Promise<Disposable>
}

export type PluginManifestValidationResult =
  | {
      readonly ok: true
      readonly value: PluginManifestV1
    }
  | {
      readonly ok: false
      readonly errors: readonly string[]
    }

const MANIFEST_KEYS = new Set([
  'schemaVersion',
  'apiVersion',
  'id',
  'version',
  'displayName',
  'tier',
  'activation',
  'requires',
  'capabilities',
  'provenance',
])

const PLUGIN_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
const SERVICE_ID_PATTERN = /^[a-z0-9]+(?:[._:/-][a-z0-9]+)*$/
const CAPABILITY_SET = new Set<string>(PLUGIN_CAPABILITIES)
const ACTIVATIONS = new Set<PluginActivation>(['startup', 'on-demand'])
const PROVENANCE = new Set<PluginProvenance>([
  'core',
  'official',
  'fixture',
  'third-party',
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readStringArray = (
  value: unknown,
  field: string,
  errors: string[],
): readonly string[] => {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    errors.push(`${field} must be an array of strings.`)
    return []
  }

  const items = value as string[]
  if (new Set(items).size !== items.length) {
    errors.push(`${field} must not contain duplicates.`)
  }
  return items
}

/**
 * Validates manifests even when they originate from trusted compiled code so
 * contract drift fails before any plugin side effect runs.
 */
export const validatePluginManifest = (
  input: unknown,
): PluginManifestValidationResult => {
  if (!isRecord(input)) {
    return { ok: false, errors: ['manifest must be an object.'] }
  }

  const errors: string[] = []
  const unknownKeys = Object.keys(input).filter((key) => !MANIFEST_KEYS.has(key))
  if (unknownKeys.length > 0) {
    errors.push(`manifest contains unknown fields: ${unknownKeys.sort().join(', ')}.`)
  }

  if (input.schemaVersion !== 1) {
    errors.push('schemaVersion must be 1.')
  }
  if (input.apiVersion !== 1) {
    errors.push('apiVersion must be 1.')
  }
  if (
    typeof input.id !== 'string' ||
    input.id.length > 128 ||
    !PLUGIN_ID_PATTERN.test(input.id)
  ) {
    errors.push('id must be a lowercase dotted or kebab-case identifier.')
  }
  if (
    typeof input.version !== 'string' ||
    !VERSION_PATTERN.test(input.version)
  ) {
    errors.push('version must use a semantic major.minor.patch shape.')
  }
  if (
    typeof input.displayName !== 'string' ||
    input.displayName.trim() !== input.displayName ||
    input.displayName.length === 0 ||
    input.displayName.length > 80
  ) {
    errors.push('displayName must be a trimmed string between 1 and 80 characters.')
  }
  if (input.tier !== 0 && input.tier !== 1 && input.tier !== 2) {
    errors.push('tier must be 0, 1, or 2.')
  }
  if (
    typeof input.activation !== 'string' ||
    !ACTIVATIONS.has(input.activation as PluginActivation)
  ) {
    errors.push('activation must be startup or on-demand.')
  }
  if (
    typeof input.provenance !== 'string' ||
    !PROVENANCE.has(input.provenance as PluginProvenance)
  ) {
    errors.push('provenance is not supported.')
  }

  const requires = readStringArray(input.requires, 'requires', errors)
  for (const requiredId of requires) {
    if (!PLUGIN_ID_PATTERN.test(requiredId)) {
      errors.push(`requires contains an invalid plugin id: ${requiredId}.`)
    }
  }

  const capabilities = readStringArray(
    input.capabilities,
    'capabilities',
    errors,
  )
  for (const capability of capabilities) {
    if (!CAPABILITY_SET.has(capability)) {
      errors.push(`capabilities contains an unsupported value: ${capability}.`)
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors: Object.freeze(errors) }
  }

  const value: PluginManifestV1 = Object.freeze({
    schemaVersion: input.schemaVersion as 1,
    apiVersion: input.apiVersion as 1,
    id: input.id as string,
    version: input.version as string,
    displayName: input.displayName as string,
    tier: input.tier as PluginTier,
    activation: input.activation as PluginActivation,
    requires: Object.freeze([...requires]),
    capabilities: Object.freeze([...capabilities]) as readonly PluginCapability[],
    provenance: input.provenance as PluginProvenance,
  })

  return { ok: true, value }
}

export const assertPluginManifest = (input: unknown): PluginManifestV1 => {
  const result = validatePluginManifest(input)
  if (!result.ok) {
    throw new Error(`Invalid plugin manifest: ${result.errors.join(' ')}`)
  }
  return result.value
}

export const createServiceToken = <T>(id: string): ServiceToken<T> => {
  if (
    id.length === 0 ||
    id.length > 160 ||
    id.trim() !== id ||
    !SERVICE_ID_PATTERN.test(id)
  ) {
    throw new Error(`Invalid service token id: ${id}.`)
  }
  return Object.freeze({ id }) as ServiceToken<T>
}
