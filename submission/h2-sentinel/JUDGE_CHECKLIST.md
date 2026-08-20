# H2 Sentinel Judge Checklist

## Review framing

- Product: local-first, evidence-first H2 EMS anomaly diagnosis and decision support.
- Safety: no equipment control; recommendations remain advisory and require human confirmation.
- Primary cases: sanitized synthetic Fixture C03 BESS direction anomaly and C04 PCC boundary tracking.
- Candidate: current coordinator-verified assembled snapshot, not a `main` publication or deployment.

## What can be inspected now

| Item | Evidence status | Judge boundary |
| --- | --- | --- |
| Generic product entry | Current H6 evidence | `/` preserves the generic Fixture Demo. |
| H2 entry | Current H6 evidence | Only `/h2-sentinel/?mode=fixture` and `/h2-sentinel/?mode=local` mount H2. |
| Safety/provenance | Current H6 evidence | Human confirmation and `FIXTURE` visibility were manually reviewed. |
| C03/C04 workflow | Current H6 evidence | Fixture overview/C03/C04 were manually checked at desktop and 390x844. |
| Local deterministic path | Current H6 evidence | Local smoke produced C03 HTML output and a 16-column, two-row validated CSV. |
| Reproducibility | Current assembled evidence | 92 repository tests, 60 focused H2 tests, 32 Python pytest cases, nine launcher tests, five assembled QA groups, and nine smoke scenarios are recorded for the assembled snapshot. |
| Visual proof | Manual only | No committed screenshots and no automated screenshot regression. |
| Fixture report cards | Current plugin evidence | `92f7b78` makes single-event, period, and quality cards deterministic safe HTML; JSON/CSV kinds retain their formats. |
| Evaluation metrics | Not delivered | No official-data validation report, score, rank, or approval. |
| Deployment and remote CI | Not delivered | No deployment proof or remote GitHub Actions run; the workflow file alone is insufficient. |
| Legal inventory | Current source evidence | Notices cover package dependencies; later assets/datasets need a separate review. |

## Plain answers

1. **Is this controlling equipment?** No. It is decision support and requires human confirmation.
2. **Are C03/C04 official-data results?** No. They are sanitized synthetic Fixture inputs.
3. **What ran locally?** The assembled snapshot recorded Fixture and Local launcher checks, five assembled QA groups, nine smoke scenarios, deterministic Local C03 HTML output, and a validated two-row/16-column CSV.
4. **Where are metrics and score?** They are not delivered. A future validation result must remain separate from an organizer score.
5. **Are screenshots and CI results included?** No. Chrome review was manual with no committed capture; the GitHub workflow is committed but no remote run is claimed.
