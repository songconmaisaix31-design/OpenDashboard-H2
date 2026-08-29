# H2 Sentinel Remediation QA Evidence

## Evidence boundary

This ledger separates three evidence classes:

1. historical worker observations from pre-integration checkouts;
2. current integrated P1 contract/runtime facts covered by repeatable QA; and
3. final-candidate official-data evidence that only the coordinator can create.

No historical test count, screenshot, report number, or candidate SHA is
carried forward as proof for the final candidate.

## Current integrated P1 facts

The repeatable P1 QA contract requires:

- exact official Q01-Q10 prompts and rejection of legacy question aliases;
- deterministic Chinese Q09 diagnosis with matching citations and report;
- append-only review transitions, replay idempotency, stale-revision conflict,
  and detector/submission immutability;
- complete review-audit export and exact review-free 16-column submission;
- prepared-slice, generic Local, and Fixture provenance separation;
- loopback-only launcher ownership, failure cleanup, and port rebind; and
- Chinese report structure, escaping, safety wording, and content hashes.

`npm run h2:qa` is the mandatory integrated regression gate for these facts.
Its assembled runner validates response and artifact bytes without persisting
process identifiers, absolute paths, credentials, or raw startup output.

## Lane C remediation evidence

Lane C adds deterministic tools and fixtures for:

- the exact official 69-field detector vocabulary;
- earliest-C04 slice preparation with exact source hashes, inclusive
  30-minute padding, public-label exclusion, and relative paths;
- C01-C07 event-level evaluation and per-class metrics;
- an independent train-window overfit sentinel;
- exact affected-equipment tokens in the official 16-column submission;
- a full public test-set offline smoke; and
- two scripted executions covering import, analysis, evidence read, review,
  Q09 diagnosis, review audit, and submission export.

Synthetic fixtures prove the tools' fail-closed behavior. They are not
official metrics, a measured demonstration, or an organizer result.

## Official-package integrity boundary

A bounded read-only integrity check found that all data/material entries plus
the workbook match: 21 of 24 total manifest entries. The three top-level
requirement/README Markdown or DOCX files differ from their manifest records.
The package remains read-only, and the differing documents cannot support
runtime or source-integrity claims.

## Historical worker findings

Pre-W2 worker checkouts reported legacy H2Qxx presentation, an English Fixture
diagnosis, and generic provenance for a prepared slice. Those were true
failures in the named historical checkout; later integration superseded them.
They are retained for traceability and must not be restated as current product
defects or converted into current passes.

## Final coordinator gates

After all lanes are integrated, the coordinator must use one clean exact SHA
to rerun repository/H2/Python/build/launcher checks, official validation
evaluation, the overfit sentinel, the full test-set offline smoke, the two-run
demo and receipt validator, and desktop plus 390x844 visual inspection. The
official metrics, retained screenshots, measured receipt, checker verdict,
and final candidate SHA remain unclaimed until those reruns complete.
