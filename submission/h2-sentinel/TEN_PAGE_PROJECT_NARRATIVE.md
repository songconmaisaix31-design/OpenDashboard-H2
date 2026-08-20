# H2 Sentinel Ten-Page Project Narrative

This narrative describes the current coordinator-verified assembled snapshot and recorded H6 evidence. It does not claim publication to `main`, deployment, official data, validation metrics, organizer results, remote CI execution, network-isolation proof, or committed screenshot assets.

## Page 1 — Title and outcome

**H2 Sentinel / 氢哨** is a local-first H2 EMS anomaly-diagnosis and decision-support application. It makes a suspected coordination anomaly reviewable through evidence, impact, safety checks, provenance, and an advisory next step requiring human confirmation.

## Page 2 — The operator problem

An alarm does not explain whether a disturbance is routine renewable variation, when it began, which equipment is involved, or what should be reviewed. H2 Sentinel turns available deterministic evidence into a traceable review workflow rather than an opaque classifier, notebook, or chat response.

## Page 3 — Product boundary

The application supports diagnosis and bounded operational review. It does not replace an EMS, control equipment, autonomously dispatch power, or permit a language model to decide a control action. Models detect, deterministic rules verify, explanations remain bounded by structured evidence, and people decide.

## Page 4 — Evidence before explanation

The assembled flow exposes event interval, variable identity, observed value, reference or constraint, impact, safety state, and machine-readable conclusion before a recommendation. This preserves traceability and makes uncertainty visible instead of hiding it behind generated prose.

## Page 5 — Explicit local-first composition

The generic Fixture Demo remains at `/`. H2 is deliberately opt-in at `/h2-sentinel/?mode=fixture` or `/h2-sentinel/?mode=local`. Fixture statically registers the reviewed H2 plugin without starting Python. Local mode uses the same-origin `/api/v1/h2-sentinel` proxy to a validated `127.0.0.1` analytics target; it is not a remote-control or general plugin system.

## Page 6 — Fixture and Local provenance

The contracts distinguish `FIXTURE`, `LIVE_ANALYSIS`, `DERIVED`, `MODEL`, `RULE`, and `LLM_RENDERED`. C03/C04 Fixture content is sanitized synthetic evidence and remains visibly labeled. The Local golden path is deterministic and no-LLM, but it is still not official-data validation evidence.

## Page 7 — Seven anomaly classes

The contract vocabulary covers C01-C07 across electrolyzer setpoints, available capacity, BESS direction, PCC boundaries, energy quotas, load allocation, and SOC/reserve. Event start, end, and first-detection time remain distinct, and confidence is normalized to 0..1. These interfaces do not establish detector performance on official data.

## Page 8 — C03 evidence-first case

C03 is the BESS charge/discharge direction anomaly. H6 Local smoke produced a deterministic no-LLM C03 HTML report and a two-row `submission.csv` that passed its exact 16-column validator. Plugin source `92f7b78` also makes the Fixture single-event diagnosis deterministic safe HTML. These are local/Fixture outputs, not official-data results.

## Page 9 — C04 boundary-tracking case

C04 is PCC import/export boundary tracking. The sanitized Fixture includes eight inclusive one-minute points at 720 kW against a 500 kW limit, yielding `29.333333333333332 kWh`. Manual Chrome review inspected the mounted C04 flow; it did not create a screenshot asset or validate a plant boundary.

## Page 10 — Reproducibility and honest evaluation

The assembled snapshot recorded 92 repository tests, 60 focused H2 tests, 32 Python pytest cases, nine launcher tests, five assembled QA groups, and nine H2 smoke scenarios. Its production build processed 684 modules and emitted 900.01 kB minified JavaScript (297.15 kB gzip) plus 47.44 kB CSS, while still emitting Vite's standard greater-than-500-kB warning. The recorded local path rejects a 307 health redirect, covers Windows-owned child cleanup, and exposes report content hashes for review; none of these facts proves general network isolation. Official data, validation metrics, organizer score, deployment, remote GitHub Actions run, network isolation proof, and committed screenshots remain undelivered.

## Source basis

Derived from the [H6 integration handoff](../../scripts/h2-sentinel/HANDOFF.md) and bounded by the [H2 contract package](../../packages/h2-contracts/README.md).
