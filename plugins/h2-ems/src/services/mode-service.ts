import type { H2DatasetMode, H2SentinelDataSource } from '@opendashboard/h2-contracts'

export function getH2EmsMode(source: H2SentinelDataSource): Promise<H2DatasetMode> {
  return source.getMode()
}
