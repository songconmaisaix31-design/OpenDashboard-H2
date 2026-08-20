import type { H2SentinelDataSource } from '../../../packages/h2-contracts/src/index.ts'

import type { H2EmsLiveAdapterOptions } from './live-data-source.ts'

/** The only two explicit inputs accepted by the static plugin factory. */
export type H2EmsPluginSource = H2SentinelDataSource | H2EmsLiveAdapterOptions
