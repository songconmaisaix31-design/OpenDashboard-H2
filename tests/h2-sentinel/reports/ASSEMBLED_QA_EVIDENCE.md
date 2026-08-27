# H2 Sentinel P1 Assembled QA Evidence

## Evidence boundary

This ledger records the P1-W3 worker checkout on 2026-08-28. The checkout is
based on W1 commit `4c856eb`; W2 is intentionally not integrated. It contains
no official validation package, prepared official slice, measured demo receipt,
organizer result, deployment proof, remote-CI result, or completed visual review.

The primary command is:

    npm run h2:qa

It runs dependency-free contract/tool tests, the frozen C01-C04 harness, and
then the assembled Fixture and Local probes through the public launcher. The
runner validates responses and report bytes in memory, emits a redacted summary,
and cleans its owned processes. It does not persist generated reports, process
identifiers, absolute paths, credentials, or raw startup output.

## P1-W3 result

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

## Final-candidate gates

After W2 and the provenance correction are integrated, the coordinator must run
the full command set from one clean candidate SHA. The primary demo additionally
requires an authorized public package, explicit expected source hashes, an
ignored generated-output directory, and two consecutive measured runs whose
receipt passes `validate-demo-receipt.mjs`. Historical H6 evidence, Fixture,
HTTP success, route declarations, and this worker's synthetic tests do not
substitute for those gates.
