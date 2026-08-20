import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { H2SentinelApp } from '../H2SentinelApp.tsx'
import { createH2WebFixtureDataSource } from '../test/fixture-data-source.ts'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('H2 Sentinel preview root is missing.')

createRoot(rootElement).render(
  <StrictMode>
    <H2SentinelApp dataSource={createH2WebFixtureDataSource()} />
  </StrictMode>,
)
