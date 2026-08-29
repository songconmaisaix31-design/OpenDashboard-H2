# License and Third-Party Checklist

## Current candidate truth

The current assembled snapshot includes
[THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md) and an updated root
[NOTICE](../../NOTICE). The inventory names the locked Web runtime (Apache
ECharts 6.1.0, React 19.2.4, React DOM 19.2.4 and listed transitives), local
analytics runtime (FastAPI 0.141.1, Jinja 3.1.6, Pydantic 2.13.4, Uvicorn
0.52.3), and development/test dependencies. It records that H2-owned paths
consume packages and copy no upstream source file or asset.

This establishes an inventory for this source candidate, not a license grant
for future official datasets, models, screenshots, generated reports, or any
external submission archive.

## Review checklist

| Check | Candidate status | Boundary |
| --- | --- | --- |
| Inventory shipped package dependencies | Recorded | Source: root lockfile and `services/h2-analytics/uv.lock`. |
| Identify copied source/assets | Recorded as none in H2-owned paths | Re-review every later imported asset or snippet. |
| Preserve required notices | Recorded | Retain `NOTICE` and `THIRD_PARTY_NOTICES.md` in distributions. |
| Default deterministic analytics dependency set | Recorded | Optional `lightgbm` is not installed or required by the default launcher/smoke path. |
| pandas and scikit-learn | Not shipped | They are not declared H2 dependencies. |
| Official package | Read-only integrity boundary recorded | All data/material entries plus the workbook match, 21 of 24 total manifest entries; three top-level requirement/README Markdown or DOCX files differ. The package was not modified or copied into this repository. |
| Models, screenshots, generated reports | Not included as final evidence | Require separate origin, license, authorization, redaction, and final-candidate review. |
| Optional StepFun service | Source integration only; no live-provider evidence or credential is included | Operator must confirm account/model entitlement, service terms, data-processing authorization, and the bounded payload disclosure. Deterministic offline behavior must remain available. |
| Final distribution compatibility | Not certified | Review the actual archive and organizer terms before release. |

## Submission safeguards

- Do not include private data, credentials, or unlicensed assets.
- Do not treat the absence of copied H2 source as proof that a future asset is reusable.
- Keep Fixture data labeled synthetic and do not append an official dataset without its authorization record.
- A screenshot may be included only after its capture context and asset origin are recorded; none is currently committed.

## Sources

- [Third-party notices](../../THIRD_PARTY_NOTICES.md)
- [Root notice](../../NOTICE)
- [H6 integration handoff](../../scripts/h2-sentinel/HANDOFF.md)
