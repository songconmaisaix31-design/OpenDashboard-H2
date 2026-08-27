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
