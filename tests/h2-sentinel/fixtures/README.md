# QA Fixture Policy

This QA lane currently adds no data fixture. Contract-only checks consume the
canonical `packages/h2-contracts/fixtures/` assets, which are explicitly
synthetic, sanitized, small, deterministic, and Fixture-provenanced.

Any future fixture added here must be synthetic or explicitly redistributable,
minimal for its test, deterministic, and labeled with provenance. Official
competition data, user uploads, secrets, model binaries, and absolute paths are
prohibited.
