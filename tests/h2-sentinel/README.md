# H2 Sentinel Independent Remediation QA

This lane owns `validation/**`, `tests/h2-sentinel/**`, and
`submission/h2-sentinel/**`. It consumes product contracts and public
loopback APIs without changing analytics, Web, plugins, root configuration, or
the read-only official package.

## Automated gates

```text
node --test "tests/h2-sentinel/contract/*.test.mjs"
npm run h2:qa
npm run h2:launcher:test
```

The contract suite covers:

- exact official 69-field timeseries vocabulary;
- C01-C07 event matching and per-class metrics;
- exact affected-equipment submission tokens and 16-column shape;
- strict source hashes, earliest C04 selection, 30-minute padding, label
  exclusion, ignored output, and absence of workstation paths;
- Q01-Q10, review, assistant, report, audit, and submission regressions;
- two-execution receipt ordering, timing, provenance, and artifact hashes.

The assembled runner remains the mandatory runtime regression for P1 review,
assistant, Q09 diagnosis, reports, audit, submission immutability, loopback
boundaries, and launcher cleanup.

## Official-data tools

See `validation/README.md` for evaluation, overfit, submission checker,
offline test-set smoke, and the two-run demo runner. See
`scripts/README.md` for hash-locked C04 slice preparation and receipt
validation.

Generated official files stay ignored and untracked under
`tests/h2-sentinel/reports/generated/`. Public labels may appear only in the
QA manifest or post-analysis evaluation, never in detector CSV input.

## Evidence boundary

Passing Lane C tests proves the tools and fixtures in this commit. The final
official metrics, retained screenshots, measured receipt, and candidate SHA
remain coordinator-owned until rerun after all lanes are integrated. Fixture,
HTTP success, route presence, or synthetic receipts cannot substitute for
those gates.
