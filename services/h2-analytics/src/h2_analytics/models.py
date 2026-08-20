from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass(frozen=True, slots=True)
class DataRow:
    index: int
    timestamp: datetime | None
    timestamp_text: str
    values: dict[str, float | None]

    def value(self, field: str) -> float | None:
        return self.values.get(field)


@dataclass(frozen=True, slots=True)
class ParseDiagnostics:
    missing_fields: tuple[str, ...]
    missing_values: dict[str, int]
    invalid_numeric_values: dict[str, int]
    invalid_timestamps: int
    duplicate_timestamps: int
    out_of_order_timestamps: int
    irregular_intervals: int
    invalid_ranges: dict[str, int]
    maximum_power_balance_residual_kw: float | None


@dataclass(frozen=True, slots=True)
class ImportedDataset:
    manifest: dict[str, Any]
    quality: dict[str, Any]
    rows: tuple[DataRow, ...]
