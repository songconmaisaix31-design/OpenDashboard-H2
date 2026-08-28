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
pipeline; it never materializes the full cell matrix. Each verified 69-field
chunk is submitted unchanged to the analytics import contract, and the exact
submitted fingerprint is recorded for import/run provenance. There is no
legacy 10-field projection or derived electrolyzer aggregate. An isolated
backend that still accepts only the legacy shape is intentionally incompatible;
the final integrated Analytics contract must accept the strict raw 69 fields.
Adjacent same-code
predictions are merged across day boundaries, and public labels are opened only
after every detector prediction finishes. Labels are held out from runtime
input and used only for evaluation. Its versioned `event-match-v2` contract
uses greedy one-to-one same-code interval overlap with a configurable symmetric
grace window. It emits overall and C01-C07 precision, recall, and F1 plus
their unweighted macro averages, signed first-detection delay, and start/end
boundary errors. Precision is zero when `tp + fp` is zero, recall is zero when
`tp + fn` is zero, and F1 is zero when precision plus recall is zero; evaluator
reports record this rule and the overfit gate recomputes every claimed count,
per-code metric, classification metric, and timing summary from unique matched
and unmatched event identities. Negative
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
The inclusive Oct 3 through Dec 31 overlap contains 63 official TRAIN events:
`C01=9`, `C02=13`, `C03=8`, `C04=9`, `C05=11`, `C06=2`, and `C07=11`.

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
for the local import request in that same streaming pass, reuses the verified
raw-stream SHA as the submitted fingerprint, and never reopens or re-encodes
the source between verification and submission. It does not build a full row
matrix, normalized duplicate, or second UTF-8 byte copy. It analyzes the import,
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
separate executions. Q09 is bound to the exact question/run/event, deterministic
answer and report provenance, one matching report citation, the diagnosis
descriptor/media contract, and the diagnosis bytes. The import defines the
base provenance identity; analysis may add only its model version, and Q09 plus
the report may add only their fixed renderer versions. Import and analysis
preserve the dataset-analysis `generatedAt`; the completed analysis identity
records `status`, `startedAt`, and `completedAt`. Q09 and report descriptor
timestamps use that exact `completedAt`, while their source, fingerprint,
model, rule, configuration, and limitations inherit the analysis provenance.

The supplied `--output` is the artifacts root itself. It must be fresh and
separate from the slice-manifest directory; do not append another `/artifacts`
component. Each run records actual LIVE_ANALYSIS import/run provenance, and
the runner rechecks the candidate SHA after each run and before receipt
issuance. The receipt also hashes and reopens a canonical evidence-response
artifact, binding its relative path, run, event, anomaly code, ordered evidence
IDs, and count. It separately binds the exact non-replayed human-review request,
run, event, action, revision, and actor. The controlled positive safety field
must equal `所有操作建议均须人工确认` exactly; suffixes, negation,
no-confirmation wording, and direct-control claims fail closed. Public labels
may select the directed demo before analysis but are never included in detector
input.

The recorded duration is a scripted local workflow measurement. Installation
and launcher startup are excluded and disclosed. It is not human judge timing,
an organizer score, deployment evidence, or production proof. Final metrics,
screenshots, receipt, and candidate SHA remain coordinator-owned until rerun on
the integrated clean candidate.
