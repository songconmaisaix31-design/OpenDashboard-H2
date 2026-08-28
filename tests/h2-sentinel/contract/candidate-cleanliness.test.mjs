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

describe('H2 Sentinel candidate cleanliness', () => {
  it('ignores unrelated untracked worktree paths but rejects tracked and index edits', () => {
    const repository = mkdtempSync(join(tmpdir(), 'h2-candidate-cleanliness-'))
    const trackedPath = join(repository, 'tracked.txt')
    try {
      git(repository, ['init'])
      git(repository, ['config', 'user.name', 'H2 Sentinel Test'])
      git(repository, ['config', 'user.email', 'h2-sentinel@example.invalid'])
      writeFileSync(trackedPath, 'committed\n', 'utf8')
      git(repository, ['add', 'tracked.txt'])
      git(repository, ['commit', '-m', 'test: seed candidate'])
      const commit = git(repository, ['rev-parse', 'HEAD']).toLowerCase()

      const unrelatedWorktree = join(repository, 'unrelated-worktree')
      mkdirSync(unrelatedWorktree)
      writeFileSync(join(unrelatedWorktree, 'worker-output.txt'), 'unrelated\n', 'utf8')
      assert.match(
        git(repository, ['status', '--porcelain', '--untracked-files=normal']),
        /^\?\? unrelated-worktree\/$/m,
      )
      assert.deepEqual(currentCandidate(repository), {
        commit,
        trackedTreeClean: true,
      })

      writeFileSync(trackedPath, 'unstaged edit\n', 'utf8')
      assert.equal(currentCandidate(repository).trackedTreeClean, false)

      writeFileSync(trackedPath, 'committed\n', 'utf8')
      assert.equal(currentCandidate(repository).trackedTreeClean, true)

      writeFileSync(trackedPath, 'staged edit\n', 'utf8')
      git(repository, ['add', 'tracked.txt'])
      assert.equal(currentCandidate(repository).trackedTreeClean, false)
    } finally {
      rmSync(repository, { recursive: true, force: true })
    }
  })
})
