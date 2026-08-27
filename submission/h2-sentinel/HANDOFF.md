# H2 Sentinel P1 Submission Handoff

## Scope and current truth

- This package describes the P1 judge workflow on the W1-based P1-W3 checkout.
- W2 and the validation-slice provenance correction are not integrated here.
- The final candidate SHA remains coordinator-owned.
- No official validation package or generated slice was supplied or committed.
- No two-run timing receipt, organizer result, full-validation result,
  deployment, publication, remote-CI result, or final visual evidence exists in
  this worker checkout.

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
- `SCREENSHOT_SHOT_LIST.md` leaves all new visual evidence pending rather than
  reusing stale screenshots.
- `scripts/validate-submission.ps1` checks the P1 package structure and required
  truth-boundary phrases; it does not validate runtime behavior.

## Current blocker and dependency

The W1 analytics path does not preserve the validation-slice identity into
report provenance. Current reports therefore show
`LIVE_ANALYSIS · 本地导入数据`, not the required
`LIVE_ANALYSIS · 验证集切片`. This is tracked as `H2-QA-P1-001`; the
coordinator must route a fix outside W3. W2 must also be integrated before the
Chinese Fixture/report and official-question UI gates can pass.

## Verification

Run the package-only check with:

    pwsh -NoProfile -File submission/h2-sentinel/scripts/validate-submission.ps1
    git diff --check -- submission/h2-sentinel

The final integrated candidate must additionally pass the commands and evidence
gates in `../../tests/h2-sentinel/HANDOFF.md`. The official slice and two-run
receipt must remain ignored local evidence and must match the exact final SHA.

Project `MEMORY.md` was not updated because it is outside the task write
allowlist.
