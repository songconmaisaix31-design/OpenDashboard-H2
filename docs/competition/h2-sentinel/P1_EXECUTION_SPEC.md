# H2 Sentinel P1 Judge-Facing Execution Specification

- **Status:** Implementation baseline
- **Scope:** P1 judge-facing workflows only
- **Product language:** Simplified Chinese
- **Technical language:** English
- **Contract authority:** `docs/competition/h2-sentinel/P1_API_CONTRACT.md`
- **Canonical shared-contract path:** `packages/h2-contracts/**`

## 1. Outcome and Definition of Done

This P1 increment closes four judge-facing gaps without changing the detector or control boundary:

1. The operations assistant answers all ten official questions using the official `Q01`-`Q10` identifiers, deterministic Simplified Chinese templates, and resolvable evidence citations.
2. An operator can confirm, reject, reopen, resolve, or annotate an event through a local human-review journal without changing the detector result or creating equipment-control authority.
3. Judge-visible HTML reports and report failures are presented in Simplified Chinese, while machine exports retain stable English field names.
4. A prepared slice of the public validation data can be demonstrated from import through evidence, review, assistant, report, review-audit export, and `submission.csv` in a truthfully measured three-minute path.

P1 is complete only when every acceptance criterion in Section 9 passes from the final integrated commit. A local smoke, Fixture run, screenshot, HTTP success, or document review is bounded evidence and does not by itself prove this P1 increment complete.

## 2. Accepted Sources and Existing Baseline

Implementation must use these sources in descending order of authority:

1. The official package, especially `数据与材料/16_assistant_questions.csv`, `数据与材料/15_knowledge_base.md`, `数据与材料/17_submission_template.csv`, and the public validation files.
2. `docs/competition/h2-sentinel/PRD.md`.
3. `docs/competition/h2-sentinel/P1_API_CONTRACT.md`.
4. Existing canonical types, schemas, fixtures, and tests under `packages/h2-contracts/**`.
5. Existing deterministic analytics, adapters, UI composition seams, and QA harnesses.

The implementation must preserve these existing seams:

- `H2SentinelDataSource` remains the Web-facing data boundary.
- `H2ApiEnvelope<T>` remains the HTTP envelope.
- `H2AnomalyEvent.reviewState` remains the event-list projection.
- `ask`, `exportReport`, and `exportSubmission` remain the assistant and export entry points.
- `FIXTURE` and `LIVE_ANALYSIS` remain visibly different evidence modes.
- Recommendations remain advisory and require human confirmation.

### 2.1 Required identifier correction

The official package uses `Q01` through `Q10`. The current code uses `H2Q01` through `H2Q10`. P1 must make the official identifiers the only accepted and returned wire values while retaining the existing TypeScript type and function names where useful. The UI must never display the `H2Qxx` aliases, and the API must reject them after the coordinated migration.

## 3. Scope

### 3.1 In scope

- Change assistant question values and prompts to the official `Q01`-`Q10` identifiers and Chinese text.
- Produce deterministic Chinese answers for all ten questions without network or model credentials.
- Enforce question-specific event context and evidence requirements.
- Generate the selected-event diagnosis report as part of `Q09`.
- Add a local append-only event-review journal with optimistic concurrency and idempotent mutation requests.
- Project review state into event lists and detail views.
- Export a machine-readable review audit through the existing report-export boundary.
- Add a Chinese PCC daily compliance report through the existing report-export boundary.
- Localize judge-visible event, period, quality, and error/report states required by this workflow.
- Add a deterministic public-validation slice preparation and timed demo harness under the QA-owned paths.
- Add focused contract, service, adapter, Web, and end-to-end tests.

### 3.2 Non-goals

- No cloud LLM, remote inference, API key, outbound network requirement, or LLM-dependent fallback.
- No new runtime or development dependency.
- No equipment command, setpoint mutation, mode change, relay action, or control-system integration.
- No P0 official-data convergence, detector retraining, C01-C07 algorithm expansion, threshold retuning, or competition-score claim.
- No claim that a validation result is an organizer test score or hidden-test result.
- No database, authentication system, RBAC, cloud tenancy, or verified reviewer identity.
- No general chat, RAG platform, report designer, workflow engine, or multi-agent runtime.
- No broad refactor of the Web shell, analytics architecture, adapters, launchers, or root build tooling.
- No committed official timeseries, labels, derived validation slice, or workstation-specific path.
- No worker edit to protected `main`, shared root wiring, or another worker's allowlist.

## 4. Ten Official Assistant Questions

All answers must be Simplified Chinese, deterministic, useful with `allowLlmRendering=true` or `false`, and represented as fact, calculation, inference, or recommendation sections. Every section must cite at least one returned citation, and every citation must resolve to current-run data, an official constraint/variable/knowledge item, an event/evidence item, or a generated report.

When required evidence is unavailable, the answer must say what is missing and what can still be concluded. It must not invent a measurement, limit, label, standard, event, or score.

| Official ID | Official question | Context | Required Chinese answer | Minimum evidence |
| --- | --- | --- | --- | --- |
| `Q01` | `PCC正值和负值分别代表什么？` | Run required; event optional | State that positive PCC power is export to the grid and negative PCC power is import from the grid. Distinguish this from the BESS sign convention. | PCC variable definition plus official knowledge or constraint citation. |
| `Q02` | `如何区分PCC功率越限与电量配额异常？` | Event optional; if supplied, it must be C04 or C05 | Contrast an instantaneous dynamic power boundary with a cumulative daily energy quota. State the applicable windows, units, and C04/C05 distinction. | PCC actual power, dynamic import/export limits, daily accumulated energy/quota variables or constraints, and selected event when present. |
| `Q03` | `储能方向异常如何影响PCC功率？` | A selected C03 event is required | Explain the command/feedback direction mismatch, the BESS/PCC contribution to power balance, observed PCC effect, and bounded checks. Do not claim causation beyond the evidence. | Selected C03 event, BESS command and actual power, PCC actual power, time interval, and at least one constraint or balance reference. |
| `Q04` | `如何判断SOC调节备用是否不足？` | Event optional; if supplied, it must be C07 | Explain actual versus target SOC, charge/discharge headroom, power/energy capacity, time horizon, and why this is an early-warning judgment. | SOC actual/target variables, BESS limits/capacity, derived headroom calculation, and selected event when present. |
| `Q05` | `设备降额但EMS未同步如何定位？` | Event optional; if supplied, it must be C02 | Compare equipment availability/capacity evidence with the EMS capacity model and issued setpoint; identify the unsynchronized interval and affected equipment. | Equipment master/capacity evidence, EMS command or capacity variables, affected-equipment reference, and selected event when present. |
| `Q06` | `如何区分云团变化和控制指令振荡？` | Event optional; if supplied, it must be C01 | Compare PV/weather movement with command oscillation, response timing, periodicity, and cross-device evidence. Explicitly reject a conclusion based on one alarm or one point. | PV actual/forecast or weather evidence, electrolyzer commands, time-aligned response variables, and selected event when present. |
| `Q07` | `如何评价多台电解槽负荷分配？` | Event optional; if supplied, it must be C06 | Compare unit limits, stable operating range, ramping, starts/stops, and efficiency-curve energy cost. State that no electrolyzer health score exists. | Equipment capacities, efficiency curve, per-unit commands/actuals, derived baseline, and selected event when present. |
| `Q08` | `哪些建议必须人工确认？` | Run required; event optional | State that every operational recommendation is advisory and requires a person before any action. Group examples by check, monitor, escalate, and report; refuse direct control authority. | Recommendation records, safety checks/constraints, and selected event when present. |
| `Q09` | `生成测试集异常诊断报告。` | A selected event is required | Generate and return a Chinese single-event diagnosis report for the selected current-run event. State the actual provenance: validation slice, full validation, test, or Fixture. Never call Fixture a test result and never claim hidden ground truth. | Selected event and evidence chain plus a report citation matching the returned report descriptor. |
| `Q10` | `PCC合规日报包含哪些内容？` | Run required; C04/C05 event optional | Describe the daily report sections: actual PCC power and dynamic limits, violation intervals/duration/energy, import/export accumulated energy and quota, event/review summary, quality, provenance, and safety disclaimer. | PCC variables, power and energy constraints, relevant event/review counts, and report definition. |

### 4.1 Universal answer requirements

- Use the exact official question ID and text.
- Use `DETERMINISTIC_TEMPLATE`; `allowLlmRendering` is compatibility input only and must not change the P1 result.
- Use Chinese section text and stable English machine identifiers.
- Include `generatedAt`, run identity, provenance, and selected event identity when applicable.
- Require non-empty, referentially valid `citationIds` in every section.
- Set `refusedControlClaim=true` for all ten answers.
- Keep semantic sections and citation ordering stable for identical run input. Only documented timestamps and content hashes may vary.
- For `Q09`, return exactly one generated `single_event_diagnosis` artifact and make its report citation resolve to that artifact.

## 5. Human Review Workflow

Human review is a separate local journal over an immutable analysis event. Review operations may change only the projected review state and journal; they must not change event timing, anomaly classification, evidence, impact, safety checks, recommendations, provenance, or submission mapping.

### 5.1 State labels

The wire values intentionally reuse the existing contract:

| Wire value | Chinese UI label | Meaning |
| --- | --- | --- |
| `open` | `待复核` | No terminal human decision has been recorded. |
| `confirmed` | `已确认` | A local operator accepted the event for follow-up. |
| `dismissed` | `已驳回` | A local operator rejected the event as not accepted for follow-up. |
| `resolved` | `已闭环` | A previously confirmed event was recorded as closed. |

The user action is named `reject`; it maps to the existing `dismissed` wire state. P1 must not introduce a second `rejected` state.

### 5.2 Allowed transitions

```text
open      --confirm--> confirmed
open      --reject-->  dismissed
confirmed --resolve--> resolved
confirmed --reopen-->  open
dismissed --reopen-->  open
resolved  --reopen-->  open
any       --add_note--> same state
```

All other transitions fail with `review.invalid_transition`. A confirmed, dismissed, or resolved event must be reopened before a different terminal decision is applied. This makes decision reversal explicit in the audit.

### 5.3 Notes and actor labels

- `reject`, `resolve`, `reopen`, and `add_note` require a non-empty note.
- `confirm` may include a note.
- Notes are trimmed, bounded to 2,000 Unicode characters, stored as plain text, and escaped in HTML.
- The actor is a required local display label bounded to 64 Unicode characters.
- The actor label is operator-supplied and must be described as unverified local attribution, not authenticated identity.
- Server time, not browser time, supplies the journal timestamp.

### 5.4 Reliability and audit behavior

- Each mutation includes a caller-generated `requestId` and `expectedRevision`.
- Replaying the same `requestId` returns the original receipt and does not append a second entry.
- A stale `expectedRevision` fails with `review.conflict` and returns no mutation.
- Revision numbers start at zero and increase by one for every appended entry, including notes.
- Entries are append-only and ordered by revision.
- Browser reload must rehydrate the current journal from the data source.
- Both Fixture and Live adapters must expose the same review behavior, while preserving their provenance labels.
- The audit export contains every event in the run, including events with an empty journal, sorted deterministically.

## 6. Chinese Report Requirements

### 6.1 Shared HTML rules

All judge-visible HTML reports must:

- declare UTF-8 and `lang="zh-CN"`;
- use Simplified Chinese headings, explanations, warnings, empty states, and safety disclaimer;
- preserve canonical English variable names, anomaly codes, metric names, IDs, and units beside Chinese labels;
- escape imported filenames, operator labels, review notes, evidence text, and other untrusted values;
- include generation time, run ID, dataset fingerprint, configuration/model/rule versions, provenance mode, and source time range;
- state whether the run is `FIXTURE`, a validation slice, full validation, or another `LIVE_ANALYSIS` source;
- state that the application does not directly control equipment and all recommendations require human confirmation;
- omit secrets, absolute local paths, hidden labels, stack traces, and unredacted internal errors;
- state `未加载公开标签，未生成验证指标` when labels are absent instead of rendering zero or fake metrics.

### 6.2 Required report kinds

| Kind | Chinese title | Required content |
| --- | --- | --- |
| `single_event_diagnosis` | `氢哨异常诊断报告` | Event summary; evidence; fact versus inference; impact formula/window/unit/assumptions; safety checks; recommendations; current review state and journal; provenance; disclaimer. |
| `period_summary` | `氢哨运行摘要` | Time range; dataset quality; event counts by code/severity/review state; important events; bounded impact summary; provenance; disclaimer. |
| `pcc_daily_compliance` | `PCC合规日报` | Actual power and dynamic limits; import/export violation intervals, duration, and energy; daily import/export energy versus quotas; related C04/C05 events; review state; data quality; provenance; disclaimer. |
| `quality_report` | `氢哨数据质量报告` | Rows/time range; missing, duplicate, irregular, invalid-range and balance findings; blocked/downgraded status; provenance and source limits. |
| `review_audit_json` | Machine JSON | Stable English keys with Chinese note text preserved; all event review journals and unverified actor labels. |

Existing `analysis_result_json`, `submission_csv`, and `validation_metrics` retain stable machine fields. The UI labels and surrounding explanations for these exports must be Chinese.

### 6.3 Determinism

- Identical semantic input produces identical section ordering and numeric formatting.
- Reports sort events by start time then event ID, and review entries by revision.
- Numeric claims retain the precision required by the canonical event contract; Chinese UI may add a rounded display only when the exact value remains available.
- `contentHash` is SHA-256 of the exact UTF-8 artifact content.
- Documented generation timestamps are the only expected content-level variation between repeated exports.

## 7. Truthful Three-Minute Public-Validation Demo

The primary three-minute demo must use a deterministic slice created locally from the public validation package. It is not Fixture evidence, not the full validation set, not a hidden-test result, and not an organizer score.

### 7.1 Preparation outside the timed window

Worker P1-W3 adds a zero-dependency QA script under `tests/h2-sentinel/scripts/**` that:

1. Accepts the official package directory as an explicit argument; it never searches credential stores or `.env` files.
2. Verifies the public validation timeseries and event-label inputs are present and records their SHA-256 values.
3. Selects the chronologically earliest public C04 validation event after validating the label schema.
4. Extracts the timeseries interval from 30 minutes before event start through 30 minutes after event end without copying label columns into detector input.
5. Records every public label overlapping the interval in a QA-only manifest, separate from detector input.
6. Writes the slice and manifest to a user-selected local output directory ignored by Git.
7. Records script version, source hashes, selected event ID/code/time range, slice row count, and generation time.
8. Fails closed if the schema, hashes, event selection, or time coverage is invalid.

No generated slice, label, manifest, or official dataset is committed. The prepared slice is labeled `LIVE_ANALYSIS · 验证集切片` in the Web application.

### 7.2 Timed path

Services are already started before the timer. Installation and launcher startup are demonstrated and verified separately; excluding them must be disclosed in the demo receipt.

| Time budget | Judge action and visible evidence |
| --- | --- |
| `00:00-00:25` | Import the prepared validation slice. Show `LIVE_ANALYSIS · 验证集切片`, source fingerprint, time range, row count, and quality result. |
| `00:25-01:00` | Run deterministic analysis. Open the event center and select the target event without using public labels as detector input. |
| `01:00-01:30` | Open diagnosis detail. Show synchronized evidence, exact impact value/formula, safety checks, and provenance. |
| `01:30-01:55` | Confirm or reject the event, add a note, and show the revisioned journal. |
| `01:55-02:25` | Run `Q09`; show the deterministic Chinese answer and generated diagnosis report with matching event/report citation. |
| `02:25-02:45` | Export the review-audit JSON and `submission.csv`; show review state does not alter detector fields or the submission event identity. |
| `02:45-03:00` | Show report hashes and the receipt stating validation-slice scope, timing, and limitations. |

### 7.3 Truthfulness gates

- The timed path must complete twice consecutively within 180 seconds on the stated target machine before it is described as a three-minute demo.
- The receipt records commit SHA, source hashes, slice manifest hash, run ID, stage durations, provenance mode, and exported artifact hashes.
- Public validation labels may be used only after analysis for QA comparison and slice provenance, never as detector input.
- If Live analysis fails or exceeds the budget, the demo is failed. Fixture may be shown only as a separately labeled fallback and may not replace the validation result in the receipt.
- No validation metric is shown unless the exact split, matching rule, label source, and implementation version are present.
- No validation result is described as an official score, hidden-test result, or production proof.

## 8. Worker Ownership and Sequencing

The following allowlists are exact. A worker must not edit a path owned by another worker, root files, these frozen P1 specifications, or nested worktrees.

### P1-W1 — Contracts and deterministic analytics

**Owns:**

- `packages/h2-contracts/**`
- `services/h2-analytics/**`

**Delivers:** official question IDs/prompts, stricter assistant schema, review journal contract/service/routes, Q09 report generation, new report kinds, Chinese analytics reports/errors, and focused contract/Python tests.

### P1-W2 — Adapters and judge-facing Web workflow

**Owns:**

- `plugins/h2-ems/**`
- `apps/web/src/features/h2-sentinel/**`

**Delivers:** data-source/adaptor parity, Chinese assistant UI, review controls/history with conflict handling, Chinese report center, provenance labels, download behavior, and focused presentation/adaptor tests.

### P1-W3 — QA, validation demo, and submission evidence

**Owns:**

- `tests/h2-sentinel/**`
- `submission/h2-sentinel/**`

**Delivers:** contract and assembled QA coverage, zero-dependency validation-slice preparation, timed demo receipt validation, review-audit/submission checks, and truthful submission evidence updates.

### Coordinator-only paths and actions

The coordinator owns root manifests/scripts, cross-track wiring, integration conflict resolution, final runtime inspection, final verification, commit integration, and completion claims. Cross-track needs are reported to the coordinator; workers do not widen their allowlists.

### Sequencing

1. Freeze and accept P1-W1's shared contract delta.
2. P1-W1 completes analytics against that contract while P1-W2 and P1-W3 consume it without modifying it.
3. P1-W2 completes adapter and Web workflows.
4. P1-W3 runs assembled QA and builds the validation-demo receipt from the integrated tree.
5. The coordinator runs all final gates from one clean final commit.

## 9. Acceptance Criteria

### 9.1 Assistant

- Exactly ten accepted IDs, `Q01` through `Q10`; `H2Qxx` requests fail.
- Official Chinese prompt text matches the package exactly.
- All ten answers run offline and return `DETERMINISTIC_TEMPLATE` regardless of `allowLlmRendering`.
- Every answer is Chinese, evidence-grounded, provenance-bearing, and has no dangling or empty section citation.
- Question-specific event requirements and code restrictions are enforced.
- `Q09` returns a downloadable Chinese event report whose report citation and descriptor match.
- Missing evidence produces an explicit bounded Chinese answer, not invented facts or zero metrics.
- All answers refuse direct equipment-control authority.

### 9.2 Human review

- All allowed transitions and all forbidden transitions are tested.
- Reject, resolve, reopen, and note actions enforce notes.
- Same `requestId` replay is exactly-once; stale revision is a non-mutating conflict.
- Notes and actor labels are escaped in Web and HTML output.
- Browser reload preserves the current projected state and journal for the active data source.
- Event detection, evidence, impact, provenance, and submission identity remain unchanged after review.
- Audit JSON includes all events in deterministic order and includes full revision history.
- UI discloses that actor labels are local and unverified.

### 9.3 Reports

- Required HTML kinds are UTF-8 Chinese documents with the sections in Section 6.
- `pcc_daily_compliance` requires an explicit daily time range and never fabricates quota data.
- Validation metrics are omitted or explicitly unavailable when labels/matching definition are absent.
- No artifact contains an absolute local path, secret, stack trace, or unescaped untrusted HTML.
- `contentHash` matches the exact UTF-8 artifact bytes.
- Repeated semantic export is stable except documented timestamps.

### 9.4 Demo and safety

- The primary demo receipt proves two consecutive validation-slice runs within 180 seconds on the named target environment.
- The Web visibly distinguishes Fixture, validation slice, full validation, and other Live sources.
- Public labels are not passed into analysis.
- Fixture fallback is disclosed and excluded from validation claims.
- No external network, LLM, credential, new dependency, or control command is required.

## 10. Verification Commands

Run focused checks in each owned lane before handoff.

### P1-W1 focused checks

```text
node --import tsx --test "packages/h2-contracts/test/*.test.ts"
cd services/h2-analytics && uv run --locked --extra dev python -m pytest -q tests/test_assistant_reports.py tests/test_api.py
git diff --check
```

### P1-W2 focused checks

```text
npm run typecheck
npm run h2:test
git diff --check
```

### P1-W3 focused checks

```text
npm run h2:qa
npm run h2:launcher:test
node tests/h2-sentinel/golden-path/run-offline-golden-path.mjs
git diff --check
```

The Fixture golden path remains a fallback regression check; it does not satisfy the validation-demo acceptance gate.

### Final integrated checks

Run from the final integrated commit and do not reuse results from worker worktrees:

```text
npm run typecheck
npm run h2:check
cd services/h2-analytics && uv run --locked --extra dev python -m pytest -q
npm test
npm run h2:build
git diff --check
git status --short
```

In addition, the coordinator must inspect desktop and 390 x 844 mobile rendering for overflow, overlap, focus/disabled states, review conflicts, Chinese report downloads, and the complete timed validation path.

## 11. Risks and Required Mitigations

| Risk | User impact | Required mitigation |
| --- | --- | --- |
| Official `Qxx` IDs diverge from current `H2Qxx` values | Judge actions fail or evidence is attached to the wrong question | One coordinated contract migration; reject aliases; exact package-text tests. |
| Review mutates detector output | Audit and submission are no longer trustworthy | Separate append-only journal; derive only `reviewState`; compare event/submission snapshots before and after. |
| Concurrent tabs overwrite decisions | Lost operator work | `expectedRevision`, typed conflict, reload-and-retry UI, idempotent `requestId`. |
| Notes or filenames inject HTML | Report/UI compromise | Length limits, plain-text storage, contextual escaping, adversarial tests. |
| Local actor label is mistaken for authenticated identity | False accountability claim | Label it unverified in UI, API documentation, and audit export; do not add auth in P1. |
| Public labels leak into analysis | Invalid validation evidence | Keep label manifest separate; hash detector input; QA test that label columns are absent. |
| Validation slice is presented as full validation or official score | Misleading competition claim | Visible provenance label and receipt limitations; fail closed on absent hashes. |
| Three-minute target is asserted without timing proof | Demo failure in judging | Two consecutive measured runs; stage durations and environment in receipt. |
| Chinese localization changes canonical IDs or numeric precision | Broken machine exports or misleading evidence | Localize labels/prose only; retain exact IDs, units, schema fields, and exact values. |
| Cross-worker contract edits drift | Integration conflicts and incompatible adapters | P1-W1 owns contracts; downstream workers consume; coordinator resolves shared wiring. |
