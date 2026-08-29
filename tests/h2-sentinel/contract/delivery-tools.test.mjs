import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import {
  evaluateDoctorSnapshot,
  MIN_FREE_BYTES,
  parseArguments,
  versionAtLeast,
} from '../../../scripts/h2-sentinel/doctor.mjs'
import {
  createCheckPlan,
  providerFreeEnvironment,
} from '../../../scripts/h2-sentinel/check-all.mjs'

function readySnapshot(overrides = {}) {
  return {
    mode: 'local',
    webPort: 5173,
    analyticsPort: 8765,
    loopbackHost: '127.0.0.1',
    nodeVersion: 'v22.12.0',
    npmVersion: '11.0.0',
    pythonVersion: 'Python 3.11.0',
    uvVersion: 'uv 0.11.26',
    packageLock: true,
    uvLock: true,
    nodeInstall: true,
    pythonInstall: true,
    webPortAvailable: true,
    analyticsPortAvailable: true,
    freeBytes: MIN_FREE_BYTES,
    stepFunConfigured: false,
    ...overrides,
  }
}

describe('clean-machine doctor', () => {
  it('enforces exact minimum versions and closed loopback modes', () => {
    assert.equal(versionAtLeast('v22.12.0', '22.12.0'), true)
    assert.equal(versionAtLeast('22.11.9', '22.12.0'), false)
    assert.equal(versionAtLeast('Python 3.11.0', '3.11.0'), true)
    assert.throws(() => parseArguments(['--mode', 'remote']))
    assert.throws(() => parseArguments(['--mode', 'local', '--web-port', '8765']))
  })

  it('fails closed for missing dependencies, occupied ports, and insufficient disk', () => {
    const checks = evaluateDoctorSnapshot(readySnapshot({
      npmVersion: null,
      uvVersion: null,
      nodeInstall: false,
      webPortAvailable: false,
      freeBytes: MIN_FREE_BYTES - 1,
    }))
    for (const id of ['npm', 'uv', 'node_install', 'web_port', 'disk']) {
      assert.equal(checks.find((entry) => entry.id === id)?.status, 'fail', id)
    }
  })

  it('keeps StepFun optional and never reports its value', () => {
    const secret = 'must-not-appear'
    const checks = evaluateDoctorSnapshot(readySnapshot({ stepFunConfigured: secret.length > 0 }))
    const serialized = JSON.stringify(checks)
    assert.match(serialized, /未读取或显示其值/)
    assert.doesNotMatch(serialized, new RegExp(secret))
    assert.equal(checks.find((entry) => entry.id === 'stepfun')?.status, 'pass')
  })
})

describe('delivery check-all and CI', () => {
  it('orders lint, type, tests, build, and loopback smoke without provider credentials', () => {
    const plan = createCheckPlan('linux')
    const labels = plan.map(({ label }) => label)
    assert.ok(labels.indexOf('Python lint') < labels.indexOf('TypeScript typecheck'))
    assert.ok(labels.indexOf('TypeScript typecheck') < labels.indexOf('Python typecheck'))
    assert.ok(labels.indexOf('Python typecheck') < labels.indexOf('focused H2 tests'))
    assert.ok(labels.indexOf('repository tests') < labels.indexOf('production build'))
    assert.ok(labels.indexOf('production build') < labels.indexOf('loopback offline smoke'))
    const environment = providerFreeEnvironment({
      PATH: 'safe',
      STEPFUN_API_KEY: 'secret',
      OPENAI_API_KEY: 'secret',
      H2_LLM_API_KEY: 'secret',
    })
    assert.equal(environment.PATH, 'safe')
    assert.equal(environment.H2_LLM_ENABLED, 'false')
    assert.equal(Object.hasOwn(environment, 'STEPFUN_API_KEY'), false)
    assert.equal(Object.hasOwn(environment, 'OPENAI_API_KEY'), false)
    assert.equal(Object.hasOwn(environment, 'H2_LLM_API_KEY'), false)
  })

  it('pins CI setup and delegates to the provider-free composed gate', () => {
    const workflow = readFileSync(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8')
    assert.match(workflow, /actions\/checkout@[a-f0-9]{40}/)
    assert.match(workflow, /actions\/setup-node@[a-f0-9]{40}/)
    assert.match(workflow, /actions\/setup-python@[a-f0-9]{40}/)
    assert.match(workflow, /uv sync --locked --extra dev/)
    assert.match(workflow, /node scripts\/h2-sentinel\/check-all\.mjs/)
    assert.match(workflow, /STEPFUN_API_KEY: ''/)
  })

  it('keeps launcher fail-closed coverage for dependency, port, mode, and sidecar mismatch', () => {
    const launcher = readFileSync(new URL('../../../scripts/h2-sentinel/launch.mjs', import.meta.url), 'utf8')
    const smoke = readFileSync(new URL('../../../scripts/h2-sentinel/smoke.mjs', import.meta.url), 'utf8')
    const launcherTest = readFileSync(new URL('../../../scripts/h2-sentinel/launch.test.mjs', import.meta.url), 'utf8')
    assert.match(launcher, /Vite is unavailable\. Run npm ci/)
    assert.match(smoke, /runOccupiedPortSmoke/)
    assert.match(launcherTest, /\['--mode', 'remote'\]/)
    assert.match(smoke, /runUntrustedHealthImplementationSmoke/)
    for (const functionName of ['runHealthTimeoutSmoke', 'runUntrustedHealthImplementationSmoke']) {
      const start = smoke.indexOf(`async function ${functionName}()`)
      const end = smoke.indexOf('\nasync function ', start + 1)
      const body = smoke.slice(start, end < 0 ? undefined : end)
      assert.match(body, /const webPort = await getFreePort\(\)/, functionName)
      assert.match(body, /'--web-port',\s*String\(webPort\)/, functionName)
      assert.match(body, /await assertPortReleased\(webPort\)/, functionName)
    }
  })
})

describe('submission equipment normalization data', () => {
  it('records source-to-master aliases without weakening official submission tokens', () => {
    const vocabulary = JSON.parse(readFileSync(
      new URL('../../../packages/h2-vocabulary/data/submission-equipment-tokens.json', import.meta.url),
      'utf8',
    ))
    assert.deepEqual(vocabulary.normalizationAliases, {
      ELZ1: 'ELZ01',
      ELZ2: 'ELZ02',
      ELZ3: 'ELZ03',
      BESS: 'BESS01',
      PCC: 'PCC01',
    })
    assert.deepEqual(vocabulary.tokensByCode.C03, ['BESS', 'PCC'])
  })
})
