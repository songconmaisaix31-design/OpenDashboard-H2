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

## P1 Integration Result (2026-08-28)

- The coordinator integrated W1 contracts/backend, W2 Web/runtime behavior, P1-W3 QA and evidence tooling, and the prepared-slice provenance correction on `codex/p1-coordinator-20260828`.
- The official assistant wire contract is Q01 through Q10 with exact Chinese prompts. H2Q aliases are rejected; Q03 and Q09 require event context, and Q09 emits a matching deterministic diagnosis report.
- Review is an append-only journal separate from detector events and the frozen 16-column submission. Mutations use `requestId` idempotency and `expectedRevision`; local actor names are explicitly unverified attribution.
- Report provenance must preserve both analytics source and the imported filename so a prepared slice is distinct from generic Live input and Fixture.
- Integrated verification passed `npm run h2:check`, 91 repository tests, 52 Python tests, Ruff, Mypy across 38 source files, production build, and primary Fixture browser review at 1427px and 390x844.
- Runtime review confirmed per-event isolation, Q09 generation, safe Chinese PCC/diagnosis HTML, and a complete review-audit JSON export. Fixture evidence remains synthetic and cannot support validation, timing, deployment, or organizer claims.
- No authorized official validation package or expected source hashes were supplied. Consequently, no official slice, two-run receipt, sub-180-second claim, full-validation result, organizer score, deployment, or remote-CI result exists.
