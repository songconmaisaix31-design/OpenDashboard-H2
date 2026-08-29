from __future__ import annotations

import csv
import io
import json
from typing import Any

from h2_analytics import vocabulary
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


def submission_normalization_trace(
    events: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Return bounded internal alias provenance without changing the 16 columns."""
    traces: list[dict[str, Any]] = []
    for event in events:
        _normalized, trace = _normalize_equipment(event["affectedEquipment"])
        if trace:
            traces.append({"eventId": event["eventId"], "mappings": trace})
    return traces


def _submission_row(event: dict[str, Any]) -> dict[str, Any]:
    normalized_equipment, _normalization_trace = _normalize_equipment(
        event["affectedEquipment"]
    )
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
        "severity": vocabulary.severity_by_code()[event["code"]],
        "primary_control_object": event["primaryControlObject"]["displayName"],
        "affected_equipment": ",".join(
            vocabulary.affected_equipment_tokens_for_event(
                event["code"], normalized_equipment
            )
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


def _normalize_equipment(
    equipment: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    configured = vocabulary.load_submission_equipment_tokens().get(
        "normalizationAliases", {}
    )
    aliases = {
        "ELZ1": "ELZ01",
        "ELZ2": "ELZ02",
        "ELZ3": "ELZ03",
        "BESS": "BESS01",
        "PCC": "PCC01",
        **configured,
    }
    normalized: list[dict[str, Any]] = []
    trace: list[dict[str, str]] = []
    for item in equipment:
        copied = dict(item)
        raw_id = copied.get("id")
        if isinstance(raw_id, str) and raw_id in aliases:
            canonical_id = aliases[raw_id]
            copied["id"] = canonical_id
            if canonical_id != raw_id:
                trace.append({"original": raw_id, "normalized": canonical_id})
        normalized.append(copied)
    return normalized, trace


def _cell(value: Any) -> Any:
    if isinstance(value, bool):
        return "true" if value else "false"
    return value
