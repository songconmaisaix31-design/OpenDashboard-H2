"""Impact-calculator unit tests.

These exercise `ImpactCalculator` directly against hand-built windows so the
integration arithmetic is pinned independently of detection thresholds.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, datetime
from decimal import Decimal

import pytest

from h2_analytics import vocabulary
from h2_analytics.events import EventWindow
from h2_analytics.impact import ImpactCalculation, ImpactCalculator
from h2_analytics.impact.calculators import DECLARED_IMPACT_METRICS
from h2_analytics.models import DataRow

_START = datetime(2026, 1, 5, 10, 20, tzinfo=UTC)
_ONE_HOUR = 60.0


def _row(index: int, **values: float | None) -> DataRow:
    return DataRow(index, _START, "2026-01-05T10:20:00Z", dict(values))


def _window(
    code: str,
    rows: Iterable[DataRow],
    *,
    subtype: str = "TEST_SUBTYPE",
) -> EventWindow:
    return EventWindow(
        event_id=f"{code}-20260105-001",
        code=code,
        subtype=subtype,
        rows=tuple(rows),
        start_time=_START,
        end_time=_START,
        first_detection_time=_START,
        confidence=0.9,
        detector_version="test-detector-v1",
    )


def _calculate(window: EventWindow) -> ImpactCalculation:
    return ImpactCalculator().calculate(
        window=window,
        sampling_interval_minutes=_ONE_HOUR,
    )


def test_every_code_reports_its_declared_metric_and_unit() -> None:
    """Each code must report the metric the vocabulary declares for it."""
    windows = {
        "C01": _window("C01", [_row(1, bess_power_actual_kw=0.0)]),
        "C02": _window("C02", [_row(1, elz1_power_cmd_kw=0.0, elz1_power_actual_kw=0.0)]),
        "C03": _window("C03", [_row(1, pcc_power_actual_kw=0.0)]),
        "C04": _window("C04", [_row(1, pcc_export_power_violation_kw=0.0,
                                    pcc_import_power_violation_kw=0.0)]),
        "C05": _window("C05", [_row(1, grid_export_energy_quota_excess_kwh=0.0)]),
        "C06": _window("C06", [_row(1)], subtype="AVOIDABLE_START_STOP"),
        "C07": _window("C07", [_row(1, bess_available_discharge_energy_kwh=0.0,
                                    bess_regulation_reserve_target_kwh=0.0)]),
    }
    for code, window in windows.items():
        calculation = _calculate(window)
        expected_metric, expected_version = DECLARED_IMPACT_METRICS[code]
        assert calculation.metric == expected_metric, code
        assert calculation.formula_version == expected_version, code
        assert calculation.unit == "kWh", code
        assert calculation.assumptions, code


def test_c01_integrates_absolute_deviation_from_the_median_baseline() -> None:
    # Median of (100, 100, 100, 400) is 100, so only the last row deviates.
    window = _window(
        "C01",
        [_row(index, bess_power_actual_kw=value)
         for index, value in enumerate((100.0, 100.0, 100.0, 400.0), start=1)],
    )

    assert _calculate(window).value == pytest.approx(300.0)


def test_c02_integrates_only_the_positive_command_gap() -> None:
    window = _window(
        "C02",
        [
            # Shortfall of 200 kW on unit 1 counts.
            _row(1, elz1_power_cmd_kw=600.0, elz1_power_actual_kw=400.0),
            # Overshoot must not net off against the shortfall above.
            _row(2, elz1_power_cmd_kw=300.0, elz1_power_actual_kw=500.0),
        ],
    )

    assert _calculate(window).value == pytest.approx(200.0)


def test_c03_integrates_deviation_from_train_calibrated_soc_response() -> None:
    window = _window(
        "C03",
        [
            _row(
                1,
                bess_power_actual_kw=400.0,
                bess_soc_pct=40.0,
                soc_target_pct=60.0,
            )
        ],
    )

    calculation = _calculate(window)

    assert calculation.value == pytest.approx(757.84)
    assert calculation.formula_version == "impact-c03-v2"
    assert any("public-TRAIN" in item for item in calculation.assumptions)


def test_c04_sums_export_and_import_violations_when_both_are_reported() -> None:
    window = _window(
        "C04",
        [_row(1, pcc_export_power_violation_kw=120.0, pcc_import_power_violation_kw=30.0)],
    )

    assert _calculate(window).value == pytest.approx(150.0)


def test_c04_falls_back_to_limits_when_violation_columns_are_absent() -> None:
    """Export is positive PCC over the export limit; import is negative PCC past it."""
    exporting = _window(
        "C04",
        [_row(1, pcc_power_actual_kw=700.0, grid_export_power_limit_kw=500.0,
              grid_import_power_limit_kw=450.0)],
    )
    importing = _window(
        "C04",
        [_row(1, pcc_power_actual_kw=-600.0, grid_export_power_limit_kw=500.0,
              grid_import_power_limit_kw=450.0)],
    )
    compliant = _window(
        "C04",
        [_row(1, pcc_power_actual_kw=400.0, grid_export_power_limit_kw=500.0,
              grid_import_power_limit_kw=450.0)],
    )

    assert _calculate(exporting).value == pytest.approx(200.0)
    assert _calculate(importing).value == pytest.approx(150.0)
    assert _calculate(compliant).value == pytest.approx(0.0)


def test_c05_and_c07_report_the_peak_not_the_integral() -> None:
    """Quota excess and reserve shortfall are energy already, so they must not integrate."""
    quota = _window(
        "C05",
        [
            _row(1, grid_export_energy_quota_excess_kwh=15.0),
            _row(2, grid_export_energy_quota_excess_kwh=40.0),
            _row(3, grid_export_energy_quota_excess_kwh=25.0),
        ],
    )
    reserve = _window(
        "C07",
        [
            _row(1, bess_available_discharge_energy_kwh=100.0,
                 bess_regulation_reserve_target_kwh=150.0),
            _row(2, bess_available_discharge_energy_kwh=40.0,
                 bess_regulation_reserve_target_kwh=150.0),
        ],
        subtype="DISCHARGE_RESERVE_SHORTFALL",
    )

    assert _calculate(quota).value == pytest.approx(40.0)
    assert _calculate(reserve).value == pytest.approx(110.0)


def test_c07_charge_subtype_reads_the_charge_headroom_field() -> None:
    rows = [
        _row(
            1,
            bess_available_charge_energy_kwh=60.0,
            bess_available_discharge_energy_kwh=900.0,
            bess_regulation_reserve_target_kwh=150.0,
        )
    ]
    charge = _window("C07", rows, subtype="CHARGE_HEADROOM_SHORTFALL")
    discharge = _window("C07", rows, subtype="DISCHARGE_RESERVE_SHORTFALL")

    assert _calculate(charge).value == pytest.approx(90.0)
    assert _calculate(discharge).value == pytest.approx(0.0)


@pytest.mark.parametrize(
    ("subtype", "rate", "sampling_interval_minutes", "targets"),
    [
        ("AVOIDABLE_START_STOP", 0.018, 5.0, (400.0, 850.0, 1200.0)),
        (
            "INEFFICIENT_POWER_ALLOCATION",
            0.022,
            2.5,
            (300.0, 675.0, 900.0, 1500.0),
        ),
    ],
)
def test_c06_integrates_varying_targets_for_every_inclusive_sample(
    subtype: str,
    rate: float,
    sampling_interval_minutes: float,
    targets: tuple[float, ...],
) -> None:
    window = _window(
        "C06",
        [
            _row(index, ems_total_elz_target_kw=target)
            for index, target in enumerate(targets, start=1)
        ],
        subtype=subtype,
    )

    calculation = ImpactCalculator().calculate(
        window=window,
        sampling_interval_minutes=sampling_interval_minutes,
    )

    expected = sum(targets) * rate * sampling_interval_minutes / 60
    assert calculation.value == pytest.approx(expected)
    assert calculation.formula_version == "impact-c06-v3"
    assert any("inclusive event rows" in item for item in calculation.assumptions)


def test_c06_missing_target_contributes_zero_without_rounding_other_rows() -> None:
    window = _window(
        "C06",
        [
            _row(1, ems_total_elz_target_kw=333.333),
            _row(2, ems_total_elz_target_kw=None),
            _row(3, ems_total_elz_target_kw=777.777),
        ],
        subtype="INEFFICIENT_POWER_ALLOCATION",
    )

    calculation = ImpactCalculator().calculate(
        window=window,
        sampling_interval_minutes=7.0,
    )
    expected = (333.333 + 777.777) * 0.022 * 7.0 / 60

    assert calculation.value == pytest.approx(expected)
    assert calculation.value != round(expected, 3)
    assert any("missing EMS target" in item for item in calculation.assumptions)


def test_impact_formula_config_declares_train_calibration_and_held_out_policy() -> None:
    config = vocabulary.impact_formulas()

    assert config["formulaVersion"] == "impact-c06-v3"
    assert config["source"]["calibrationSplit"] == "public_train"
    assert config["source"]["competitionPackageVersion"] == "public-v4.0"
    assert len(config["source"]["sourceFiles"]["timeseries"]["sha256"]) == 64
    assert len(config["source"]["sourceFiles"]["eventLabels"]["sha256"]) == 64
    assert "acceptance-only" in config["source"]["heldOutPolicy"]
    c03 = config["classes"]["C03"]
    c03_statistics = c03["calibrationStatistics"]
    assert c03["formulaVersion"] == "impact-c03-v2"
    assert Decimal(
        c03_statistics["aggregateDerivedSocTrackingGainKwPerPct"]
    ).quantize(Decimal("0.001")) == Decimal(str(c03["socTrackingGainKwPerPct"]))
    assert abs(
        Decimal(c03_statistics["calculatedImpactKwh"])
        - Decimal(c03_statistics["referenceImpactKwh"])
    ) < Decimal("0.001")
    assert "acceptance-only" in c03["heldOutPolicy"]
    assert "not physical" in config["classes"]["C06"]["rationale"]
    statistics = config["classes"]["C06"]["calibrationStatistics"]
    assert statistics["eventCount"] == 40
    for subtype, rate in config["classes"]["C06"]["subtypeRates"].items():
        subtype_statistics = statistics["subtypes"][subtype]
        derived_rate = Decimal(subtype_statistics["referenceImpactKwh"]) / Decimal(
            subtype_statistics["targetEnergyKwh"]
        )
        assert derived_rate == pytest.approx(Decimal(str(rate)), abs=Decimal("2e-10"))
        assert subtype_statistics["calibratedRate"] == str(rate)
        assert subtype_statistics["roundedReferenceMatchCount"] == (
            subtype_statistics["eventCount"]
        )


def test_missing_inputs_yield_zero_rather_than_raising() -> None:
    """A blind test set will contain gaps; impact must degrade, not crash."""
    for code in DECLARED_IMPACT_METRICS:
        subtype = "AVOIDABLE_START_STOP" if code == "C06" else "TEST_SUBTYPE"
        calculation = _calculate(_window(code, [_row(1)], subtype=subtype))
        assert calculation.value == pytest.approx(0.0), code
