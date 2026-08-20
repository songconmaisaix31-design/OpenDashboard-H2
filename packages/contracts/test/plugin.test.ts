import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  createServiceToken,
  validatePluginManifest,
  type ServiceToken,
} from '../src/index.ts'

interface Animal {
  readonly name: string
}

interface Dog extends Animal {
  bark(): void
}

const dogToken = createServiceToken<Dog>('test.invariant-dog')
// @ts-expect-error Service tokens are invariant so a Dog token cannot be widened.
const invalidAnimalToken: ServiceToken<Animal> = dogToken
void invalidAnimalToken

const VALID_MANIFEST = {
  schemaVersion: 1,
  apiVersion: 1,
  id: 'opendashboard.fixture-demo',
  version: '1.0.0',
  displayName: 'Fixture Demo',
  tier: 1,
  activation: 'startup',
  requires: [],
  capabilities: ['target:read', 'action:fixture'],
  provenance: 'fixture',
} as const

describe('plugin contract', () => {
  it('normalizes and freezes a valid manifest', () => {
    const result = validatePluginManifest(VALID_MANIFEST)

    assert.equal(result.ok, true)
    if (!result.ok) return
    assert(Object.isFrozen(result.value))
    assert(Object.isFrozen(result.value.capabilities))
  })

  it('rejects unknown fields and capabilities', () => {
    const result = validatePluginManifest({
      ...VALID_MANIFEST,
      entrypoint: './plugin.ts',
      capabilities: ['target:read', 'shell:execute'],
    })

    assert.equal(result.ok, false)
    if (result.ok) return
    assert(result.errors.some((error) => error.includes('entrypoint')))
    assert(result.errors.some((error) => error.includes('shell:execute')))
  })

  it('rejects malformed service token ids', () => {
    assert.throws(() => createServiceToken(' process control '))
    assert.equal(createServiceToken<string>('opendashboard.demo:value').id, 'opendashboard.demo:value')
  })
})
