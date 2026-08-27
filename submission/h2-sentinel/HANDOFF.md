# H2 Sentinel P1 Submission Handoff

## Scope and current truth

- This package describes the integrated P1 judge workflow.
- W1, W2, P1-W3 QA, and the validation-slice provenance correction are
  integrated in coordinator behavior candidate `a7f7093`.
- The exact final documentation HEAD is recorded by Git rather than
  self-referenced inside the commit that contains this file.
- No official validation package or generated slice was supplied or committed.
- No two-run timing receipt, organizer result, full-validation result,
  deployment, publication, or remote-CI result exists.
- The final coordinator completed automated checks plus desktop and 390x844
  primary Fixture runtime inspection.

The documentation now makes the prepared public-validation slice the primary
three-minute path and keeps Fixture as a visibly synthetic fallback. Claims are
separated into implemented contract facts, synthetic tool verification,
pending integrated behavior, and unsupported outcomes.

## Delivered package changes

- `DEMO_SCRIPT.md` defines preflight, explicit package/hash inputs, ignored
  slice output, deterministic Live analysis, Q01-Q10, human review, Q09 report,
  audit/submission export, timing capture, and truthful fallback language.
- `JUDGE_CHECKLIST.md` and `RUNTIME_EVIDENCE_CHECKLIST.md` enumerate the final
  behavioral, safety, provenance, visual, and two-run gates.
- `CLAIMS_LEDGER.md` prevents source hashes, synthetic tests, Fixture, HTTP
  success, route declarations, screenshots, or local receipts from becoming
  organizer, deployment, or full-validation claims.
- `PRODUCT_AND_ARCHITECTURE.md` and `TEN_PAGE_PROJECT_NARRATIVE.md` connect the
  review-only workflow to evidence immutability and the no-control boundary.
- `SCREENSHOT_SHOT_LIST.md` distinguishes runtime-observed Fixture states from
  official-slice and retained-screenshot evidence that still does not exist.
- `scripts/validate-submission.ps1` checks the P1 package structure and required
  truth-boundary phrases; it does not validate runtime behavior.

## Resolved integration findings

`H2-QA-P1-001` was fixed by preserving the prepared-slice filename alongside
analytics provenance. The integrated assembled QA now distinguishes
`LIVE_ANALYSIS · 验证集切片`, generic Live imports, and Fixture. W2's Chinese
Fixture/report, official-question, review, and audit surfaces are integrated.

The remaining dependency is evidence, not code integration: an authorized
official package and expected hashes are required before producing the ignored
slice and two measured receipts.

## Verification

Run the package-only check with:

    pwsh -NoProfile -File submission/h2-sentinel/scripts/validate-submission.ps1
    git diff --check -- submission/h2-sentinel

The final integrated candidate passed the repository command gates summarized
in `../../tests/h2-sentinel/reports/ASSEMBLED_QA_EVIDENCE.md`. The official
slice and two-run receipt must remain ignored local evidence and must match the
exact final SHA.

Project `MEMORY.md` was updated by the coordinator with durable P1 decisions and
verified boundaries.
