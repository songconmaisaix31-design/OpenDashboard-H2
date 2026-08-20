# QA Script Inventory

The QA scripts are intentionally plain Node programs so H6 can invoke them
without adding a root package script or dependency.

- `../run-contract-qa.mjs`: frozen H0 fixture, schema, provenance, impact, and
  export-boundary checks; it returns non-zero for a contract contradiction.
- `../api/run-api-safety.mjs`: loopback health and public redacted-error probe
  when H6 supplies `H2_ANALYTICS_URL` and optionally `H2_API_FAILURE_URL`.
- `../golden-path/run-offline-golden-path.mjs`: loopback H2 Web entry smoke
  probe when H6 supplies `H2_WEB_URL`; browser-level assertions remain an
  assembly task until the route contract is published.
