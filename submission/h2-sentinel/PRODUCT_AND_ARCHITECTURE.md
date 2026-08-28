# H2 Sentinel: P1 Product and Architecture

## Product boundary

H2 Sentinel / 氢哨 turns an H2 EMS anomaly candidate into a reviewable chain:
source provenance, synchronized evidence, bounded diagnosis, exact impact,
safety checks, human review, deterministic Chinese explanation, and auditable
exports.

It is not an EMS replacement or autonomous controller. It does not issue
equipment commands, change setpoints, or treat language output as an action.
Every operational recommendation requires human confirmation.

## Local architecture

    explicit Fixture route
      -> in-process sanitized Fixture adapter
      -> deterministic regression data and reports

    explicit Local route
      -> same-origin H2 API proxy
      -> literal-loopback analytics sidecar
      -> import -> quality -> deterministic analysis
      -> immutable events + separate append-only review journal
      -> assistant/report/audit/submission exports

The Web consumes one H2SentinelDataSource boundary. Fixture and Local adapters
must expose the same question, review, and report behavior while preserving
different provenance. The launcher owns only processes it starts; external
sidecars remain unowned and must satisfy the complete canonical health
contract.

## P1 judge workflow

The official assistant surface uses Q01 through Q10 and deterministic Chinese
templates. Q03 and Q09 require event context; Q09 returns exactly one matching
Chinese single-event diagnosis report. The compatibility flag for LLM rendering
does not change the result or trigger network/model access.

Human review overlays an immutable detector event. Request IDs provide replay
idempotency, expected revisions prevent silent concurrent overwrite, and
reopen makes decision reversal explicit. The audit export retains every event,
including those at revision zero. Review history never enters the frozen
16-column competition submission.

Judge-facing HTML is UTF-8 Simplified Chinese with stable English machine IDs,
exact values/units, provenance, escaped untrusted input, and a no-control safety
statement. Missing labels or quota evidence is shown as unavailable rather than
as a fabricated zero.

## Public-validation slice boundary

The primary P1 demo is designed around the chronologically earliest public C04
validation event:

1. An explicit tool verifies the official timeseries and label source hashes.
2. It creates a detector CSV from 30 minutes before event start through 30
   minutes after event end.
3. Recognized label columns are removed from detector input.
4. Overlapping public labels remain only in an ignored QA manifest.
5. A final receipt validator checks two distinct consecutive measured runs,
   their artifact hashes, and the exact integrated commit.

This is bounded validation-slice evidence. It is not full validation, a hidden
test, an organizer score, deployment proof, or production proof.

## Current evidence and remaining gates

W1 contracts/backend, W2 Web/runtime behavior, P1-W3 QA, and the cross-track
provenance correction are integrated. The final assembled runner passes all six
groups; TypeScript, Python, repository, launcher, and production-build checks
also pass. Primary Fixture flows were inspected at desktop and 390x844 widths.

The provenance correction preserves a prepared-slice filename alongside the
analytics source so assembled Local QA renders
LIVE_ANALYSIS · 验证集切片 rather than generic local input. The official
package was inspected only through a bounded read-only integrity check: all
data/material entries plus the workbook match, 21 of 24 total manifest
entries, while three top-level requirement/README Markdown or DOCX files
differ. No official runtime artifacts or timed receipt were generated, so
this automated result is not a claim that the primary validation demo ran.

## Evidence sources

- [P1 API contract](../../docs/competition/h2-sentinel/P1_API_CONTRACT.md)
- [P1 execution specification](../../docs/competition/h2-sentinel/P1_EXECUTION_SPEC.md)
- [P1 QA acceptance matrix](../../tests/h2-sentinel/ACCEPTANCE_MATRIX.md)
- [P1 QA script contract](../../tests/h2-sentinel/scripts/README.md)
- [Claims ledger](CLAIMS_LEDGER.md)
- [Runtime evidence checklist](RUNTIME_EVIDENCE_CHECKLIST.md)
