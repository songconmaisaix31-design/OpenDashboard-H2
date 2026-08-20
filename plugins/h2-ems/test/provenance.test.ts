import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, it } from 'node:test'

import type { H2ReportArtifact, H2ReportKind } from '@opendashboard/h2-contracts'

import { createFixtureH2EmsDataSource } from '../src/index.ts'

describe('H2 EMS provenance and reports', () => {
  it('maps every report kind to its canonical Fixture artifact format', async () => {
    const source = createFixtureH2EmsDataSource()
    const expectations = {
      single_event_diagnosis: {
        format: 'html',
        mediaType: 'text/html',
        filename: 'single_event_diagnosis-run-fixture-h2-sentinel-golden.html',
      },
      period_summary: {
        format: 'html',
        mediaType: 'text/html',
        filename: 'period_summary-run-fixture-h2-sentinel-golden.html',
      },
      analysis_result_json: {
        format: 'json',
        mediaType: 'application/json',
        filename: 'analysis_result_json-run-fixture-h2-sentinel-golden.json',
      },
      submission_csv: {
        format: 'csv',
        mediaType: 'text/csv',
        filename: 'submission_csv-run-fixture-h2-sentinel-golden.csv',
      },
      validation_metrics: {
        format: 'json',
        mediaType: 'application/json',
        filename: 'validation_metrics-run-fixture-h2-sentinel-golden.json',
      },
      quality_report: {
        format: 'html',
        mediaType: 'text/html',
        filename: 'quality_report-run-fixture-h2-sentinel-golden.html',
      },
    } as const satisfies Readonly<Record<H2ReportKind, Pick<H2ReportArtifact['descriptor'], 'format' | 'filename'> & Pick<H2ReportArtifact, 'mediaType'>>>

    for (const [kind, expected] of Object.entries(expectations) as readonly [
      H2ReportKind,
      (typeof expectations)[H2ReportKind],
    ][]) {
      const request =
        kind === 'single_event_diagnosis'
          ? { runId: 'run-fixture-h2-sentinel-golden', kind, eventId: 'C03-20260105-001' }
          : { runId: 'run-fixture-h2-sentinel-golden', kind }
      const report = await source.exportReport(request)
      const repeatedReport = await source.exportReport(request)

      assert.equal(report.descriptor.kind, kind)
      assert.equal(report.descriptor.format, expected.format)
      assert.equal(report.mediaType, expected.mediaType)
      assert.equal(report.descriptor.filename, expected.filename)
      assert.match(report.descriptor.filename, /^[a-z0-9][a-z0-9._-]*\.(html|json|csv)$/)
      assert.equal(report.descriptor.provenance.mode, 'FIXTURE')
      assert.equal(report.descriptor.contentHash, repeatedReport.descriptor.contentHash)
      assert.equal(report.content, repeatedReport.content)
      assert.equal(
        report.descriptor.contentHash,
        `sha256:${createHash('sha256').update(report.content).digest('hex')}`,
      )
      assert(!/[A-Za-z]:\\|\\\\/.test(report.content))

      if (expected.format === 'html') {
        assert.match(report.content, /^<!doctype html>/)
        assert.match(report.content, /run-fixture-h2-sentinel-golden/)
        assert.match(report.content, /Provenance mode<\/dt><dd>FIXTURE/)
        assert.match(report.content, /recommendations are advisory and require human confirmation/)
        assert.match(report.content, /Human confirmation required: true/)
      } else if (expected.format === 'json') {
        const payload: unknown = JSON.parse(report.content)
        assert.equal((payload as { reportKind?: unknown }).reportKind, kind)
      } else {
        assert.match(report.content, /^pred_event_id,/)
        assert.equal(report.content.split('\n').filter(Boolean).length, 3)
      }
    }
  })

  it('renders the C03 diagnosis as a safe HTML artifact and preserves submission export behavior', async () => {
    const source = createFixtureH2EmsDataSource()
    const report = await source.exportReport({
      runId: 'run-fixture-h2-sentinel-golden',
      kind: 'single_event_diagnosis',
      eventId: 'C03-20260105-001',
    })
    const submission = await source.exportSubmission('run-fixture-h2-sentinel-golden')

    assert.equal(report.mediaType, 'text/html')
    assert.equal(report.descriptor.filename, 'single_event_diagnosis-run-fixture-h2-sentinel-golden.html')
    assert.match(report.content, /Event ID<\/dt><dd>C03-20260105-001/)
    assert.doesNotMatch(report.content, /<script/i)
    assert.equal(submission.mediaType, 'text/csv')
    assert.match(submission.content, /^pred_event_id,/)
    assert.equal(submission.content, (await source.exportReport({
      runId: 'run-fixture-h2-sentinel-golden',
      kind: 'submission_csv',
    })).content)
  })
})
