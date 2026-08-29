# H2 Sentinel P2 B-Line Submission Handoff

## Scope and current truth

- Lane C owns only `validation/**`, `tests/h2-sentinel/**`, and
  `submission/h2-sentinel/**`.
- Integrated P1 facts are repeatable through Q01-Q10, review, Q09, report,
  audit, submission, provenance, and launcher regression gates.
- Historical worker failures remain historical and are not current defects.
- The package remains read-only. All data/material entries plus the workbook
  match, 21 of 24 total manifest entries; the three top-level
  requirement/README Markdown or DOCX files differ.
- No official package file, root file, product code, contract, analytics code,
  Web code, plugin, nested worktree, or main branch was modified.
- No final official metric, retained screenshot, measured receipt, organizer
  result, deployment, remote CI result, or final candidate SHA is claimed.
- P2 dependency and coordinator-integration SHAs, owned-path summaries,
  verification gates, rollback, and limitations are recorded in
  [P2-B-IMPLEMENTATION-RECORD.md](../../docs/competition/h2-sentinel/P2-B-IMPLEMENTATION-RECORD.md).
- The operator path, exact commands, environment-variable names, 16-column
  order, signs, and troubleshooting are recorded in
  [OPERATOR_RUNBOOK.md](OPERATOR_RUNBOOK.md).
- Coordinator commit `40b3d391f42a13071f959bd753456afb9e02b2d5`
  adds strict `H2_STREAMING_IMPORT_ENABLED=true` Local opt-in. Fresh final-SHA
  launcher/Web evidence is still required before claiming full training-file
  import.

## Delivered

- Exact official 69-field slice preparation with strict source hashes,
  earliest-C04 selection, inclusive 30-minute padding, label exclusion,
  ignored output, and relative-path manifest receipts.
- C01-C07 event-level evaluation, disjoint-window overfit sentinel, exact
  affected-equipment submission checker, and full test-set offline smoke.
- A reproducible two-execution scripted local workflow covering import,
  analysis, evidence read, review, Q09 diagnosis, review audit, and submission.
- QA fixtures for official vocabulary, event matching, equipment tokens,
  package-integrity wording, P1 regressions, and detector-input privacy.
- Updated submission evidence that distinguishes historical snapshots,
  repeatable integrated facts, and final coordinator-owned evidence.

## Verification

Lane C verification comprises the complete Node contract/tool suite,
`npm run h2:qa`, supported launcher tests, the submission package checker, a
changed-path/ignored-output audit, and `git diff --check`. Exact outcomes and
the Lane C commit SHA are carried in the Orca `worker_done` message.

## Exact final coordinator gates

After integrating Lane A and Lane B, the coordinator must run from one clean
final candidate SHA:

1. full repository, H2, Python, build, and launcher checks;
2. official validation evaluation with overall and C01-C07 metrics;
3. the disjoint train-window overfit sentinel;
4. full official test-set offline smoke plus exact submission checker;
5. two consecutive scripted validation-slice executions plus receipt
   validation;
6. desktop and 390x844 visual inspection with retained screenshots; and
7. changed-path, ignored-output, official-data absence, source-integrity, and
   package-wording audits.

Generated official files must remain ignored and untracked. Project
`MEMORY.md` remains coordinator-owned and was not updated by Lane C.
