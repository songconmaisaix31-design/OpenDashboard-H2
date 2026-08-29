from __future__ import annotations

import csv
from collections.abc import Sequence
from dataclasses import replace
from datetime import timedelta
from io import StringIO

import pytest

from h2_analytics import vocabulary
from h2_analytics.detection import (
    DetectionCandidate,
    LightGbmRowDetector,
    RuleRowDetector,
    sanitized_fixture_c03_candidates,
)
from h2_analytics.detection.c06 import inefficient_allocation_signature
from h2_analytics.events import EventAggregator
from h2_analytics.impact import ImpactCalculator
from h2_analytics.ingestion import DatasetLoader
from h2_analytics.errors import AnalyticsError
from h2_analytics.models import DataRow
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
    assert c03["impact"]["formulaVersion"] == "impact-c03-v1"
    assert next(
        item for item in c03["evidence"] if item["kind"] == "derived_metric"
    )["source"] == "impact-c03-v1"
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

    # T07 三分支矩阵：合成行需带齐纠偏通道字段（BESS 双向限额 + 运行中
    # 且有双向爬坡空间的 ELZ），否则按"数据缺失"降观察、不产候选。
    executable_channels = {
        "bess_power_actual_kw": 0.0,
        "bess_charge_power_limit_kw": 500.0,
        "bess_discharge_power_limit_kw": 500.0,
        "elz1_power_actual_kw": 500.0,
        "elz2_power_actual_kw": 500.0,
        "elz3_power_actual_kw": 500.0,
        "elz1_actual_available_capacity_kw": 1000.0,
        "elz2_actual_available_capacity_kw": 1000.0,
        "elz3_actual_available_capacity_kw": 1000.0,
        "elz1_run_state": 2.0,
        "elz2_run_state": 2.0,
        "elz3_run_state": 2.0,
    }

    # BESS forced to its 450 kW level fires
    # even when no violation column is reported.
    marker = replace(
        baseline,
        values={
            **baseline.values,
            **executable_channels,
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
            **executable_channels,
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
    assert baseline.timestamp is not None
    baseline_timestamp = baseline.timestamp
    detector = RuleRowDetector()

    def single(**changes: float | None) -> tuple[DataRow, ...]:
        return (replace(baseline, values={**baseline.values, **changes}),)

    def consecutive(count: int, **changes: float | None) -> tuple[DataRow, ...]:
        return tuple(
            replace(
                baseline,
                index=baseline.index + index,
                timestamp=baseline_timestamp + timedelta(minutes=index),
                timestamp_text=(
                    baseline_timestamp + timedelta(minutes=index)
                ).isoformat(),
                values={**baseline.values, **changes},
            )
            for index in range(count)
        )

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
        # C03: the public marker follows the official sign while opposing SOC need.
        "C03": consecutive(
            5,
            bess_power_cmd_kw=400.0,
            bess_power_actual_kw=400.0,
            pcc_power_actual_kw=500.0,
            bess_soc_pct=40.0,
            soc_target_pct=60.0,
        ),
        # C04: BESS forced to the 450 kW level（通道字段带齐以满足三分支矩阵）。
        "C04": single(
            bess_power_cmd_kw=450.0,
            bess_power_actual_kw=0.0,
            bess_charge_power_limit_kw=500.0,
            bess_discharge_power_limit_kw=500.0,
            elz1_power_actual_kw=500.0,
            elz2_power_actual_kw=500.0,
            elz3_power_actual_kw=500.0,
            elz1_run_state=2.0,
            elz2_run_state=2.0,
            elz3_run_state=2.0,
        ),
        # C05: low export quota and its causal positive BESS signature agree.
        "C05": (
            replace(
                baseline,
                timestamp=baseline_timestamp.replace(hour=7, minute=7),
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
        # C06: the TRAIN-frozen allocation marker also has a feasible,
        # curve-supported equivalent-output transfer from ELZ03 to ELZ02.
        "C06": single(
            ems_total_elz_target_kw=2000.0,
            elz1_available_flag=1.0,
            elz1_run_state=2.0,
            elz1_actual_available_capacity_kw=1000.0,
            elz1_power_cmd_kw=400.0,
            elz1_power_actual_kw=400.0,
            elz1_specific_energy_kwh_per_kg=51.0,
            elz2_available_flag=1.0,
            elz2_run_state=2.0,
            elz2_actual_available_capacity_kw=1000.0,
            elz2_power_cmd_kw=600.0,
            elz2_power_actual_kw=600.0,
            elz2_specific_energy_kwh_per_kg=52.0,
            elz3_available_flag=1.0,
            elz3_run_state=2.0,
            elz3_actual_available_capacity_kw=1000.0,
            elz3_power_cmd_kw=1000.0,
            elz3_power_actual_kw=1000.0,
            elz3_specific_energy_kwh_per_kg=54.2,
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
    assert c06.implicated_equipment_ids == ("ELZ03", "ELZ02")


def test_c01_requires_exactly_two_causally_oscillating_electrolyzers(
    valid_csv: str,
) -> None:
    imported = DatasetLoader().import_csv(filename="fixture.csv", text=valid_csv)
    baseline = imported.rows[0]
    assert baseline.timestamp is not None

    def rows(oscillating_units: set[int]) -> tuple[DataRow, ...]:
        output: list[DataRow] = []
        for index in range(24):
            timestamp = baseline.timestamp + timedelta(minutes=index)
            values = {
                **baseline.values,
                "bess_power_actual_kw": 400.0 if index % 2 == 0 else -400.0,
            }
            for unit in range(1, 4):
                if unit in oscillating_units:
                    values[f"elz{unit}_power_cmd_kw"] = (
                        600.0 if index % 2 == 0 else 300.0
                    )
            output.append(
                replace(
                    baseline,
                    index=index + 1,
                    timestamp=timestamp,
                    timestamp_text=timestamp.isoformat(),
                    values=values,
                )
            )
        return tuple(output)

    one_unit_candidates = tuple(
        candidate
        for candidate in RuleRowDetector().detect(rows({1}))
        if candidate.code == "C01"
    )
    two_unit_rows = rows({1, 2})
    two_unit_candidates = tuple(
        candidate
        for candidate in RuleRowDetector().detect(two_unit_rows)
        if candidate.code == "C01"
    )

    assert one_unit_candidates == ()
    assert len(two_unit_candidates) == 5
    assert all(
        candidate.implicated_equipment_ids == ("ELZ01", "ELZ02")
        for candidate in two_unit_candidates
    )
    assert len(
        EventAggregator().aggregate(
            rows=two_unit_rows,
            candidates=two_unit_candidates,
            sampling_interval_minutes=1.0,
        )
    ) == 1


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
    excess_values = (900.0, 0.0, 0.0, 0.0, 0.0, 21.0, 999.0)
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
                # T05 相对带下 ±2kW 扰动仍在带内，改用 ±100kW 制造带外边界。
                "bess_power_cmd_kw": (
                    target_kw if index >= 1 else target_kw + 100.0
                ),
                "bess_power_actual_kw": (
                    target_kw if index <= 5 else target_kw + 100.0
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
    assert window.first_detection_time < rows[5].timestamp
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

    subminute_rows = tuple(
        replace(
            row,
            index=100 + index,
            timestamp=baseline.timestamp + timedelta(seconds=15 * index),
            timestamp_text=(
                baseline.timestamp + timedelta(seconds=15 * index)
            ).isoformat(),
        )
        for index, row in enumerate(rows)
    )
    subminute_candidates = tuple(
        item
        for item in detector.detect(subminute_rows)
        if item.code == "C05"
    )
    assert aggregator.aggregate(
        rows=subminute_rows,
        candidates=subminute_candidates,
        sampling_interval_minutes=0.25,
    ) == ()


def test_c05_thresholds_record_train_only_causal_evidence() -> None:
    config = vocabulary.detection_thresholds()["classes"]["C05"]
    calibration = config["calibration"]
    minimum_rows = calibration["minimumRowsRationale"]

    assert config["aggregation"]["minimumRows"] == 4
    assert config["aggregation"]["confirmationRow"] == 4
    assert config["aggregation"]["requiresExactSamplingInterval"] is True
    assert config["aggregation"]["exactSamplingIntervalMinutes"] == 1
    assert config["relativeBandLowRatio"] == 0.55
    assert config["relativeBandHighRatio"] == 0.7
    assert config["actualTrackingToleranceKw"] == 5.0
    assert config["plateauToleranceKw"] == 5.0
    assert "bessSignatureTargetMagnitudeKw" not in config
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
    assert "before the first positive hard quota-excess" in calibration[
        "earlyWarningDefinition"
    ]
    assert "not required to precede event start" in calibration[
        "earlyWarningDefinition"
    ]
    assert "empirical rule" in calibration["limitation"]
    assert "not a universally established physical law" in calibration["limitation"]
    assert "acceptance-only" in calibration["heldOutPolicy"]
    assert "does not set C05 detection thresholds" in calibration["heldOutPolicy"]


def test_c06_persistent_start_stop_signature_wins_and_preserves_boundaries(
    valid_csv: str,
) -> None:
    imported = DatasetLoader().import_csv(filename="fixture.csv", text=valid_csv)
    baseline = imported.rows[0]
    assert baseline.timestamp is not None
    start = baseline.timestamp.replace(hour=8, minute=0)

    def row(index: int, power: float, state: float) -> DataRow:
        timestamp = start + timedelta(minutes=index)
        return replace(
            baseline,
            index=index,
            timestamp=timestamp,
            timestamp_text=timestamp.isoformat(),
            values={
                **baseline.values,
                "elz1_power_actual_kw": power,
                "elz2_power_actual_kw": power,
                "elz3_power_actual_kw": power,
                "elz1_run_state": state,
                "elz2_run_state": state,
                "elz3_run_state": state,
                "elz1_specific_energy_kwh_per_kg": 60.0,
                "elz2_specific_energy_kwh_per_kg": 60.0,
                "elz3_specific_energy_kwh_per_kg": 60.0,
            },
        )

    rows = (
        row(0, 380.0, 1.0),
        *(row(index, 400.0, 2.0) for index in range(1, 36)),
        row(36, 420.0, 1.0),
    )
    candidates = tuple(
        item for item in RuleRowDetector().detect(rows) if item.code == "C06"
    )
    window = EventAggregator().aggregate(
        rows=rows,
        candidates=candidates,
        sampling_interval_minutes=1.0,
    )[0]

    assert {item.subtype for item in candidates} == {"AVOIDABLE_START_STOP"}
    assert [item.timestamp for item in candidates] == [
        item.timestamp for item in rows[1:-1]
    ]
    assert window.start_time == rows[1].timestamp
    assert window.end_time == rows[-2].timestamp
    assert window.implicated_equipment_ids == ("ELZ01", "ELZ02", "ELZ03")


def test_c06_inefficient_signature_preserves_persistent_boundaries(
    valid_csv: str,
) -> None:
    imported = DatasetLoader().import_csv(filename="fixture.csv", text=valid_csv)
    baseline = imported.rows[0]
    assert baseline.timestamp is not None
    start = baseline.timestamp.replace(hour=8, minute=0)

    def row(index: int, *, signature: bool) -> DataRow:
        timestamp = start + timedelta(minutes=index)
        powers = (300.0, 450.0, 750.0) if signature else (500.0, 500.0, 500.0)
        specifics = (57.0, 56.0, 53.2) if signature else (52.0, 52.7, 54.2)
        values = {**baseline.values, "ems_total_elz_target_kw": 1500.0}
        for unit, (power, specific) in enumerate(
            zip(powers, specifics, strict=True),
            start=1,
        ):
            values.update(
                {
                    f"elz{unit}_available_flag": 1.0,
                    f"elz{unit}_run_state": 2.0,
                    f"elz{unit}_actual_available_capacity_kw": 1000.0,
                    f"elz{unit}_power_cmd_kw": power,
                    f"elz{unit}_power_actual_kw": power,
                    f"elz{unit}_specific_energy_kwh_per_kg": specific,
                }
            )
        return replace(
            baseline,
            index=index + 1,
            timestamp=timestamp,
            timestamp_text=timestamp.isoformat(),
            values=values,
        )

    rows = (
        row(0, signature=False),
        *(row(index, signature=True) for index in range(1, 36)),
        row(36, signature=False),
    )
    candidates = tuple(
        item
        for item in RuleRowDetector().detect(rows)
        if item.code == "C06"
        and item.subtype == "INEFFICIENT_POWER_ALLOCATION"
    )
    windows = EventAggregator().aggregate(
        rows=rows,
        candidates=candidates,
        sampling_interval_minutes=1.0,
    )

    assert [candidate.row_index for candidate in candidates] == list(range(2, 37))
    assert len(windows) == 1
    assert windows[0].start_time == rows[1].timestamp
    assert windows[0].first_detection_time == rows[10].timestamp
    assert windows[0].end_time == rows[-2].timestamp
    assert set(windows[0].implicated_equipment_ids) == {"ELZ02", "ELZ03"}


def test_c06_allocation_marker_without_feasible_alternative_fails_closed(
    valid_csv: str,
) -> None:
    imported = DatasetLoader().import_csv(filename="fixture.csv", text=valid_csv)
    baseline = imported.rows[0]
    values = {**baseline.values, "ems_total_elz_target_kw": 1500.0}
    for unit, power in enumerate((300.0, 450.0, 750.0), start=1):
        values.update(
            {
                f"elz{unit}_available_flag": 1.0,
                f"elz{unit}_run_state": 2.0,
                f"elz{unit}_actual_available_capacity_kw": 1000.0,
                f"elz{unit}_power_cmd_kw": power,
                f"elz{unit}_power_actual_kw": power,
                f"elz{unit}_specific_energy_kwh_per_kg": 54.0,
            }
        )
    row = replace(baseline, values=values)

    assert not any(
        item.code == "C06" and item.subtype == "INEFFICIENT_POWER_ALLOCATION"
        for item in RuleRowDetector().detect((row,))
    )


def test_c06_rejects_current_power_above_actual_capacity(valid_csv: str) -> None:
    imported = DatasetLoader().import_csv(filename="fixture.csv", text=valid_csv)
    baseline = imported.rows[0]
    values = {**baseline.values, "ems_total_elz_target_kw": 1500.0}
    for unit, (power, capacity, specific) in enumerate(
        (
            (300.0, 1000.0, 57.0),
            (450.0, 100.0, 56.0),
            (750.0, 1000.0, 53.2),
        ),
        start=1,
    ):
        values.update(
            {
                f"elz{unit}_available_flag": 1.0,
                f"elz{unit}_run_state": 2.0,
                f"elz{unit}_actual_available_capacity_kw": capacity,
                f"elz{unit}_power_cmd_kw": power,
                f"elz{unit}_power_actual_kw": power,
                f"elz{unit}_specific_energy_kwh_per_kg": specific,
            }
        )
    row = replace(baseline, values=values)

    assert inefficient_allocation_signature(row) is None
    assert not any(
        candidate.code == "C06"
        and candidate.subtype == "INEFFICIENT_POWER_ALLOCATION"
        for candidate in RuleRowDetector().detect((row,))
    )


def test_c03_and_c06_thresholds_freeze_train_only_findings() -> None:
    classes = vocabulary.detection_thresholds()["classes"]
    c03 = classes["C03"]
    c06 = classes["C06"]

    assert c03["relativeBandLowRatio"] == 0.75
    assert c03["relativeBandHighRatio"] == 0.85
    assert c03["plateauToleranceKw"] == 5.0
    assert c03["actualTrackingToleranceKw"] == 5.0
    assert "bessSignatureTargetMagnitudeKw" not in c03
    assert c03["calibration"]["eventCount"] == 40
    assert c03["calibration"]["qualifiedSignatureRunCount"] == 40
    assert c03["calibration"]["shortNonLabelRunCount"] == 3
    assert "acceptance-only" in c03["calibration"]["heldOutPolicy"]
    start_stop = c06["calibration"]["avoidableStartStop"]
    inefficient = c06["calibration"]["inefficientPowerAllocation"]
    assert start_stop["eventCount"] == 20
    assert start_stop["signatureRunCount"] == 20
    assert start_stop["extraSignatureRunCount"] == 0
    assert "evaluated before" in start_stop["precedence"]
    assert inefficient["eventCount"] == 20
    assert inefficient["inclusiveEventSampleCount"] == 3265
    assert inefficient["signatureRunCount"] == 20
    assert inefficient["exactBoundaryMatchCount"] == 20
    assert inefficient["extraSignatureRunCount"] == 0
    assert "equivalent-output reference" in inefficient["signature"]
    assert "retains no official rows" in inefficient["derivationProcedure"][-1]
    assert len(c06["calibration"]["sourceFiles"]["timeseries"]["sha256"]) == 64
    assert "acceptance-only" in c06["calibration"]["heldOutPolicy"]


def _c06_t06_row(
    baseline: DataRow,
    index: int,
    *,
    target: float,
    powers: tuple[float, float, float],
    capacities: tuple[float, float, float],
    specifics: tuple[float, float, float],
) -> DataRow:
    """T06 新增测试共用行构造器：三台可用、逐台跟踪、总量平衡。"""
    assert baseline.timestamp is not None
    values = {**baseline.values, "ems_total_elz_target_kw": target}
    for unit, (power, capacity, specific) in enumerate(
        zip(powers, capacities, specifics, strict=True),
        start=1,
    ):
        values.update(
            {
                f"elz{unit}_available_flag": 1.0,
                f"elz{unit}_run_state": 2.0,
                f"elz{unit}_actual_available_capacity_kw": capacity,
                f"elz{unit}_power_cmd_kw": power,
                f"elz{unit}_power_actual_kw": power,
                f"elz{unit}_specific_energy_kwh_per_kg": specific,
            }
        )
    return replace(
        baseline,
        index=index,
        timestamp=baseline.timestamp + timedelta(minutes=index),
        timestamp_text=(
            baseline.timestamp + timedelta(minutes=index)
        ).isoformat(),
        values=values,
    )


def test_c06_start_stop_relative_band_admits_replayed_level(valid_csv: str) -> None:
    """T06：相对容量带泛化——450kW（0.45×容量）重放水平可检，旧绝对带漏。"""
    imported = DatasetLoader().import_csv(filename="fixture.csv", text=valid_csv)
    baseline = imported.rows[0]

    def rows_for(power: float) -> tuple[DataRow, ...]:
        return tuple(
            _c06_t06_row(
                baseline,
                index,
                target=3 * power,
                powers=(power,) * 3,
                capacities=(1000.0, 1000.0, 1000.0),
                specifics=(55.0, 54.0, 53.0),
            )
            for index in range(35)
        )

    hit = tuple(
        item
        for item in RuleRowDetector().detect(rows_for(450.0))
        if item.code == "C06" and item.subtype == "AVOIDABLE_START_STOP"
    )
    assert len(hit) == 35

    miss = tuple(
        item
        for item in RuleRowDetector().detect(rows_for(460.0))
        if item.code == "C06" and item.subtype == "AVOIDABLE_START_STOP"
    )
    assert miss == ()


def test_c06_start_stop_avoidability_gate_requires_two_unit_headroom(
    valid_csv: str,
) -> None:
    """T06：可避免性因果门——总目标超出两台承载（0.95×2×最小容量）时不报。"""
    imported = DatasetLoader().import_csv(filename="fixture.csv", text=valid_csv)
    baseline = imported.rows[0]

    def rows_for(target: float) -> tuple[DataRow, ...]:
        return tuple(
            _c06_t06_row(
                baseline,
                index,
                target=target,
                powers=(400.0, 400.0, 400.0),
                capacities=(1000.0, 1000.0, 1000.0),
                specifics=(55.0, 54.0, 53.0),
            )
            for index in range(35)
        )

    within = tuple(
        item
        for item in RuleRowDetector().detect(rows_for(1500.0))
        if item.code == "C06" and item.subtype == "AVOIDABLE_START_STOP"
    )
    assert len(within) == 35

    beyond = tuple(
        item
        for item in RuleRowDetector().detect(rows_for(1950.0))
        if item.code == "C06" and item.subtype == "AVOIDABLE_START_STOP"
    )
    assert beyond == ()


def test_c06_inefficient_share_band_admits_drifted_replay_share(
    valid_csv: str,
) -> None:
    """T06：份额带泛化——share2=0.31 重放可检（旧固定 30%±1kW 漏）。"""
    imported = DatasetLoader().import_csv(filename="fixture.csv", text=valid_csv)
    baseline = imported.rows[0]
    rows = tuple(
        _c06_t06_row(
            baseline,
            index,
            target=1000.0,
            powers=(190.0, 310.0, 500.0),
            capacities=(1000.0, 1000.0, 1000.0),
            specifics=(57.0, 56.0, 53.2),
        )
        for index in range(35)
    )

    candidates = tuple(
        item
        for item in RuleRowDetector().detect(rows)
        if item.code == "C06" and item.subtype == "INEFFICIENT_POWER_ALLOCATION"
    )

    assert len(candidates) == 35
    windows = EventAggregator().aggregate(
        rows=rows,
        candidates=candidates,
        sampling_interval_minutes=1.0,
    )
    assert len(windows) == 1


def test_c06_inefficient_share_anchor_rejects_drifting_run(valid_csv: str) -> None:
    """T06：滑窗份额锚定——带内渐变段（share2 逐行 +0.001）只保留锚容差内行。"""
    imported = DatasetLoader().import_csv(filename="fixture.csv", text=valid_csv)
    baseline = imported.rows[0]
    rows = tuple(
        _c06_t06_row(
            baseline,
            index,
            target=1600.0,
            powers=(351.0 - index, 449.0 + index, 800.0),
            capacities=(1000.0, 1000.0, 1000.0),
            specifics=(57.0, 56.0, 53.2),
        )
        for index in range(35)
    )

    candidates = tuple(
        item
        for item in RuleRowDetector().detect(rows)
        if item.code == "C06" and item.subtype == "INEFFICIENT_POWER_ALLOCATION"
    )
    windows = EventAggregator().aggregate(
        rows=rows,
        candidates=candidates,
        sampling_interval_minutes=1.0,
    )

    # 首行锚 share2=449/1600≈0.2806：前 16 行（share2 偏差 <0.01）保留且
    # 单行效率门成立；第 17 行起（偏差恰达/超过 0.01，含浮点表示效应）
    # 被锚定排除；16 行不足 minimumRows=30，不构成事件。
    assert len(candidates) == 16
    assert windows == ()


def test_c06_inefficient_natural_one_third_share_not_flagged(valid_csv: str) -> None:
    """T06：自然 1/3 分配（三台满功率）与 N02 型降容顶格场景均不误报。"""
    imported = DatasetLoader().import_csv(filename="fixture.csv", text=valid_csv)
    baseline = imported.rows[0]

    scenarios = {
        # 三台满功率：share2=1/3 出带。
        "full_load": ((1000.0, 1000.0, 1000.0), (1000.0, 1000.0, 1000.0), 3000.0),
        # N02 型降容：ELZ3 压到降容值、ELZ1/2 顶满，share2≈0.344 出带。
        "derated": ((1000.0, 1000.0, 908.0), (1000.0, 1000.0, 908.0), 2908.0),
    }
    for powers, capacities, target in scenarios.values():
        rows = tuple(
            _c06_t06_row(
                baseline,
                index,
                target=target,
                powers=powers,
                capacities=capacities,
                specifics=(57.0, 56.0, 59.0),
            )
            for index in range(35)
        )
        assert not any(
            item.code == "C06"
            and item.subtype == "INEFFICIENT_POWER_ALLOCATION"
            for item in RuleRowDetector().detect(rows)
        )


def test_c06_inefficient_capacity_pinned_elz3_path(valid_csv: str) -> None:
    """T06：ELZ3 容量顶格路径——cap3 < 0.5×target 且贴容量运行时入标。"""
    imported = DatasetLoader().import_csv(filename="fixture.csv", text=valid_csv)
    baseline = imported.rows[0]
    rows = tuple(
        _c06_t06_row(
            baseline,
            index,
            target=1600.0,
            powers=(376.0, 480.0, 744.0),
            capacities=(1000.0, 1000.0, 745.0),
            specifics=(57.0, 56.0, 54.0),
        )
        for index in range(35)
    )

    candidates = tuple(
        item
        for item in RuleRowDetector().detect(rows)
        if item.code == "C06" and item.subtype == "INEFFICIENT_POWER_ALLOCATION"
    )

    assert len(candidates) == 35


def _t07_c04_row(
    baseline: DataRow,
    *,
    bess_actual: float | None,
    charge_limit: float | None,
    discharge_limit: float | None,
    elz_running: bool | None,
    export_violation: float = 700.0,
) -> DataRow:
    """T07 矩阵测试共用行：EXPORT 型 C04 marker + 可配置纠偏通道。

    elz_running=True 运行中（上调通道 500kW）；False 全停（通道 0）；
    None 字段缺失（通道不可算）。
    """
    if elz_running is None:
        elz_values: dict[str, float] = {
            f"elz{index}_{field}": None  # type: ignore[misc]
            for index in (1, 2, 3)
            for field in (
                "power_actual_kw",
                "actual_available_capacity_kw",
                "run_state",
            )
        }
    else:
        elz_values = {
            f"elz{index}_power_actual_kw": 500.0 if elz_running else 0.0
            for index in (1, 2, 3)
        } | {
            f"elz{index}_actual_available_capacity_kw": (
                1000.0 if elz_running else 0.0
            )
            for index in (1, 2, 3)
        } | {
            f"elz{index}_run_state": 2.0 if elz_running else 1.0
            for index in (1, 2, 3)
        }
    return replace(
        baseline,
        values={
            **baseline.values,
            "bess_power_cmd_kw": -450.0,
            "bess_power_actual_kw": bess_actual,
            "bess_charge_power_limit_kw": charge_limit,
            "bess_discharge_power_limit_kw": discharge_limit,
            "pcc_export_power_violation_kw": export_violation,
            "pcc_import_power_violation_kw": 0.0,
            **elz_values,
        },
    )


def test_c04_execurability_matrix_three_branches(valid_csv: str) -> None:
    """T07/A-4：C04 三分支——充足全置信 / 顶格降档 / 全通道缺失降观察。"""
    imported = DatasetLoader().import_csv(filename="fixture.csv", text=valid_csv)
    baseline = imported.rows[0]
    detector = RuleRowDetector()

    def c04_candidates(row: DataRow) -> tuple[DetectionCandidate, ...]:
        return tuple(
            item for item in detector.detect((row,)) if item.code == "C04"
        )

    # 分支 1 裕量充足：BESS 空闲（充电通道 500kW）→ 原置信度。
    sufficient = c04_candidates(
        _t07_c04_row(
            baseline,
            bess_actual=0.0,
            charge_limit=500.0,
            discharge_limit=500.0,
            elz_running=True,
        )
    )
    assert len(sufficient) == 1
    assert sufficient[0].subtype == "EXPORT_POWER_LIMIT_NOT_TRACKED"
    assert sufficient[0].confidence == pytest.approx(0.91)

    # 分支 2 裕量不足：BESS 充电顶格（-500/500 → 空间 0）+ ELZ 全停
    # （上调通道 0）→ 候选保留但降档。
    constrained = c04_candidates(
        _t07_c04_row(
            baseline,
            bess_actual=-500.0,
            charge_limit=500.0,
            discharge_limit=500.0,
            elz_running=False,
        )
    )
    assert len(constrained) == 1
    assert constrained[0].confidence == pytest.approx(0.8)

    # 分支 3 数据缺失：两通道字段全缺 → 降"观察"，不产候选。
    unobservable = c04_candidates(
        _t07_c04_row(
            baseline,
            bess_actual=None,
            charge_limit=None,
            discharge_limit=None,
            elz_running=None,
        )
    )
    assert unobservable == ()


def test_c04_execurability_single_missing_channel_still_decides(
    valid_csv: str,
) -> None:
    """T07：单通道缺失不降级——BESS 字段缺但 ELZ 上调通道充足仍全置信。"""
    imported = DatasetLoader().import_csv(filename="fixture.csv", text=valid_csv)
    baseline = imported.rows[0]

    row = _t07_c04_row(
        baseline,
        bess_actual=None,
        charge_limit=None,
        discharge_limit=None,
        elz_running=True,
    )
    candidates = tuple(
        item for item in RuleRowDetector().detect((row,)) if item.code == "C04"
    )

    assert len(candidates) == 1
    assert candidates[0].confidence == pytest.approx(0.91)


def test_c07_execurability_matrix_three_branches(valid_csv: str) -> None:
    """T07/A-4：C07 三分支——充足全置信 / 顶格降档 / 全通道缺失降观察。"""
    imported = DatasetLoader().import_csv(filename="fixture.csv", text=valid_csv)
    baseline = imported.rows[0]
    detector = RuleRowDetector()

    def c07_row(
        *,
        soc: float,
        soc_target: float,
        bess_actual: float | None,
        charge_limit: float | None,
        discharge_limit: float | None,
    ) -> DataRow:
        # CHARGE_HEADROOM_SHORTFALL：SOC 低于目标 15 个百分点（越过 10% 门）。
        return replace(
            baseline,
            values={
                **baseline.values,
                "bess_soc_pct": soc,
                "soc_target_pct": soc_target,
                "bess_regulation_reserve_target_kwh": 400.0,
                "bess_power_actual_kw": bess_actual,
                "bess_charge_power_limit_kw": charge_limit,
                "bess_discharge_power_limit_kw": discharge_limit,
            },
        )

    def c07_candidates(row: DataRow) -> tuple[DetectionCandidate, ...]:
        return tuple(
            item for item in detector.detect((row,)) if item.code == "C07"
        )

    # 分支 1：BESS 空闲（充电通道 500kW）→ 原置信度。
    sufficient = c07_candidates(
        c07_row(
            soc=75.0,
            soc_target=90.0,
            bess_actual=0.0,
            charge_limit=500.0,
            discharge_limit=500.0,
        )
    )
    assert len(sufficient) == 1
    assert sufficient[0].subtype == "CHARGE_HEADROOM_SHORTFALL"
    assert sufficient[0].confidence == pytest.approx(0.86)

    # 分支 2：BESS 充电顶格（空间 0）+ SOC 贴上限（90-89.6=0.4 < 0.5）→ 降档。
    constrained = c07_candidates(
        c07_row(
            soc=89.6,
            soc_target=104.6,
            bess_actual=-500.0,
            charge_limit=500.0,
            discharge_limit=500.0,
        )
    )
    assert len(constrained) == 1
    assert constrained[0].confidence == pytest.approx(0.75)

    # 分支 3（函数级）：行级全缺不可达——SOC 通道依赖的 soc 是主判据必读
    # 字段，BESS 字段全缺时 SOC 通道仍可用。直接对矩阵函数构造全缺行，
    # 断言防御路径降"观察"。
    from h2_analytics.detection.execurability import (
        HeadroomGrade,
        c07_headroom_grade,
    )
    from h2_analytics.settings import DEFAULT_CONSTRAINTS

    unobservable_row = replace(
        baseline,
        values={
            **baseline.values,
            "bess_soc_pct": None,
            "bess_power_actual_kw": None,
            "bess_charge_power_limit_kw": None,
        },
    )
    assert (
        c07_headroom_grade(
            unobservable_row,
            "CHARGE_HEADROOM_SHORTFALL",
            DEFAULT_CONSTRAINTS,
            bess_floor_kw=1.0,
            soc_floor_pct=0.5,
        )
        is HeadroomGrade.UNVERIFIABLE
    )


def test_runtime_c03_rejects_opposite_feedback_without_frozen_causal_gate(
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
                "bess_power_cmd_kw": 400.0,
                "bess_power_actual_kw": -400.0,
                "pcc_power_actual_kw": -500.0,
                "pv_actual_kw": 0.0,
                "aux_load_kw": 100.0,
                "elz1_power_actual_kw": 100.0,
                "elz2_power_actual_kw": 100.0,
                "elz3_power_actual_kw": 100.0,
                "bess_soc_pct": 80.0,
                "soc_target_pct": 60.0,
            },
        )
        for index in range(5)
    )
    candidates = tuple(
        item for item in RuleRowDetector().detect(rows) if item.code == "C03"
    )

    assert candidates == ()
    assert EventAggregator().aggregate(
        rows=rows,
        candidates=candidates,
        sampling_interval_minutes=1.0,
    ) == ()


def test_sanitized_fixture_c03_is_outside_runtime_rule_detector(
    valid_csv: str,
) -> None:
    imported = DatasetLoader().import_csv(
        filename="tiny-valid-timeseries.csv",
        text=valid_csv,
    )

    assert not any(
        candidate.code == "C03"
        for candidate in RuleRowDetector().detect(imported.rows)
    )
    service = AnalyticsService()
    dataset = service.import_csv(
        filename="tiny-valid-timeseries.csv",
        text=valid_csv,
    )["dataset"]
    run = service.run_analysis(dataset["datasetId"])
    assert any(event["code"] == "C03" for event in run["events"])
    assert sanitized_fixture_c03_candidates(
        manifest={**imported.manifest, "mode": "LIVE_ANALYSIS"},
        rows=imported.rows,
    ) == ()


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


def _forecast_csv_rows(valid_csv: str, count: int, minute_of_day: int = 23 * 60):
    """构造 T03a 前瞻用例的基础行序列（每分钟一行，可控当日时刻）。"""
    imported = DatasetLoader().import_csv(filename="fixture.csv", text=valid_csv)
    baseline = imported.rows[0]
    assert baseline.timestamp is not None
    day = baseline.timestamp.replace(hour=0, minute=0, second=0, microsecond=0)
    start = day + timedelta(minutes=minute_of_day)
    return baseline, tuple(
        replace(
            baseline,
            index=index,
            timestamp=start + timedelta(minutes=index),
            timestamp_text=(start + timedelta(minutes=index)).isoformat(),
        )
        for index in range(count)
    )


def test_c05_forecast_warns_when_remaining_exhausts_before_day_end(
    valid_csv: str,
) -> None:
    baseline, rows = _forecast_csv_rows(valid_csv, count=20)
    # 静态风险路径不触发：双侧配额均高于静态阈值。
    # 消耗速率 10 kWh/min、剩余 200 kWh、日剩余约 60 分钟 → 外推 20 分钟耗尽。
    forecast_rows = tuple(
        replace(
            row,
            values={
                **baseline.values,
                "grid_export_energy_quota_kwh_day": 6000.0,
                "grid_import_energy_quota_kwh_day": 30000.0,
                "grid_export_energy_used_kwh_day": 1000.0 + 10.0 * index,
                "grid_import_energy_used_kwh_day": 0.0,
                "grid_export_energy_remaining_kwh": 200.0 - 10.0 * index,
                "grid_import_energy_remaining_kwh": 30000.0,
                "bess_power_cmd_kw": 300.0,
                "bess_power_actual_kw": 300.0,
            },
        )
        for index, row in enumerate(rows)
    )
    candidates = tuple(
        item
        for item in RuleRowDetector().detect(forecast_rows)
        if item.code == "C05"
    )

    # 15 行速率窗口填满后，每行都满足外推耗尽（200-10i)/10 < 日剩余。
    assert candidates
    assert all(item.subtype == "EXPORT_ENERGY_QUOTA_RISK" for item in candidates)
    assert candidates[0].timestamp == forecast_rows[14].timestamp


def test_c05_forecast_stays_silent_without_signature_or_rate(
    valid_csv: str,
) -> None:
    baseline, rows = _forecast_csv_rows(valid_csv, count=20)

    def build(command: float, used: "float | tuple[float, float]") -> tuple:
        def value(index: int) -> float:
            if isinstance(used, tuple):
                return used[0] + used[1] * index
            return used

        return tuple(
            replace(
                row,
                values={
                    **baseline.values,
                    "grid_export_energy_quota_kwh_day": 6000.0,
                    "grid_import_energy_quota_kwh_day": 30000.0,
                    "grid_export_energy_used_kwh_day": value(index),
                    "grid_import_energy_used_kwh_day": 0.0,
                    "grid_export_energy_remaining_kwh": 200.0 - 10.0 * index,
                    "grid_import_energy_remaining_kwh": 30000.0,
                    "bess_power_cmd_kw": command,
                    "bess_power_actual_kw": command,
                },
            )
            for index, row in enumerate(rows)
        )

    detector = RuleRowDetector()
    # N05 防线：无 300 kW 签名（TRAIN N05 |cmd| 峰值 167 kW 量级）→ 不触发。
    assert not any(
        item.code == "C05" for item in detector.detect(build(150.0, (1000.0, 10.0)))
    )
    # 速率不足：used 平坦 → 0 kWh/min 低于下限 → 不触发。
    assert not any(
        item.code == "C05" for item in detector.detect(build(300.0, 1000.0))
    )


def test_c07_confirmation_row_yields_positive_lead_time(valid_csv: str) -> None:
    baseline, rows = _forecast_csv_rows(valid_csv, count=6)
    deep_deviation_rows = tuple(
        replace(
            row,
            values={
                **baseline.values,
                "bess_soc_pct": 20.0,
                "soc_target_pct": 60.0,
                "bess_regulation_reserve_target_kwh": 350.0,
                "bess_available_charge_energy_kwh": 900.0,
                "bess_available_discharge_energy_kwh": 900.0,
            },
        )
        for row in rows
    )
    candidates = tuple(
        item
        for item in RuleRowDetector().detect(deep_deviation_rows)
        if item.code == "C07"
    )
    window = EventAggregator().aggregate(
        rows=deep_deviation_rows,
        candidates=candidates,
        sampling_interval_minutes=1.0,
    )[0]

    # ADR-004：lead_time_minutes = first_detection − start 必须可测为正。
    assert window.start_time == deep_deviation_rows[0].timestamp
    assert window.first_detection_time == deep_deviation_rows[2].timestamp
    assert window.first_detection_time > window.start_time


def test_c07_forecast_projects_soc_trend_before_threshold(valid_csv: str) -> None:
    baseline, rows = _forecast_csv_rows(valid_csv, count=16)
    # 当前偏差 -9.6（未达静态 10），滑窗速率 -0.25%/min，
    # 外推 30 分钟 → -17.1 ≤ -10 且同向 → CHARGE_HEADROOM 前瞻预警。
    soc_rows = tuple(
        replace(
            row,
            values={
                **baseline.values,
                "bess_soc_pct": 54.0 - 0.25 * index,
                "soc_target_pct": 60.0,
                "bess_regulation_reserve_target_kwh": 350.0,
                "bess_available_charge_energy_kwh": 900.0,
                "bess_available_discharge_energy_kwh": 900.0,
            },
        )
        for index, row in enumerate(rows)
    )
    candidates = tuple(
        item
        for item in RuleRowDetector().detect(soc_rows)
        if item.code == "C07"
    )
    assert candidates
    assert all(
        item.subtype == "CHARGE_HEADROOM_SHORTFALL" for item in candidates
    )
    # 首个触发行：15 行速率窗口填满（index 14，dev=-9.5）且外推越限。
    assert candidates[0].timestamp == soc_rows[14].timestamp


def test_c07_forecast_blocked_by_reserve_gate_and_recovery(valid_csv: str) -> None:
    baseline, rows = _forecast_csv_rows(valid_csv, count=16)

    def build(soc_start: float, soc_step: float, reserve: float) -> tuple:
        return tuple(
            replace(
                row,
                values={
                    **baseline.values,
                    "bess_soc_pct": soc_start + soc_step * index,
                    "soc_target_pct": 60.0,
                    "bess_regulation_reserve_target_kwh": reserve,
                    "bess_available_charge_energy_kwh": 900.0,
                    "bess_available_discharge_energy_kwh": 900.0,
                },
            )
            for index, row in enumerate(rows)
        )

    detector = RuleRowDetector()
    # N07 防线：恶化趋势同向，但 reserve=300（<350 门）→ 不触发。
    assert not any(
        item.code == "C07" for item in detector.detect(build(54.0, -0.25, 300.0))
    )
    # 恢复方向：dev=−8（未达静态阈值）但 SOC 回升 → 外推不越限 → 不触发。
    assert not any(
        item.code == "C07" for item in detector.detect(build(52.0, 0.25, 350.0))
    )


def _c03_relative_band_rows(
    valid_csv: str,
    command: float,
    *,
    limit: float | None = 500.0,
    oscillate: float = 0.0,
    count: int = 6,
):
    """T04 相对带用例：恒定（或受控波动）cmd + causal 命中的最小序列。

    pv 大于负荷使功率缺口为负，放电指令与缺口反向 → causal gate 命中。
    """
    imported = DatasetLoader().import_csv(filename="fixture.csv", text=valid_csv)
    baseline = imported.rows[0]
    assert baseline.timestamp is not None
    rows = []
    for index in range(count):
        offset = (index % 2) * oscillate
        values = {
            **baseline.values,
            "bess_power_cmd_kw": command + offset,
            "bess_power_actual_kw": command + offset,
            "pcc_power_actual_kw": 300.0,
            "pv_actual_kw": 1000.0,
            "aux_load_kw": 100.0,
            "elz1_power_actual_kw": 100.0,
            "elz2_power_actual_kw": 100.0,
            "elz3_power_actual_kw": 100.0,
            "bess_soc_pct": 80.0,
            "soc_target_pct": 60.0,
        }
        # limit=None 显式置空（覆盖 fixture 基线值）以验证 fail-closed。
        values["bess_charge_power_limit_kw"] = limit
        values["bess_discharge_power_limit_kw"] = limit
        rows.append(
            replace(
                baseline,
                index=index,
                timestamp=baseline.timestamp + timedelta(minutes=index),
                timestamp_text=(
                    baseline.timestamp + timedelta(minutes=index)
                ).isoformat(),
                values=values,
            )
        )
    return tuple(rows)


def test_c03_relative_band_accepts_shifted_replay_level(valid_csv: str) -> None:
    # 410 kW 在旧绝对带（400±1）之外、相对带 [375,425]@500 之内：
    # 去签名带后对重放水平漂移自适应，恒定平台 + 因果门命中即接受。
    rows = _c03_relative_band_rows(valid_csv, 410.0)
    candidates = tuple(
        item for item in RuleRowDetector().detect(rows) if item.code == "C03"
    )
    assert len(candidates) == len(rows)


def test_c03_relative_band_excludes_healthy_plateau_and_oscillation(
    valid_csv: str,
) -> None:
    detector = RuleRowDetector()
    # 0.9×限额的健康晚高峰恒功率平台（TRAIN 38 段实测形态）在带外。
    healthy = _c03_relative_band_rows(valid_csv, 450.0)
    assert not any(
        item.code == "C03" for item in detector.detect(healthy)
    )
    # 带内但分钟级波动的调节行（C01 型）被平台门排除。
    oscillating = _c03_relative_band_rows(valid_csv, 390.0, oscillate=30.0)
    assert not any(
        item.code == "C03" for item in detector.detect(oscillating)
    )


def test_c03_relative_band_fails_closed_without_limit(valid_csv: str) -> None:
    # 限额字段缺失时无法形成相对带，保守放弃（fail closed）。
    rows = _c03_relative_band_rows(valid_csv, 400.0, limit=None)
    assert not any(
        item.code == "C03" for item in RuleRowDetector().detect(rows)
    )


def _c05_relative_band_rows(
    valid_csv: str,
    command: float,
    *,
    export_quota: float = 2200.0,
    import_quota: float = 24000.0,
    limit: float | None = 500.0,
    count: int = 6,
):
    """T05 相对带用例：低配额 + 指定 cmd 水平的最小序列。"""
    imported = DatasetLoader().import_csv(filename="fixture.csv", text=valid_csv)
    baseline = imported.rows[0]
    assert baseline.timestamp is not None
    rows = []
    for index in range(count):
        values = {
            **baseline.values,
            "grid_export_energy_quota_kwh_day": export_quota,
            "grid_import_energy_quota_kwh_day": import_quota,
            "bess_power_cmd_kw": command,
            "bess_power_actual_kw": command,
        }
        values["bess_charge_power_limit_kw"] = limit
        values["bess_discharge_power_limit_kw"] = limit
        rows.append(
            replace(
                baseline,
                index=index,
                timestamp=baseline.timestamp + timedelta(minutes=index),
                timestamp_text=(
                    baseline.timestamp + timedelta(minutes=index)
                ).isoformat(),
                values=values,
            )
        )
    return tuple(rows)


def test_c05_relative_band_accepts_shifted_replay_level(valid_csv: str) -> None:
    # 320 kW 在旧绝对带（300±1）之外、相对带 [250,350]@500 之内：
    # 低配额 + 方向一致的漂移重放水平可检出。
    rows = _c05_relative_band_rows(valid_csv, 320.0)
    candidates = tuple(
        item for item in RuleRowDetector().detect(rows) if item.code == "C05"
    )
    assert len(candidates) == len(rows)


def test_c05_relative_band_gates(valid_csv: str) -> None:
    detector = RuleRowDetector()
    # 方向不一致：export 风险天但 BESS 充电（cmd<0）→ 不触发。
    wrong_direction = _c05_relative_band_rows(valid_csv, -320.0)
    assert not any(
        item.code == "C05" for item in detector.detect(wrong_direction)
    )
    # 带下界：250 kW（0.5×限额，C07 恢复位与健康午后平台位）→ 出带。
    below_floor = _c05_relative_band_rows(valid_csv, 250.0)
    assert not any(
        item.code == "C05" for item in detector.detect(below_floor)
    )
    # 带外上界：450 kW（0.9×限额的健康平台位）→ 不触发。
    out_of_band = _c05_relative_band_rows(valid_csv, 450.0)
    assert not any(
        item.code == "C05" for item in detector.detect(out_of_band)
    )
    # 限额缺失 → fail closed。
    no_limit = _c05_relative_band_rows(valid_csv, 300.0, limit=None)
    assert not any(
        item.code == "C05" for item in detector.detect(no_limit)
    )


def test_c05_plateau_anchor_rejects_ramp_and_high_quota(valid_csv: str) -> None:
    # 渐近爬坡段：cmd 从 270 爬向 300（带内但偏离 run 首行 >5kW）→ 不触发。
    imported = DatasetLoader().import_csv(filename="fixture.csv", text=valid_csv)
    baseline = imported.rows[0]
    assert baseline.timestamp is not None
    ramp_values = (270.0, 278.0, 284.0, 289.0, 293.0, 296.0, 298.0, 300.0)
    ramp_rows = []
    for index, level in enumerate(ramp_values):
        ramp_rows.append(
            replace(
                baseline,
                index=index,
                timestamp=baseline.timestamp + timedelta(minutes=index),
                timestamp_text=(
                    baseline.timestamp + timedelta(minutes=index)
                ).isoformat(),
                values={
                    **baseline.values,
                    "grid_export_energy_quota_kwh_day": 2200.0,
                    "grid_import_energy_quota_kwh_day": 24000.0,
                    "bess_power_cmd_kw": level,
                    "bess_power_actual_kw": level,
                    "bess_charge_power_limit_kw": 500.0,
                    "bess_discharge_power_limit_kw": 500.0,
                },
            )
        )
    ramp = tuple(ramp_rows)
    # 行级允许 run 首行的零星候选，但渐近段无法通过 4 行持续聚合成事件。
    ramp_candidates = tuple(
        item for item in RuleRowDetector().detect(ramp) if item.code == "C05"
    )
    assert len(ramp_candidates) < 4
    assert EventAggregator().aggregate(
        rows=ramp,
        candidates=ramp_candidates,
        sampling_interval_minutes=1.0,
    ) == ()
    # 高配额（健康场景 quota 水平）：带内恒定平台也被 quota 门排除。
    healthy = _c05_relative_band_rows(
        valid_csv, 300.0, export_quota=4800.0, import_quota=23500.0
    )
    assert not any(
        item.code == "C05" for item in RuleRowDetector().detect(healthy)
    )


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


def test_live_lightgbm_c03_requires_the_shared_causal_gate(valid_csv: str) -> None:
    service = AnalyticsService(detector=_c03_model_detector())
    dataset = service.import_csv(
        filename="fixture-with-byte-drift.csv",
        text=f"{valid_csv}\n",
    )["dataset"]

    assert dataset["mode"] == "LIVE_ANALYSIS"
    run = service.run_analysis(dataset["datasetId"])
    assert not any(event["code"] == "C03" for event in run["events"])


def test_live_lightgbm_c03_retains_true_causal_rows(valid_csv: str) -> None:
    service = AnalyticsService(detector=_c03_model_detector())
    dataset = service.import_csv(
        filename="causal-live.csv",
        text=_live_csv_with_c03_causal_rows(valid_csv),
    )["dataset"]

    assert dataset["mode"] == "LIVE_ANALYSIS"
    run = service.run_analysis(dataset["datasetId"])
    c03_events = [event for event in run["events"] if event["code"] == "C03"]

    assert len(c03_events) == 1
    assert (
        c03_events[0]["startTime"],
        c03_events[0]["firstDetectionTime"],
        c03_events[0]["endTime"],
    ) == (
        "2026-01-05T10:20:00Z",
        "2026-01-05T10:24:00Z",
        "2026-01-05T10:24:00Z",
    )


def _c03_model_detector() -> LightGbmRowDetector:
    return LightGbmRowDetector(
        booster=FakeBooster(),
        feature_names=("bess_power_actual_kw", "pcc_power_actual_kw"),
        class_map={1: ("C03", "BESS_DIRECTION_REVERSED")},
        version="test-booster-v1",
    )


def _live_csv_with_c03_causal_rows(valid_csv: str) -> str:
    source = StringIO(valid_csv)
    reader = csv.DictReader(source)
    assert reader.fieldnames is not None
    rows = list(reader)
    for row in rows[:5]:
        row.update(
            {
                "bess_power_cmd_kw": "400",
                "bess_power_actual_kw": "400",
                "pcc_power_actual_kw": "500",
                "pv_actual_kw": "1000",
            }
        )
    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=reader.fieldnames, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue()


@pytest.mark.parametrize("code", ["C01", "C02", "C06"])
def test_lightgbm_seam_rejects_classes_without_equipment_attribution(
    code: str,
) -> None:
    with pytest.raises(ValueError, match="cannot attribute equipment"):
        LightGbmRowDetector(
            booster=FakeBooster(),
            feature_names=("pcc_power_actual_kw",),
            class_map={1: (code, vocabulary.subtypes_by_code()[code][0])},
            version="test-booster-v1",
        )


def test_aggregator_rejects_missing_dynamic_equipment_attribution(
    valid_csv: str,
) -> None:
    row = DatasetLoader().import_csv(filename="fixture.csv", text=valid_csv).rows[0]
    assert row.timestamp is not None
    candidate = DetectionCandidate(
        row_index=row.index,
        timestamp=row.timestamp,
        code="C02",
        subtype="CAPACITY_NOT_SYNCHRONIZED",
        confidence=0.9,
        detector_version="test-detector-v1",
    )

    with pytest.raises(vocabulary.VocabularyError, match="lacks valid"):
        EventAggregator().aggregate(
            rows=(row,),
            candidates=(candidate,),
            sampling_interval_minutes=1.0,
        )
