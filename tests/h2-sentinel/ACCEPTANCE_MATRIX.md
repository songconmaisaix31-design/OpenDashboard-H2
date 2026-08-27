# H2 Sentinel P1 QA Acceptance Matrix

## Invocation and scope

    npm run h2:qa

The QA runner starts the product only through the public launcher, allocates
ephemeral loopback ports, validates in-memory responses/artifacts, and cleans
owned processes. It writes no runtime artifact. Slice/receipt tests create only
temporary synthetic files under the ignored generated tree and remove their
case directories.

| ID | Acceptance focus | Automated evidence | Current P1-W3 status |
| --- | --- | --- | --- |
| C01 | Exact official Q01–Q10 order and Chinese prompts; no H2Qxx contract alias | p1-contract-conformance.test.mjs | PASS |
| C02 | Review actions, request/revision bounds, unverified actor notice | p1-contract-conformance.test.mjs | PASS |
| C03 | Eight report kinds and frozen review-free 16-column submission | p1-contract-conformance.test.mjs plus submission-conformance.test.mjs | PASS |
| T01 | Explicit package files/hashes, earliest C04, 30-minute padding, label isolation, ignored output | p1-validation-tools.test.mjs | PASS with synthetic package; no official package processed |
| T02 | Exactly two consecutive measured runs below 180 seconds, manifest/artifact hashes, truthful claims | p1-validation-tools.test.mjs | PASS with synthetic receipts; no real timed receipt produced |
| A01 | Fixture launcher ownership and Chinese P1 report | public Fixture launcher plus adapter export | FAIL until W2: current Fixture report remains English |
| A02 | Local Live import, Q01–Q10, citations, Q09 report, context errors, alias rejection | public loopback analytics API | Assertions execute before A05; group remains unaccepted until all P1 assertions pass |
| A03 | All review transitions, replay, stale revision, request-ID conflict, required note, forbidden transition | public review GET/POST routes | Assertions execute before A05; group remains unaccepted until all P1 assertions pass |
| A04 | Audit includes revision-zero event; detector event and submission bytes remain unchanged | public report/submission APIs | Assertions execute before A05; group remains unaccepted until all P1 assertions pass |
| A05 | Validation-slice provenance is visible in Chinese reports | Live import named as a validation slice | FAIL: analytics currently renders generic LIVE_ANALYSIS · 本地导入数据; cross-track fix required |
| A06 | Chinese HTML structure, escaping, safety, exact hash, no fake validation metrics | seven available report kinds plus explicit metrics-unavailable error | Assertions execute before A05; final integrated rerun required |
| A07 | W2 uses official questions, review methods/UI, local-unverified notice, new report kinds, validation label | production Web/plugin source gate | FAIL until W2 integration |
| A08 | Loopback Host/Origin, occupied ports, redirect/lookalike health rejection, cleanup | launcher and raw HTTP probes | PASS in current P1-W3 execution |
| M01 | Desktop and 390x844 layout, loading/disabled/error/conflict states, downloads | coordinator visual inspection | MANUAL REQUIRED |
| D01 | Two real validation-slice runs on final SHA | receipt validator plus exact local artifacts | NOT RUN; official package not supplied |

## Required final interpretation

The final candidate is accepted only when every automated row is green from one
clean integrated commit, M01 is recorded separately, and D01 passes twice. A
worker pass, historical H6 run, Fixture flow, HTTP 200, route declaration, or
document review cannot substitute for those gates.
