import assert from 'node:assert/strict'
import test from 'node:test'

import {
  childFailure,
  isHealthyAnalyticsEnvelope,
  parseLauncherArguments,
} from './launch.mjs'

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
      bindHost: '127.0.0.1',
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

test('accepts only the closed Fixture and local launch contracts', () => {
  assert.deepEqual(parseLauncherArguments(['--mode', 'fixture']), {
    mode: 'fixture',
    webPort: 5173,
    analyticsPort: 8765,
    externalSidecarUrl: null,
    healthTimeoutMs: 20_000,
    readyJson: false,
    webRuntime: 'dev',
  })
  assert.deepEqual(
    parseLauncherArguments([
      '--mode',
      'local',
      '--external-sidecar-url',
      'http://127.0.0.1:9001/',
      '--ready-json',
      '--web-runtime',
      'preview',
    ]),
    {
      mode: 'local',
      webPort: 5173,
      analyticsPort: 9001,
      externalSidecarUrl: 'http://127.0.0.1:9001/',
      healthTimeoutMs: 20_000,
      readyJson: true,
      webRuntime: 'preview',
    },
  )
})

test('rejects arbitrary modes, commands, ports, and sidecar targets', () => {
  const invalidArguments = [
    [],
    ['--mode', 'remote'],
    ['--mode', 'fixture', '--exec', 'python'],
    ['--mode', 'fixture', '--web-port', '80'],
    ['--mode', 'fixture', '--external-sidecar-url', 'http://127.0.0.1:9001/'],
    ['--mode', 'local', '--external-sidecar-url', 'http://localhost:9001/'],
    ['--mode', 'local', '--external-sidecar-url', 'http://2130706433:9001/'],
    ['--mode', 'local', '--external-sidecar-url', 'http://0x7f000001:9001/'],
    ['--mode', 'local', '--external-sidecar-url', 'http://0177.0.0.1:9001/'],
    ['--mode', 'local', '--external-sidecar-url', 'http://127.0.0.1:9001/api'],
    ['--mode', 'local', '--external-sidecar-url', 'https://127.0.0.1:9001/'],
    [
      '--mode',
      'local',
      '--analytics-port',
      '9001',
      '--external-sidecar-url',
      'http://127.0.0.1:9001/',
    ],
    ['--mode', 'local', '--web-port', '8765'],
  ]

  for (const argumentsList of invalidArguments) {
    assert.throws(() => parseLauncherArguments(argumentsList))
  }
})

test('maps bind-race child exits to the role and actual loopback port', () => {
  const failure = childFailure(
    {
      label: 'Analytics',
      port: 18765,
      spawnError: null,
      child: { exitCode: 1, signalCode: null },
    },
    'before readiness',
  )
  assert.match(failure.message, /Analytics process exited before readiness/)
  assert.match(failure.message, /127\.0\.0\.1:18765/)
  assert.match(failure.message, /analytics port is still available/)
})

test('keeps repeated termination signals handled until cleanup completes', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) =>
    readFile(new URL('./launch.mjs', import.meta.url), 'utf8'),
  )
  assert.match(source, /process\.on\('SIGINT', requestShutdown\)/)
  assert.match(source, /process\.on\('SIGTERM', requestShutdown\)/)
  assert.doesNotMatch(source, /process\.once\('SIG(?:INT|TERM)'/)
  assert.equal((source.match(/redirect: 'error'/g) ?? []).length, 2)
})

test('establishes persistent lifecycle observation and closed Windows Job ownership', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) =>
    readFile(new URL('./launch.mjs', import.meta.url), 'utf8'),
  )
  const wrapper = await import('node:fs/promises').then(({ readFile }) =>
    readFile(new URL('./windows-owned-process.ps1', import.meta.url), 'utf8'),
  )
  const adversarialLauncher = await import('node:fs/promises').then(({ readFile }) =>
    readFile(new URL('./adversarial-launch.mjs', import.meta.url), 'utf8'),
  )

  assert.match(source, /child\.once\('exit',[\s\S]*settleTerminal/)
  assert.match(source, /terminalPromise/)
  assert.match(source, /WINDOWS_OWNED_EXIT_PATTERN/)
  assert.match(source, /message\.type === 'shutdown'/)
  assert.doesNotMatch(source, /hold-after-analytics-health|continue-after-analytics-health/)
  assert.match(adversarialLauncher, /afterAnalyticsHealth/)
  assert.match(adversarialLauncher, /removeListener\('message', continueStartup\)/)
  assert.match(adversarialLauncher, /if \(process\.connected\) process\.disconnect\(\)/)
  assert.match(source, /waitDuringStartup\([\s\S]*waitForWeb\([\s\S]*ownedProcesses/)
  assert.ok(source.indexOf('const lifecycle = waitForShutdownOrChildExit') < source.indexOf('console.log(options.readyJson'))
  assert.match(wrapper, /ValidateSet\('Analytics', 'Web'\)/)
  assert.doesNotMatch(wrapper, /\[string\]\s*\$Command/)
  assert.match(wrapper, /JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE/)
  assert.match(wrapper, /\[H2_SENTINEL_OWNED_EXIT\]/)
  const runBody = wrapper.slice(wrapper.indexOf('public static int Run'))
  assert.ok(runBody.indexOf('SetInformationJobObject(') < runBody.indexOf('CreateProcess('))
  assert.ok(runBody.indexOf('AssignProcessToJobObject(') < runBody.indexOf('ResumeThread('))
})

test('audits adversarial natural cleanup before failure-only fallback cleanup', async () => {
  const smokeSource = await import('node:fs/promises').then(({ readFile }) =>
    readFile(new URL('./smoke.mjs', import.meta.url), 'utf8'),
  )
  const adversarialSmoke = smokeSource.slice(
    smokeSource.indexOf('async function runAnalyticsExitBeforeReadySmoke()'),
    smokeSource.indexOf('async function runSubmissionValidator'),
  )
  const naturalPidAudit = adversarialSmoke.indexOf(
    'for (const pid of observedPids) await assertPidStopped(pid)',
  )
  const fallbackCleanup = adversarialSmoke.indexOf('finally {')

  assert.ok(naturalPidAudit >= 0)
  assert.ok(fallbackCleanup > naturalPidAudit)
  assert.match(adversarialSmoke, /let auditCompleted = false/)
  assert.match(adversarialSmoke, /if \(!auditCompleted\)/)
  assert.match(adversarialSmoke, /if \(primaryError === null/)
})

test('requires the exact canonical analytics health contract', () => {
  assert.equal(isHealthyAnalyticsEnvelope(canonicalHealthEnvelope()), true)

  for (const key of Object.keys(canonicalHealthEnvelope())) {
    const candidate = canonicalHealthEnvelope()
    delete candidate[key]
    assert.equal(isHealthyAnalyticsEnvelope(candidate), false, `missing envelope key ${key}`)
  }
  for (const key of Object.keys(canonicalHealthEnvelope().data)) {
    const candidate = canonicalHealthEnvelope()
    delete candidate.data[key]
    assert.equal(isHealthyAnalyticsEnvelope(candidate), false, `missing health data key ${key}`)
  }
  const versionKeys = Object.keys(canonicalHealthEnvelope().data).filter((key) =>
    key.endsWith('Version'),
  )
  for (const key of versionKeys) {
    const candidate = canonicalHealthEnvelope()
    candidate.data[key] = ''
    assert.equal(isHealthyAnalyticsEnvelope(candidate), false, `empty health data key ${key}`)
  }
  for (const key of Object.keys(canonicalHealthEnvelope().provenance)) {
    const candidate = canonicalHealthEnvelope()
    delete candidate.provenance[key]
    assert.equal(isHealthyAnalyticsEnvelope(candidate), false, `missing provenance key ${key}`)
  }

  const adversarialMutations = [
    ['warning envelope', (value) => {
      value.status = 'warning'
    }],
    ['non-empty warnings', (value) => {
      value.warnings.push({ code: 'spoofed' })
    }],
    ['extra envelope key', (value) => {
      value.extra = true
    }],
    ['extra health data key', (value) => {
      value.data.command = 'spoofed'
    }],
    ['wrong health status', (value) => {
      value.data.status = 'starting'
    }],
    ['wrong namespace', (value) => {
      value.data.namespace = '/api/v1/other'
    }],
    ['hostname alias', (value) => {
      value.data.bindHost = 'localhost'
    }],
    ['unstable detector version', (value) => {
      value.data.detectorVersion = 'detector version/latest'
    }],
    ['wrong provenance mode', (value) => {
      value.provenance.mode = 'LIVE_ANALYSIS'
    }],
    ['wrong provenance source', (value) => {
      value.provenance.source = 'lookalike-api'
    }],
    ['extra provenance key', (value) => {
      value.provenance.modelVersion = 'spoofed-v1'
    }],
    ['mismatched rule version', (value) => {
      value.provenance.ruleVersion = 'other-rules-v1'
    }],
    ['empty provenance generatedAt', (value) => {
      value.provenance.generatedAt = ' '
    }],
    ['empty provenance limitation', (value) => {
      value.provenance.limitations = ['']
    }],
  ]

  for (const [label, mutate] of adversarialMutations) {
    const candidate = canonicalHealthEnvelope()
    mutate(candidate)
    assert.equal(isHealthyAnalyticsEnvelope(candidate), false, label)
  }
})
