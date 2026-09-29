# EASY TASK BRIEF — Declaration & narrative docs

You are a worker agent writing documentation only. Create NEW files only. Do NOT modify README.md, THIRD_PARTY_NOTICES.md, NOTICE, or any code/config files (another agent owns those). Do NOT touch the OpenDashboard repo, do NOT push to OpenDashboard main, do NOT force-push or rewrite history.

## Goal

Declare that **H2 Sentinel (氢哨) is the competition version of OpenDashboard, realized as a plugin composition**. Write this declaration as documentation in this repo.

## Files to create

1. `docs/H2_AS_PLUGIN_COMPOSITION.md` — the canonical declaration document.
2. `docs/PROVENANCE.md` — provenance/lineage of this repo.

## Key facts (all true, do not invent)

- OpenDashboard is a plugin-first architecture: shared contracts (`@opendashboard/contracts`) + static trusted plugin runtime (`@opendashboard/plugin-runtime`) + a deterministic Fixture demo plugin. Its product position is a local service diagnosis and controlled-recovery console.
- H2 Sentinel (氢哨) is the **competition version** of OpenDashboard for the T03-04 "weak-grid green-hydrogen EMS power-coordination anomaly diagnosis and operations assistant" challenge.
- H2 Sentinel is a **plugin composition**: it composes the OpenDashboard core plugin system with H2 domain plugins on top, WITHOUT modifying OpenDashboard's `main`.
- Composition layers (bottom-up):
  1. `@opendashboard/contracts` — shared plugin contracts (from OpenDashboard).
  2. `@opendashboard/plugin-runtime` — static registry, lifecycle, service container (from OpenDashboard).
  3. `@opendashboard/h2-contracts` — H2 domain contracts (anomaly C01-C07, evidence, impact, safety, provenance, report, submission CSV).
  4. `@opendashboard/h2-ems` — H2 EMS plugin exposing an `H2SentinelDataSource` via Fixture and loopback adapters.
  5. `services/h2-analytics` — trusted loopback-only Python/FastAPI analytics sidecar (ingestion, quality, detection, event aggregation, evidence, impact, safety, reports).
  6. H2 Web feature (six Chinese pages) + one-click launchers.
- Product boundary: diagnosis and advisory recommendations that require human confirmation; it does NOT control equipment or replace the EMS. Principle: "models detect, deterministic rules verify, AI explains, humans decide."
- Runtime modes: `fixture` (deterministic, no Python) and `local` (explicit opt-in, read-only, loopback `127.0.0.1` only, no LLM required).
- Provenance vocabulary: `FIXTURE`, `LIVE_ANALYSIS`, `DERIVED`, `MODEL`, `RULE`, `LLM_RENDERED`.
- This repo's code was extracted from the OpenDashboard repository tag `h2-sentinel-competition-2026-08-20` (SHA `e4357052aa6fffcc065a4f963006e92b2d77c001`). OpenDashboard's `main` was not modified.
- Language: Simplified Chinese UI / product copy; English for code, comments, file names, commit messages, and technical docs.

## Style

- English technical prose with Chinese product terms where natural (e.g., "H2 Sentinel / 氢哨").
- Include a text composition diagram (ASCII) showing the layers and the "competition version = plugin composition" relationship.
- Be truthful and concise; state facts, not marketing claims. No fake metrics, no deployment claims.

## Git discipline

- Branch already assigned; commit the two new files with `docs(h2-repo): add plugin-composition declaration and provenance`.
- Push to `origin` (your branch). Never force-push, never amend a pushed commit.

## Report back

Report the pushed commit SHA and the two file paths. Keep it short.
