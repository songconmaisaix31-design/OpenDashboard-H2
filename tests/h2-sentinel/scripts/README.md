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
  --timeseries 'data/public-validation-timeseries.csv' `
  --labels 'data/public-validation-event-labels.csv' `
  --timeseries-sha256 'sha256:<64-lowercase-hex>' `
  --labels-sha256 'sha256:<64-lowercase-hex>' `
  --output 'tests/h2-sentinel/reports/generated/validation-run-01'
```

The output directory must not exist and must be inside the repository under a
Git-ignored rule. The script verifies both exact source hashes, UTF-8 CSV
syntax, required detector columns, label identity/code/time fields, unique and
ordered timestamps, and complete padded coverage before writing anything.

It selects the earliest C04 label by start time, then event end and ID; creates
an inclusive slice from 30 minutes before the label start through 30 minutes
after its end; and writes only:

- `validation-slice.csv`: detector input with recognized public-label columns
  removed;
- `validation-slice-manifest.json`: source hashes, selected C04 identity,
  requested/observed time ranges, detector-input hash, removed columns, and all
  overlapping public labels for QA comparison.

The manifest is QA-only. Never import it into analytics, and never commit the
official package, slice, manifest, labels, or generated receipts.

## Validate a measured demo receipt

The coordinator creates a receipt only after the final integrated commit has
completed the validation-slice path twice consecutively. Validate the receipt,
the exact slice manifest and adjacent detector-input bytes, and both runs'
exported artifacts with:

```powershell
node tests/h2-sentinel/scripts/validate-demo-receipt.mjs `
  --receipt 'tests/h2-sentinel/reports/generated/final/demo-receipt.json' `
  --manifest 'tests/h2-sentinel/reports/generated/final/validation-slice-manifest.json' `
  --artifacts-root 'tests/h2-sentinel/reports/generated/final/artifacts' `
  --expected-commit '<40-character-final-integrated-sha>'
```

The validator requires exactly two distinct passing runs, sequences `1` and
`2`, with run 2 starting after run 1 completes. Each measured duration must be
strictly less than 180,000 ms and must include positive durations in this
order: `import`, `analysis`, `evidence_review`, `human_review`, `q09_report`,
and `artifact_export`.

The validator recomputes the detector-input SHA-256 and verifies its columns,
row count, monotonic timestamps, observed interval, and absence of label
columns. For each run it also recomputes the SHA-256 of a Chinese diagnosis HTML
report, a review-audit JSON export, and the exact 16-column `submission.csv`.
It requires Live validation-slice provenance,
`publicLabelsUsedAsDetectorInput: false`, pre-started service disclosure, and
explicit false values for organizer score, full validation, hidden test,
deployment, production proof, and Fixture substitution claims.

Passing this validator proves only that the supplied local receipt and files
meet this evidence contract. It is not an organizer score, full-validation
result, hidden-test result, deployment proof, or production proof.
