# H2 Sentinel P2 B-Line Judge Checklist

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
- Reviewed P2 source adds bounded session upload, bounded NLU, optional StepFun
  restatement, C01-C07 dedicated chart selection, doctor/check-all, and CI.
  Strict Local streaming opt-in is implemented; final integrated full-file
  runtime evidence is still pending, so do not present source presence alone
  as a completed operator flow.

## Before the judge session

- [ ] Record one clean exact final integrated SHA.
- [ ] Run the full repository, H2, Python, build, and launcher gates from it.
- [ ] Run `node scripts/h2-sentinel/doctor.mjs --mode local`, then
      `node scripts/h2-sentinel/check-all.mjs` on free loopback ports.
- [ ] Set exact `H2_STREAMING_IMPORT_ENABLED=true`, restart Local, and confirm
      the strict opt-in before attempting the 236991870-byte training file.
- [ ] Probe bounded NLU matches, ambiguity, overlength, and equipment-control
      refusal; retain the official Q01-Q10 buttons.
- [ ] Inspect C01-C07 dedicated chart selection and missing-series fallback at
      desktop and 390x844 without invented values or mixed-unit axes.
- [ ] If StepFun is authorized, confirm the disclosure, strict opt-in,
      bounded payload, provenance, and deterministic fallback; otherwise keep
      it disabled and complete the offline path.
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
| Full import | Exact `H2_STREAMING_IMPORT_ENABLED=true`, ordered 8 MiB-or-smaller chunks, progress, immutable retry, hash-checked finalization, external file identity | Opt-in is absent/invalid, any label field reaches detection, or a slice is described as the full file. |
| Bounded NLU | Q01-Q10 match or explicit refusal with current context | Arbitrary fallback question, overlength acceptance, or control-request routing. |
| Optional StepFun | Clearly labeled restatement or deterministic fallback; disclosure names the bounded cloud payload | Raw CSV/measurements/review/report/control data are sent, or output changes facts/citations/safety. |
| C01-C07 charts | Dedicated canonical series or visible evidence fallback, with correct units/signs | Fabricated series, PCC/storage sign reversal, or mixed units on one unlabeled axis. |

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
8. **Is full training-file import proven through the normal launcher?** No.
   Strict runtime opt-in, source capability, and adapter are integrated, but
   the final clean candidate still requires a fresh full-file launcher/Web run.
9. **Does StepFun decide facts or actions?** No. It is an optional restatement
   layer over deterministic text and citation IDs, and failures fall back.
