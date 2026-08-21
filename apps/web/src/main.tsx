import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { createPluginRuntime } from '@opendashboard/plugin-runtime'
import {
  createH2EmsPlugin,
  H2_EMS_DATA_SOURCE,
  h2EmsPlugin,
} from '@opendashboard/h2-ems'
import { H2SentinelApp } from './features/h2-sentinel/index.ts'

type H2Mode = 'fixture' | 'local'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('未找到 OpenDashboard 根元素。')
}

const reportLifecycleFailure = (phase: 'startup' | 'shutdown'): void => {
  console.error(`[OpenDashboard] ${phase} failed.`)
}

const renderStartupFailure = (): void => {
  const message = document.createElement('p')
  message.setAttribute('role', 'alert')
  message.textContent = 'OpenDashboard 启动失败。请检查本地开发日志后重试。'
  rootElement.replaceChildren(message)
}

const readH2Mode = (location: Location): H2Mode => {
  const parameters = new URLSearchParams(location.search)
  const modes = parameters.getAll('mode')
  const hasUnknownParameter = [...parameters.keys()].some((key) => key !== 'mode')
  if (hasUnknownParameter || modes.length > 1) {
    throw new Error('Invalid H2 Sentinel entry configuration.')
  }

  if (modes.length === 0) {
    return 'fixture'
  }

  const mode = modes[0]
  if (mode !== 'fixture' && mode !== 'local') {
    throw new Error('Invalid H2 Sentinel mode.')
  }

  return mode
}

const registerPagehideShutdown = (stop: () => Promise<void>): void => {
  window.addEventListener(
    'pagehide',
    () => {
      void stop().catch(() => reportLifecycleFailure('shutdown'))
    },
    { once: true },
  )
}

const bootstrapH2Sentinel = async (mode: H2Mode): Promise<void> => {
  const plugin =
    mode === 'fixture'
      ? h2EmsPlugin
      : createH2EmsPlugin({ enabled: true, baseUrl: window.location.origin })
  const pluginRuntime = createPluginRuntime([plugin])
  await pluginRuntime.start()
  const dataSource = pluginRuntime.resolve(H2_EMS_DATA_SOURCE)

  registerPagehideShutdown(() => pluginRuntime.stop())
  document.title = 'OpenDashboard | H2 Sentinel'

  createRoot(rootElement).render(
    <StrictMode>
      <H2SentinelApp dataSource={dataSource} />
    </StrictMode>,
  )
}

const bootstrap = async (): Promise<void> => {
  await bootstrapH2Sentinel(readH2Mode(window.location))
}

void bootstrap().catch(() => {
  reportLifecycleFailure('startup')
  renderStartupFailure()
})
