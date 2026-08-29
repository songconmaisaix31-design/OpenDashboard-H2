# H2 Sentinel Project Memory

## Long-Lived Product Decisions

- H2 Sentinel is a local-first diagnosis and operations-assistance layer, not an EMS replacement or autonomous controller.
- The safety boundary is deterministic: models may detect, rules verify, AI may explain, and humans decide.
- Fixture mode is a deterministic fallback. It must remain visibly distinct from official-data or organizer-score evidence.
- User-facing competition flows are Simplified Chinese; implementation and technical documentation are English.
- Shared data and API contracts live in `packages/h2-contracts` and remain the single source of truth.

## Repository and Branch Context

- Protected base: `main` at `99c6d5bb79d91ace73dd059caea46557fb59038c` on 2026-08-28.
- P1 coordinator branch: `codex/p1-coordinator-20260828`.
- Existing nested Orca worktrees are intentional and must not be added as embedded repositories:
  - `h2-docs-declaration`, with prior work preserved at `a794a2d`.
  - `h2-plugin-composition`, clean at `3c70a08` when P1 coordination began.
- The adjacent `C:/Users/DW/orca/workspaces/OpenDashboard/h2-e1-web-csv` checkout contains later official-data and C01-C07 work, but it is a separate checkout/history and its metrics must not be attributed to this branch without explicit integration and fresh verification.

## Current P1 Objective

Complete the judge-facing P1 layer before broader P0 convergence:

1. Ten deterministic Chinese assistant questions with evidence references and uncertainty boundaries.
2. Human event review with confirm/reject/note state and auditable export.
3. A truthful three-minute demo path from validation import through evidence, assistant, report, and submission.
4. Chinese report/error output needed by those flows.

## Evidence Rules

- Validation metrics must record the exact data split, detector/config version, hashes, and event-matching definition.
- A local or Fixture pass is not an organizer score.
- Submission documents must be regenerated or corrected when test counts, bundle sizes, screenshots, or runtime evidence drift.

## Operational Notes

- Never store secret values here. Only record where configuration is expected.
- `.env` files are ignored and must not be read during ordinary project work.
- Final integration requires TypeScript checks, focused H2 tests, full repository tests, Python tests, production build, diff checks, and desktop/mobile runtime inspection when available.

## P2 B-Line Foundation (2026-08-29)

- P2 B-line work starts from `f61f99681462195f3d73af6d797e561ba47dc839` and extends contracts additively; existing P1 Q01-Q10, Q09, review, provenance, and submission semantics remain frozen.
- Full training-file import uses ordered, sessioned chunks with immutable idempotent retries and hash-checked finalization. The legacy import remains available; streaming import defaults off and is bounded to 256 MiB and 600,000 rows.
- Bounded NLU may only select Q01-Q10 or refuse. Optional LLM output is a provenance-bearing presentation layer over deterministic answers and must fall back without changing evidence, safety, review, reports, or submission data.
- Event visualization publishes C01-C07 requirements using canonical vocabulary fields and retains the evidence-series fallback when required data is unavailable.
- The official training CSV size and SHA-256 are external verification inputs only; the file is not bundled and local checks do not establish organizer or production proof.

## P1 Integration Result (2026-08-28)

- The coordinator integrated W1 contracts/backend, W2 Web/runtime behavior, P1-W3 QA and evidence tooling, and the prepared-slice provenance correction on `codex/p1-coordinator-20260828`.
- The official assistant wire contract is Q01 through Q10 with exact Chinese prompts. H2Q aliases are rejected; Q03 and Q09 require event context, and Q09 emits a matching deterministic diagnosis report.
- Review is an append-only journal separate from detector events and the frozen 16-column submission. Mutations use `requestId` idempotency and `expectedRevision`; local actor names are explicitly unverified attribution.
- Report provenance must preserve both analytics source and the imported filename so a prepared slice is distinct from generic Live input and Fixture.
- Runtime review confirmed per-event isolation, Q09 generation, safe Chinese PCC/diagnosis HTML, and a complete review-audit JSON export. Fixture evidence remains synthetic and cannot support validation, timing, deployment, or organizer claims.

## Latest Local Evidence Baseline (2026-08-29)

- The latest integrated pre-documentation baseline passed 132 repository tests; 117 focused H2 tests; 75 contract QA tests; five static-asset and six assembled-runtime QA groups; nine launcher/composition tests; 169 Python tests; Ruff; Mypy across 45 source files; a 686-module build with no greater-than-500-kB warning; and all nine smoke scenarios.
- The read-only package audit matched all data/material entries plus the workbook, 21 of 24 manifest entries. Three top-level requirement/README documents differ, so the package is not pristine and must remain read-only.
- Local public validation produced TP=69, FP=3, FN=1, precision 0.9583333333, recall 0.9857142857, F1 0.9718309859, and 69/69 matched-event classification. The disjoint public train-last-90-day sentinel was green at absolute F1 delta 0.0120399818; neither result is an organizer score or hidden-test evidence.
- The full public test smoke verified 172,800 rows and 69 fields, produced 98 events, exported an exact 16-column/98-row CSV, and passed the checker. The directed C04 slice selected VA0034 with 117 detector rows while excluding labels from detector input.
- Two local demo executions and the independent receipt validator passed with every unsupported claim false. Desktop and iPhone 12 QA covered all six Fixture routes and corrected Local states, but Fixture screenshots and HTTP success remain bounded local evidence.
- Generated evidence is valid only for its recorded clean commit. Because tracked documentation changes the candidate SHA, the coordinator must regenerate ignored evidence after the documentation commit rather than treating the pre-documentation SHA as final.
- Durable gaps remain: the full training CSV is intentionally split for the 96 MiB/180,000-row import cap; some equipment localization is broad; root-cause text is deterministic rather than fully causal; follow-up routing is bounded; and no clean-machine, deployed, production, remote-CI, hidden-test, or organizer result is evidenced. The supplied materials contain no authoritative D01-D13 mapping or weight table, so no official completion score may be published.
- 2026-08-29 read-only verification confirmed that the supplied DOCX omits the claimed sections 8-10 and 13 and that files 00/02/03 differ from the checksum manifest; do not derive an official completion score until LeiDong provides the authoritative versions and precedence.
