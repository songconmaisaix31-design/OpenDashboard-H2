# H2 Analytics Handoff

## Scope and Git boundary

- Worker branch: `songconmaisaix31-design/h2-analytics`
- Immutable Wave 1 base: `f9dd7df83a81da57fdaa2b03cd67470c8c7a22c4`
- Pre-handoff implementation HEAD: `99467014a3a5c8bca3717c8739e0933933c393fc`
- Correction source inspected read-only: integration commit `4f2a8a3156a96a7670f4ee9830ff1c560faf1c94`
- Owned and modified path: `services/h2-analytics/**` only
- Root manifests, contracts, plugins, web, CI, start scripts, and integration/main were not modified.

The final pushed HEAD is reported in the dispatch completion because a commit
cannot contain its own resulting hash. The implementation commits, in
cherry-pick order, are:

1. `1d3f664` — locked ingestion and quality pipeline
2. `8207016` — deterministic diagnosis and exports
3. `9946701` — loopback API and verification tools
4. the handoff/whitespace evidence commit containing this file

## Delivered behavior

- Safe in-memory CSV text import with basename-only validation, strict parsing,
  size and row limits, UTC timestamp normalization, deterministic fingerprinting,
  explicit Fixture provenance, and structured quality findings.
- A deterministic row-detector seam with an always-available rule fallback and
  an optional LightGBM adapter that accepts only an already-loaded booster.
- Canonical anomaly events, C03 sensor-reversal diagnosis, C04 threshold-boundary
  diagnosis, declared impact identities, three-state safety evaluation, and
  deterministic assistant suggestions.
- Escaped HTML, JSON, and exact 16-column submission exports with content hashes.
- Report-format parity for every canonical kind: single-event diagnosis,
  period summary, and data quality are `text/html`; analysis result and
  validation metrics are `application/json`; submission is `text/csv`.
  The local quality HTML includes status, rows, time range, checks,
  warnings/blocking reasons, provenance, limitations, and the advisory
  human-confirmation disclaimer.
- A loopback-only FastAPI service with disabled OpenAPI/docs, redacted errors,
  bounded requests, and strict loopback Host/Origin checks. H6 remains the
  browser same-origin proxy; no permissive CORS policy was added.
- `ROUTES.json` and `GET /api/v1/h2-sentinel/routes` expose the route map. Tests
  compare the manifest, exported map, and actual FastAPI route table.
- `GET /api/v1/h2-sentinel/mode` returns an envelope whose `data` is exactly the
  literal `"LIVE_ANALYSIS"` expected by the accepted adapter.

## Frozen correction evidence

The C04 golden event includes eight one-minute violation rows at 720 kW against
the 500 kW limit. Its impact is calculated as
`8 * (720 - 500) / 60 = 29.333333333333332 kWh`; neither code nor tests use the
superseded 86.5 value. C03's 112.4 impact is explicitly Fixture-provided and is
not presented as a metric derived from an official hidden dataset.

## Reproducibility and verification

Preferred environment: `uv 0.11.26`. The committed `uv.lock` SHA-256 is
`50E52591FE57FB2FE36B387FE188BC0F0D48A9E9F54E466FB1F27C257C16E53D`.
The `dev` extra contains only `httpx`, `jsonschema`, and `pytest`.

Commands run from `services/h2-analytics` on 2026-08-19:

| Command | Exact result |
|---|---|
| `uv lock --check` | Passed; resolved 36 packages. |
| `uv sync --locked --extra dev` | Passed; checked 30 installed packages. |
| `uv run --locked --extra dev python -m pytest` | Passed; 24 tests in 0.53 s. One upstream Starlette `httpx` deprecation warning. |
| `uv run --locked --extra dev python -m h2_analytics.tools.smoke_golden` | Passed; C03/C04 emitted, C04 impact `29.333333333333332`, two submission rows. |
| `uv run --locked --extra dev python -m h2_analytics.tools.validate_submission artifacts/submission.csv` | Passed; exact 16 columns and two valid rows. |
| `python -m pip install --no-build-isolation -e '.[dev]'` | Passed in the task temporary virtual environment; documented fallback when uv is unavailable. |
| `python -m ruff check src tests` with optional local Ruff 0.15.20 | Passed; Ruff is not a committed dependency. |
| `python -m mypy src` with optional local mypy 2.1.0 | Passed; 36 source files and no issues; mypy is not a committed dependency. |
| Real `python -m h2_analytics --port 18765` health probe | Passed; `healthy`, version `0.1.0`, bind host `127.0.0.1`; process was stopped. |
| `git diff f9dd7df83a81da57fdaa2b03cd67470c8c7a22c4 --check` | Passed after removing trailing EOF blank lines. |

### Post-integration report-format correction

The coordinator cherry-picked the report-format correction as
`competition/h2-sentinel@bed239e`. Its analytics-only source commit is
`53733ae2542dafb3abbef19da0eb153fdd9f58c7` on
`fix/h2-analytics-report-parity`.

| Command | Exact result |
|---|---|
| `uv lock --check` | Passed; resolved 36 packages. |
| `uv sync --locked` | Passed. |
| `uv sync --locked --extra dev --offline` | Passed using the locked local cache. |
| `uv run --locked --extra dev python -m pytest` | Passed; 32 tests. One upstream Starlette/httpx deprecation warning. |
| `uv run --locked --extra dev python -m h2_analytics.tools.smoke_golden` | Passed; C03/C04 emitted and C04 impact remained `29.333333333333332`. |
| `uv run --locked --extra dev python -m h2_analytics.tools.validate_submission artifacts/submission.csv` | Passed; exact 16 columns and two valid rows. |
| `git diff --check` | Passed. |

The added adversarial coverage verifies all six canonical report kinds and
their media types, and verifies Jinja escaping for a malicious imported
filename in every HTML-producing kind. This is local deterministic behavior;
it is not evidence of an official competition dataset, score, or deployment.

The focused suite exercises malformed CSV, unsafe filenames, invalid and
out-of-range values, blocked quality, C03, C04 inclusive boundaries, threshold
confirmation, passed/failed/unknown safety, all assistant prompts, report
escaping, exact API parity, schema validation, request boundary rejection, and
deterministic repeatability.

## Integration notes and limitations

- Start with `uv run --locked python -m h2_analytics`; the only CLI setting is
  the port and the bind address remains `127.0.0.1`.
- Import calls accept `{filename, text}`. No endpoint accepts arbitrary file
  paths, commands, expressions, model paths, plugins, remote hosts, or network
  retrieval instructions.
- The deterministic fallback intentionally implements only the frozen C03 and
  C04 field mappings. Other declared C01-C07 impact identities return unknown
  until their official mappings are frozen; this avoids fabricated metrics.
- LightGBM remains an optional `ml` extra and is not needed for acceptance or
  deterministic repeatability.
- Generated smoke artifacts live under ignored `services/h2-analytics/artifacts/`.
- Root `MEMORY.md` was read but not updated because the H1 write allowlist
  permits changes only under `services/h2-analytics/**`; this handoff preserves
  the durable, non-secret H1 decisions inside the owned directory.
