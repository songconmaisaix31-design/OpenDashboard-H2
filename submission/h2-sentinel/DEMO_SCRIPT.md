# H2 Sentinel Three-Minute Validation-Slice Demo

## Evidence gate

This is the operational script for the primary P1 demo. It is not yet a timed pass:
P1-W3 did not receive an official-package path, did not generate an
official validation slice, and did not produce two measured final-integrated
runs. Do not call this a three-minute pass until
validate-demo-receipt.mjs accepts the final receipt and artifacts for the exact
integrated commit.

Services are started before timing. Installation and launcher startup are
demonstrated separately and must remain listed as exclusions in the receipt.

## Preparation outside the timed window

1. Independently obtain the SHA-256 values of the public validation timeseries
   and event-label CSV files.
2. Run prepare-validation-slice.mjs with the explicit official-package
   directory, package-relative source files, both expected hashes, and a new
   directory below tests/h2-sentinel/reports/generated/.
3. Inspect validation-slice-manifest.json: the selected event must be the
   chronologically earliest public C04 event, the requested range must add 30
   minutes on both sides, and validation-slice.csv must contain no label
   columns.
4. Start the final integrated Local launcher. Confirm the Web and analytics
   endpoints are loopback-only before opening the timed route.
5. Create distinct artifact directories for measured runs 1 and 2. Never
   overwrite one run with the other.

The public labels stay in the ignored QA manifest. Only validation-slice.csv
may be imported into analytics.

## Timed path — target under 180 seconds

| Budget | Judge action | Visible evidence and narration |
| --- | --- | --- |
| 00:00–00:25 | Import validation-slice.csv. | Show LIVE_ANALYSIS · 验证集切片, dataset fingerprint, source range, row count, and quality state. State that this is a prepared public-validation slice, not full validation or an organizer score. |
| 00:25–01:00 | Run deterministic analysis and open Event Center. | Select the detected C04 candidate without importing the public-label manifest. Show that analysis is local and independent of an LLM. |
| 01:00–01:30 | Open diagnosis detail. | Show event timing, synchronized evidence, exact impact value/formula/unit/assumptions, safety checks, and provenance. Do not claim the public label proves the detector result. |
| 01:30–01:55 | Perform human review. | Confirm or reject, add a note, and show the new revision. Explain that the local actor label is unverified attribution and that review does not mutate detector fields. |
| 01:55–02:25 | Run official question Q09. | Show the deterministic Chinese answer, matching event/report citation, and generated 氢哨异常诊断报告. State that every recommendation still requires human confirmation. |
| 02:25–02:45 | Export review audit and submission. | Download review_audit_json and submission.csv. Show that review history is in the audit export while the frozen 16 submission columns and event identity remain unchanged. |
| 02:45–03:00 | Close with hashes and limits. | Show report, audit, submission, detector-input, manifest, and source hashes. State the validation-slice scope and the excluded startup/install time. |

## Receipt gate

Record these fields for each run without absolute local paths:

- distinct run ID and analyzed event ID;
- start/end timestamps, total duration, and positive stage durations for
  import, analysis, evidence_review, human_review, q09_report, and
  artifact_export;
- Live validation-slice provenance and
  publicLabelsUsedAsDetectorInput: false;
- relative artifact paths and SHA-256 values for the diagnosis HTML,
  review-audit JSON, and submission.csv.

After two consecutive successful runs, validate the receipt against the exact
manifest, artifact root, and final integrated SHA:

    node tests/h2-sentinel/scripts/validate-demo-receipt.mjs
      --receipt tests/h2-sentinel/reports/generated/final/demo-receipt.json
      --manifest tests/h2-sentinel/reports/generated/final/validation-slice-manifest.json
      --artifacts-root tests/h2-sentinel/reports/generated/final/artifacts
      --expected-commit <40-character-final-integrated-sha>

Only a successful validator result permits the wording “two consecutive
validation-slice runs completed in under 180 seconds each.” It still does not
permit an organizer-score, full-validation, hidden-test, deployment, or
production claim.

## Fixture fallback

Fixture may be shown only as a separately labeled fallback:

“This is FIXTURE · 固定样例, a sanitized synthetic regression path. It
demonstrates the interaction model but does not replace the validation-slice
run and is excluded from the timed receipt.”

If either Live run fails, exceeds the budget, loses provenance, imports labels,
or produces a hash mismatch, the timed demo is failed. Do not substitute
Fixture, edit the receipt, or describe a partial run as passing.
