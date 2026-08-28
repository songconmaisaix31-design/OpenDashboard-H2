# H2 Sentinel Official-Data Validation Tools

These dependency-free Node.js tools produce local, reproducible evidence from
an explicitly supplied public competition data directory. They never discover
an official package, read credentials, import public labels into the detector,
or write official data into tracked paths.

## Generated-output boundary

Generated reports, detector inputs, receipts, and exports must be written below
the existing ignored tree `tests/h2-sentinel/reports/generated/`. The tools
enforce the Git-ignore boundary and record only relative filenames plus
SHA-256 values. Evidence-producing runs require a clean non-ignored working
tree; the offline smoke and demo require a new output directory. No generated
official-data artifact is committed by this lane.

## Official validation evaluation

```powershell
node validation/evaluate.mjs --mode local `
  --set validation `
  --official-data '<data-directory>'
```

The evaluator requires the exact 69-field public timeseries vocabulary, chunks
the series by UTC calendar day, runs the deterministic loopback pipeline, merges
adjacent same-code predictions across day boundaries, and evaluates public
labels only after analysis. Its versioned `event-match-v1` contract uses greedy
one-to-one same-code interval overlap with a configurable symmetric grace
window. It emits overall and C01-C07 precision, recall, and F1 plus separate
temporal-detection/classification measures. These are local contract metrics,
not an organizer score.

## Disjoint-window overfit sentinel

```powershell
node validation/overfit-sentinel.mjs --official-data '<data-directory>'
```

The sentinel runs the same evaluator on the validation set and the final
90-day public train window, requires both reports to name the same clean
candidate commit, and flags an absolute F1 gap above `0.15`. The train window is
public and disjoint from the validation set; it is not a hidden test set.

## Submission checker and offline test-set smoke

```powershell
node validation/check-submission.mjs '<submission.csv>'
node validation/offline-deploy-smoke.mjs --official-data '<data-directory>'
```

The checker enforces the exact 16-column order, C01-C07 subtype/control/impact
vocabulary, official Chinese severities, and exact affected-equipment tokens:
`BESS`, `PCC`, `PV`, `ELZ`, and `ELZ1`-`ELZ3`. Equipment-master IDs such as
`BESS01`, `id:name` pairs, semicolon lists, spaces, duplicate tokens, and
per-code set drift fail closed.

The offline smoke imports the complete public test timeseries in one local
request, analyzes it, exports the user-facing submission through the Web proxy,
and applies the checker. Its result is local pipeline evidence only; it is not
deployment, network-isolation, hidden-test, production, or organizer evidence.

## Reproducible two-run demo

First prepare the C04 slice as documented in
`tests/h2-sentinel/scripts/README.md`. After the exact final candidate is
committed and clean, run:

```powershell
node validation/run-demo.mjs `
  --manifest 'tests/h2-sentinel/reports/generated/<slice>/validation-slice-manifest.json' `
  --output 'tests/h2-sentinel/reports/generated/<candidate-demo>' `
  --candidate-commit '<40-character-clean-HEAD-sha>'
```

For each of two executions the runner starts Local services before the timer,
then measures import, analysis, evidence read, human review, deterministic Q09
diagnosis, review-audit export, and submission export. It writes distinct
relative-path artifacts, hashes them, emits `demo-receipt.json`, and invokes the
receipt validator itself. Deterministic analytics may reuse the same content-
derived `runId`, so the receipt uses a distinct `executionId` to prove two
separate executions.

The recorded duration is a scripted local workflow measurement. Installation
and launcher startup are excluded and disclosed. It is not human judge timing,
an organizer score, deployment evidence, or production proof. Final metrics,
screenshots, receipt, and candidate SHA remain coordinator-owned until rerun on
the integrated clean candidate.
