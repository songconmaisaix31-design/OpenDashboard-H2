# P2 B-Line Implementation Record

## Scope and evidence boundary

This record describes source behavior present in reviewed commits. It is not a
final-candidate verification receipt. Coordinator integration
`ff0af717ff0197bc8adaca620ef8b184c5788368` wires the canonical route map,
streaming/NLU adapter methods, and rendered-answer validation;
`40b3d391f42a13071f959bd753456afb9e02b2d5` adds strict runtime streaming
opt-in. Final full checks and runtime inspection remain coordinator-owned.

No organizer score, completion percentage, hidden-test result, deployment,
production readiness, clean-machine result, or remote-CI result is claimed.
Fixture, screenshots, HTTP success, and local smoke remain bounded local
evidence.

## Provenance

| Track | Reviewed commits | Owned-path summary |
| --- | --- | --- |
| P2 base | `a4c616838c236d59f0b741dc81a42e410a76d9b5` (`p2-base`) | Additive contracts, disabled-by-default settings, focused contract tests, and the delivery specification. |
| Backend | `a3f64cafd8194596e2448298108ad8b91aa16ea8`, `2d5c34c6e55ef30d161e07cc8617b6ad08715e37`, `c9084fbfcb30e8857bb00ed5de0be00345484c35` | Session ingestion/API, bounded NLU, deterministic answer parameterization, optional StepFun rendering, retention/cleanup, submission normalization, and tests under `services/h2-analytics/**`. |
| Web | `3559ceb0e3c7ff3b0749e1df697031286969c04d`, `969c2a34b82679f558263cd554ac8315f5a4fe03`, `210228ba59fcd14b6519d4174523744ba4f915fa` | Chunked upload UI, NLU/refusal flow, StepFun disclosure/fallback labels, C01-C07 chart selection, responsive states, and feature-local tests. |
| Delivery | `16e26ad1db88847e1a95914a59320cdd0da214f1`, `4efef7cecbfdcb6c4e9ab18304a4557309231dce` | Doctor, check-all, checker regressions, equipment-token aliases, loopback smoke isolation, provider-free CI, and tests. |
| Coordinator integration | `ff0af717ff0197bc8adaca620ef8b184c5788368`, `40b3d391f42a13071f959bd753456afb9e02b2d5` | `plugins/h2-ems/**` capability wiring and validation, `ROUTES.json` synchronization, and strict runtime streaming opt-in. |

The external read-only training-file identity is size `236991870` bytes and
SHA-256
`67513c9b1d443d25eb1258a6f58252c02cdb438f701a7921e2f8dacc365a6c51`.
The file is not bundled evidence.

## Implemented source behavior

- Session upload contracts and backend enforce ordered chunks up to 8 MiB,
  byte-identical retry, declared totals and hash finalization, 256 MiB and
  600,000-row ceilings, TTL cleanup, and bounded active/retained sessions.
- The legacy single-request import remains available within its 96 MiB and
  180,000-row limits. Label-bearing detector input is rejected.
- Bounded NLU returns Q01-Q10 or refusal; 500 characters is the public input
  ceiling. Control requests fail closed.
- StepFun rendering is strict opt-in through `H2_LLM_ENABLED`,
  `STEPFUN_API_KEY`, and `H2_LLM_MODEL`. Only bounded deterministic answer text
  and citation IDs are sent. Provider output is presentation-only and falls
  back without changing authoritative data.
- The Web publishes dedicated C01-C07 chart configurations and retains the
  event-evidence fallback when required canonical series are unavailable.
- Delivery tooling includes `doctor.mjs`, `check-all.mjs`, the exact
  16-column checker, measured demo tooling, offline smoke, and provider-free
  CI.

The documentation lane changes only `submission/h2-sentinel/**` and this
record under `docs/competition/h2-sentinel/`; it does not modify product code,
configuration, tests, runtime evidence, or the accepted delivery specification.

## Known limitations and open verification gates

- Streaming remains disabled by default. Commit `40b3d391` makes exact
  `H2_STREAMING_IMPORT_ENABLED=true` enable it in the standard runtime;
  unset/`false` keeps it disabled and any other value fails startup. The
  final clean candidate still requires full-file launcher/Web verification.
- Worker-reported official-train session finalization constructed the backend
  capability directly. It is local implementation evidence, not proof of the
  standard launcher path, clean-machine behavior, production behavior, or
  organizer acceptance.
- StepFun tests do not call the provider. Network availability, account/model
  access, provider behavior, and data-processing authorization require
  separate operator evidence. The offline deterministic path remains primary.
- Dedicated charts fall back when canonical fields are unavailable; fallback
  is truthful but does not prove every official dataset supplies every series.
- The supplied package has known top-level manifest differences described in
  the submission claims ledger. It must remain read-only.

## Expected final verification matrix

| Gate | Exact command or observation | Current status |
| --- | --- | --- |
| Environment | `node scripts/h2-sentinel/doctor.mjs --mode local` | Implemented; final candidate and clean-machine runs pending. |
| Deterministic full gate | `node scripts/h2-sentinel/check-all.mjs` | Implemented; coordinator final-SHA rerun pending. |
| Submission package | `pwsh -NoProfile -File submission/h2-sentinel/scripts/validate-submission.ps1` | Passed in the documentation lane; coordinator final-SHA rerun required. |
| Full training import | Set exact `H2_STREAMING_IMPORT_ENABLED=true`, then use browser Local session import with the hash-locked external file | Runtime opt-in implemented; final clean-SHA launcher/Web run pending. |
| NLU | Q01-Q10 paraphrase, ambiguity, overlength, and control-request probes | Worker tests reported; integrated runtime inspection pending. |
| StepFun off/fallback | Provider-free deterministic answer and provenance | Worker tests reported; integrated runtime inspection pending. |
| StepFun opt-in | Authorized account/model, bounded payload, validated restatement, fallback | No live-provider evidence; optional and not a release blocker for offline core. |
| Charts | C01-C07 dedicated and missing-series fallback at desktop and 390x844 | Worker tests and bounded Web observations reported; integrated final-SHA visual QA pending. |
| Offline test smoke | `node validation/offline-deploy-smoke.mjs --official-data <data-directory> --output <new-generated-directory>` | Final-SHA rerun pending. |
| Measured demo | `node validation/run-demo.mjs --manifest <validation-slice-manifest.json> --output <new-generated-artifacts-root> --candidate-commit <40-character-clean-HEAD-sha>` | Final-SHA two-run receipt pending. |
| Remote CI | Named GitHub Actions run for the final published SHA | Not evidenced. |
| Release claims | Organizer, hidden test, deployment, production, clean machine | Not evidenced. |

## Documentation-lane verification

- The submission-package validator passed with 10 required documents, 10
  narrative pages, valid local links, and the required evidence boundaries.
- `git diff --check` passed, referenced scripts were present at `40b3d391`, and
  the documented 16-column order matched the canonical contract.
- `npm run h2:qa` passed 79 contract tests and five static QA groups, then its
  assembled runtime groups stopped because Vite is not installed in this
  documentation worktree. This is not a final integrated QA pass; the
  coordinator must rerun from the assembled candidate with locked dependencies.

## Rollback

- Disable optional rendering by leaving `H2_LLM_ENABLED` unset or not equal to
  `true`; deterministic answers remain authoritative.
- Leave `H2_STREAMING_IMPORT_ENABLED` unset or `false` to disable session
  imports. Use the legacy bounded import only for files within its limits; do
  not turn a slice result into a full-file claim.
- Preserve the event-evidence chart fallback if dedicated series are absent.
- Revert coordinator glue independently if canonical route/capability parity
  fails; do not weaken contracts, checker rules, safety wording, or the frozen
  submission columns.
