from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Protocol

from h2_analytics.models import DataRow

from .base import DetectionCandidate


class BoosterLike(Protocol):
    def predict(self, values: Sequence[Sequence[float]]) -> Sequence[Sequence[float]]: ...


class LightGbmRowDetector:
    """Adapter over an approved, already-loaded booster.

    Model paths are deliberately absent from this interface. Loading and
    approving a model artifact is an integration responsibility, not an API
    input.
    """

    def __init__(
        self,
        *,
        booster: BoosterLike,
        feature_names: Sequence[str],
        class_map: Mapping[int, tuple[str, str]],
        version: str,
        minimum_confidence: float = 0.5,
    ) -> None:
        if not feature_names or not class_map or not version:
            raise ValueError("LightGBM adapter requires features, classes, and a version.")
        unsupported_dynamic_codes = {
            code for code, _subtype in class_map.values() if code in {"C01", "C02", "C06"}
        }
        if unsupported_dynamic_codes:
            raise ValueError(
                "LightGBM adapter cannot attribute equipment for dynamic classes: "
                + ", ".join(sorted(unsupported_dynamic_codes))
            )
        if not 0 <= minimum_confidence <= 1:
            raise ValueError("minimum_confidence must be between zero and one.")
        self._booster = booster
        self._feature_names = tuple(feature_names)
        self._class_map = dict(class_map)
        self._version = version
        self._minimum_confidence = minimum_confidence

    @property
    def version(self) -> str:
        return self._version

    def detect(self, rows: tuple[DataRow, ...]) -> tuple[DetectionCandidate, ...]:
        usable = [
            row
            for row in rows
            if row.timestamp is not None
            and all(row.value(name) is not None for name in self._feature_names)
        ]
        if not usable:
            return ()
        matrix = [
            [float(row.value(name)) for name in self._feature_names]  # type: ignore[arg-type]
            for row in usable
        ]
        probabilities = self._booster.predict(matrix)
        if len(probabilities) != len(usable):
            raise ValueError("LightGBM prediction row count does not match the input.")
        candidates: list[DetectionCandidate] = []
        for row, scores in zip(usable, probabilities, strict=True):
            if not scores:
                continue
            class_index = max(range(len(scores)), key=lambda index: scores[index])
            confidence = float(scores[class_index])
            identity = self._class_map.get(class_index)
            if identity is None or confidence < self._minimum_confidence:
                continue
            code, subtype = identity
            assert row.timestamp is not None
            candidates.append(
                DetectionCandidate(
                    row.index,
                    row.timestamp,
                    code,
                    subtype,
                    confidence,
                    self.version,
                )
            )
        return tuple(candidates)
