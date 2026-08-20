# H2 Sentinel Submission Package

## Status

This package records the current coordinator-verified H6 assembled snapshot.
H6 began from original integration gate `8bcc8d59e352def535c26504683975959ff7f18d`;
the final candidate SHA is pending coordinator handoff. It is not a claim
that `main` changed, that the application was deployed, or that a GitHub Actions
workflow has run remotely.

H2 Sentinel / 氢哨 is a local-first, evidence-first H2 EMS diagnosis and
decision-support application. It presents advisory recommendations that require
human confirmation; it does not issue equipment commands or replace the EMS.

## Evidence labels

| Label | Meaning |
| --- | --- |
| Current H6 evidence | A reproducible command or manual check recorded for the current assembled snapshot on 2026-08-19. |
| Fixture evidence | Sanitized synthetic C03/C04 data, visibly `FIXTURE`; never official data, a score, or live plant evidence. |
| Local deterministic evidence | The explicit loopback analytics path with deterministic fallback; it is not an official-data validation result. |
| Manual Chrome evidence | A human desktop/390x844 observation, not screenshot automation and not a submitted image asset. |
| Unverified or undelivered | Official data, scores, deployment, remote CI execution, network-isolation proof, and screenshot assets. |

## Reproduction entry points

The generic Fixture Demo remains the default at `/`. H2 mounts only at these
explicit modes:

```text
/h2-sentinel/?mode=fixture
/h2-sentinel/?mode=local
```

From the repository root, use `npm run h2:fixture` for the no-Python Fixture
path or `npm run h2:local` for the deterministic local sidecar path. Local
browser requests stay same-origin; Vite proxies only
`/api/v1/h2-sentinel` to a validated `127.0.0.1` target. The route does not
prove network isolation beyond the exercised loopback policy.

## Current H6 evidence and limitation

The assembled verification recorded 92 repository tests, 60 focused H2 tests,
32 Python pytest cases, nine launcher tests, five assembled QA groups, and
nine H2 smoke scenarios. This is current-worktree evidence for the assembled
snapshot, not a remote CI result.

The Local golden path produced a deterministic no-LLM C03 HTML report and a
two-row `submission.csv` validated against its exact 16 columns. Manual Chrome
review checked the Fixture overview, C03, and C04 at desktop and 390x844 without
document-width overflow. The assembled production build processed 684 modules
and emitted 900.01 kB minified JavaScript (297.15 kB gzip) plus 47.44 kB CSS;
Vite still emits its standard greater-than-500-kB warning.

The recorded local hardening checks reject a 307 health redirect, cover
Windows-owned child cleanup, and make report content hashes visible for review.
These are not network-isolation or deployment claims.

Fixture report-format parity is resolved by plugin source commit
`92f7b78027b9492a5a5fe8ced2e851ed4199aeaa`, integrated by the coordinator as
`abe454b`. Single-event diagnosis, period summary, and quality Fixture reports
now use deterministic safe HTML with matching media type and filename. JSON and
CSV report kinds retain their corresponding formats. This resolves format parity
only; it does not turn Fixture output into official data, a score, or a
deployment artifact.

## Contents

- [Product and architecture narrative](PRODUCT_AND_ARCHITECTURE.md)
- [Ten-page project narrative](TEN_PAGE_PROJECT_NARRATIVE.md)
- [Demo and fallback scripts](DEMO_SCRIPT.md)
- [Screenshot shot list](SCREENSHOT_SHOT_LIST.md)
- [Claims ledger](CLAIMS_LEDGER.md)
- [License and third-party checklist](LICENSE_AND_THIRD_PARTY_CHECKLIST.md)
- [Judge checklist](JUDGE_CHECKLIST.md)
- [Runtime evidence checklist](RUNTIME_EVIDENCE_CHECKLIST.md)
- [Handoff](HANDOFF.md)

## Source inputs

- [H6 integration handoff](../../scripts/h2-sentinel/HANDOFF.md)
- [H2 contracts](../../packages/h2-contracts/README.md)
- [H2 analytics handoff](../../services/h2-analytics/HANDOFF.md)
- [H2 plugin handoff](../../plugins/h2-ems/HANDOFF.md)
- [H2 Web handoff](../../apps/web/src/features/h2-sentinel/HANDOFF.md)
- [H2 QA acceptance matrix](../../tests/h2-sentinel/ACCEPTANCE_MATRIX.md)

Run `pwsh -NoProfile -File submission/h2-sentinel/scripts/validate-submission.ps1`
from the repository root to validate this package's required files, local links,
ten-page structure, and placeholder scan.
