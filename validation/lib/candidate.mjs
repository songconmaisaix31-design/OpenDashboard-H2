import { spawnSync } from 'node:child_process'

import { repositoryRoot } from './official-contract.mjs'

export function currentCandidate() {
  const head = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  })
  const commit = head.stdout.trim().toLowerCase()
  if (head.status !== 0 || !/^[a-f0-9]{40}$/.test(commit)) {
    throw new Error('The current candidate commit could not be resolved.')
  }
  const status = spawnSync(
    'git',
    ['status', '--porcelain', '--untracked-files=normal'],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
    },
  )
  if (status.status !== 0) throw new Error('The current candidate status could not be read.')
  return { commit, trackedTreeClean: status.stdout.trim() === '' }
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
    throw new Error('Candidate evidence requires a clean working tree.')
  }
  return candidate
}
