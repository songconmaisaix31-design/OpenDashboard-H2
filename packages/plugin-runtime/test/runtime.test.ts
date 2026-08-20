import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  createServiceToken,
  type Disposable,
  type PluginDefinition,
  type PluginManifestV1,
} from '../../contracts/src/index.ts'
import {
  createPluginRuntime,
  type PluginRuntime,
  type PluginRuntimeFault,
} from '../src/index.ts'

const manifest = (
  id: string,
  requires: readonly string[] = [],
  overrides: Partial<PluginManifestV1> = {},
): PluginManifestV1 => ({
  schemaVersion: 1,
  apiVersion: 1,
  id,
  version: '1.0.0',
  displayName: id,
  tier: 1,
  activation: 'startup',
  requires,
  capabilities: [],
  provenance: 'official',
  ...overrides,
})

const disposable = (effect: () => void): Disposable => ({
  dispose(): void {
    effect()
  },
})

const faultCode = (error: unknown): PluginRuntimeFault['code'] | null => {
  if (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code as PluginRuntimeFault['code']
  }
  return null
}

describe('createPluginRuntime', () => {
  it('activates dependencies first and disposes consumers first', async () => {
    const events: string[] = []
    const valueToken = createServiceToken<number>('test.value')
    const consumer: PluginDefinition = {
      manifest: manifest('test.consumer', ['test.provider']),
      activate(context) {
        events.push(`consumer:${context.resolve(valueToken)}`)
        return disposable(() => events.push('dispose:consumer'))
      },
    }
    const provider: PluginDefinition = {
      manifest: manifest('test.provider'),
      activate(context) {
        events.push('provider')
        context.provide(valueToken, 42)
        return disposable(() => events.push('dispose:provider'))
      },
    }
    const runtime = createPluginRuntime([consumer, provider])

    await runtime.start()
    assert.equal(runtime.resolve(valueToken), 42)
    assert.throws(
      () => runtime.resolve(createServiceToken<string>('test.value')),
      (error: unknown) => faultCode(error) === 'missing_service',
    )
    assert.deepEqual(events, ['provider', 'consumer:42'])

    await runtime.stop()
    assert.deepEqual(events, [
      'provider',
      'consumer:42',
      'dispose:consumer',
      'dispose:provider',
    ])
    assert.equal(runtime.getState(), 'stopped')
  })

  it('rolls back active plugins and their services after activation failure', async () => {
    const events: string[] = []
    const valueToken = createServiceToken<number>('test.rollback')
    const provider: PluginDefinition = {
      manifest: manifest('test.provider'),
      activate(context) {
        context.provide(valueToken, 7)
        events.push('provider')
        return disposable(() => events.push('dispose:provider'))
      },
    }
    const failure: PluginDefinition = {
      manifest: manifest('test.failure', ['test.provider']),
      activate(context) {
        assert.equal(context.resolve(valueToken), 7)
        throw new Error('expected failure')
      },
    }
    const runtime = createPluginRuntime([failure, provider])

    await assert.rejects(runtime.start(), (error: unknown) => {
      assert.equal(faultCode(error), 'activation_failed')
      return true
    })
    assert.deepEqual(events, ['provider', 'dispose:provider'])
    assert.equal(runtime.getState(), 'failed')
    assert.throws(() => runtime.resolve(valueToken), (error: unknown) => {
      assert.equal(faultCode(error), 'runtime_not_running')
      return true
    })
  })

  it('rejects duplicate plugins, invalid graphs, on-demand activation, and Tier 2', () => {
    const noop = (): Disposable => disposable(() => undefined)
    const definition = (pluginManifest: PluginManifestV1): PluginDefinition => ({
      manifest: pluginManifest,
      activate: noop,
    })

    assert.throws(
      () =>
        createPluginRuntime([
          definition(manifest('test.same')),
          definition(manifest('test.same')),
        ]),
      (error: unknown) => faultCode(error) === 'duplicate_plugin',
    )
    assert.throws(
      () =>
        createPluginRuntime([
          definition(manifest('test.missing', ['test.unknown'])),
        ]),
      (error: unknown) => faultCode(error) === 'missing_dependency',
    )
    assert.throws(
      () =>
        createPluginRuntime([
          definition(manifest('test.first', ['test.second'])),
          definition(manifest('test.second', ['test.first'])),
        ]),
      (error: unknown) => faultCode(error) === 'dependency_cycle',
    )
    assert.throws(
      () =>
        createPluginRuntime([
          definition(
            manifest('test.on-demand', [], { activation: 'on-demand' }),
          ),
        ]),
      (error: unknown) => faultCode(error) === 'unsupported_activation',
    )
    assert.throws(
      () =>
        createPluginRuntime([
          definition(manifest('test.sidecar', [], { tier: 2 })),
        ]),
      (error: unknown) => faultCode(error) === 'unsupported_tier',
    )
  })

  it('rejects duplicate service providers and still rolls back', async () => {
    const events: string[] = []
    const token = createServiceToken<number>('test.duplicate-service')
    const first: PluginDefinition = {
      manifest: manifest('test.first-provider'),
      activate(context) {
        context.provide(token, 1)
        return disposable(() => events.push('dispose:first'))
      },
    }
    const second: PluginDefinition = {
      manifest: manifest('test.second-provider', ['test.first-provider']),
      activate(context) {
        context.provide(token, 2)
        return disposable(() => events.push('dispose:second'))
      },
    }
    const runtime = createPluginRuntime([second, first])

    await assert.rejects(runtime.start(), (error: unknown) => {
      assert.equal(faultCode(error), 'activation_failed')
      return true
    })
    assert.deepEqual(events, ['dispose:first'])
  })

  it('rejects service resolution without a declared plugin dependency', async () => {
    const token = createServiceToken<number>('test.declared-service')
    const provider: PluginDefinition = {
      manifest: manifest('test.declared-provider'),
      activate(context) {
        context.provide(token, 1)
        return disposable(() => undefined)
      },
    }
    const undeclaredConsumer: PluginDefinition = {
      manifest: manifest('test.undeclared-consumer'),
      activate(context) {
        context.resolve(token)
        return disposable(() => undefined)
      },
    }
    const runtime = createPluginRuntime([provider, undeclaredConsumer])

    await assert.rejects(runtime.start(), (error: unknown) => {
      assert.equal(faultCode(error), 'activation_failed')
      assert.equal(
        faultCode(error instanceof Error ? error.cause : undefined),
        'undeclared_dependency',
      )
      return true
    })
  })

  it('rejects service registration outside plugin activation', async () => {
    const token = createServiceToken<number>('test.late-service')
    let provideLate: (() => Disposable) | undefined
    const runtime = createPluginRuntime([
      {
        manifest: manifest('test.late-provider'),
        activate(context) {
          provideLate = () => context.provide(token, 1)
          return disposable(() => undefined)
        },
      },
    ])

    await runtime.start()
    assert.ok(provideLate)
    assert.throws(provideLate, (error: unknown) => {
      assert.equal(faultCode(error), 'invalid_lifecycle')
      return true
    })
    await runtime.stop()
  })

  it('keeps failed cleanup retryable and blocks restart until it succeeds', async () => {
    const events: string[] = []
    let shouldFail = true
    const first: PluginDefinition = {
      manifest: manifest('test.first'),
      activate() {
        return disposable(() => events.push('dispose:first'))
      },
    }
    const second: PluginDefinition = {
      manifest: manifest('test.second'),
      activate() {
        return {
          dispose(): void {
            events.push('dispose:second')
            if (shouldFail) {
              shouldFail = false
              throw new Error('expected dispose failure')
            }
          },
        }
      },
    }
    const runtime = createPluginRuntime([first, second])

    await runtime.start()
    await assert.rejects(runtime.stop(), AggregateError)
    assert.deepEqual(events, ['dispose:second', 'dispose:first'])
    assert.equal(runtime.getState(), 'failed')
    await assert.rejects(
      runtime.start(),
      (error: unknown) => faultCode(error) === 'cleanup_required',
    )
    await runtime.stop()
    assert.deepEqual(events, [
      'dispose:second',
      'dispose:first',
      'dispose:second',
    ])
    assert.equal(runtime.getState(), 'stopped')
    await runtime.start()
    assert.equal(runtime.getState(), 'running')
  })

  it('keeps start and stop idempotent', async () => {
    let activations = 0
    let disposals = 0
    const runtime = createPluginRuntime([
      {
        manifest: manifest('test.idempotent'),
        activate() {
          activations += 1
          return disposable(() => {
            disposals += 1
          })
        },
      },
    ])

    await Promise.all([runtime.start(), runtime.start()])
    await Promise.all([runtime.stop(), runtime.stop()])

    assert.equal(activations, 1)
    assert.equal(disposals, 1)
  })

  it('serializes concurrent restarts behind an in-flight stop', async () => {
    let activations = 0
    let disposals = 0
    let releaseStop: (() => void) | undefined
    const stopGate = new Promise<void>((resolve) => {
      releaseStop = resolve
    })
    const runtime = createPluginRuntime([
      {
        manifest: manifest('test.restart'),
        activate() {
          activations += 1
          return {
            async dispose(): Promise<void> {
              disposals += 1
              await stopGate
            },
          }
        },
      },
    ])

    await runtime.start()
    const stopping = runtime.stop()
    const firstRestart = runtime.start()
    const secondRestart = runtime.start()
    releaseStop?.()
    await Promise.all([stopping, firstRestart, secondRestart])

    assert.equal(activations, 2)
    assert.equal(disposals, 1)
    assert.equal(runtime.getState(), 'running')
  })

  it('linearizes alternating lifecycle requests in call order', async () => {
    let activations = 0
    let disposals = 0
    const runtime = createPluginRuntime([
      {
        manifest: manifest('test.linearized'),
        activate() {
          activations += 1
          return disposable(() => {
            disposals += 1
          })
        },
      },
    ])

    await Promise.all([runtime.start(), runtime.stop(), runtime.start()])
    assert.equal(activations, 2)
    assert.equal(disposals, 1)
    assert.equal(runtime.getState(), 'running')

    await Promise.all([runtime.stop(), runtime.start(), runtime.stop()])
    assert.equal(activations, 3)
    assert.equal(disposals, 3)
    assert.equal(runtime.getState(), 'stopped')
  })

  it('rejects synchronous lifecycle re-entry from activation', async () => {
    let activations = 0
    let runtime: PluginRuntime
    const plugin: PluginDefinition = {
      manifest: manifest('test.reentrant'),
      activate() {
        activations += 1
        assert.throws(
          () => runtime.start(),
          (error: unknown) => faultCode(error) === 'reentrant_lifecycle',
        )
        return disposable(() => undefined)
      },
    }
    runtime = createPluginRuntime([plugin])

    await runtime.start()
    assert.equal(activations, 1)
    await runtime.stop()
  })
})
