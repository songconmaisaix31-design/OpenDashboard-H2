import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { createServer as createHttpServer, request as httpRequest } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const LOOPBACK = '127.0.0.1'
const directory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(directory, '../../..')
const launcherPath = resolve(repositoryRoot, 'scripts/h2-sentinel/launch.mjs')
const fixtureCsvPath = resolve(repositoryRoot, 'packages/h2-contracts/fixtures/tiny-valid-timeseries.csv')
const mainPath = resolve(repositoryRoot, 'apps/web/src/main.tsx')
const shellPath = resolve(repositoryRoot, 'apps/web/src/features/h2-sentinel/components/common/H2Shell.tsx')
const fixtureDataSourcePath = pathToFileURL(resolve(repositoryRoot, 'plugins/h2-ems/src/fixture-data-source.ts')).href
const webFeaturePath = resolve(repositoryRoot, 'apps/web/src/features/h2-sentinel')
const pluginSourcePath = resolve(repositoryRoot, 'plugins/h2-ems/src')

const assistantQuestionIds = Array.from({ length: 10 }, (_, index) => `Q${String(index + 1).padStart(2, '0')}`)
const diagnosisSections = [
  '报告范围与数据来源',
  '异常概览',
  '证据链',
  '原因判断：事实与推断',
  '影响量化',
  '安全检查',
  '建议与人工确认',
  '人工复核记录',
  '版本与溯源',
  '安全声明与限制',
]

const outcomes = []
const activeLaunchers = new Set()

function safeDetail(error) {
  const detail = error instanceof Error ? error.message : String(error)
  return /(?:[A-Za-z]:\\|\/Users\/|\/home\/|authorization:|api[_-]?key|password|cookie|credential|private[_ -]?key|token|secret|\.env)/i.test(detail)
    ? 'redacted assertion failure'
    : detail.replace(/\s+/g, ' ').slice(0, 240)
}

async function check(id, scope, operation) {
  try {
    await operation()
    outcomes.push({ id, scope, status: 'PASS' })
    console.log(`PASS ${id} — ${scope}`)
  } catch (error) {
    outcomes.push({ id, scope, status: 'FAIL', detail: safeDetail(error) })
    console.error(`FAIL ${id} — ${scope}: ${safeDetail(error)}`)
  }
}

function collectLines(stream, destination) {
  let pending = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    pending += chunk
    const parts = pending.split(/\r?\n/)
    pending = parts.pop() ?? ''
    destination.push(...parts)
  })
  stream.on('end', () => {
    if (pending) destination.push(pending)
  })
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode })
  }
  return new Promise((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(() => rejectPromise(new Error('child exit timed out')), timeoutMs)
    child.once('exit', (code, signal) => {
      clearTimeout(timeout)
      resolvePromise({ code, signal })
    })
  })
}

async function freePort() {
  const server = createNetServer()
  await new Promise((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise)
    server.listen({ host: LOOPBACK, port: 0 }, resolvePromise)
  })
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  await new Promise((resolvePromise, rejectPromise) => server.close((error) => error ? rejectPromise(error) : resolvePromise()))
  return address.port
}

async function assertPortReleased(port) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const server = createNetServer()
    try {
      await new Promise((resolvePromise, rejectPromise) => {
        server.once('error', rejectPromise)
        server.listen({ host: LOOPBACK, port, exclusive: true }, resolvePromise)
      })
      await new Promise((resolvePromise) => server.close(resolvePromise))
      return
    } catch {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100))
    }
  }
  assert.fail('owned loopback port was not released')
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
  assert.fail('owned launcher child did not exit')
}

async function startLauncher(argumentsList) {
  const stdout = []
  const stderr = []
  const child = spawn(process.execPath, [launcherPath, ...argumentsList, '--ready-json'], {
    cwd: repositoryRoot,
    env: process.env,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true,
  })
  activeLaunchers.add(child)
  collectLines(child.stdout, stdout)
  collectLines(child.stderr, stderr)

  const ready = await new Promise((resolvePromise, rejectPromise) => {
    const deadline = setTimeout(() => rejectPromise(new Error('launcher did not become ready')), 30_000)
    const inspect = () => {
      for (const line of stdout) {
        try {
          const parsed = JSON.parse(line)
          if (parsed.event === 'READY') {
            clearTimeout(deadline)
            clearInterval(interval)
            resolvePromise(parsed)
            return
          }
        } catch {
          // Startup diagnostics are deliberately not evidence artifacts.
        }
      }
    }
    const interval = setInterval(inspect, 25)
    child.once('exit', () => {
      clearTimeout(deadline)
      clearInterval(interval)
      rejectPromise(new Error('launcher exited before readiness'))
    })
  })
  return { child, ready, stderr }
}

async function stopLauncher(session) {
  if (session.child.exitCode === null && session.child.signalCode === null) {
    session.child.send({ type: 'shutdown' })
  }
  const result = await waitForExit(session.child, 15_000)
  activeLaunchers.delete(session.child)
  assert.equal(result.code, 0, 'launcher shutdown must exit cleanly')
}

function startExpectedFailure(argumentsList) {
  const stdout = []
  const stderr = []
  const child = spawn(process.execPath, [launcherPath, ...argumentsList, '--ready-json'], {
    cwd: repositoryRoot,
    env: process.env,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  collectLines(child.stdout, stdout)
  collectLines(child.stderr, stderr)
  return { child, stdout, stderr }
}

async function request(baseUrl, route, payload, headers = {}) {
  const response = await fetch(new URL(route, baseUrl), {
    method: payload === undefined ? 'GET' : 'POST',
    headers: payload === undefined ? headers : { 'content-type': 'application/json', ...headers },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    redirect: 'error',
    signal: AbortSignal.timeout(5_000),
  })
  const text = await response.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    assert.fail(`public API response for ${route} was not JSON`)
  }
  return { response, body, text }
}

async function rawHttpRequest(baseUrl, route, headers) {
  const url = new URL(route, baseUrl)
  return new Promise((resolvePromise, rejectPromise) => {
    const request = httpRequest(url, { method: 'GET', headers, timeout: 5_000 }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.once('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        try {
          resolvePromise({
            response: {
              status: response.statusCode ?? 0,
              ok: (response.statusCode ?? 0) >= 200 && (response.statusCode ?? 0) < 300,
            },
            body: JSON.parse(text),
            text,
          })
        } catch {
          rejectPromise(new Error('raw public API response was not JSON'))
        }
      })
    })
    request.once('timeout', () => request.destroy(new Error('raw HTTP request timed out')))
    request.once('error', rejectPromise)
    request.end()
  })
}

function assertSafePublicText(text) {
  assert.doesNotMatch(text, /(?:[A-Za-z]:\\|\\\\|\/(?:Users|home|etc)\/|traceback|authorization:|api[_-]?key|password|cookie|credential|private[_ -]?key|token|secret|\.env)/i)
}

function assertSuccess(result) {
  assert.equal(result.response.ok, true)
  assert.equal(result.body.ok, true)
  assert.ok(result.body.status === 'success' || result.body.status === 'warning')
  return result.body.data
}

function assertRedactedError(result, expectedStatus) {
  assert.equal(result.response.status, expectedStatus)
  assert.equal(result.body.ok, false)
  assert.equal(result.body.status, 'error')
  assert.equal(typeof result.body.error?.code, 'string')
  assert.equal(typeof result.body.error?.message, 'string')
  assert.equal(typeof result.body.error?.retryable, 'boolean')
  assertSafePublicText(result.text)
}

function assertArtifact(artifact, expected) {
  assert.equal(artifact.descriptor.kind, expected.kind)
  assert.equal(artifact.descriptor.format, expected.format)
  assert.equal(artifact.mediaType, expected.mediaType)
  assert.match(artifact.descriptor.filename, expected.filename)
  assert.match(artifact.descriptor.filename, /^[A-Za-z0-9][A-Za-z0-9._-]*$/)
  assert.equal(artifact.descriptor.status, 'ready')
  assert.equal(artifact.descriptor.contentHash, `sha256:${createHash('sha256').update(artifact.content).digest('hex')}`)
  assertSafePublicText(`${artifact.descriptor.safetyDisclaimer}\n${artifact.content}`)
}

function assertChineseHtml(content, requiredSections = []) {
  assert.match(content, /^<!doctype html>/i)
  assert.match(content, /<html lang=["']zh-CN["']>/i)
  assert.match(content, /<meta charset=["']utf-8["']/i)
  assert.match(content, /[\u4e00-\u9fff]/)
  assert.match(content, /所有操作建议均须人工确认/)
  assert.doesNotMatch(content, /<script\b|https?:\/\//i)
  let previousPosition = -1
  for (const section of requiredSections) {
    const position = content.indexOf(section)
    assert.ok(position > previousPosition, `Chinese report section is missing or out of order: ${section}`)
    previousPosition = position
  }
}

function assertAssistantAnswer(answer, expected) {
  assert.equal(answer.schemaVersion, 1)
  assert.equal(answer.runId, expected.runId)
  assert.equal(answer.questionId, expected.questionId)
  assert.equal(answer.mode, 'DETERMINISTIC_TEMPLATE')
  assert.equal(answer.refusedControlClaim, true)
  assert.equal(answer.provenance.mode, 'LIVE_ANALYSIS')
  assert.notEqual(answer.provenance.source, 'sanitized-golden-fixture')
  if (expected.eventId === undefined) {
    assert.equal(answer.eventId, undefined)
  } else {
    assert.equal(answer.eventId, expected.eventId)
  }
  assert.ok(answer.sections.length > 0)
  assert.equal(new Set(answer.sections.map(({ sectionId }) => sectionId)).size, answer.sections.length)
  assert.equal(new Set(answer.citations.map(({ citationId }) => citationId)).size, answer.citations.length)
  const citations = new Map(answer.citations.map((citation) => [citation.citationId, citation]))
  const referenced = new Set()
  for (const section of answer.sections) {
    assert.match(section.text, /[\u4e00-\u9fff]/)
    assert.ok(section.citationIds.length > 0)
    assert.equal(new Set(section.citationIds).size, section.citationIds.length)
    for (const citationId of section.citationIds) {
      const citation = citations.get(citationId)
      assert.ok(citation, `Assistant citation must resolve: ${citationId}`)
      assert.equal(citation.claimKind, section.claimKind)
      referenced.add(citationId)
    }
  }
  assert.deepEqual([...referenced].sort(), [...citations.keys()].sort())
  assert.doesNotMatch(JSON.stringify(answer), /H2Q\d{2}/)

  if (expected.questionId === 'Q09') {
    assert.ok(answer.generatedReport)
    assertArtifact(answer.generatedReport, {
      kind: 'single_event_diagnosis',
      format: 'html',
      mediaType: 'text/html',
      filename: /-diagnosis\.html$/,
    })
    assert.equal(answer.generatedReport.descriptor.runId, expected.runId)
    assert.equal(answer.generatedReport.descriptor.eventId, expected.eventId)
    assertChineseHtml(answer.generatedReport.content, diagnosisSections)
    const reportCitations = answer.citations.filter(({ sourceType }) => sourceType === 'report')
    assert.equal(reportCitations.length, 1)
    assert.equal(reportCitations[0].sourceId, answer.generatedReport.descriptor.reportId)
    assert.equal(reportCitations[0].eventId, expected.eventId)
  } else {
    assert.equal(answer.generatedReport, undefined)
  }
}

async function readSourceTree(root) {
  const parts = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'test' && entry.name !== 'preview') {
        parts.push(await readSourceTree(path))
      }
    } else if (/\.tsx?$/.test(entry.name)) {
      parts.push(await readFile(path, 'utf8'))
    }
  }
  return parts.join('\n')
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function canonicalExternalHealth() {
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
      bindHost: LOOPBACK,
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

function parseCsv(text) {
  const rows = []
  let cell = ''
  let row = []
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
      } else {
        cell += character
      }
    } else if (character === '"') {
      quoted = true
    } else if (character === ',') {
      row.push(cell)
      cell = ''
    } else if (character === '\n') {
      row.push(cell.replace(/\r$/, ''))
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += character
    }
  }
  if (quoted) assert.fail('submission CSV has an unterminated quoted field')
  if (cell !== '' || row.length > 0) {
    row.push(cell.replace(/\r$/, ''))
    rows.push(row)
  }
  return rows
}

async function fixtureReportArtifact() {
  const program = [
    `import { createFixtureH2EmsDataSource } from ${JSON.stringify(fixtureDataSourcePath)};`,
    "const source = createFixtureH2EmsDataSource();",
    "const result = await source.exportReport({ runId: 'run-fixture-h2-sentinel-golden', kind: 'single_event_diagnosis', eventId: 'C03-20260105-001' });",
    'process.stdout.write(JSON.stringify(result));',
  ].join('')
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', program], {
    cwd: repositoryRoot,
    env: process.env,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  const stdout = []
  const stderr = []
  collectLines(child.stdout, stdout)
  collectLines(child.stderr, stderr)
  const result = await waitForExit(child, 20_000)
  assert.equal(result.code, 0, 'Fixture public data source probe must run')
  assert.equal(stderr.length, 0, 'Fixture public data source probe must not emit diagnostics')
  return JSON.parse(stdout.join('\n'))
}

async function verifySourceLevelEntryContract() {
  const [main, shell] = await Promise.all([readFile(mainPath, 'utf8'), readFile(shellPath, 'utf8')])
  assert.match(main, /readH2Mode\(window\.location\)/)
  assert.match(main, /if \(mode !== 'fixture' && mode !== 'local'\)/)
  assert.match(main, /message\.setAttribute\('role', 'alert'\)/)
  for (const route of ['overview', 'events', 'diagnosis', 'analysis', 'assistant', 'reports']) {
    assert.match(shell, new RegExp(`route: '${route}'`))
  }
}

async function verifyP1WebSourceContract() {
  const [webSource, pluginSource] = await Promise.all([
    readSourceTree(webFeaturePath),
    readSourceTree(pluginSourcePath),
  ])
  const combined = `${webSource}\n${pluginSource}`
  assert.doesNotMatch(combined, /H2Q\d{2}/)
  assert.match(webSource, /H2_ASSISTANT_QUESTIONS/)
  assert.match(pluginSource, /getEventReview/)
  assert.match(pluginSource, /reviewEvent/)
  assert.match(webSource, /getEventReview/)
  assert.match(webSource, /reviewEvent/)
  assert.match(webSource, /requestId/)
  assert.match(webSource, /expectedRevision/)
  for (const label of ['待复核', '已确认', '已驳回', '已闭环']) {
    assert.match(webSource, new RegExp(label))
  }
  assert.match(webSource, /本地.*未验证|未验证.*本地/)
  assert.match(webSource, /LIVE_ANALYSIS · 验证集切片/)
  assert.match(combined, /pcc_daily_compliance/)
  assert.match(combined, /review_audit_json/)
}

async function testFixtureLaunchAndArtifact() {
  const webPort = await freePort()
  const session = await startLauncher(['--mode', 'fixture', '--web-port', String(webPort)])
  try {
    assert.equal(session.ready.mode, 'fixture')
    assert.equal(session.ready.analyticsUrl, null)
    assert.equal(session.ready.analyticsPid, null)
    assert.equal(session.ready.webUrl, `http://${LOOPBACK}:${webPort}/h2-sentinel/?mode=fixture`)
    const h2 = await fetch(session.ready.webUrl, { signal: AbortSignal.timeout(5_000) })
    assert.equal(h2.ok, true)
    const artifact = await fixtureReportArtifact()
    assertArtifact(artifact, {
      kind: 'single_event_diagnosis',
      format: 'html',
      mediaType: 'text/html',
      filename: /\.html$/,
    })
    assert.equal(artifact.descriptor.provenance.mode, 'FIXTURE')
    assert.match(artifact.content, /FIXTURE/)
    assert.doesNotMatch(artifact.content, /LIVE_ANALYSIS · 验证集切片/)
    assertChineseHtml(artifact.content, diagnosisSections)
  } finally {
    await stopLauncher(session)
  }
  await assertPidStopped(session.ready.webPid)
  await assertPortReleased(webPort)
}

async function testLocalCanonicalApiAndExports() {
  const webPort = await freePort()
  const analyticsPort = await freePort()
  const session = await startLauncher([
    '--mode', 'local', '--web-port', String(webPort), '--analytics-port', String(analyticsPort),
  ])
  try {
    assert.equal(session.ready.mode, 'local')
    assert.equal(session.ready.analyticsUrl, `http://${LOOPBACK}:${analyticsPort}/`)
    assert.equal(session.ready.webUrl, `http://${LOOPBACK}:${webPort}/h2-sentinel/?mode=local`)
    assert.equal(typeof session.ready.analyticsPid, 'number')

    const health = await request(session.ready.analyticsUrl, '/health')
    const healthData = assertSuccess(health)
    assert.equal(healthData.status, 'healthy')
    assert.equal(healthData.bindHost, LOOPBACK)

    const invalidHost = await rawHttpRequest(session.ready.analyticsUrl, '/health', { host: 'external.invalid' })
    assertRedactedError(invalidHost, 400)
    assert.equal(invalidHost.body.error.code, 'boundary.invalid_host')
    const invalidOrigin = await rawHttpRequest(session.ready.analyticsUrl, '/health', { origin: 'https://external.invalid' })
    assertRedactedError(invalidOrigin, 403)
    assert.equal(invalidOrigin.body.error.code, 'boundary.invalid_origin')

    const liveRows = parseCsv(await readFile(fixtureCsvPath, 'utf8'))
    const header = liveRows[0]
    const timestampIndex = header.indexOf('timestamp')
    const commandIndex = header.indexOf('bess_power_cmd_kw')
    const actualIndex = header.indexOf('bess_power_actual_kw')
    const pccActualIndex = header.indexOf('pcc_power_actual_kw')
    for (const row of liveRows.slice(1)) {
      if (row[timestampIndex] >= '2026-01-05T10:32:00Z') continue
      // LIVE C03 requires the official 400 kW signature to track in the commanded direction.
      row[commandIndex] = '-400'
      row[actualIndex] = '-400'
      row[pccActualIndex] = '-400'
    }
    const csv = `${liveRows.map((row) => row.join(',')).join('\n')}\n`
    const imported = assertSuccess(await request(
      session.ready.analyticsUrl,
      '/api/v1/h2-sentinel/datasets:import',
      { filename: 'validation-slice-<script>.csv', text: csv },
    ))
    assert.ok(imported.dataset.datasetId)
    assert.equal(imported.dataset.mode, 'LIVE_ANALYSIS')
    assert.equal(imported.dataset.provenance.mode, 'LIVE_ANALYSIS')
    assert.notEqual(imported.dataset.provenance.source, 'sanitized-golden-fixture')
    assert.equal(
      imported.dataset.fingerprint,
      `sha256:${createHash('sha256').update(csv).digest('hex')}`,
    )
    const run = assertSuccess(await request(
      session.ready.analyticsUrl,
      '/api/v1/h2-sentinel/datasets:analyze',
      { datasetId: imported.dataset.datasetId },
    ))
    assert.equal(run.dataset.mode, 'LIVE_ANALYSIS')
    assert.equal(run.provenance.mode, 'LIVE_ANALYSIS')
    assert.notEqual(run.runId, 'run-fixture-h2-sentinel-golden')
    assert.deepEqual(run.events.map((event) => event.code), ['C03', 'C04'])
    assert.equal(run.events[1].impact.value, 120)
    const events = assertSuccess(await request(
      session.ready.analyticsUrl,
      '/api/v1/h2-sentinel/runs/events',
      { runId: run.runId },
    ))
    assert.deepEqual(events.map((event) => event.eventId), ['C03-20260105-001', 'C04-20260105-001'])
    const eventSnapshots = structuredClone(events)

    const eventByQuestion = new Map([
      ['Q03', events[0].eventId],
      ['Q09', events[1].eventId],
    ])
    const assistantAnswers = new Map()
    for (const questionId of assistantQuestionIds) {
      const eventId = eventByQuestion.get(questionId)
      const payload = {
        runId: run.runId,
        questionId,
        ...(eventId === undefined ? {} : { eventId }),
      }
      const withoutLlm = assertSuccess(await request(
        session.ready.analyticsUrl,
        '/api/v1/h2-sentinel/assistant:ask',
        { ...payload, allowLlmRendering: false },
      ))
      const withLlmCompatibilityFlag = assertSuccess(await request(
        session.ready.analyticsUrl,
        '/api/v1/h2-sentinel/assistant:ask',
        { ...payload, allowLlmRendering: true },
      ))
      assert.deepEqual(withLlmCompatibilityFlag, withoutLlm)
      assertAssistantAnswer(withoutLlm, { runId: run.runId, questionId, eventId })
      assistantAnswers.set(questionId, withoutLlm)
    }

    const legacyAlias = await request(
      session.ready.analyticsUrl,
      '/api/v1/h2-sentinel/assistant:ask',
      { runId: run.runId, questionId: 'H2Q03', eventId: events[0].eventId, allowLlmRendering: false },
    )
    assertRedactedError(legacyAlias, 422)
    assert.equal(legacyAlias.body.error.code, 'assistant.question_unknown')
    assert.match(legacyAlias.body.error.message, /[\u4e00-\u9fff]/)

    const missingEvent = await request(
      session.ready.analyticsUrl,
      '/api/v1/h2-sentinel/assistant:ask',
      { runId: run.runId, questionId: 'Q03', allowLlmRendering: false },
    )
    assertRedactedError(missingEvent, 400)
    assert.equal(missingEvent.body.error.code, 'assistant.event_required')
    const mismatchedEvent = await request(
      session.ready.analyticsUrl,
      '/api/v1/h2-sentinel/assistant:ask',
      { runId: run.runId, questionId: 'Q02', eventId: events[0].eventId, allowLlmRendering: false },
    )
    assertRedactedError(mismatchedEvent, 409)
    assert.equal(mismatchedEvent.body.error.code, 'assistant.event_mismatch')

    const submissionBeforeReview = assertSuccess(await request(
      session.ready.analyticsUrl,
      '/api/v1/h2-sentinel/submissions:export',
      { runId: run.runId },
    ))
    const reviewEventId = events[0].eventId
    const reviewRoute = `/api/v1/h2-sentinel/runs/${encodeURIComponent(run.runId)}/events/${encodeURIComponent(reviewEventId)}:review`
    const reviewGetRoute = `/api/v1/h2-sentinel/runs/${encodeURIComponent(run.runId)}/events/${encodeURIComponent(reviewEventId)}/review`
    const initialReview = assertSuccess(await request(session.ready.analyticsUrl, reviewGetRoute))
    assert.equal(initialReview.currentState, 'open')
    assert.equal(initialReview.revision, 0)
    assert.deepEqual(initialReview.entries, [])

    const firstReviewRequest = {
      schemaVersion: 1,
      requestId: 'p1-note-1',
      runId: run.runId,
      eventId: reviewEventId,
      action: 'add_note',
      expectedRevision: 0,
      actor: {
        kind: 'local_operator',
        displayName: '<img src=x onerror=alert(1)>',
      },
      note: '<script>alert("review")</script>',
    }
    const firstReview = assertSuccess(await request(
      session.ready.analyticsUrl,
      reviewRoute,
      firstReviewRequest,
    ))
    assert.equal(firstReview.replayed, false)
    assert.equal(firstReview.review.currentState, 'open')
    assert.equal(firstReview.review.revision, 1)
    const replay = assertSuccess(await request(
      session.ready.analyticsUrl,
      reviewRoute,
      firstReviewRequest,
    ))
    assert.equal(replay.replayed, true)
    assert.equal(replay.entry.entryId, firstReview.entry.entryId)
    assert.equal(replay.review.revision, 1)

    const transitions = [
      ['confirm', undefined, 'open', 'confirmed'],
      ['reopen', '重新复核。', 'confirmed', 'open'],
      ['reject', '与现场记录不一致。', 'open', 'dismissed'],
      ['reopen', '补充记录后重新复核。', 'dismissed', 'open'],
      ['confirm', '第二次确认。', 'open', 'confirmed'],
      ['resolve', '现场处置完成并记录。', 'confirmed', 'resolved'],
      ['reopen', '闭环后复查。', 'resolved', 'open'],
    ]
    let revision = 1
    for (const [action, note, previousState, nextState] of transitions) {
      const receipt = assertSuccess(await request(
        session.ready.analyticsUrl,
        reviewRoute,
        {
          schemaVersion: 1,
          requestId: `p1-${action}-${revision}`,
          runId: run.runId,
          eventId: reviewEventId,
          action,
          expectedRevision: revision,
          actor: { kind: 'local_operator', displayName: '本地复核员' },
          ...(note === undefined ? {} : { note }),
        },
      ))
      revision += 1
      assert.equal(receipt.replayed, false)
      assert.equal(receipt.entry.previousState, previousState)
      assert.equal(receipt.entry.nextState, nextState)
      assert.equal(receipt.review.currentState, nextState)
      assert.equal(receipt.review.revision, revision)
    }
    assert.equal(revision, 8)

    const staleRevision = await request(
      session.ready.analyticsUrl,
      reviewRoute,
      {
        schemaVersion: 1,
        requestId: 'p1-stale-revision',
        runId: run.runId,
        eventId: reviewEventId,
        action: 'add_note',
        expectedRevision: 7,
        actor: { kind: 'local_operator', displayName: '本地复核员' },
        note: '该版本已经过期。',
      },
    )
    assertRedactedError(staleRevision, 409)
    assert.equal(staleRevision.body.error.code, 'review.conflict')

    const idempotencyConflict = await request(
      session.ready.analyticsUrl,
      reviewRoute,
      { ...firstReviewRequest, note: '同一 requestId 的不同语义。' },
    )
    assertRedactedError(idempotencyConflict, 409)
    assert.equal(idempotencyConflict.body.error.code, 'review.idempotency_conflict')

    const invalidTransition = await request(
      session.ready.analyticsUrl,
      reviewRoute,
      {
        schemaVersion: 1,
        requestId: 'p1-invalid-resolve',
        runId: run.runId,
        eventId: reviewEventId,
        action: 'resolve',
        expectedRevision: revision,
        actor: { kind: 'local_operator', displayName: '本地复核员' },
        note: '不能从 open 直接闭环。',
      },
    )
    assertRedactedError(invalidTransition, 409)
    assert.equal(invalidTransition.body.error.code, 'review.invalid_transition')

    const missingNote = await request(
      session.ready.analyticsUrl,
      reviewRoute,
      {
        schemaVersion: 1,
        requestId: 'p1-reject-without-note',
        runId: run.runId,
        eventId: reviewEventId,
        action: 'reject',
        expectedRevision: revision,
        actor: { kind: 'local_operator', displayName: '本地复核员' },
      },
    )
    assertRedactedError(missingNote, 422)
    assert.equal(missingNote.body.error.code, 'review.note_required')

    const finalReview = assertSuccess(await request(session.ready.analyticsUrl, reviewGetRoute))
    assert.equal(finalReview.currentState, 'open')
    assert.equal(finalReview.revision, 8)
    assert.equal(finalReview.entries.length, 8)
    const eventsAfterReview = assertSuccess(await request(
      session.ready.analyticsUrl,
      '/api/v1/h2-sentinel/runs/events',
      { runId: run.runId },
    ))
    assert.deepEqual(eventsAfterReview, eventSnapshots)
    const submissionAfterReview = assertSuccess(await request(
      session.ready.analyticsUrl,
      '/api/v1/h2-sentinel/submissions:export',
      { runId: run.runId },
    ))
    assert.equal(submissionAfterReview.content, submissionBeforeReview.content)

    const reportRequests = [
      {
        kind: 'single_event_diagnosis',
        payload: { runId: run.runId, kind: 'single_event_diagnosis', eventId: events[0].eventId },
        format: 'html',
        mediaType: 'text/html',
        filename: /^C03-20260105-001-diagnosis\.html$/,
      },
      {
        kind: 'period_summary',
        payload: { runId: run.runId, kind: 'period_summary' },
        format: 'html',
        mediaType: 'text/html',
        filename: /-period-summary\.html$/,
      },
      {
        kind: 'pcc_daily_compliance',
        payload: {
          runId: run.runId,
          kind: 'pcc_daily_compliance',
          timeRange: {
            startTime: '2026-01-05T00:00:00Z',
            endTime: '2026-01-06T00:00:00Z',
          },
        },
        format: 'html',
        mediaType: 'text/html',
        filename: /-pcc-daily-compliance\.html$/,
      },
      {
        kind: 'analysis_result_json',
        payload: { runId: run.runId, kind: 'analysis_result_json' },
        format: 'json',
        mediaType: 'application/json',
        filename: /-analysis\.json$/,
      },
      {
        kind: 'submission_csv',
        payload: { runId: run.runId, kind: 'submission_csv' },
        format: 'csv',
        mediaType: 'text/csv',
        filename: /^submission\.csv$/,
      },
      {
        kind: 'quality_report',
        payload: { runId: run.runId, kind: 'quality_report' },
        format: 'html',
        mediaType: 'text/html',
        filename: /-quality-report\.html$/,
      },
      {
        kind: 'review_audit_json',
        payload: { runId: run.runId, kind: 'review_audit_json' },
        format: 'json',
        mediaType: 'application/json',
        filename: /^review-audit-.*\.json$/,
      },
    ]
    const reports = new Map()
    for (const expected of reportRequests) {
      const artifact = assertSuccess(await request(
        session.ready.analyticsUrl,
        '/api/v1/h2-sentinel/reports:export',
        expected.payload,
      ))
      assertArtifact(artifact, expected)
      assert.equal(artifact.descriptor.runId, run.runId)
      if (expected.kind === 'single_event_diagnosis') {
        assert.equal(artifact.descriptor.eventId, events[0].eventId)
      } else {
        assert.equal(artifact.descriptor.eventId, undefined)
      }
      assert.equal(artifact.descriptor.provenance.mode, 'LIVE_ANALYSIS')
      if (expected.format === 'html') assertChineseHtml(artifact.content)
      reports.set(expected.kind, artifact)
    }

    const analysisResult = JSON.parse(reports.get('analysis_result_json').content)
    assert.equal(analysisResult.runId, run.runId)
    assert.deepEqual(analysisResult.events.map((event) => event.eventId), events.map((event) => event.eventId))
    assert.equal(analysisResult.provenance.mode, 'LIVE_ANALYSIS')

    const validationUnavailable = await request(
      session.ready.analyticsUrl,
      '/api/v1/h2-sentinel/reports:export',
      { runId: run.runId, kind: 'validation_metrics' },
    )
    assertRedactedError(validationUnavailable, 409)
    assert.equal(validationUnavailable.body.error.code, 'report.metrics_unavailable')
    assert.match(validationUnavailable.body.error.message, /未生成验证指标/)

    const diagnosisHtml = reports.get('single_event_diagnosis').content
    assertChineseHtml(diagnosisHtml, diagnosisSections)
    assert.match(diagnosisHtml, /&lt;img src=x onerror=alert\(1\)&gt;/)
    assert.match(diagnosisHtml, /&lt;script&gt;alert/)
    assert.doesNotMatch(diagnosisHtml, /<img src=x|<script>alert/)

    const periodHtml = reports.get('period_summary').content
    for (const heading of ['数据质量与限制', '异常统计', '重点事件', '影响摘要', '版本、溯源与安全声明']) {
      assert.match(periodHtml, new RegExp(heading))
    }
    assert.match(periodHtml, /未加载公开标签，未生成验证指标/)

    const pccHtml = reports.get('pcc_daily_compliance').content
    for (const heading of ['日期、时间基准与动态边界', '越限区间、时长与越限电量', '累计进出电量与配额', '相关事件与人工复核', '数据质量、公式与假设', '溯源与安全声明']) {
      assert.match(pccHtml, new RegExp(heading))
    }
    assert.match(pccHtml, /证据不足，未计算该项合规结论/)
    assert.match(pccHtml, /120/)

    const qualityHtml = reports.get('quality_report').content
    assert.match(qualityHtml, /氢哨数据质量报告/)
    assert.match(qualityHtml, /数据质量状态/)
    assert.match(qualityHtml, /<th>检查项<\/th><th>状态<\/th><th>受影响字段<\/th><th>观测值<\/th><th>说明<\/th>/)
    assert.match(qualityHtml, /未加载公开标签，未生成验证指标/)
    for (const qualityCheck of run.quality.checks) {
      assert.match(qualityHtml, new RegExp(escapeRegex(qualityCheck.code)))
    }

    const auditArtifact = reports.get('review_audit_json')
    const audit = JSON.parse(auditArtifact.content)
    assert.equal(audit.exportKind, 'event_review_audit')
    assert.equal(audit.runId, run.runId)
    assert.equal(audit.actorIdentityNotice, 'local_operator_labels_are_unverified')
    assert.deepEqual(audit.events.map(({ event }) => event.eventId), events.map(({ eventId }) => eventId))
    assert.equal(audit.events[0].review.revision, 8)
    assert.equal(audit.events[1].review.revision, 0)
    assert.equal(audit.events[0].review.entries[0].note, firstReviewRequest.note)
    assert.equal(audit.provenance.mode, 'LIVE_ANALYSIS')

    const submission = reports.get('submission_csv')
    const submissionRows = parseCsv(submission.content)
    assert.equal(submissionRows[0].length, 16)
    assert.deepEqual(submissionRows[0], [
      'pred_event_id', 'start_time', 'end_time', 'anomaly_code', 'anomaly_subtype', 'severity',
      'primary_control_object', 'affected_equipment', 'confidence', 'evidence_json', 'root_cause',
      'recommended_action', 'primary_impact_metric', 'estimated_impact_value', 'first_detection_time',
      'requires_human_confirmation',
    ])
    assert.deepEqual(submissionRows.slice(1).map((row) => [row[0], row[3], row[13]]), [
      [events[0].eventId, 'C03', String(events[0].impact.value)],
      [events[1].eventId, 'C04', '120.0'],
    ])
    assertSafePublicText(submission.content)
    const dedicatedSubmission = assertSuccess(await request(
      session.ready.analyticsUrl,
      '/api/v1/h2-sentinel/submissions:export',
      { runId: run.runId },
    ))
    assert.equal(dedicatedSubmission.content, submission.content)
    assert.equal(dedicatedSubmission.content, submissionBeforeReview.content)
    assert.doesNotMatch(submission.content.split(/\r?\n/, 1)[0], /review|actor|note|revision/i)

    const missingRun = await request(
      session.ready.analyticsUrl,
      '/api/v1/h2-sentinel/datasets:analyze',
      { datasetId: 'unknown-dataset' },
    )
    assertRedactedError(missingRun, 404)

    const validationSliceArtifacts = [
      assistantAnswers.get('Q09').generatedReport,
      ...[...reports.values()].filter(({ descriptor }) => descriptor.format === 'html'),
    ]
    for (const artifact of validationSliceArtifacts) {
      assert.match(artifact.content, /LIVE_ANALYSIS · 验证集切片/)
      assert.doesNotMatch(artifact.content, /FIXTURE ·/)
    }
  } finally {
    await stopLauncher(session)
  }
  await assertPidStopped(session.ready.webPid)
  await assertPidStopped(session.ready.analyticsPid)
  await assertPortReleased(webPort)
  await assertPortReleased(analyticsPort)
}

async function testExternalSidecarHealthContract() {
  const analyticsPort = await freePort()
  let healthBody = null
  const sidecar = createHttpServer((incoming, response) => {
    if (incoming.url !== '/health') {
      response.writeHead(404)
      response.end()
      return
    }
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify(healthBody))
  })
  await new Promise((resolvePromise, rejectPromise) => {
    sidecar.once('error', rejectPromise)
    sidecar.listen({ host: LOOPBACK, port: analyticsPort }, resolvePromise)
  })
  try {
    const invalidHealthCases = [
      ['minimal', { ok: true, status: 'success', data: { status: 'healthy' } }],
      ['wrong namespace', { ...canonicalExternalHealth(), data: { ...canonicalExternalHealth().data, namespace: '/api/v1/other' } }],
      ['wrong host', { ...canonicalExternalHealth(), data: { ...canonicalExternalHealth().data, bindHost: 'localhost' } }],
      ['extra top-level', { ...canonicalExternalHealth(), unexpected: true }],
    ]
    for (const [, candidate] of invalidHealthCases) {
      healthBody = candidate
      const webPort = await freePort()
      const session = startExpectedFailure([
        '--mode', 'local', '--web-port', String(webPort),
        '--external-sidecar-url', `http://${LOOPBACK}:${analyticsPort}/`,
        '--health-timeout-ms', '500',
      ])
      const result = await waitForExit(session.child, 10_000)
      assert.equal(result.code, 1)
      assert.match(session.stderr.join(' '), /health check timed out/)
      assert.doesNotMatch(session.stdout.join(' '), /"event":"READY"/)
      await assertPortReleased(webPort)
    }

    healthBody = canonicalExternalHealth()
    const webPort = await freePort()
    const session = await startLauncher([
      '--mode', 'local', '--web-port', String(webPort),
      '--external-sidecar-url', `http://${LOOPBACK}:${analyticsPort}/`,
    ])
    try {
      assert.equal(session.ready.analyticsUrl, `http://${LOOPBACK}:${analyticsPort}/`)
      assert.equal(session.ready.analyticsPid, null)
      const web = await fetch(session.ready.webUrl, { signal: AbortSignal.timeout(5_000) })
      assert.equal(web.ok, true)
    } finally {
      await stopLauncher(session)
    }
    await assertPidStopped(session.ready.webPid)
    await assertPortReleased(webPort)
    const health = await fetch(`http://${LOOPBACK}:${analyticsPort}/health`, { signal: AbortSignal.timeout(5_000) })
    assert.equal(health.ok, true, 'external sidecar must remain unowned after launcher cleanup')
  } finally {
    await new Promise((resolvePromise) => sidecar.close(resolvePromise))
  }
  await assertPortReleased(analyticsPort)
}

async function testLaunchFailureBoundaries() {
  const webPort = await freePort()
  const webBlocker = createNetServer()
  await new Promise((resolvePromise, rejectPromise) => {
    webBlocker.once('error', rejectPromise)
    webBlocker.listen({ host: LOOPBACK, port: webPort }, resolvePromise)
  })
  try {
    const session = startExpectedFailure(['--mode', 'fixture', '--web-port', String(webPort)])
    const result = await waitForExit(session.child, 10_000)
    assert.equal(result.code, 1)
    assert.match(session.stderr.join(' '), /Web port \d+ is already in use/)
  } finally {
    await new Promise((resolvePromise) => webBlocker.close(resolvePromise))
  }

  const analyticsPort = await freePort()
  const analyticsBlocker = createNetServer()
  await new Promise((resolvePromise, rejectPromise) => {
    analyticsBlocker.once('error', rejectPromise)
    analyticsBlocker.listen({ host: LOOPBACK, port: analyticsPort }, resolvePromise)
  })
  try {
    const session = startExpectedFailure([
      '--mode', 'local', '--web-port', String(await freePort()), '--analytics-port', String(analyticsPort),
    ])
    const result = await waitForExit(session.child, 10_000)
    assert.equal(result.code, 1)
    assert.match(session.stderr.join(' '), /Analytics port \d+ is already in use/)
  } finally {
    await new Promise((resolvePromise) => analyticsBlocker.close(resolvePromise))
  }

  const unhealthyPort = await freePort()
  const unhealthy = createHttpServer((request, response) => {
    if (request.url === '/health') {
      response.writeHead(302, { location: '/healthy' })
      response.end()
      return
    }
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ ok: true, status: 'success', data: { status: 'healthy' } }))
  })
  await new Promise((resolvePromise, rejectPromise) => {
    unhealthy.once('error', rejectPromise)
    unhealthy.listen({ host: LOOPBACK, port: unhealthyPort }, resolvePromise)
  })
  try {
    const webPort = await freePort()
    const session = startExpectedFailure([
      '--mode', 'local', '--web-port', String(webPort),
      '--external-sidecar-url', `http://${LOOPBACK}:${unhealthyPort}/`,
      '--health-timeout-ms', '500',
    ])
    const result = await waitForExit(session.child, 10_000)
    assert.equal(result.code, 1)
    assert.match(session.stderr.join(' '), /health check timed out/)
  } finally {
    await new Promise((resolvePromise) => unhealthy.close(resolvePromise))
  }
}

await check('A02/A05/P1-RPT', 'Fixture launcher starts without a Python sidecar, exports a Chinese C03 HTML artifact, preserves Fixture provenance, and cleans its owned Web process', testFixtureLaunchAndArtifact)
await check('P1-API/P1-QA', 'Local public API verifies Q01-Q10, review reliability, seven available report/export contracts, submission immutability, provenance, loopback, and redacted errors', testLocalCanonicalApiAndExports)
await check('A04/A07', 'Occupied ports and redirecting sidecar readiness fail visibly and safely', testLaunchFailureBoundaries)
await check('A04', 'External sidecar accepts only the exact canonical health envelope and leaves external ownership intact', testExternalSidecarHealthContract)
await check('A06/A08', 'Source-level generic/H2 entry, closed invalid-mode alert, and six-page navigation contract', verifySourceLevelEntryContract)
await check('P1-W2', 'Web and adapter source consume official questions, review workflow, validation-slice provenance, and new report kinds', verifyP1WebSourceContract)

for (const child of activeLaunchers) {
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
}

const summary = {
  contract: 'h2-sentinel-p1-assembled-qa-v3',
  results: outcomes,
  counts: Object.fromEntries(['PASS', 'FAIL'].map((status) => [status, outcomes.filter((item) => item.status === status).length])),
  visualVerification: 'COORDINATOR_MANUAL_REQUIRED: inspect desktop and 390x844 validation-slice review, conflict, report download, and provenance states.',
}
console.log(JSON.stringify(summary))
if (outcomes.some((item) => item.status === 'FAIL')) process.exitCode = 1
