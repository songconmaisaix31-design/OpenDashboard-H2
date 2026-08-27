# H2 Sentinel P1 Judge Checklist

## Current evidence status

- Product boundary: local-first diagnosis and operations assistance; no
  equipment commands; every operational recommendation requires a person.
- Contract baseline: W1 defines the official Q01–Q10 identifiers,
  deterministic Chinese answers, review journal, Chinese report kinds, and
  review-audit export.
- QA tooling: P1-W3 includes zero-dependency slice preparation and measured
  receipt validation with synthetic fail-closed tests.
- Integration status: W2, independent P1 QA, and the provenance correction are
  integrated; final local checks and primary Fixture visual review passed.
- Timed status: no official slice and no two-run receipt were produced. A
  sub-180-second claim is prohibited. P1-W3 produced no such receipt, and the
  final coordinator did not invent one.

## Before the judge session

- [x] Record the exact final integrated commit SHA in the coordinator handoff.
- [x] Run all final integrated checks from the final candidate.
- [ ] Prepare the validation slice from an explicit official-package directory
      with independently obtained expected source hashes.
- [ ] Confirm validation-slice.csv contains no label columns.
- [ ] Confirm the measured receipt records
      publicLabelsUsedAsDetectorInput: false.
- [ ] Confirm the manifest selects the earliest public C04 event and records
      every overlapping public label separately.
- [ ] Start services before timing and record that exclusion.
- [ ] Complete two consecutive Live runs, each strictly below 180,000 ms.
- [ ] Validate the receipt, manifest hash, source hashes, and all six per-run
      artifact hashes.
- [ ] Capture the remaining official-slice and review-conflict visual states.
      Primary Fixture flows passed desktop and 390x844 inspection, including
      review, Q09, Chinese reports, and generated download bytes.
- [x] Confirm no official data, generated slice, labels, receipt, or artifacts
      are tracked by Git.

## Judge-visible flow

| Item | Required evidence | Failure condition |
| --- | --- | --- |
| Provenance | LIVE_ANALYSIS · 验证集切片, source fingerprint, manifest fingerprint, time range, and row count | Fixture or generic Live wording is shown for the primary run. |
| Detection | C04 is produced from detector input only | Public-label columns or manifest content are sent to analytics. |
| Evidence | Timing, variables, limits, exact impact, formula, unit, assumptions, and quality are visible | A label, alert, or single point is presented as proof. |
| Human review | Allowed transition, note, revision, local-unverified actor notice, and conflict behavior | Review silently overwrites a revision or implies authenticated identity. |
| Assistant | Official Q09, deterministic Chinese sections, valid citations, matching diagnosis report | H2Qxx, dangling citations, or LLM-dependent core output appears. |
| Reports | Chinese UTF-8 HTML, safety statement, provenance, safe escaped input, matching SHA-256 | English judge-facing report, unsafe markup, path, secret, or fake zero metric appears. |
| Audit and submission | Full review audit plus unchanged detector event and exact 16-column submission | Review fields enter submission.csv or event identity changes. |
| Timing | Two distinct, consecutive passing receipts below 180 seconds | One run, a run at/above 180 seconds, overwritten artifacts, or hash drift. |

## Plain answers

1. **Does H2 Sentinel control equipment?** No. It provides monitoring,
   diagnosis, quantified evidence, and advisory recommendations that require
   human confirmation.
2. **Are public labels detector input?** No. They remain in an ignored QA
   manifest and are used only after analysis for provenance/comparison.
3. **Is a validation slice full validation?** No. It is a bounded public-data
   slice around one C04 event.
4. **Is the result an organizer score or hidden-test result?** No.
5. **Has the three-minute target passed?** Only if the final integrated receipt
   validator accepts two consecutive measured runs. P1-W3 produced no such receipt,
   and no final receipt exists.
6. **Can Fixture replace a failed Live run?** No. Fixture is a separately
   labeled synthetic fallback and is excluded from the validation receipt.
