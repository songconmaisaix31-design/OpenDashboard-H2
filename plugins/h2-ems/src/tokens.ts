import type { H2SentinelDataSource } from '../../../packages/h2-contracts/src/index.ts'
import { createServiceToken } from '../../../packages/contracts/src/index.ts'

export const H2_EMS_DATA_SOURCE = createServiceToken<H2SentinelDataSource>(
  'opendashboard.h2:ems-data-source',
)
