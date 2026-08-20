from __future__ import annotations

from h2_analytics.models import DataRow
from h2_analytics.settings import (
    DEFAULT_CONSTRAINTS,
    FALLBACK_DETECTOR_VERSION,
    H2Constraints,
)

from .base import DetectionCandidate


class RuleRowDetector:
    """Dependency-light fallback for the two frozen, auditable field mappings."""

    def __init__(self, constraints: H2Constraints = DEFAULT_CONSTRAINTS) -> None:
        self._constraints = constraints

    @property
    def version(self) -> str:
        return FALLBACK_DETECTOR_VERSION

    def detect(self, rows: tuple[DataRow, ...]) -> tuple[DetectionCandidate, ...]:
        candidates: list[DetectionCandidate] = []
        for row in rows:
            if row.timestamp is None:
                continue
            candidates.extend(self._detect_c03(row))
            candidates.extend(self._detect_c04(row))
        return tuple(
            sorted(
                candidates,
                key=lambda item: (item.timestamp, item.code, item.subtype, item.row_index),
            )
        )

    def _detect_c03(self, row: DataRow) -> tuple[DetectionCandidate, ...]:
        command = row.value("bess_dispatch_command_kw")
        actual = row.value("bess_power_kw")
        if (
            command is None
            or actual is None
            or abs(command) < 1.0
            or abs(actual) < 1.0
            or command * actual >= 0
        ):
            return ()
        assert row.timestamp is not None
        return (
            DetectionCandidate(
                row_index=row.index,
                timestamp=row.timestamp,
                code="C03",
                subtype="BESS_DIRECTION_REVERSED",
                confidence=0.94,
                detector_version=self.version,
            ),
        )

    def _detect_c04(self, row: DataRow) -> tuple[DetectionCandidate, ...]:
        pcc = row.value("pcc_power_kw")
        export_limit = row.value("pcc_export_limit_kw")
        import_limit = row.value("pcc_import_limit_kw")
        if pcc is None:
            return ()
        subtype: str | None = None
        margin = self._constraints.pcc_boundary_detection_margin_kw
        if export_limit is not None and pcc > export_limit + margin:
            subtype = "EXPORT_POWER_LIMIT_NOT_TRACKED"
        elif import_limit is not None and pcc < -(import_limit + margin):
            subtype = "IMPORT_POWER_LIMIT_NOT_TRACKED"
        if subtype is None:
            return ()
        assert row.timestamp is not None
        return (
            DetectionCandidate(
                row_index=row.index,
                timestamp=row.timestamp,
                code="C04",
                subtype=subtype,
                confidence=0.91,
                detector_version=self.version,
            ),
        )
