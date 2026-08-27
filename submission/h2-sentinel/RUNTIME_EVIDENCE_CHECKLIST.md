# H2 Sentinel P1 Runtime Evidence Checklist

## Candidate record

- P1-W1 baseline in this worker checkout:
  4c856eb (feat(h2): add P1 assistant review and report contracts).
- P1-W3 QA commit: recorded in the worker handoff after commit.
- Final integrated candidate SHA: coordinator-owned and intentionally not
  inferred from this worker branch.
- Official package/slice: not supplied or generated in P1-W3.
- Timed receipt: not produced in P1-W3.

| ID | Required evidence | Worker status | Final release rule |
| --- | --- | --- | --- |
| R01 | Exact candidate SHA and clean changed-path audit | Pending coordinator | Record final SHA; ensure only accepted commits and no generated data are present. |
| R02 | Official source files and expected SHA-256 values | Not supplied | Resolve from an authorized public package; do not search credentials or infer hashes. |
| R03 | Earliest C04 slice manifest and detector CSV | Tool implemented; synthetic tests passed | Run on the explicit package into an ignored directory; verify 30-minute padding, coverage, and label removal. |
| R04 | Official Q01–Q10 deterministic answers | Backend QA authored | Final integrated run must pass both allowLlmRendering values, citation invariants, context errors, and H2Qxx rejection. |
| R05 | Human review transitions and reliability | Backend QA authored | Final run must pass every allowed transition, replay, stale revision, request-ID conflict, missing note, and forbidden transition. |
| R06 | Detector/submission immutability after review | Backend QA authored | Compare before/after event snapshots and exact submission.csv bytes. |
| R07 | Review-audit export | Backend QA authored | Include revision-zero events, ordered entries, UTF-8 notes, unverified actor notice, and matching content hash. |
| R08 | Chinese report structure and safety | Backend QA authored; Fixture adapter integration pending | Verify UTF-8 zh-CN, required sections, escaped actor/note/filename, provenance, safety text, no scripts/remotes/paths/secrets. |
| R09 | Validation-slice provenance across Web and reports | Open integration gate | Generic LIVE_ANALYSIS · 本地导入数据 is insufficient for the prepared slice; require LIVE_ANALYSIS · 验证集切片. |
| R10 | Exact report kind/format/media/hash matrix | Backend QA authored | Seven available kinds pass; unlabeled validation_metrics must fail explicitly instead of returning zero metrics. |
| R11 | Fixture fallback separation | W2 integration pending | Fixture report/UI must remain Chinese and visibly FIXTURE, never validation evidence. |
| R12 | Two consecutive measured runs below 180 seconds | Not run | Receipt validator must pass against final SHA, exact manifest, and distinct per-run artifacts. |
| R13 | Desktop and 390x844 rendering | Coordinator manual | Inspect overflow, overlap, focus, disabled/loading, conflict recovery, report downloads, and provenance. |
| R14 | Required project checks | Pending final integration | Run typecheck, h2:check, Python tests, repository tests, build, diff check, and clean status from final commit. |
| R15 | Organizer result, full validation, deployment, remote CI | Not evidenced | Keep all claims false unless separate authoritative evidence is produced. |

## P1-W3 command set

    node --test "tests/h2-sentinel/contract/*.test.mjs"
    npm run h2:qa
    npm run h2:launcher:test
    node tests/h2-sentinel/golden-path/run-offline-golden-path.mjs
    pwsh -NoProfile -File submission/h2-sentinel/scripts/validate-submission.ps1
    git diff --check

The worker records exact pass/fail results in its handoff. Failures caused by a
not-yet-integrated W2 lane or an exposed cross-track provenance defect remain
failures; they are not converted into worker-local passes.

## Timed receipt interpretation

A passing receipt proves that the referenced local artifacts and timestamps
meet the P1 evidence schema for two runs on the named target environment. It
does not prove full validation, hidden testing, organizer scoring, deployment,
remote CI, production behavior, or correctness beyond the recorded slice.
