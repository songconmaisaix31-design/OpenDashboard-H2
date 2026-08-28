# H2 Sentinel Official-Data Validation Tools

These dependency-free Node.js tools produce local, reproducible evidence from
an explicitly supplied public competition data directory. They never discover
an official package, read credentials, import public labels into the detector,
or write official data into tracked paths.

## Generated-output boundary

Generated reports, detector inputs, receipts, and exports must use a new path
below `tests/h2-sentinel/reports/generated/`. The directory may be absent in a
fresh clone; tools resolve it from a tracked ancestor and create it safely.
Arbitrary ignored locations such as `.env.local`, `node_modules`, or `dist`
are not output targets. Tracked or existing targets are rejected, and files
are published atomically without replacement.

## Official validation evaluation

```powershell
node validation/evaluate.mjs --mode local `
  --set validation `
  --official-data '<data-directory>'
```

The evaluator streams the complete named source to verify its SHA-256, exact
69-field header, full row count, first/last timestamps, and strictly increasing
timestamps before selecting any rows. A second verified streaming pass retains
only one UTC calendar-day chunk at a time for the deterministic loopback
pipeline; it never materializes the full cell matrix. Adjacent same-code
predictions are merged across day boundaries, and public labels are opened only
after every detector prediction finishes. Labels are held out from runtime
input and used only for evaluation. Its versioned `event-match-v2` contract
uses greedy one-to-one same-code interval overlap with a configurable symmetric
grace window. It emits overall and C01-C07 precision, recall, and F1 plus
signed first-detection delay and start/end boundary errors. Negative
first-detection delay denotes an early warning. These are local contract
metrics, not an organizer score.

## Disjoint-window overfit sentinel

```powershell
node validation/overfit-sentinel.mjs --official-data '<data-directory>'
```

The sentinel creates fresh evaluator reports for the validation set and final
90-day public train window, binds their hashes, source identities, complete
finite metrics, configuration, and distinct run IDs to the same clean
candidate, and flags an absolute F1 gap above `0.15`. The train window is
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

`first_detection_time` uses strict canonical UTC calendar syntax. Predictive
C05/C07 early warnings may precede event start but must not follow event end;
other categories retain the event-start boundary. Numeric fields accept only
finite decimal syntax, impact is non-negative, and evidence must be a non-empty
array of objects with non-empty `evidence_id` values.

The offline smoke first streams the complete public test source through the
same identity checks. It then retains only the one raw source string required
for the local import request, fingerprints the exact submitted text, and does
not build a full row matrix or normalized duplicate. It analyzes the import,
exports the user-facing submission through the Web proxy, and applies the
checker. Its result is local pipeline evidence only; it is not deployment,
network-isolation, hidden-test, production, or organizer evidence.

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

The supplied `--output` is the artifacts root itself. It must be fresh and
separate from the slice-manifest directory; do not append another `/artifacts`
component. Each run records actual LIVE_ANALYSIS import/run provenance, and
the runner rechecks the candidate SHA after each run and before receipt
issuance. Public labels may select the directed demo before analysis but are
never included in detector input.

The recorded duration is a scripted local workflow measurement. Installation
and launcher startup are excluded and disclosed. It is not human judge timing,
an organizer score, deployment evidence, or production proof. Final metrics,
screenshots, receipt, and candidate SHA remain coordinator-owned until rerun on
the integrated clean candidate.
