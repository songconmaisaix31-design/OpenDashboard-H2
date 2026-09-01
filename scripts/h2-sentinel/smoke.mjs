import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { createServer } from 'node:net'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { terminatePidTree } from './launch.mjs'

const LOOPBACK_HOST = '127.0.0.1'
const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '../..')
const launcherPath = resolve(scriptDirectory, 'launch.mjs')
const adversarialLauncherPath = resolve(scriptDirectory, 'adversarial-launch.mjs')
const artifactDirectory = resolve(scriptDirectory, 'artifacts')
const fixtureCsvPath = resolve(
  repositoryRoot,
  'packages/h2-contracts/fixtures/tiny-valid-timeseries.csv',
)

const activeLaunchers = new Set()

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
      () => rejectPromise(new Error('Child process exit timed out.')),
      timeoutMs,
    )
    child.once('exit', (code, signal) => {
      clearTimeout(timeout)
      resolvePromise({ code, signal })
    })
  })
}

async function startLauncher(argumentsList) {
  const stdout = []
  const stderr = []
  const child = spawn(
    process.execPath,
    [launcherPath, ...argumentsList, '--ready-json'],
    {
      cwd: repositoryRoot,
      env: process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      windowsHide: true,
    },
  )
  activeLaunchers.add(child)
  collectLines(child.stdout, stdout)
  collectLines(child.stderr, stderr)

  const ready = await new Promise((resolvePromise, rejectPromise) => {
    const deadline = setTimeout(() => {
      rejectPromise(new Error(`Launcher readiness timed out: ${stderr.join(' ')}`))
    }, 30_000)
    const inspect = () => {
      for (const line of stdout) {
        try {
          const value = JSON.parse(line)
          if (value.event === 'READY') {
            clearTimeout(deadline)
            resolvePromise(value)
            return
          }
        } catch {
          // Vite and uv output is intentionally ignored by the ready parser.
        }
      }
    }
    const interval = setInterval(inspect, 25)
    child.once('exit', (code) => {
      clearTimeout(deadline)
      clearInterval(interval)
      rejectPromise(
        new Error(`Launcher exited before readiness (${code}): ${stderr.join(' ')}`),
      )
    })
    const originalResolve = resolvePromise
    resolvePromise = (value) => {
      clearInterval(interval)
      originalResolve(value)
    }
  })

  return { child, ready, stderr, stdout }
}

async function stopLauncher(session) {
  if (session.child.exitCode === null && session.child.signalCode === null) {
    session.child.send({ type: 'shutdown' })
  }
  try {
    const result = await waitForExit(session.child, 15_000)
    assert.equal(result.code, 0, `Launcher shutdown failed: ${session.stderr.join(' ')}`)
  } finally {
    activeLaunchers.delete(session.child)
  }
}

function spawnForFailure(argumentsList, withIpc = false, entryPath = launcherPath) {
  const stdout = []
  const stderr = []
  const child = spawn(process.execPath, [entryPath, ...argumentsList, '--ready-json'], {
    cwd: repositoryRoot,
    env: process.env,
    shell: false,
    stdio: withIpc ? ['ignore', 'pipe', 'pipe', 'ipc'] : ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  collectLines(child.stdout, stdout)
  collectLines(child.stderr, stderr)
  return { child, stderr, stdout }
}

async function getFreePort() {
  return new Promise((resolvePromise, rejectPromise) => {
    const server = createServer()
    server.once('error', rejectPromise)
    server.listen({ host: LOOPBACK_HOST, port: 0 }, () => {
      const address = server.address()
      assert.ok(address && typeof address === 'object')
      const port = address.port
      server.close((error) => (error ? rejectPromise(error) : resolvePromise(port)))
    })
  })
}

async function assertPortReleased(port) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    try {
      const server = createServer()
      await new Promise((resolvePromise, rejectPromise) => {
        server.once('error', rejectPromise)
        server.listen({ host: LOOPBACK_HOST, port, exclusive: true }, resolvePromise)
      })
      await new Promise((resolvePromise) => server.close(resolvePromise))
      return
    } catch {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100))
    }
  }
  assert.fail(`Loopback port ${port} was not released.`)
}

async function assertPidStopped(pid) {
  assert.equal(typeof pid, 'number')
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0)
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100))
    } catch {
      return
    }
  }
  assert.fail(`Owned process ${pid} was not stopped.`)
}

async function runCaptured(command, argumentsList) {
  const stdout = []
  const stderr = []
  const child = spawn(command, argumentsList, {
    cwd: repositoryRoot,
    env: process.env,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  collectLines(child.stdout, stdout)
  collectLines(child.stderr, stderr)
  const result = await waitForExit(child, 10_000)
  assert.equal(result.code, 0, `${command} process query failed: ${stderr.join(' ')}`)
  return stdout.join('\n')
}

async function terminateDirectProcess(pid) {
  if (process.platform === 'win32') {
    await runCaptured('taskkill.exe', ['/PID', String(pid), '/F'])
    return
  }
  process.kill(pid, 'SIGKILL')
}

async function listProcesses() {
  if (process.platform === 'win32') {
    const output = await runCaptured('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Json -Compress',
    ])
    const parsed = JSON.parse(output)
    return (Array.isArray(parsed) ? parsed : [parsed]).map((entry) => ({
      pid: Number(entry.ProcessId),
      parentPid: Number(entry.ParentProcessId),
      name: String(entry.Name),
    }))
  }

  const output = await runCaptured('ps', ['-eo', 'pid=,ppid=,comm='])
  return output
    .split(/\r?\n/)
    .map((line) => /^(\s*\d+)\s+(\d+)\s+(.+)$/.exec(line))
    .filter(Boolean)
    .map((match) => ({
      pid: Number(match[1]),
      parentPid: Number(match[2]),
      name: match[3].trim(),
    }))
}

async function listDescendants(rootPid) {
  const processes = await listProcesses()
  const descendants = []
  const knownParents = new Set([rootPid])
  let foundNewProcess = true
  while (foundNewProcess) {
    foundNewProcess = false
    for (const processEntry of processes) {
      if (
        knownParents.has(processEntry.parentPid) &&
        !knownParents.has(processEntry.pid)
      ) {
        knownParents.add(processEntry.pid)
        descendants.push(processEntry)
        foundNewProcess = true
      }
    }
  }
  return descendants
}

async function requestEnvelope(baseUrl, route, payload) {
  const response = await fetch(new URL(route, baseUrl), {
    method: payload === undefined ? 'GET' : 'POST',
    ...(payload === undefined
      ? {}
      : {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        }),
    signal: AbortSignal.timeout(5_000),
  })
  const body = await response.json()
  assert.equal(response.ok, true, `Request ${route} returned HTTP ${response.status}.`)
  assert.equal(body.ok, true)
  assert.ok(body.status === 'success' || body.status === 'warning')
  return body.data
}

function canonicalHealthEnvelope() {
  return {
    ok: true,
    status: 'success',
    data: {
      status: 'healthy',
      apiVersion: 'v1',
      serviceVersion: '0.1.0',
      featureVersion: 'h2-features-v1',
      aggregationVersion: 'h2-events-v1',
      ruleVersion: 'h2-rules-v1',
      configurationVersion: 'official-constraints-v1',
      namespace: '/api/v1/h2-sentinel',
      bindHost: LOOPBACK_HOST,
      detectorVersion: 'deterministic-c03-c04-v1',
    },
    warnings: [],
    provenance: {
      mode: 'RULE',
      source: 'h2-analytics-api',
      generatedAt: '2026-08-19T00:00:00Z',
      ruleVersion: 'h2-rules-v1',
      configurationVersion: 'official-constraints-v1',
      limitations: ['Loopback-only deterministic API metadata.'],
    },
  }
}

async function runFixtureSmoke() {
  const webPort = await getFreePort()
  const session = await startLauncher([
    '--mode',
    'fixture',
    '--web-port',
    String(webPort),
  ])
  try {
    assert.deepEqual(Object.keys(session.ready).sort(), [
      'analyticsPid',
      'analyticsUrl',
      'event',
      'mode',
      'webPid',
      'webUrl',
    ])
    assert.equal(session.ready.mode, 'fixture')
    assert.equal(session.ready.analyticsUrl, null)
    assert.equal(session.ready.analyticsPid, null)
    assert.match(session.ready.webUrl, /^http:\/\/127\.0\.0\.1:\d+\/h2-sentinel\/\?mode=fixture$/)
    const response = await fetch(session.ready.webUrl, { signal: AbortSignal.timeout(5_000) })
    assert.equal(response.ok, true)
  } finally {
    await stopLauncher(session)
  }
  await assertPidStopped(session.ready.webPid)
  await assertPortReleased(webPort)
  console.log('PASS launcher fixture mode starts no analytics process and cleans Web shutdown')
}

async function runOccupiedPortSmoke() {
  const port = await getFreePort()
  const blocker = createServer()
  await new Promise((resolvePromise, rejectPromise) => {
    blocker.once('error', rejectPromise)
    blocker.listen({ host: LOOPBACK_HOST, port }, resolvePromise)
  })
  try {
    const session = spawnForFailure(['--mode', 'fixture', '--web-port', String(port)])
    const result = await waitForExit(session.child, 10_000)
    assert.equal(result.code, 1)
    assert.match(session.stderr.join(' '), /already in use/)
  } finally {
    await new Promise((resolvePromise) => blocker.close(resolvePromise))
  }
  console.log('PASS launcher rejects an occupied Web port with an actionable error')
}

async function runHealthTimeoutSmoke() {
  const webPort = await getFreePort()
  const port = await getFreePort()
  const unhealthy = createHttpServer((request, response) => {
    if (request.url === '/health') {
      response.writeHead(302, { location: '/redirected-healthy' })
      response.end()
      return
    }
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify(canonicalHealthEnvelope()))
  })
  await new Promise((resolvePromise, rejectPromise) => {
    unhealthy.once('error', rejectPromise)
    unhealthy.listen({ host: LOOPBACK_HOST, port }, resolvePromise)
  })
  try {
    const session = spawnForFailure([
      '--mode',
      'local',
      '--web-port',
      String(webPort),
      '--external-sidecar-url',
      `http://${LOOPBACK_HOST}:${port}/`,
      '--health-timeout-ms',
      '500',
    ])
    const result = await waitForExit(session.child, 10_000)
    assert.equal(result.code, 1)
    assert.match(session.stderr.join(' '), /health check timed out/)
    assert.doesNotMatch(session.stdout.join(' '), /"event":"READY"/)
  } finally {
    await new Promise((resolvePromise) => unhealthy.close(resolvePromise))
  }
  await assertPortReleased(webPort)
  console.log('PASS launcher rejects a redirecting external sidecar health endpoint')
}

async function runUntrustedHealthImplementationSmoke() {
  const webPort = await getFreePort()
  const port = await getFreePort()
  let responseBody = null
  const untrusted = createHttpServer((request, response) => {
    if (request.url !== '/health') {
      response.writeHead(404)
      response.end()
      return
    }
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify(responseBody))
  })
  await new Promise((resolvePromise, rejectPromise) => {
    untrusted.once('error', rejectPromise)
    untrusted.listen({ host: LOOPBACK_HOST, port }, resolvePromise)
  })
  try {
    const cases = [
      ['incomplete envelope', { ok: true, status: 'success', data: { status: 'healthy' } }],
      ['wrong namespace', (() => {
        const value = canonicalHealthEnvelope()
        value.data.namespace = '/api/v1/other'
        return value
      })()],
      ['hostname alias', (() => {
        const value = canonicalHealthEnvelope()
        value.data.bindHost = 'localhost'
        return value
      })()],
      ['extra top-level field', { ...canonicalHealthEnvelope(), extra: true }],
    ]
    for (const [label, value] of cases) {
      responseBody = value
      const session = spawnForFailure([
        '--mode',
        'local',
        '--web-port',
        String(webPort),
        '--external-sidecar-url',
        `http://${LOOPBACK_HOST}:${port}/`,
        '--health-timeout-ms',
        '500',
      ])
      const result = await waitForExit(session.child, 10_000)
      assert.equal(result.code, 1, label)
      assert.match(session.stderr.join(' '), /health check timed out/, label)
      assert.doesNotMatch(session.stdout.join(' '), /"event":"READY"/, label)
    }
  } finally {
    await new Promise((resolvePromise) => untrusted.close(resolvePromise))
  }
  await assertPortReleased(webPort)
  await assertPortReleased(port)
  console.log('PASS launcher rejects incomplete, wrong-origin, and extra-field health lookalikes')
}

async function runCanonicalExternalSidecarSmoke() {
  const webPort = await getFreePort()
  const analyticsPort = await getFreePort()
  const sidecar = createHttpServer((request, response) => {
    if (request.url !== '/health') {
      response.writeHead(404)
      response.end()
      return
    }
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify(canonicalHealthEnvelope()))
  })
  await new Promise((resolvePromise, rejectPromise) => {
    sidecar.once('error', rejectPromise)
    sidecar.listen({ host: LOOPBACK_HOST, port: analyticsPort }, resolvePromise)
  })

  let session
  try {
    session = await startLauncher([
      '--mode',
      'local',
      '--web-port',
      String(webPort),
      '--external-sidecar-url',
      `http://${LOOPBACK_HOST}:${analyticsPort}/`,
    ])
    assert.equal(session.ready.analyticsUrl, `http://${LOOPBACK_HOST}:${analyticsPort}/`)
    assert.equal(session.ready.analyticsPid, null)
  } finally {
    try {
      if (session) await stopLauncher(session)
    } finally {
      await new Promise((resolvePromise) => sidecar.close(resolvePromise))
    }
  }
  await assertPidStopped(session.ready.webPid)
  await assertPortReleased(webPort)
  await assertPortReleased(analyticsPort)
  console.log('PASS launcher accepts a canonical external sidecar without claiming ownership')
}

async function runOccupiedAnalyticsPortSmoke() {
  const webPort = await getFreePort()
  const analyticsPort = await getFreePort()
  const blocker = createServer()
  await new Promise((resolvePromise, rejectPromise) => {
    blocker.once('error', rejectPromise)
    blocker.listen({ host: LOOPBACK_HOST, port: analyticsPort }, resolvePromise)
  })
  try {
    const session = spawnForFailure([
      '--mode',
      'local',
      '--web-port',
      String(webPort),
      '--analytics-port',
      String(analyticsPort),
    ])
    const result = await waitForExit(session.child, 10_000)
    assert.equal(result.code, 1)
    assert.match(
      session.stderr.join(' '),
      new RegExp(`Analytics port ${analyticsPort} is already in use`),
    )
  } finally {
    await new Promise((resolvePromise) => blocker.close(resolvePromise))
  }
  console.log('PASS launcher rejects an occupied analytics port with its exact role and port')
}

async function runAnalyticsExitBeforeReadySmoke() {
  const webPort = await getFreePort()
  const analyticsPort = await getFreePort()
  const session = spawnForFailure([
    '--mode',
    'local',
    '--web-port',
    String(webPort),
    '--analytics-port',
    String(analyticsPort),
  ], true, adversarialLauncherPath)
  const observedPids = new Set([session.child.pid])
  let auditCompleted = false
  let primaryError = null
  try {
    let terminationStarted = false
    let resolveAnalyticsHealthy
    let rejectAnalyticsHealthy
    const analyticsHealthy = new Promise((resolvePromise, rejectPromise) => {
      resolveAnalyticsHealthy = resolvePromise
      rejectAnalyticsHealthy = rejectPromise
    })
    const healthTimeout = setTimeout(
      () => rejectAnalyticsHealthy(new Error('Launcher did not report analytics health before READY.')),
      15_000,
    )
    const terminateAfterHealth = async (healthRecord) => {
      if (terminationStarted) return
      terminationStarted = true
      clearTimeout(healthTimeout)
      try {
        const descendants = await listDescendants(session.child.pid)
        for (const processEntry of descendants) observedPids.add(processEntry.pid)
        assert.equal(
          descendants.some((processEntry) => processEntry.pid === healthRecord.analyticsPid),
          true,
          'Launcher reported an Analytics PID outside its owned process tree.',
        )
        await terminateDirectProcess(healthRecord.analyticsPid)
        resolveAnalyticsHealthy(healthRecord)
      } catch (error) {
        rejectAnalyticsHealthy(error)
      }
    }
    const observeAnalyticsHealth = (message) => {
      if (message?.type !== 'analytics-healthy') return
      void terminateAfterHealth(message)
    }
    session.child.on('message', observeAnalyticsHealth)
    let healthRecord
    try {
      healthRecord = await analyticsHealthy
    } finally {
      clearTimeout(healthTimeout)
      session.child.removeListener('message', observeAnalyticsHealth)
    }
    assert.equal(observedPids.has(healthRecord.analyticsPid), true)

    const result = await waitForExit(session.child, 15_000)
    assert.notEqual(result.code, 0)
    assert.doesNotMatch(session.stdout.join(' '), /"event":"READY"/)
    for (const pid of observedPids) await assertPidStopped(pid)
    await assertPortReleased(webPort)
    await assertPortReleased(analyticsPort)
    auditCompleted = true
  } catch (error) {
    primaryError = error
    throw error
  } finally {
    if (!auditCompleted) {
      const cleanupErrors = []
      for (const pid of [...observedPids].reverse()) {
        try {
          await terminatePidTree(pid)
        } catch (error) {
          cleanupErrors.push(error)
        }
      }
      if (primaryError === null && cleanupErrors.length > 0) {
        throw new AggregateError(cleanupErrors, 'Adversarial fallback cleanup failed.')
      }
    }
  }
  console.log('PASS launcher rejects analytics wrapper exit after health and before Web readiness without leaking owned processes')
}

async function runSubmissionValidator(submissionPath) {
  const validatorInput = relative(repositoryRoot, submissionPath)
  const child = spawn(
    'uv',
    [
      'run',
      '--project',
      'services/h2-analytics',
      '--locked',
      '--extra',
      'dev',
      'python',
      '-m',
      'h2_analytics.tools.validate_submission',
      validatorInput,
    ],
    {
      cwd: repositoryRoot,
      env: process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  )
  const stderr = []
  collectLines(child.stderr, stderr)
  const result = await waitForExit(child, 30_000)
  assert.equal(result.code, 0, `Submission validation failed: ${stderr.join(' ')}`)
}

async function runLocalGoldenSmoke() {
  const webPort = await getFreePort()
  const analyticsPort = await getFreePort()
  const session = await startLauncher([
    '--mode',
    'local',
    '--web-port',
    String(webPort),
    '--analytics-port',
    String(analyticsPort),
  ])
  try {
    assert.equal(session.ready.mode, 'local')
    assert.match(session.ready.webUrl, /^http:\/\/127\.0\.0\.1:\d+\/h2-sentinel\/\?mode=local$/)
    assert.equal(session.ready.analyticsUrl, `http://${LOOPBACK_HOST}:${analyticsPort}/`)
    assert.equal(typeof session.ready.analyticsPid, 'number')

    const fixtureText = await readFile(fixtureCsvPath, 'utf8')
    const imported = await requestEnvelope(
      session.ready.webUrl,
      '/api/v1/h2-sentinel/datasets:import',
      { filename: 'tiny-valid-timeseries.csv', text: fixtureText },
    )
    const run = await requestEnvelope(
      session.ready.webUrl,
      '/api/v1/h2-sentinel/datasets:analyze',
      { datasetId: imported.dataset.datasetId },
    )
    assert.deepEqual(
      run.events.map((event) => event.code),
      ['C03', 'C04'],
    )
    const c03 = run.events.find((event) => event.code === 'C03')
    assert.ok(c03)

    const assistant = await requestEnvelope(
      session.ready.webUrl,
      '/api/v1/h2-sentinel/assistant:ask',
      {
        runId: run.runId,
        questionId: 'Q03',
        eventId: c03.eventId,
        allowLlmRendering: false,
      },
    )
    assert.notEqual(assistant.mode, 'LLM_RENDERED')

    const report = await requestEnvelope(
      session.ready.webUrl,
      '/api/v1/h2-sentinel/reports:export',
      { runId: run.runId, kind: 'single_event_diagnosis', eventId: c03.eventId },
    )
    const submission = await requestEnvelope(
      session.ready.webUrl,
      '/api/v1/h2-sentinel/submissions:export',
      { runId: run.runId },
    )
    assert.equal(report.mediaType, 'text/html')
    assert.equal(submission.mediaType, 'text/csv')
    assert.doesNotMatch(
      `${report.content}\n${submission.content}`,
      /(?:[A-Za-z]:\\|\/home\/|authorization:|api[_-]?key|password)/i,
    )

    await mkdir(artifactDirectory, { recursive: true })
    const reportPath = resolve(artifactDirectory, 'C03-diagnosis.html')
    const submissionPath = resolve(artifactDirectory, 'submission.csv')
    await writeFile(reportPath, report.content, 'utf8')
    await writeFile(submissionPath, submission.content, 'utf8')
    await runSubmissionValidator(submissionPath)
  } finally {
    await stopLauncher(session)
  }
  await assertPidStopped(session.ready.webPid)
  await assertPidStopped(session.ready.analyticsPid)
  await assertPortReleased(webPort)
  await assertPortReleased(analyticsPort)
  console.log('PASS launcher local golden path, no-LLM assistant, C03 HTML, submission CSV, and shutdown cleanup')
}

async function runLocalPreviewProxySmoke() {
  const webPort = await getFreePort()
  const analyticsPort = await getFreePort()
  const session = await startLauncher([
    '--mode',
    'local',
    '--web-runtime',
    'preview',
    '--web-port',
    String(webPort),
    '--analytics-port',
    String(analyticsPort),
  ])
  try {
    const mode = await requestEnvelope(
      session.ready.webUrl,
      '/api/v1/h2-sentinel/mode',
      undefined,
    )
    assert.equal(mode, 'LIVE_ANALYSIS')
  } finally {
    await stopLauncher(session)
  }
  await assertPidStopped(session.ready.webPid)
  await assertPidStopped(session.ready.analyticsPid)
  await assertPortReleased(webPort)
  await assertPortReleased(analyticsPort)
  console.log('PASS production preview keeps the local same-origin analytics proxy')
}

try {
  await runFixtureSmoke()
  await runOccupiedPortSmoke()
  await runHealthTimeoutSmoke()
  await runUntrustedHealthImplementationSmoke()
  await runCanonicalExternalSidecarSmoke()
  await runOccupiedAnalyticsPortSmoke()
  await runAnalyticsExitBeforeReadySmoke()
  await runLocalGoldenSmoke()
  await runLocalPreviewProxySmoke()
} finally {
  for (const child of activeLaunchers) {
    if (child.pid) await terminatePidTree(child.pid)
  }
}
