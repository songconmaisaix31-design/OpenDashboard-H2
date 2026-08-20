# H2 Sentinel Product Requirements Document

- **Document status:** Competition implementation baseline
- **Product:** H2 Sentinel / 氢哨
- **Competition track:** T03-04 — Weak-grid green hydrogen EMS power-coordination anomaly diagnosis and operations assistant
- **Repository:** OpenDashboard
- **Target branch:** `competition/h2-sentinel`
- **Owner:** Solo developer; AI agents are implementation workers, not independent product owners
- **Product language:** Simplified Chinese UI; English code, comments, commit messages, and technical documents
- **Internal submission target:** 2026-08-21 18:00 China Standard Time, unless the organizer changes the deadline

## 1. Executive summary

H2 Sentinel is a browser-based, local-first supervision and diagnosis layer for a weak-grid green-hydrogen energy management system. It imports minute-level EMS time-series data, detects and aggregates seven classes of cross-device coordination anomalies, shows the evidence behind every diagnosis, quantifies operational impact, checks recommendations against explicit safety constraints, and exports both a structured competition submission and a human-readable incident report.

The product is intentionally not an automatic controller. It does not replace the existing EMS, issue commands to real equipment, or allow a language model to decide control actions. Its operating principle is:

> **Models detect, deterministic rules verify, AI explains, and humans decide.**

The implementation is a competition-specific extension of OpenDashboard. It reuses the existing plugin-first architecture, provenance model, evidence-first interaction pattern, and Chinese incident workflow. It adds a trusted H2 EMS plugin, a loopback-only Python analytics sidecar, domain contracts, six competition pages, deterministic report generation, and a Fixture mode that always works without network access or an API key.

## 2. Product decision

### 2.1 Problem to solve

Existing EMS and alarm systems can report that a value crossed a threshold, but an operator still needs to answer five harder questions:

1. Is this a real cross-device coordination anomaly or normal renewable-energy fluctuation?
2. When did the event start, and when was it first detectable?
3. Which control object and equipment are involved?
4. Which measured variables and constraints support the diagnosis?
5. What should be checked next, and is the proposed action safe enough to present for human confirmation?

The competition data includes 69 time-series variables, minute-level train/validation/test sets, event labels for train and validation, equipment metadata, control constraints, efficiency curves, alarm and operation logs, normal context, maintenance history, a knowledge base, assistant questions, and a required submission schema. A winning product must turn these materials into a trustworthy operational workflow rather than a disconnected classifier, notebook, or chat interface.

### 2.2 Product positioning

H2 Sentinel is:

- an intelligent supervision layer above the existing EMS;
- an anomaly-event and evidence workbench;
- an operations decision-support assistant;
- an offline-capable competition Web application;
- a domain extension of OpenDashboard.

H2 Sentinel is not:

- a replacement EMS;
- a real-time industrial control system;
- an autonomous dispatch or optimization engine;
- a general-purpose multi-agent platform;
- a generic RAG chatbot;
- a notebook-only analysis deliverable;
- a dynamic third-party plugin marketplace.

## 3. Primary users and jobs to be done

### 3.1 Primary user: hydrogen-station operations engineer

The operator needs to:

- import a new EMS dataset and confirm its quality;
- identify important anomaly events without examining hundreds of thousands of rows;
- inspect time-aligned evidence and constraints;
- understand the likely root cause and affected equipment;
- quantify the impact in an auditable way;
- review safe, bounded recommendations;
- export a report for shift handoff, compliance review, or maintenance follow-up.

### 3.2 Secondary user: control/algorithm engineer

The engineer needs to:

- inspect feature, model, rule, and threshold versions;
- compare predictions with labeled validation events;
- understand false positives, missed events, and event-boundary errors;
- reproduce a run from a dataset fingerprint and configuration;
- export the exact structured output required by the competition.

### 3.3 Evaluator/demo user

The evaluator needs to:

- open a stable Web application without special infrastructure;
- understand the product value within 20 seconds;
- complete one golden path in less than three minutes;
- see that the diagnosis is based on data, not generated prose;
- see explicit safety boundaries and human confirmation;
- download a report and structured result.

## 4. Product goals and non-goals

### 4.1 P0 goals

1. Run a deterministic Fixture demo entirely offline.
2. Import the official CSV format and perform data-quality checks.
3. Detect and aggregate C01-C07 events.
4. Present a complete C03 diagnosis and a complete C04 diagnosis.
5. Show evidence, impact calculations, safety checks, and provenance.
6. Answer the ten official assistant questions with deterministic fallback answers.
7. Export `submission.csv` with the exact required columns.
8. Export a readable HTML diagnosis report.
9. Provide six minimum Web pages required by the task package.
10. Start locally with one documented command or one launcher script.

### 4.2 P1 goals

1. Add a strong C07 early-warning case.
2. Add validation metrics and an error-analysis view.
3. Add manual confirmation and event-resolution status.
4. Add optional LLM language rendering over structured evidence.
5. Add optional Evidently-generated quality artifacts through a narrow adapter.
6. Include model, configuration, rule, and dataset fingerprints in exports.

### 4.3 Non-goals for the online submission branch

- automatic control of real electrolyzers, storage, PCC equipment, or relays;
- reinforcement learning, model-predictive control, or dispatch optimization;
- deep neural time-series model research;
- real-time streaming ingestion;
- multi-user login, RBAC, billing, or cloud tenancy;
- remote host access;
- dynamic plugin loading;
- general workflow designer;
- vector database deployment;
- runtime multi-agent deliberation;
- rebuilding the OpenDashboard shell or design system.

## 5. Product principles

### 5.1 Evidence before explanation

Every diagnosis must be backed by structured evidence containing a timestamp or interval, variable identity, actual value, reference value or constraint, and a machine-readable conclusion. Generated prose may summarize evidence but may not invent facts.

### 5.2 Deterministic core, optional language layer

The following operations must be deterministic and testable:

- file and schema validation;
- feature construction;
- model inference;
- event aggregation;
- impact calculations;
- constraint and safety checks;
- report data assembly;
- competition CSV export.

A language model may only render, summarize, or answer from the structured result. No API key may be required to complete the golden path.

### 5.3 Visible provenance

The UI and exported report must distinguish at least:

- `FIXTURE`: sanitized precomputed demonstration data;
- `LIVE_ANALYSIS`: result generated from an imported dataset;
- `DERIVED`: deterministic calculation from source variables;
- `MODEL`: classifier or scorer output;
- `RULE`: domain-rule output;
- `LLM_RENDERED`: optional language-only rendering.

### 5.4 Human confirmation by default

All operational recommendations are advisory. Recommendations that could influence dispatch, equipment start/stop, setpoint changes, storage behavior, PCC behavior, or maintenance actions must set `requires_human_confirmation=true`.

### 5.5 Local-first and offline-capable

The application must operate on a single machine and bind analytics APIs to loopback only. Fixture mode and deterministic report generation must work without internet access.

### 5.6 Reuse before build

Before writing a new subsystem, the responsible agent must search official GitHub repositories and official documentation for a maintained, license-compatible component. Reuse must reduce code and integration risk; a large framework is not adopted merely because it contains the feature.

## 6. Domain conventions and safety constraints

### 6.1 Power sign conventions

- PCC power greater than zero means export to the grid.
- PCC power less than zero means import from the grid.
- Battery energy storage power greater than zero means discharge.
- Battery energy storage power less than zero means charge.

### 6.2 Power-balance reference

The application should expose the residual of the approximate balance:

```text
PV actual power
+ BESS actual power
- PCC actual power
- total electrolyzer power
- auxiliary load
≈ 0
```

The residual is evidence and a data-quality signal; it is not by itself a final root-cause conclusion.

### 6.3 Control constraints supplied by the task package

The initial competition configuration must support externalized constraints, including:

- BESS SOC operating range: 20% to 90%;
- BESS maximum charge/discharge power: 500 kW;
- BESS energy capacity: 1,000 kWh;
- electrolyzer minimum stable power: 300 kW;
- electrolyzer maximum power: 1,000 kW;
- electrolyzer ramp limit: 120 kW/min;
- dynamic PCC import/export power boundaries;
- daily import/export energy quotas.

All thresholds and constraints must come from configuration or official data files. They must not be hidden in prompts.

## 7. Anomaly taxonomy

| Code | Name | Primary object | Required impact metric | Default severity |
|---|---|---|---|---|
| C01 | Electrolyzer setpoint oscillation | EMS electrolyzer-group control / allocation | `bess_extra_regulation_energy_kwh` | Medium |
| C02 | Available capacity not synchronized | EMS capacity model / electrolyzer availability | `unserved_elz_energy_kwh` | High |
| C03 | BESS charge/discharge direction anomaly | BESS control and PCC coordination | `abnormal_grid_exchange_energy_kwh` | High |
| C04 | PCC power-boundary tracking anomaly | PCC boundary control | `pcc_power_limit_violation_energy_kwh` | High |
| C05 | Grid energy-quota execution risk | Import/export energy quota management | `grid_energy_quota_deviation_kwh` | High |
| C06 | Multi-electrolyzer load-allocation anomaly | Electrolyzer group control | `extra_energy_consumption_kwh` | Medium |
| C07 | SOC target and regulation-reserve anomaly | BESS scheduling and reserve management | `bess_regulation_reserve_shortfall_kwh` | High |

Required subtypes:

- C01: `SETPOINT_OSCILLATION`
- C02: `CAPACITY_NOT_SYNCHRONIZED`
- C03: `BESS_DIRECTION_REVERSED`
- C04: `EXPORT_POWER_LIMIT_NOT_TRACKED`, `IMPORT_POWER_LIMIT_NOT_TRACKED`
- C05: `EXPORT_ENERGY_QUOTA_RISK`, `IMPORT_ENERGY_QUOTA_RISK`
- C06: `AVOIDABLE_START_STOP`, `INEFFICIENT_POWER_ALLOCATION`
- C07: `CHARGE_HEADROOM_SHORTFALL`, `DISCHARGE_RESERVE_SHORTFALL`

Detection expectations:

- C05 and C07 are primarily early-warning scenarios.
- For other anomaly classes, the system should target first detection within ten minutes of the event start.
- Event start/end boundaries, first detection time, confidence, and human-confirmation status must remain independently represented.

## 8. Golden demonstration scenarios

### 8.1 Golden scenario A: C03 BESS direction reversed

The product must show:

1. the commanded storage direction;
2. the observed storage power direction;
3. the corresponding PCC response;
4. at least three structured evidence items;
5. an auditable calculation of abnormal grid-exchange energy;
6. likely control/interface causes stated as inferences, not facts;
7. bounded checks such as sign mapping, command/feedback alignment, SOC range, and control-mode state;
8. a recommendation that requires human confirmation.

### 8.2 Golden scenario B: C04 PCC boundary not tracked

The product must show:

1. actual PCC power;
2. time-varying import/export limits;
3. highlighted violation intervals;
4. violation duration and energy;
5. affected operating context;
6. a compliance-oriented explanation;
7. safe next checks rather than an automatic setpoint change.

The initial impact calculation should be independently reproducible from minute data:

```text
violation_energy_kwh = Σ(max(export_actual - export_limit, 0)
                         + max(import_magnitude - import_limit, 0)) / 60
```

The implementation must use the official sign convention and actual field mapping, not this prose alone.

### 8.3 Secondary scenario: C07 reserve shortfall

The product should show actual SOC, target SOC, charge/discharge headroom, remaining time horizon, and the evidence for an early warning before a hard limit is reached.

## 9. Information architecture and page requirements

The application must contain six top-level views. They may be implemented inside the existing OpenDashboard shell, but each route or tab must be directly accessible.

### 9.1 System overview

Required content:

- dataset identity, period, row count, and provenance;
- data-quality status;
- current or selected analysis-run status;
- event count by anomaly code and severity;
- severe/open event count;
- PCC actual power and current boundaries;
- BESS SOC actual and target trajectories;
- latest important events;
- clear Fixture/Live indicator.

Acceptance criteria:

- a first-time evaluator understands the product purpose within 20 seconds;
- no page attempts to display all 69 fields at once;
- all summary values link to the corresponding detailed view.

### 9.2 Anomaly event center

Required content:

- event table or cards;
- filters by anomaly code, severity, time, equipment, confidence, and review state;
- start/end/first-detection time;
- duration;
- primary control object;
- affected equipment;
- impact metric and value;
- confidence and provenance;
- link to diagnosis detail.

Acceptance criteria:

- the evaluator can locate the golden C03 and C04 events in fewer than three interactions;
- filtering never mutates source analysis results;
- event identity remains stable across UI, report, and `submission.csv`.

### 9.3 Diagnosis detail

Required sections:

1. **What happened** — code, subtype, severity, interval, first detection, assets.
2. **Evidence** — synchronized chart, constraints, evidence table, log references.
3. **Why it may have happened** — deterministic findings separated from hypotheses.
4. **Impact** — metric, value, unit, formula version, assumptions.
5. **Recommended checks** — bounded actions, safety checks, human-confirmation flag.
6. **Provenance** — dataset, model, rule, configuration, and renderer versions.

Acceptance criteria:

- every numeric claim is traceable to source variables or a versioned formula;
- fact, calculation, inference, and recommendation are visually distinguishable;
- the page remains useful when the LLM is disabled.

### 9.4 Data analysis

Required content:

- field dictionary and Chinese display names;
- missingness, duplicate timestamps, irregular sampling, invalid ranges, and power-balance residual;
- selected variable trends;
- validation confusion matrix and event metrics when labels are available;
- model and rule versions;
- analysis-run log and warnings.

Acceptance criteria:

- imported test data without labels does not display fake evaluation metrics;
- validation-only metrics are labeled as validation metrics;
- data-quality failures can block or downgrade analysis with a visible reason.

### 9.5 Operations assistant

The assistant must support the following official questions through structured answer templates, with optional LLM rendering:

1. What do positive and negative PCC power mean?
2. How is a PCC power-limit anomaly different from an energy-quota anomaly?
3. How does a BESS direction anomaly affect PCC power?
4. How is an SOC regulation-reserve shortfall identified?
5. How can a capacity downgrade that was not synchronized be located?
6. How can cloud-induced PV fluctuation be distinguished from setpoint oscillation?
7. How is multi-electrolyzer load allocation evaluated?
8. Which recommendations require human confirmation?
9. Generate a diagnosis report for the selected test anomaly.
10. What should a daily PCC compliance report contain?

Answer requirements:

- cite the selected event, time interval, variables, constraints, or knowledge-base section;
- identify whether the answer is fact, calculation, inference, or recommendation;
- refuse to claim direct equipment control;
- function without an external LLM through deterministic templates.

### 9.6 Report center

Required exports:

- single-event HTML diagnosis report;
- selected-period operational summary;
- structured JSON analysis result;
- exact-format `submission.csv`;
- optional validation metrics artifact;
- optional third-party quality report.

Acceptance criteria:

- reports include generation time, dataset fingerprint, configuration/model/rule versions, provenance, and safety disclaimer;
- exported files do not contain secrets or absolute local paths;
- repeated export of the same run is deterministic except for documented timestamps.

## 10. Official task coverage

| Task | Product requirement | P0 acceptance evidence |
|---|---|---|
| T01 | Data import and conventions | Official CSV import, schema mapping, sign conventions, dataset fingerprint |
| T02 | Data quality | Quality summary, blocking errors, warnings, power-balance residual |
| T03 | Anomaly event detection | C01-C07 events with start/end/first-detection time |
| T04 | Classification, subtype, severity | Valid code/subtype/severity values and confidence |
| T05 | Control object and equipment localization | Primary control object and affected equipment on every event |
| T06 | Root cause and evidence chain | Structured evidence plus separated inference |
| T07 | Impact quantification | Versioned metric calculation with unit and assumptions |
| T08 | Safe recommendations | Constraint checks and human-confirmation flag |
| T09 | Web application | Browser-accessible, not notebook-only, six top-level views |
| T10 | Visualization | Time-aligned trends, limits, event bands, quality and metric views |
| T11 | Operations assistant | Ten official questions with deterministic fallback |
| T12 | Reports and structured results | HTML report, JSON, exact `submission.csv` |
| T13 | Deployment and reproduction | Local/offline start path, locked dependencies, run metadata |
| T14 | Safety and compliance | No direct control, loopback-only API, provenance, redaction |

## 11. Structured output contract

The `submission.csv` exporter must emit exactly these columns in this order:

```text
pred_event_id,
start_time,
end_time,
anomaly_code,
anomaly_subtype,
severity,
primary_control_object,
affected_equipment,
confidence,
evidence_json,
root_cause,
recommended_action,
primary_impact_metric,
estimated_impact_value,
first_detection_time,
requires_human_confirmation
```

Canonical internal data must be richer than the CSV. At minimum, an anomaly event should include:

```json
{
  "eventId": "C03-20260105-001",
  "code": "C03",
  "subtype": "BESS_DIRECTION_REVERSED",
  "title": "Battery direction is inconsistent with the command",
  "startTime": "2026-01-05T10:20:00Z",
  "endTime": "2026-01-05T10:41:00Z",
  "firstDetectionTime": "2026-01-05T10:24:00Z",
  "severity": "high",
  "confidence": 0.94,
  "primaryControlObject": "BESS_CONTROL",
  "affectedEquipment": ["BESS", "PCC"],
  "evidence": [],
  "impact": {
    "metric": "abnormal_grid_exchange_energy_kwh",
    "value": 112.4,
    "unit": "kWh",
    "formulaVersion": "impact-c03-v1"
  },
  "safetyChecks": [],
  "recommendations": [],
  "provenance": {
    "mode": "LIVE_ANALYSIS",
    "datasetFingerprint": "sha256:...",
    "modelVersion": "lgbm-baseline-v1",
    "ruleVersion": "h2-rules-v1",
    "configurationVersion": "official-constraints-v1"
  },
  "requiresHumanConfirmation": true
}
```

The canonical schemas are owned exclusively by `packages/h2-contracts/**` and must be frozen before parallel implementation begins.

## 12. System architecture

### 12.1 Runtime layers

```text
OpenDashboard Web shell
  └─ H2 Sentinel feature UI
       └─ H2 EMS plugin data source
            ├─ Fixture adapter
            └─ Loopback API adapter
                 └─ FastAPI analytics sidecar
                      ├─ ingestion and schema mapping
                      ├─ data-quality checks
                      ├─ feature engineering
                      ├─ LightGBM inference
                      ├─ event aggregation
                      ├─ evidence extraction
                      ├─ impact calculation
                      ├─ safety-rule evaluation
                      ├─ deterministic assistant answers
                      └─ Jinja report rendering
```

### 12.2 Deterministic analysis pipeline

```text
CSV import
→ manifest and field validation
→ time-index normalization
→ quality checks
→ feature generation
→ row-level classification/scoring
→ temporal smoothing
→ event aggregation
→ code/subtype/severity assignment
→ control-object/equipment localization
→ evidence extraction
→ impact calculation
→ safety checks
→ optional language rendering
→ reports and submission export
```

### 12.3 Sidecar boundary

The Python service is a competition-specific trusted analytics adapter. It is not a general Tier 2 plugin runtime.

Required boundary:

- bind to `127.0.0.1` only;
- fixed API namespace such as `/api/v1/h2-sentinel`;
- no arbitrary shell execution;
- no dynamic module or plugin installation;
- no remote host control;
- no required outbound network access;
- explicit request-size and file-type limits;
- temporary files stored in a controlled application directory;
- failures returned as structured, redacted evidence.

## 13. Open-source reuse policy

### 13.1 Approved for P0

| Component | Use | Boundary |
|---|---|---|
| OpenDashboard | Web shell, plugin runtime, provenance and incident UX | Extend; do not replace the shell |
| Apache ECharts | Interactive time-series, event bands, constraint lines, zoom | Wrapped inside H2 feature components |
| FastAPI and Pydantic | Loopback API and validated request/response models | Sidecar only |
| LightGBM | Baseline row-level anomaly classification | Behind a detector interface |
| pandas and scikit-learn | Data processing, baseline features, validation metrics | Analytics sidecar only |
| Jinja | Deterministic HTML report templates | Report module only |

### 13.2 Optional after the golden path is stable

| Component | Potential use | Decision gate |
|---|---|---|
| Evidently | Data-quality and validation artifact export | Add only through an adapter if it replaces custom report code and passes offline/security review |
| PyRCA | Experimental metric-based root-cause ranking | Never a P0 dependency; use only after deterministic evidence rules are complete and installation is verified |

### 13.3 Explicitly rejected for this branch

- Salesforce Merlion, because the upstream repository is archived and the current LightGBM baseline already covers the required detection path;
- full admin-dashboard templates, because OpenDashboard already provides the shell and a rewrite creates a large conflict surface;
- Dify, LangChain, CrewAI, AutoGen, or a similar runtime orchestration platform, because the runtime workflow is deterministic and the assistant has a template fallback;
- Kafka, Celery, Redis, Kubernetes, or a general database, because the competition application is local, bounded, and batch-oriented;
- copying vendor source trees into the repository.

All introduced dependencies and copied snippets, if any, must be recorded in `THIRD_PARTY_NOTICES.md` or the existing notice mechanism with license and source information.

### 13.4 Official GitHub references

- OpenDashboard: https://github.com/songconmaisaix31-design/OpenDashboard
- Apache ECharts: https://github.com/apache/echarts
- FastAPI: https://github.com/fastapi/fastapi
- LightGBM: https://github.com/microsoft/LightGBM
- Jinja: https://github.com/pallets/jinja
- Evidently: https://github.com/evidentlyai/evidently
- PyRCA: https://github.com/salesforce/PyRCA
- Merlion, rejected because the repository is archived: https://github.com/salesforce/Merlion

These links are research inputs, not blanket approval to copy source. Agents must inspect the current repository, license, maintenance status, dependency surface, and fit before adoption.

## 14. Non-functional requirements

### 14.1 Reliability

- Fixture golden path must work with no network and no LLM key.
- A failed live analysis must not break Fixture mode.
- Imported files must never overwrite bundled fixtures.
- The UI must expose analysis status, warnings, and failed stages.
- Golden C03 and C04 fixtures must be immutable contract-test inputs.

### 14.2 Performance targets

Targets are engineering goals, not current product claims:

- application shell interactive within 3 seconds on the developer machine after services are ready;
- Fixture event center visible within 1 second after route load;
- golden sample analysis within 30 seconds;
- full validation-set analysis within 5 minutes on the target machine;
- event-detail interaction remains responsive with at least 100 events;
- report export completes within 10 seconds for one event.

### 14.3 Accuracy targets

The existing rapid baseline is a starting point, not an official score. Internal validation targets:

- row-level macro F1 at or above 0.95;
- event-level recall at or above 0.90;
- event-level precision at or above 0.80;
- event-level F1 at or above 0.85;
- C03 and C04 golden cases have correct boundaries, evidence, impact formula, and subtype;
- all metrics include the exact matching definition and dataset split.

### 14.4 Security and privacy

- never read or expose `.env`, private keys, tokens, passwords, or credential stores;
- never commit official large datasets, derived sensitive datasets, model caches, or absolute local paths;
- use sanitized small fixtures only;
- validate uploaded extensions, MIME assumptions, schema, row counts, and size;
- escape report content and untrusted text;
- do not expose the sidecar on non-loopback interfaces;
- do not send competition data to an external LLM without explicit user action and disclosure;
- do not execute recommendations.

### 14.5 Accessibility and presentation

- Chinese labels must be concise and consistent;
- severity must not rely on color alone;
- charts must include units, legends, and readable tooltips;
- event bands and limit lines must be distinguishable;
- key values should remain understandable in screenshots and recorded video;
- desktop is the primary competition target; mobile must not become unusable.

## 15. Analytics and evaluation requirements

### 15.1 Baseline integration

The provided rapid LightGBM starter should be migrated behind interfaces, not copied into one monolithic API file. Required interfaces:

- `DatasetLoader`
- `QualityChecker`
- `FeatureBuilder`
- `RowDetector`
- `EventAggregator`
- `EvidenceBuilder`
- `ImpactCalculator`
- `SafetyEvaluator`
- `ReportRenderer`

### 15.2 Event matching for validation

Validation reports must document:

- same-class requirement;
- time-overlap or interval-IoU threshold;
- treatment of one-to-many and many-to-one matches;
- precision, recall, and F1 at event level;
- boundary error statistics;
- first-detection delay;
- per-class results.

No validation metric may be described as an official test score.

### 15.3 Error-analysis priorities

1. C01 fragmentation and false positives.
2. Short-gap merge policy by class.
3. Minimum event-duration policy by class.
4. C05/C07 early-warning semantics.
5. Confidence calibration and threshold selection.
6. Distinguishing data-quality problems from operating anomalies.

## 16. Release modes

### 16.1 Fixture demo mode

- bundled sanitized C03, C04, and optional C07 cases;
- precomputed analysis result matching the canonical schema;
- no Python service required if the static adapter is selected;
- all six pages and exports remain demonstrable;
- visibly labeled `FIXTURE`.

### 16.2 Local analysis mode

- starts the Python sidecar and Web application;
- imports the official CSV and companion data files;
- generates a new analysis run;
- visibly labeled `LIVE_ANALYSIS`;
- stores only controlled local artifacts;
- supports structured and report export.

### 16.3 Optional language-enhanced mode

- user explicitly provides an approved LLM configuration;
- only structured evidence and approved knowledge content are sent;
- response is labeled `LLM_RENDERED`;
- deterministic answer remains available;
- disabling the LLM does not remove any P0 capability.

## 17. Acceptance gates

### Gate 0 — Contract freeze

- canonical schemas exist and validate golden C03/C04 fixtures;
- submission column mapping is tested;
- no worker branch may change contracts directly.

### Gate 1 — Fixture golden path

```text
Open application
→ load Fixture mode
→ event center
→ open C03
→ inspect chart and three evidence items
→ inspect impact and safety checks
→ ask one official question
→ export report
```

All steps must work without the analytics sidecar or external network.

### Gate 2 — Live analysis

- official validation CSV imports;
- data-quality results display;
- events are generated through the analytics API;
- C03/C04 detail uses live results;
- structured export validates.

### Gate 3 — Competition completeness

- six required pages exist;
- T01-T14 coverage matrix is satisfied;
- ten assistant questions work;
- local start documentation works from a clean directory;
- no secrets or large official datasets are committed;
- `npm run typecheck`, `npm run test`, `npm run build`, `npm run check`, Python tests, and `git diff --check` pass where applicable;
- demo video can be recorded without waiting for model training.

### Gate 4 — Submission freeze

- product claims are supported by artifacts;
- validation metrics are correctly labeled;
- third-party notices are complete;
- all links and downloads are tested;
- a backup screen recording exists;
- no feature work is accepted after the freeze unless it fixes a golden-path blocker.

## 18. Success metrics

### 18.1 Competition success

- online top-20 qualification;
- complete and stable evaluator golden path;
- clear differentiation from generic chat assistants;
- evidence-first diagnosis and safety boundary understood by evaluators;
- runnable demo, report, and structured result delivered.

### 18.2 Product success

A user can move from an imported dataset to an auditable event diagnosis without inspecting raw rows manually, and can answer:

- what happened;
- when it happened;
- how confident the system is;
- which variables and constraints support it;
- what impact was calculated;
- what should be checked next;
- why human confirmation is required.

## 19. Principal risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Solo scope explosion | No stable submission | Freeze P0 and two golden cases; reject platform work |
| Agent merge conflicts | Lost time and broken integration | Directory ownership, immutable contract gate, integration-only root edits |
| Model looks impressive but product is incomplete | Low evaluation score | Six-page shell and Fixture path developed in parallel with analytics |
| LLM hallucination | Industrial credibility loss | Structured evidence first, deterministic fallback, visible provenance |
| Slow full-dataset analysis | Demo timeout | Precomputed Fixture mode and cached validation result |
| Data or license leakage | Disqualification or security issue | No official large data in Git; third-party notice and upload controls |
| C01 event fragmentation | Lower event precision | Per-class merge/min-duration policies and error analysis |
| Sidecar violates core plugin boundary | Architecture inconsistency | Treat it as a competition-specific trusted loopback adapter, not general Tier 2 |
| New dependency creates integration debt | Build instability | Reuse decision gate and narrow adapters |

## 20. Definition of done

The competition branch is done when:

1. the Fixture golden path is reliable and recorded;
2. the official validation data can be analyzed locally;
3. C01-C07 events are represented through one canonical contract;
4. C03 and C04 have full evidence, impact, safety, and report flows;
5. six required pages are accessible;
6. all ten assistant questions have deterministic answers;
7. `submission.csv` matches the official template exactly;
8. the product does not require an LLM, network, database, or dynamic plugin loader;
9. every implementation track has committed and pushed its work with verification evidence;
10. the integration branch is reproducible from documented commits and has no known golden-path blocker.
