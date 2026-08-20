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
- Assistant question and answer contracts for the ten official questions
- Report descriptors for HTML, JSON, CSV, validation, and quality artifacts
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
- Fixture provenance is explicit and must not be represented as live analysis.
- Fixture CSV files are checked out with LF endings so byte-level dataset
  fingerprints remain stable when Git uses `core.autocrlf=true` on Windows.
- JSON fixtures under `fixtures/` are synthetic and sanitized. They are not an
  official competition dataset or score artifact.
- The submission header is exactly `H2_SUBMISSION_COLUMNS` in source order.

## CCR-H4-001 Correction

The C04 fixture's `pcc_power_limit_violation_energy_kwh` is
`29.333333333333332`. The previous `86.5` value incorrectly overstated the
impact. The authoritative C04 calculation uses the eight inclusive one-minute
samples from `2026-01-05T10:32:00Z` through `2026-01-05T10:39:00Z`: each has
`pcc_power_kw=720` and `pcc_export_limit_kw=500`, so the evidence is
`sum(max(720 - 500, 0) / 60) = 29.333333333333332 kWh`. The CSV and its LF
byte fingerprint are unchanged; the JSON and TypeScript C04 evidence and impact
representations are corrected together and covered by a focused regression test.

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
