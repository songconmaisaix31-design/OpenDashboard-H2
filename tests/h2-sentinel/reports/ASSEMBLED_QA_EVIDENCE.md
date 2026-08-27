# H2 Sentinel P1 Assembled QA Evidence

## Evidence boundary

This ledger preserves the P1-W3 worker checkout result from 2026-08-28. That
historical checkout was based on W1 commit `4c856eb` and intentionally excluded
W2. The coordinator result below supersedes it for current integration status.
Neither result contains an official validation package, prepared official slice,
measured demo receipt, organizer result, deployment proof, or remote-CI result.

## Coordinator integration result

The coordinator integrated W2 and the validation-slice provenance correction in
behavior candidate `a7f7093`. Fresh verification on the integrated tree passed:

- `npm run h2:check`: TypeScript, 76 H2 tests, all six assembled QA groups,
  9 launcher tests, and the production build;
- `npm test`: 91 tests;
- Python: 52 pytest tests, Ruff, and Mypy across 38 source files;
- runtime Fixture review: C03 advanced from revision 0 to confirmed revision 1
  while C04 remained independently at revision 0;
- runtime exports: deterministic Q09 diagnosis HTML, PCC compliance HTML, and
  review-audit JSON were generated and their bytes inspected;
- visual review: 1427px desktop and 390x844 narrow-width primary Fixture flows
  had no page-level horizontal overflow, visible control clipping, or overlap.

These are integrated local and Fixture results. They are not official-data,
timed-demo, organizer, deployment, production, or remote-CI evidence.

The primary command is:

    npm run h2:qa

It runs dependency-free contract/tool tests, the frozen C01-C04 harness, and
then the assembled Fixture and Local probes through the public launcher. The
runner validates responses and report bytes in memory, emits a redacted summary,
and cleans its owned processes. It does not persist generated reports, process
identifiers, absolute paths, credentials, or raw startup output.

## Historical P1-W3 worker result

| Gate | Result | Current evidence |
| --- | --- | --- |
| Official Q01-Q10, review, and report contracts | PASS | Static contract conformance tests require exact IDs/prompts, review actions/bounds, eight report kinds, and the review-free submission schema. |
| Slice and receipt tools | PASS with synthetic inputs | Tests cover source hashes, earliest C04 selection, 30-minute padding, label isolation, ignored output, two-run timing boundaries, and artifact hash drift. This is not an official-data or timed-demo result. |
| Fixture P1 report | FAIL pending W2 | The pre-W2 adapter still returns an English diagnosis; P1 requires Chinese structure and explicit FIXTURE provenance. |
| Local P1 API and review workflow | Assertions exercised; group FAIL | Q01-Q10, citations, review transitions, replay/conflict handling, audit export, submission immutability, report hashes, escaping, and safety assertions pass before the final provenance assertion. |
| Validation-slice provenance | FAIL, `H2-QA-P1-001` | The prepared-slice filename is not retained in analytics provenance, so the report shows `LIVE_ANALYSIS · 本地导入数据` instead of `LIVE_ANALYSIS · 验证集切片`. |
| P1-W2 source surface | FAIL pending W2 | The current source still exposes the legacy H2Qxx surface and lacks the accepted P1 Web/review presentation. |
| Launcher failure and external-sidecar boundaries | PASS | Occupied ports, redirecting or malformed health responses, loopback ownership, process exit, and port rebind remain covered. |
| Entry/navigation source gate | PASS | Route declarations and invalid-mode handling are inspected; this is not browser or screenshot evidence. |
| Desktop and 390x844 rendering | MANUAL REQUIRED | No automated visual result is claimed. |

The assembled summary on this worker baseline is `PASS=3`, `FAIL=3`. Those
failures are retained as failures: two depend on W2 integration, while the
validation-slice provenance failure needs a coordinator-routed cross-track fix.

Focused worker results on this exact pre-commit tree:

- contract/tool tests: 12 passed, 0 failed;
- launcher tests: 9 passed, 0 failed;
- submission package validator: passed;
- offline golden-path probe: exited successfully with an explicit `SKIP`
  because `H2_WEB_URL` was not set; this is not runtime evidence;
- `git diff --check` and changed-path allowlist audit: passed.

## Remaining evidence gates

The integrated command set and primary Fixture visual review have passed. The
primary validation-slice demo still requires an authorized public package,
explicit expected source hashes, an ignored generated-output directory, and two
consecutive measured runs whose receipt passes `validate-demo-receipt.mjs` for
the exact final SHA. Historical H6 evidence, Fixture, HTTP success, route
declarations, and synthetic tests do not substitute for those gates.
