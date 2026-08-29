from __future__ import annotations

from array import array
from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from functools import lru_cache
from typing import Any


class CompactValues(Mapping[str, float | None]):
    """Store wide numeric CSV rows compactly while retaining mapping behavior."""

    __slots__ = ("_fields", "_missing", "_values")

    def __init__(
        self, fields: tuple[str, ...], values: Sequence[float | None]
    ) -> None:
        self._fields = fields
        missing = 0
        packed = array("d")
        for index, value in enumerate(values):
            if value is None:
                missing |= 1 << index
                packed.append(0.0)
            else:
                packed.append(value)
        self._missing = missing
        self._values = packed

    def __getitem__(self, field: str) -> float | None:
        try:
            index = _field_positions(self._fields)[field]
        except KeyError as error:
            raise KeyError(field) from error
        if self._missing & (1 << index):
            return None
        return self._values[index]

    def __iter__(self) -> Iterator[str]:
        return iter(self._fields)

    def __len__(self) -> int:
        return len(self._fields)


@lru_cache(maxsize=32)
def _field_positions(fields: tuple[str, ...]) -> dict[str, int]:
    return {field: index for index, field in enumerate(fields)}


@dataclass(frozen=True, slots=True)
class DataRow:
    index: int
    timestamp: datetime | None
    timestamp_text: str
    values: Mapping[str, float | None]

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
