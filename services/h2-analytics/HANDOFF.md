# H2 Analytics Handoff

## Current Boundary

This service is the loopback-only deterministic analytics sidecar for H2
Sentinel. It accepts CSV text and never accepts filesystem paths, remote URLs,
commands, expressions, credentials, or equipment-control requests.

## Delivered Behavior

- The official 69-field vocabulary is the runtime source of truth.
- The import boundary rejects public label columns, duplicate headers, unsafe
  filenames, malformed CSV, files above 300 MiB, and datasets above 600,000
  rows before analysis.
- The default `RuleRowDetector` covers C01-C07 without a model or LLM.
  Detection and aggregation thresholds are frozen in the versioned vocabulary.
- Every class emits deterministic aggregation, diagnosis, evidence, impact,
  safety checks, recommendations, and mandatory human confirmation.
- The service preserves the P1 append-only review journal, exact Q01-Q10
  assistant behavior, Chinese report kinds and errors, validation-slice
  provenance, and immutable detector/submission boundary.
- Submission export keeps the exact 16-column order and translates event
  severity, control object, and equipment references to the official submission
  vocabulary.
- FastAPI documentation routes stay disabled; Host and Origin checks are
  restricted to loopback identities.

## Dependency Note

Starlette 1.6 prefers its supported `httpx2` TestClient backend and deprecates
the legacy `httpx` path. The locked development extra therefore uses
`httpx2>=2,<3`; it is test-only and does not add an application dependency.

## Verification

Run from this directory:

```bash
uv lock --check
uv run --locked --extra dev python -W error -m pytest -q
uv run --locked --extra dev ruff check src tests
```

Mypy is not configured in this package. Root integration should also run the
project contract tests, full project checks, and `git diff --check`.

## Evidence Limits

The committed fixture is synthetic, sanitized, and explicitly marked
`FIXTURE`. No official time-series or label CSV, historical validation report,
organizer score, deployment claim, credential, or absolute workstation path is
included. Root project memory is coordinator-owned and is not changed by this
lane.
