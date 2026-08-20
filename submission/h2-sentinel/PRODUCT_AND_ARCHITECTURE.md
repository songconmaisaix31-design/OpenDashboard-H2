# H2 Sentinel: Product and Architecture Narrative

## Product and safety boundary

H2 Sentinel / 氢哨 helps an operations engineer review a suspected weak-grid
green-hydrogen EMS coordination anomaly through timing, evidence, impact,
safety checks, provenance, and an advisory next step. It is decision support:
recommendations require human confirmation and it does not control equipment,
replace an EMS, dispatch power, or turn language output into a control action.

## Assembled architecture

```text
generic / -> existing Fixture Demo

/h2-sentinel/?mode=fixture -> statically registered H2 EMS Fixture plugin
/h2-sentinel/?mode=local   -> statically registered H2 EMS loopback plugin
                                   -> same-origin /api/v1/h2-sentinel proxy
                                       -> 127.0.0.1 deterministic analytics sidecar
```

The current assembled snapshot preserves the generic default
and accepts only the two explicit H2 modes. The Fixture path starts no Python
service. The Local path uses a fixed namespace and a validated loopback target;
it is not a general sidecar runtime, remote-host interface, dynamic plugin
loader, arbitrary shell surface, or evidence of broad network isolation.

## Current evidence

The 2026-08-19 H6 record shows the assembled H2 feature, statically reviewed
plugin service, launcher, and loopback proxy exercising C03/C04. The locked
Local golden run produced deterministic no-LLM C03 HTML output and a two-row
`submission.csv` whose validator confirmed the exact 16-column contract. The
analytics service uses loopback Host/Origin checks and no permissive CORS policy;
these source and smoke facts are not a claim of a deployed or independently
penetration-tested service.

The recorded hardening checks reject a 307 health redirect without forwarding it,
cover Windows-owned child cleanup, and make report content hashes visible for
review. They are bounded local-path evidence, not proof of general network
isolation.

Manual Chrome review at desktop and 390x844 verified the mounted Fixture
overview, C03, C04, provenance, human-confirmation boundary, corrected C04
impact of `29.333333333333332 kWh`, and no document-width overflow. No screenshot
asset or automated visual-regression proof was produced.

## Provenance and known limitation

The C03/C04 Fixture remains sanitized synthetic evidence. `FIXTURE` must never
be called official data, a plant result, a validation metric, or an organizer
score. `LIVE_ANALYSIS` describes the explicit Local adapter mode, but no official
dataset or official-data run is included or claimed.

Plugin source commit `92f7b78` resolves the Fixture report-format mismatch,
which coordinator integration `abe454b` contains. Single-event diagnosis,
period summary, and quality reports now return deterministic safe HTML with
matching filenames and media types. Analysis and validation artifacts remain
JSON, and submission output remains CSV. The format correction does not change
Fixture provenance or create official-data, score, or deployment evidence.

## Current boundaries

The candidate includes no official dataset, labels, versioned validation report,
precision/recall/F1 result, organizer score, deployment record, remote GitHub
Actions run, network-isolation proof, or committed screenshot asset. The H2
workflow is committed, but a committed workflow is not proof of a remote run.

## Sources

- [H6 integration handoff](../../scripts/h2-sentinel/HANDOFF.md)
- [H2 contracts handoff](../../packages/h2-contracts/HANDOFF.md)
- [H2 analytics handoff](../../services/h2-analytics/HANDOFF.md)
- [H2 QA acceptance matrix](../../tests/h2-sentinel/ACCEPTANCE_MATRIX.md)
