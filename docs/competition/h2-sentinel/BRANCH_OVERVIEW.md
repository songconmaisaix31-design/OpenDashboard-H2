# H2 Sentinel Competition Branch Overview

- **Branch:** `competition/h2-sentinel`
- **Repository:** OpenDashboard
- **Branch type:** Short-lived competition integration branch with a documented path to selective upstreaming
- **Owner:** Solo coordinator
- **Source of truth:** This document, `PRD.md`, `MULTI_AGENT_TASKS.md`, canonical H2 contracts, and the actual Git history
- **Product mode:** Simplified Chinese UI; English technical implementation

## 1. Purpose of this branch

This branch turns OpenDashboard into **H2 Sentinel**, a local-first Web application for the T03-04 weak-grid green-hydrogen EMS anomaly-diagnosis challenge.

The branch exists to deliver one coherent competition product without destabilizing the generic OpenDashboard architecture. It must preserve the existing plugin-first principles while adding a narrowly bounded hydrogen-domain implementation:

- canonical H2 domain contracts;
- a trusted, loopback-only Python analytics service;
- a statically reviewed H2 EMS plugin;
- six H2 Sentinel Web views;
- deterministic Fixture and live-analysis modes;
- report and competition-result export;
- competition documentation, tests, and launch scripts.

It does not introduce a general Sidecar/plugin platform, a dynamic extension loader, real equipment control, or a generic agent runtime.

## 2. Baseline policy

Never hard-code a cached `origin/main` commit as the branch baseline. OpenDashboard's repository guide requires the live remote SHA to be verified before publication or branch creation.

At branch creation time:

```bash
git fetch origin --prune
BASE_SHA="$(git rev-parse origin/main)"
printf 'OpenDashboard base: %s\n' "$BASE_SHA"
git show --no-patch --decorate --oneline "$BASE_SHA"
```

Create the integration branch from that exact SHA:

```bash
git switch --detach "$BASE_SHA"
git switch -c competition/h2-sentinel
git push -u origin competition/h2-sentinel
```

Record the resolved SHA in the first branch commit message or a coordinator-owned status note. Do not silently move worker branches to a newer base after work begins.

## 3. Branch product boundary

### 3.1 Preserved OpenDashboard capabilities

The branch reuses:

- React/Vite/strict TypeScript Web application;
- static, reviewed Tier 0/1 plugin runtime;
- explicit service resolution;
- visible Fixture/Mock/Planned/Live provenance principles;
- evidence-first incident interaction;
- deterministic Fixture behavior;
- npm and the existing repository verification commands.

### 3.2 Added competition capabilities

The branch adds:

- H2 event, evidence, impact, quality, report, and assistant contracts;
- C01-C07 anomaly analysis;
- official-data adapters and field mapping;
- FastAPI loopback service;
- LightGBM-based detector interface and starter baseline;
- event aggregation and first-detection logic;
- deterministic evidence and impact rules;
- safety evaluation and human-confirmation flags;
- H2 Web feature pages and charts;
- HTML and CSV export;
- competition-specific tests and launch orchestration.

### 3.3 Explicitly excluded

- edits that turn the generic plugin runtime into a Python Sidecar broker;
- dynamic plugin loading;
- arbitrary shell or process control;
- remote network listeners;
- automatic control commands;
- a database, queue, distributed worker, or cloud dependency;
- generic multi-agent runtime code;
- replacing the OpenDashboard shell with another admin template.

## 4. Repository layout for this branch

```text
OpenDashboard/
├─ apps/
│  └─ web/
│     ├─ src/
│     │  ├─ features/
│     │  │  └─ h2-sentinel/            # H2 Web track owns only this subtree
│     │  └─ main.tsx                   # Integration track only
│     └─ index.html                    # Integration track only if required
│
├─ packages/
│  ├─ contracts/                       # Existing generic contracts; read-only for H2 workers
│  ├─ plugin-runtime/                  # Existing runtime; read-only for H2 workers
│  └─ h2-contracts/                    # Contract track owns this subtree
│     ├─ schema/
│     ├─ src/
│     ├─ fixtures/
│     ├─ test/
│     └─ README.md
│
├─ plugins/
│  ├─ fixture-demo/                    # Existing generic fixture plugin; read-only
│  └─ h2-ems/                          # H2 plugin track owns this subtree
│     ├─ src/
│     │  ├─ adapters/
│     │  ├─ services/
│     │  └─ index.ts
│     ├─ test/
│     └─ README.md
│
├─ services/
│  └─ h2-analytics/                    # Analytics track owns this subtree
│     ├─ pyproject.toml
│     ├─ README.md
│     ├─ src/h2_analytics/
│     │  ├─ api/
│     │  ├─ ingestion/
│     │  ├─ quality/
│     │  ├─ features/
│     │  ├─ detection/
│     │  ├─ events/
│     │  ├─ diagnosis/
│     │  ├─ impact/
│     │  ├─ safety/
│     │  ├─ assistant/
│     │  └─ reports/
│     ├─ templates/
│     ├─ tests/
│     └─ tools/
│
├─ tests/
│  └─ h2-sentinel/                     # Independent QA track owns this subtree
│     ├─ contract/
│     ├─ api/
│     ├─ golden-path/
│     └─ README.md
│
├─ submission/
│  └─ h2-sentinel/                     # Submission track owns this subtree
│     ├─ project-document/
│     ├─ demo-script/
│     ├─ screenshots/
│     ├─ claims/
│     ├─ release-checklists/
│     └─ THIRD_PARTY_INPUTS.md
│
├─ docs/
│  └─ competition/
│     └─ h2-sentinel/                  # Coordinator-owned planning documents
│        ├─ PRD.md
│        ├─ BRANCH_OVERVIEW.md
│        └─ MULTI_AGENT_TASKS.md
│
├─ scripts/
│  └─ h2-sentinel/                     # Integration track only
│
├─ .github/workflows/                  # Integration track only for H2 CI changes
├─ package.json                        # Integration track only
├─ package-lock.json                   # Integration track only
├─ tsconfig.json                       # Integration track only
├─ start-h2-sentinel.sh                # Integration track only
└─ start-h2-sentinel.bat               # Integration track only
```

The directories above are an ownership contract, not merely a suggested organization.

## 5. Zero-conflict ownership model

### 5.1 Core rule

> Work is divided by exclusive directory ownership, not by cross-cutting features.

A track may implement several internal functions if all writes remain inside its owned subtree. A track may read any repository path required to understand contracts, but it may not edit another track's files.

### 5.2 Ownership matrix

| Owner | Branch | Exclusive writable paths | Important read-only inputs |
|---|---|---|---|
| Coordinator | `competition/h2-sentinel` | `docs/competition/h2-sentinel/**` and cherry-pick/integration decisions | Entire repository |
| Contract track | `agent/h2-contracts` | `packages/h2-contracts/**` | Official task package, existing generic contracts |
| Analytics track | `agent/h2-analytics` | `services/h2-analytics/**` | `packages/h2-contracts/**`, starter baseline, official data |
| Plugin track | `agent/h2-plugin` | `plugins/h2-ems/**` | `packages/h2-contracts/**`, plugin runtime, Fixture plugin patterns |
| Web track | `agent/h2-web` | `apps/web/src/features/h2-sentinel/**` | `packages/h2-contracts/**`, existing Web components and product shell |
| QA track | `agent/h2-qa` | `tests/h2-sentinel/**` | Contracts and public interfaces from all tracks |
| Submission track | `agent/h2-submission` | `submission/h2-sentinel/**` | PRD, screenshots, metrics, released artifacts |
| Integration track | `agent/h2-integration` | root/composition files explicitly listed below | Accepted worker commits |

### 5.3 Integration-only write set

Only the integration track may edit:

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

If an integration file does not yet exist, this rule still applies to creating it.

No worker track may make a “small convenience edit” to these files. It must document the required integration change in its handoff instead.

### 5.4 Coordinator-only planning set

Only the coordinator may edit:

```text
docs/competition/h2-sentinel/PRD.md
docs/competition/h2-sentinel/BRANCH_OVERVIEW.md
docs/competition/h2-sentinel/MULTI_AGENT_TASKS.md
```

Workers may propose changes through a handoff note. Planning documents must not become a merge-conflict surface.

## 6. Contract gate

Parallel implementation begins only after the H2 contract track is accepted and its commits are cherry-picked into the competition branch.

The coordinator records:

```bash
H2_CONTRACT_GATE="$(git rev-parse competition/h2-sentinel)"
printf 'H2 contract gate: %s\n' "$H2_CONTRACT_GATE"
```

Every Wave 1 worker branch is created from this exact commit. The gate freezes:

- TypeScript domain types;
- JSON Schemas;
- API request/response envelopes;
- event and evidence identity rules;
- provenance vocabulary;
- report metadata;
- submission-column mapping;
- golden C03 and C04 fixtures.

Downstream agents may not modify contracts. A contract problem becomes a formal change request to the contract track and coordinator.

## 7. Data and control flow

### 7.1 Fixture mode

```text
Bundled golden fixture
→ H2 EMS Fixture adapter
→ H2SentinelDataSource
→ Web feature
→ deterministic report/export adapter
```

Fixture mode must stay available even when Python dependencies are missing or the analytics service is down.

### 7.2 Live-analysis mode

```text
User selects official CSV/data package
→ H2 EMS loopback adapter
→ FastAPI upload/analysis request
→ ingestion and quality checks
→ detector and event aggregation
→ diagnosis/impact/safety pipeline
→ canonical analysis result
→ H2 EMS adapter validates the response
→ Web feature renders the result
```

### 7.3 Optional language rendering

```text
Canonical diagnosis
→ redaction/allowlist
→ optional renderer
→ LLM-rendered text with explicit provenance
```

No LLM output is allowed to overwrite canonical evidence, impact, or safety fields.

## 8. Canonical interfaces

The contract track should define at least:

- `H2DatasetManifest`
- `H2AnalysisRun`
- `H2DataQualityReport`
- `H2AnomalyEvent`
- `H2EvidenceItem`
- `H2ImpactResult`
- `H2SafetyCheck`
- `H2Recommendation`
- `H2AssistantQuestion`
- `H2AssistantAnswer`
- `H2ReportDescriptor`
- `H2SubmissionRow`
- `H2SentinelDataSource`

Recommended data-source surface:

```ts
export interface H2SentinelDataSource {
  getMode(): Promise<'FIXTURE' | 'LIVE_ANALYSIS'>;
  listDatasets(): Promise<H2DatasetManifest[]>;
  getOverview(runId: string): Promise<H2AnalysisRun>;
  listEvents(runId: string, filter?: H2EventFilter): Promise<H2AnomalyEvent[]>;
  getEvent(runId: string, eventId: string): Promise<H2AnomalyEvent>;
  getSeries(request: H2SeriesRequest): Promise<H2SeriesResponse>;
  ask(request: H2AssistantRequest): Promise<H2AssistantAnswer>;
  exportReport(request: H2ReportRequest): Promise<H2ReportDescriptor>;
  exportSubmission(runId: string): Promise<H2ReportDescriptor>;
}
```

The Web track depends only on this interface and canonical types. It must not call `fetch` directly.

## 9. Runtime modes and configuration

### 9.1 Required modes

| Mode | Analytics sidecar | Network | LLM | Use |
|---|---:|---:|---:|---|
| `fixture` | Not required | Not required | Not required | Stable evaluator demo and UI development |
| `local` | Required | Loopback only | Optional | Official dataset import and analysis |
| `local-template` | Required | Loopback only | Disabled | Full deterministic competition flow |
| `local-llm` | Required | Loopback plus explicit approved provider | Optional | Language-enhanced explanation |

### 9.2 Configuration rules

- Configuration must be explicit and validated.
- Official thresholds live in configuration/data files, not prompts.
- Secrets remain outside the repository and must never be printed.
- Fixture mode must not inspect `.env`.
- The app must show the active mode and provenance.
- The analytics URL defaults to a fixed loopback address.
- The app must fail closed when a non-loopback analytics URL is supplied unless the coordinator explicitly changes the threat model.

## 10. Open-source reuse decisions

### 10.1 Adopt now

| Project | Reused capability | Why it fits | Integration rule |
|---|---|---|---|
| OpenDashboard | Shell, static plugin runtime, service resolution, provenance UX | Already the product base | Extend through new domain paths; preserve generic boundaries |
| Apache ECharts | High-density interactive time-series visualization | Mature browser chart library with zoom, annotations, and multiple series | Wrap in feature-local chart components; no chart calls in page containers |
| FastAPI/Pydantic | Typed local API and request validation | Small Python API boundary and automatic schema support | Bind loopback only; no generic admin service |
| LightGBM | Existing rapid anomaly classifier baseline | Baseline already demonstrates useful validation performance | Hide behind detector interface; keep model artifacts out of Git when large |
| pandas/scikit-learn | Existing starter data and metric stack | Minimizes migration risk | Sidecar only |
| Jinja | Deterministic HTML report rendering | Template inheritance and escaping avoid building a report engine | Templates remain under analytics report module |

### 10.2 Adapter-only candidates

| Project | Candidate use | Why not a P0 dependency | Gate |
|---|---|---|---|
| Evidently | Data-quality/model-evaluation artifact | Full framework is larger than the golden path | Add only if a narrow exporter removes more custom code than it adds |
| PyRCA | Experimental metric-based root-cause ranking | Domain rules already provide the required explainability; installation and algorithm fit require a spike | Keep an interface seam; no dependency until deterministic diagnosis is complete |

### 10.3 Do not adopt

| Project/category | Decision | Reason |
|---|---|---|
| Salesforce Merlion | Reject | Upstream is archived; duplicative with the current detector path |
| Ant Design Pro or another full admin template | Reject | Would replace the existing shell and create broad file overlap |
| Grafana/OpenSearch Dashboards | Reject | Operational platform is much larger than a local competition extension |
| Dify/LangChain/CrewAI/AutoGen | Reject for runtime | Deterministic pipeline and template fallback are safer and simpler |
| Celery/Redis/Kafka | Reject | No distributed-job requirement |
| SQLite/PostgreSQL | Defer | Runs and exports can be file-backed for the competition |
| Copied vendor source trees | Reject | Raises maintenance and licensing risk |

### 10.4 Reuse checklist before adding code

The agent proposing a dependency must answer:

1. What exact code does the dependency replace?
2. Is the repository active and maintained?
3. Is the license compatible and recorded?
4. Can the capability be isolated behind the agent's owned directory?
5. Does it work offline and on the target Windows/WSL setup?
6. Does it add a new service, database, queue, or network surface?
7. Can the golden path work when the dependency is unavailable?
8. Is a smaller existing dependency or platform API sufficient?

No dependency is approved merely because it is popular.

## 11. Sidecar threat boundary

The H2 analytics service is trusted competition code but must still have a narrow boundary.

Required controls:

- bind only to `127.0.0.1`;
- fixed port or coordinator-controlled port discovery;
- explicit `/api/v1/h2-sentinel` namespace;
- validate Host and Origin where browser requests are accepted;
- size-limit uploads;
- allowlist data extensions;
- parse data without formulas/macros execution;
- never expose arbitrary filesystem browsing;
- never accept a shell command or Python expression;
- redact tracebacks before returning them to the UI;
- use generated run IDs rather than user-controlled paths;
- delete temporary uploads according to a documented policy;
- provide `/health` and version metadata;
- support deterministic shutdown through the launcher.

The branch must not claim this sidecar is a secure untrusted-plugin sandbox.

## 12. Dataset policy

### 12.1 Never commit

- official train, validation, or test time-series files;
- event/row labels from the official package if redistribution is not explicitly allowed;
- generated full prediction files;
- fitted model binaries above the repository size policy;
- user-uploaded data;
- absolute local paths;
- API keys or provider configuration.

### 12.2 Allowed fixtures

- small, sanitized, synthetic or explicitly redistributable slices;
- golden C03/C04 contract fixtures containing only required points;
- tiny CSVs designed for parser and quality tests;
- expected JSON outputs;
- anonymized screenshots approved for submission.

### 12.3 Fingerprints and reproducibility

Each live analysis run should store or export:

- source filename without absolute path;
- file size;
- SHA-256 fingerprint;
- row count and time range;
- configuration version;
- model version;
- feature version;
- event-aggregation version;
- evidence/impact/safety rule versions;
- application and API version.

## 13. Build and launch model

### 13.1 Development

The integration track will determine the final commands, but the intended development model is:

```bash
# Web
npm ci
npm run dev

# Analytics
cd services/h2-analytics
python -m venv .venv
# activate the environment using the platform-appropriate command
python -m pip install -e '.[dev]'
python -m h2_analytics
```

Worker agents must not edit root scripts to make their local branch convenient. They document their own subtree commands in the subtree README.

### 13.2 Competition launcher

The integration track owns one-click launchers:

```text
start-h2-sentinel.bat
start-h2-sentinel.sh
```

Launcher responsibilities:

1. validate the environment;
2. start the loopback analytics process when local mode is selected;
3. start or serve the Web application;
4. wait for health readiness;
5. open the browser;
6. print actionable errors without exposing secrets;
7. stop child processes cleanly.

Fixture-only deployment may serve a prebuilt Web bundle without Python.

## 14. Git discipline

### 14.1 Commit is an archive point

Every independently working increment must be committed and pushed immediately after its checks pass.

Required sequence:

```bash
git status --short
git diff --check
# run track-specific tests
git add <owned-paths-only>
git diff --cached --name-only
git commit -m '<type>(<scope>): <bounded result>'
git push -u origin HEAD
```

A pushed commit is never amended. A correction is a new commit.

### 14.2 Prohibited commands and actions

- `git push --force` or `--force-with-lease`;
- `git reset --hard`;
- `git clean` against shared repositories/worktrees;
- rebasing a pushed worker branch;
- rewriting another track's branch;
- staging files outside the owned allowlist;
- merging into the competition branch from a worker session;
- deleting branches or worktrees owned by another session.

### 14.3 Recommended commit size

A commit should represent one verified archive point, such as:

- a frozen schema family;
- one ingestion adapter and tests;
- one event-aggregation policy and tests;
- one data-source adapter;
- one page with Fixture data;
- one golden-path test;
- one report template;
- one integration wiring step.

Avoid “implement whole project” commits.

## 15. Integration model

The coordinator is the only person/process that moves worker commits into `competition/h2-sentinel`.

Preferred method:

```bash
git switch competition/h2-sentinel
git pull --ff-only

git cherry-pick <accepted-contract-commit>
git cherry-pick <accepted-analytics-commit-1> <accepted-analytics-commit-2>
git cherry-pick <accepted-plugin-commit>
git cherry-pick <accepted-web-commit-1> <accepted-web-commit-2>
```

Why cherry-pick rather than merging worker branches:

- each accepted archive point is explicit;
- unfinished worker commits can remain on their branch;
- the coordinator controls ordering;
- integration history documents the competition assembly;
- directory ownership makes cherry-pick conflicts rare.

A merge commit may be used only when a worker branch is intentionally accepted as a complete, reviewed unit.

## 16. Integration surfaces

The architecture intentionally reduces integration to four surfaces:

1. **Contracts:** `packages/h2-contracts/**`
2. **Plugin service registration:** `plugins/h2-ems/**`
3. **Web composition:** `apps/web/src/main.tsx`
4. **Launch/build configuration:** root scripts and manifests

All root/composition modifications are delayed until worker subtrees can run independently with fixtures or local tests.

## 17. Verification matrix

| Layer | Minimum checks before handoff |
|---|---|
| Contracts | schema validation, TypeScript tests, golden fixture validation, CSV-column mapping |
| Analytics | Python unit tests, golden C03/C04 pipeline, API contract validation, lint/type checks if configured |
| Plugin | TypeScript typecheck/tests, Fixture adapter, loopback adapter with mocked API, provenance tests |
| Web | typecheck/tests, Fixture rendering, responsive manual check, no direct API fetch |
| QA | black-box contract/API/golden path suites, failure report with reproduction commands |
| Submission | broken-link check, claim-to-evidence table, asset inventory, no unsupported metric claims |
| Integration | `npm run typecheck`, `npm run test`, `npm run build`, `npm run check`, Python tests, launcher smoke test, `git diff --check` |

A check is never reported as passed unless it ran successfully in the current worktree.

## 18. Branch milestones

### M0 — Planning baseline

- PRD, branch overview, and task allocation committed.
- Live `origin/main` baseline recorded.

### M1 — H2 contract gate

- Schemas, TS types, golden fixtures, and mapping tests accepted.
- Immutable gate SHA recorded.

### M2 — Parallel worker outputs

- Analytics service produces canonical C03/C04 output.
- Plugin exposes Fixture and mocked loopback data sources.
- Web renders the six-view shell with Fixture data.
- QA has executable black-box skeletons.
- Submission package has narrative and claim matrix.

### M3 — First integration

- Fixture golden path works in the OpenDashboard shell.
- No live analytics dependency is required for the demo.

### M4 — Live integration

- Official validation CSV can be analyzed through loopback API.
- Canonical result renders in the same Web flow.

### M5 — Competition freeze

- launchers and exports work;
- required checks pass;
- video and backup recording complete;
- unsupported features remain visibly deferred.

## 19. Upstreaming after the competition

The competition branch should not be merged wholesale into `main` without review. Candidate upstream units:

- generic contract-validation utilities;
- a generic read-only loopback adapter pattern after threat review;
- reusable provenance UI components;
- generic event/evidence chart components;
- report-export interfaces;
- test patterns for Fixture/Live parity.

Competition-specific H2 contracts, models, formulas, sample data, and submission assets may remain on the branch or move to a separately maintained domain plugin.

## 20. Branch readiness checklist

Before any worker starts:

- [ ] Live `origin/main` SHA fetched and recorded.
- [ ] `competition/h2-sentinel` pushed.
- [ ] Planning documents committed.
- [ ] Contract track worktree created from the recorded base.
- [ ] Official large data path is outside Git.
- [ ] Each agent has a unique branch and worktree.
- [ ] Each agent prompt contains an exact write allowlist and denylist.
- [ ] No two worker allowlists overlap.
- [ ] Coordinator understands the cherry-pick order.

Before the branch is called complete:

- [ ] Contract gate SHA recorded.
- [ ] Fixture golden path works offline.
- [ ] Live validation analysis works.
- [ ] Six required pages exist.
- [ ] C03 and C04 are complete.
- [ ] Ten assistant questions have deterministic answers.
- [ ] `submission.csv` validates.
- [ ] Reports include provenance and safety disclaimer.
- [ ] Launchers pass on the target environment.
- [ ] Third-party notices are complete.
- [ ] Every accepted feature has a pushed archive commit.
- [ ] No known golden-path blocker remains.

## 21. Official GitHub research references

Use canonical repositories and official documentation when revisiting a reuse decision:

- OpenDashboard: https://github.com/songconmaisaix31-design/OpenDashboard
- Apache ECharts: https://github.com/apache/echarts
- FastAPI: https://github.com/fastapi/fastapi
- LightGBM: https://github.com/microsoft/LightGBM
- Jinja: https://github.com/pallets/jinja
- Evidently: https://github.com/evidentlyai/evidently
- PyRCA: https://github.com/salesforce/PyRCA
- Merlion, rejected for this branch because the upstream repository is archived: https://github.com/salesforce/Merlion

A project appearing in this list does not authorize broad adoption. The narrow decision in Section 10 remains authoritative.
