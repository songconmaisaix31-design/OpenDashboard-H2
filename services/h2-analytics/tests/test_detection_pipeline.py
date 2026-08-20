from __future__ import annotations

from collections.abc import Sequence
from dataclasses import replace

import pytest

from h2_analytics.detection import LightGbmRowDetector, RuleRowDetector
from h2_analytics.ingestion import DatasetLoader
from h2_analytics.errors import AnalyticsError
from h2_analytics.service import AnalyticsService


def test_rule_detector_and_aggregation_produce_golden_boundaries(valid_csv: str) -> None:
    service = AnalyticsService()
    imported = service.import_csv(
        filename="tiny-valid-timeseries.csv",
        text=valid_csv,
    )
    run = service.run_analysis(imported["dataset"]["datasetId"])

    assert [event["eventId"] for event in run["events"]] == [
        "C03-20260105-001",
        "C04-20260105-001",
    ]
    c03, c04 = run["events"]
    assert (c03["startTime"], c03["firstDetectionTime"], c03["endTime"]) == (
        "2026-01-05T10:20:00Z",
        "2026-01-05T10:24:00Z",
        "2026-01-05T10:41:00Z",
    )
    assert (c04["startTime"], c04["firstDetectionTime"], c04["endTime"]) == (
        "2026-01-05T10:32:00Z",
        "2026-01-05T10:34:00Z",
        "2026-01-05T10:39:00Z",
    )
    assert c03["impact"]["value"] == 112.4
    assert c04["impact"]["value"] == pytest.approx(29.333333333333332)
    assert c04["evidence"][2]["actualValue"] == pytest.approx(
        29.333333333333332
    )


def test_repeated_analysis_is_byte_equivalent(valid_csv: str) -> None:
    service = AnalyticsService()
    dataset_id = service.import_csv(
        filename="tiny-valid-timeseries.csv", text=valid_csv
    )["dataset"]["datasetId"]

    assert service.run_analysis(dataset_id) == service.run_analysis(dataset_id)


def test_c04_fallback_uses_the_externalized_confirmation_margin(valid_csv: str) -> None:
    imported = DatasetLoader().import_csv(
        filename="tiny-valid-timeseries.csv", text=valid_csv
    )
    detector = RuleRowDetector()
    baseline = imported.rows[0]
    at_boundary = replace(
        baseline,
        values={
            **baseline.values,
            "pcc_power_kw": 600.0,
            "pcc_export_limit_kw": 500.0,
        },
    )
    above_boundary = replace(
        baseline,
        values={
            **baseline.values,
            "pcc_power_kw": 600.1,
            "pcc_export_limit_kw": 500.0,
        },
    )

    assert all(item.code != "C04" for item in detector.detect((at_boundary,)))
    assert any(item.code == "C04" for item in detector.detect((above_boundary,)))


def test_blocked_quality_prevents_analysis(invalid_csv: str) -> None:
    service = AnalyticsService()
    dataset_id = service.import_csv(
        filename="tiny-invalid-timeseries.csv", text=invalid_csv
    )["dataset"]["datasetId"]

    with pytest.raises(AnalyticsError, match="blocked"):
        service.run_analysis(dataset_id)


class FakeBooster:
    def predict(self, values: Sequence[Sequence[float]]) -> Sequence[Sequence[float]]:
        return [[0.1, 0.9] for _ in values]


def test_lightgbm_seam_accepts_only_a_preloaded_booster(valid_csv: str) -> None:
    rows = DatasetLoader().import_csv(
        filename="tiny-valid-timeseries.csv", text=valid_csv
    ).rows[:2]
    detector = LightGbmRowDetector(
        booster=FakeBooster(),
        feature_names=("bess_power_kw", "pcc_power_kw"),
        class_map={1: ("C03", "BESS_DIRECTION_REVERSED")},
        version="test-booster-v1",
    )

    candidates = detector.detect(rows)
    assert len(candidates) == 2
    assert all(candidate.detector_version == "test-booster-v1" for candidate in candidates)
    assert not hasattr(detector, "model_path")
