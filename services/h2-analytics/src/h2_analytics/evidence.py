from __future__ import annotations

import csv
import io
import os
from dataclasses import dataclass
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path

_OFFICIAL_DATA_ENV = "H2_OFFICIAL_DATA_DIR"

_EVIDENCE_FILES = {
    "equipment_master": "08_equipment_master.csv",
    "control_constraints": "09_control_constraints.csv",
    "efficiency_curves": "10_electrolyzer_efficiency_curves.csv",
    "alarm_log": "11_alarm_log.csv",
    "operation_log": "12_operation_log.csv",
    "normal_context": "13_train_validation_normal_context.csv",
    "maintenance_history": "14_maintenance_history.csv",
}


def default_official_data_dir() -> str | None:
    value = os.environ.get(_OFFICIAL_DATA_ENV, "").strip()
    return value or None


@lru_cache(maxsize=1)
def _read_csv_lines(path: Path) -> tuple[dict[str, str], ...]:
    text = path.read_text(encoding="utf-8-sig")
    reader = csv.reader(io.StringIO(text, newline=""), strict=True)
    rows = list(reader)
    if not rows:
        return ()
    headers = [header.strip() for header in rows[0]]
    return tuple(
        dict(zip(headers, (cell.strip() for cell in row), strict=False))
        for row in rows[1:]
    )


def _parse_iso(value: str) -> datetime | None:
    candidate = value.strip()
    if not candidate:
        return None
    try:
        parsed = datetime.fromisoformat(candidate.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


@dataclass(frozen=True, slots=True)
class EvidenceContext:
    """Lightweight reader for the official supporting evidence files.

    When the configured data directory does not contain a file the
    corresponding table stays empty; the diagnosis chain then simply has
    nothing to cite. This keeps runs deterministic on any machine.
    """

    data_dir: str | None = None

    @classmethod
    def from_env(cls) -> "EvidenceContext":
        return cls(data_dir=default_official_data_dir())

    def _path(self, key: str) -> Path | None:
        if not self.data_dir:
            return None
        candidate = Path(self.data_dir) / _EVIDENCE_FILES[key]
        return candidate if candidate.is_file() else None

    def _rows(self, key: str) -> tuple[dict[str, str], ...]:
        path = self._path(key)
        if path is None:
            return ()
        try:
            return _read_csv_lines(path)
        except (csv.Error, OSError, UnicodeError):
            return ()

    def equipment(self) -> dict[str, str]:
        return {
            row["equipment_id"]: row["equipment_name"]
            for row in self._rows("equipment_master")
            if "equipment_id" in row and "equipment_name" in row
        }

    def control_constraints(self) -> tuple[dict[str, str], ...]:
        return tuple(
            row
            for row in self._rows("control_constraints")
            if {"object_id", "parameter", "value"}.issubset(row)
        )

    def efficiency_curves(self) -> tuple[dict[str, str], ...]:
        return tuple(
            row
            for row in self._rows("efficiency_curves")
            if {"equipment_id", "power_kw", "specific_energy_kwh_per_kg"}.issubset(row)
        )

    def maintenance_history(self) -> tuple[dict[str, str], ...]:
        return tuple(
            row
            for row in self._rows("maintenance_history")
            if "record_id" in row
        )

    def alarm_logs(self, *, start: datetime, end: datetime) -> tuple[dict[str, str], ...]:
        return self._rows_in_range("alarm_log", start, end)

    def operation_logs(
        self, *, start: datetime, end: datetime
    ) -> tuple[dict[str, str], ...]:
        return self._rows_in_range("operation_log", start, end)

    def normal_context(self, *, start: datetime, end: datetime) -> tuple[dict[str, str], ...]:
        return self._rows_overlap("normal_context", start, end)

    def _rows_in_range(
        self,
        key: str,
        start: datetime,
        end: datetime,
    ) -> tuple[dict[str, str], ...]:
        rows: list[dict[str, str]] = []
        for row in self._rows(key):
            timestamp = _parse_iso(row.get("timestamp", ""))
            if timestamp is not None and start <= timestamp <= end:
                rows.append(row)
        return tuple(rows)

    def _rows_overlap(
        self,
        key: str,
        start: datetime,
        end: datetime,
    ) -> tuple[dict[str, str], ...]:
        rows: list[dict[str, str]] = []
        for row in self._rows(key):
            row_start = _parse_iso(row.get("start_time", ""))
            row_end = _parse_iso(row.get("end_time", ""))
            if row_start is None or row_end is None:
                continue
            if row_start <= end and row_end >= start:
                rows.append(row)
        return tuple(rows)

    def table_exists(self, key: str) -> bool:
        return self._path(key) is not None
