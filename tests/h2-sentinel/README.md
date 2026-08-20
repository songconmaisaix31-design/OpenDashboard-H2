# H2 Sentinel Independent QA

This directory is the independent H2 Sentinel black-box QA lane. Its tests
consume frozen contract assets and public runtime boundaries; they do not modify
analytics, plugin, Web, integration, or submission code.

## H0 contract gate

Run from the repository root:

```bash
node tests/h2-sentinel/run-contract-qa.mjs
node --test "tests/h2-sentinel/contract/*.test.mjs"
git diff --check
```

The first command starts the assembled launcher after C01-C04 pass. It is the
authoritative A01-A08 execution command and emits a redacted JSON evidence
record. `npm run h2:qa` invokes the same command through the approved root
script. The repository's TypeScript contract-owner suite is additional evidence,
not a substitute for public-runtime checks.

## Public-runtime evidence

The assembled runner uses only the published H6 launcher and HTTP API. It
allocates loopback ports, parses `READY`, and shuts down via its IPC contract.
It validates Fixture-no-Python, Local health and bind policy, import/analyze/
events, deterministic assistant fallback, all six report kinds and their
format/media/extension/hash contracts, quality HTML and validation JSON
semantics, exact CSV, redacted errors, occupied-port and redirect timeout
failures, external-sidecar health lookalikes, PID exit, and port rebind. It
writes no generated artifact.

```bash
node tests/h2-sentinel/assembled/run-assembled-qa.mjs
```

The older `api/` and `golden-path/` probes remain useful targeted diagnostics,
but they are not release evidence because they depend on manually supplied URLs.

## Visual boundary

No browser-automation dependency is introduced in this QA lane. The automated
gate verifies only HTTP reachability and source-level entry/navigation facts.
Coordinator manual review remains required for Fixture desktop and 390 px
widths: six-page navigation, C03/C04 rendering, Fixture/Live provenance,
Chinese startup alert, overflow, overlap, clipping, and primary-action
visibility. Record that result separately from automated PASS/FAIL; do not
describe it as screenshot regression automation.

See `ACCEPTANCE_MATRIX.md` for the complete H0/assembly separation and
`DEFECT_LOG.md` for the mandatory defect record format.
