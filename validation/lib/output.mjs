import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  linkSync,
  mkdirSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'

import { repositoryRoot } from './official-contract.mjs'

const canonicalRepositoryRoot = realpathSync(repositoryRoot)

function canonicalFuturePath(path) {
  const missing = []
  let cursor = resolve(path)
  while (!existsSync(cursor)) {
    const parent = dirname(cursor)
    if (parent === cursor) throw new Error('Generated output has no existing ancestor.')
    missing.unshift(basename(cursor))
    cursor = parent
  }
  return resolve(realpathSync(cursor), ...missing)
}

export function resolveGeneratedReportsRoot(root = repositoryRoot) {
  const canonicalRoot = realpathSync(resolve(root))
  return canonicalFuturePath(
    resolve(canonicalRoot, 'tests/h2-sentinel/reports/generated'),
  )
}

export const generatedReportsRoot = resolveGeneratedReportsRoot()

function pathWithin(parent, candidate) {
  const value = relative(parent, candidate)
  return value !== '' && value !== '..' && !value.startsWith(`..${sep}`) && !isAbsolute(value)
}

function gitPathTracked(relativePath) {
  const result = spawnSync('git', ['ls-files', '--error-unmatch', '--', relativePath], {
    cwd: canonicalRepositoryRoot,
    shell: false,
    stdio: 'ignore',
    windowsHide: true,
  })
  if (result.error || ![0, 1].includes(result.status)) {
    throw new Error('Generated output tracking state could not be verified.')
  }
  return result.status === 0
}

export function repositoryRelativePath(path) {
  const resolved = canonicalFuturePath(path)
  const value = relative(canonicalRepositoryRoot, resolved)
  if (!pathWithin(canonicalRepositoryRoot, resolved)) {
    throw new Error('Generated output must remain inside this repository.')
  }
  return value.split(sep).join('/')
}

export function ensureIgnoredOutputPath(path) {
  const resolved = canonicalFuturePath(path)
  if (!pathWithin(generatedReportsRoot, resolved)) {
    throw new Error('Generated output must remain under tests/h2-sentinel/reports/generated.')
  }
  const relativePath = repositoryRelativePath(resolved)
  if (gitPathTracked(relativePath)) {
    throw new Error('Generated output must not target a tracked path.')
  }
  if (existsSync(resolved)) {
    throw new Error('Generated output candidate must not already exist.')
  }
  return resolved
}

export function ensureIgnoredOutputDirectory(path) {
  const resolved = ensureIgnoredOutputPath(path)
  if (!existsSync(generatedReportsRoot)) {
    mkdirSync(generatedReportsRoot, { recursive: true })
  }
  const parent = canonicalFuturePath(dirname(resolved))
  if (!existsSync(parent)) {
    throw new Error('Generated output parent directory must already exist.')
  }
  mkdirSync(resolved, { recursive: false })
  return resolved
}

export function createGeneratedRunDirectory(tool, candidateCommit) {
  if (!/^[a-z0-9-]+$/.test(tool)) throw new Error('Generated tool name is invalid.')
  if (!/^[a-f0-9]{40}$/.test(candidateCommit)) throw new Error('Candidate commit is invalid.')
  return ensureIgnoredOutputDirectory(
    resolve(generatedReportsRoot, `${tool}-${candidateCommit.slice(0, 12)}-${randomUUID()}`),
  )
}

export function writeFileAtomic(path, content) {
  const destination = ensureIgnoredOutputPath(path)
  const parent = realpathSync(dirname(destination))
  if (
    parent !== generatedReportsRoot &&
    !pathWithin(generatedReportsRoot, parent)
  ) {
    throw new Error('Atomic output must remain under the generated root.')
  }
  const temporary = resolve(parent, `.${basename(destination)}.${randomUUID()}.tmp`)
  try {
    writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx' })
    linkSync(temporary, destination)
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary)
  }
  return destination
}
