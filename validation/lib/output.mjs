import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, realpathSync } from 'node:fs'
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

export function repositoryRelativePath(path) {
  const resolved = canonicalFuturePath(path)
  const value = relative(canonicalRepositoryRoot, resolved)
  if (
    value === '' ||
    value === '..' ||
    value.startsWith(`..${sep}`) ||
    isAbsolute(value)
  ) {
    throw new Error('Generated output must remain inside this repository.')
  }
  return value.split(sep).join('/')
}

export function ensureIgnoredOutputPath(path) {
  const resolved = canonicalFuturePath(path)
  const relativePath = repositoryRelativePath(resolved)
  const ignored = spawnSync(
    'git',
    ['check-ignore', '--quiet', '--no-index', '--', relativePath],
    {
      cwd: canonicalRepositoryRoot,
      shell: false,
      stdio: 'ignore',
      windowsHide: true,
    },
  )
  if (ignored.error || ignored.status !== 0) {
    throw new Error('Generated output must be covered by repository Git ignore rules.')
  }
  return resolved
}

export function ensureIgnoredOutputDirectory(path) {
  const resolved = ensureIgnoredOutputPath(path)
  mkdirSync(resolved, { recursive: true })
  return resolved
}
