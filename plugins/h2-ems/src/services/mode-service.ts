import type { H2DatasetMode, H2SentinelDataSource } from '../../../../packages/h2-contracts/src/index.ts'

export function getH2EmsMode(source: H2SentinelDataSource): Promise<H2DatasetMode> {
  return source.getMode()
}
