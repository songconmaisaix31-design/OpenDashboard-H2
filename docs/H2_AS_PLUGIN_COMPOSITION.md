# H2 Sentinel (氢哨) as a Plugin Composition

> Declaration: H2 Sentinel / 氢哨 is the **competition version** of OpenDashboard for the
> T03-04 "weak-grid green-hydrogen EMS power-coordination anomaly diagnosis and operations
> assistant" challenge. It is realized as a **plugin composition** — the OpenDashboard core
> plugin system with H2 domain plugins composed on top — without modifying OpenDashboard's
> `main`.

## 1. Relationship to OpenDashboard

OpenDashboard is a plugin-first architecture built on three pieces:

- `@opendashboard/contracts` — shared plugin contracts;
- `@opendashboard/plugin-runtime` — a static, trusted plugin runtime (registry, lifecycle,
  service container);
- a deterministic Fixture demo plugin.

Its product position is a **local service diagnosis and controlled-recovery console**.

H2 Sentinel does not fork or rewrite OpenDashboard. It composes OpenDashboard's core plugin
system with H2 domain plugins on top. All H2-specific behavior lives in plugins and sidecar
services, so OpenDashboard's `main` stays untouched.

## 2. Composition layers (bottom-up)

```
+--------------------------------------------------------------+
|  H2 Web feature: six Chinese pages                          |
|  (dashboard, anomaly list, evidence detail, impact/safety,  |
|   report, submission) + one-click launchers                 |
+--------------------------------------------------------------+   <- H2 layer
|  services/h2-analytics                                      |
|  trusted loopback-only Python/FastAPI analytics sidecar     |
|  (ingestion, quality, detection, event aggregation,         |
|   evidence, impact, safety, reports)                        |
+--------------------------------------------------------------+
|  @opendashboard/h2-ems                                       |
|  H2 EMS plugin exposing an H2SentinelDataSource via          |
|  Fixture and loopback adapters                              |
+--------------------------------------------------------------+
|  @opendashboard/h2-contracts                                 |
|  H2 domain contracts: anomaly C01-C07, evidence, impact,    |
|  safety, provenance, report, submission CSV                 |
+--------------------------------------------------------------+   <- OpenDashboard core
|  @opendashboard/plugin-runtime                               |
|  static registry, lifecycle, service container              |
+--------------------------------------------------------------+
|  @opendashboard/contracts                                    |
|  shared plugin contracts                                    |
+--------------------------------------------------------------+

competition version (H2 Sentinel) = OpenDashboard core plugin system
                                    + H2 domain plugins composed on top
                                    + loopback-only analytics sidecar
                                    + H2 Web feature
```

The bottom two layers are OpenDashboard as-is. Everything above is H2 composition, and the
composition boundary is exactly the plugin contract — the same seam OpenDashboard itself uses
for its Fixture demo plugin.

## 3. Product boundary

H2 Sentinel performs diagnosis and produces advisory recommendations that **require human
confirmation**. It does **not** control equipment and does **not** replace the EMS.

Operating principle:

> Models detect, deterministic rules verify, AI explains, humans decide.

## 4. Runtime modes

- `fixture` — deterministic, no Python dependency.
- `local` — explicit opt-in, read-only, loopback `127.0.0.1` only, no LLM required.

## 5. Provenance vocabulary

Every analytic result carries a provenance tag from this fixed vocabulary:

`FIXTURE` · `LIVE_ANALYSIS` · `DERIVED` · `MODEL` · `RULE` · `LLM_RENDERED`

## 6. Constraints

- Language: Simplified Chinese for UI / product copy; English for code, comments, file
  names, commit messages, and technical docs.
- This document states facts only: no metrics, no deployment claims.
