import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const LOOPBACK_HOST = '127.0.0.1'
const DEFAULT_WEB_PORT = 5173
const DEFAULT_ANALYTICS_PORT = 8765
const DEFAULT_HEALTH_TIMEOUT_MS = 20_000
const MIN_PORT = 1024
const MAX_PORT = 65_535
const MIN_HEALTH_TIMEOUT_MS = 250
const MAX_HEALTH_TIMEOUT_MS = 60_000
const API_NAMESPACE = '/api/v1/h2-sentinel'
const HEALTH_ENVELOPE_KEYS = Object.freeze([
  'data',
  'ok',
  'provenance',
  'status',
  'warnings',
])
const HEALTH_DATA_KEYS = Object.freeze([
  'aggregationVersion',
  'apiVersion',
  'bindHost',
  'configurationVersion',
  'detectorVersion',
  'featureVersion',
  'namespace',
  'ruleVersion',
  'serviceVersion',
  'status',
])
const HEALTH_PROVENANCE_KEYS = Object.freeze([
  'configurationVersion',
  'generatedAt',
  'limitations',
  'mode',
  'ruleVersion',
  'source',
])
const HEALTH_VERSION_KEYS = Object.freeze([
  'aggregationVersion',
  'apiVersion',
  'configurationVersion',
  'detectorVersion',
  'featureVersion',
  'ruleVersion',
  'serviceVersion',
])
const STABLE_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '../..')
const analyticsDirectory = resolve(repositoryRoot, 'services/h2-analytics')
const viteEntry = resolve(repositoryRoot, 'node_modules/vite/bin/vite.js')
const productionIndex = resolve(repositoryRoot, 'apps/web/dist/index.html')
const windowsOwnedProcessWrapper = resolve(scriptDirectory, 'windows-owned-process.ps1')
const WINDOWS_OWNED_PID_PATTERN = /^\[H2_SENTINEL_OWNED_PID\] (Analytics|Web) (\d+)$/
const WINDOWS_OWNED_EXIT_PATTERN = /^\[H2_SENTINEL_OWNED_EXIT\] (Analytics|Web) (\d+) (\d+)$/
const NOOP_LIFECYCLE_HOOKS = Object.freeze({
  afterAnalyticsHealth: () => Promise.resolve(),
})

class LauncherError extends Error {
  constructor(message) {
    super(message)
    this.name = 'LauncherError'
  }
}

export function parseLauncherArguments(argumentsList) {
  const values = new Map()
  let readyJson = false

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index]
    if (argument === '--ready-json') {
      if (readyJson) throw new LauncherError('--ready-json may be provided only once.')
      readyJson = true
      continue
    }
    if (
      argument !== '--mode' &&
      argument !== '--web-port' &&
      argument !== '--analytics-port' &&
      argument !== '--external-sidecar-url' &&
      argument !== '--health-timeout-ms' &&
      argument !== '--web-runtime'
    ) {
      throw new LauncherError(`Unsupported launcher option: ${String(argument)}`)
    }
    if (values.has(argument)) {
      throw new LauncherError(`${argument} may be provided only once.`)
    }
    const value = argumentsList[index + 1]
    if (value === undefined || value.startsWith('--')) {
      throw new LauncherError(`${argument} requires a value.`)
    }
    values.set(argument, value)
    index += 1
  }

  const mode = values.get('--mode')
  if (mode !== 'fixture' && mode !== 'local') {
    throw new LauncherError('--mode must be fixture or local.')
  }
  const webRuntime = values.get('--web-runtime') ?? 'dev'
  if (webRuntime !== 'dev' && webRuntime !== 'preview') {
    throw new LauncherError('--web-runtime must be dev or preview.')
  }
  const webPort = parsePort(values.get('--web-port') ?? String(DEFAULT_WEB_PORT), '--web-port')
  const analyticsPortWasProvided = values.has('--analytics-port')
  const analyticsPort = parsePort(
    values.get('--analytics-port') ?? String(DEFAULT_ANALYTICS_PORT),
    '--analytics-port',
  )
  const healthTimeoutMs = parseBoundedInteger(
    values.get('--health-timeout-ms') ?? String(DEFAULT_HEALTH_TIMEOUT_MS),
    '--health-timeout-ms',
    MIN_HEALTH_TIMEOUT_MS,
    MAX_HEALTH_TIMEOUT_MS,
  )
  const externalSidecarUrlInput = values.get('--external-sidecar-url')
  if (mode === 'fixture' && externalSidecarUrlInput !== undefined) {
    throw new LauncherError('--external-sidecar-url is available only in local mode.')
  }
  if (externalSidecarUrlInput !== undefined && analyticsPortWasProvided) {
    throw new LauncherError('--external-sidecar-url and --analytics-port cannot be combined.')
  }
  const externalSidecarUrl =
    externalSidecarUrlInput === undefined
      ? null
      : parseExternalSidecarUrl(externalSidecarUrlInput)
  const effectiveAnalyticsPort =
    externalSidecarUrl === null
      ? analyticsPort
      : Number(new URL(externalSidecarUrl).port)

  if (mode === 'local' && webPort === effectiveAnalyticsPort) {
    throw new LauncherError('Web and analytics ports must be different.')
  }

  return Object.freeze({
    mode,
    webPort,
    analyticsPort: effectiveAnalyticsPort,
    externalSidecarUrl,
    healthTimeoutMs,
    readyJson,
    webRuntime,
  })
}

function parsePort(input, option) {
  return parseBoundedInteger(input, option, MIN_PORT, MAX_PORT)
}

function parseBoundedInteger(input, option, minimum, maximum) {
  if (!/^\d+$/.test(input)) {
    throw new LauncherError(`${option} must be a decimal integer.`)
  }
  const value = Number(input)
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new LauncherError(`${option} must be between ${minimum} and ${maximum}.`)
  }
  return value
}

function parseExternalSidecarUrl(input) {
  let url
  try {
    url = new URL(input)
  } catch {
    throw new LauncherError('--external-sidecar-url must be a valid URL.')
  }
  if (
    url.protocol !== 'http:' ||
    url.hostname !== LOOPBACK_HOST ||
    url.port === '' ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new LauncherError(
      '--external-sidecar-url must match http://127.0.0.1:<port>/.',
    )
  }
  parsePort(url.port, '--external-sidecar-url port')
  const canonicalUrl = `http://${LOOPBACK_HOST}:${url.port}/`
  if (input !== canonicalUrl) {
    throw new LauncherError(
      '--external-sidecar-url must use the canonical literal 127.0.0.1 URL.',
    )
  }
  return canonicalUrl
}

export function isHealthyAnalyticsEnvelope(value) {
  if (!isRecord(value) || !hasExactKeys(value, HEALTH_ENVELOPE_KEYS)) return false
  if (value.ok !== true || value.status !== 'success') return false
  if (!Array.isArray(value.warnings) || value.warnings.length !== 0) return false
  if (!isRecord(value.data) || !hasExactKeys(value.data, HEALTH_DATA_KEYS)) return false
  if (value.data.status !== 'healthy') return false
  if (value.data.namespace !== API_NAMESPACE || value.data.bindHost !== LOOPBACK_HOST) {
    return false
  }
  if (!HEALTH_VERSION_KEYS.every((key) => isStableVersion(value.data[key]))) return false
  return isCanonicalHealthProvenance(value.provenance, value.data)
}

function isCanonicalHealthProvenance(value, healthData) {
  return (
    isRecord(value) &&
    hasExactKeys(value, HEALTH_PROVENANCE_KEYS) &&
    value.mode === 'RULE' &&
    value.source === 'h2-analytics-api' &&
    isNonEmptyString(value.generatedAt) &&
    isStableVersion(value.ruleVersion) &&
    value.ruleVersion === healthData.ruleVersion &&
    isStableVersion(value.configurationVersion) &&
    value.configurationVersion === healthData.configurationVersion &&
    Array.isArray(value.limitations) &&
    value.limitations.every(isNonEmptyString)
  )
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value, expectedKeys) {
  const actualKeys = Object.keys(value)
  return (
    actualKeys.length === expectedKeys.length &&
    expectedKeys.every((key) => Object.hasOwn(value, key))
  )
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
}

function isStableVersion(value) {
  return isNonEmptyString(value) && STABLE_VERSION_PATTERN.test(value)
}

async function assertPortAvailable(port, label) {
  await new Promise((resolvePromise, rejectPromise) => {
    const server = createServer()
    server.unref()
    server.once('error', (error) => {
      const detail = error && error.code === 'EADDRINUSE' ? 'is already in use' : 'is unavailable'
      rejectPromise(
        new LauncherError(
          `${label} port ${port} ${detail} on ${LOOPBACK_HOST}. Choose another ${label.toLowerCase()} port.`,
        ),
      )
    })
    server.listen({ host: LOOPBACK_HOST, port, exclusive: true }, () => {
      server.close((error) => {
        if (error) rejectPromise(new LauncherError(`${label} port ${port} could not be released.`))
        else resolvePromise()
      })
    })
  })
}

function spawnOwnedProcess(label, port, command, argumentsList, options, windowsOptions = {}) {
  const usesWindowsWrapper = process.platform === 'win32'
  const wrapperArguments = [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    windowsOwnedProcessWrapper,
    '-Role',
    label,
    '-Port',
    String(port),
  ]
  if (label === 'Web') {
    wrapperArguments.push('-WebRuntime', windowsOptions.webRuntime)
  }
  const child = spawn(
    usesWindowsWrapper ? 'powershell.exe' : command,
    usesWindowsWrapper ? wrapperArguments : argumentsList,
    {
      ...options,
      detached: process.platform !== 'win32',
      shell: false,
      stdio: usesWindowsWrapper ? ['inherit', 'pipe', 'inherit'] : 'inherit',
      windowsHide: true,
    },
  )
  let resolveManagedPid
  let resolveTerminal
  const managedPidPromise = new Promise((resolvePromise) => {
    resolveManagedPid = resolvePromise
  })
  const terminalPromise = new Promise((resolvePromise) => {
    resolveTerminal = resolvePromise
  })
  const record = {
    label,
    port,
    child,
    spawnError: null,
    managedPid: usesWindowsWrapper ? null : child.pid ?? null,
    wrapperPid: usesWindowsWrapper ? child.pid ?? null : null,
    terminal: null,
    managedPidPromise,
    terminalPromise,
  }
  if (record.managedPid !== null) resolveManagedPid(record.managedPid)

  const settleTerminal = (terminal) => {
    if (record.terminal !== null) return
    record.terminal = terminal
    if (record.managedPid === null) resolveManagedPid(null)
    resolveTerminal(record)
  }
  child.once('error', (error) => {
    record.spawnError = error
    settleTerminal({ kind: 'error', error })
  })
  child.once('exit', (code, signal) => {
    settleTerminal({ kind: 'exit', code, signal })
  })
  if (usesWindowsWrapper) {
    captureWindowsManagedPid(record, resolveManagedPid, settleTerminal)
  }
  return record
}

function captureWindowsManagedPid(record, resolveManagedPid, settleTerminal) {
  let pending = ''
  const forwardLine = (line) => {
    const pidMatch = WINDOWS_OWNED_PID_PATTERN.exec(line)
    if (pidMatch) {
      if (pidMatch[1] !== record.label || record.managedPid !== null) {
        const error = new Error('Windows ownership wrapper emitted an invalid PID record.')
        record.spawnError = error
        settleTerminal({ kind: 'error', error })
        try {
          record.child.kill('SIGKILL')
        } catch {
          // The invalid wrapper may already have exited.
        }
        return
      }
      record.managedPid = Number(pidMatch[2])
      resolveManagedPid(record.managedPid)
      return
    }
    const exitMatch = WINDOWS_OWNED_EXIT_PATTERN.exec(line)
    if (exitMatch) {
      if (
        exitMatch[1] !== record.label ||
        Number(exitMatch[2]) !== record.managedPid
      ) {
        const error = new Error('Windows ownership wrapper emitted an invalid exit record.')
        record.spawnError = error
        settleTerminal({ kind: 'error', error })
      } else {
        settleTerminal({ kind: 'exit', code: Number(exitMatch[3]), signal: null })
      }
      return
    }
    process.stdout.write(`${line}\n`)
  }
  record.child.stdout.setEncoding('utf8')
  record.child.stdout.on('data', (chunk) => {
    pending += chunk
    const lines = pending.split(/\r?\n/)
    pending = lines.pop() ?? ''
    for (const line of lines) forwardLine(line)
  })
  record.child.stdout.on('end', () => {
    if (pending) forwardLine(pending)
  })
}

export function childFailure(record, phase) {
  const endpoint = `${LOOPBACK_HOST}:${record.port}`
  if (record.spawnError) {
    if (record.label === 'Analytics') {
      return new LauncherError(
        `Analytics could not start on ${endpoint}. uv is required for local mode; install uv and sync the locked dev environment.`,
      )
    }
    return new LauncherError(
      `Web could not start on ${endpoint}. Run npm ci and retry with an available --web-port.`,
    )
  }
  const terminal = record.terminal
  const exitCode = terminal?.kind === 'exit' ? terminal.code : record.child.exitCode
  const signalCode = terminal?.kind === 'exit' ? terminal.signal : record.child.signalCode
  if (terminal != null || exitCode !== null || signalCode !== null) {
    const outcome =
      exitCode === null
        ? `signal ${signalCode ?? 'unknown'}`
        : `exit code ${exitCode}`
    return new LauncherError(
      `${record.label} process exited ${phase} on ${endpoint} (${outcome}). Verify the selected ${record.label.toLowerCase()} port is still available.`,
    )
  }
  return null
}

async function waitForAnalyticsHealth(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  const healthUrl = new URL('/health', url)

  while (Date.now() < deadline) {
    try {
      const response = await fetch(healthUrl, {
        redirect: 'error',
        signal: AbortSignal.timeout(1_000),
      })
      if (response.ok && isHealthyAnalyticsEnvelope(await response.json())) return
    } catch {
      // Readiness retries intentionally expose no remote response details.
    }
    await delay(100)
  }

  throw new LauncherError(
    `Analytics health check timed out after ${timeoutMs} ms on ${LOOPBACK_HOST}:${url.port}. Verify that /health returns the canonical healthy success envelope.`,
  )
}

async function waitForWeb(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(1_000),
      })
      if (response.ok && (await response.text()).includes('id="root"')) return
    } catch {
      // Vite may need several polling intervals before accepting requests.
    }
    await delay(100)
  }
  throw new LauncherError(
    `Web readiness timed out after ${timeoutMs} ms on ${LOOPBACK_HOST}:${url.port}. Run npm ci and verify Vite can start.`,
  )
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))
}

function rejectAfter(milliseconds, createError) {
  return new Promise((_, rejectPromise) => {
    const timeout = setTimeout(() => rejectPromise(createError()), milliseconds)
    timeout.unref()
  })
}

async function waitForOwnedProcessStart(record, timeoutMs, ownedProcesses, shutdown) {
  if (record.managedPid !== null) return true
  return waitDuringStartup(
    Promise.race([
      record.managedPidPromise.then((pid) => {
        if (pid === null) throw childFailure(record, 'during ownership bootstrap')
      }),
      rejectAfter(
        timeoutMs,
        () => new LauncherError(
          `${record.label} ownership bootstrap timed out on ${LOOPBACK_HOST}:${record.port}.`,
        ),
      ),
    ]),
    ownedProcesses,
    shutdown,
    'during ownership bootstrap',
  )
}

function waitDuringStartup(operation, records, shutdown, phase) {
  const processFailures = records.map((record) =>
    record.terminalPromise.then(() => {
      throw childFailure(record, phase)
    }),
  )
  return Promise.race([
    operation.then(() => true),
    shutdown.promise.then(() => false),
    ...processFailures,
  ])
}

function assertOwnedProcessesRunning(records, phase) {
  for (const record of records) {
    const failure = childFailure(record, phase)
    if (failure) throw failure
  }
}

function runAndWait(command, argumentsList) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, argumentsList, {
      shell: false,
      stdio: 'ignore',
      windowsHide: true,
    })
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      resolvePromise(result)
    }
    child.once('error', () => finish({ ok: false }))
    child.once('exit', (code) => finish({ ok: code === 0 }))
  })
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return true
  return new Promise((resolvePromise) => {
    const timeout = setTimeout(() => resolvePromise(false), timeoutMs)
    child.once('exit', () => {
      clearTimeout(timeout)
      resolvePromise(true)
    })
  })
}

function isPidRunning(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function waitForPidExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!isPidRunning(pid)) return true
    await delay(25)
  }
  return !isPidRunning(pid)
}

export async function terminatePidTree(pid) {
  if (!pid) return true

  if (process.platform === 'win32') {
    return (await runAndWait('taskkill.exe', ['/PID', String(pid), '/T', '/F'])).ok
  }

  try {
    process.kill(-pid, 'SIGTERM')
  } catch {
    return true
  }
  await delay(3_000)
  try {
    process.kill(-pid, 0)
  } catch {
    return true
  }
  try {
    process.kill(-pid, 'SIGKILL')
  } catch {
    // The process group may have completed between the probe and forced stop.
  }
  return true
}

export async function terminateProcessTree(record) {
  if (process.platform === 'win32' && record.wrapperPid) {
    if (record.child.exitCode === null && record.child.signalCode === null) {
      try {
        record.child.kill('SIGKILL')
      } catch {
        // The wrapper may have exited after the lifecycle probe.
      }
    }
    if (!(await waitForExit(record.child, 2_000))) {
      await terminatePidTree(record.wrapperPid)
    }
    if (record.managedPid && !(await waitForPidExit(record.managedPid, 5_000))) {
      await terminatePidTree(record.managedPid)
    }
    if (record.managedPid && !(await waitForPidExit(record.managedPid, 2_000))) {
      throw new LauncherError(`${record.label} managed process could not be stopped.`)
    }
    if (!(await waitForExit(record.child, 2_000))) {
      throw new LauncherError(`${record.label} ownership wrapper could not be stopped.`)
    }
    return
  }

  const pid = record.child.pid
  if (!pid) return
  await terminatePidTree(pid)
  if (!(await waitForExit(record.child, 2_000))) {
    try {
      record.child.kill('SIGKILL')
    } catch {
      // The process may have completed after tree cleanup.
    }
  }
  if (!(await waitForExit(record.child, 2_000))) {
    throw new LauncherError(`${record.label} process tree could not be stopped.`)
  }
}

async function stopOwnedProcesses(records) {
  const errors = []
  for (const record of [...records].reverse()) {
    try {
      await terminateProcessTree(record)
    } catch (error) {
      errors.push(error)
    }
  }
  if (errors.length > 0) {
    throw new LauncherError('One or more child process trees could not be stopped.')
  }
}

function waitForShutdownOrChildExit(records, shutdown) {
  const exits = records.map(
    (record) => record.terminalPromise.then(() => {
      if (shutdown.requested) return
      throw childFailure(record, 'unexpectedly')
    }),
  )
  return Promise.race([shutdown.promise, ...exits])
}

function createShutdownSignal() {
  let resolveShutdown
  const shutdown = {
    requested: false,
    promise: new Promise((resolvePromise) => {
      resolveShutdown = resolvePromise
    }),
    request() {
      if (shutdown.requested) return
      shutdown.requested = true
      resolveShutdown()
    },
  }
  return shutdown
}

export async function runLauncher(options, lifecycleHooks = NOOP_LIFECYCLE_HOOKS) {
  if (!existsSync(viteEntry)) {
    throw new LauncherError('Vite is unavailable. Run npm ci before starting H2 Sentinel.')
  }
  if (options.webRuntime === 'preview' && !existsSync(productionIndex)) {
    throw new LauncherError('The production Web build is unavailable. Run npm run h2:build first.')
  }

  await assertPortAvailable(options.webPort, 'Web')
  if (options.mode === 'local' && options.externalSidecarUrl === null) {
    await assertPortAvailable(options.analyticsPort, 'Analytics')
  }

  const ownedProcesses = []
  const shutdown = createShutdownSignal()
  const requestShutdown = () => shutdown.request()
  const requestIpcShutdown = (message) => {
    if (
      typeof message === 'object' &&
      message !== null &&
      message.type === 'shutdown'
    ) {
      shutdown.request()
    }
  }
  process.on('SIGINT', requestShutdown)
  process.on('SIGTERM', requestShutdown)
  process.on('message', requestIpcShutdown)

  try {
    let analyticsProcess = null
    let analyticsUrl = null
    if (options.mode === 'local') {
      analyticsUrl =
        options.externalSidecarUrl ?? `http://${LOOPBACK_HOST}:${options.analyticsPort}/`
      if (options.externalSidecarUrl === null) {
        analyticsProcess = spawnOwnedProcess(
          'Analytics',
          options.analyticsPort,
          'uv',
          [
            'run',
            '--locked',
            '--extra',
            'dev',
            'python',
            '-m',
            'h2_analytics',
            '--port',
            String(options.analyticsPort),
          ],
          { cwd: analyticsDirectory, env: process.env },
        )
        ownedProcesses.push(analyticsProcess)
        if (!(await waitForOwnedProcessStart(
          analyticsProcess,
          options.healthTimeoutMs,
          ownedProcesses,
          shutdown,
        ))) return
      }
      if (!(await waitDuringStartup(
        waitForAnalyticsHealth(analyticsUrl, options.healthTimeoutMs),
        ownedProcesses,
        shutdown,
        'before analytics readiness',
      ))) return
      if (analyticsProcess) {
        if (!(await waitDuringStartup(
          lifecycleHooks.afterAnalyticsHealth({
            analyticsPid: analyticsProcess.managedPid,
          }),
          ownedProcesses,
          shutdown,
          'after analytics readiness',
        ))) return
      }
    }

    const webEnvironment = { ...process.env }
    delete webEnvironment.H2_SENTINEL_ANALYTICS_PORT
    if (options.mode === 'local') {
      webEnvironment.H2_SENTINEL_ANALYTICS_PORT = String(options.analyticsPort)
    }
    const viteArguments =
      options.webRuntime === 'preview'
        ? ['preview', 'apps/web']
        : ['apps/web']
    viteArguments.push(
      '--config',
      'vite.config.ts',
      '--host',
      LOOPBACK_HOST,
      '--strictPort',
      '--port',
      String(options.webPort),
    )
    const webProcess = spawnOwnedProcess(
      'Web',
      options.webPort,
      process.execPath,
      [viteEntry, ...viteArguments],
      { cwd: repositoryRoot, env: webEnvironment },
      { webRuntime: options.webRuntime },
    )
    ownedProcesses.push(webProcess)
    if (!(await waitForOwnedProcessStart(
      webProcess,
      options.healthTimeoutMs,
      ownedProcesses,
      shutdown,
    ))) return

    const webUrl = new URL(
      `/h2-sentinel/?mode=${options.mode}`,
      `http://${LOOPBACK_HOST}:${options.webPort}/`,
    )
    if (!(await waitDuringStartup(
      waitForWeb(webUrl, options.healthTimeoutMs),
      ownedProcesses,
      shutdown,
      'before Web readiness',
    ))) return

    const lifecycle = waitForShutdownOrChildExit(ownedProcesses, shutdown)
    if (!(await waitDuringStartup(
      new Promise((resolvePromise) => setImmediate(resolvePromise)),
      ownedProcesses,
      shutdown,
      'before READY',
    ))) return
    assertOwnedProcessesRunning(ownedProcesses, 'before READY')

    const readyRecord = {
      event: 'READY',
      mode: options.mode,
      webUrl: webUrl.href,
      analyticsUrl,
      webPid: webProcess.managedPid,
      analyticsPid: analyticsProcess?.managedPid ?? null,
    }
    console.log(options.readyJson ? JSON.stringify(readyRecord) : `READY ${JSON.stringify(readyRecord)}`)
    await lifecycle
  } finally {
    process.removeListener('SIGINT', requestShutdown)
    process.removeListener('SIGTERM', requestShutdown)
    process.removeListener('message', requestIpcShutdown)
    await stopOwnedProcesses(ownedProcesses)
  }
}

async function main() {
  try {
    const options = parseLauncherArguments(process.argv.slice(2))
    await runLauncher(options)
  } catch (error) {
    const message = error instanceof LauncherError ? error.message : 'Launcher failed unexpectedly.'
    console.error(`[H2 Sentinel] ${message}`)
    process.exitCode = 1
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main()
}

export { API_NAMESPACE, LauncherError, LOOPBACK_HOST }
