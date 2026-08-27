# H2 Sentinel Submission Package

## P1 status

This package separates implemented contracts, worker QA, final integration,
and measured competition evidence.

- W1 is present in this checkout at 4c856eb and supplies official Q01–Q10,
  review, audit, and Chinese analytics report contracts.
- P1-W3 supplies independent contract/assembled QA, validation-slice
  preparation, and two-run receipt validation.
- W2, the cross-track provenance fix, final project checks, and primary Fixture
  desktop/mobile runtime inspection are integrated and coordinator-verified.
- Official-package preparation and two timed runs remain unavailable because no
  authorized package or expected source hashes were supplied.
- No official dataset, generated slice, public labels, timed receipt,
  organizer score, full-validation result, deployment, or remote CI result is
  included or claimed.

H2 Sentinel / 氢哨 is local-first diagnosis and operations assistance. It does
not issue equipment commands. Every operational recommendation requires human
confirmation, and local actor labels are unverified attribution rather than
authenticated identity.

## Evidence classes

| Label | Meaning |
| --- | --- |
| Contract evidence | A frozen type/schema or deterministic implementation boundary. It does not prove the final UI or runtime. |
| Worker QA evidence | A test or tool executed in the P1-W3 checkout. Historical worker failures remain preserved even after later integration. |
| Final integrated evidence | A fresh command or runtime observation from the exact coordinator candidate. |
| Validation-slice evidence | A bounded Live run from a hash-locked public-validation slice with labels isolated from detector input. It is not full validation or an organizer score. |
| Fixture evidence | Sanitized synthetic fallback, visibly FIXTURE, excluded from validation claims and timed receipts. |
| Not evidenced | Organizer result, hidden test, full validation, deployment, production readiness, remote CI, and any claim without its required artifact. |

## Primary P1 workflow

1. Prepare a hash-locked earliest-C04 validation slice with
   tests/h2-sentinel/scripts/prepare-validation-slice.mjs.
2. Run the final integrated Local workflow twice with services already
   started.
3. Export the Chinese diagnosis report, review-audit JSON, and exact
   16-column submission for each run.
4. Validate the receipt, slice manifest, artifacts, durations, and final SHA
   with tests/h2-sentinel/scripts/validate-demo-receipt.mjs.
5. Keep all generated inputs, labels, receipts, and artifacts in the ignored
   tests/h2-sentinel/reports/generated/ tree.

The Fixture route remains a separate regression fallback. It cannot replace a
failed Live validation-slice run.

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

## Validation commands

    node --test "tests/h2-sentinel/contract/*.test.mjs"
    npm run h2:qa
    npm run h2:launcher:test
    node tests/h2-sentinel/golden-path/run-offline-golden-path.mjs
    pwsh -NoProfile -File submission/h2-sentinel/scripts/validate-submission.ps1
    git diff --check

The coordinator ran the full integrated gate and fresh Fixture runtime review.
Historical H6 counts, screenshots, and local smokes are not carried forward as
fresh P1 evidence.
