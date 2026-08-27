# H2 Sentinel QA Defect Log

## Open P1 integration defect

### H2-QA-P1-001

| Field | Value |
| --- | --- |
| Severity | blocker for the primary validation-slice demo |
| Scope | P1 validation-slice provenance in analytics-generated HTML |
| Expected | A prepared validation slice is rendered as LIVE_ANALYSIS · 验证集切片 and remains distinct from Fixture, full validation, test, and generic Live imports. |
| Actual | Importing non-Fixture CSV bytes with a validation-slice filename produces LIVE_ANALYSIS, but analytics provenance source is in-memory-csv-import and reports render LIVE_ANALYSIS · 本地导入数据. |
| Reproduction | npm run h2:qa; inspect the P1-API/P1-QA failure after the earlier assistant/review/report assertions execute. |
| Relevant baseline | W1 integration commit 4c856eb |
| Owned implementation track | Cross-track analytics provenance plus W2 presentation; coordinator must route the fix because P1-W3 cannot edit either path. |
| Safety impact | Without the fix, a bounded validation slice is indistinguishable from another local import in judge-visible report evidence. |
| Status | open; final integrated P1 acceptance is blocked. |

## Pending P1-W2 integration gates

The current P1-W3 base intentionally predates W2. The assembled runner therefore
also rejects the legacy H2Qxx Web/adapter surface and the English Fixture
diagnosis HTML. These are expected dependency failures until W2 is integrated;
they become defects only if they remain after the coordinator integrates the
accepted W2 commit.

## Resolved contract defects pending QA consumption

### H2-QA-001

| Field | Value |
| --- | --- |
| Severity | blocker (resolved by corrected contract gate) |
| Expected contract | The PRD C04 minute-level formula sums `max(pcc_power_kw - pcc_export_limit_kw, 0) / 60` over the declared event interval. |
| Observed behavior | Archived H0 declared `86.5 kWh`, but the eight inclusive CSV samples from `10:32` through `10:39` are each `720 - 500 = 220 kW`, which totals the canonical `29.333333333333332 kWh`. |
| Reproduction command | `node tests/h2-sentinel/run-contract-qa.mjs` |
| Relevant commit SHA | Frozen H0 gate `f9dd7df83a81da57fdaa2b03cd67470c8c7a22c4` |
| Owned implementation track | H0 Contracts |
| Golden-path blocker | yes |
| Evidence artifact | `packages/h2-contracts/fixtures/tiny-valid-timeseries.csv`, `packages/h2-contracts/fixtures/golden-c04.json`, and the failing `C04` harness row |
| Status | historical defect resolved by integration contract gate `4f2a8a3156a96a7670f4ee9830ff1c560faf1c94`; current assembled QA consumes and verifies the corrected value. |

## Open assembled regression

### H2-QA-002

| Field | Value |
| --- | --- |
| Severity | blocker |
| Scope | A05 Fixture C03 report export |
| Expected contract | `single_event_diagnosis` for C03 is an HTML artifact with `mediaType: text/html`, descriptor format `html`, a SHA-256 content hash, and a safe filename. |
| Actual | The public Fixture adapter returned `application/json` and descriptor format `json` for the requested C03 report. |
| Reproduction | `npm run h2:qa` |
| Relevant commit SHA | QA baseline `6d04ee38f39d81801c87190f31eff0a1915862c6` |
| Owned implementation track | H2 Plugin (fixture report artifact); H3 Web labels are affected presentation. |
| Golden-path blocker | yes |
| Evidence | Redacted JSON summary emitted by `tests/h2-sentinel/assembled/run-assembled-qa.mjs`; no generated artifact is retained. |
| Status | fixed by `92f7b78027b9492a5a5fe8ced2e851ed4199aeaa`; `npm run h2:qa` rerun passed Fixture C03 `text/html`, `.html` filename, and descriptor SHA-256 verification. |

The local analytics API, launcher, and Web entry are assembled in this baseline.
Their results are recorded in `ACCEPTANCE_MATRIX.md`; no assembly row is left as
a stale `SKIP`.

## Post-audit regression verification

### H2-QA-003

| Field | Value |
| --- | --- |
| Severity | high (resolved) |
| Scope | A05 Local `quality_report` and `validation_metrics` exports |
| Audit expectation | All six report kinds must have their contract format/media/extension/hash. Quality is inspectable HTML; validation is structured JSON, not a fabricated metric claim. |
| Current reproduction | `npm run h2:qa` |
| Verification dependency | Analytics source commit `53733ae` (QA cherry-pick `f929bc3`) and deep artifact validation commit `0e6847e` (QA cherry-pick `2fd5870`). |
| Current observed result | PASS: all six `reports:export` kinds are fetched through Local public API; quality HTML contains status, report identity, check table, and every quality code; validation parses as JSON with the current run, quality report, and provenance. |
| Golden-path blocker | no after verification |
| Status | resolved and regression-gated; the pre-fix snapshot was not rechecked after the audited source was superseded. |

### H2-QA-004

| Field | Value |
| --- | --- |
| Severity | high (resolved) |
| Scope | A04 external-sidecar readiness trust boundary |
| Audit expectation | `--external-sidecar-url` must not emit `READY` for a minimal, wrong-namespace, wrong-host, or extra-top-level health lookalike. Exact canonical health may start Web; cleanup may not kill the external listener. |
| Current reproduction | `npm run h2:qa` |
| Verification dependency | H6 source commit `df8fbec` (QA cherry-pick `21f68b8`). |
| Current observed result | PASS: each lookalike timed out without `READY`; exact canonical health emitted `READY` with null analytics PID, and the external listener remained available after launcher cleanup. |
| Golden-path blocker | no after verification |
| Status | resolved and regression-gated; the pre-fix snapshot was not rechecked after the audited source was superseded. |

## Defect entry template

| Field | Required value |
| --- | --- |
| ID | Stable identifier, for example `H2-QA-001` |
| Severity | blocker, high, medium, or low |
| Scope | Matrix row and affected assembly component |
| Reproduction | Exact command and sanitized input |
| Expected | Contract or acceptance-matrix behavior |
| Actual | Observed behavior and redacted output |
| Evidence | Commit SHA, artifact path, and screenshot/log path if applicable |
| Status | open, fixed, or accepted |
