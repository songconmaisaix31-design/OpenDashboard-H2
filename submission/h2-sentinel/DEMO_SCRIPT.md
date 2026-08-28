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
3. Require the exact official validation identities before slicing: 129,600
   timeseries rows with SHA-256
   `182728b3a4c5326503a90a04325adcf97fddc290c59ed1e319fa7e8be97d9666`,
   and 70 unique label events with SHA-256
   `47989467020fad5499168179716ce93da4585e8204dad80b71cfd803231d0cf4`.
   The preparation tool verifies the complete timeseries as a stream before it
   retains only the directed interval; it does not materialize the full matrix.
4. Inspect the manifest: it must select the independently frozen directed C04
   event, add 30 minutes on both sides, contain only relative paths, and keep
   public labels separate.
5. Confirm `validation-slice.csv` has the exact official 69 detector fields and
   no label column.
6. Confirm the final candidate is clean and provide its exact SHA to the demo
   runner. Use fresh, different directories for the slice manifest and demo
   artifacts root; never overwrite output from an earlier execution.

Public label data may select the directed demonstration before analysis, but
it stays in the ignored QA manifest and is never sent to the detector. Only
the 69-field detector CSV is sent to analytics.

## Scripted path — target below 180 seconds

| Stage | Scripted action | Evidence boundary |
| --- | --- | --- |
| import | Import the prepared detector CSV. | Require the actual LIVE_ANALYSIS source, source filename, fingerprint, range, row count, and quality. |
| analysis | Run deterministic analysis and select an overlapping C04 candidate. | Bind the completed lifecycle and dataset-analysis provenance to the verified import; labels are absent from the request. |
| evidence_review | Read the event evidence from the public loopback API. | Persist canonical response JSON and bind its relative path, SHA-256, run, event, anomaly code, ordered evidence IDs, and count. |
| human_review | Confirm the event with revision 0 and a unique request ID. | Bind run, event, request, confirm action, revision 1, local actor, and `replayed=false`; actor attribution remains unverified. |
| q09_report | Request official Q09 and its deterministic Chinese diagnosis HTML. | Bind renderer timestamps to analysis `completedAt`, require matching event/report citations, and require the exact controlled value `所有操作建议均须人工确认`. |
| artifact_export | Persist the evidence response and export review audit plus the exact 16-column submission. | Rehash every fresh artifact, require review only in audit, then run the exact submission checker. |

## Receipt gate

Each run records a distinct runner-generated `executionId`. The deterministic
analytics `runId` may repeat when identical detector bytes are analyzed in
fresh service processes; it is therefore not used as execution identity. The
receipt records sequences 1 and 2, positive stage durations, strict
sub-180,000-ms measured totals, relative artifact paths, recomputed SHA-256
values, exact candidate SHA, and explicit false claim flags.

Run the validator after both executions:

```powershell
node tests/h2-sentinel/scripts/validate-demo-receipt.mjs `
  --receipt 'tests/h2-sentinel/reports/generated/<candidate-demo-run>/demo-receipt.json' `
  --manifest 'tests/h2-sentinel/reports/generated/<fresh-slice-run>/validation-slice-manifest.json' `
  --artifacts-root 'tests/h2-sentinel/reports/generated/<candidate-demo-run>' `
  --expected-commit '<40-character-final-integrated-sha>'
```

This is PowerShell continuation syntax. The validator's `--help` output prints
the same executable form; replace every angle-bracket placeholder before
running the receipt gate.

Only a passing final-candidate receipt permits the sub-180-second wording. It
does not permit organizer-score, full-validation, hidden-test, deployment, or
production claims.

The runner rechecks the exact candidate SHA after each execution and again
before issuing the receipt. The manifest scope is a verified QA selection;
each run separately records actual import and analysis provenance. A
self-consistent synthetic test fixture uses
`self_consistent_fixture_contract`, never `VALIDATION_SLICE`.

Import provenance is the base identity. Analysis must inherit it without drift
and may add only `modelVersion`; Q09 and its report must inherit that analysis
identity and add only their fixed renderer versions. Contradictory source,
generation time, fingerprint, rule, configuration, or limitations invalidate
the receipt.

Each run also retains the exact Q09 answer/run/event identity, deterministic
mode, answer and report provenance, `single_event_diagnosis` HTML descriptor,
content hash, and exactly one matching report citation. Import and analysis
ranges must be canonical ordered UTC ranges, equal each other and the manifest
observed range, and remain within the frozen source range.

## Fixture fallback

Fixture may be shown only as a separately labeled fallback:

“This is FIXTURE · 固定样例, a sanitized synthetic regression path. It
demonstrates the interaction model but does not replace the validation-slice
run and is excluded from the timed receipt.”

If either Live execution fails, exceeds the target, loses provenance, imports
labels, or produces a hash mismatch, the demo gate fails. Do not substitute
Fixture, edit the receipt, or describe a partial execution as passing.
