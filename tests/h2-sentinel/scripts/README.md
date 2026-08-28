# H2 Sentinel P1 QA Scripts

These scripts use Node.js built-ins only. They never discover an official
package, credential store, environment file, or output path implicitly.

## Prepare a public-validation slice

Obtain the two source hashes independently, then pass the official package,
package-relative source files, expected hashes, and a new ignored output
directory explicitly:

```powershell
node tests/h2-sentinel/scripts/prepare-validation-slice.mjs `
  --package C:\path\to\official-package `
  --timeseries '02_validation_timeseries.csv' `
  --labels '05_validation_event_labels.csv' `
  --timeseries-sha256 'sha256:<64-lowercase-hex>' `
  --labels-sha256 'sha256:<64-lowercase-hex>' `
  --output 'tests/h2-sentinel/reports/generated/validation-run-01'
```

The output directory must not exist and must be below the canonical generated
prefix. The script streams the complete timeseries to verify the independently
frozen full-source hash, all 129,600 rows, source range, UTF-8 CSV syntax, exact
official 69-field header, and unique ordered timestamps before selecting any
rows. It retains only rows inside the padded interval, rather than the complete
cell matrix. It separately verifies 70 unique label events and their frozen
hash, identity, code, and time fields before writing anything. Official
UTC-naive timestamps are interpreted as UTC; timestamps with an explicit
offset are normalized to UTC.

It selects the earliest C04 label by start time, then event end and ID; creates
an inclusive slice from 30 minutes before the label start through 30 minutes
after its end; and writes only:

- `validation-slice.csv`: detector input containing exactly the 69 official
  fields; a source with any embedded public-label column is rejected;
- `validation-slice-manifest.json`: source hashes, selected C04 identity,
  requested/observed time ranges, detector-input hash, label-column absence,
  and all overlapping public labels for QA comparison.

Public labels may select this directed QA demo before analysis, but are never
sent to the detector. The manifest is QA-only. Never import it into analytics,
and never commit the official package, slice, manifest, labels, or generated
receipts. Synthetic contract tests use `self_consistent_fixture_contract` and
must never claim `VALIDATION_SLICE`.

## Validate a measured demo receipt

The coordinator creates a receipt only after the final integrated commit has
completed the validation-slice path twice consecutively. Validate the receipt,
the exact slice manifest and adjacent detector-input bytes, and both runs'
exported artifacts with:

```powershell
node tests/h2-sentinel/scripts/validate-demo-receipt.mjs `
  --receipt 'tests/h2-sentinel/reports/generated/<candidate-demo-run>/demo-receipt.json' `
  --manifest 'tests/h2-sentinel/reports/generated/<fresh-slice-run>/validation-slice-manifest.json' `
  --artifacts-root 'tests/h2-sentinel/reports/generated/<candidate-demo-run>' `
  --expected-commit '<40-character-final-integrated-sha>'
```

The validator requires exactly two distinct scripted executions, sequences
`1` and `2`, with run 2 starting after run 1 completes. Distinctness is proven
by the runner-generated `executionId`; the deterministic analytics `runId` may
legitimately repeat when identical detector bytes are analyzed by two fresh
service processes. Each measured duration must be strictly less than 180,000
ms and must include positive durations in this order: `import`, `analysis`,
`evidence_review`, `human_review`, `q09_report`, and `artifact_export`.

The manifest directory and artifacts root must be fresh and different. The
validator recomputes the detector-input SHA-256 and verifies its columns,
row count, monotonic timestamps, observed interval, and absence of label
columns. For each run it also recomputes the SHA-256 of a Chinese diagnosis HTML
report, a review-audit JSON export, and the exact 16-column `submission.csv`.
The audit must retain the analyzed event at confirmed revision 1, and the
recorded receipt must bind the same non-replayed review request ID, action,
revision, actor, run, and event. The evidence-review identity must name the
same run/event and at least one unique evidence ID. It must also bind a
canonical evidence-response JSON artifact by relative path and SHA-256,
anomaly code, ordered evidence IDs, and count; the validator reopens and hashes
those bytes. The anomaly code must remain the manifest-selected C04 code, and
the ordered evidence IDs must also occur in the separately hashed diagnosis
HTML, preventing coordinated artifact/receipt substitution. The submission
must pass the official vocabulary/equipment
checker. The diagnosis
HTML must name the selected event, source filename, detector fingerprint, and
rendered provenance scope.
The validator distinguishes verified manifest scope from actual LIVE_ANALYSIS
import/run provenance and requires `publicLabelsUsedAsDetectorInput: false`,
pre-started service disclosure, and
explicit false values for organizer score, full validation, hidden test,
deployment, production proof, and Fixture substitution claims.
It also requires canonical ordered UTC ranges: each import and analysis range
must equal the manifest observed range, remain inside the verified source
range, and equal its peer. Q09 must retain exact question/run/event identity,
the `single_event_diagnosis` HTML descriptor and content hash, actual answer
and report provenance, exactly one matching report citation, and explicit
positive standalone declaration. The real Analytics Q09 section and disclaimer
use `本应用仅提供监视、诊断、量化和建议，不下发设备指令；所有操作建议均须人工确认。`
exactly. Import provenance defines the base;
analysis inherits its dataset-analysis timestamp exactly, records a completed
lifecycle identity, and adds only a model version. Q09/report timestamps equal
that run `completedAt`; their provenance inherits the analysis source,
fingerprint, model, rule, configuration, and limitations plus only the fixed
renderer version. Suffixes, negation, no-confirmation wording,
equipment-control authorization, or contradictory provenance fail closed.

Passing this validator proves only that the supplied local receipt and files
meet this evidence contract. It is not an organizer score, full-validation
result, hidden-test result, deployment proof, or production proof.

## Run the scripted two-execution demo

After integration, use `validation/run-demo.mjs` with the prepared manifest,
detector CSV, a clean exact candidate SHA, and a new ignored output directory.
The runner starts a fresh Local launcher before each measured execution, then
times only import, analysis, evidence read, human review, Q09 diagnosis,
review-audit export, and submission export. Dependency installation and
launcher startup are outside the measured window and are disclosed in the
receipt.
