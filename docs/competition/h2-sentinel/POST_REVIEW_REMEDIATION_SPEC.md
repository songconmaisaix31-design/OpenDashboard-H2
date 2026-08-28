# H2 Sentinel Post-Review Remediation Specification

- **Status:** Approved implementation baseline
- **Date:** 2026-08-28
- **Coordinator baseline:** `5d20c412ea9dc43182aa1071db5747af0a9da96f`
- **Product language:** Simplified Chinese
- **Technical language:** English
- **Scope:** All actionable review findings left outside the completed P1 increment

## 1. Outcome

The remediation is complete when H2 Sentinel is no longer a polished C03/C04
Fixture with broader claims. It must consume the official 69-field vocabulary,
produce deterministic C01-C07 diagnoses from public official data, preserve the
P1 review/assistant/report contracts, expose the expanded capability clearly in
the Chinese Web flow, and carry current executable evidence instead of stale
worker-era status text.

The work must not modify the official competition package, import public labels
as detector input, claim an organizer score, or create equipment-control
authority.

## 2. Restored source facts

The supplied package contains the public train, validation, and test time
series; public train/validation labels; the variable dictionary; equipment and
constraint records; efficiency curves; logs; the knowledge base; the ten fixed
questions; and the exact submission template.

Read-only integrity verification produced this bounded result:

- 21 of 24 entries in the supplied SHA-256 manifest match by both content hash
  and byte size.
- Every data/material entry and the workbook match.
- The top-level requirement DOCX, Web-acceptance Markdown, and README differ
  from the manifest records and are smaller. They remain usable requirement
  inputs, but the package must not be described as fully manifest-clean.
- The package-introduction PDF is outside the 24-entry manifest and is treated
  as explanatory material, not checksum evidence.

The current branch has an intentionally separate, read-only reuse candidate in
another checkout that already contains official-field vocabulary and C01-C07
work. Reuse is allowed only by selective adaptation with fresh tests. Historical
metrics and claims from that checkout are not evidence for this branch.

## 3. Findings and acceptance criteria

### R01 - Official field and vocabulary convergence

**Current defect:** The active analytics path uses a small deprecated field set
and the fallback detector version states that only C03/C04 mappings are frozen.
The official CSV uses the 69-field vocabulary.

**User impact:** An evaluator can select an official file and receive a blocked
or misleading result even though the product claims official CSV support.

**Acceptance:**

- A frozen, reviewable vocabulary contains the official field names, Chinese
  labels, units, sign conventions, taxonomy, constraints, equipment, efficiency
  curves, knowledge text, and assistant questions.
- Official fields remain the runtime source of truth. Deprecated Fixture names
  may be supported only through an explicit compatibility map.
- The UI, reports, evidence, and submission use consistent official semantics.
- No large official time-series or label file is tracked by Git.

### R02 - Deterministic C01-C07 analysis

**Current defect:** Production analysis filters generated windows to C03/C04;
diagnosis metadata, evidence, impact, safety, and aggregation rules are
incomplete for the other five classes.

**User impact:** Five of seven required anomaly categories are contract-only,
so the application cannot support the main competition claim.

**Acceptance:**

- Deterministic detection, aggregation, subtype, severity, control-object,
  affected-equipment, evidence, impact, safety, and recommendation coverage
  exists for C01-C07.
- Every numeric claim records a formula version, unit, interval, assumptions,
  and evidence IDs.
- Thresholds are externalized/versioned and tested against representative
  official rows. Public labels are evaluation-only.
- The P1 review journal remains separate from detector events and the exact
  16-column submission.

### R03 - Official-size import and bounded processing

**Current defect:** The current service rejects files above 5 MiB or 100,000
rows, while official validation and test files exceed both limits.

**User impact:** The advertised browser import path rejects official inputs.

**Acceptance:**

- The Web pre-read guard and analytics service accept one validation or test
  CSV up to 96 MiB and 180,000 rows while rejecting larger interactive imports
  before all rows are materialized.
- The 525,600-row train CSV is not an interactive-import claim. Train
  evaluation uses the offline UTC-day chunk path with deterministic merging,
  fingerprints, and an overfit sentinel.
- Validation, test, and train/chunk row-count boundaries are covered by tests.
- Local APIs remain literal-loopback only and failures remain redacted.

### R04 - Official validation and submission evidence

**Current defect:** The current branch has only synthetic slice-tool tests and
no official-data receipt or C01-C07 validation report.

**User impact:** Judges cannot distinguish implementation depth from a Fixture
demo.

**Acceptance:**

- The official validation set is evaluated under a documented, versioned
  event-matching contract with per-class and overall precision, recall, and F1.
- A train-window overfit sentinel is produced from a disjoint public window.
- The official test set can complete the local import/analyze/export pipeline
  and emits an exact-format, UTF-8, 16-column submission that passes the local
  checker. This is not an organizer score.
- Generated evidence contains hashes and relative source names, never absolute
  workstation paths.
- The prepared C04 slice contains no label columns and retains a separate QA
  manifest.

### R05 - Judge-visible product clarity

**Current defect:** P1 review and report improvements are mostly visible only
after navigating into existing flows; the default page does not clearly expose
the expanded capability or a short evaluator path.

**User impact:** A returning reviewer can reasonably conclude that little
changed.

**Acceptance:**

- The overview presents one explicit judge path from data source to event,
  evidence, human review, assistant, and export.
- C01-C07 coverage, current dataset identity, quality status, provenance, and
  safety boundary are visible without reading technical docs.
- Official power-sign conventions are visible in the relevant overview,
  analysis, and diagnosis contexts.
- The operations assistant keeps Q01-Q10 and adds a deterministic free-text
  follow-up router or an equally bounded natural-language entry. Unknown input
  must fail safely without fabricated facts.
- Loading, disabled, empty, invalid-file, blocked-quality, stale-review
  conflict, download, desktop, and 390x844 states are visibly usable.

### R06 - Startup and bundle usability

**Current defect:** The production build emits one approximately 900 kB
JavaScript chunk and a greater-than-500-kB warning.

**User impact:** Initial loading and judge-session reliability are weaker than
necessary, especially when the chart path is not immediately needed.

**Acceptance:**

- Initial application code and heavy chart/runtime code are split at a stable
  product boundary using existing Vite/Rollup capabilities.
- No warning is hidden by only increasing `chunkSizeWarningLimit`.
- Fixture and Local launchers, direct routes, and report downloads still work.
- Build output sizes are recorded from the final candidate.

### R07 - Warning and dependency hygiene

**Current defect:** Python tests emit an upstream Starlette/httpx deprecation
warning.

**User impact:** Warning noise masks real regressions and weakens the release
signal.

**Acceptance:**

- Resolve the warning through a compatible locked-version change when the
  current official dependency contract supports it, or document a narrowly
  justified upstream-only exception with a regression test.
- Do not add an application dependency solely to silence a test warning.
- Lockfiles and third-party notices remain accurate.

### R08 - Evidence and documentation drift

**Current defect:** Acceptance, defect, demo, screenshot, and runtime documents
still describe integrated P1 behavior as pending or failed.

**User impact:** The repository contradicts itself and makes valid features
look incomplete.

**Acceptance:**

- Historical worker failures remain identifiable as historical; current status
  is derived from fresh final-candidate runs.
- Open defects are either fixed with evidence or retained as open with an exact
  reproduction.
- A retained, privacy-safe screenshot set covers the primary Fixture and
  official-slice states needed for presentation; images are evidence, not a
  substitute for executable checks.
- Claims, checklists, demo script, handoff, and project memory agree with the
  final candidate and preserve evidence limits.

### R09 - Reproducible measured demo

**Current defect:** No two-run receipt exists for the final integrated branch.

**User impact:** The three-minute path is a plan, not a measured result.

**Acceptance:**

- A reproducible runner exercises import, analysis, evidence review, human
  review, Q09 report, and artifact export twice against the official C04 slice.
- The existing receipt validator accepts both distinct runs and all artifact
  hashes for the exact candidate SHA.
- A scripted receipt is described as a local measured workflow, not as a human
  judge performance, organizer score, deployment, or production proof.
- The same candidate receives a separate browser visual review.

### R10 - Source-package integrity disclosure

**Current defect:** Existing submission docs state that no official package was
available and contain no partial-integrity result.

**User impact:** Evidence is stale and could overstate or understate source
trust.

**Acceptance:**

- Documentation states that all 21 data/material manifest entries match while
  three top-level documents differ.
- The supplied package is never modified to make the manifest pass.
- Only matching public data/material files support runtime evidence.

## 4. Work lanes and write ownership

### Lane A - Analytics, contracts, and vocabulary

Allowed paths:

- `packages/h2-contracts/**`
- `packages/h2-vocabulary/**`
- `services/h2-analytics/**`

Primary findings: R01, R02, R03 service boundary, R07 Python dependency.

### Lane B - Web, plugin adapter, and bundle

Allowed paths:

- `apps/web/**`
- `plugins/h2-ems/**`
- `vite.config.ts`

Primary findings: R03 browser/adapter boundary, R05, R06.

### Lane C - Validation, QA, and submission evidence

Allowed paths:

- `validation/**`
- `tests/h2-sentinel/**`
- `submission/h2-sentinel/**`

Primary findings: R04, R08, R09, R10.

### Coordinator-only paths

- `AGENTS.md`
- `MEMORY.md`
- `package.json`
- `package-lock.json`
- `.gitignore`
- `docs/competition/h2-sentinel/**`
- root composition and integration files not explicitly assigned above

Workers may read the separate official-data implementation checkout but must
adapt deliberately and must not copy historical reports as current evidence.

## 5. Risks and controls

| Risk | Control |
| --- | --- |
| Public labels leak into detection | Separate detector CSV from QA manifest; assert forbidden label columns at every import boundary. |
| P1 behavior regresses during C01-C07 convergence | Preserve Q01-Q10, review, report, provenance, and submission contract tests as mandatory integration gates. |
| Full-file processing exhausts memory | Use bounded file guards and the existing daily-chunk evaluator; measure before claiming full-file browser behavior. |
| Reuse branch contains stale claims | Import implementation selectively; regenerate all evidence from this final branch. |
| Official package is changed to satisfy hashes | Package is read-only; record the three mismatches instead. |
| Parallel lanes overlap | Exact allowlists, isolated Orca worktrees, coordinator-only integration. |
| UI polish hides missing behavior | Every visible claim maps to an executable test or bounded manual screenshot record. |

## 6. Required verification

Focused checks run in each lane. The coordinator then runs from the final clean
HEAD:

```text
npm run h2:check
npm test
cd services/h2-analytics && uv run --locked --extra dev python -m pytest -q
cd services/h2-analytics && uv run --locked --extra dev ruff check src tests
cd services/h2-analytics && uv run --locked --extra dev mypy src
node validation/evaluate.mjs --mode local --official-data <explicit-data-dir>
node validation/overfit-sentinel.mjs --official-data <explicit-data-dir>
node validation/offline-deploy-smoke.mjs --official-data <explicit-data-dir>
node tests/h2-sentinel/scripts/validate-demo-receipt.mjs <explicit arguments>
pwsh -NoProfile -File submission/h2-sentinel/scripts/validate-submission.ps1
git diff --check
```

The coordinator also verifies changed paths, ignored generated artifacts,
official-data absence from Git, package-integrity wording, browser desktop and
390x844 states, launch/cleanup ownership, and final build chunk sizes.

## 7. Completion boundary

Remote deployment, publication, GitHub Actions, hidden-test scoring, organizer
approval, and changes to protected `main` are outside the authority of this
task. They remain false claims unless separately authorized and verified.

## 8. Implementation-review addendum

Read-only review of the first remediation commits found additional trust and
correctness gaps. They are part of this specification rather than deferred
follow-up work.

### R11 - Causal diagnosis and predictive-event correctness

- Detection candidates must retain the actual triggering equipment, variables,
  direction, and subtype context. Evidence, assistant answers, and submission
  rows must derive from that context instead of code-level static defaults.
- C05 quota risk and C07 reserve risk must support prospective first detection
  without truncating the event when the risk is increasing.
- C06 detection and diagnosis must retain efficiency-curve, capacity, state,
  and equivalent-output evidence. Its official impact estimate uses versioned,
  public-train-calibrated target-relative rates: 1.8% for
  `AVOIDABLE_START_STOP` and 2.2% for `INEFFICIENT_POWER_ALLOCATION`, integrated
  over inclusive samples. Validation labels remain held-out acceptance data and
  no label is read at runtime.
- Dynamic PCC safety limits must be evaluated against the matching row, not the
  first row of an event window.

### R12 - Evidence source identity and output safety

- An official-named report requires independently frozen source hashes, exact
  full-source row and event counts, split identity, unique event IDs, and actual
  loopback import provenance. A same-name or self-consistent synthetic fixture
  must use a lower evidence classification.
- All generated evidence stays under the canonical ignored
  `tests/h2-sentinel/reports/generated/` root. Tools reject tracked targets,
  existing candidate outputs, arbitrary ignored files, and untracked source or
  configuration drift.
- Evaluation and overfit reports are fresh, candidate-specific, atomically
  written, finite-valued, and bound to their input report hashes and matching
  configuration.

### R13 - Strict submission, launcher, and receipt boundaries

- Submission validation uses exact headers, canonical UTC timestamps, finite
  decimal numbers, non-negative impact values, structured evidence, and the
  required human-confirmation flag. Only predictive C05/C07 events may detect
  before the labeled start; no category may detect after its event end.
- Every resolved validation request URL remains literal-loopback and redirects
  fail closed. Launcher spawn/readiness failures terminate only the exact owned
  child tree before returning a redacted error.
- Demo receipts bind the selected event, overlapping labels, Q09 artifact,
  source identity, actual runtime provenance, exact clean candidate, two fresh
  executions, and recomputed artifact hashes.

### R14 - Bounded import means bounded memory

Raising byte or row constants is insufficient. Row limits must be enforced
while parsing, label aliases must be rejected before numeric conversion, and
the service must not retain avoidable full-input text, encoded copies, parser
buffers, and expanded row dictionaries at the same time. Tests must exercise
the 96 MiB/180,000-row interactive boundary; the larger train file remains an
offline UTC-day-chunk claim rather than a single-import claim.

Official train, validation, and test identity checks must stream the complete
source while verifying the frozen SHA-256, exact 69-column header, row count,
time range, and strictly increasing unique timestamps. Evaluators and slice
preparation retain only the requested UTC-day window. The full test file may
be materialized only once at the unavoidable loopback import boundary; source
identity and the submitted bytes must remain fingerprint-bound.

### R15 - Consumer-bounded Web series

API batching alone does not bound browser memory when every numeric variable
for every official row is accumulated and then copied during merge.

- Overview requests only the semantic series it renders and uses a bounded
  recent time window.
- Diagnosis requests only the current event's evidence or subtype-specific
  series over the event window.
- The variable explorer requests the selected variable on demand instead of
  retaining all official variables in one workspace object.
- Asynchronous series responses are keyed to the active run and consumer
  selection so stale event or variable requests cannot replace current data.
- A 69-field manifest regression proves that irrelevant fields are not
  requested; a representative 129,600-row path proves that complete batch
  responses are not retained and duplicated.

### R16 - Sign, cadence, and subtype-correct aggregation

- C03 follows the public-train causal signature, not a generic raw-sign rule.
  A labeled row may have same-sign BESS command, actual power, and PCC power;
  the anomaly requires the command to conflict with the BESS power-gap or SOC
  target demand and to drive PCC exchange in the adverse direction. Ordinary
  same-sign behavior without that causal conflict must not produce
  `BESS_DIRECTION_REVERSED`, and diagnosis text must not falsely claim that
  command and actual power point in opposite directions.
- C05 confirmation requires four genuinely consecutive one-minute samples.
  The event starts at the first causal risk sample, detection is recorded at
  the confirmation sample, and the early-warning claim refers to warning
  before the hard quota consequence rather than an invented pre-event sample.
- C06 aggregation is subtype-specific. A persisted avoidable-start/stop state
  must not disappear because a transition detector emitted only one candidate
  while a different C06 subtype uses a sustained-duration threshold.
- Detector-to-event tests cover these boundaries; hand-built event objects are
  insufficient evidence for detector correctness.

### R17 - Auditable calibration and fail-closed equipment identity

- C05/C06 thresholds and impact rates derived from public train record the
  exact public-source hashes, event/sample counts, derivation procedure, and
  versioned results. A small dependency-free replay tool or equivalent
  executable contract must reproduce the frozen calibration without importing
  validation labels.
- Validation is run only after thresholds are frozen and is reported as
  held-out acceptance, not calibration evidence or an organizer score.
- C01, C02, and C06 require valid implicated equipment from the triggering
  detector context. Missing or invalid dynamic equipment fails closed; static
  taxonomy defaults must not silently invent affected assets for rule or model
  detector paths.
- Exact 96 MiB and 180,000-row acceptance plus one-byte and one-row overflow
  failures are executable boundary tests, not constant-only assertions.
