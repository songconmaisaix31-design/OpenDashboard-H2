import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  ensureIgnoredOutputPath,
  ensureIgnoredOutputDirectory,
  repositoryRelativePath,
  resolveGeneratedReportsRoot,
  writeFileAtomic,
} from '../../../validation/lib/output.mjs'
import {
  assertLoopbackHttp,
  requestEnvelope,
  resolveLoopbackRoute,
  terminateExactChildTree,
  waitForLauncherReady,
} from '../../../validation/lib/launcher.mjs'

const directory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(directory, '../../..')

const evidenceFiles = [
  'tests/h2-sentinel/ACCEPTANCE_MATRIX.md',
  'tests/h2-sentinel/DEFECT_LOG.md',
  'tests/h2-sentinel/HANDOFF.md',
  'tests/h2-sentinel/reports/ASSEMBLED_QA_EVIDENCE.md',
  'submission/h2-sentinel/README.md',
  'submission/h2-sentinel/CLAIMS_LEDGER.md',
  'submission/h2-sentinel/DEMO_SCRIPT.md',
  'submission/h2-sentinel/JUDGE_CHECKLIST.md',
  'submission/h2-sentinel/RUNTIME_EVIDENCE_CHECKLIST.md',
  'submission/h2-sentinel/HANDOFF.md',
]

function readRepositoryFile(relativePath) {
  return readFileSync(resolve(repositoryRoot, relativePath), 'utf8')
}

describe('H2 Sentinel remediation evidence boundaries', () => {
  it('accepts only literal loopback HTTP evidence endpoints', () => {
    assert.equal(assertLoopbackHttp('http://127.0.0.1:43123/'), true)
    assert.equal(assertLoopbackHttp('http://localhost:43123/'), false)
    assert.equal(assertLoopbackHttp('https://127.0.0.1:43123/'), false)
    assert.equal(assertLoopbackHttp('http://127.0.0.1:43123@invalid.example/'), false)
    assert.equal(resolveLoopbackRoute('http://127.0.0.1:43123/', '/health').href, 'http://127.0.0.1:43123/health')
    for (const route of [
      'https://invalid.example/api',
      '//invalid.example/api',
      'http://127.0.0.1:43124/api',
    ]) {
      assert.throws(
        () => resolveLoopbackRoute('http://127.0.0.1:43123/', route),
        /root-relative|escaped/,
      )
    }
  })

  it('rejects HTTP redirects without contacting the redirect target', async () => {
    let targetRequests = 0
    const server = createServer((request, response) => {
      if (request.url === '/redirect') {
        response.writeHead(302, { location: '/target' })
        response.end()
        return
      }
      targetRequests += 1
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end('{"ok":true,"data":{}}')
    })
    await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise))
    try {
      const address = server.address()
      await assert.rejects(
        requestEnvelope(`http://127.0.0.1:${address.port}/`, '/redirect'),
      )
      assert.equal(targetRequests, 0)
    } finally {
      await new Promise((resolvePromise) => server.close(resolvePromise))
    }
  })

  it('listens for spawn errors and terminates only the exact launched child PID', async () => {
    const spawnFailure = new EventEmitter()
    spawnFailure.exitCode = null
    spawnFailure.signalCode = null
    const readiness = waitForLauncherReady(spawnFailure, [], 1_000)
    spawnFailure.emit('error', new Error('sensitive path must not escape'))
    await assert.rejects(readiness, /Launcher spawn failed/)

    const child = new EventEmitter()
    child.pid = 43_210
    child.exitCode = null
    child.signalCode = null
    const terminated = []
    await terminateExactChildTree(child, {
      timeoutMs: 100,
      terminate: async (pid) => {
        terminated.push(pid)
        child.exitCode = 1
        child.emit('exit', 1, null)
      },
    })
    assert.deepEqual(terminated, [43_210])

    const alreadyExited = new EventEmitter()
    alreadyExited.pid = 43_211
    alreadyExited.exitCode = null
    alreadyExited.signalCode = 'SIGTERM'
    await terminateExactChildTree(alreadyExited, {
      terminate: async (pid) => terminated.push(pid),
    })
    assert.deepEqual(terminated, [43_210])
  })

  it('accepts only repository-relative ignored evidence outputs', () => {
    const ignored = resolve(
      repositoryRoot,
      'tests/h2-sentinel/reports/generated/output-boundary/report.json',
    )
    assert.equal(
      repositoryRelativePath(ignored),
      'tests/h2-sentinel/reports/generated/output-boundary/report.json',
    )
    assert.equal(ensureIgnoredOutputPath(ignored), ignored)
    assert.throws(
      () => ensureIgnoredOutputPath(
        resolve(repositoryRoot, 'tests/h2-sentinel/reports/not-ignored.json'),
      ),
      /tests\/h2-sentinel\/reports\/generated/,
    )
  })

  it('resolves the canonical generated prefix when the ignored directory is absent', () => {
    const repository = mkdtempSync(join(tmpdir(), 'h2-missing-generated-root-'))
    try {
      assert.equal(
        resolveGeneratedReportsRoot(repository),
        join(repository, 'tests', 'h2-sentinel', 'reports', 'generated'),
      )
    } finally {
      rmSync(repository, { recursive: true, force: true })
    }
  })

  it('rejects arbitrary ignored locations and never overwrites existing output', () => {
    for (const candidate of [
      '.env.local',
      'node_modules/evidence.json',
      'apps/web/dist/evidence.json',
      'tests/h2-sentinel/HANDOFF.md',
    ]) {
      assert.throws(
        () => ensureIgnoredOutputPath(resolve(repositoryRoot, candidate)),
        /tests\/h2-sentinel\/reports\/generated/,
      )
    }
    const outputDirectory = resolve(
      repositoryRoot,
      `tests/h2-sentinel/reports/generated/output-safety-${process.pid}-${Date.now()}`,
    )
    try {
      ensureIgnoredOutputDirectory(outputDirectory)
      const output = resolve(outputDirectory, 'report.json')
      writeFileAtomic(output, '{"fresh":true}\n')
      assert.equal(readFileSync(output, 'utf8'), '{"fresh":true}\n')
      assert.throws(() => ensureIgnoredOutputPath(output), /must not already exist/)
      assert.throws(() => writeFileAtomic(output, '{"fresh":false}\n'), /must not already exist/)
      assert.equal(readFileSync(output, 'utf8'), '{"fresh":true}\n')
    } finally {
      rmSync(outputDirectory, { recursive: true, force: true })
    }
  })

  it('records the bounded package-integrity result without claiming a full match', () => {
    const combined = evidenceFiles.map(readRepositoryFile).join('\n')
    assert.match(combined, /all data\/material entries plus the workbook match/i)
    assert.match(combined, /21 of 24 total manifest entries/i)
    assert.match(
      combined,
      /three top-level requirement\/README Markdown or DOCX files differ/i,
    )
    assert.match(combined, /package remains read-only/i)
    assert.doesNotMatch(combined, /official package has full manifest integrity[^|]*\|\s*(?:verified|pass)/i)
  })

  it('rejects stale official-package availability wording', () => {
    const combined = evidenceFiles.map(readRepositoryFile).join('\n')
    for (const phrase of [
      'No authorized official package was processed',
      'No official package was processed',
      'Official package/slice: not supplied or generated in P1-W3',
      'P1-W3 produced no such receipt',
      'Awaiting official package',
    ]) {
      assert.ok(!combined.includes(phrase), phrase)
    }
  })

  it('keeps final official metrics, screenshots, receipt, and SHA coordinator-owned', () => {
    const combined = evidenceFiles.map(readRepositoryFile).join('\n')
    for (const requiredBoundary of [
      'final official metric',
      'retained screenshot',
      'measured receipt',
      'final candidate SHA',
      'coordinator',
    ]) {
      assert.match(combined, new RegExp(requiredBoundary, 'i'))
    }
  })

  it('keeps scripted timing scope explicit and execution identity separate from analytics identity', () => {
    const demo = readRepositoryFile('submission/h2-sentinel/DEMO_SCRIPT.md')
    const runner = readRepositoryFile('validation/run-demo.mjs')
    const validator = readRepositoryFile(
      'tests/h2-sentinel/scripts/validate-demo-receipt.mjs',
    )
    assert.match(demo, /outside the measured window/i)
    assert.match(demo, /import, analysis,[\s\S]*evidence read,[\s\S]*human review,[\s\S]*Q09 diagnosis/i)
    assert.match(runner, /executionId/)
    assert.match(validator, /executionId/)
    assert.match(demo, /analytics `runId` may repeat/i)
  })

  it('re-checks the exact candidate after both measured runs and before receipt issuance', () => {
    const runner = readRepositoryFile('validation/run-demo.mjs')
    const candidateCheck = 'assertExactCleanCandidate(options.candidateCommit)'
    const firstCheck = runner.indexOf(candidateCheck)
    const runLoop = runner.indexOf('for (const sequence of [1, 2])')
    const completedCheck = runner.indexOf(
      candidateCheck,
      firstCheck + candidateCheck.length,
    )
    const receipt = runner.indexOf('const receipt =', completedCheck)

    assert.ok(firstCheck >= 0)
    assert.ok(runLoop > firstCheck)
    assert.ok(completedCheck > runLoop)
    assert.ok(receipt > completedCheck)
  })
})
