# H2 Sentinel P1-W3 QA Handoff

## Scope and ownership

- Task: P1-W3 QA, validation-demo tooling, and submission evidence.
- Base: W1 commit `4c856eb` (`feat(h2): add P1 assistant review and report contracts`).
- W2 state: intentionally not integrated in this worker checkout.
- Owned paths: `tests/h2-sentinel/**` and `submission/h2-sentinel/**` only.
- Dependencies: none added; new CLI tools use Node.js built-ins.
- Official data: not supplied, read, generated, or committed.

The worker commit SHA is reported in the Orca completion payload because this
tracked handoff cannot truthfully self-reference the commit that contains it.

## Delivered QA

- Contract conformance for exact official Q01-Q10 prompts and identifiers,
  review actions/bounds, eight report kinds, and the frozen review-free
  16-column submission.
- Assembled Fixture/Local coverage for assistant answers, citations, context
  errors, every review transition, exact replay, stale revisions, request-ID
  conflicts, required notes, forbidden transitions, revision-zero audit events,
  event/submission immutability, Chinese report structure, escaping, safety,
  hashes, provenance separation, and explicit unavailable validation metrics.
- W2 source-surface checks authored against the frozen P1 contract; final
  execution remains coordinator-owned.
- A zero-dependency validation-slice preparer requiring explicit package paths,
  expected SHA-256 values, and an explicit ignored output directory. It selects
  the earliest public C04 event, applies inclusive 30-minute padding, validates
  complete monotonic detector input, and strips label columns.
- A zero-dependency receipt validator requiring exactly two distinct consecutive
  successful runs below 180 seconds, the final candidate SHA, matching slice
  provenance, and recomputed hashes for diagnosis, audit, and submission
  artifacts.
- Synthetic success and failure tests for both tools. Synthetic receipts prove
  validator behavior only; they are not timed demo evidence.

## Current integration findings

`H2-QA-P1-001` blocks the primary validation-slice demo. Analytics imports CSV
bytes as `in-memory-csv-import`, so the report renders
`LIVE_ANALYSIS · 本地导入数据` even when the public input filename identifies a
prepared validation slice. The coordinator must route the smallest provenance
fix outside this lane and preserve the distinction among validation slice,
generic Live import, and Fixture.

The current checkout also predates W2. Consequently, the assembled runner
correctly rejects the English Fixture diagnosis and the legacy H2Qxx Web/plugin
surface. These are expected integration-only failures until W2 is accepted and
integrated; they must not be converted to passes in worker evidence.

## Verification interpretation

Run from the repository root:

    node --check tests/h2-sentinel/scripts/prepare-validation-slice.mjs
    node --check tests/h2-sentinel/scripts/validate-demo-receipt.mjs
    node --check tests/h2-sentinel/assembled/run-assembled-qa.mjs
    node --test "tests/h2-sentinel/contract/*.test.mjs"
    npm run h2:qa
    npm run h2:launcher:test
    node tests/h2-sentinel/golden-path/run-offline-golden-path.mjs
    pwsh -NoProfile -File submission/h2-sentinel/scripts/validate-submission.ps1
    git diff --check

Exact worker results are recorded in the Orca completion payload and
`reports/ASSEMBLED_QA_EVIDENCE.md`. A golden-path `SKIP` without `H2_WEB_URL`
is not runtime proof.

On the final pre-commit worker tree, the contract/tool suite passed 12 tests,
the launcher suite passed 9 tests, the submission validator passed, and
`git diff --check` plus the changed-path allowlist audit passed. `npm run h2:qa`
exited non-zero only for the three recorded groups: pre-W2 Chinese Fixture,
`H2-QA-P1-001` validation-slice provenance, and pre-W2 source migration. The
offline golden-path command exited zero with an explicit `SKIP` because
`H2_WEB_URL` was unset; it is not claimed as runtime verification.

## Remaining coordinator gates

1. Integrate the accepted W2 commit and route `H2-QA-P1-001` to its owning path.
2. Run all project checks from one clean final candidate SHA, including Python
   analytics tests, repository tests, type checking, build, and assembled QA.
3. Obtain the authorized public package and expected hashes without reading
   credentials; prepare the slice only in an ignored explicit output directory.
4. Execute and retain two distinct measured validation-slice runs, then pass
   the receipt validator against the exact final SHA and artifact bytes.
5. Complete desktop and 390x844 visual inspection and update submission claims
   only from the resulting evidence.

No organizer score, full-validation result, deployment, publication, remote CI,
or sub-180-second demo pass is claimed. Project `MEMORY.md` was not updated
because it is outside the task write allowlist.
