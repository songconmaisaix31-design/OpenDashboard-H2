from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape

from h2_analytics.contracts import build_provenance
from h2_analytics.errors import AnalyticsError

from .submission import serialize_submission

SAFETY_DISCLAIMER = (
    "H2 Sentinel recommendations are advisory and require human confirmation."
)
REPORT_KINDS = {
    "single_event_diagnosis",
    "period_summary",
    "analysis_result_json",
    "submission_csv",
    "validation_metrics",
    "quality_report",
}


class ReportRenderer:
    def __init__(self) -> None:
        template_dir = Path(__file__).resolve().parents[3] / "templates"
        self._environment = Environment(
            loader=FileSystemLoader(template_dir),
            autoescape=select_autoescape(("html",)),
            undefined=StrictUndefined,
            trim_blocks=True,
            lstrip_blocks=True,
        )

    def render(
        self,
        *,
        run: dict[str, Any],
        kind: str,
        event_id: str | None = None,
        time_range: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        if kind not in REPORT_KINDS:
            raise AnalyticsError(
                "report.unsupported_kind",
                "The requested report kind is unavailable without fabricated metrics.",
            )
        event = _event(run, event_id) if event_id is not None else None
        if kind == "single_event_diagnosis" and event is None:
            raise AnalyticsError("report.event_required", "An event ID is required.")
        if kind == "submission_csv":
            content = serialize_submission(run["events"])
            media_type, report_format, filename = "text/csv", "csv", "submission.csv"
        elif kind == "analysis_result_json":
            content = json.dumps(run, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
            media_type, report_format, filename = (
                "application/json",
                "json",
                f"{run['runId']}-analysis.json",
            )
        elif kind == "validation_metrics":
            content = json.dumps(
                {
                    "schemaVersion": 1,
                    "reportKind": kind,
                    "runId": run["runId"],
                    "quality": run["quality"],
                    "provenance": run["provenance"],
                },
                ensure_ascii=False,
                indent=2,
                sort_keys=True,
            ) + "\n"
            media_type, report_format, filename = (
                "application/json",
                "json",
                f"{run['runId']}-validation-metrics.json",
            )
        else:
            content = self._environment.get_template("event_report.html").render(
                run=run,
                event=event,
                events=run["events"],
                kind=kind,
                time_range=time_range,
                disclaimer=SAFETY_DISCLAIMER,
            )
            media_type, report_format = "text/html", "html"
            filename = (
                f"{event['eventId']}-diagnosis.html"
                if event is not None
                else (
                    f"{run['runId']}-quality-report.html"
                    if kind == "quality_report"
                    else f"{run['runId']}-period-summary.html"
                )
            )
        generated_at = run.get("completedAt", run["startedAt"])
        report_id_suffix = event["eventId"] if event is not None else run["runId"]
        descriptor: dict[str, Any] = {
            "schemaVersion": 1,
            "reportId": f"report-{kind}-{report_id_suffix}",
            "runId": run["runId"],
            "kind": kind,
            "format": report_format,
            "status": "ready",
            "generatedAt": generated_at,
            "filename": filename,
            "contentHash": f"sha256:{hashlib.sha256(content.encode('utf-8')).hexdigest()}",
            "warnings": list(run["warnings"]),
            "safetyDisclaimer": SAFETY_DISCLAIMER,
            "provenance": build_provenance(
                mode=run["dataset"]["mode"],
                generated_at=generated_at,
                fingerprint=run["dataset"]["fingerprint"],
                renderer_version="jinja-report-v1" if report_format == "html" else "structured-export-v1",
            ),
        }
        if event is not None:
            descriptor["eventId"] = event["eventId"]
        return {"descriptor": descriptor, "mediaType": media_type, "content": content}


def _event(run: dict[str, Any], event_id: str) -> dict[str, Any]:
    for event in run["events"]:
        if event["eventId"] == event_id:
            return event
    raise AnalyticsError("event.not_found", "Anomaly event was not found.")
