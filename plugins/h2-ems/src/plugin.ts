import {
  type H2SentinelDataSource,
} from '../../../packages/h2-contracts/src/index.ts'
import { type PluginDefinition, type PluginContext } from '../../../packages/contracts/src/index.ts'

import { createFixtureH2EmsDataSource } from './fixture-data-source.ts'
import {
  createLiveH2EmsDataSource,
  type H2EmsLiveAdapterOptions,
} from './live-data-source.ts'
import { H2_EMS_MANIFEST } from './manifest.ts'
import { H2_EMS_DATA_SOURCE } from './tokens.ts'

/**
 * Static Tier 1 manifest. Its capabilities are review metadata only and do
 * not sandbox this trusted in-process module.
 */
export function createH2EmsPlugin(): PluginDefinition
export function createH2EmsPlugin(source: H2SentinelDataSource): PluginDefinition
export function createH2EmsPlugin(options: H2EmsLiveAdapterOptions): PluginDefinition
export function createH2EmsPlugin(
  sourceOrOptions?: H2SentinelDataSource | H2EmsLiveAdapterOptions,
): PluginDefinition {
  const source = isLiveOptions(sourceOrOptions)
    ? createLiveH2EmsDataSource(sourceOrOptions)
    : sourceOrOptions ?? createFixtureH2EmsDataSource()
  const definition = {
    manifest: H2_EMS_MANIFEST,
    activate(context: PluginContext) {
      return context.provide(H2_EMS_DATA_SOURCE, source)
    },
  } as const satisfies PluginDefinition
  return Object.freeze(definition)
}

export const h2EmsPlugin = createH2EmsPlugin()

function isLiveOptions(
  value: H2SentinelDataSource | H2EmsLiveAdapterOptions | undefined,
): value is H2EmsLiveAdapterOptions {
  return typeof value === 'object' && value !== null && 'enabled' in value
}
