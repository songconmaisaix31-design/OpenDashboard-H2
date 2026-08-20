# H2 Sentinel Demo Script

## Recording boundary

Use the current coordinator-verified assembled snapshot and begin with
`npm run h2:fixture`. The generic Fixture Demo remains at `/`; record H2 only
from `/h2-sentinel/?mode=fixture`. Keep `FIXTURE` visible. The demonstration is
sanitized synthetic data, not official data, live plant evidence, a validation
result, or an organizer score.

## Primary script — 3 to 5 minutes

| Time | Screen action | Spoken script |
| --- | --- | --- |
| 0:00–0:20 | Open the explicit Fixture route. | “H2 Sentinel is a local-first diagnosis and decision-support application for weak-grid green-hydrogen EMS anomalies. It helps a person review evidence; it does not control equipment.” |
| 0:20–0:40 | Point to `FIXTURE` and provenance. | “This route uses sanitized synthetic Fixture data. The label is deliberate: this is not an official dataset, a plant run, or a score.” |
| 0:40–1:15 | Open Event Center and select C03. | “C03 is the BESS charge/discharge direction anomaly. Its evidence keeps start, end, first-detection time, equipment, severity, confidence, and the review boundary separate.” |
| 1:15–1:50 | Open C03 evidence and analysis. | “The diagnosis is evidence before explanation: time-aligned measurements and a reference or constraint appear before the recommendation. The chart supports human review, not an autonomous command.” |
| 1:50–2:15 | Open C03 impact and safety. | “Impact retains a metric, unit, and assumptions. Safety makes uncertainty visible. Any recommendation remains advisory and requires human confirmation.” |
| 2:15–2:45 | Select C04. | “C04 tracks a PCC import/export boundary. The corrected Fixture impact is 29.333333333333332 kilowatt-hours from eight one-minute violation rows; it is Fixture evidence, not an official performance metric.” |
| 2:45–3:15 | Open an assistant answer. | “The deterministic answer is tied to structured evidence. The verified Local golden path does not need an LLM key, so the core review loop is not dependent on an external model service.” |
| 3:15–3:50 | Switch to the verified Local run only when its launcher is ready. | “In explicit Local mode, the loopback sidecar produced a deterministic C03 HTML report and a two-row submission CSV validated against the exact 16-column contract. This is local deterministic evidence, not an official-data result.” |
| 3:50–4:10 | Return to provenance and safety summary. | “H2 Sentinel makes a suspected anomaly reviewable: structured evidence first, human decision last.” |

Fixture single-event diagnosis, period summary, and quality cards now produce
deterministic safe HTML with matching filenames and media types. Demonstrate
only those three as Fixture HTML reports; analysis and validation artifacts are
JSON, and submission output is CSV. Fixture output remains synthetic evidence,
not an official-data result or score.

## 30-second fallback

“H2 Sentinel / 氢哨 turns a suspected H2 EMS coordination anomaly into a human
review: timing, evidence, impact, safety, provenance, and an advisory next
step. This view is sanitized synthetic Fixture data, not official plant data or
a score. The application does not control equipment; every recommendation
requires human confirmation. The assembled Local golden path also validates a
deterministic C03 HTML report and a two-row 16-column submission CSV, while
official data, metrics, deployment, and remote CI evidence remain unclaimed.”

## Failure fallback

- If H2 does not start, show the generic `/` Fixture Demo and state that it is a separate preserved entry; do not substitute it for H2 evidence.
- If Local mode fails, return to the explicit Fixture route and state that only the recorded Local smoke supports the report/CSV claim.
- If the selected report kind is JSON or CSV, narrate its actual format; only the three documented Fixture report kinds are HTML.
- Do not display secrets, absolute local paths, private datasets, unredacted logs, or generated artifacts outside the approved evidence scope.
