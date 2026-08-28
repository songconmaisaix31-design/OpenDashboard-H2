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
    assert c03["severity"] == "high"
    assert c04["severity"] == "high"
    # Both values are computed from the fixture, not pinned by dataset fingerprint.
    # C03 integrates |BESS actual| (the anomalous BESS contribution) and C04
    # integrates the export excess, so the two metrics are numerically distinct.
    assert c03["impact"]["value"] == pytest.approx(84.33333333333333)
    assert c04["impact"]["value"] == pytest.approx(120.0)
    assert c04["evidence"][2]["actualValue"] == pytest.approx(120.0)


def test_repeated_analysis_is_byte_equivalent(valid_csv: str) -> None:
    service = AnalyticsService()
    dataset_id = service.import_csv(
        filename="tiny-valid-timeseries.csv", text=valid_csv
    )["dataset"]["datasetId"]

    assert service.run_analysis(dataset_id) == service.run_analysis(dataset_id)


def test_c04_fires_on_bess_marker_or_tracking_loss(valid_csv: str) -> None:
    imported = DatasetLoader().import_csv(
        filename="tiny-valid-timeseries.csv", text=valid_csv
    )
    baseline = imported.rows[0]
    detector = RuleRowDetector()

    # BESS forced to its 450 kW level fires
    # even when no violation column is reported.
    marker = replace(
        baseline,
        values={
            **baseline.values,
            "bess_power_cmd_kw": 450.0,
            "pcc_export_power_violation_kw": 0.0,
            "pcc_import_power_violation_kw": 0.0,
        },
    )
    # A large reported violation with a stuck command (tracking loss, as in the
    # golden fixture) fires via the command-gap branch.
    tracking_loss = replace(
        baseline,
        values={
            **baseline.values,
            "bess_power_cmd_kw": 0.0,
            "pcc_export_power_violation_kw": 700.0,
            "pcc_import_power_violation_kw": 0.0,
            "pcc_power_cmd_kw": 400.0,
            "pcc_power_actual_kw": 1400.0,
        },
    )
    # A violation that is actually commanded (no tracking loss) and has no BESS
    # marker stays quiet, as do small violations.
    commanded = replace(
        baseline,
        values={
            **baseline.values,
            "bess_power_cmd_kw": 0.0,
            "pcc_export_power_violation_kw": 700.0,
            "pcc_import_power_violation_kw": 0.0,
            "pcc_power_cmd_kw": 1400.0,
            "pcc_power_actual_kw": 1400.0,
        },
    )
    quiet = replace(
        baseline,
        values={
            **baseline.values,
            "bess_power_cmd_kw": 0.0,
            "pcc_export_power_violation_kw": 120.0,
            "pcc_import_power_violation_kw": 0.0,
        },
    )

    assert any(item.code == "C04" for item in detector.detect((marker,)))
    assert any(item.code == "C04" for item in detector.detect((tracking_loss,)))
    assert all(item.code != "C04" for item in detector.detect((commanded,)))
    assert all(item.code != "C04" for item in detector.detect((quiet,)))


def test_blocked_quality_prevents_analysis(invalid_csv: str) -> None:
    service = AnalyticsService()
    dataset_id = service.import_csv(
        filename="tiny-invalid-timeseries.csv", text=invalid_csv
    )["dataset"]["datasetId"]

    with pytest.raises(AnalyticsError, match="blocked"):
        service.run_analysis(dataset_id)


def test_rule_detector_covers_all_seven_codes(valid_csv: str) -> None:
    imported = DatasetLoader().import_csv(
        filename="tiny-valid-timeseries.csv", text=valid_csv
    )
    baseline = imported.rows[0]
    detector = RuleRowDetector()

    def single(**changes: object) -> tuple:
        return (replace(baseline, values={**baseline.values, **changes}),)

    c01_rows = tuple(
        replace(
            baseline,
            values={
                **baseline.values,
                "elz1_power_cmd_kw": 600.0 if index % 2 == 0 else 300.0,
                "bess_power_actual_kw": 400.0 if index % 2 == 0 else -400.0,
            },
        )
        for index in range(20)
    )
    scenarios: dict[str, tuple] = {
        "C01": c01_rows,
        "C02": single(
            elz1_reported_available_capacity_kw=1000.0,
            elz1_actual_available_capacity_kw=500.0,
            elz1_power_cmd_kw=600.0,
            elz1_power_actual_kw=300.0,
        ),
        # C03: BESS command at the 400 kW level, same sign as a strong PCC flow.
        "C03": single(bess_power_cmd_kw=400.0, pcc_power_actual_kw=500.0),
        # C04: BESS forced to the 450 kW level.
        "C04": single(bess_power_cmd_kw=450.0),
        # C05: anomalous daily quota plus a quota breach.
        "C05": single(
            grid_export_energy_quota_kwh_day=2200.0,
            grid_export_energy_quota_excess_kwh=15.0,
        ),
        # C06: all units running; the less-efficient unit carries the load while
        # the efficient unit has headroom.
        "C06": single(
            elz1_run_state=2.0,
            elz2_run_state=2.0,
            elz3_run_state=2.0,
            elz1_power_actual_kw=500.0,
            elz1_specific_energy_kwh_per_kg=55.0,
            elz2_power_actual_kw=100.0,
            elz2_specific_energy_kwh_per_kg=52.0,
            elz2_available_flag=1,
            elz2_actual_available_capacity_kw=1000.0,
        ),
        # C07: SOC deviation with the elevated 350 kWh reserve target.
        "C07": single(
            bess_soc_pct=40.0,
            soc_target_pct=88.0,
            bess_regulation_reserve_target_kwh=350.0,
        ),
    }
    for code, rows in scenarios.items():
        assert any(item.code == code for item in detector.detect(rows)), code


class FakeBooster:
    def predict(self, values: Sequence[Sequence[float]]) -> Sequence[Sequence[float]]:
        return [[0.1, 0.9] for _ in values]


def test_lightgbm_seam_accepts_only_a_preloaded_booster(valid_csv: str) -> None:
    rows = DatasetLoader().import_csv(
        filename="tiny-valid-timeseries.csv", text=valid_csv
    ).rows[:2]
    detector = LightGbmRowDetector(
        booster=FakeBooster(),
        feature_names=("bess_power_actual_kw", "pcc_power_actual_kw"),
        class_map={1: ("C03", "BESS_DIRECTION_REVERSED")},
        version="test-booster-v1",
    )

    candidates = detector.detect(rows)
    assert len(candidates) == 2
    assert all(candidate.detector_version == "test-booster-v1" for candidate in candidates)
    assert not hasattr(detector, "model_path")
