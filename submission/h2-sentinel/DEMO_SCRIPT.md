# H2 Sentinel Three-Minute Validation-Slice Demo

## Evidence gate

This is a reproducible scripted local workflow, not a claimed timed pass. The
coordinator may claim the three-minute target only after
`validation/run-demo.mjs` completes two executions from one clean final
integrated SHA and `validate-demo-receipt.mjs` accepts every referenced file.

The script starts a fresh Local launcher before each execution. Launcher
startup and dependency installation are outside the measured window and are
listed as exclusions. The measured window covers only import, analysis,
evidence read, human review, Q09 diagnosis, review-audit export, and submission
export.

## Preparation outside the timed window

1. Independently obtain expected SHA-256 values for the public validation
   timeseries and event-label CSV files.
2. Run `prepare-validation-slice.mjs` with the explicit read-only package,
   package-relative files, both expected hashes, and a new ignored output
   directory.
3. Inspect the manifest: it must select the earliest C04, add 30 minutes on
   both sides, contain only relative paths, and keep public labels separate.
4. Confirm `validation-slice.csv` has the exact official 69 detector fields and
   no label column.
5. Confirm the final candidate is clean and provide its exact SHA to the demo
   runner. Never overwrite output from an earlier execution.

The public labels stay in the ignored QA manifest. Only the detector CSV is
sent to analytics.

## Scripted path — target below 180 seconds

| Stage | Scripted action | Evidence boundary |
| --- | --- | --- |
| import | Import the prepared detector CSV. | Require LIVE_ANALYSIS and validation-slice provenance, fingerprint, range, row count, and quality. |
| analysis | Run deterministic analysis and select an overlapping C04 candidate. | Public labels are read only after analysis for comparison. |
| evidence_review | Read the event evidence from the public loopback API. | Require timing, evidence, impact, safety, and provenance. |
| human_review | Confirm the event with revision 0 and a unique request ID. | Require revision 1; local actor attribution remains unverified. |
| q09_report | Request official Q09 and its deterministic Chinese diagnosis HTML. | Require matching event/report citations and human-confirmation wording. |
| artifact_export | Export review audit and exact 16-column submission. | Require review only in audit, then run the exact submission checker. |

## Receipt gate

Each run records a distinct runner-generated `executionId`. The deterministic
analytics `runId` may repeat when identical detector bytes are analyzed in
fresh service processes; it is therefore not used as execution identity. The
receipt records sequences 1 and 2, positive stage durations, strict
sub-180,000-ms measured totals, relative artifact paths, recomputed SHA-256
values, exact candidate SHA, and explicit false claim flags.

Run the validator after both executions:

    node tests/h2-sentinel/scripts/validate-demo-receipt.mjs \
      --receipt tests/h2-sentinel/reports/generated/final/demo-receipt.json \
      --manifest tests/h2-sentinel/reports/generated/final/validation-slice-manifest.json \
      --artifacts-root tests/h2-sentinel/reports/generated/final/artifacts \
      --expected-commit <40-character-final-integrated-sha>

Only a passing final-candidate receipt permits the sub-180-second wording. It
does not permit organizer-score, full-validation, hidden-test, deployment, or
production claims.

## Fixture fallback

Fixture may be shown only as a separately labeled fallback:

“This is FIXTURE · 固定样例, a sanitized synthetic regression path. It
demonstrates the interaction model but does not replace the validation-slice
run and is excluded from the timed receipt.”

If either Live execution fails, exceeds the target, loses provenance, imports
labels, or produces a hash mismatch, the demo gate fails. Do not substitute
Fixture, edit the receipt, or describe a partial execution as passing.
