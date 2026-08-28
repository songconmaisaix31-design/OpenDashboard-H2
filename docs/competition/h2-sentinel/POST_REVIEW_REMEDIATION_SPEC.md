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

- The Web pre-read guard and analytics service accept the official package
  sizes while rejecting files above the declared safe bound before analysis.
- Full files are processed with a bounded strategy appropriate to the local
  runtime; validation tools may chunk by UTC day as long as event merging and
  fingerprints remain deterministic and documented.
- Train, validation, and test row-count boundaries are covered by tests.
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
