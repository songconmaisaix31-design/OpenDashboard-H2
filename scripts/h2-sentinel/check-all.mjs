import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '../..')
const analyticsDirectory = resolve(repositoryRoot, 'services/h2-analytics')

function commandStep(label, command, args, cwd, platform) {
  if (platform === 'win32' && command === 'npm') {
    return {
      label,
      command: process.env.ComSpec ?? 'cmd.exe',
      args: ['/d', '/s', '/c', `npm ${args.join(' ')}`],
      cwd,
    }
  }
  return { label, command, args, cwd }
}

function parseArguments(argv) {
  const options = { webPort: 5173, analyticsPort: 8765 }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (!['--web-port', '--analytics-port'].includes(argument)) {
      throw new Error(`Unsupported check-all option: ${String(argument)}`)
    }
    const value = argv[index + 1]
    if (!value || !/^\d+$/.test(value)) throw new Error(`${argument} requires a decimal port.`)
    const port = Number(value)
    if (!Number.isSafeInteger(port) || port < 1024 || port > 65_535) {
      throw new Error(`${argument} must be between 1024 and 65535.`)
    }
    if (argument === '--web-port') options.webPort = port
    else options.analyticsPort = port
    index += 1
  }
  if (options.webPort === options.analyticsPort) throw new Error('Web and analytics ports must be different.')
  return options
}

export function createCheckPlan(platform = process.platform, options = parseArguments([])) {
  const uv = platform === 'win32' ? 'uv.exe' : 'uv'
  return Object.freeze([
    {
      label: 'read-only doctor',
      command: process.execPath,
      args: [
        'scripts/h2-sentinel/doctor.mjs',
        '--mode', 'local',
        '--web-port', String(options.webPort),
        '--analytics-port', String(options.analyticsPort),
      ],
      cwd: repositoryRoot,
    },
    { label: 'Python lint', command: uv, args: ['run', '--locked', '--extra', 'dev', 'ruff', 'check', 'src', 'tests'], cwd: analyticsDirectory },
    commandStep('TypeScript typecheck', 'npm', ['run', 'typecheck'], repositoryRoot, platform),
    { label: 'Python typecheck', command: uv, args: ['run', '--locked', '--extra', 'dev', 'mypy', 'src'], cwd: analyticsDirectory },
    commandStep('focused H2 tests', 'npm', ['run', 'h2:test'], repositoryRoot, platform),
    commandStep('delivery and contract QA', 'npm', ['run', 'h2:qa'], repositoryRoot, platform),
    commandStep('launcher tests', 'npm', ['run', 'h2:launcher:test'], repositoryRoot, platform),
    { label: 'Python tests', command: uv, args: ['run', '--locked', '--extra', 'dev', 'python', '-m', 'pytest', '-q'], cwd: analyticsDirectory },
    commandStep('repository tests', 'npm', ['test'], repositoryRoot, platform),
    commandStep('production build', 'npm', ['run', 'h2:build'], repositoryRoot, platform),
    { label: 'loopback offline smoke', command: process.execPath, args: ['scripts/h2-sentinel/smoke.mjs'], cwd: repositoryRoot },
    { label: 'diff whitespace check', command: 'git', args: ['diff', '--check'], cwd: repositoryRoot },
  ])
}

export function providerFreeEnvironment(environment = process.env) {
  const safe = { ...environment }
  for (const name of ['STEPFUN_API_KEY', 'OPENAI_API_KEY', 'H2_LLM_API_KEY']) delete safe[name]
  safe.H2_LLM_ENABLED = 'false'
  return safe
}

export function runCheckPlan(plan = createCheckPlan()) {
  const environment = providerFreeEnvironment()
  for (const step of plan) {
    console.log(`\n==> ${step.label}`)
    const result = spawnSync(step.command, step.args, {
      cwd: step.cwd,
      env: environment,
      shell: false,
      stdio: 'inherit',
      windowsHide: true,
    })
    if (result.error || result.status !== 0) {
      console.error(`FAILED: ${step.label}`)
      return false
    }
  }
  console.log('\nH2 Sentinel check-all passed with provider access disabled.')
  return true
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath.toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  let options
  try {
    options = parseArguments(process.argv.slice(2))
  } catch {
    console.error('Usage: node scripts/h2-sentinel/check-all.mjs [--web-port <port>] [--analytics-port <port>]')
    process.exitCode = 2
  }
  if (options && !runCheckPlan(createCheckPlan(process.platform, options))) {
    process.exitCode = 1
  }
}
