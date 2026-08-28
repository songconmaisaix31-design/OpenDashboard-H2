# H2 Sentinel Contracts

This package freezes the H2 Sentinel competition contract surface for downstream
Analytics, Plugin, Web, QA, and Submission tracks.

It intentionally contains only TypeScript contracts, JSON Schemas, sanitized
fixtures, fixture-sized CSVs, and conformance tests. It does not include the
official dataset, analytics implementation, UI code, root wiring, or runtime
dependencies.

## Contract Surface

- Dataset identity and field manifest: `H2DatasetManifest`
- Data quality status and blocking/warning checks: `H2DataQualityReport`
- C01-C07 anomaly codes, required subtypes, severity, evidence, impact, safety,
  recommendations, and review state: `H2AnomalyEvent`
- Provenance vocabulary: `FIXTURE`, `LIVE_ANALYSIS`, `DERIVED`, `MODEL`,
  `RULE`, and `LLM_RENDERED`
- Assistant request and answer contracts for the official `Q01`-`Q10`
  questions, including the `Q09` generated-report invariant
- Append-only local event-review requests, entries, projections, receipts, and
  audit-export contracts with optimistic concurrency and idempotency
- Report descriptors and request-scope schemas for HTML, JSON, CSV,
  validation, PCC daily compliance, quality, and review-audit artifacts
- Exact `submission.csv` row type, column order, row mapping, and serializer
- `H2SentinelDataSource`, the only Web-facing data source interface
- API envelopes for success, warning, and redacted-error responses

## Invariants

- Event `startTime`, `endTime`, and `firstDetectionTime` are independent fields.
- Anomaly code, subtype, and primary impact metric are a single correlated
  contract in both TypeScript and JSON Schema.
- Safety checks may be `unknown` when evidence is unavailable; that state is
  distinct from a passed check.
- `confidence` is normalized to `0..1`.
- Every operational recommendation is advisory and carries
  `requiresHumanConfirmation: true`.
- Human review changes only the projected `reviewState`; it does not change
  detector evidence, impact, provenance, or submission mapping.
- Fixture provenance is explicit and must not be represented as live analysis.
- Fixture CSV files are checked out with LF endings so byte-level dataset
  fingerprints remain stable when Git uses `core.autocrlf=true` on Windows.
- JSON fixtures under `fixtures/` are synthetic and sanitized. They are not an
  official competition dataset or score artifact.
- The submission header is exactly `H2_SUBMISSION_COLUMNS` in source order.

## Official Vocabulary and Fixture

The contract package reads the frozen 69-field vocabulary from
`packages/h2-vocabulary`. The sanitized 22-row fixture uses the same canonical
header and retains explicit `FIXTURE` provenance; deprecated names exist only
in the reviewed compatibility map. Its C04 sample contains eight inclusive
one-minute rows at 1,400 kW against a 500 kW export limit, so the deterministic
fixture impact is `8 * (1400 - 500) / 60 = 120 kWh`.

Event severity remains the stable API enum (`low`, `medium`, `high`,
`critical`). The submission mapper separately emits the official Chinese
severity and control-object vocabulary plus the frozen comma-separated
equipment tokens, while keeping the exact 16-column order.

## Data Source Modes

- Fixture mode returns deterministic, explicitly `FIXTURE`-provenanced data and
  remains usable without CSV import or network access.
- Live analysis imports CSV through `importCsv({ filename, text })`; the port
  accepts neither filesystem paths nor browser `File` or `Blob` objects.
- Import returns the dataset manifest and visible quality result together.
  Consumers can query that quality report by dataset ID before calling
  `runAnalysis(datasetId)`.
- Report exports return a serializable artifact containing descriptor, media
  type, and string content. Period summaries may provide a canonical time
  range; exports never expose a local path or URL.
- Review consumers rehydrate history with `getEventReview(runId, eventId)` and
  mutate it with `reviewEvent(request)`. `requestId` replay is exactly-once and
  `expectedRevision` prevents lost updates.

## Focused Verification

Run from the repository root after installing root dependencies:

```bash
npm ci
npm run typecheck
node --import tsx --test "packages/h2-contracts/test/*.test.ts"
git diff --check
```

If integration later adds root package exports, keep this contract package
source-compatible and route breaking changes through a Contract Change Request.
