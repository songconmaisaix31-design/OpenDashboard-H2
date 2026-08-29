import { spawnSync } from 'node:child_process'
import { existsSync, statfsSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const LOOPBACK_HOST = '127.0.0.1'
const DEFAULT_WEB_PORT = 5173
const DEFAULT_ANALYTICS_PORT = 8765
const MIN_FREE_BYTES = 512 * 1024 * 1024
const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '../..')

function parseArguments(argv) {
  const options = { mode: 'local', webPort: DEFAULT_WEB_PORT, analyticsPort: DEFAULT_ANALYTICS_PORT, json: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--json') {
      if (options.json) throw new Error('--json may be provided only once.')
      options.json = true
      continue
    }
    if (!['--mode', '--web-port', '--analytics-port'].includes(argument)) {
      throw new Error(`Unsupported doctor option: ${String(argument)}`)
    }
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`)
    if (argument === '--mode') options.mode = value
    if (argument === '--web-port') options.webPort = parsePort(value, argument)
    if (argument === '--analytics-port') options.analyticsPort = parsePort(value, argument)
    index += 1
  }
  if (!['fixture', 'local'].includes(options.mode)) throw new Error('--mode must be fixture or local.')
  if (options.webPort === options.analyticsPort) throw new Error('Web and analytics ports must be different.')
  return Object.freeze(options)
}

function parsePort(value, label) {
  if (!/^\d+$/.test(value)) throw new Error(`${label} must be a decimal integer.`)
  const port = Number(value)
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65_535) {
    throw new Error(`${label} must be between 1024 and 65535.`)
  }
  return port
}

function parseVersion(value) {
  const match = String(value).match(/(\d+)\.(\d+)(?:\.(\d+))?/)
  return match ? match.slice(1).map((part) => Number(part ?? 0)) : null
}

export function versionAtLeast(value, minimum) {
  const actual = parseVersion(value)
  const expected = parseVersion(minimum)
  if (actual === null || expected === null) return false
  for (let index = 0; index < 3; index += 1) {
    if ((actual[index] ?? 0) > (expected[index] ?? 0)) return true
    if ((actual[index] ?? 0) < (expected[index] ?? 0)) return false
  }
  return true
}

export function hasEnvironmentProperty(environment, name) {
  return Object.hasOwn(environment, name)
}

function runCommand(command, args, cwd = repositoryRoot) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  })
  return result
}

function commandVersion(command, args = ['--version']) {
  const result = runCommand(command, args)
  if (result.status !== 0 || result.error) return null
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim()
  return output.split(/\r?\n/, 1)[0] || null
}

function commandSucceeded(command, args, cwd = repositoryRoot) {
  const result = runCommand(command, args, cwd)
  return !result.error && result.status === 0
}

function nodeInstallReady() {
  if (
    !existsSync(resolve(repositoryRoot, 'node_modules/.package-lock.json')) ||
    !existsSync(resolve(repositoryRoot, 'node_modules/vite/bin/vite.js'))
  ) return false
  return process.platform === 'win32'
    ? commandSucceeded(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'npm ls --depth=0'])
    : commandSucceeded('npm', ['ls', '--depth=0'])
}

function pythonInstallReady() {
  const analyticsDirectory = resolve(repositoryRoot, 'services/h2-analytics')
  return (
    existsSync(resolve(analyticsDirectory, '.venv/pyvenv.cfg')) &&
    commandSucceeded(
      process.platform === 'win32' ? 'uv.exe' : 'uv',
      ['sync', '--check', '--locked', '--extra', 'dev'],
      analyticsDirectory,
    )
  )
}

function npmVersion() {
  return process.platform === 'win32'
    ? commandVersion(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'npm --version'])
    : commandVersion('npm')
}

function findPythonVersion() {
  for (const candidate of [
    ['python', ['--version']],
    ['python3', ['--version']],
    ['py', ['-3', '--version']],
  ]) {
    const version = commandVersion(candidate[0], candidate[1])
    if (version !== null) return version
  }
  return null
}

async function portAvailable(port) {
  return await new Promise((resolvePromise) => {
    const server = createServer()
    server.unref()
    server.once('error', () => resolvePromise(false))
    server.listen({ host: LOOPBACK_HOST, port, exclusive: true }, () => {
      server.close((error) => resolvePromise(error === undefined))
    })
  })
}

function availableBytes(path) {
  try {
    const stats = statfsSync(path)
    return Number(stats.bavail) * Number(stats.bsize)
  } catch {
    return null
  }
}

function check(id, status, summary, action = null, details = {}) {
  return { id, status, summary, action, ...details }
}

export function evaluateDoctorSnapshot(snapshot) {
  const checks = []
  checks.push(check(
    'node',
    snapshot.nodeVersion !== null && versionAtLeast(snapshot.nodeVersion, '22.12.0') ? 'pass' : 'fail',
    snapshot.nodeVersion === null ? '未找到 Node.js。' : `Node.js 版本：${snapshot.nodeVersion}`,
    '安装 Node.js 22.12 或更高版本。',
  ))
  checks.push(check(
    'npm',
    snapshot.npmVersion !== null && versionAtLeast(snapshot.npmVersion, '11.0.0') ? 'pass' : 'fail',
    snapshot.npmVersion === null ? '未找到 npm。' : `npm 版本：${snapshot.npmVersion}`,
    '安装 npm 11 或更高版本。',
  ))

  const localRequired = snapshot.mode === 'local'
  const pythonOk = snapshot.pythonVersion !== null && versionAtLeast(snapshot.pythonVersion, '3.11.0')
  checks.push(check(
    'python',
    pythonOk ? 'pass' : localRequired ? 'fail' : 'warning',
    snapshot.pythonVersion === null ? '未找到 Python。' : `Python 版本：${snapshot.pythonVersion}`,
    localRequired ? 'Local 模式需要 Python 3.11 或更高版本。' : 'Fixture 模式可运行；Local 模式需要 Python 3.11 或更高版本。',
  ))
  checks.push(check(
    'uv',
    snapshot.uvVersion !== null ? 'pass' : localRequired ? 'fail' : 'warning',
    snapshot.uvVersion === null ? '未找到 uv。' : `uv 版本：${snapshot.uvVersion}`,
    localRequired ? '安装 uv，并在 services/h2-analytics 中执行 uv sync --locked --extra dev。' : 'Fixture 模式可运行；Local 模式需要 uv。',
  ))
  checks.push(check(
    'lockfiles',
    snapshot.packageLock && snapshot.uvLock ? 'pass' : 'fail',
    snapshot.packageLock && snapshot.uvLock ? 'Node 与 Python 锁文件均存在。' : '缺少 package-lock.json 或 services/h2-analytics/uv.lock。',
    '恢复仓库锁文件；不要使用未锁定依赖。',
  ))
  checks.push(check(
    'node_install',
    snapshot.nodeInstall ? 'pass' : 'fail',
    snapshot.nodeInstall ? 'Node 依赖安装状态可用。' : 'Node 依赖尚未按锁文件安装。',
    '在仓库根目录执行 npm ci。',
  ))
  checks.push(check(
    'python_install',
    snapshot.pythonInstall ? 'pass' : localRequired ? 'fail' : 'warning',
    snapshot.pythonInstall ? 'Python 锁定环境已创建。' : 'Python 锁定环境尚未创建。',
    '在 services/h2-analytics 中执行 uv sync --locked --extra dev。',
  ))
  checks.push(check(
    'web_port',
    snapshot.webPortAvailable ? 'pass' : 'fail',
    snapshot.webPortAvailable ? `Web 端口 ${snapshot.webPort} 可用。` : `Web 端口 ${snapshot.webPort} 已被占用。`,
    `停止占用进程或使用 --web-port 选择另一个 127.0.0.1 端口；doctor 不会终止外部进程。`,
  ))
  checks.push(check(
    'analytics_port',
    snapshot.mode === 'fixture' ? 'pass' : snapshot.analyticsPortAvailable ? 'pass' : 'fail',
    snapshot.mode === 'fixture'
      ? 'Fixture 模式不启动分析侧车。'
      : snapshot.analyticsPortAvailable
        ? `Analytics 端口 ${snapshot.analyticsPort} 可用。`
        : `Analytics 端口 ${snapshot.analyticsPort} 已被占用。`,
    `停止占用进程或使用 --analytics-port 选择另一个 127.0.0.1 端口；doctor 不会终止外部进程。`,
  ))
  checks.push(check(
    'loopback',
    snapshot.loopbackHost === LOOPBACK_HOST ? 'pass' : 'fail',
    `启动边界固定为 ${snapshot.loopbackHost}，模式为 ${snapshot.mode}。`,
    '只允许 fixture 或 local 模式，并保持监听地址为 127.0.0.1。',
  ))
  checks.push(check(
    'disk',
    snapshot.freeBytes !== null && snapshot.freeBytes >= MIN_FREE_BYTES ? 'pass' : 'fail',
    snapshot.freeBytes === null
      ? '无法读取工作区可用磁盘空间。'
      : `工作区可用空间约 ${Math.floor(snapshot.freeBytes / 1024 / 1024)} MiB。`,
    '至少保留 512 MiB：256 MiB 最大流式输入加 256 MiB 临时处理余量。',
    { requiredBytes: MIN_FREE_BYTES },
  ))
  checks.push(check(
    'stepfun',
    'pass',
    snapshot.stepFunConfigured ? 'StepFun 可选配置已存在（未读取或显示其值）。' : 'StepFun 可选配置未提供；确定性离线路径不受影响。',
  ))
  return checks
}

export async function runDoctor(options = parseArguments([])) {
  const snapshot = {
    mode: options.mode,
    webPort: options.webPort,
    analyticsPort: options.analyticsPort,
    loopbackHost: LOOPBACK_HOST,
    nodeVersion: process.version,
    npmVersion: npmVersion(),
    pythonVersion: findPythonVersion(),
    uvVersion: commandVersion(process.platform === 'win32' ? 'uv.exe' : 'uv'),
    packageLock: existsSync(resolve(repositoryRoot, 'package-lock.json')),
    uvLock: existsSync(resolve(repositoryRoot, 'services/h2-analytics/uv.lock')),
    nodeInstall: nodeInstallReady(),
    pythonInstall: pythonInstallReady(),
    webPortAvailable: await portAvailable(options.webPort),
    analyticsPortAvailable: options.mode === 'fixture' || await portAvailable(options.analyticsPort),
    freeBytes: availableBytes(repositoryRoot),
    stepFunConfigured: hasEnvironmentProperty(process.env, 'STEPFUN_API_KEY'),
  }
  const checks = evaluateDoctorSnapshot(snapshot)
  return {
    ok: checks.every(({ status }) => status !== 'fail'),
    evidenceScope: '当前工作区只读环境检查；不是换机、部署或生产证明。',
    checks,
  }
}

function printHumanReport(report) {
  console.log(report.ok ? 'H2 Sentinel 环境检查通过。' : 'H2 Sentinel 环境检查未通过。')
  for (const item of report.checks) {
    const marker = item.status === 'pass' ? '通过' : item.status === 'warning' ? '提示' : '失败'
    console.log(`[${marker}] ${item.summary}`)
    if (item.status !== 'pass' && item.action) console.log(`  处理建议：${item.action}`)
  }
  console.log(`证据边界：${report.evidenceScope}`)
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath.toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  try {
    const options = parseArguments(process.argv.slice(2))
    const report = await runDoctor(options)
    if (options.json) console.log(JSON.stringify(report, null, 2))
    else printHumanReport(report)
    if (!report.ok) process.exitCode = 1
  } catch {
    console.error('H2 Sentinel 环境检查参数无效；仅支持 --mode fixture|local、--web-port、--analytics-port 和 --json。')
    process.exitCode = 2
  }
}

export { LOOPBACK_HOST, MIN_FREE_BYTES, parseArguments }
