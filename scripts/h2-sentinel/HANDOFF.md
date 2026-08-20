# H2 Sentinel H6 Integration Handoff

## Identity and boundary

- Gate: `H6` integration and packaging.
- Branch: `competition/h2-sentinel`
- Frozen base: `b706678123461f407ca89d905cac920b007a17ba`
- Integration scope: root composition, launcher, Vite boundary, root scripts,
  H2 CI, ignores, notices, and focused H6 verification only.
- No commit targets `main`. No H0-H5 worker-owned implementation path was
  modified.
- `package-lock.json` is unchanged because H6 added no dependency.
- No `.env`, credential store, secret, official competition dataset, model, or
  generated report is committed.

## Archive commits

| Commit | Purpose |
| --- | --- |
| `aff53241ac5a65a0d340ebe7534df1c2eac30903` | Register explicit H2 entry, fixed loopback Vite boundary, H2 build/check scripts, and integration specification. |
| `b9a50da6e02941da4badfe69fc84eae618e2a833` | Catch invalid H2 configuration inside the startup promise and lock the closed entry contract. |
| `f752c8f3295f891069ab074ec14a11b6ff408fc5` | Add the foreground launcher, thin Windows/shell wrappers, focused tests, and real launcher smoke. |
| `74f4644abac07f6256521c5e01e9e4f060e6c668` | Add H2 root checks and Linux/Windows CI. |
| `2df6538d77c66ba183a87ac32679cb9afcea0a07` | Add exact H2 ignores and third-party inventory/notices. |
| `4b5523744bd491a905c50a1280df30505beb55bc` | Harden redirect, signal, canonical URL, bind-race, shell path, and launcher failure boundaries. |

The final handoff-document commit SHA is reported by the coordinator response;
this file does not claim its own not-yet-created Git object ID.

## Composition contract

- `/` and every path other than the two H2 literals retain the generic Fixture
  Demo.
- `/h2-sentinel?mode=fixture` and `/h2-sentinel/?mode=fixture` statically
  register `h2EmsPlugin`, resolve `H2_EMS_DATA_SOURCE`, and render
  `H2SentinelApp`. This path starts no Python process.
- `/h2-sentinel?mode=local` and `/h2-sentinel/?mode=local` statically register
  `createH2EmsPlugin({ enabled: true, baseUrl: window.location.origin })`.
- Unknown query keys, duplicate/missing `mode`, and modes other than `fixture`
  or `local` fail closed into the Chinese startup alert.
- Both modes start the static plugin runtime before resolving the service and
  stop it from the one-shot `pagehide` handler.

## Network and launch contract

- Vite development and preview bind to `127.0.0.1` with `strictPort: true`.
- `.env` loading is disabled with `envDir: false`.
- The only proxy namespace is `/api/v1/h2-sentinel`; its target is constructed
  only as `http://127.0.0.1:<validated-port>`.
- `start-h2-sentinel.bat` and `start-h2-sentinel.sh` are thin wrappers around
  `scripts/h2-sentinel/launch.mjs`.
- The launcher accepts closed values for `--mode fixture|local` and
  `--web-runtime dev|preview`, bounded numeric ports/timeouts, `--ready-json`,
  and an optional exact canonical
  `http://127.0.0.1:<port>/` external-sidecar URL. It accepts no command,
  executable path, filesystem path, hostname, or general URL option.
- Local mode uses
  `uv run --locked --extra dev python -m h2_analytics --port <port>` from the
  accepted analytics project. It waits for HTTP 200 without redirect and
  accepts only the exact closed H0 success envelope plus the closed H1 health
  fields and provenance: the canonical namespace, literal `127.0.0.1`, stable
  version fields, and matching rule/configuration versions. Minimal envelopes,
  wrong namespaces, `localhost`, extra top-level fields, and redirects never
  produce `READY`.
- A ready record contains `event`, `mode`, `webUrl`, `analyticsUrl`, `webPid`,
  and `analyticsPid`. Every emitted URL uses literal `127.0.0.1`.
- Owned child trees are cleaned on startup failure, IPC-controlled smoke
  shutdown, `SIGINT`, or `SIGTERM`. Windows uses `taskkill /PID <pid> /T /F`,
  as a fallback around a closed Analytics/Web-only Job Object wrapper. The Job
  is configured with kill-on-close before its fixed child is created suspended;
  assignment must succeed before the child resumes. Wrapper and managed PIDs
  remain distinct internally while `READY` retains only the managed `webPid`
  and `analyticsPid`. POSIX uses a detached process group with TERM/KILL fallback.
- Owned processes publish persistent terminal state from spawn. Analytics health,
  Web readiness, the pre-`READY` gate, and steady state race every owned child,
  so an Analytics exit after health cannot be missed while Web starts. External
  sidecars never enter this ownership set.

## Reproduction commands

```text
npm run dev
npm run h2:fixture
npm run h2:local
npm run h2:build
npm run h2:preview:fixture
npm run h2:preview:local

start-h2-sentinel.bat --mode fixture
start-h2-sentinel.bat --mode local --ready-json
./start-h2-sentinel.sh --mode fixture
./start-h2-sentinel.sh --mode local --ready-json
```

The launcher defaults to Web port `5173` and analytics port `8765`. Use
`--web-port` and `--analytics-port` with values from `1024` through `65535` to
select different loopback ports.

## Verification on 2026-08-19

| Command or check | Result |
| --- | --- |
| `npm ci` | Passed; 31 locked packages installed. |
| `npm run typecheck` | Passed with strict TypeScript. |
| `npm run test` | Passed through `npm run check`; 92 repository tests. |
| `npm run build` | Passed; 684 modules. JavaScript was 900.01 kB minified / 297.15 kB gzip and CSS was 47.44 kB. Vite reported the known large-chunk warning. |
| `npm run check` | Passed; typecheck, 92 repository tests, and the 684-module production build. |
| `npm run h2:build` | Passed; production H2 composition included in the Web bundle. |
| `npm run h2:check` | Passed; typecheck, 60 focused H2 tests, five assembled QA groups, 9 launcher/composition tests, and the 684-module build. |
| `npm run h2:smoke` | Passed; all 9 scenarios: Fixture no-analytics/cleanup, occupied Web, redirect rejection, malformed health lookalikes, canonical external sidecar ownership, occupied analytics, owned Analytics exit after health/before `READY`, Local golden/export/cleanup, and production-preview proxy. |
| `uv lock --check` | Passed; 36 locked packages resolved. |
| `uv sync --locked --extra dev` | Passed; 30 packages checked. |
| `uv run --locked --extra dev python -m pytest` | Passed; 32 tests, with one upstream Starlette `httpx` deprecation warning. |
| `python -m h2_analytics.tools.smoke_golden` through locked `uv run` | Passed; C03/C04, corrected C04 impact, two submission rows. |
| `python -m h2_analytics.tools.validate_submission artifacts/submission.csv` through locked `uv run` | Passed; exact 16 columns and two rows. |
| H6 Local same-origin golden smoke | Passed; deterministic no-LLM answer, C03 HTML report, `submission.csv`, Python submission validator, READY PID exit, and both ports rebound. |
| `pwsh -NoProfile -File submission/h2-sentinel/scripts/validate-submission.ps1` | Passed; 10 documents, 10 narrative pages, local links, and placeholder scan. |
| Chrome manual visual review | Desktop and 390x844 Fixture overview/C03/C04 rendered; provenance, human-confirmation boundary, and corrected 29.33 kWh were visible; document width did not overflow. Generic `/` stayed generic. Invalid mode and `localhost` Local entry showed the Chinese startup alert. |
| Post-smoke residue audit | No H2 integration Node/Python/uv/esbuild process or owned listener remained. |

## Post-assembly status and remaining limitations

- Local analytics now maps all six report kinds to their closed formats:
  single-event diagnosis, period summary, and quality are HTML; analysis result
  and validation metrics are JSON; submission is CSV. Fixture single-event,
  period, and quality reports likewise produce deterministic safe HTML.
- The Live plugin exposes exactly 12 fixed `/api/v1/h2-sentinel` routes. Deep
  fail-closed validation checks the complete nested envelopes, provenance,
  request identity, cross-object correlations, series integrity, report format
  and hash, and assistant citation integrity before data reaches the UI.
- The assembled QA runner reports five automated groups as `PASS`, with zero
  `FAIL`. Visual verification remains manual; this handoff does not claim an
  automated screenshot regression suite or a formal screenshot artifact.
- The final candidate passes 92 repository tests, 60 focused H2 tests, 32 Python
  tests, and 9 launcher/composition tests. Its 684-module production bundle is
  900.01 kB minified / 297.15 kB gzip for JavaScript and 47.44 kB for CSS. Vite
  retains its standard greater-than-500-kB warning; no speculative split or new
  dependency was added during composition.
- The verified H2 path is read-only. The deterministic assistant uses no LLM,
  and neither Fixture nor Local mode executes a control action.
- No official dataset, official validation metric, organizer score, deployment,
  or production remote-host behavior was tested or claimed.
- The H2 workflow is committed, but no remote GitHub Actions result is claimed
  as current runtime evidence and no general network-isolation proof exists.
- Manual Chrome review is visual evidence from this worktree; no formal
  screenshots were committed.

## Write-set and memory

The H6 diff is limited to the explicit integration allowlist. Generated
`apps/web/dist`, analytics/H6 artifacts, `.venv`, model, report, and official-
data locations are ignored and absent from Git.

Root `MEMORY.md` was read but not updated because H6 explicitly denies writes to
that file. Durable H6 facts are recorded in this handoff instead.
