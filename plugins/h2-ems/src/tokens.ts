import type { H2SentinelDataSource } from '@opendashboard/h2-contracts'
import { createServiceToken } from '@opendashboard/contracts'

export const H2_EMS_DATA_SOURCE = createServiceToken<H2SentinelDataSource>(
  'opendashboard.h2:ems-data-source',
)
