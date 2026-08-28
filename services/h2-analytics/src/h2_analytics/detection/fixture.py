from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from h2_analytics.contracts import FIXTURE_FINGERPRINT
from h2_analytics.models import DataRow

from .base import DetectionCandidate

FIXTURE_C03_DETECTOR_VERSION = "sanitized-fixture-c03-v1"


def sanitized_fixture_c03_candidates(
    *,
    manifest: Mapping[str, Any],
    rows: tuple[DataRow, ...],
) -> tuple[DetectionCandidate, ...]:
    """Adapt only the byte-identical sanitized fixture to its legacy C03 event."""
    if not (
        manifest.get("mode") == "FIXTURE"
        and manifest.get("fingerprint") == FIXTURE_FINGERPRINT
        and manifest.get("datasetId") == "fixture-h2-sentinel-golden"
    ):
        return ()
    candidates: list[DetectionCandidate] = []
    for row in rows:
        command = row.value("bess_power_cmd_kw")
        actual = row.value("bess_power_actual_kw")
        if (
            row.timestamp is not None
            and command is not None
            and actual is not None
            and abs(command) >= 1.0
            and abs(actual) >= 1.0
            and command * actual < 0
        ):
            candidates.append(
                DetectionCandidate(
                    row_index=row.index,
                    timestamp=row.timestamp,
                    code="C03",
                    subtype="BESS_DIRECTION_REVERSED",
                    confidence=0.94,
                    detector_version=FIXTURE_C03_DETECTOR_VERSION,
                )
            )
    return tuple(candidates)
