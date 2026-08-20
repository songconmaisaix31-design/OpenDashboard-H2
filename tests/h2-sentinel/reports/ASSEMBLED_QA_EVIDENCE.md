# H2 Sentinel Assembled QA Evidence

## Execution contract

Run `npm run h2:qa` from the repository root. The command runs C01-C04 and
then starts Fixture and Local sessions only through the public H6 launcher. The
final stdout line is a JSON object with test IDs, statuses, safe assertion
details, aggregate counts, and the explicit manual-visual boundary.

The runner never writes a report artifact, raw startup output, absolute path,
secret, listener PID, or process tree into this repository. It validates report
content in memory and recomputes its SHA-256 descriptor hash.

## Baseline result — 2026-08-19

At QA baseline `6d04ee38f39d81801c87190f31eff0a1915862c6`:

| Gate | Result | Evidence |
| --- | --- | --- |
| C01-C04 | PASS | Frozen contract harness passed all five assertions. |
| A01/A03/A04/A05/A07 Local API | PASS | Import, C03/C04 analysis/events, `29.333333333333332`, no-LLM answer, C03 HTML/hash, exact CSV, loopback Host/Origin policy, and redacted failure passed. |
| A02 Fixture process isolation | PASS | Fixture `READY` has no analytics URL/PID; Web PID exited and port rebound after shutdown. |
| A04/A07 launcher failures | PASS | Occupied Web/analytics ports and redirecting health endpoint were rejected with actionable errors. |
| A05 Fixture C03 report | FAIL | Public Fixture report was JSON rather than the required HTML; recorded as H2-QA-002. |
| A06/A08 entry/navigation | PASS (source/HTTP) | Generic/H2 entry and six navigation declarations were found; invalid mode routes to the visible alert path. |
| Visual desktop/390 px | MANUAL REQUIRED | No browser automation dependency is installed or implied. |

## Correction rerun — 2026-08-19

After the H2 Plugin correction
`92f7b78027b9492a5a5fe8ced2e851ed4199aeaa`, `npm run h2:qa` passed all C01-C04
and assembled A01-A08 automated assertions: four assembled groups passed and
none failed. The correction changed the Fixture C03 report to `text/html` with
a safe `.html` filename and a matching SHA-256 descriptor. The occupied-port,
redirect-timeout, direct external-Host `400`, external-Origin `403`, redacted
error, PID-exit, and rebind assertions also passed.

The visual desktop/390 px line remains `MANUAL REQUIRED`. This file does not
turn it into screenshot automation or assert a new manual review that was not
performed by this QA runner.

## Post-audit correction rerun — 2026-08-19

The QA branch consumed the coordinator-approved verification dependencies only:
analytics `53733ae`, H6 `df8fbec`, plugin `0e6847e`, and the plugin series/
citation follow-up `1192b6a`. They are not part of the QA deliverable write
set.

| Gate | Result | Independent runner evidence |
| --- | --- | --- |
| Six Local report kinds | PASS | `single_event_diagnosis`, `period_summary`, `analysis_result_json`, `submission_csv`, `validation_metrics`, and `quality_report` all passed kind/format/media/filename/hash checks through the public API. |
| Quality and validation semantics | PASS | Quality HTML contained report identity, status, check table, and emitted quality codes. Validation parsed as JSON bound to the run, quality object, and provenance. |
| External health lookalikes | PASS | Minimal, wrong-namespace, wrong-host, and extra-top-level envelopes all exited non-zero and emitted no `READY`. |
| Canonical external sidecar | PASS | Exact health emitted `READY`; analytics PID was null, owned Web exited, Web port rebound, and the external sidecar stayed reachable until the test closed it. |
| Existing Local and Fixture gates | PASS | Import/analyze/events, C03/C04, no-LLM assistant, redaction, Host/Origin, occupied ports, redirect timeout, Fixture-no-Python, report hash, PID exit, and rebind all remained green. |
| Visual desktop/390 px | COORDINATOR MANUAL | Not claimed as QA screenshot automation. |

The last `npm run h2:qa` emitted five automated assembled groups with
`PASS=5`, `FAIL=0`. No generated report, PID, raw process output, absolute path,
or secret is retained in this evidence ledger.

`npm run h2:check` subsequently passed with 42 focused H2 tests, the same QA
runner, seven launcher tests, strict type checking, and a production build.
`npm run h2:smoke` passed its eight H6 smoke scenarios. Those are supplementary
integration evidence; the Local API and external-sidecar assertions above come
from the independent QA runner.
`npm test` also passed 74 repository tests on this assembled snapshot.
