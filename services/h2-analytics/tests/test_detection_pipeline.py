from __future__ import annotations

from collections.abc import Sequence
from dataclasses import replace
from datetime import timedelta

import pytest

from h2_analytics import vocabulary
from h2_analytics.detection import LightGbmRowDetector, RuleRowDetector
from h2_analytics.events import EventAggregator
from h2_analytics.impact import ImpactCalculator
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
                "elz2_power_cmd_kw": 300.0 if index % 2 == 0 else 600.0,
                "bess_power_actual_kw": 400.0 if index % 2 == 0 else -400.0,
            },
        )
        for index in range(20)
    )
    scenarios: dict[str, tuple] = {
        "C01": c01_rows,
        "C02": single(
            elz2_reported_available_capacity_kw=1000.0,
            elz2_actual_available_capacity_kw=500.0,
            elz2_power_cmd_kw=600.0,
            elz2_power_actual_kw=300.0,
        ),
        # C03: BESS command at the 400 kW level, same sign as a strong PCC flow.
        "C03": single(bess_power_cmd_kw=400.0, pcc_power_actual_kw=500.0),
        # C04: BESS forced to the 450 kW level.
        "C04": single(bess_power_cmd_kw=450.0),
        # C05: low export quota and its causal positive BESS signature agree.
        "C05": (
            replace(
                baseline,
                timestamp=baseline.timestamp.replace(hour=7, minute=7),
                values={
                    **baseline.values,
                    "grid_export_energy_quota_kwh_day": 2200.0,
                    "grid_import_energy_quota_kwh_day": 24000.0,
                    "grid_export_energy_quota_excess_kwh": 0.0,
                    "bess_power_cmd_kw": 300.0,
                    "bess_power_actual_kw": 300.0,
                },
            ),
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

    c01 = next(item for item in detector.detect(c01_rows) if item.code == "C01")
    assert c01.implicated_equipment_ids == ("ELZ01", "ELZ02")
    c02 = next(item for item in detector.detect(scenarios["C02"]) if item.code == "C02")
    assert c02.implicated_equipment_ids == ("ELZ02",)
    c06 = next(item for item in detector.detect(scenarios["C06"]) if item.code == "C06")
    assert c06.implicated_equipment_ids == ("ELZ01", "ELZ02")


@pytest.mark.parametrize(
    ("subtype", "target_kw", "export_quota", "import_quota", "excess_field"),
    [
        (
            "EXPORT_ENERGY_QUOTA_RISK",
            300.0,
            2200.0,
            24000.0,
            "grid_export_energy_quota_excess_kwh",
        ),
        (
            "IMPORT_ENERGY_QUOTA_RISK",
            -300.0,
            5200.0,
            12500.0,
            "grid_import_energy_quota_excess_kwh",
        ),
    ],
)
def test_c05_causal_signature_bounds_window_and_peak_impact(
    valid_csv: str,
    subtype: str,
    target_kw: float,
    export_quota: float,
    import_quota: float,
    excess_field: str,
) -> None:
    imported = DatasetLoader().import_csv(filename="fixture.csv", text=valid_csv)
    baseline = imported.rows[0]
    assert baseline.timestamp is not None
    first_signature = baseline.timestamp.replace(hour=6, minute=1)
    excess_values = (900.0, 0.0, 3.0, 8.0, 13.0, 21.0, 999.0)
    rows = tuple(
        replace(
            baseline,
            index=index + 1,
            timestamp=first_signature + timedelta(minutes=index - 1),
            timestamp_text=(
                first_signature + timedelta(minutes=index - 1)
            ).isoformat(),
            values={
                **baseline.values,
                "grid_export_energy_quota_kwh_day": export_quota,
                "grid_import_energy_quota_kwh_day": import_quota,
                "grid_export_energy_quota_excess_kwh": 0.0,
                "grid_import_energy_quota_excess_kwh": 0.0,
                "bess_power_cmd_kw": (
                    target_kw if index >= 1 else target_kw + 2.0
                ),
                "bess_power_actual_kw": (
                    target_kw if index <= 5 else target_kw + 2.0
                ),
                excess_field: excess_values[index],
            },
        )
        for index in range(7)
    )
    candidates = tuple(
        item for item in RuleRowDetector().detect(rows) if item.code == "C05"
    )
    windows = EventAggregator().aggregate(
        rows=rows,
        candidates=candidates,
        sampling_interval_minutes=1.0,
    )

    assert [item.timestamp for item in candidates] == [
        row.timestamp for row in rows[1:6]
    ]
    assert len(windows) == 1
    window = windows[0]
    impact = ImpactCalculator().calculate(
        window=window,
        sampling_interval_minutes=1.0,
    )

    assert window.start_time == rows[1].timestamp
    assert window.end_time == rows[5].timestamp
    assert window.first_detection_time == rows[4].timestamp
    assert window.subtype == subtype
    assert impact.value == pytest.approx(21.0)


def test_c05_requires_four_sustained_signature_samples(valid_csv: str) -> None:
    imported = DatasetLoader().import_csv(filename="fixture.csv", text=valid_csv)
    baseline = imported.rows[0]
    assert baseline.timestamp is not None
    rows = tuple(
        replace(
            baseline,
            index=index + 1,
            timestamp=baseline.timestamp + timedelta(minutes=index),
            timestamp_text=(baseline.timestamp + timedelta(minutes=index)).isoformat(),
            values={
                **baseline.values,
                "grid_export_energy_quota_kwh_day": 2200.0,
                "grid_import_energy_quota_kwh_day": 24000.0,
                "bess_power_cmd_kw": 300.0,
                "bess_power_actual_kw": 300.0,
            },
        )
        for index in range(4)
    )
    detector = RuleRowDetector()
    aggregator = EventAggregator()
    three_candidates = tuple(
        item for item in detector.detect(rows[:3]) if item.code == "C05"
    )
    four_candidates = tuple(
        item for item in detector.detect(rows) if item.code == "C05"
    )

    assert aggregator.aggregate(
        rows=rows[:3],
        candidates=three_candidates,
        sampling_interval_minutes=1.0,
    ) == ()
    window = aggregator.aggregate(
        rows=rows,
        candidates=four_candidates,
        sampling_interval_minutes=1.0,
    )[0]
    assert window.start_time == rows[0].timestamp
    assert window.first_detection_time == rows[3].timestamp


def test_c05_thresholds_record_train_only_causal_evidence() -> None:
    config = vocabulary.detection_thresholds()["classes"]["C05"]
    calibration = config["calibration"]
    minimum_rows = calibration["minimumRowsRationale"]

    assert config["aggregation"]["minimumRows"] == 4
    assert config["aggregation"]["confirmationRow"] == 4
    assert config["bessSignatureTargetMagnitudeKw"] == 300.0
    assert config["bessSignatureToleranceKw"] == 1.0
    assert calibration["split"] == "public_train"
    assert calibration["competitionPackageVersion"] == "public-v4.0"
    assert calibration["eventCount"] == 40
    assert calibration["subtypeEventCounts"] == {
        "EXPORT_ENERGY_QUOTA_RISK": 20,
        "IMPORT_ENERGY_QUOTA_RISK": 20,
    }
    assert minimum_rows["samplingIntervalMinutes"] == 1
    assert minimum_rows["requiresBessCommandAndActual"] is True
    assert minimum_rows["shortNonLabelSegmentCount"] == 15
    assert minimum_rows["shortNonLabelSegmentsByLengthMinutes"] == {
        "1": 4,
        "3": 11,
    }
    assert minimum_rows["maximumShortNonLabelSegmentMinutes"] == 3
    assert minimum_rows["minimumNoFalsePositiveRows"] == 4
    assert "minimum public-TRAIN confirmation" in minimum_rows["conclusion"]
    assert "empirical rule" in calibration["limitation"]
    assert "not a universally established physical law" in calibration["limitation"]
    assert "acceptance-only" in calibration["heldOutPolicy"]
    assert "does not set C05 detection thresholds" in calibration["heldOutPolicy"]


def test_c07_continues_while_charge_reserve_is_short_after_soc_recovers(
    valid_csv: str,
) -> None:
    imported = DatasetLoader().import_csv(filename="fixture.csv", text=valid_csv)
    baseline = imported.rows[0]
    assert baseline.timestamp is not None
    rows = tuple(
        replace(
            baseline,
            index=index + 1,
            timestamp=baseline.timestamp + timedelta(minutes=index),
            timestamp_text=(baseline.timestamp + timedelta(minutes=index)).isoformat(),
            values={
                **baseline.values,
                "bess_soc_pct": 40.0 if index < 2 else 56.0,
                "soc_target_pct": 60.0,
                "bess_regulation_reserve_target_kwh": 350.0,
                "bess_available_charge_energy_kwh": 10.526,
                "bess_available_discharge_energy_kwh": 900.0,
            },
        )
        for index in range(8)
    )
    candidates = tuple(
        item for item in RuleRowDetector().detect(rows) if item.code == "C07"
    )

    window = EventAggregator().aggregate(
        rows=rows,
        candidates=candidates,
        sampling_interval_minutes=1.0,
    )[0]
    impact = ImpactCalculator().calculate(
        window=window,
        sampling_interval_minutes=1.0,
    )

    assert window.subtype == "CHARGE_HEADROOM_SHORTFALL"
    assert window.end_time == rows[-1].timestamp
    assert impact.value == pytest.approx(339.474)


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
