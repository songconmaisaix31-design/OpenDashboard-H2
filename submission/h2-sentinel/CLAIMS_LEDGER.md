# H2 Sentinel P1 Claims Ledger

Use the narrowest wording supported by the named evidence. The final integrated
commit and its fresh verification supersede worker-checkout and historical H6
records.

| ID | Wording | Current classification | Required evidence or boundary |
| --- | --- | --- | --- |
| C01 | “The frozen P1 contract uses the official Q01 through Q10 identifiers and exact Chinese prompts.” | Implemented contract fact | W1 contract source plus P1-W3 contract conformance test. Do not infer Web integration until W2 is merged and rerun. |
| C02 | “P1 defines an append-only local review journal with optimistic concurrency and idempotent request IDs.” | Implemented contract/backend fact | W1 contract and analytics implementation. Local actor names are unverified attribution, not authentication. |
| C03 | “Review state is separate from detector evidence and the frozen 16-column submission.” | Contract and QA requirement | Final integrated QA must show event/submission snapshots unchanged after review. |
| C04 | “P1-W3 provides a zero-dependency tool that verifies explicit source hashes and prepares an ignored C04 validation slice without label columns.” | Worker implementation evidence | Tool source and synthetic success/failure tests. This does not prove an official package was processed. |
| C05 | “P1-W3 provides a validator for two distinct consecutive measured runs under 180 seconds each.” | Worker implementation evidence | Validator source and synthetic boundary/hash-drift tests. This does not prove the final demo met the target. |
| C06 | “All operational recommendations require human confirmation; the app does not issue equipment commands.” | Product and contract fact | Frozen product boundary, assistant/report safety fields, and final UI review. |
| C07 | “Fixture is a sanitized synthetic fallback.” | Historical and current contract boundary | Always display FIXTURE; never call it validation, official data, a plant run, or a score. |
| C08 | “The primary demo used a public-validation slice.” | Unverified in this worker checkout | Requires explicit official source hashes, generated manifest/input hashes, final integrated Live run, and retained local receipt. |
| C09 | “Two consecutive validation-slice runs completed in under 180 seconds each.” | Unverified in this worker checkout | Requires a passing validate-demo-receipt.mjs result for the exact final integrated SHA and all referenced artifacts. |
| C10 | “Validation precision, recall, F1, delay, per-class results, score, rank, or approval are X.” | Prohibited without separate evidence | Requires labels, split identity, matching definition, implementation/config version, and measured artifact. A validation metric is still not an organizer score. |
| C11 | “The application passed hidden testing or received an organizer score/approval.” | Prohibited | Only an organizer artifact could support this claim. |
| C12 | “The application is deployed, online, production-ready, or published on main.” | Unverified | Requires separate deployment, runtime, publication, and production evidence. |
| C13 | “Remote CI verified the final candidate.” | Unverified | A committed workflow is insufficient; cite a specific successful remote run only after it exists. |
| C14 | “The validation-slice provenance is correctly visible across Web and reports.” | Pending final integration | Requires W2 integration, analytics provenance correction where needed, assembled QA, and manual rendering inspection. |

## Forbidden transformations

- Computed or matched SHA-256 values do not prove source authorization.
- A prepared slice does not prove the detector ran.
- One successful run does not prove the two-run timing gate.
- A valid local receipt does not prove an organizer score, hidden test,
  deployment, production readiness, or full validation.
- Fixture and generic Local smoke do not become validation-slice evidence.
- HTTP success, route presence, document review, or screenshots do not replace
  behavior and artifact verification.
- Review history never becomes control authority or authenticated identity.
