import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'

import { repositoryRoot } from './official-contract.mjs'

function git(repository, argumentsList) {
  const result = spawnSync('git', argumentsList, {
    cwd: repository,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  })
  if (result.error || result.status !== 0) {
    throw new Error('The current candidate state could not be read.')
  }
  return result.stdout
}

function relativeInside(repository, candidate) {
  const value = relative(repository, candidate)
  return value !== '' && value !== '..' && !value.startsWith(`..${sep}`) && !isAbsolute(value)
    ? value.split(sep).join('/')
    : null
}

function registeredNestedWorktrees(repository) {
  const canonicalRepository = realpathSync(repository)
  return git(repository, ['worktree', 'list', '--porcelain'])
    .split(/\r?\n/)
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length))
    .map((path) => {
      try {
        return relativeInside(canonicalRepository, realpathSync(path))
      } catch {
        throw new Error('A registered worktree path could not be verified.')
      }
    })
    .filter(Boolean)
}

function pathIsNestedWorktree(path, worktrees) {
  const normalized = path.replaceAll('\\', '/').replace(/\/$/, '')
  return worktrees.some((root) => normalized === root || normalized.startsWith(`${root}/`))
}

function visibleStatusClean(repository, worktrees) {
  const entries = git(repository, [
    'status',
    '--porcelain=v1',
    '-z',
    '--untracked-files=all',
  ]).split('\0').filter(Boolean)
  return entries.every((entry) => {
    if (!entry.startsWith('?? ')) return false
    return pathIsNestedWorktree(entry.slice(3), worktrees)
  })
}

function noInfoOrGlobalExcludedSources(repository, worktrees) {
  const entries = git(repository, [
    'ls-files',
    '--others',
    '-z',
    '--exclude-per-directory=.gitignore',
  ]).split('\0').filter(Boolean)
  return entries.every((path) => pathIsNestedWorktree(path, worktrees))
}

const EXPECTED_IGNORED_ARTIFACTS = [
  /^node_modules\//,
  /^apps\/web\/dist\//,
  /^coverage\//,
  /^\.codegraph\//,
  /^playwright-report\//,
  /^test-results\//,
  /^services\/h2-analytics\/\.venv\//,
  /^services\/h2-analytics\/artifacts\//,
  /^scripts\/h2-sentinel\/artifacts\//,
  /^tests\/h2-sentinel\/reports\/generated(?:\/|$)/,
  // [A2/T02] 基线冻结目录（api.md 通用约定：validation/baseline/*.json gitignored）。
  // T01 只补了 .gitignore 条目而漏了本白名单，基线落盘会误判 trackedTreeClean=false 并锁死全链评估工具。
  /^validation\/baseline(?:\/|$)/,
  /(?:^|\/)__pycache__\//,
  /(?:^|\/)\.pytest_cache\//,
  /(?:^|\/)[^/]+\.egg-info\//,
  /\.tsbuildinfo$/,
  /(?:^|\/)npm-debug\.log[^/]*$/,
]

const GENERATED_PARENT_ENTRIES = new Set([
  'tests/',
  'tests/h2-sentinel/',
  'tests/h2-sentinel/reports/',
])

function noUnexpectedIgnoredPaths(repository, worktrees) {
  const entries = git(repository, [
    'ls-files',
    '--others',
    '--ignored',
    '--exclude-standard',
    '--directory',
    '-z',
  ]).split('\0').filter(Boolean).map((path) => path.replaceAll('\\', '/'))
  const hasGeneratedArtifact = entries.some((path) =>
    /^tests\/h2-sentinel\/reports\/generated(?:\/|$)/.test(path),
  )
  return entries.every((path) =>
    pathIsNestedWorktree(path, worktrees) ||
    (hasGeneratedArtifact && GENERATED_PARENT_ENTRIES.has(path)) ||
    EXPECTED_IGNORED_ARTIFACTS.some((pattern) => pattern.test(path)),
  )
}

export function currentCandidate(repository = repositoryRoot) {
  const canonicalRepository = realpathSync(resolve(repository))
  const commit = git(canonicalRepository, ['rev-parse', 'HEAD']).trim().toLowerCase()
  if (!/^[a-f0-9]{40}$/.test(commit)) {
    throw new Error('The current candidate commit could not be resolved.')
  }
  const worktrees = registeredNestedWorktrees(canonicalRepository)
  return {
    commit,
    trackedTreeClean:
      visibleStatusClean(canonicalRepository, worktrees) &&
      noInfoOrGlobalExcludedSources(canonicalRepository, worktrees) &&
      noUnexpectedIgnoredPaths(canonicalRepository, worktrees),
  }
}

export function assertExactCleanCandidate(expectedCommit) {
  const normalized = expectedCommit.trim().toLowerCase()
  if (!/^[a-f0-9]{40}$/.test(normalized)) {
    throw new Error('Candidate commit must be a full lowercase 40-character SHA.')
  }
  const candidate = currentCandidate()
  if (candidate.commit !== normalized) {
    throw new Error('Candidate commit does not match the current HEAD.')
  }
  if (!candidate.trackedTreeClean) {
    throw new Error('Candidate evidence requires a clean working tree and index.')
  }
  return candidate
}
