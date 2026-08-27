# H2 Analytics

H2 Analytics is the deterministic, in-memory Python sidecar for H2 Sentinel.
It accepts CSV text rather than filesystem paths and keeps Fixture provenance
visible. Adapter operations use the fixed `/api/v1/h2-sentinel` namespace;
`GET /health` is the single root-level readiness exception frozen by integration.

## Local development

```bash
uv sync --locked --extra dev
uv run --locked --extra dev python -m pytest
uv run --locked --extra dev python -m h2_analytics.tools.smoke_golden
uv run --locked --extra dev python -m h2_analytics
```

`uv.lock` is the preferred reproducible environment. If `uv` is unavailable,
use the task-compatible fallback `python -m pip install -e '.[dev]'` and run
the same module commands with `python`.

The documented server command binds Uvicorn to `127.0.0.1:8765`. The
application also rejects non-loopback Host and Origin values. No route accepts
a filesystem path, command, Python expression, plugin, or remote target.

## Report artifact formats

The local adapter follows the frozen H2 report-kind mapping. This keeps the
same user-visible export behavior in `LIVE_ANALYSIS` as the static Fixture
provider without inferring an official score or dataset result.

| Report kind | Format | Media type |
|---|---|---|
| `single_event_diagnosis` | HTML | `text/html` |
| `period_summary` | HTML | `text/html` |
| `pcc_daily_compliance` | HTML | `text/html` |
| `analysis_result_json` | JSON | `application/json` |
| `validation_metrics` | JSON | `application/json` |
| `quality_report` | HTML | `text/html` |
| `review_audit_json` | JSON | `application/json` |
| `submission_csv` | CSV | `text/csv` |

Judge-visible HTML is Simplified Chinese, declares `lang="zh-CN"`, uses only
bounded local styles, and is rendered through Jinja autoescaping. Imported
filenames, event prose, actor labels, and review notes are never inserted as
trusted markup. `validation_metrics` fails with `report.metrics_unavailable`
until labels, split identity, matching rules, and versioned configuration are
available; quality data is not misrepresented as validation metrics.
Submission output remains the frozen 16-column CSV.

## Route map

`ROUTES.json` is the cross-track route contract. The same map is exported at
`GET /api/v1/h2-sentinel/routes`, and an API test compares both forms to the
actual FastAPI route table. FastAPI documentation and OpenAPI routes are
disabled; no unlisted framework route is exposed.

Review history is available at
`GET /api/v1/h2-sentinel/runs/{runId}/events/{eventId}/review`; append-only
mutations use
`POST /api/v1/h2-sentinel/runs/{runId}/events/{eventId}:review`. Mutations are
serialized in process, enforce `expectedRevision`, and deduplicate exact
`requestId` replay without changing detector or submission fields.

Browser traffic is expected to use the H6 same-origin proxy. The sidecar does
not add permissive CORS behavior; Host and Origin checks remain limited to
`127.0.0.1`, `localhost`, and `::1`.

## Deterministic detector boundary

`RuleRowDetector` is the always-available fallback and implements the frozen
C03 and C04 field mappings. Its C04 confirmation margin is externalized in
`H2Constraints`; impact still integrates only the eight corrected inclusive
violation rows. `LightGbmRowDetector` accepts an already-loaded, approved
booster and never a user-supplied model path. Remaining class impact identities
are declared, but this gate does not guess unfrozen official field mappings.

## Reuse decisions

| Need | Project checked | Decision | Reason and fallback |
|---|---|---|---|
| Validated loopback API | FastAPI / Pydantic | Adopt | Narrow request models and redacted errors; no generic admin service. |
| Row classification | LightGBM | Optional adapter | Useful for an approved preloaded baseline; deterministic rules remain available without it. |
| Tabular processing | pandas / scikit-learn | Do not require for P0 | The sanitized flow needs only the Python standard library, reducing install and memory cost. |
| HTML reports | Jinja | Adopt | Autoescaping and a small deterministic template replace custom HTML concatenation. |
| Quality artifacts | Evidently | Defer | Larger than the required in-memory quality report. |
| Root-cause ranking | PyRCA | Defer | Deterministic evidence rules are the required source of truth. |
| General time-series framework | Merlion | Reject | Archived upstream and duplicates the detector seam. |

Official project references are recorded in the H2 planning documents. No
vendor source is copied into this service.
