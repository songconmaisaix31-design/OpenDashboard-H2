from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from h2_analytics.contracts import build_provenance
from h2_analytics.events import EventWindow
from h2_analytics.impact import ImpactCalculator
from h2_analytics.safety import SafetyEvaluator


EVENT_METADATA: dict[str, dict[str, Any]] = {
    "C03": {
        "title": "BESS power direction conflicts with the dispatch command",
        "control": {
            "type": "BESS_CONTROL",
            "id": "bess-control",
            "displayName": "BESS control interface",
        },
        "equipment": [
            {"kind": "BESS", "id": "bess-01", "displayName": "Battery energy storage system"},
            {"kind": "PCC", "id": "pcc-01", "displayName": "Point of common coupling"},
        ],
        "rootCause": (
            "Likely BESS command/feedback sign mapping mismatch; this is an inference "
            "from structured evidence, not a direct equipment-control finding."
        ),
        "recommendation": "Verify BESS command and feedback sign mapping before changing dispatch.",
        "rationale": (
            "The diagnosis separates a likely interface mapping issue from a proven equipment fault."
        ),
    },
    "C04": {
        "title": "PCC power exceeds the active boundary",
        "control": {
            "type": "PCC_BOUNDARY_CONTROL",
            "id": "pcc-boundary-control",
            "displayName": "PCC boundary controller",
        },
        "equipment": [
            {"kind": "PCC", "id": "pcc-01", "displayName": "Point of common coupling"},
            {"kind": "GRID", "id": "grid-connection", "displayName": "Grid interconnection"},
        ],
        "rootCause": (
            "Likely PCC boundary synchronization or tracking issue; the evidence supports "
            "a compliance-oriented check, not a direct control action."
        ),
        "recommendation": (
            "Inspect PCC boundary synchronization and meter feedback before any dispatch change."
        ),
        "rationale": (
            "The event proves a boundary-tracking violation but does not authorize automatic control."
        ),
    },
}


class DiagnosisBuilder:
    def __init__(
        self,
        impact_calculator: ImpactCalculator | None = None,
        safety_evaluator: SafetyEvaluator | None = None,
    ) -> None:
        self._impact = impact_calculator or ImpactCalculator()
        self._safety = safety_evaluator or SafetyEvaluator()

    def build(
        self,
        *,
        window: EventWindow,
        manifest: dict[str, Any],
    ) -> dict[str, Any]:
        metadata = EVENT_METADATA[window.code]
        generated_at = manifest["provenance"]["generatedAt"]
        provenance = build_provenance(
            mode=manifest["mode"],
            generated_at=generated_at,
            fingerprint=manifest["fingerprint"],
            model_version=window.detector_version,
        )
        calculation = self._impact.calculate(
            window=window,
            sampling_interval_minutes=float(manifest["samplingIntervalMinutes"]),
            dataset_fingerprint=manifest["fingerprint"],
        )
        evidence = self._evidence(window, calculation.value, provenance)
        evidence_ids = tuple(item["evidenceId"] for item in evidence)
        safety_checks = self._safety.evaluate(
            window=window,
            evidence_ids=evidence_ids,
            provenance=provenance,
        )
        identity = window.code if window.event_id.endswith("-001") else window.event_id
        recommendation_id = f"{identity}-REC-001"
        return {
            "schemaVersion": 1,
            "eventId": window.event_id,
            "code": window.code,
            "subtype": window.subtype,
            "title": metadata["title"],
            "startTime": _timestamp(window.start_time),
            "endTime": _timestamp(window.end_time),
            "firstDetectionTime": _timestamp(window.first_detection_time),
            "severity": "high",
            "confidence": window.confidence,
            "primaryControlObject": metadata["control"],
            "affectedEquipment": metadata["equipment"],
            "evidence": evidence,
            "impact": {
                "metric": calculation.metric,
                "value": calculation.value,
                "unit": calculation.unit,
                "formulaVersion": calculation.formula_version,
                "assumptions": list(calculation.assumptions),
                "evidenceIds": [evidence_ids[-1]],
                "provenance": provenance,
            },
            "safetyChecks": safety_checks,
            "recommendations": [
                {
                    "recommendationId": recommendation_id,
                    "actionKind": "check",
                    "summary": metadata["recommendation"],
                    "rationale": metadata["rationale"],
                    "safetyCheckIds": [item["checkId"] for item in safety_checks],
                    "evidenceIds": list(evidence_ids[:2]),
                    "requiresHumanConfirmation": True,
                    "provenance": provenance,
                }
            ],
            "rootCause": metadata["rootCause"],
            "rootCauseKind": "inference",
            "reviewState": "open",
            "provenance": provenance,
            "requiresHumanConfirmation": True,
        }

    @staticmethod
    def _evidence(
        window: EventWindow,
        impact_value: float,
        provenance: dict[str, Any],
    ) -> list[dict[str, Any]]:
        detection_row = window.rows[
            min(
                range(len(window.rows)),
                key=lambda index: _detection_distance(
                    window.rows[index], window.first_detection_time
                ),
            )
        ]
        if window.code == "C03":
            return [
                _evidence_item(
                    _evidence_id(window, 1),
                    "measurement",
                    detection_row,
                    "bess_dispatch_command_kw",
                    "charge" if (detection_row.value("bess_dispatch_command_kw") or 0) < 0 else "discharge",
                    "=",
                    "The EMS command requested the recorded BESS direction.",
                    provenance,
                ),
                _evidence_item(
                    _evidence_id(window, 2),
                    "measurement",
                    detection_row,
                    "bess_power_kw",
                    "command direction",
                    "!=",
                    "Observed BESS power is opposite to the dispatch command.",
                    provenance,
                ),
                _impact_evidence(
                    _evidence_id(window, 3),
                    window,
                    "abnormal_grid_exchange_energy_kwh",
                    impact_value,
                    "impact-c03-v1",
                    "Abnormal grid exchange is associated with the reversed BESS response.",
                    provenance,
                ),
            ]
        limit_field = (
            "pcc_export_limit_kw"
            if window.subtype == "EXPORT_POWER_LIMIT_NOT_TRACKED"
            else "pcc_import_limit_kw"
        )
        limit = detection_row.value(limit_field)
        if limit is None:
            raise ValueError("C04 diagnosis requires the active PCC limit.")
        return [
            _evidence_item(
                _evidence_id(window, 1),
                "measurement",
                detection_row,
                "pcc_power_kw",
                limit if window.subtype.startswith("EXPORT") else -limit,
                ">" if window.subtype.startswith("EXPORT") else "<",
                "PCC power exceeds the active boundary.",
                provenance,
            ),
            _evidence_item(
                _evidence_id(window, 2),
                "constraint",
                detection_row,
                limit_field,
                limit,
                "=",
                "The configured PCC boundary is active for this interval.",
                provenance,
            ),
            _impact_evidence(
                _evidence_id(window, 3),
                window,
                "pcc_power_limit_violation_energy_kwh",
                impact_value,
                "impact-c04-v1",
                "Boundary-violation energy is integrated over every inclusive minute row.",
                provenance,
            ),
        ]


def _evidence_item(
    evidence_id: str,
    kind: str,
    row: Any,
    variable: str,
    reference: str | float,
    comparator: str,
    conclusion: str,
    provenance: dict[str, Any],
) -> dict[str, Any]:
    assert row.timestamp is not None
    return {
        "schemaVersion": 1,
        "evidenceId": evidence_id,
        "kind": kind,
        "claimKind": "fact",
        "timestamp": _timestamp(row.timestamp),
        "variable": variable,
        "actualValue": row.value(variable),
        "referenceValue": reference,
        "unit": "kW",
        "comparator": comparator,
        "source": "fixture-timeseries" if provenance["mode"] == "FIXTURE" else "imported-timeseries",
        "conclusion": conclusion,
        "provenance": provenance,
    }


def _impact_evidence(
    evidence_id: str,
    window: EventWindow,
    variable: str,
    value: float,
    source: str,
    conclusion: str,
    provenance: dict[str, Any],
) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "evidenceId": evidence_id,
        "kind": "derived_metric",
        "claimKind": "calculation",
        "interval": {
            "startTime": _timestamp(window.start_time),
            "endTime": _timestamp(window.end_time),
        },
        "variable": variable,
        "actualValue": value,
        "referenceValue": 0,
        "unit": "kWh",
        "comparator": ">",
        "source": source,
        "conclusion": conclusion,
        "provenance": provenance,
    }


def _timestamp(value: datetime) -> str:
    return value.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def _detection_distance(row: Any, first_detection_time: datetime) -> float:
    if row.timestamp is None:
        raise ValueError("Event rows require valid timestamps.")
    return abs((row.timestamp - first_detection_time).total_seconds())


def _evidence_id(window: EventWindow, index: int) -> str:
    identity = window.code if window.event_id.endswith("-001") else window.event_id
    return f"{identity}-EV-{index:03d}"
