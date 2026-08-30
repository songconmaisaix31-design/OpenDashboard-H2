# H2 Sentinel Claims Ledger

Use the narrowest wording supported by fresh evidence from the named SHA.
Historical worker failures and old integration results remain historical; they
cannot be promoted into final-candidate proof.

> Ownership note (plan0830): this ledger is D-authored; lanes A/B/C contribute
> their claim entries as text blocks for D to merge (COORDINATION §2), never by
> direct edit.

| ID | Wording | Current classification | Required evidence or boundary |
| --- | --- | --- | --- |
| C01 | “The integrated P1 contract uses official Q01 through Q10 identifiers and exact Chinese prompts.” | Repeatable integrated fact | Contract/source conformance and assembled runtime QA on the final candidate. |
| C02 | “Review is an append-only local journal with optimistic concurrency and idempotent request IDs.” | Implemented boundary | Contract/backend tests; local actor labels remain unverified attribution. |
| C03 | “Review does not mutate detector evidence or the frozen 16-column submission.” | Repeatable integrated fact | Before/after event snapshots, audit checks, and byte-identical submission export. |
| C04 | “Lane C prepares an ignored C04 slice from explicit hash-locked sources without label columns.” | Tool implementation evidence | Tool source and synthetic success/failure tests; this does not prove a final official run. |
| C05 | “Lane C records two separate scripted executions and validates each measured path below 180 seconds.” | Tool implementation evidence | Runner, validator, and synthetic boundary/hash-drift tests; this does not prove the final target passed. |
| C06 | “All operational recommendations require human confirmation; the app issues no equipment commands.” | Product and contract boundary | Safety contract, assistant/report fields, and final runtime review. |
| C07 | “Fixture is a sanitized synthetic fallback.” | Contract boundary | Always display FIXTURE; never call it validation, official data, a plant run, or a score. |
| C08 | “The official package has full manifest integrity.” | Prohibited | Only 21 of 24 total manifest entries match: all data/material entries plus the workbook match, while three top-level requirement/README Markdown or DOCX files differ. |
| C09 | “The primary demo used a public-validation slice.” | Pending final-candidate evidence | Requires matching source hashes, generated manifest/input hashes, final integrated Live execution, and retained receipt. |
| C10 | “Two consecutive validation-slice executions completed in under 180 seconds each.” | Pending measured receipt | Requires a passing receipt validator result for the exact final integrated SHA and all referenced artifacts. |
| C11 | “Validation precision, recall, F1, delay, per-class results, score, rank, or approval are X.” | Prohibited without the generated report | Requires split identity, labels, matching version, config, candidate SHA, and measured artifact. A validation metric is not an organizer score. |
| C12 | “The application passed hidden testing or received organizer approval.” | Prohibited | Only an organizer artifact could support this claim. |
| C13 | “The application is deployed, online, production-ready, published on main, or remotely CI-verified.” | Pending separate evidence | Requires separate deployment, publication, runtime, and named remote-run evidence. |
| C14 | “Prepared-slice provenance is preserved across Web and reports.” | Repeatable integrated fact; official-slice rerun pending | Assembled Local QA must pass on the final candidate; Fixture cannot substitute for the official slice. |
| C15 | “P2 source implements ordered, bounded, hash-checked upload sessions and the Web adapter calls them for large files.” | Reviewed source fact | Dependency commits plus coordinator integration; source and enablement remain separate from runtime evidence. |
| C16 | “The standard Local HTTP path imported the full 236991870-byte training file.” | Coordinator-reported local runtime evidence | Provider environment cleared; 29 chunks, 525,600 rows, exact external SHA-256, finalized session, and passed quality. Browser file-picker, clean-machine, organizer, production, remote CI, and official score remain unevidenced. |
| C17 | “Bounded NLU selects only Q01-Q10 or refuses.” | Reviewed source fact; integrated runtime inspection pending | Table-driven backend/Web tests and final Local probes including ambiguity, overlength, and control requests. |
| C18 | “StepFun is optional presentation only.” | Implemented boundary | Strict opt-in, bounded deterministic text/citation payload, output validation, disclosure, and deterministic fallback. No live-provider or authorization evidence is included. |
| C19 | “C01-C07 each have a dedicated chart configuration.” | Reviewed source fact; final visual QA pending | Canonical requirements, feature tests, desktop/390x844 final-SHA inspection, and evidence fallback when required series are missing. |
| C20 | “Doctor, check-all, checker, demo, offline smoke, and CI are implemented.” | Reviewed source fact | Exact scripts/workflow exist. Local or worker passes do not establish clean-machine, remote CI, deployment, or organizer evidence. |

## Package integrity wording

The permitted statement is: “The package remained read-only; all
data/material entries plus the workbook match, 21 of 24 total manifest
entries, while three top-level requirement/README Markdown or DOCX files
differ.” Do not shorten this to “the package matches.”

## Forbidden transformations

- Matching hashes do not prove source authorization.
- A prepared slice does not prove the detector ran.
- One execution does not prove the two-execution timing gate.
- A valid local receipt does not prove organizer scoring, hidden testing,
  deployment, production readiness, or full validation.
- Fixture and generic Local smoke do not become validation-slice evidence.
- HTTP success, routes, document review, or screenshots do not replace
  behavior and artifact verification.
- Review history never becomes control authority or authenticated identity.
- A backend session test does not prove that the standard launcher exposes the
  disabled-by-default streaming capability.
- Optional provider configuration does not prove network access, account/model
  entitlement, authorization, or provider correctness.

## plan0830 ratification registry (D-P1-4, 2026-08-30)

### R-0830-1 · plan0829 gate-7 final acknowledgment ratified under plan0830 clause numbering

- **Clause mapping.** Plan0830 §5 retires plan0829 internal task numbering
  T01–T14. The plan0829 internal "T14" final-acknowledgment-and-freeze task is
  registered here under acceptance clause **验收-T14 (safety boundary &
  compliance)**. The historical record itself is preserved unchanged at
  `plan0829/A/planA/docs/reviews/final-ack-freeze.md` (commit 738344f); this
  entry is the plan0830-numbering terminal file, not a rewrite.
- **Ratified items carried forward from 738344f:**
  1. Five cross-lane fixups (float narrowing 158dbb2; candidate whitelist
     87df5c3 series; import reconciliation ad687d9; lightgbm type-ignore
     83fafdf; conditional check-all ruler + H2_OFFICIAL_DATA_DIR isolation
     241569b/f94bdf1) — all under user-granted integration authority.
  2. CR settlements: CR[A3] IF-2 `ref_id` relaxation (api.md v1.1),
     CR[A2]#1 conditional ruler assembly, CR[A2]#2 whitelist.
  3. detector_version v4→v5 clearance (28a175f): 4 files + ruler baseline
     refreeze, 77-window 0 FP @ v5, evaluate F1=0.9718 no-regression recheck.
  4. Delivery verdict at plan0830 handover point: lanes A/B merged,
     declared deliverable **under user unilateral-delivery authorization**.
- **Evidence boundary preserved (unchanged by this ratification):** organizer
  acceptance, official scoring, production deployment, and true third-party
  machine-swap reproduction remain unevidenced and must not be claimed.
  Plan0830 D-P0-1 drills (RUN1 @ e4b3076, RUN2 @ ba4eb75; same-machine
  isolated directories, downgrade declared in RUNTIME_EVIDENCE_CHECKLIST)
  raise reproduction confidence but do not close that boundary.
