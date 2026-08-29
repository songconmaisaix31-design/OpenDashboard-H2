# H2 Sentinel P2 B-Line Runtime Evidence Checklist

## Candidate record

- Exact final candidate SHA: coordinator records after this documentation
  commit and regenerates ignored evidence on that exact clean SHA.
- Working-tree state: must be clean except intentional ignored generated
  evidence and known nested worktrees; generated evidence from an earlier SHA
  is a pre-documentation baseline, not final-candidate evidence.
- Official package: bounded read-only integrity check only.
- Package integrity: all data/material entries plus the workbook match, 21 of
  24 total manifest entries; three top-level requirement/README Markdown or DOCX files differ,
  so the package is not described as pristine and remains read-only.
- Latest local public-data metrics, visual QA, measured receipt, and full
  test-set checker verdict are recorded below as the pre-documentation
  baseline; pending final-candidate rerun.

| ID | Required evidence | Lane C status | Final release rule |
| --- | --- | --- | --- |
| R01 | Exact candidate SHA and changed-path audit | Pre-documentation clean-SHA gate passed; final documentation SHA not yet recorded | Coordinator records the post-commit clean SHA, audits allowed paths, and rejects evidence bound to an earlier SHA. |
| R02 | Frozen SHA-256 identities for public source CSVs | Locally evidenced by the frozen official-source contract and read-only package audit | Revalidate hashes on the exact final clean SHA; never infer hashes or read credentials. |
| R03 | Directed C04 manifest and 69-field detector CSV | Locally evidenced: complete source verified, VA0034 selected, 117 detector rows, labels excluded from detector input | Regenerate ignored manifest and slice on the exact final clean SHA and revalidate padding, coverage, relative paths, fields, and label exclusion. |
| R04 | Q01-Q10 deterministic answers | Locally evidenced by focused and assembled contract gates | Rerun both LLM-rendering flags, citation invariants, context errors, alias rejection, and Q09 on the final SHA; this is not organizer evidence. |
| R05 | Human review transitions and reliability | Locally evidenced by focused, assembled, and demo gates | Rerun transitions, replay, conflict, notes, and per-event isolation on the final SHA. |
| R06 | Detector/submission immutability after review | Locally evidenced by contract and demo gates | Recompare event snapshots and exact submission bytes before and after review on the final SHA. |
| R07 | Review-audit export | Locally evidenced by contract and demo gates | Revalidate all events, revision-zero entries, stable ordering, UTF-8 notes, and actor notice on the final SHA. |
| R08 | Chinese report structure and safety | Locally evidenced by contract and demo gates | Revalidate zh-CN, script-free escaped HTML, provenance, safety, and hash metadata on the final SHA. |
| R09 | Validation-slice provenance | Locally evidenced in prepared-slice, Web/report, and demo validation | Regenerate on the final SHA and retain prepared-slice provenance without promoting Fixture or HTTP success to official proof. |
| R10 | Local public validation metrics | Locally evidenced: TP=69, FP=3, FN=1; precision 0.9583333333, recall 0.9857142857, F1 0.9718309859; mean delay 7.7826 minutes; mean start/end error 3.3623/2.7971 minutes; classification 69/69; per-code F1 C01=0.9, C04=0.90909, all others=1.0 | Regenerate the event-match-v2 report on the exact final clean SHA. Treat it as local public-data contract evidence, never an organizer score. |
| R11 | Disjoint public-data overfit sentinel | Locally evidenced green: absolute F1 delta 0.0120399818, validation 0.97183 versus train-last-90-day 0.98387 | Regenerate on the final SHA; do not describe public-data separation as hidden-test evidence. |
| R12 | Full public test-set smoke and submission | Locally evidenced: 172,800 rows, 69 fields, 98 events (C01=10, C02=14, C03=14, C04=17, C05=14, C06=15, C07=14), exact 16-column/98-row CSV, checker passed | Rerun on the final SHA; this proves the local pipeline, not deployment or organizer acceptance. |
| R13 | Two scripted local executions below 180 seconds | Pre-documentation executions and independent receipt validation passed; all unsupported-claim flags false | Regenerate on the exact final clean SHA, validate distinct execution IDs and ordered stages, and record timing only in ignored evidence. |
| R14 | Desktop and iPhone 12 rendering | Visual QA locally evidenced across all six Fixture routes; Local empty/loading/error theme tokens were corrected | Repeat final-SHA visual QA for overflow, clipping, overlap, scrolling, theme states, and official field identities; screenshots and HTTP success remain bounded local evidence. |
| R15 | Required project checks | Pre-documentation baseline passed: 132 repository; 117 H2; 75 contract QA; 5 static QA; 6 assembled QA; 9 launcher; 169 Python; Ruff; Mypy on 45 files; 686-module build; 9-scenario smoke | Coordinator reruns the exact final gate, package wording/evidence boundaries, Markdown validation, ignored-output checks, and changed-path/diff audits. |
| R16 | Organizer result, hidden testing, deployment, production, clean-machine, and remote CI | Not evidenced; all corresponding claims remain false | Require separate authoritative evidence. Do not derive an official D01-D13 completion score because no authoritative mapping or weight table was supplied. |
| R17 | Full training-file session import | Backend direct-capability run reported the external size/hash and 525,600 rows; strict runtime opt-in is implemented | Set exact `H2_STREAMING_IMPORT_ENABLED=true`, then rerun from the final clean SHA through the normal launcher/Web with the read-only external file. |
| R18 | Bounded NLU and control refusal | Backend/Web source and focused tests reported | Probe Q01-Q10 paraphrases, ambiguity, overlength, stale context, and equipment-control requests in final integrated Local runtime. |
| R19 | Optional StepFun restatement | Strict opt-in, bounded payload, validation, disclosure, and fallback are implemented; no live-provider evidence | Verify deterministic off/fallback locally. Treat any authorized live-provider run as separate external evidence and never record a secret. |
| R20 | C01-C07 dedicated charts | Canonical requirements and Web configurations are implemented; final integrated visual QA pending | Inspect every code plus missing-series fallback at desktop and 390x844, including signs, units, overflow, and no fabricated measurements. |
| R21 | Doctor/check-all/CI | Source and worker checks reported | Run doctor and check-all on final SHA; record clean-machine and named remote CI only after those environments actually pass. |

## Current documentation-lane command set

    node scripts/h2-sentinel/doctor.mjs --mode local
    node scripts/h2-sentinel/check-all.mjs
    node --test "tests/h2-sentinel/contract/*.test.mjs"
    npm run h2:qa
    npm run h2:launcher:test
    pwsh -NoProfile -File submission/h2-sentinel/scripts/validate-submission.ps1
    git diff --check

## Receipt interpretation

A passing receipt proves that two scripted local workflows and their referenced
files meet the evidence schema on the named clean SHA. A tracked documentation
commit changes that SHA, so the coordinator must regenerate the ignored receipt
after this commit before calling it final-candidate evidence. The receipt does
not by itself prove the separate full public-validation run and never proves
hidden testing, organizer scoring, deployment, remote CI, clean-machine or
production behavior, or correctness beyond the recorded local workflow.
