# H2 Sentinel P1 Project Narrative

This narrative describes the P1 design and the evidence still required from the
final integrated commit. It does not claim an official-data run, timed pass,
full validation, hidden test, organizer result, deployment, production
readiness, remote CI, or committed screenshots.

## Page 1 — Operational problem

Weak-grid green-hydrogen operations span PCC boundaries, storage direction,
electrolyzer allocation, changing capacity, and imperfect data. A useful tool
must do more than raise an alarm: it must make the evidence, impact,
uncertainty, safety boundary, and next human decision inspectable.

H2 Sentinel focuses on that review loop. It does not replace the EMS and does
not create equipment-control authority.

## Page 2 — Evidence-first product

Each anomaly event retains timing, first detection, code/subtype, affected
equipment, confidence, evidence, impact formula/unit/assumptions, safety checks,
recommendations, provenance, and review state. Facts, calculations, inferences,
and recommendations remain distinguishable.

The user impact is traceability: an operator can see what was measured, what was
derived, and what still requires judgment.

## Page 3 — Official assistant questions

P1 standardizes the official Q01 through Q10 identifiers and exact Chinese
prompts. Answers are deterministic and evidence-cited whether the compatibility
LLM flag is true or false. Event-specific questions reject missing or mismatched
context instead of silently returning a generic answer.

Q09 generates one matching Chinese event report. Every answer explicitly
refuses direct control authority.

## Page 4 — Human review without detector mutation

Review is a separate append-only journal. Confirm, reject, resolve, reopen, and
note actions follow an explicit state machine. Expected revisions surface
concurrent edits, and request IDs make accepted mutations exactly-once.

Review may change only the projected review state and journal. Event timing,
classification, evidence, impact, provenance, and submission mapping remain
analysis-owned.

## Page 5 — Auditable exports

The review-audit JSON includes every event, including revision-zero events, with
stable event and revision order plus an explicit notice that local actor labels
are unverified.

The competition submission remains exactly 16 columns. Review notes, actor
labels, revisions, and decisions never enter submission cells.

## Page 6 — Chinese report safety

Single-event diagnosis, period summary, PCC daily compliance, and quality
reports are designed as UTF-8 zh-CN HTML. They retain canonical IDs and exact
numeric values while localizing judge-visible structure and unavailable states.

Imported filenames, evidence text, actor labels, and review notes are untrusted
and must be escaped. Reports contain no scripts or required remote assets and
repeat the human-confirmation/no-control boundary.

## Page 7 — Public-validation slice

The primary demo input is a hash-locked slice around the earliest public C04
validation event. The requested range adds 30 minutes before event start and 30
minutes after event end.

Detector input excludes label columns. Public labels remain only in a separate
ignored QA manifest for post-analysis comparison and provenance. Neither the
official package nor generated data is committed.

## Page 8 — Three-minute evidence contract

Services start before timing, and that exclusion is disclosed. The measured
path covers import, analysis, evidence review, human review, Q09/report, and
audit/submission export.

The target may be claimed only after two distinct consecutive runs complete in
less than 180 seconds each and the validator recomputes the manifest and
artifact hashes for the exact final integrated SHA.

## Page 9 — Independent QA

P1-W3 adds contract checks, public-launcher/API assembled checks, slice-tool
tests, and receipt boundary tests without a new dependency. It tests legacy
question rejection, citation integrity, every review transition, replay and
conflict behavior, audit completeness, submission immutability, Chinese report
structure/escaping, provenance separation, and explicit unavailable metrics.

The coordinator inspected primary Fixture review, assistant, and report flows at
desktop and 390x844 widths. Official-slice and visible conflict-state captures
remain separate evidence gates.

## Page 10 — Current truth and release boundary

W1, W2, P1-W3 QA, and the provenance correction are integrated. The assembled
suite now passes all six groups, and the coordinator completed the required
local project checks plus primary Fixture visual review.

The official package received a bounded read-only integrity check, not an
official runtime evaluation: all data/material entries plus the workbook
match, 21 of 24 total manifest entries, while three top-level
requirement/README Markdown or DOCX files differ. No official metric, generated
slice, timed receipt, or final candidate SHA is claimed here. Those artifacts
must be regenerated by the coordinator from one clean integrated candidate
before the submission may claim an official slice run or sub-180-second demo;
full-validation and organizer-result claims remain separate and unsupported.
