from __future__ import annotations

import csv
import io
import json
from typing import Any

from h2_analytics.contracts import SUBMISSION_COLUMNS


def submission_rows(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [_submission_row(event) for event in events]


def serialize_submission(events: list[dict[str, Any]]) -> str:
    target = io.StringIO(newline="")
    writer = csv.writer(target, lineterminator="\n")
    writer.writerow(SUBMISSION_COLUMNS)
    for row in submission_rows(events):
        writer.writerow([_cell(row[column]) for column in SUBMISSION_COLUMNS])
    return target.getvalue()


def _submission_row(event: dict[str, Any]) -> dict[str, Any]:
    evidence = [
        {
            "evidence_id": item["evidenceId"],
            "kind": item["kind"],
            "claim_kind": item["claimKind"],
            "timestamp": item.get("timestamp", item.get("interval", {}).get("startTime", "")),
            "variable": item.get("variable", ""),
            "actual_value": item.get("actualValue", ""),
            "reference_value": item.get("referenceValue", ""),
            "unit": item.get("unit", ""),
            "conclusion": item["conclusion"],
        }
        for item in event["evidence"]
    ]
    return {
        "pred_event_id": event["eventId"],
        "start_time": event["startTime"],
        "end_time": event["endTime"],
        "anomaly_code": event["code"],
        "anomaly_subtype": event["subtype"],
        "severity": event["severity"],
        "primary_control_object": event["primaryControlObject"]["type"],
        "affected_equipment": ";".join(
            f"{item['kind']}:{item['id']}" for item in event["affectedEquipment"]
        ),
        "confidence": event["confidence"],
        "evidence_json": json.dumps(evidence, ensure_ascii=False, separators=(",", ":")),
        "root_cause": event["rootCause"],
        "recommended_action": " ".join(
            item["summary"] for item in event["recommendations"]
        ),
        "primary_impact_metric": event["impact"]["metric"],
        "estimated_impact_value": event["impact"]["value"],
        "first_detection_time": event["firstDetectionTime"],
        "requires_human_confirmation": event["requiresHumanConfirmation"],
    }


def _cell(value: Any) -> Any:
    if isinstance(value, bool):
        return "true" if value else "false"
    return value
