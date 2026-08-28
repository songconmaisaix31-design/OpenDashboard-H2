# H2 Sentinel Submission Package

## Current evidence status

H2 Sentinel / 氢哨 is a local-first diagnosis and operations assistant. It
does not issue equipment commands. Every operational recommendation requires
human confirmation, and local actor labels are unverified attribution rather
than authenticated identity.

The integrated P1 baseline provides official Q01-Q10 behavior, deterministic
Chinese reports, append-only human review, review-audit export, and an exact
review-free 16-column submission. Lane C provides official-data evaluation,
overfit, submission-checker, offline-smoke, and scripted-demo tooling plus
fail-closed fixtures.

The official package was not modified. A bounded read-only check found that
all data/material entries plus the workbook match, 21 of 24 total manifest
entries; the three top-level requirement/README Markdown or DOCX files differ.
No final official metric, generated slice, retained screenshot, measured
receipt, organizer result, deployment, remote CI result, or final candidate
SHA is included or claimed.

## Evidence classes

| Label | Meaning |
| --- | --- |
| Contract evidence | A frozen type/schema or deterministic boundary; it does not alone prove final runtime behavior. |
| Tool QA evidence | A tool and fixture executed in this lane; it does not prove official-data results. |
| Final integrated evidence | A fresh command or runtime observation from one clean exact coordinator candidate. |
| Validation-slice evidence | A bounded Live run from a hash-locked public-validation slice with labels isolated from detector input; it is not full validation or an organizer score. |
| Fixture evidence | Sanitized synthetic fallback, visibly FIXTURE, excluded from validation and timed-demo claims. |
| Not evidenced | Hidden testing, organizer scoring, deployment, production readiness, and any claim without its required artifact. |

## Primary P1 workflow

1. Prepare a hash-locked earliest-C04 validation slice with
   `tests/h2-sentinel/scripts/prepare-validation-slice.mjs`.
2. Run `validation/evaluate.mjs` and `validation/overfit-sentinel.mjs` after
   analysis labels remain isolated from detector input.
3. Run `validation/offline-deploy-smoke.mjs` against the full public test set
   and require `validation/check-submission.mjs` to pass.
4. Run `validation/run-demo.mjs` for two fresh scripted local executions.
5. Validate its receipt with
   `tests/h2-sentinel/scripts/validate-demo-receipt.mjs`.
6. Keep every generated official input and artifact under the ignored
   `tests/h2-sentinel/reports/generated/` tree.

## Contents

- [Product and architecture narrative](PRODUCT_AND_ARCHITECTURE.md)
- [Ten-page project narrative](TEN_PAGE_PROJECT_NARRATIVE.md)
- [Three-minute demo and fallback script](DEMO_SCRIPT.md)
- [Screenshot shot list](SCREENSHOT_SHOT_LIST.md)
- [Claims ledger](CLAIMS_LEDGER.md)
- [License and third-party checklist](LICENSE_AND_THIRD_PARTY_CHECKLIST.md)
- [Judge checklist](JUDGE_CHECKLIST.md)
- [Runtime evidence checklist](RUNTIME_EVIDENCE_CHECKLIST.md)
- [Worker handoff](HANDOFF.md)

## Lane C validation commands

    node --test "tests/h2-sentinel/contract/*.test.mjs"
    npm run h2:qa
    npm run h2:launcher:test
    pwsh -NoProfile -File submission/h2-sentinel/scripts/validate-submission.ps1
    git diff --check

The coordinator must repeat all final gates after every lane is integrated.
Historical worker or coordinator results are context, not final-candidate proof.
