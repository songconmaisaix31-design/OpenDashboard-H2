# H2 Sentinel Screenshot Shot List

No screenshot is committed in this package. H6 recorded a manual Chrome review
of the Fixture overview, C03, and C04 at desktop and 390x844 with no
document-width overflow; this is not an image asset or automated screenshot
regression proof. The Fixture report-format correction is now present in source
`92f7b78`; capture only from the final coordinator candidate.

| ID | Frame | Required visible proof | Current status | Capture rule |
| --- | --- | --- | --- | --- |
| S01 | Fixture overview | Title, `FIXTURE`, run status | Manual-reviewed; no file | Capture from `/h2-sentinel/?mode=fixture`. |
| S02 | Data quality | Provenance, quality status, warnings/blockers | Not captured | Do not imply official import. |
| S03 | Event Center | C03 and C04 cards, timing, severity | Manual-reviewed; no file | Keep Fixture label visible. |
| S04 | C03 detail | BESS/PCC context, evidence, provenance | Manual-reviewed; no file | Do not expose private data. |
| S05 | C03 impact and safety | Metric, assumptions, human-confirmation label | Not captured | Do not frame as equipment control. |
| S06 | C04 detail | PCC constraint and corrected 29.333333333333332 kWh Fixture impact | Manual-reviewed; no file | Caption as synthetic Fixture only. |
| S07 | Assistant | Structured/cited answer and no-control boundary | Not captured | Do not show credentials or private input. |
| S08 | Local report/export | Local C03 HTML report and CSV provenance | Not captured | Capture only after Local smoke on final candidate. |
| S09 | Local mode | `LIVE_ANALYSIS`, imported manifest, redacted result | Not captured | Do not label as official data without authorized input/run. |
| S10 | Narrow width | 390x844 with no clipping/overlap | Manual-reviewed; no file | Capture the final mounted app, not a mockup. |

For every future capture, record candidate SHA, command, viewport, mode,
redactions, and what the frame proves. A capture proves only its recorded UI
state; it does not establish official-data accuracy, validation performance,
deployment, or network isolation.
