from __future__ import annotations

from typing import Any

from h2_analytics.events import EventWindow
from h2_analytics.settings import DEFAULT_CONSTRAINTS


class SafetyEvaluator:
    def evaluate(
        self,
        *,
        window: EventWindow,
        evidence_ids: tuple[str, ...],
        provenance: dict[str, Any],
    ) -> list[dict[str, Any]]:
        identity = window.code if window.event_id.endswith("-001") else window.event_id
        if window.code == "C03":
            soc_values = [
                value
                for row in window.rows
                if (value := row.value("bess_soc_percent")) is not None
            ]
            if not soc_values:
                soc_status = "unknown"
                soc_message = "SOC evidence is unavailable; range safety is unknown."
            elif any(
                value < DEFAULT_CONSTRAINTS.bess_soc_min_percent
                or value > DEFAULT_CONSTRAINTS.bess_soc_max_percent
                for value in soc_values
            ):
                soc_status = "failed"
                soc_message = "Observed SOC leaves the configured 20% to 90% range."
            else:
                soc_status = "passed"
                soc_message = "Observed SOC remains inside the configured 20% to 90% range."
            return [
                _check(
                    f"{identity}-SAFE-001",
                    "BESS sign convention confirmed",
                    "passed",
                    "Positive BESS power is interpreted as discharge.",
                    "sign-convention-bess-v1",
                    evidence_ids[:2],
                    provenance,
                ),
                _check(
                    f"{identity}-SAFE-002",
                    "SOC remains inside configured range",
                    soc_status,
                    soc_message,
                    "bess-soc-range-v1",
                    evidence_ids[:2],
                    provenance,
                ),
            ]
        if window.code == "C04":
            return [
                _check(
                    f"{identity}-SAFE-001",
                    "PCC sign convention confirmed",
                    "passed",
                    "Positive PCC power is export and negative PCC power is import.",
                    "sign-convention-pcc-v1",
                    evidence_ids[:1],
                    provenance,
                ),
                _check(
                    f"{identity}-SAFE-002",
                    "Recommendation is advisory only",
                    "passed",
                    "The service produces checks, not automatic setpoint changes.",
                    "human-confirmation-v1",
                    evidence_ids[:2],
                    provenance,
                ),
            ]
        return [
            _check(
                f"{identity}-SAFE-001",
                "Safety evidence available",
                "unknown",
                "No frozen safety rule is available for this event mapping.",
                None,
                (),
                provenance,
            )
        ]


def _check(
    check_id: str,
    title: str,
    status: str,
    message: str,
    constraint_id: str | None,
    evidence_ids: tuple[str, ...],
    provenance: dict[str, Any],
) -> dict[str, Any]:
    value: dict[str, Any] = {
        "checkId": check_id,
        "title": title,
        "status": status,
        "message": message,
        "evidenceIds": list(evidence_ids),
        "provenance": provenance,
    }
    if constraint_id is not None:
        value["constraintId"] = constraint_id
    return value
