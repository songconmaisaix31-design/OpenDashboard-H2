# H2 Sentinel Multi-Agent Development Plan

- **Coordination model:** One human coordinator, multiple branch-bound implementation agents
- **Primary rule:** Track isolation with near-zero conflict surface
- **Integration branch:** `competition/h2-sentinel`
- **Planning documents:** Coordinator-owned and read-only for worker agents
- **Archive rule:** Every verified increment is committed and pushed immediately

## 1. Operating doctrine

### 1.1 Divide by directory ownership, not by feature

Each top-level agent receives an exclusive path allowlist. It may implement all internal behavior required inside that path, but it may not edit another track's path even when doing so would be convenient.

The objective is not merely “fewer conflicts.” The objective is that two agents can run aggressively in parallel because their writable file sets are almost disjoint.

### 1.2 One session, one branch, one worktree

Every write-capable agent session is permanently bound to:

- one named Git branch;
- one isolated Git worktree;
- one immutable base commit;
- one explicit write allowlist;
- one explicit denylist.

The session must print and verify its branch before editing:

```bash
CURRENT_BRANCH="$(git branch --show-current)"
printf 'Current branch: %s\n' "$CURRENT_BRANCH"
test "$CURRENT_BRANCH" = '<assigned-branch>'
```

An agent must stop and report a blocker if the branch does not match. It must not switch to another track's branch.

### 1.3 No cross-track command authority

An agent may observe another track's public contracts or pushed commits, but it may not instruct an AI tool or subagent to edit that track's files.

Examples:

- The Web agent may report that an API field is missing; it may not edit `services/h2-analytics/**`.
- The Analytics agent may report that a schema is insufficient; it may not edit `packages/h2-contracts/**`.
- The Plugin agent may report that `main.tsx` needs wiring; it may not edit `apps/web/src/main.tsx`.
- The QA agent may produce a failing test and a reproduction; it may not fix implementation code.

Cross-track needs are routed to the coordinator through the track's own `HANDOFF.md`.

### 1.4 Subagents inherit the parent boundary

A parent agent may call subagents, but a subagent can never receive broader permissions than the parent.

Read-only subagents may analyze any relevant repository file.

A write-capable subagent must use one of these modes:

1. **Sequential mode:** it works in the parent worktree after the parent assigns a non-overlapping internal subdirectory; or
2. **Child-branch mode:** it receives a child branch such as `agent/h2-analytics/events`, an isolated child worktree, and a narrower allowlist. The parent agent alone cherry-picks the child commit into the parent track.

A child agent must never push directly to the parent branch and must never touch another top-level track.

### 1.5 Reuse before build

Before implementing a non-trivial subsystem, the agent must check official GitHub repositories and official documentation for maintained, license-compatible reuse.

The agent records the decision in its subtree README or handoff:

```text
Need:
Projects checked:
Official sources:
License:
Adopt / adapt / reject:
Reason:
Files or APIs reused:
Fallback:
```

A dependency is adopted only when it reduces code and risk. Large platforms are not accepted merely because they already contain the feature.

### 1.6 Commit is an archive point

A completed, tested increment is immediately committed and pushed. The branch must not accumulate a large uncommitted implementation.

Required cycle:

```text
Implement one bounded increment
→ run focused checks
→ inspect owned-path diff
→ commit
→ push
→ continue
```

Only pushed commit SHAs count as deliverables.

## 2. Roles and authority

### 2.1 Human coordinator

The coordinator is the only authority allowed to:

- create and update `competition/h2-sentinel`;
- accept or reject worker commits;
- cherry-pick worker commits into the integration branch;
- resolve contract-change requests;
- authorize root dependency changes;
- assign or revoke directory ownership;
- create the final integration track;
- declare feature freeze and submission freeze.

The coordinator should not perform broad implementation inside worker-owned directories while those tracks are active.

### 2.2 Worker agents

A worker agent may:

- edit only its allowlisted paths;
- create tests, documentation, and handoff files inside its owned subtree;
- call bounded subagents under the inheritance rule;
- push its own branch;
- request a contract or integration change.

A worker agent may not:

- merge or cherry-pick into `competition/h2-sentinel`;
- edit root/composition files unless it is the integration track;
- rewrite pushed history;
- delete another branch/worktree;
- change another track's code to make its own tests pass;
- claim that another track's check passed.

## 3. Global branch and worktree setup

### 3.1 Coordinator creates the planning gate

```bash
git fetch origin --prune
BASE_SHA="$(git rev-parse origin/main)"
git show --no-patch --oneline "$BASE_SHA"

git switch --detach "$BASE_SHA"
git switch -c competition/h2-sentinel

# Add the three coordinator-owned planning documents.
git add docs/competition/h2-sentinel/
git diff --cached --name-only
git commit -m "docs(h2): add competition product and agent plan"
git push -u origin competition/h2-sentinel

PLANNING_GATE="$(git rev-parse HEAD)"
printf 'Planning gate: %s\n' "$PLANNING_GATE"
```

Do not assume a SHA from this document is current. Resolve it live.

### 3.2 Inspect existing worktrees before adding new ones

```bash
git worktree list
```

Preserve unrelated OpenDashboard branches and worktrees. Do not delete or prune a worktree merely to reuse its directory name.

### 3.3 Create the contract-track worktree

```bash
git worktree add ../od-h2-contracts \
  -b agent/h2-contracts \
  "$PLANNING_GATE"

git -C ../od-h2-contracts push -u origin agent/h2-contracts
```

Only the contract track starts at this point.

## 4. Wave 0 — Contract and dependency gates

## Track H0 — Canonical H2 contracts

### Identity

- **Branch:** `agent/h2-contracts`
- **Worktree:** `../od-h2-contracts`
- **Base:** immutable `PLANNING_GATE`
- **Exclusive write allowlist:** `packages/h2-contracts/**`
- **Denylist:** every other path, especially `packages/contracts/**`, root manifests, Web, plugin, analytics, and planning docs
- **Handoff file:** `packages/h2-contracts/HANDOFF.md`

### Objective

Freeze the smallest sufficient shared contract that lets Analytics, Plugin, Web, QA, and Submission work independently.

### Required deliverables

```text
packages/h2-contracts/
├─ README.md
├─ HANDOFF.md
├─ package.json                     # Optional, only if useful inside the owned subtree
├─ schema/
│  ├─ dataset-manifest.schema.json
│  ├─ data-quality-report.schema.json
│  ├─ anomaly-event.schema.json
│  ├─ analysis-run.schema.json
│  ├─ assistant-answer.schema.json
│  ├─ report-descriptor.schema.json
│  └─ submission-row.schema.json
├─ src/
│  ├─ index.ts
│  ├─ dataset.ts
│  ├─ quality.ts
│  ├─ anomaly.ts
│  ├─ assistant.ts
│  ├─ report.ts
│  ├─ data-source.ts
│  └─ provenance.ts
├─ fixtures/
│  ├─ golden-c03.json
│  ├─ golden-c04.json
│  ├─ golden-c07.json               # Optional P1
│  ├─ tiny-valid-timeseries.csv
│  └─ tiny-invalid-timeseries.csv
└─ test/
   ├─ schema-validation.test.ts
   ├─ golden-fixtures.test.ts
   └─ submission-mapping.test.ts
```

### Contract requirements

- exact C01-C07 code and subtype vocabulary;
- severity vocabulary;
- control-object and equipment representation;
- start/end/first-detection times kept separate;
- structured evidence items;
- impact metric/value/unit/formula version;
- safety checks and recommendations;
- `requiresHumanConfirmation`;
- provenance modes `FIXTURE`, `LIVE_ANALYSIS`, `DERIVED`, `MODEL`, `RULE`, `LLM_RENDERED`;
- analysis-run and data-quality status;
- exact competition CSV columns and mapping;
- `H2SentinelDataSource` interface;
- API envelope fields for success, warning, and redacted error.

### Acceptance checks

- golden C03 and C04 fixtures validate against JSON Schemas;
- TypeScript fixtures satisfy exported types;
- `submission-row` mapping preserves exact column order;
- no official large dataset is committed;
- no runtime dependency is added outside the subtree;
- all changed paths are inside `packages/h2-contracts/**`;
- `git diff --check` passes.

Recommended commands:

```bash
npm ci
npm run typecheck
npx tsx --test packages/h2-contracts/test/*.test.ts
git diff --check
```

If the root test command cannot discover the new package before integration, document the exact focused command and its result rather than editing root scripts.

### Archive commits

Suggested sequence:

```text
feat(h2-contracts): add canonical domain and provenance types
feat(h2-contracts): add API and submission schemas
test(h2-contracts): add golden C03 and C04 fixtures
docs(h2-contracts): record contract invariants and handoff
```

Push after every commit.

### Copy-paste agent prompt

```text
You are the H2 Sentinel canonical-contract agent.

You are permanently bound to branch agent/h2-contracts and its isolated worktree.
Verify the branch before editing.

WRITE ALLOWLIST:
- packages/h2-contracts/**

WRITE DENYLIST:
- every other repository path
- especially packages/contracts/**, package.json, package-lock.json, apps/**,
  plugins/**, services/**, tests/**, submission/**, and docs/competition/**

READ-ONLY INPUTS:
- docs/competition/h2-sentinel/PRD.md
- docs/competition/h2-sentinel/BRANCH_OVERVIEW.md
- official T03-04 task materials
- existing OpenDashboard contracts and fixture plugin

OBJECTIVE:
Freeze the canonical H2 dataset, quality, event, evidence, impact, safety,
assistant, report, provenance, submission, and data-source contracts. Add
small sanitized golden C03/C04 fixtures and focused contract tests.

RULES:
- Do not implement analytics, UI, plugin adapters, launch scripts, or root wiring.
- Do not change a root dependency.
- Use English for code and technical docs.
- Do not commit official large datasets.
- Search official repositories before adding any dependency; a new dependency
  is expected to be unnecessary for this track.
- A write-capable subagent must remain inside packages/h2-contracts/**.
- Complete one bounded increment, test it, commit it, and push it immediately.
- Never amend a pushed commit, rebase a pushed branch, force-push, reset --hard,
  or clean shared worktrees.

HANDOFF:
Write packages/h2-contracts/HANDOFF.md containing branch, immutable base SHA,
pushed commit SHAs, changed files, commands and results, schema invariants,
known limitations, and requested coordinator decisions.
```

## 5. Coordinator accepts the contract gate

After H0 pushes and hands off:

```bash
git switch competition/h2-sentinel
git pull --ff-only

git cherry-pick <H0-accepted-commit-1>
git cherry-pick <H0-accepted-commit-2>
# Continue only with accepted archive commits.

npm run typecheck
npm run test
git diff --check

git push origin competition/h2-sentinel
```

Record the contract gate:

```bash
H2_CONTRACT_GATE="$(git rev-parse HEAD)"
printf 'H2 contract gate: %s\n' "$H2_CONTRACT_GATE"
```

### Root dependency preflight

Before creating the Web branch, the coordinator or a dedicated integration session may add the single approved Web dependency needed by parallel work: Apache ECharts.

This is a sequential root-file lease. No other root-file agent may run concurrently.

```bash
npm install echarts
npm run check
git diff --check
git add package.json package-lock.json
git commit -m "chore(h2): add approved chart dependency"
git push origin competition/h2-sentinel
```

Do not add a React wrapper unless a separate review proves that it removes more code and risk than a small feature-local wrapper.

After this preflight, record the immutable Wave 1 base:

```bash
H2_WAVE1_GATE="$(git rev-parse HEAD)"
printf 'H2 Wave 1 gate: %s\n' "$H2_WAVE1_GATE"
```

## 6. Create Wave 1 worktrees

```bash
git worktree add ../od-h2-analytics \
  -b agent/h2-analytics \
  "$H2_WAVE1_GATE"

git worktree add ../od-h2-plugin \
  -b agent/h2-plugin \
  "$H2_WAVE1_GATE"

git worktree add ../od-h2-web \
  -b agent/h2-web \
  "$H2_WAVE1_GATE"

git worktree add ../od-h2-qa \
  -b agent/h2-qa \
  "$H2_WAVE1_GATE"

git worktree add ../od-h2-submission \
  -b agent/h2-submission \
  "$H2_WAVE1_GATE"
```

Push each branch before assigning a session:

```bash
for branch in \
  agent/h2-analytics \
  agent/h2-plugin \
  agent/h2-web \
  agent/h2-qa \
  agent/h2-submission
do
  git push -u origin "$branch"
done
```

## 7. Wave 1 — Parallel worker tracks

## Track H1 — Analytics sidecar

### Identity

- **Branch:** `agent/h2-analytics`
- **Worktree:** `../od-h2-analytics`
- **Base:** immutable `H2_WAVE1_GATE`
- **Exclusive write allowlist:** `services/h2-analytics/**`
- **Denylist:** all other paths
- **Handoff file:** `services/h2-analytics/HANDOFF.md`

### Objective

Create the deterministic Python analysis service that transforms official EMS data into canonical H2 analysis results.

### Internal directory ownership for optional subagents

The parent H1 agent owns the complete service but may create child agents with narrower paths:

| Child lane | Child branch example | Exclusive internal path |
|---|---|---|
| H1A ingestion and quality | `agent/h2-analytics/ingestion` | `services/h2-analytics/src/h2_analytics/ingestion/**`, `quality/**`, related tests |
| H1B detection and events | `agent/h2-analytics/detection` | `features/**`, `detection/**`, `events/**`, related tests |
| H1C diagnosis and safety | `agent/h2-analytics/diagnosis` | `diagnosis/**`, `impact/**`, `safety/**`, related tests |
| H1D API, assistant, reports | `agent/h2-analytics/api-report` | `api/**`, `assistant/**`, `reports/**`, `templates/**`, related tests |

Parent-only files:

```text
services/h2-analytics/pyproject.toml
services/h2-analytics/README.md
services/h2-analytics/HANDOFF.md
services/h2-analytics/src/h2_analytics/__init__.py
services/h2-analytics/src/h2_analytics/settings.py
```

Child branches are optional. If used, the parent creates them, reviews them, and cherry-picks them. Child agents do not edit parent-only files.

### Required deliverables

1. **Ingestion**
   - official CSV parsing;
   - timestamp normalization;
   - field mapping and Chinese metadata;
   - dataset fingerprint;
   - controlled temporary storage.

2. **Data quality**
   - required-field checks;
   - missing values;
   - duplicate/irregular timestamps;
   - invalid ranges;
   - power-balance residual;
   - blocking versus warning outcomes.

3. **Detection**
   - migrated LightGBM baseline behind `RowDetector`;
   - model loading and versioning;
   - deterministic feature pipeline;
   - no training on every UI request.

4. **Event aggregation**
   - smoothing;
   - class-specific short-gap merge;
   - class-specific minimum duration;
   - start/end/first-detection time;
   - confidence aggregation;
   - validation matching and metrics.

5. **Diagnosis**
   - primary control object;
   - affected equipment;
   - structured evidence;
   - C03 and C04 complete rule paths;
   - C07 early-warning path if time permits.

6. **Impact**
   - versioned metric calculators for C01-C07;
   - unit and assumptions;
   - no LLM arithmetic.

7. **Safety**
   - externalized constraint loading;
   - passed/failed/unknown checks;
   - human-confirmation flag;
   - no control execution.

8. **Assistant and reports**
   - deterministic answers to ten official questions;
   - Jinja HTML event report;
   - structured JSON and exact `submission.csv` export;
   - optional LLM renderer behind an interface, disabled by default.

9. **API**
   - loopback-ready FastAPI app;
   - `/health` and version metadata;
   - import/analyze/run/event/series/assistant/report/export endpoints;
   - canonical response validation;
   - redacted structured errors.

### Required reuse review

Check and document:

- FastAPI/Pydantic: adopt;
- LightGBM/pandas/scikit-learn from starter: adopt;
- Jinja: adopt for HTML reports;
- Evidently: adapter-only P1 decision;
- PyRCA: adapter-only experimental decision;
- Merlion: reject due to archived upstream and duplicate scope.

### Acceptance checks

```bash
cd services/h2-analytics
python -m pip install -e '.[dev]'
python -m pytest
python -m h2_analytics.tools.smoke_golden
python -m h2_analytics.tools.validate_submission <generated-submission.csv>
git diff --check
```

Minimum functional assertions:

- tiny valid fixture passes ingestion;
- tiny invalid fixture returns structured quality errors;
- golden C03 and C04 outputs validate against canonical schemas;
- deterministic run produces identical canonical output on repeated execution;
- assistant fallback works with no LLM configuration;
- API binds to loopback in the documented run command;
- no endpoint accepts arbitrary commands or paths;
- all changed files remain inside the service subtree.

### Archive commits

Suggested sequence:

```text
feat(h2-analytics): add package skeleton and validated ingestion
feat(h2-analytics): add quality checks and dataset fingerprint
feat(h2-analytics): migrate LightGBM detector pipeline
feat(h2-analytics): add class-aware event aggregation
feat(h2-analytics): add C03 and C04 evidence builders
feat(h2-analytics): add impact and safety rule engine
feat(h2-analytics): add loopback API and deterministic assistant
feat(h2-analytics): add HTML and submission exporters
test(h2-analytics): add golden pipeline and API coverage
docs(h2-analytics): add local run and handoff evidence
```

### Copy-paste agent prompt

```text
You are the H2 Sentinel analytics-sidecar agent.

You are permanently bound to branch agent/h2-analytics and its isolated worktree.
Verify the branch before editing.

WRITE ALLOWLIST:
- services/h2-analytics/**

WRITE DENYLIST:
- every other repository path
- especially packages/h2-contracts/**, apps/**, plugins/**, tests/h2-sentinel/**,
  submission/**, package.json, package-lock.json, root scripts, and planning docs

READ-ONLY INPUTS:
- packages/h2-contracts/**
- docs/competition/h2-sentinel/PRD.md
- official T03-04 data and requirement package outside Git
- the rapid LightGBM starter kit

OBJECTIVE:
Build the deterministic local Python pipeline and FastAPI boundary for import,
quality, detection, event aggregation, evidence, impact, safety, assistant,
reports, and exact submission export. Complete C03 and C04 first.

ARCHITECTURE RULES:
- The canonical contract is immutable. Do not edit it.
- The LLM may render text but may not calculate facts or decide safety.
- Fixture and template fallback must work without network or an API key.
- Bind only to loopback in documented commands.
- Never add shell execution, arbitrary file browsing, dynamic module loading,
  remote control, or a database.
- Keep all Python dependencies and configuration inside the service subtree.
- Search official repos and document adopt/adapt/reject decisions before adding
  a non-trivial dependency.

SUBAGENTS:
You may create read-only subagents. A write-capable child must use a child branch,
child worktree, and a narrower subdirectory allowlist under services/h2-analytics/**.
You alone review and cherry-pick child commits into agent/h2-analytics.

ARCHIVE RULE:
After every bounded increment passes focused tests, commit and push immediately.
Never amend a pushed commit, rebase a pushed branch, force-push, reset --hard,
or clean shared worktrees.

CROSS-TRACK BLOCKERS:
Do not modify another track. Record the exact requested change in
services/h2-analytics/HANDOFF.md with expected contract/API behavior.
```

## Track H2 — H2 EMS plugin adapters

### Identity

- **Branch:** `agent/h2-plugin`
- **Worktree:** `../od-h2-plugin`
- **Base:** immutable `H2_WAVE1_GATE`
- **Exclusive write allowlist:** `plugins/h2-ems/**`
- **Denylist:** all other paths
- **Handoff file:** `plugins/h2-ems/HANDOFF.md`

### Objective

Implement a statically reviewed Tier 1 H2 plugin that exposes one `H2SentinelDataSource` to the Web layer through Fixture and loopback adapters.

### Required deliverables

```text
plugins/h2-ems/
├─ README.md
├─ HANDOFF.md
├─ src/
│  ├─ index.ts
│  ├─ manifest.ts
│  ├─ tokens.ts
│  ├─ data-source.ts
│  ├─ adapters/
│  │  ├─ fixture-data-source.ts
│  │  ├─ loopback-data-source.ts
│  │  └─ response-validation.ts
│  ├─ services/
│  │  ├─ mode-service.ts
│  │  └─ export-service.ts
│  └─ errors.ts
└─ test/
   ├─ fixture-data-source.test.ts
   ├─ loopback-data-source.test.ts
   ├─ response-validation.test.ts
   └─ provenance.test.ts
```

Requirements:

- static trusted plugin manifest;
- no dynamic import or arbitrary URL;
- Fixture adapter reads canonical golden fixtures;
- loopback adapter accepts only approved loopback base URLs;
- runtime response validation before data reaches the UI;
- timeouts, cancellation, and redacted error mapping;
- provenance preserved on every response;
- report/download response normalized;
- no direct UI imports;
- no edits to plugin runtime or `main.tsx`.

### Acceptance checks

```bash
npm ci
npm run typecheck
npm run test
git diff --check
```

Focused tests must prove:

- Fixture mode returns C03/C04 with canonical types;
- non-loopback analytics URL is rejected;
- invalid API response is rejected and redacted;
- timeout/cancellation maps to a stable error;
- provenance is not lost;
- no request is sent in Fixture mode;
- all changed paths are inside `plugins/h2-ems/**`.

### Archive commits

```text
feat(h2-plugin): add manifest and data-source token
feat(h2-plugin): add deterministic fixture adapter
feat(h2-plugin): add validated loopback adapter
test(h2-plugin): cover provenance and failure boundaries
docs(h2-plugin): record integration requests and handoff
```

### Copy-paste agent prompt

```text
You are the H2 Sentinel plugin-adapter agent.

You are permanently bound to branch agent/h2-plugin and its isolated worktree.
Verify the branch before editing.

WRITE ALLOWLIST:
- plugins/h2-ems/**

WRITE DENYLIST:
- every other repository path
- especially packages/**, apps/**, services/**, root manifests, plugin runtime,
  fixture-demo, tests/h2-sentinel/**, and planning docs

READ-ONLY INPUTS:
- packages/h2-contracts/**
- packages/plugin-runtime/**
- plugins/fixture-demo/**
- docs/competition/h2-sentinel/PRD.md

OBJECTIVE:
Provide one statically reviewed H2SentinelDataSource service with a deterministic
Fixture adapter and a validated loopback API adapter. Preserve provenance and
map failures to stable redacted errors.

RULES:
- Do not modify the plugin runtime or Web composition.
- Do not import UI modules.
- Do not accept arbitrary remote URLs.
- Do not add root dependencies.
- Do not duplicate canonical contracts.
- Record any needed main.tsx or root wiring in HANDOFF.md.
- Subagents inherit plugins/h2-ems/** and require narrower child paths.
- Commit and push every verified increment immediately.
- Never rewrite pushed history or modify another track.
```

## Track H3 — H2 Sentinel Web feature

### Identity

- **Branch:** `agent/h2-web`
- **Worktree:** `../od-h2-web`
- **Base:** immutable `H2_WAVE1_GATE`
- **Exclusive write allowlist:** `apps/web/src/features/h2-sentinel/**`
- **Denylist:** all other paths, including `apps/web/src/main.tsx`
- **Handoff file:** `apps/web/src/features/h2-sentinel/HANDOFF.md`

### Objective

Build the full H2 Sentinel presentation as a feature-local module that depends only on `H2SentinelDataSource` and canonical contracts.

### Required deliverables

```text
apps/web/src/features/h2-sentinel/
├─ README.md
├─ HANDOFF.md
├─ index.ts
├─ H2SentinelApp.tsx
├─ routes.ts
├─ model/
├─ hooks/
├─ components/
│  ├─ charts/
│  ├─ evidence/
│  ├─ impact/
│  ├─ safety/
│  ├─ provenance/
│  └─ common/
├─ pages/
│  ├─ overview/
│  ├─ events/
│  ├─ diagnosis/
│  ├─ analysis/
│  ├─ assistant/
│  └─ reports/
├─ styles/
└─ test/
```

Page requirements:

1. system overview;
2. anomaly event center;
3. diagnosis detail;
4. data analysis;
5. operations assistant;
6. report center.

Mandatory UI behavior:

- Fixture/Live provenance is always visible;
- C03 and C04 reachable quickly;
- fact/calculation/inference/recommendation labels are distinct;
- charts show units, constraints, event bands, and synchronized tooltips;
- severity does not depend on color alone;
- no direct `fetch`; all data flows through injected data source;
- no business calculations in React components;
- loading, empty, degraded, and error states exist;
- assistant works with deterministic answers;
- report/export actions return visible results;
- desktop demo is polished, mobile remains usable.

### Internal child-agent map

If H3 uses write-capable subagents, use narrower child branches:

| Child lane | Example branch | Exclusive internal path |
|---|---|---|
| Overview/events | `agent/h2-web/overview-events` | `pages/overview/**`, `pages/events/**`, dedicated components/tests |
| Diagnosis | `agent/h2-web/diagnosis` | `pages/diagnosis/**`, `components/evidence/**`, `impact/**`, `safety/**` |
| Analysis/charts | `agent/h2-web/analysis-charts` | `pages/analysis/**`, `components/charts/**` |
| Assistant/reports | `agent/h2-web/assistant-reports` | `pages/assistant/**`, `pages/reports/**` |

Parent-only files:

```text
H2SentinelApp.tsx
index.ts
routes.ts
model/**
hooks/**
README.md
HANDOFF.md
shared common/provenance components
```

The parent agent resolves all feature-internal composition. Child agents never edit `main.tsx`.

### Acceptance checks

```bash
npm ci
npm run typecheck
npm run test
npm run build
git diff --check
```

Manual checks:

- Fixture golden path at desktop width;
- core pages at narrow/mobile width;
- C03 and C04 screenshot readiness;
- no external request in Fixture mode;
- assistant and report actions provide deterministic output;
- all changed paths remain inside the feature subtree.

### Archive commits

```text
feat(h2-web): add feature shell and injected data source
feat(h2-web): add overview and event center
feat(h2-web): add evidence-first diagnosis detail
feat(h2-web): add analysis charts and quality view
feat(h2-web): add assistant and report center
test(h2-web): cover fixture golden path states
docs(h2-web): record composition contract and handoff
```

### Copy-paste agent prompt

```text
You are the H2 Sentinel Web-feature agent.

You are permanently bound to branch agent/h2-web and its isolated worktree.
Verify the branch before editing.

WRITE ALLOWLIST:
- apps/web/src/features/h2-sentinel/**

WRITE DENYLIST:
- every other path
- specifically apps/web/src/main.tsx, apps/web/index.html, root manifests,
  packages/**, plugins/**, services/**, tests/h2-sentinel/**, and planning docs

READ-ONLY INPUTS:
- packages/h2-contracts/**
- existing apps/web components and design patterns
- docs/competition/h2-sentinel/PRD.md

OBJECTIVE:
Build the six-page Chinese H2 Sentinel feature with a polished C03/C04 golden
path. Accept an injected H2SentinelDataSource. Do not call APIs directly.

RULES:
- Keep all feature files, tests, styles, and components under the allowlist.
- No business calculations in the UI.
- Show provenance, units, evidence, safety, and human confirmation.
- Use Apache ECharts through a small feature-local wrapper; do not add another
  chart framework or a full admin template.
- Do not edit main.tsx or root package files. Put exact wiring instructions in
  HANDOFF.md.
- A write-capable subagent needs a child branch and narrower feature subdirectory.
- Commit and push every verified page or component increment immediately.
- Never change another track to fix your branch.
```

## Track H4 — Independent QA and black-box tests

### Identity

- **Branch:** `agent/h2-qa`
- **Worktree:** `../od-h2-qa`
- **Base:** immutable `H2_WAVE1_GATE`
- **Exclusive write allowlist:** `tests/h2-sentinel/**`
- **Denylist:** all implementation and root paths
- **Handoff file:** `tests/h2-sentinel/HANDOFF.md`

### Objective

Build independent black-box acceptance tests from the frozen contract and PRD. QA reports defects; it does not repair another track's implementation.

### Required deliverables

```text
tests/h2-sentinel/
├─ README.md
├─ HANDOFF.md
├─ contract/
├─ api/
├─ golden-path/
├─ fixtures/
├─ scripts/
└─ reports/
```

Required coverage:

- JSON Schema validation;
- exact `submission.csv` columns and values;
- C03/C04 canonical result assertions;
- Fixture data-source behavior;
- API health/version and redacted failure behavior;
- non-loopback URL rejection;
- deterministic assistant fallback;
- report metadata and safety disclaimer;
- offline Fixture golden path;
- live-analysis smoke path when service is available;
- no official large files in Git;
- ownership/path audit.

### Defect protocol

For every defect, record:

```text
ID:
Severity:
Expected contract:
Observed behavior:
Reproduction command:
Relevant commit SHA:
Owned implementation track:
Golden-path blocker: yes/no
Evidence artifact:
```

Do not edit the implementation to make a test pass. Route the defect through the coordinator.

### Acceptance checks

QA must provide executable commands and separate:

- tests that pass against the contract gate;
- tests that require an assembled integration branch;
- tests currently failing because implementation is not yet integrated.

Suggested archive commits:

```text
test(h2-qa): add schema and submission conformance suite
test(h2-qa): add C03 and C04 black-box assertions
test(h2-qa): add API safety and failure tests
test(h2-qa): add offline golden-path smoke harness
docs(h2-qa): publish defect and handoff protocol
```

### Copy-paste agent prompt

```text
You are the independent H2 Sentinel QA agent.

You are permanently bound to branch agent/h2-qa and its isolated worktree.
Verify the branch before editing.

WRITE ALLOWLIST:
- tests/h2-sentinel/**

WRITE DENYLIST:
- every other repository path, including all implementation and root files

READ-ONLY INPUTS:
- packages/h2-contracts/**
- docs/competition/h2-sentinel/PRD.md
- public interfaces and pushed commits from worker tracks

OBJECTIVE:
Create black-box conformance, API, safety, export, and golden-path tests. Report
implementation defects with reproducible evidence. Do not repair another track.

RULES:
- Tests derive from the frozen contract and PRD, not from implementation quirks.
- Keep fixtures small and sanitized.
- Do not commit official competition datasets.
- Do not weaken a test to accommodate a bug without coordinator approval.
- Write every defect to the QA handoff with owner track and blocker severity.
- Subagents remain under tests/h2-sentinel/**.
- Commit and push each verified test group immediately.
```

## Track H5 — Submission and storytelling package

### Identity

- **Branch:** `agent/h2-submission`
- **Worktree:** `../od-h2-submission`
- **Base:** immutable `H2_WAVE1_GATE`
- **Exclusive write allowlist:** `submission/h2-sentinel/**`
- **Denylist:** all product code, root files, and coordinator planning docs
- **Handoff file:** `submission/h2-sentinel/HANDOFF.md`

### Objective

Prepare the competition-facing narrative and evidence package without changing product code or inventing unsupported claims.

### Required deliverables

- ten-page Feishu project-document structure;
- 3-5 minute demo script and shot list;
- 30-second backup smoke-demo script;
- screenshot checklist and file naming;
- claim-to-evidence matrix;
- baseline-versus-official-score disclaimer;
- architecture diagram source description;
- open-source reuse and license input list;
- submission checklist;
- line-by-line link/accessibility test checklist;
- live-demo failure fallback plan.

### Claim-to-evidence rule

Every public claim must map to one of:

- executable product behavior;
- exported artifact;
- validation metric with defined matching rules;
- official task requirement;
- explicitly labeled future plan.

No document may describe validation metrics as official test scores. No document may claim automatic equipment control.

### Acceptance checks

- project document fits the organizer's page limit;
- video script demonstrates C03 and C04 rather than listing all features;
- every metric has dataset split and definition;
- every external project has source/license input;
- no private path, secret, or official large dataset is included;
- all changed files remain inside `submission/h2-sentinel/**`;
- `git diff --check` passes.

Suggested commits:

```text
docs(h2-submission): add ten-page project narrative
docs(h2-submission): add demo script and shot list
docs(h2-submission): add claim-to-evidence matrix
docs(h2-submission): add release and link checklists
docs(h2-submission): record third-party attribution inputs
```

### Copy-paste agent prompt

```text
You are the H2 Sentinel competition-submission agent.

You are permanently bound to branch agent/h2-submission and its isolated worktree.
Verify the branch before editing.

WRITE ALLOWLIST:
- submission/h2-sentinel/**

WRITE DENYLIST:
- every other path, including product code, root files, and
  docs/competition/h2-sentinel/**

READ-ONLY INPUTS:
- PRD and branch overview
- canonical contracts
- pushed product screenshots, reports, metrics, and release artifacts
- official competition requirements

OBJECTIVE:
Create the ten-page project narrative, 3-5 minute demo script, screenshot plan,
claim-to-evidence matrix, open-source attribution inputs, and submission checks.

RULES:
- Do not edit product code.
- Do not invent a metric or claim.
- Label validation results as validation results, not official scores.
- State that recommendations require human confirmation and do not control equipment.
- Use C03 and C04 as the main story.
- Keep all work under the allowlist.
- Commit and push each complete document group immediately.
```

## 8. Contract-change protocol

A downstream agent must never “fix” the canonical contract directly.

### 8.1 Request format

The requesting track adds this section to its own `HANDOFF.md`:

```markdown
## Contract change request CCR-<track>-<number>

- Requesting branch:
- Requesting commit:
- Existing schema/type:
- Problem demonstrated by:
- Smallest proposed change:
- Backward compatibility:
- Golden fixture impact:
- Other tracks affected:
- Blocker severity:
```

### 8.2 Coordinator decision

The coordinator chooses one:

- reject and explain the existing contract usage;
- defer to P1;
- reopen H0 on `agent/h2-contracts` for a new additive commit;
- declare a breaking Contract Gate v2 and deliberately restart affected workers.

Prefer additive, optional fields over breaking changes. A contract change is not accepted until a new pushed H0 commit is cherry-picked into `competition/h2-sentinel`.

### 8.3 Worker synchronization

Workers do not rebase pushed branches. To consume an accepted additive contract commit, a worker may:

```bash
git fetch origin
git cherry-pick <accepted-contract-commit>
git push origin HEAD
```

The worker records the new dependency commit in its handoff.

## 9. Owned-path verification

Before every commit, a worker checks its diff against the immutable base or latest accepted parent commit.

Example portable check:

```bash
TRACK_BASE='<immutable-track-base-sha>'
git diff --name-only "$TRACK_BASE"...HEAD
git status --short
```

For uncommitted changes:

```bash
git diff --name-only
git diff --cached --name-only
```

The agent must inspect every path. If any path is outside its allowlist:

1. stop;
2. do not commit;
3. restore only the accidental file using a non-destructive targeted command;
4. document the cause if another tool generated it;
5. rerun checks.

Do not use `git reset --hard` or `git clean` as a shortcut.

## 10. Commit and push protocol

### 10.1 Mandatory archive cycle

```bash
# 1. Verify branch.
test "$(git branch --show-current)" = '<assigned-branch>'

# 2. Run focused checks.
<track-specific-checks>

git diff --check

# 3. Stage only owned paths.
git add <exact-owned-files-or-directory>
git diff --cached --name-only

# 4. Commit one bounded result.
git commit -m '<type>(<scope>): <bounded result>'

# 5. Push immediately.
git push -u origin HEAD

# 6. Record the SHA.
git rev-parse HEAD
```

### 10.2 Commit-message vocabulary

Use:

- `feat` for a working capability;
- `fix` for a verified defect correction;
- `test` for tests or fixtures;
- `docs` for technical/submission documentation;
- `chore` for dependency/build/integration maintenance;
- `refactor` only when behavior is preserved and tests prove it.

Examples:

```text
feat(h2-contracts): freeze anomaly evidence schema
feat(h2-analytics): add class-aware event aggregation
feat(h2-plugin): add validated loopback data source
feat(h2-web): add evidence-first diagnosis detail
test(h2-qa): add exact submission conformance checks
docs(h2-submission): add claim-to-evidence matrix
chore(h2-integration): wire competition mode into Web entry
```

### 10.3 No history rewriting

After push:

- do not amend;
- do not interactive-rebase;
- do not force-push;
- do not squash by rewriting the worker branch.

A correction is a new `fix(...)` commit. The coordinator may choose which commits to cherry-pick.

## 11. Worker handoff standard

Every top-level track ends with a pushed `HANDOFF.md` inside its owned root.

Required template:

```markdown
# <Track> Handoff

- Branch:
- Worktree:
- Immutable base SHA:
- Current head SHA:
- Owned write paths:

## Pushed archive commits

| SHA | Purpose | Checks |
|---|---|---|

## Delivered behavior

## Public interfaces consumed

## Public interfaces produced

## Verification commands and exact results

## Generated artifacts

## Known limitations

## Contract change requests

## Integration changes required outside this track

## Open-source reuse decisions

## Golden-path risk

## Recommended cherry-pick order
```

A chat summary without a pushed handoff file is not a complete handoff.

## 12. Coordinator review checklist for worker commits

Before cherry-picking a worker commit:

- [ ] Commit is pushed and SHA is supplied.
- [ ] Branch was based on the declared gate.
- [ ] Changed files stay inside the allowlist.
- [ ] Commit represents one bounded archive point.
- [ ] Focused checks and exact results are recorded.
- [ ] No secret or official large data is present.
- [ ] No new dependency bypassed review.
- [ ] Canonical contract was not duplicated or changed.
- [ ] Fixture/Live provenance remains truthful.
- [ ] Safety boundary is preserved.
- [ ] Handoff lists integration requirements.

Review path ownership with:

```bash
git show --stat --oneline <commit-sha>
git diff-tree --no-commit-id --name-only -r <commit-sha>
```

## 13. Assembly of Wave 1

The coordinator may cherry-pick disjoint worker commits in any dependency-safe order. Recommended order:

1. analytics package skeleton and canonical output;
2. plugin Fixture and loopback adapters;
3. Web feature shell and pages;
4. QA suites;
5. submission materials.

Example:

```bash
git switch competition/h2-sentinel
git pull --ff-only

git cherry-pick <accepted-H1-commits>
git cherry-pick <accepted-H2-commits>
git cherry-pick <accepted-H3-commits>
git cherry-pick <accepted-H4-commits>
git cherry-pick <accepted-H5-commits>

git push origin competition/h2-sentinel
```

Because write sets are disjoint, a cherry-pick conflict is treated as an architecture warning. Do not resolve it casually. Identify which ownership rule was violated.

## 14. Wave 2 — Integration track

Create the integration worktree only after accepted Wave 1 commits are assembled:

```bash
ASSEMBLY_GATE="$(git rev-parse competition/h2-sentinel)"

git worktree add ../od-h2-integration \
  -b agent/h2-integration \
  "$ASSEMBLY_GATE"

git -C ../od-h2-integration push -u origin agent/h2-integration
```

## Track H6 — Composition, launch, and release integration

### Identity

- **Branch:** `agent/h2-integration`
- **Worktree:** `../od-h2-integration`
- **Base:** immutable `ASSEMBLY_GATE`
- **Exclusive write allowlist:** the integration-only path set below
- **Denylist:** worker-owned implementation subtrees except read-only inspection
- **Handoff file:** `scripts/h2-sentinel/HANDOFF.md`

### Exclusive write allowlist

```text
apps/web/src/main.tsx
apps/web/index.html
package.json
package-lock.json
tsconfig.json
vite.config.*
.github/workflows/*h2*
scripts/h2-sentinel/**
start-h2-sentinel.sh
start-h2-sentinel.bat
.gitignore
NOTICE
THIRD_PARTY_NOTICES.md
```

The track may create only the listed files or matching patterns. It may not refactor `apps/web/src/features/h2-sentinel/**`, `plugins/h2-ems/**`, `services/h2-analytics/**`, or contracts.

### Objective

Wire already accepted modules into a reproducible competition application. Integration is composition, not a second implementation pass.

### Required deliverables

- register the H2 EMS plugin statically;
- resolve `H2SentinelDataSource` and mount `H2SentinelApp`;
- preserve existing Fixture demo or provide an explicit competition entry without silently deleting generic behavior;
- add approved root scripts and dependency lock changes;
- configure dev proxy or same-origin route if needed;
- add launchers for Windows and shell/WSL;
- add loopback service health wait and clean shutdown;
- add H2 CI workflow or extend CI only through approved files;
- update `.gitignore` for official data, run artifacts, virtualenvs, models, and reports;
- complete third-party notices;
- run full checks and launcher smoke tests;
- record exact release commands and limitations.

### What integration must not do

- redesign the H2 UI;
- alter anomaly algorithms;
- change schemas;
- add a new dependency without review;
- hide a worker failure with a hard-coded result outside Fixture mode;
- expose the Python service beyond loopback;
- remove provenance or human-confirmation behavior;
- build a general Sidecar runtime.

### Required checks

```bash
npm ci
npm run typecheck
npm run test
npm run build
npm run check

cd services/h2-analytics
python -m pip install -e '.[dev]'
python -m pytest
cd ../..

git diff --check
```

Launcher smoke tests:

- Fixture-only start with no Python service;
- local deterministic start with sidecar;
- health timeout produces actionable error;
- occupied port produces actionable error;
- no LLM key still completes golden path;
- application shutdown cleans child processes;
- C03 report and `submission.csv` export;
- desktop and narrow-width visual check.

### Archive commits

```text
chore(h2-integration): register H2 plugin and feature entry
chore(h2-integration): add local analytics launch orchestration
chore(h2-integration): add H2 build and CI checks
chore(h2-integration): add data ignores and third-party notices
test(h2-integration): verify fixture and local launch modes
docs(h2-integration): publish release handoff
```

### Copy-paste agent prompt

```text
You are the H2 Sentinel integration agent.

You are permanently bound to branch agent/h2-integration and its isolated worktree.
Verify the branch before editing.

WRITE ALLOWLIST:
- apps/web/src/main.tsx
- apps/web/index.html
- package.json
- package-lock.json
- tsconfig.json
- vite.config.*
- .github/workflows/*h2*
- scripts/h2-sentinel/**
- start-h2-sentinel.sh
- start-h2-sentinel.bat
- .gitignore
- NOTICE
- THIRD_PARTY_NOTICES.md

WRITE DENYLIST:
- packages/h2-contracts/**
- services/h2-analytics/**
- plugins/h2-ems/**
- apps/web/src/features/h2-sentinel/**
- tests/h2-sentinel/**
- submission/h2-sentinel/**
- coordinator planning docs
- every other path not explicitly allowlisted

READ-ONLY INPUTS:
- all accepted worker modules and handoffs
- existing OpenDashboard plugin runtime and composition
- PRD, branch overview, and QA reports

OBJECTIVE:
Compose the accepted H2 contracts, analytics service, plugin adapters, and Web
feature into a reproducible competition application. Add only the root wiring,
launch, CI, ignore, and attribution changes required for delivery.

RULES:
- Integration is not permission to repair worker-owned modules.
- Route defects to the coordinator and owner track.
- Preserve Fixture mode, provenance, safety, and human confirmation.
- Bind the Python service to loopback only.
- Do not create a general Sidecar or dynamic plugin system.
- Run full TypeScript, Python, build, and launcher checks.
- Commit and push every verified integration increment immediately.
- Never amend pushed commits or rewrite history.
```

## 15. Defect-routing table

| Defect area | Owner track | Other agents must do |
|---|---|---|
| Schema/type ambiguity | H0 Contracts | File CCR in own handoff; do not edit contract |
| CSV parsing/data quality | H1 Analytics | Provide input fingerprint and reproduction |
| Detection/event boundary | H1 Analytics | Provide event ID, expected interval, metric definition |
| Evidence/impact/safety | H1 Analytics | Provide canonical expected result |
| Fixture/API adapter | H2 Plugin | Provide mocked request/response and provenance issue |
| Page/component behavior | H3 Web | Provide screenshot, route, Fixture event ID |
| Black-box test correctness | H4 QA | Coordinator reviews contract basis |
| Public claim or demo script | H5 Submission | Provide evidence source or remove claim |
| Root wiring/launcher/build | H6 Integration | Provide exact command, logs with secrets removed |

No agent fixes another owner area directly.

## 16. Scope-cut protocol

When the deadline is threatened, the coordinator cuts scope in this order:

1. remove optional LLM rendering;
2. remove Evidently integration;
3. remove PyRCA spike;
4. keep C07 as a static secondary case;
5. remove non-essential animations and advanced filters;
6. keep only HTML report plus required CSV;
7. keep live analysis for validation data but demo with Fixture;
8. preserve C03/C04, six pages, assistant fallback, safety, exports, and one-click launch.

Never cut:

- canonical contracts;
- Fixture golden path;
- C03/C04 evidence and impact;
- provenance;
- human confirmation;
- exact submission columns;
- offline demo;
- commit/push archive discipline.

## 17. Feature-freeze rules

After the coordinator declares feature freeze:

Allowed commits:

- golden-path blocker fixes;
- incorrect result or safety fix;
- broken export or launcher fix;
- unsupported-claim correction;
- test stabilization for deterministic behavior;
- secret/data/license cleanup.

Not allowed:

- new page;
- new framework;
- new model family;
- UI redesign;
- new runtime agent;
- new database/service;
- broad refactor;
- “while here” cleanup.

Every freeze-period commit must state the blocker it resolves.

## 18. Final coordinator release sequence

```bash
# 1. Assemble accepted worker and integration commits.
git switch competition/h2-sentinel
git pull --ff-only
git cherry-pick <accepted-H6-commits>

# 2. Run full repository checks.
npm ci
npm run typecheck
npm run test
npm run build
npm run check

# 3. Run Python checks.
cd services/h2-analytics
python -m pip install -e '.[dev]'
python -m pytest
cd ../..

# 4. Run black-box H2 tests using their documented commands.
# 5. Run Fixture and local launch smoke tests.
# 6. Run git hygiene checks.
git status --short
git diff --check

# 7. Archive the verified release state.
git add <coordinator-owned-final-files-only-if-any>
git commit -m "chore(h2-release): freeze competition candidate"  # only if changes exist
git push origin competition/h2-sentinel

RELEASE_SHA="$(git rev-parse HEAD)"
printf 'H2 Sentinel release candidate: %s\n' "$RELEASE_SHA"
```

Tagging is optional and coordinator-controlled:

```bash
git tag -a h2-sentinel-online-submission -m "H2 Sentinel online submission"
git push origin h2-sentinel-online-submission
```

Do not move or recreate an existing tag.

## 19. Final release checklist

### Repository and ownership

- [ ] Every agent branch is unique and pushed.
- [ ] Every agent used an isolated worktree.
- [ ] Worker diffs stayed inside exclusive allowlists.
- [ ] Planning files remained coordinator-owned.
- [ ] Root files had no concurrent owner.
- [ ] All accepted work is identified by pushed SHAs.
- [ ] No pushed history was rewritten.

### Product

- [ ] Fixture golden path works offline.
- [ ] Live validation analysis works.
- [ ] Six required pages are accessible.
- [ ] C03 and C04 diagnosis pages are complete.
- [ ] Evidence, impact, safety, and provenance are visible.
- [ ] Ten assistant questions have deterministic answers.
- [ ] HTML report exports.
- [ ] Exact `submission.csv` exports.
- [ ] No real equipment action exists.

### Engineering

- [ ] TypeScript checks pass.
- [ ] Python tests pass.
- [ ] Production build passes.
- [ ] QA black-box suite passes or accepted limitations are explicit.
- [ ] Launchers work on the target environment.
- [ ] Sidecar binds loopback only.
- [ ] No secrets or official large datasets are committed.
- [ ] Third-party notices are complete.
- [ ] `git diff --check` passes.

### Submission

- [ ] Ten-page project document complete.
- [ ] 3-5 minute video complete.
- [ ] Backup recording complete.
- [ ] Metrics label validation versus official test correctly.
- [ ] Every public claim maps to evidence.
- [ ] Demo/download links work without unexpected login.
- [ ] Submission made before the internal target.

## 20. One-sentence rule for every agent

> Stay on your branch, write only inside your owned directory, archive every verified increment with commit and push, and route every cross-track need through the coordinator instead of editing across the boundary.
