# P2 B-Line Delivery Specification

## Purpose

Establish the additive contracts that let the B-line implement full training-file import, bounded natural-language routing, optional LLM rendering, and seven anomaly-chart configurations without changing P1 detection or evidence semantics.

## Acceptance criteria

- The source commit is `f61f99681462195f3d73af6d797e561ba47dc839`.
- Existing `H2SentinelDataSource`, Q01-Q10, Q09 report generation, review journal, provenance, and 16-column submission contracts remain valid without consumer changes.
- Streaming import uses a server-created session, accepts only the next ordered chunk, permits only byte-identical retries, and finalizes only after declared byte count, chunk count, and SHA-256 match.
- The legacy single-request import remains available. Streaming import is disabled by default and bounded to 256 MiB and 600,000 rows; these limits cover the externally supplied 236,991,870-byte, 525,600-row training CSV without making imports unbounded.
- Bounded NLU returns either a Q01-Q10 match or an explicit refusal, with a 500-character input limit and confidence in `[0, 1]`.
- Optional LLM rendering can only restate a deterministic answer. It records rendered, fallback, or disabled status and provenance; it cannot change citations, evidence, safety, review, reports, or submission data.
- C01-C07 each publish one cross-track chart requirement using canonical vocabulary field names. Missing required series must use the existing evidence-series fallback rather than invent data.
- Focused contract tests, `npm run h2:qa`, and `git diff --check` pass.

## Constraints and non-goals

- No provider call, endpoint implementation, UI implementation, parser implementation, dependency, detector change, model enablement, or official-file modification is part of F0.
- No A-line files under detection, events, impact, diagnosis, evidence, safety, model tooling, or evaluation are changed.
- The official training-file SHA-256 `67513c9b1d443d25eb1258a6f58252c02cdb438f701a7921e2f8dacc365a6c51` is an external verification input only. The dataset is not bundled or claimed as generated evidence.
- Fixture, local smoke, HTTP success, and contract tests remain bounded local evidence, not organizer or production proof.

## Fail-closed rules

- Reject path-bearing filenames, oversized declarations, chunk gaps, overlaps, changed retry bytes, hash mismatches, expired/finalized sessions, label-bearing training input, and duplicate finalization with a different request payload.
- Refuse NLU input that is oversized, unsupported, ambiguous, or below the implementation threshold; never route it to an arbitrary official question.
- Keep the deterministic answer when LLM rendering is disabled, unavailable, timed out, or fails validation. Rendered output may reference only the deterministic answer's citation IDs.
- Treat incomplete chart series as unavailable and retain the evidence fallback; do not synthesize measurements.

## Risks

- Large imports can exhaust memory or disk. Ordered chunks, bounded totals, streaming parsing, session expiry, and cleanup are required in implementation.
- Retry races can corrupt content. Implementations must bind idempotency keys to immutable request hashes and serialize session mutation.
- NLU or LLM text can overstate evidence. Q01-Q10 IDs, citations, safety refusal, and deterministic answer content remain authoritative.
- Seven chart contracts can drift from vocabulary. Consumers must resolve only published canonical field names and test all C01-C07 fallbacks.

## Track ownership

- Foundation F0: this specification, `packages/h2-contracts/**`, `settings.py` preseed, focused foundation tests, and durable project memory.
- B line: ingestion/API, assistant/NLU/rendering, reports/quality, Web, launch/delivery, submission, and chart implementation.
- A line: detection/events, impact, diagnosis/evidence, safety, ML implementation and evaluation. F0 only reserves `H2_ML_ENABLED = False`; it does not implement or enable ML.
- Coordinator: integration, root wiring, full verification, runtime inspection, release claims, tags, merge, and push.

## Final commands

```text
npm run h2:test
npm run h2:qa
cd services/h2-analytics && uv run --locked --extra dev python -m pytest -q
npm test
git diff --check
```

F0 requires the focused contract tests, `npm run h2:qa`, and `git diff --check`; the coordinator owns the complete integration command set.
