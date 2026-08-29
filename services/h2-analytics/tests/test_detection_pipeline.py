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
        # C04: BESS forced to the 450 kW level.
        "C04": single(bess_power_cmd_kw=450.0),
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

    assert c03["bessSignatureTargetMagnitudeKw"] == 400.0
    assert c03["actualTrackingToleranceKw"] == 1.0
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
