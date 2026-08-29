# H2 Contracts Handoff

## Current Boundary

This package owns the TypeScript contracts, JSON Schemas, sanitized fixtures,
and focused conformance tests used by Analytics, Plugin, Web, QA, and Submission
tracks. It includes no official dataset, runtime service, UI implementation, or
deployment state.

## Delivered Contract Surface

- The canonical 69-field vocabulary, C01-C07 taxonomy, equipment, constraints,
  efficiency curves, knowledge text, exact Q01-Q10 prompts, and versioned
  detector thresholds live under `packages/h2-vocabulary`.
- Root package exports expose official fields, taxonomy, equipment, deprecated
  mappings, question text, dataset-field conversion, and submission equipment
  tokens.
- The sanitized fixture uses all 69 canonical fields; deprecated Fixture names
  exist only in the explicit compatibility map.
- Event severity retains the stable English API enum. Submission rows translate
  it to the official Chinese taxonomy and use the official primary control
  object and comma-separated equipment tokens.
- The exact 16-column submission order, anomaly code/subtype/impact correlation,
  append-only review contracts, Q09 generated-report invariant, provenance,
  report kinds, and redacted API envelopes remain frozen.
- Human review may update only the projected review state. It cannot mutate
  detector evidence, impact, provenance, or submission content.

## Verification

Run from the repository root:

```bash
npm test --workspace @opendashboard/h2-contracts
npm run typecheck
git diff --check
```

## Evidence Limits

Golden C03/C04 fixtures are synthetic, sanitized contract examples, not
official-data validation, an organizer score, or production proof. This lane
contains no large official time-series or label files and makes no historical
validation claim. Root project memory and integration files remain
coordinator-owned.
