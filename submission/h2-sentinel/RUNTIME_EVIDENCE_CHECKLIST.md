# H2 Sentinel P1 Runtime Evidence Checklist

## Candidate record

- Exact final candidate SHA: coordinator records after all lane integration.
- Working-tree state: must be clean except intentional ignored generated
  evidence and known nested worktrees.
- Official package: bounded read-only integrity check only.
- Package integrity: all data/material entries plus the workbook match, 21 of
  24 total manifest entries; three top-level requirement/README Markdown or DOCX files differ.
- Official metrics, screenshots, measured receipt, and full test-set checker
  verdict: pending final-candidate rerun.

| ID | Required evidence | Lane C status | Final release rule |
| --- | --- | --- | --- |
| R01 | Exact candidate SHA and changed-path audit | Not self-claimed | Coordinator records final SHA after integration and confirms allowed paths. |
| R02 | Expected SHA-256 values for official source CSVs | Explicit inputs required | Obtain independently; never infer hashes or read credentials. |
| R03 | Earliest-C04 manifest and 69-field detector CSV | Tool and fixtures implemented | Generate under ignored output; verify 30-minute padding, coverage, relative paths, and label removal. |
| R04 | Official Q01-Q10 deterministic answers | Integrated regression gate | Run both LLM-rendering flags, citation invariants, context errors, alias rejection, and Q09. |
| R05 | Human review transitions and reliability | Integrated regression gate | Rerun all transitions, replay, conflict, note, and per-event isolation. |
| R06 | Detector/submission immutability after review | Integrated regression gate | Compare event snapshots and exact submission bytes before and after review. |
| R07 | Review-audit export | Integrated regression gate | Require all events, revision-zero entries, stable ordering, UTF-8 notes, and actor notice. |
| R08 | Chinese report structure and safety | Integrated regression gate | Require zh-CN, script-free escaped HTML, provenance, safety, and hash metadata. |
| R09 | Validation-slice provenance | Integrated regression gate; final official run pending | Require prepared-slice provenance in Web and reports on the official run. |
| R10 | Official evaluation metrics | Tool and event-match-v1 fixtures implemented | Generate overall and C01-C07 results from the named split and exact final SHA. |
| R11 | Overfit sentinel | Tool implemented | Compare official validation against the disjoint public train-last-90-day window. |
| R12 | Full public test-set smoke and submission | Tool and checker fixtures implemented | Import the entire set and require the exact 16-column checker to pass. |
| R13 | Two scripted executions below 180 seconds | Runner and validator implemented | Validate distinct execution IDs, ordered positive stages, relative artifacts, hashes, and exact SHA. |
| R14 | Desktop and 390x844 rendering | Final official capture pending | Inspect overflow, clipping, overlap, loading, disabled, error, and conflict states. |
| R15 | Required project checks | Coordinator-owned final gate | Run repository, H2, Python, build, launcher, diff, ignored-output, and package-wording checks. |
| R16 | Organizer result, full validation, deployment, remote CI | Not evidenced | Keep every claim false absent separate authoritative evidence. |

## Lane C command set

    node --test "tests/h2-sentinel/contract/*.test.mjs"
    npm run h2:qa
    npm run h2:launcher:test
    pwsh -NoProfile -File submission/h2-sentinel/scripts/validate-submission.ps1
    git diff --check

## Receipt interpretation

A passing receipt proves that two scripted local workflows and their referenced
files meet the evidence schema on the named clean SHA. It does not prove full
validation, hidden testing, organizer scoring, deployment, remote CI,
production behavior, or correctness beyond the recorded slice.
