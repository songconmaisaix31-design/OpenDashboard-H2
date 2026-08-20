import {
  assertPluginManifest,
  type Disposable,
  type PluginContext,
  type PluginDefinition,
  type PluginManifestV1,
  type ServiceToken,
} from '../../contracts/src/index.ts'

export type PluginRuntimeState =
  | 'idle'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'failed'

export type PluginEntryState =
  | 'registered'
  | 'activating'
  | 'active'
  | 'failed'
  | 'disposed'

export type PluginRuntimeErrorCode =
  | 'duplicate_plugin'
  | 'missing_dependency'
  | 'dependency_cycle'
  | 'unsupported_tier'
  | 'unsupported_activation'
  | 'duplicate_service'
  | 'missing_service'
  | 'undeclared_dependency'
  | 'invalid_lifecycle'
  | 'reentrant_lifecycle'
  | 'cleanup_required'
  | 'runtime_not_running'
  | 'activation_failed'

export interface PluginRuntimeFault extends Error {
  readonly code: PluginRuntimeErrorCode
  readonly pluginId?: string
}

export interface PluginRuntimeEntry {
  readonly id: string
  readonly version: string
  readonly tier: PluginManifestV1['tier']
  readonly state: PluginEntryState
  readonly capabilities: PluginManifestV1['capabilities']
  readonly error?: string
}

export interface PluginRuntime {
  start(): Promise<void>
  stop(): Promise<void>
  resolve<T>(token: ServiceToken<T>): T
  snapshot(): readonly PluginRuntimeEntry[]
  getState(): PluginRuntimeState
}

interface InternalPlugin {
  readonly definition: PluginDefinition
  state: PluginEntryState
  error: string | null
  disposable: Disposable | null
  serviceDisposables: Disposable[]
}

interface RegisteredService {
  readonly ownerId: string
  readonly token: object
  readonly value: unknown
}

const runtimeFault = (
  code: PluginRuntimeErrorCode,
  message: string,
  pluginId?: string,
  cause?: unknown,
): PluginRuntimeFault => {
  const error = new Error(
    message,
    cause === undefined ? undefined : { cause },
  ) as PluginRuntimeFault
  error.name = 'PluginRuntimeFault'
  Object.defineProperty(error, 'code', { value: code, enumerable: true })
  if (pluginId !== undefined) {
    Object.defineProperty(error, 'pluginId', {
      value: pluginId,
      enumerable: true,
    })
  }
  return error
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const validateDefinitions = (
  definitions: readonly PluginDefinition[],
): readonly InternalPlugin[] => {
  const ids = new Set<string>()

  return definitions.map((definition) => {
    const manifest = assertPluginManifest(definition.manifest)
    if (ids.has(manifest.id)) {
      throw runtimeFault(
        'duplicate_plugin',
        `Plugin ${manifest.id} is registered more than once.`,
        manifest.id,
      )
    }
    ids.add(manifest.id)

    return {
      definition: { manifest, activate: definition.activate },
      state: 'registered',
      error: null,
      disposable: null,
      serviceDisposables: [],
    }
  })
}

const activationOrder = (
  plugins: readonly InternalPlugin[],
): readonly InternalPlugin[] => {
  const byId = new Map(
    plugins.map((plugin) => [plugin.definition.manifest.id, plugin] as const),
  )
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const ordered: InternalPlugin[] = []

  const visit = (plugin: InternalPlugin): void => {
    const { manifest } = plugin.definition
    if (visited.has(manifest.id)) return
    if (visiting.has(manifest.id)) {
      throw runtimeFault(
        'dependency_cycle',
        `Plugin dependency cycle includes ${manifest.id}.`,
        manifest.id,
      )
    }
    if (manifest.tier === 2) {
      throw runtimeFault(
        'unsupported_tier',
        `Tier 2 plugin ${manifest.id} cannot run in the in-process runtime.`,
        manifest.id,
      )
    }
    if (manifest.activation !== 'startup') {
      throw runtimeFault(
        'unsupported_activation',
        `Plugin ${manifest.id} uses unsupported activation ${manifest.activation}.`,
        manifest.id,
      )
    }

    visiting.add(manifest.id)
    for (const dependencyId of manifest.requires) {
      const dependency = byId.get(dependencyId)
      if (!dependency) {
        throw runtimeFault(
          'missing_dependency',
          `Plugin ${manifest.id} requires missing plugin ${dependencyId}.`,
          manifest.id,
        )
      }
      visit(dependency)
    }
    visiting.delete(manifest.id)
    visited.add(manifest.id)
    ordered.push(plugin)
  }

  for (const plugin of plugins) visit(plugin)
  return ordered
}

/**
 * Creates a reviewed, compile-time plugin runtime. It never resolves modules,
 * files, URLs, packages, or processes from manifest data.
 */
export const createPluginRuntime = (
  definitions: readonly PluginDefinition[],
): PluginRuntime => {
  const plugins = validateDefinitions(definitions)
  const ordered = activationOrder(plugins)
  const services = new Map<string, RegisteredService>()
  let state: PluginRuntimeState = 'idle'
  let operationTail: Promise<void> = Promise.resolve()
  let inPluginCallback = false

  const resolveService = <T>(
    token: ServiceToken<T>,
    consumer?: InternalPlugin,
  ): T => {
    const service = services.get(token.id)
    if (!service || service.token !== token) {
      throw runtimeFault(
        'missing_service',
        `Service ${token.id} is not available for this token.`,
      )
    }
    if (
      consumer &&
      service.ownerId !== consumer.definition.manifest.id &&
      !consumer.definition.manifest.requires.includes(service.ownerId)
    ) {
      throw runtimeFault(
        'undeclared_dependency',
        `Plugin ${consumer.definition.manifest.id} must declare dependency ${service.ownerId} before resolving ${token.id}.`,
        consumer.definition.manifest.id,
      )
    }
    return service.value as T
  }

  const createContext = (plugin: InternalPlugin): PluginContext => ({
    provide<T>(token: ServiceToken<T>, value: T): Disposable {
      if (plugin.state !== 'activating') {
        throw runtimeFault(
          'invalid_lifecycle',
          `Plugin ${plugin.definition.manifest.id} can provide services only during activation.`,
          plugin.definition.manifest.id,
        )
      }
      const existing = services.get(token.id)
      if (existing) {
        throw runtimeFault(
          'duplicate_service',
          `Service ${token.id} is already provided by ${existing.ownerId}.`,
          plugin.definition.manifest.id,
        )
      }

      services.set(token.id, {
        ownerId: plugin.definition.manifest.id,
        token,
        value,
      })
      let disposed = false
      const registration: Disposable = {
        dispose(): void {
          if (disposed) return
          disposed = true
          const current = services.get(token.id)
          if (current?.ownerId === plugin.definition.manifest.id) {
            services.delete(token.id)
          }
        },
      }
      plugin.serviceDisposables.push(registration)
      return registration
    },
    resolve<T>(token: ServiceToken<T>): T {
      return resolveService(token, plugin)
    },
  })

  const disposePlugin = async (
    plugin: InternalPlugin,
  ): Promise<readonly unknown[]> => {
    const errors: unknown[] = []

    if (plugin.disposable) {
      try {
        let disposal: void | Promise<void>
        inPluginCallback = true
        try {
          disposal = plugin.disposable.dispose()
        } finally {
          inPluginCallback = false
        }
        await disposal
        plugin.disposable = null
      } catch (error) {
        errors.push(error)
        plugin.error = errorMessage(error)
      }
    }

    const remainingServiceDisposables: Disposable[] = []
    for (const disposable of [...plugin.serviceDisposables].reverse()) {
      try {
        await disposable.dispose()
      } catch (error) {
        errors.push(error)
        remainingServiceDisposables.unshift(disposable)
        plugin.error ??= errorMessage(error)
      }
    }
    plugin.serviceDisposables = remainingServiceDisposables
    if (errors.length > 0) {
      plugin.state = 'failed'
    } else {
      plugin.state = 'disposed'
      plugin.error = null
    }
    return errors
  }

  const rollback = async (
    active: readonly InternalPlugin[],
  ): Promise<readonly unknown[]> => {
    const errors: unknown[] = []
    for (const plugin of [...active].reverse()) {
      errors.push(...(await disposePlugin(plugin)))
    }
    return errors
  }

  const performStart = async (): Promise<void> => {
    const cleanupOwner = plugins.find(
      (plugin) =>
        plugin.disposable !== null || plugin.serviceDisposables.length > 0,
    )
    if (cleanupOwner) {
      throw runtimeFault(
        'cleanup_required',
        `Plugin ${cleanupOwner.definition.manifest.id} must finish cleanup before restart.`,
        cleanupOwner.definition.manifest.id,
      )
    }
    state = 'starting'
    services.clear()
    for (const plugin of plugins) {
      plugin.state = 'registered'
      plugin.error = null
      plugin.disposable = null
      plugin.serviceDisposables = []
    }

    const active: InternalPlugin[] = []
    for (const plugin of ordered) {
      plugin.state = 'activating'
      try {
        let activation: Disposable | Promise<Disposable>
        inPluginCallback = true
        try {
          activation = plugin.definition.activate(createContext(plugin))
        } finally {
          inPluginCallback = false
        }
        const disposable = await activation
        if (
          typeof disposable !== 'object' ||
          disposable === null ||
          typeof disposable.dispose !== 'function'
        ) {
          throw new Error('Plugin activation must return a Disposable.')
        }
        plugin.disposable = disposable
        plugin.state = 'active'
        active.push(plugin)
      } catch (cause) {
        const currentErrors = await disposePlugin(plugin)
        plugin.state = 'failed'
        plugin.error = errorMessage(cause)
        const rollbackErrors = await rollback(active)
        state = 'failed'
        const failure = runtimeFault(
          'activation_failed',
          `Plugin ${plugin.definition.manifest.id} failed to activate: ${plugin.error}`,
          plugin.definition.manifest.id,
          cause,
        )
        const cleanupErrors = [...currentErrors, ...rollbackErrors]
        if (cleanupErrors.length > 0) {
          throw new AggregateError(
            [failure, ...cleanupErrors],
            'Plugin activation failed and cleanup reported errors.',
          )
        }
        throw failure
      }
    }
    state = 'running'
  }

  const performStop = async (): Promise<void> => {
    if (state === 'idle' || state === 'stopped') {
      state = 'stopped'
      return
    }

    state = 'stopping'
    const errors: unknown[] = []
    for (const plugin of [...ordered].reverse()) {
      if (
        plugin.state === 'active' ||
        plugin.state === 'activating' ||
        plugin.disposable !== null ||
        plugin.serviceDisposables.length > 0
      ) {
        errors.push(...(await disposePlugin(plugin)))
      }
    }
    services.clear()
    if (errors.length > 0) {
      state = 'failed'
      throw new AggregateError(errors, 'Plugin shutdown reported errors.')
    }
    state = 'stopped'
  }

  const enqueue = (operation: () => Promise<void>): Promise<void> => {
    const result = operationTail.then(operation, operation)
    operationTail = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  const assertNotReentrant = (operation: 'start' | 'stop'): void => {
    if (inPluginCallback) {
      throw runtimeFault(
        'reentrant_lifecycle',
        `Plugin callbacks cannot call runtime.${operation}().`,
      )
    }
  }

  function start(): Promise<void> {
    assertNotReentrant('start')
    return enqueue(async () => {
      if (state === 'running') return
      await performStart()
    })
  }

  function stop(): Promise<void> {
    assertNotReentrant('stop')
    return enqueue(performStop)
  }

  return {
    start,
    stop,
    resolve<T>(token: ServiceToken<T>): T {
      if (state !== 'running') {
        throw runtimeFault(
          'runtime_not_running',
          `Cannot resolve ${token.id} while runtime state is ${state}.`,
        )
      }
      return resolveService(token)
    },
    snapshot(): readonly PluginRuntimeEntry[] {
      return plugins.map((plugin) => {
        const { manifest } = plugin.definition
        const entry = {
          id: manifest.id,
          version: manifest.version,
          tier: manifest.tier,
          state: plugin.state,
          capabilities: manifest.capabilities,
        }
        return plugin.error === null ? entry : { ...entry, error: plugin.error }
      })
    },
    getState(): PluginRuntimeState {
      return state
    },
  }
}
