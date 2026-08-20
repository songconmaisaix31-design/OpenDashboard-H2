from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from h2_analytics.models import DataRow


@dataclass(frozen=True, slots=True)
class DetectionCandidate:
    row_index: int
    timestamp: datetime
    code: str
    subtype: str
    confidence: float
    detector_version: str


class RowDetector(Protocol):
    @property
    def version(self) -> str: ...

    def detect(self, rows: tuple[DataRow, ...]) -> tuple[DetectionCandidate, ...]: ...
