# H2 Sentinel Integration Specification

## Scope

H6 composes the accepted H0-H5 modules without changing worker-owned source.
The generic Fixture Demo remains the default application. H2 Sentinel is
available only from the two explicit, equivalent `/h2-sentinel` and
`/h2-sentinel/` path literals with a closed `mode=fixture|local` query value.

## Acceptance criteria

- Fixture mode registers `h2EmsPlugin`, starts no Python process, resolves
  `H2_EMS_DATA_SOURCE`, and renders `H2SentinelApp`.
- Local mode registers `createH2EmsPlugin({ enabled: true, baseUrl:
  window.location.origin })` and reaches analytics only through the fixed
  same-origin `/api/v1/h2-sentinel` proxy.
- Web development and preview listeners bind to `127.0.0.1` with strict ports.
  The proxy target is constructed only from a validated analytics port and is
  always `http://127.0.0.1:<port>`.
- The launcher owns foreground child processes, waits for the canonical health
  success envelope, emits one machine-readable ready record, and cleans its
  complete child process trees on failure or shutdown. Health readiness requires
  the exact closed H0 success envelope plus the closed H1 health fields and
  provenance: canonical namespace, literal `127.0.0.1`, stable versions, and
  matching rule/configuration versions. Minimal lookalikes, wrong namespaces,
  `localhost`, extra top-level fields, and redirects fail closed.
- Every owned spawn records a persistent terminal state immediately. Analytics
  health, Web readiness, the pre-`READY` gate, and steady state observe all owned
  children. On Windows, a closed role-only Job Object wrapper assigns the fixed
  Analytics or Web child before resuming it and uses kill-on-close ownership, so
  an exited wrapper cannot orphan its descendants. POSIX retains detached process
  groups. External sidecars remain outside launcher ownership.
- Fixture launch does not require `uv`, Python, an analytics listener, or an LLM
  credential. Local launch uses the committed `uv.lock` environment.
- No launcher option accepts a command, executable path, filesystem path,
  hostname, or arbitrary URL. The optional external sidecar URL accepts only
  `http://127.0.0.1:<port>/` and is never treated as an owned process.
- Local analytics maps all six report kinds to their closed formats:
  single-event, period, and quality reports are HTML; analysis and validation
  reports are JSON; submission export is CSV.
- The Live plugin exposes exactly 12 fixed namespace routes. Every response is
  deeply validated against its closed contract and request identity before it
  reaches the UI; malformed or inconsistent remote data fails closed.

## Risks and controls

- **Network exposure:** fixed loopback bind, strict ports, closed proxy target,
  and literal-loopback validation.
- **Process leaks:** platform-specific process-group or Windows PID-tree cleanup
  with focused shutdown and failure smoke tests.
- **Configuration injection:** argument arrays only; no shell command strings,
  `.env` loading, dynamic imports, or user-selected process commands.
- **Claim drift:** Fixture and Live provenance remain supplied by the accepted
  data sources; generated artifacts are test evidence and stay ignored.

## Verification

Run root npm checks (92 repository tests), H2 checks (60 focused tests, five
assembled QA groups, nine launcher/composition tests, and the 684-module
production build), locked `uv` checks and 32 Python tests, golden and submission
validation, all nine launcher fixture/local/failure/shutdown smoke scenarios,
visual checks at desktop and narrow widths, `git diff --check`, and the H6
write-set audit before handoff.

The verified bundle remains 900.01 kB minified / 297.15 kB gzip for JavaScript
and 47.44 kB for CSS, so Vite's greater-than-500-kB warning remains an accepted
limitation rather than a passing performance claim. H2 is read-only, uses no LLM
for the verified deterministic path, and executes no control action. Verification
does not establish official data, validation metrics, organizer score,
deployment, remote CI, formal screenshots, or general network isolation.
