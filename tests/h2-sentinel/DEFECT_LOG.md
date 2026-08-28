# H2 Sentinel QA Defect Log

## Current remediation evidence gates

### H2-QA-R04-001

| Field | Value |
| --- | --- |
| Severity | release evidence gate, not a confirmed product defect |
| Scope | Official validation, overfit sentinel, public test-set smoke, and two-run demo |
| Expected | Fresh ignored reports and artifacts from one clean final integrated SHA pass the evaluator, submission checker, offline smoke, receipt validator, and visual review. |
| Current fact | Lane C supplies the reproducible tools and fixtures. No final official metric, screenshot set, receipt, or candidate SHA was generated in this worker branch. |
| Reproduction | Run the commands in `validation/README.md` with the explicit read-only public data directory after integration. |
| Owner | Coordinator final-candidate gate |
| Status | open evidence gate; do not publish numeric or timing claims yet |

### H2-QA-R10-001

| Field | Value |
| --- | --- |
| Severity | source-integrity disclosure |
| Scope | Supplied official package SHA-256 manifest |
| Expected | Runtime evidence uses only matching public data/material entries and does not modify the package. |
| Current fact | Read-only verification found that all data/material entries plus the workbook match: 21 of 24 total manifest entries. The three top-level requirement/README Markdown or DOCX files differ from their manifest records. |
| Safety impact | The package must not be described as fully manifest-clean, and differing top-level documents cannot be checksum evidence for runtime claims. |
| Status | accepted bounded source fact; package remains read-only |

## Current integrated P1 facts

The previously reported validation-slice provenance issue is resolved in the
integrated P1 baseline: prepared-slice provenance remains distinct from generic
Live imports and Fixture. The current integrated assistant uses Q01-Q10, Q09
produces deterministic diagnosis HTML, review is a separate append-only journal,
and review-audit export remains separate from the detector event and submission.
These behaviors remain mandatory regression gates in `npm run h2:qa`.

## Historical worker findings

The following findings are retained as historical evidence, not current defects:

- Pre-W2 P1-W3 workers observed English Fixture report output and the legacy
  H2Qxx surface. W2 integration superseded those observations.
- `H2-QA-P1-001` observed generic Live provenance for a prepared slice on the
  W1-only worker baseline. The integrated provenance correction superseded it.
- An archived H0 C04 claim used `86.5 kWh`; the corrected frozen Fixture value
  is `29.333333333333332 kWh`. That Fixture correction is not an official-data
  metric.
- Earlier Fixture report format and external-sidecar health lookalike failures
  were fixed and regression-gated before this remediation lane.

Historical failures must stay labeled with their old checkout context. They
must not be rewritten as current failures, and their test counts, screenshots,
or report numbers must not be copied into final-candidate evidence.

## Defect entry template

| Field | Required value |
| --- | --- |
| ID | Stable identifier |
| Severity | blocker, high, medium, low, or evidence gate |
| Scope | Exact matrix row and component |
| Reproduction | Exact command and sanitized input identity |
| Expected | Contract or acceptance behavior |
| Actual | Fresh observation from the named SHA |
| Evidence | Relative artifact path and hash; no secrets or workstation paths |
| Status | open, fixed, historical, or accepted boundary |
