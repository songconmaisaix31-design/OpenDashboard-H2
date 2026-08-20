# H2 EMS plugin handoff

## Scope

- Branch: `songconmaisaix31-design/h2-plugin`.
- Immutable Wave 1 gate: `f9dd7df83a81da57fdaa2b03cd67470c8c7a22c4`.
- Owned paths: `plugins/h2-ems/**` only.

## Integration surface

The integration track should register `h2EmsPlugin` for Fixture mode, or call
`createH2EmsPlugin({ enabled: true, baseUrl: 'http://127.0.0.1:<port>/' })`
for explicit local mode. The factory validates the literal loopback URL before
creating a plugin definition; it does not modify the static plugin runtime.

The exported `H2_EMS_LIVE_ROUTES` constants use the required
`/api/v1/h2-sentinel` namespace. Analytics and QA must keep endpoint parity with
these constants; no arbitrary route is accepted by this adapter.

## Boundaries and limitations

- The plugin is trusted Tier 1 code; manifest capabilities are audit metadata,
  not sandbox enforcement.
- Fixture mode performs no request and cannot import external CSV data.
- Live mode is opt-in, loopback-only, timeout/cancellation aware, and returns
  stable redacted errors rather than raw server details.
- This track does not wire `main.tsx`, start the analytics service, or control
  equipment/processes.

## Verification evidence

- `npm ci` completed from the locked root dependencies.
- `npm run typecheck` passed.
- At the original Wave 1 handoff, `npm run test` passed 54 tests, including Fixture, static registration,
  invalid URL, malformed response/redaction, timeout/cancellation, local-mode
  factory, provenance, and report artifact assertions.
- `npm run build` passed through `npm run check`.
- `git diff --check` passed before the implementation archive commit.

## Archive commits

- `4829318 feat(h2-plugin): add validated H2 EMS adapters`

The final documentation commit and both commits' pushed remote head are recorded
in the worker completion report after push succeeds.

## Follow-up browser and series correction

- Replaced the Fixture artifact hash implementation with platform-native
  `globalThis.crypto.subtle.digest`; no plugin source imports a Node runtime
  module.
- Bundled the 22 sanitized canonical minute points in the Fixture adapter. Series
  requests validate variables, unique selection, event identity, and time bounds
  before returning only the requested fields.
- Regression coverage verifies C03 direction/PCC values, C04's eight inclusive
  violation points, and `8 * (720 - 500) / 60 = 29.333333333333332 kWh`.
- A Vite library build of `plugins/h2-ems/src/index.ts` confirms that the public
  browser bundle has no `node:crypto` or `createHash` import and retains
  `crypto.subtle.digest`.

## Post-assembly remote trust-boundary hardening

- Every Live route now validates the complete closed envelope and its nested
  H0 contract before returning data. Unknown fields, enum values, missing
  members, non-finite/out-of-range numbers, malformed provenance, invalid ISO
  timestamps, reversed ranges, and invalid event time order fail closed with
  the stable redacted `remote_response_invalid` error.
- Event validation imports the H0 anomaly codes, subtype/impact correlation
  helpers, severities, provenance modes, and assistant question vocabulary.
  Runtime enum constants that H0 does not yet export remain small local arrays
  checked with `satisfies` against the canonical H0 union types. A future H0
  runtime-vocabulary export or schema-code generation pass can remove those
  arrays without changing this adapter's validation surface.
- Dataset manifests require a plain CSV basename using the analytics ingestion
  rules, matching mode/provenance and fingerprint metadata. Import and analysis
  composites require matching dataset identity, row count, time range, and
  exact event counts by code and severity.
- Responses are bound to their request identity for quality, analysis,
  overview, event, series, assistant, report, and submission calls. Assistant
  responses also preserve the no-LLM request policy and the refused-control
  boundary, preventing a structurally valid replay from changing UI claims.
- H0 types do not explicitly require series point keys to equal `variables`,
  points to stay inside the requested interval, or points to be ordered. The
  Live boundary enforces those three invariants so a valid-shaped replay cannot
  mislabel or reorder chart data. H0 also does not state assistant citation
  uniqueness/referential integrity; the boundary requires unique citation IDs
  and resolves every section citation before rendering evidence.
- Report validation correlates kind, format, media type, filename extension,
  status, run/event request identity, and recomputes `contentHash` with the
  shared browser-safe SHA-256 helper before the artifact reaches the UI.
- CSV import responses are bound to the exact request filename and the
  SHA-256 digest of the exact UTF-8 request text. The browser helper emits the
  same lowercase `sha256:<hex>` value as analytics ingestion; mismatches and
  digest failures use the stable redacted `remote_response_invalid` error.
- Every Live request disables automatic redirects. Real fetch responses that
  report a redirect or a nonempty final URL on another origin fail closed, so
  a 307 response cannot forward an import body to another loopback service.
  Empty response URLs remain supported only for injected test seams.
- Quality summaries reproduce the analytics aggregation contract: check status
  and severity must correlate, top-level status uses blocked-before-warning
  precedence, and warnings/blocking reasons are exact ordered projections of
  the checks.
- Event evidence, safety-check, and recommendation identifiers must be unique.
  Every impact, safety, and recommendation reference must be unique and resolve
  within the event before the payload reaches the UI.
- Event arrays require a unique `eventId` after every event passes its deep
  guard. This applies to run and list responses; evidence, safety-check, and
  recommendation IDs intentionally remain scoped to their containing event.
- Dataset, quality/check, run, event, evidence, impact, safety, and
  recommendation provenance must retain the same mode and dataset fingerprint.
  These semantic checks mirror the current analytics construction path while
  preserving H0's closed structural validation.
- Assistant section and citation IDs are unique; each section has a nonempty,
  unique, fully resolved citation list, every citation is used, and explicitly
  event-scoped sources remain on the answer event. H0 permits mixed citation
  claim kinds within one section, so the Live guard intentionally does not
  infer a claim-kind correlation that the canonical fixture does not define.
- Validators are separated into endpoint, anomaly, report, and primitive
  modules. No validation dependency or Node runtime import was added.
- Final branch verification passed `npm run h2:test` (59 tests), `npm run
  check` (91 tests plus the 684-module production build), and `npm run
  h2:smoke` (nine launcher and real analytics compatibility scenarios). The
  build retains the existing chunk-size warning; it has no validation failure.

The optional series `eventId` request binding and period-report `timeRange`
binding remain under final-audit review and are not claimed by this follow-up.
