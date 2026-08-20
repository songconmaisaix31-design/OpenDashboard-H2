# Provenance

## Lineage

This repository is an independent repo for **H2 Sentinel / 氢哨**, the competition version
of OpenDashboard for the T03-04 "weak-grid green-hydrogen EMS power-coordination anomaly
diagnosis and operations assistant" challenge.

The code in this repo was extracted from the OpenDashboard repository at tag:

- Tag: `h2-sentinel-competition-2026-08-20`
- Commit SHA: `e4357052aa6fffcc065a4f963006e92b2d77c001`

OpenDashboard's `main` branch was **not** modified. H2 Sentinel is a plugin composition
built on the OpenDashboard core plugin system; see
[H2_AS_PLUGIN_COMPOSITION.md](./H2_AS_PLUGIN_COMPOSITION.md) for the structural
declaration.

## Repo history

- Initial commit: independent H2 Sentinel plugin-composition repo scaffold.
- Follow-up commits: declaration and provenance documentation (this file and
  `H2_AS_PLUGIN_COMPOSITION.md`).

## Verification points

- OpenDashboard `main` unchanged — no fork, no rewrite, no force-push history.
- H2-specific behavior lives only in H2 plugins, the loopback-only analytics sidecar, and
  the H2 Web feature.
- Runtime modes: `fixture` (deterministic, no Python) and `local` (explicit opt-in,
  read-only, loopback `127.0.0.1` only, no LLM required).
