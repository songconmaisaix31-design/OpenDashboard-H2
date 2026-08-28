# H2 Sentinel Remediation QA Acceptance Matrix

## Invocation and scope

```text
npm run h2:qa
node --test "tests/h2-sentinel/contract/*.test.mjs"
```

Lane C owns validation tools, independent QA, and submission evidence. Runtime
tools use only explicit public-data paths and write generated files below the
ignored `tests/h2-sentinel/reports/generated/` tree.

| ID | Acceptance focus | Automated evidence | Current status |
| --- | --- | --- | --- |
| P01 | Exact Q01-Q10 prompts, deterministic Q09 report, review concurrency/idempotency, audit export, report hashes, and review-free 16-column submission | `p1-contract-conformance.test.mjs` plus assembled QA | Current integrated P1 fact; mandatory final regression gate |
| V01 | Exact official 69-field vocabulary and no deprecated detector columns | `official-vocabulary.test.mjs`, `p1-validation-tools.test.mjs` | PASS on the Lane C snapshot; canonical Lane A equality runs after integration |
| V02 | Earliest C04 selection, exact source hashes, inclusive 30-minute padding, label exclusion, relative-path manifest, and ignored outputs | `p1-validation-tools.test.mjs` | PASS with synthetic public-package fixtures; final official slice not generated here |
| V03 | C01-C07 event matching, per-class metrics, UTC-naive timestamps, and cross-day merge | `evaluate-metrics.test.mjs` | PASS; final official metrics require coordinator rerun |
| V04 | Exact official affected-equipment tokens and per-code sets in the 16-column submission | `check-submission.test.mjs` | PASS with checker fixtures; final test-set export remains a coordinator gate |
| V05 | Two separate scripted executions, positive stage durations, exact candidate SHA, relative artifact paths, and recomputed hashes | `p1-validation-tools.test.mjs`, `run-demo.mjs` | Validator PASS with synthetic receipts; no final measured receipt claimed |
| V06 | Full public test-set import/analyze/export and checker verdict | `offline-deploy-smoke.mjs` | Tool implemented; final official run not performed in this lane |
| V07 | No labels or workstation absolute paths in generated detector inputs and receipts | slice and receipt fail-closed tests | PASS with synthetic fixtures |
| D01 | Official validation metrics, overfit report, test-set smoke, and two-run receipt from one clean integrated SHA | ignored generated artifacts plus validators | COORDINATOR REQUIRED |
| M01 | Retained desktop and 390x844 official-slice screenshots | coordinator visual inspection | COORDINATOR REQUIRED |

## Evidence interpretation

Historical P1-W3 failures described a pre-W2 worker checkout. They remain in
the historical evidence ledger and are not current product defects. The current
integrated P1 review/assistant/report behavior is established separately by
fresh coordinator verification.

Lane C completion proves tool and QA behavior. It does not supply final official
metrics, screenshots, a measured receipt, an organizer result, deployment,
remote CI, or the final candidate SHA. Those claims remain false until the
coordinator reruns the exact final gates from a clean integrated commit.
