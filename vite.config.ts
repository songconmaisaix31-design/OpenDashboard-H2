import { defineConfig } from 'vite'

const LOOPBACK_HOST = '127.0.0.1'
const H2_API_NAMESPACE = '/api/v1/h2-sentinel'
const H2_ANALYTICS_PORT_VARIABLE = 'H2_SENTINEL_ANALYTICS_PORT'

const readAnalyticsPort = (): number | null => {
  const input = process.env[H2_ANALYTICS_PORT_VARIABLE]
  if (input === undefined) {
    return null
  }
  if (!/^\d{4,5}$/.test(input)) {
    throw new Error(`${H2_ANALYTICS_PORT_VARIABLE} must be a decimal port.`)
  }
  const port = Number(input)
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`${H2_ANALYTICS_PORT_VARIABLE} must be between 1024 and 65535.`)
  }
  return port
}

export default defineConfig(() => {
  const analyticsPort = readAnalyticsPort()
  const proxy =
    analyticsPort === null
      ? {}
      : {
          proxy: {
            [H2_API_NAMESPACE]: {
              target: `http://${LOOPBACK_HOST}:${analyticsPort}`,
            },
          },
        }

  return {
    envDir: false,
    server: {
      host: LOOPBACK_HOST,
      strictPort: true,
      ...proxy,
    },
    preview: {
      host: LOOPBACK_HOST,
      strictPort: true,
      ...proxy,
    },
  }
})
