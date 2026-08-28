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

The latest integrated pre-documentation baseline passed 132 repository tests,
117 focused H2 tests, 75 H2 contract QA tests, five static-asset QA groups, six
assembled-runtime QA groups, and nine launcher/composition tests. The locked
Python suite passed 169 tests, Ruff, and Mypy across 45 source files. The
686-module production build emitted CSS at 55.13 kB / 10.83 kB gzip, the H2
chart renderer at 175.93 kB / 58.40 kB gzip, main at 386.83 kB / 116.50 kB
gzip, and the H2 chart runtime at 400.26 kB / 136.36 kB gzip, with no
greater-than-500-kB warning. `npm run h2:smoke` passed all nine scenarios.

The read-only official-package audit matched all data/material entries plus the
workbook, or 21 of 24 total manifest entries. Three top-level
requirement/README documents differ, so this evidence does not describe the
package as pristine. Local public-data verification produced TP=69, FP=3,
FN=1, precision 0.9583333333, recall 0.9857142857, F1 0.9718309859, mean
first-detection delay 7.7826 minutes, mean start/end absolute error
3.3623/2.7971 minutes, and correct classification for all 69 matched events.
Per-code F1 was 0.9 for C01, 0.90909 for C04, and 1.0 for
C02/C03/C05/C06/C07. The disjoint train-last-90-day sentinel was green with
absolute F1 delta 0.0120399818 (validation 0.97183 versus train 0.98387).

The full public test smoke verified 172,800 rows and 69 detector fields,
produced 98 events (C01=10, C02=14, C03=14, C04=17, C05=14, C06=15,
C07=14), exported exactly 16 columns and 98 rows, and passed the checker. The
directed C04 slice verified the complete source and selected VA0034 with 117
detector rows while keeping labels out of detector input. Two scripted local
demo executions and the independent receipt validator passed with all
unsupported-claim flags false. Desktop and iPhone 12 visual QA covered all six
Fixture routes; Local empty/loading/error theme tokens were corrected. The
visual evidence remains local and Fixture-bounded.

Generated evidence and its recorded commit SHA form one atomic claim. The
values above are the latest pre-documentation local baseline, but this tracked
documentation change creates a new candidate SHA. The coordinator therefore
regenerates the ignored evidence on the exact final clean SHA after this commit;
the pre-documentation SHA is not the final candidate and measured timing values
are intentionally not frozen here.

H2 is read-only, uses no LLM for the verified deterministic path, and executes
no control action. The evidence above is local public-data, pipeline, contract,
and visual evidence; it is not an organizer score, hidden-test result,
deployment, production, remote-CI, clean-machine, or general network-isolation
claim. The supplied materials contain no authoritative D01-D13 mapping or
weight table, so no official completion score can be derived. Remaining gaps
include the intentional split required by the 96 MiB/180,000-row import cap,
broad equipment localization, deterministic rather than fully causal root-cause
text, bounded follow-up routing, and the absence of clean-machine or external
runtime proof.
