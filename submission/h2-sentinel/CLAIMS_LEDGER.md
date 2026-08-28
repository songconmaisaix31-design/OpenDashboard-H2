# H2 Sentinel P1 Claims Ledger

Use the narrowest wording supported by fresh evidence from the named SHA.
Historical worker failures and old integration results remain historical; they
cannot be promoted into final-candidate proof.

| ID | Wording | Current classification | Required evidence or boundary |
| --- | --- | --- | --- |
| C01 | “The integrated P1 contract uses official Q01 through Q10 identifiers and exact Chinese prompts.” | Repeatable integrated fact | Contract/source conformance and assembled runtime QA on the final candidate. |
| C02 | “Review is an append-only local journal with optimistic concurrency and idempotent request IDs.” | Implemented boundary | Contract/backend tests; local actor labels remain unverified attribution. |
| C03 | “Review does not mutate detector evidence or the frozen 16-column submission.” | Repeatable integrated fact | Before/after event snapshots, audit checks, and byte-identical submission export. |
| C04 | “Lane C prepares an ignored C04 slice from explicit hash-locked sources without label columns.” | Tool implementation evidence | Tool source and synthetic success/failure tests; this does not prove a final official run. |
| C05 | “Lane C records two separate scripted executions and validates each measured path below 180 seconds.” | Tool implementation evidence | Runner, validator, and synthetic boundary/hash-drift tests; this does not prove the final target passed. |
| C06 | “All operational recommendations require human confirmation; the app issues no equipment commands.” | Product and contract boundary | Safety contract, assistant/report fields, and final runtime review. |
| C07 | “Fixture is a sanitized synthetic fallback.” | Contract boundary | Always display FIXTURE; never call it validation, official data, a plant run, or a score. |
| C08 | “The official package has full manifest integrity.” | Prohibited | Only 21 of 24 total manifest entries match: all data/material entries plus the workbook match, while three top-level requirement/README Markdown or DOCX files differ. |
| C09 | “The primary demo used a public-validation slice.” | Pending final-candidate evidence | Requires matching source hashes, generated manifest/input hashes, final integrated Live execution, and retained receipt. |
| C10 | “Two consecutive validation-slice executions completed in under 180 seconds each.” | Pending measured receipt | Requires a passing receipt validator result for the exact final integrated SHA and all referenced artifacts. |
| C11 | “Validation precision, recall, F1, delay, per-class results, score, rank, or approval are X.” | Prohibited without the generated report | Requires split identity, labels, matching version, config, candidate SHA, and measured artifact. A validation metric is not an organizer score. |
| C12 | “The application passed hidden testing or received organizer approval.” | Prohibited | Only an organizer artifact could support this claim. |
| C13 | “The application is deployed, online, production-ready, published on main, or remotely CI-verified.” | Pending separate evidence | Requires separate deployment, publication, runtime, and named remote-run evidence. |
| C14 | “Prepared-slice provenance is preserved across Web and reports.” | Repeatable integrated fact; official-slice rerun pending | Assembled Local QA must pass on the final candidate; Fixture cannot substitute for the official slice. |

## Package integrity wording

The permitted statement is: “The package remained read-only; all
data/material entries plus the workbook match, 21 of 24 total manifest
entries, while three top-level requirement/README Markdown or DOCX files
differ.” Do not shorten this to “the package matches.”

## Forbidden transformations

- Matching hashes do not prove source authorization.
- A prepared slice does not prove the detector ran.
- One execution does not prove the two-execution timing gate.
- A valid local receipt does not prove organizer scoring, hidden testing,
  deployment, production readiness, or full validation.
- Fixture and generic Local smoke do not become validation-slice evidence.
- HTTP success, routes, document review, or screenshots do not replace
  behavior and artifact verification.
- Review history never becomes control authority or authenticated identity.
