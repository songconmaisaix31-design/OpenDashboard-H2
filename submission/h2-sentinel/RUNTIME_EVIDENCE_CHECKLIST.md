# H6 Runtime Evidence Checklist

## Candidate record

- Original H6 integration gate: `8bcc8d59e352def535c26504683975959ff7f18d`.
- Current coordinator-verified assembled snapshot; final candidate SHA is pending coordinator handoff.
- Evidence date: 2026-08-19, as recorded in the H6 handoff.
- Scope: current-worktree evidence only; it does not prove `main`, deployment,
  remote GitHub Actions execution, network isolation, official data, or scores.

| ID | Required evidence | Status at candidate | What it proves and does not prove |
| --- | --- | --- | --- |
| R01 | Candidate SHA and source inventory | Pending coordinator handoff | The final candidate SHA must identify the current H6 composition; it is not a `main` publication. |
| R02 | Windows and shell launcher commands | Passed | `npm run h2:fixture`, `npm run h2:local`, and wrappers are recorded in the H6 handoff. |
| R03 | Fixture-only start without Python or LLM key | Passed | The smoke covered Fixture without analytics; no-LLM golden determinism is separately exercised in Local mode. |
| R04 | Fixture C03 journey | Passed | Mounted Fixture C03 UI was manually reviewed; `92f7b78` additionally makes its single-event report deterministic safe HTML. |
| R05 | Fixture C04 detail and export journey | Passed for detail | C04 and corrected `29.333333333333332 kWh` were reviewed; do not upgrade this to official-data evidence. |
| R06 | Generated `submission.csv` and validator | Passed in Local deterministic smoke | Two rows and the exact 16 columns passed the Python validator. |
| R07 | Generated report evidence | Passed for Local C03 and designated Fixture HTML reports | `92f7b78` maps single-event, period, and quality Fixture reports to safe HTML; JSON/CSV kinds retain their own formats. |
| R08 | Loopback health, proxy, and failures | Passed | Smoke rejects a 307 health redirect and covers occupied ports, Windows-owned child cleanup, Local cleanup, and preview proxy; no broad isolation claim follows. |
| R09 | Official CSV import and quality record | Not delivered | Official data is absent. |
| R10 | Versioned validation report and metrics | Not delivered | No matching policy/metrics artifact exists. |
| R11 | Desktop and narrow-width visual evidence | Manual pass; assets not delivered | Human Chrome review at desktop and 390x844 found no document-width overflow; no automated screenshot suite or committed images exists. |
| R12 | TypeScript, Web, launcher, Python, and diff checks | Current assembled pass | The assembled snapshot recorded 92 repository tests, 60 focused H2 tests, 32 Python pytest cases, nine launcher tests, five assembled QA groups, and nine smoke scenarios. |
| R13 | Third-party notice and asset review | Notice passed; assets not delivered | `THIRD_PARTY_NOTICES.md` inventories shipped dependencies; screenshots/datasets/reports are absent and need review before distribution. |
| R14 | Release/archive manifest and hashes | Not delivered | There is no release or deployment archive proof. |

## Smoke coverage

`npm run h2:smoke` recorded nine H2 smoke scenarios. This is executable
assembled-snapshot evidence; it is neither a production deployment nor a remote
CI run.

## Report-format correction

Plugin source `92f7b78027b9492a5a5fe8ced2e851ed4199aeaa`, integrated by the
coordinator as `abe454b`, resolves the H6-discovered Fixture format mismatch.
It proves deterministic safe HTML only for single-event diagnosis, period
summary, and quality reports. It does not change the evidence limits for JSON,
CSV, official data, scores, deployment, remote CI, screenshots, or network
isolation.
