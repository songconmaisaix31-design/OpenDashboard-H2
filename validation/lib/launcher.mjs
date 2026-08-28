import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { resolve } from 'node:path'

import { terminatePidTree } from '../../scripts/h2-sentinel/launch.mjs'
import { repositoryRoot } from './official-contract.mjs'

const LOOPBACK_HOST = '127.0.0.1'
const launcherPath = resolve(repositoryRoot, 'scripts/h2-sentinel/launch.mjs')

export async function freeLoopbackPort() {
  return new Promise((resolvePromise, rejectPromise) => {
    const server = createServer()
    server.once('error', rejectPromise)
    server.listen({ host: LOOPBACK_HOST, port: 0 }, () => {
      const address = server.address()
      if (address === null || typeof address !== 'object') {
        server.close()
        rejectPromise(new Error('Failed to allocate a loopback port.'))
        return
      }
      server.close((error) =>
        error ? rejectPromise(error) : resolvePromise(address.port),
      )
    })
  })
}

function collectLines(stream, lines) {
  let pending = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    pending += chunk
    const parts = pending.split(/\r?\n/)
    pending = parts.pop() ?? ''
    lines.push(...parts)
  })
  stream.on('end', () => {
    if (pending) lines.push(pending)
  })
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode })
  }
  return new Promise((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(
      () => rejectPromise(new Error('Launcher process exit timed out.')),
      timeoutMs,
    )
    child.once('exit', (code, signal) => {
      clearTimeout(timeout)
      resolvePromise({ code, signal })
    })
  })
}

export async function startLauncher({ mode = 'local', webPort, analyticsPort }) {
  if (mode !== 'local') throw new Error('Validation tools require Local mode.')
  const argumentsList = [
    '--mode',
    mode,
    '--web-port',
    String(webPort),
    '--analytics-port',
    String(analyticsPort),
    '--ready-json',
  ]
  const stdout = []
  const stderr = []
  const child = spawn(process.execPath, [launcherPath, ...argumentsList], {
    cwd: repositoryRoot,
    env: process.env,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true,
  })
  collectLines(child.stdout, stdout)
  collectLines(child.stderr, stderr)

  const ready = await new Promise((resolvePromise, rejectPromise) => {
    let settled = false
    const finish = (callback, value) => {
      if (settled) return
      settled = true
      clearInterval(interval)
      clearTimeout(timeout)
      callback(value)
    }
    const inspect = () => {
      for (const line of stdout) {
        try {
          const value = JSON.parse(line)
          if (value.event === 'READY') {
            finish(resolvePromise, value)
            return
          }
        } catch {
          // Non-JSON launcher output is intentionally ignored.
        }
      }
    }
    const interval = setInterval(inspect, 25)
    const timeout = setTimeout(
      () => finish(
        rejectPromise,
        new Error(`Launcher readiness timed out: ${stderr.join(' ')}`),
      ),
      60_000,
    )
    child.once('exit', (code) => finish(
      rejectPromise,
      new Error(`Launcher exited before readiness (${code}): ${stderr.join(' ')}`),
    ))
  })

  if (!assertLoopbackHttp(ready.webUrl) || !assertLoopbackHttp(ready.analyticsUrl)) {
    await terminatePidTree(child.pid)
    throw new Error('Launcher readiness violated the loopback-only evidence boundary.')
  }

  return {
    child,
    ready,
    async stop({ timeoutMs = 20_000 } = {}) {
      if (child.exitCode === null && child.signalCode === null) {
        child.send({ type: 'shutdown' })
      }
      try {
        const result = await waitForExit(child, timeoutMs)
        return { ...result, timedOut: false }
      } catch {
        await terminatePidTree(child.pid)
        return { code: null, signal: null, timedOut: true }
      }
    },
  }
}

export async function requestEnvelope(
  baseUrl,
  route,
  payload,
  { timeoutMs = 120_000, method } = {},
) {
  if (!assertLoopbackHttp(baseUrl)) {
    throw new Error('Validation requests require a literal loopback HTTP base URL.')
  }
  const requestMethod = method ?? (payload === undefined ? 'GET' : 'POST')
  const response = await fetch(new URL(route, baseUrl), {
    method: requestMethod,
    ...(payload === undefined
      ? {}
      : {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const body = await response.json()
  if (!response.ok || body.ok !== true) {
    const details = Array.isArray(body.details) ? ` ${body.details.join(' ')}` : ''
    throw new Error(
      `${route} returned HTTP ${response.status} ${body.code ?? ''}: ${
        body.message ?? 'unknown error'
      }${details}`,
    )
  }
  return body.data
}

export function assertLoopbackHttp(value) {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return (
      url.protocol === 'http:' &&
      url.hostname === LOOPBACK_HOST &&
      url.port !== '' &&
      url.username === '' &&
      url.password === ''
    )
  } catch {
    return false
  }
}
