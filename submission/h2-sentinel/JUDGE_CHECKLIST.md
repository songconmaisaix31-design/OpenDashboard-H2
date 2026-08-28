# H2 Sentinel P1 Judge Checklist

## Current evidence status

- The product is local-first diagnosis and operations assistance; it issues no
  equipment commands and every recommendation requires a person.
- Repeatable integrated QA covers Q01-Q10, review, Q09, reports, audit,
  submission immutability, provenance, and launcher boundaries.
- Lane C supplies the official-data evaluator, overfit sentinel, exact
  submission checker, offline test-set smoke, and two-execution demo runner.
- The package remains read-only: all data/material entries plus the workbook
  match, 21 of 24 total manifest entries; three top-level requirement/README
  Markdown or DOCX files differ.
- Final official metrics, screenshots, measured receipt, checker verdict, and
  candidate SHA remain coordinator-owned until rerun after integration.

## Before the judge session

- [ ] Record one clean exact final integrated SHA.
- [ ] Run the full repository, H2, Python, build, and launcher gates from it.
- [ ] Prepare the validation slice using independently obtained source hashes.
- [ ] Confirm the detector CSV has exactly the official 69 fields, contains no
      label columns, and the manifest contains only relative paths.
- [ ] Run official validation evaluation and inspect C01-C07 per-class output.
- [ ] Run the disjoint train-window overfit sentinel.
- [ ] Import/analyze/export the full public test set and pass the exact
      submission checker.
- [ ] Complete two consecutive scripted executions, each strictly below 180,000 ms,
      with `publicLabelsUsedAsDetectorInput: false`.
- [ ] Validate the receipt, manifest, source hashes, and every artifact hash.
- [ ] Capture desktop and 390x844 official-slice, review, conflict, Q09,
      report, audit, and submission states.
- [ ] Confirm generated official files remain ignored and untracked.
- [ ] Reconfirm the 21-of-24 package-integrity wording without modifying the
      package.

## Judge-visible flow

| Item | Required evidence | Failure condition |
| --- | --- | --- |
| Provenance | LIVE_ANALYSIS · 验证集切片, fingerprints, range, row count | Fixture or generic Live wording is shown for the primary run. |
| Detection | C04 is produced from the 69-field detector input only | A label column or manifest content reaches analytics. |
| Evidence | Timing, variables, limits, impact formula/unit/assumptions, quality | A public label, alert, or single point is presented as detector proof. |
| Human review | Allowed transition, note, revision, actor notice, conflict behavior | Review silently overwrites a revision or implies authenticated identity. |
| Assistant | Exact Q09, deterministic Chinese sections, valid citations, matching report | H2Qxx, dangling citations, or LLM-dependent core output appears. |
| Reports | Chinese UTF-8 HTML, provenance, safety, escaping, matching SHA-256 | English judge-facing output, unsafe markup, path, secret, or fabricated metric appears. |
| Audit/submission | Full review audit and unchanged exact 16-column submission | Review fields enter submission or detector identity changes. |
| Timing | Two distinct execution IDs below 180 seconds | One execution, overwritten artifacts, a nonpositive stage, or hash drift. |

## Plain answers

1. **Does H2 Sentinel control equipment?** No. It provides diagnosis and
   advisory recommendations that require human confirmation.
2. **Are public labels detector input?** No. They are used only after analysis
   for evaluation and remain outside the detector CSV.
3. **Is a validation slice full validation?** No. It is a bounded public-data
   slice around the earliest C04 event.
4. **Does the package fully match its manifest?** No. Twenty-one of 24 total
   entries match; the three top-level requirement/README Markdown or DOCX
   files differ.
5. **Is any result an organizer score or hidden-test result?** No.
6. **Has the three-minute target passed?** Only after the final candidate's
   two-execution receipt passes the validator; no final receipt is claimed.
7. **Can Fixture replace a failed Live execution?** No.
