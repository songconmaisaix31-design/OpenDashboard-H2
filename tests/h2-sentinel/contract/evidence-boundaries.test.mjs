import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  ensureIgnoredOutputPath,
  repositoryRelativePath,
} from '../../../validation/lib/output.mjs'
import { assertLoopbackHttp } from '../../../validation/lib/launcher.mjs'

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
      /Git ignore rules/,
    )
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
