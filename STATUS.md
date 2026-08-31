# Project Status

**FROZEN / RESULT PENDING**

- Competition: SPD Bank IGNITE Future Energy Hackathon.
- Progress: preliminary top 20; semifinal completed.
- Final result: expected on 2026-09-10.
- Status recorded: 2026-08-31.

Until the final result is published, this repository must not be renamed or
archived, no Release may be created, and competition directories must not be
moved at scale. Productization and algorithm development are outside this
freeze cleanup.

## Evidence status

| Evidence class | Current statement |
| --- | --- |
| Competition result | Preliminary top 20 and semifinal completion are recorded; the final result is pending. |
| Semifinal submission SHA | Not confirmed by repository evidence alone. No external submission receipt is committed, so this document does not guess. |
| Candidate: `gate-s6` | `738344fc6cfd90fa80b7306afcf065d076d5d1d9`; the tracked plan and freeze record identify it as the final freeze gate. |
| Candidate: audit-time `origin/main` | `60ecc9c16082a43e9ab0d505470dec000faaf15c`; it contains `gate-s6`, the delivery merge, documentation, and a later Local-import guard fix. This proves repository ancestry, not organizer receipt. |
| Local public validation | TP=69, FP=3, FN=1, F1=0.9718309859 and 69/69 matched-event classification. This is local public-data evidence, not an official score or hidden-test result. |
| Full-data import | A repository record reports a local loopback HTTP import of 236,991,870 bytes in 29 chunks and 525,600 rows. This is a local import outcome, not browser, clean-machine, production, or organizer evidence. |
| Fixture and local runs | Deterministic fallback, local tests, screenshots, and HTTP success remain bounded local evidence. |

## Human contributions

- The user selected the preliminary direction and implemented most of it.
- A friend advanced the algorithms during the semifinal and covered onsite
  semifinal issues.
- The user continued the full-data import and some platform integration.

## Repository freeze

The competition layout remains in place, including `plan0829/`, `submission/`,
`validation/`, and `services/`. Historical local branches and registered
worktrees were audited read-only and were not imported, deleted, or rewritten.
See [the 2026-08-31 freeze audit](docs/history/2026-08-31-freeze-audit.md).

`MEMORY.md` remains unchanged by this cleanup because no product contract or
implementation decision was added.
