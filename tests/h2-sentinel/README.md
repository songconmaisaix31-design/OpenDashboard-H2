# H2 Sentinel Independent P1 QA

This lane owns only tests/h2-sentinel/**. It consumes frozen contracts and
public launcher/API boundaries; it does not modify analytics, adapters, Web,
root wiring, dependencies, or official data.

## Automated gate

Run from the repository root:

    npm run h2:qa

The root command performs three layers:

1. Node contract tests for the exact 16-column submission, official Q01–Q10,
   review/report schema boundaries, slice preparation, and demo receipt.
2. The dependency-free fixture contract harness.
3. The assembled public-launcher runner.

The assembled runner verifies Fixture/Live provenance separation, official
assistant IDs and citation invariants, review transitions/idempotency/conflict
behavior, event/submission immutability, review-audit export, Chinese report
structure/escaping, report hashes, explicit unavailable validation metrics,
loopback boundaries, launcher ownership, and P1 Web/adapter source integration.

## Validation-slice tools

See [scripts/README.md](scripts/README.md) for the explicit package/hash/output
contract and measured receipt schema.

- prepare-validation-slice.mjs writes only a detector CSV and QA manifest to a
  new Git-ignored directory.
- validate-demo-receipt.mjs reads the final receipt, exact manifest, and two
  runs' artifacts; it requires both measured totals to be below 180 seconds.

The test suite uses synthetic temporary packages and artifacts only. It does
not search for or process an official package.

## Evidence boundary

- Passing worker contract/tool tests proves those files in this checkout.
- An assembled failure remains a failure, including a missing W2 dependency or
  cross-track provenance defect.
- Fixture smoke is regression evidence only.
- A final timing claim requires a passing receipt for two runs on the exact
  integrated SHA.
- Coordinator desktop and 390x844 inspection remains required; no browser
  automation dependency is added here.
