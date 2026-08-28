import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { currentCandidate } from '../../../validation/lib/candidate.mjs'

function git(repository, args) {
  const result = spawnSync('git', args, {
    cwd: repository,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

function createRepository() {
  const repository = mkdtempSync(join(tmpdir(), 'h2-candidate-cleanliness-'))
  git(repository, ['init'])
  git(repository, ['config', 'user.name', 'H2 Sentinel Test'])
  git(repository, ['config', 'user.email', 'h2-sentinel@example.invalid'])
  writeFileSync(
    join(repository, '.gitignore'),
    'tests/h2-sentinel/reports/generated/\n.env.*\n',
    'utf8',
  )
  writeFileSync(join(repository, 'tracked.txt'), 'committed\n', 'utf8')
  git(repository, ['add', '.gitignore', 'tracked.txt'])
  git(repository, ['commit', '-m', 'test: seed candidate'])
  return repository
}

describe('H2 Sentinel candidate cleanliness', () => {
  it('rejects ordinary untracked, tracked, index, and info-excluded source changes', () => {
    const repository = createRepository()
    try {
      const untrackedPath = join(repository, 'untracked-source.mjs')
      writeFileSync(untrackedPath, 'export const unsafe = true\n', 'utf8')
      assert.equal(currentCandidate(repository).trackedTreeClean, false)
      rmSync(untrackedPath)

      const ignoredConfig = join(repository, '.env.local')
      writeFileSync(ignoredConfig, 'TEST_ONLY=redacted\n', 'utf8')
      assert.equal(currentCandidate(repository).trackedTreeClean, false)
      rmSync(ignoredConfig)

      writeFileSync(join(repository, '.git', 'info', 'exclude'), 'hidden-config.json\n', 'utf8')
      writeFileSync(join(repository, 'hidden-config.json'), '{}\n', 'utf8')
      assert.equal(currentCandidate(repository).trackedTreeClean, false)
      rmSync(join(repository, 'hidden-config.json'))

      const globalExcludes = join(repository, '.git', 'test-global-excludes')
      writeFileSync(globalExcludes, 'global-hidden.json\n', 'utf8')
      git(repository, ['config', 'core.excludesFile', globalExcludes])
      writeFileSync(join(repository, 'global-hidden.json'), '{}\n', 'utf8')
      assert.equal(currentCandidate(repository).trackedTreeClean, false)
      rmSync(join(repository, 'global-hidden.json'))

      writeFileSync(join(repository, 'tracked.txt'), 'unstaged edit\n', 'utf8')
      assert.equal(currentCandidate(repository).trackedTreeClean, false)
      writeFileSync(join(repository, 'tracked.txt'), 'committed\n', 'utf8')
      writeFileSync(join(repository, 'tracked.txt'), 'staged edit\n', 'utf8')
      git(repository, ['add', 'tracked.txt'])
      assert.equal(currentCandidate(repository).trackedTreeClean, false)
    } finally {
      rmSync(repository, { recursive: true, force: true })
    }
  })

  it('allows only repository-ignored generated artifacts and exact registered nested worktrees', () => {
    const repository = createRepository()
    const nestedWorktree = join(repository, 'registered-worker')
    try {
      const generated = join(repository, 'tests', 'h2-sentinel', 'reports', 'generated', 'run')
      mkdirSync(generated, { recursive: true })
      writeFileSync(join(generated, 'report.json'), '{}\n', 'utf8')
      const ignoredEntries = git(repository, [
        'ls-files', '--others', '--ignored', '--exclude-standard', '--directory',
      ])
      assert.equal(currentCandidate(repository).trackedTreeClean, true, ignoredEntries)

      git(repository, ['branch', 'worker-test'])
      git(repository, ['worktree', 'add', nestedWorktree, 'worker-test'])
      writeFileSync(join(nestedWorktree, 'worker-output.txt'), 'worker-only\n', 'utf8')
      assert.equal(currentCandidate(repository).trackedTreeClean, true)
    } finally {
      if (spawnSync('git', ['worktree', 'list'], { cwd: repository }).status === 0) {
        spawnSync('git', ['worktree', 'remove', '--force', nestedWorktree], {
          cwd: repository,
          windowsHide: true,
        })
      }
      rmSync(repository, { recursive: true, force: true })
    }
  })
})
