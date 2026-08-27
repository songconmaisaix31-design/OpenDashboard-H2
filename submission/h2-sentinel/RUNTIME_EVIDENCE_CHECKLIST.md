# H2 Sentinel P1 Runtime Evidence Checklist

## Candidate record

- P1-W1 baseline: `4c856eb`.
- P1-W3 QA integration: `56eef02` on the coordinator branch.
- Integrated Web behavior candidate: `a7f7093`; the exact final documentation
  HEAD is recorded externally by Git because a commit cannot self-reference.
- Official package/slice: not supplied or generated in P1-W3.
- Timed receipt: not produced in P1-W3.

| ID | Required evidence | Worker status | Final release rule |
| --- | --- | --- | --- |
| R01 | Exact candidate SHA and clean changed-path audit | Coordinator verified | Record final SHA externally; only accepted commits and intentional untracked nested worktrees may remain. |
| R02 | Official source files and expected SHA-256 values | Not supplied | Resolve from an authorized public package; do not search credentials or infer hashes. |
| R03 | Earliest C04 slice manifest and detector CSV | Tool implemented; synthetic tests passed | Run on the explicit package into an ignored directory; verify 30-minute padding, coverage, and label removal. |
| R04 | Official Q01–Q10 deterministic answers | Integrated automated and Fixture runtime pass | Both allowLlmRendering values, citation invariants, context errors, H2Qxx rejection, and runtime Q09 were verified. |
| R05 | Human review transitions and reliability | Integrated automated pass; runtime confirm observed | Every transition/replay/conflict boundary passed automation; C03 revision 1 and independent C04 revision 0 were observed. |
| R06 | Detector/submission immutability after review | Integrated automated pass | Before/after event snapshots and exact submission.csv bytes remained unchanged. |
| R07 | Review-audit export | Integrated automated and Fixture runtime pass | Runtime JSON contained both events, revision 1, UTF-8 note, actor notice, and stable artifact metadata. |
| R08 | Chinese report structure and safety | Integrated automated and Fixture runtime pass | Generated diagnosis/PCC HTML was zh-CN, safe, script-free, provenance-labelled, and hash-described. |
| R09 | Validation-slice provenance across Web and reports | Integrated automated pass; official slice not run | Prepared-slice provenance passes assembled Local QA; an authorized slice runtime remains unavailable. |
| R10 | Exact report kind/format/media/hash matrix | Integrated automated pass | Available kinds pass; unlabeled validation_metrics fails explicitly instead of returning zero metrics. |
| R11 | Fixture fallback separation | Integrated automated and runtime pass | Fixture report/UI remained Chinese and visibly FIXTURE, never validation evidence. |
| R12 | Two consecutive measured runs below 180 seconds | Not run | Receipt validator must pass against final SHA, exact manifest, and distinct per-run artifacts. |
| R13 | Desktop and 390x844 rendering | Primary Fixture flows passed | 1427px desktop and 390x844 review, assistant, and report views had no page overflow, visible-control clipping, or overlap; official-slice/conflict screenshots remain uncaptured. |
| R14 | Required project checks | Coordinator pass | TypeScript, h2:check, 52 Python tests, Ruff, Mypy, 91 repository tests, production build, and diff checks passed. |
| R15 | Organizer result, full validation, deployment, remote CI | Not evidenced | Keep all claims false unless separate authoritative evidence is produced. |

## P1-W3 command set

    node --test "tests/h2-sentinel/contract/*.test.mjs"
    npm run h2:qa
    npm run h2:launcher:test
    node tests/h2-sentinel/golden-path/run-offline-golden-path.mjs
    pwsh -NoProfile -File submission/h2-sentinel/scripts/validate-submission.ps1
    git diff --check

The worker handoff preserves its original pass/fail results. The coordinator
resolved the Open integration gate and recorded new integrated evidence rather
than rewriting worker-local failures as historical passes.

## Timed receipt interpretation

A passing receipt proves that the referenced local artifacts and timestamps
meet the P1 evidence schema for two runs on the named target environment. It
does not prove full validation, hidden testing, organizer scoring, deployment,
remote CI, production behavior, or correctness beyond the recorded slice.
