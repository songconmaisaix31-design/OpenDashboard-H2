import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { resolve } from 'node:path'

import { terminatePidTree } from '../../scripts/h2-sentinel/launch.mjs'
import { repositoryRoot } from './official-contract.mjs'

const LOOPBACK_HOST = '127.0.0.1'
const MAX_ERROR_CODE_LENGTH = 128
const MAX_ERROR_TEXT_LENGTH = 512
const MAX_ERROR_DETAILS = 8
const ERROR_CODE_PATTERN = /^[A-Za-z0-9._-]+$/
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/
const SENSITIVE_ERROR_TEXT_PATTERN =
  /(?:[A-Za-z]:[\\/]|\\\\|\/(?:Users|home|etc|root|tmp|var)\/|api[_ -]?key|password|private[_ -]?key|token|secret|credential)/i
const launcherPath = resolve(repositoryRoot, 'scripts/h2-sentinel/launch.mjs')

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function safeErrorCode(value) {
  if (typeof value !== 'string') return ''
  const code = value.trim()
  return code.length > 0 &&
      code.length <= MAX_ERROR_CODE_LENGTH &&
      ERROR_CODE_PATTERN.test(code) &&
      !SENSITIVE_ERROR_TEXT_PATTERN.test(code)
    ? code
    : ''
}

function safeErrorText(value) {
  if (typeof value !== 'string') return ''
  const text = value.trim()
  return text.length > 0 &&
      text.length <= MAX_ERROR_TEXT_LENGTH &&
      !CONTROL_CHARACTER_PATTERN.test(text) &&
      !SENSITIVE_ERROR_TEXT_PATTERN.test(text)
    ? text
    : ''
}

function formatEnvelopeFailure(route, status, body) {
  const envelope = isRecord(body) ? body : null
  const error = isRecord(envelope?.error) ? envelope.error : envelope
  const code = safeErrorCode(error?.code)
  const message = safeErrorText(error?.message) || 'unknown error'
  const details = Array.isArray(error?.details)
    ? error.details
      .slice(0, MAX_ERROR_DETAILS)
      .map(safeErrorText)
      .filter(Boolean)
    : []
  return `${route} returned HTTP ${status}${code ? ` ${code}` : ''}: ${message}${
    details.length > 0 ? ` ${details.join(' ')}` : ''
  }`
}

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
    let settled = false
    const finish = (callback, value) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      child.off('exit', onExit)
      child.off('close', onExit)
      callback(value)
    }
    const onExit = (code, signal) => finish(resolvePromise, { code, signal })
    const timeout = setTimeout(
      () => finish(rejectPromise, new Error('Launcher process exit timed out.')),
      timeoutMs,
    )
    child.once('exit', onExit)
    child.once('close', onExit)
  })
}

export async function terminateExactChildTree(
  child,
  { timeoutMs = 20_000, terminate = terminatePidTree } = {},
) {
  if (
    Number.isInteger(child.pid) && child.pid > 0 &&
    child.exitCode === null && child.signalCode === null
  ) {
    await terminate(child.pid)
  }
  await waitForExit(child, timeoutMs)
}

export function waitForLauncherReady(child, stdout, timeoutMs = 60_000) {
  return new Promise((resolvePromise, rejectPromise) => {
    let settled = false
    const finish = (callback, value) => {
      if (settled) return
      settled = true
      clearInterval(interval)
      clearTimeout(timeout)
      child.off('error', onError)
      child.off('exit', onExit)
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
    const onError = () => finish(rejectPromise, new Error('Launcher spawn failed.'))
    const onExit = () => finish(rejectPromise, new Error('Launcher exited before readiness.'))
    const interval = setInterval(inspect, 25)
    const timeout = setTimeout(
      () => finish(rejectPromise, new Error('Launcher readiness timed out.')),
      timeoutMs,
    )
    child.once('error', onError)
    child.once('exit', onExit)
    inspect()
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

  let ready
  try {
    ready = await waitForLauncherReady(child, stdout)
    if (!assertLoopbackHttp(ready.webUrl) || !assertLoopbackHttp(ready.analyticsUrl)) {
      throw new Error('Launcher readiness violated the loopback boundary.')
    }
  } catch {
    try {
      await terminateExactChildTree(child)
    } catch {
      throw new Error('Launcher readiness failed and exact child cleanup could not be confirmed.')
    }
    throw new Error('Launcher readiness failed; the exact launched child tree was terminated.')
  }

  return {
    child,
    ready,
    async stop({ timeoutMs = 20_000 } = {}) {
      if (child.exitCode === null && child.signalCode === null && child.connected) {
        try {
          child.send({ type: 'shutdown' })
        } catch {
          await terminateExactChildTree(child, { timeoutMs })
          return { code: child.exitCode, signal: child.signalCode, timedOut: true }
        }
      }
      try {
        const result = await waitForExit(child, timeoutMs)
        return { ...result, timedOut: false }
      } catch {
        await terminateExactChildTree(child, { timeoutMs })
        return { code: child.exitCode, signal: child.signalCode, timedOut: true }
      }
    },
  }
}

export function resolveLoopbackRoute(baseUrl, route) {
  if (!assertLoopbackHttp(baseUrl)) {
    throw new Error('Validation requests require a literal loopback HTTP base URL.')
  }
  if (typeof route !== 'string' || !route.startsWith('/') || route.startsWith('//')) {
    throw new Error('Validation request routes must be root-relative paths.')
  }
  const base = new URL(baseUrl)
  const resolved = new URL(route, base)
  if (!assertLoopbackHttp(resolved.href) || resolved.origin !== base.origin) {
    throw new Error('Validation request route escaped the launched loopback service.')
  }
  return resolved
}

export async function requestEnvelope(
  baseUrl,
  route,
  payload,
  { timeoutMs = 120_000, method } = {},
) {
  const url = resolveLoopbackRoute(baseUrl, route)
  const requestMethod = method ?? (payload === undefined ? 'GET' : 'POST')
  const response = await fetch(url, {
    method: requestMethod,
    redirect: 'error',
    ...(payload === undefined
      ? {}
      : {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  let body
  try {
    body = await response.json()
  } catch {
    throw new Error(formatEnvelopeFailure(route, response.status, null))
  }
  if (!response.ok || !isRecord(body) || body.ok !== true) {
    throw new Error(formatEnvelopeFailure(route, response.status, body))
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
