from __future__ import annotations

from pathlib import Path

from h2_analytics.tools.calibrate_c06 import build_c06_calibration_report


def test_c06_calibration_tool_derives_rates_from_inclusive_train_rows(
    tmp_path: Path,
) -> None:
    timeseries = tmp_path / "train.csv"
    labels = tmp_path / "labels.csv"
    fields = [
        "timestamp",
        "ems_total_elz_target_kw",
        *(
            f"elz{index}_{suffix}"
            for index in (1, 2, 3)
            for suffix in (
                "power_cmd_kw",
                "power_actual_kw",
                "actual_available_capacity_kw",
                "available_flag",
                "run_state",
                "specific_energy_kwh_per_kg",
            )
        ),
    ]

    def row(
        timestamp: str,
        target: float,
        powers: tuple[float, float, float],
        specifics: tuple[float, float, float],
    ) -> str:
        values: list[str] = [timestamp, str(target)]
        for power, specific in zip(powers, specifics, strict=True):
            values.extend(
                [str(power), str(power), "1000", "1", "2", str(specific)]
            )
        return ",".join(values)

    timeseries.write_text(
        "\n".join(
            [
                ",".join(fields),
                row("2025-01-01 00:00:00", 1000, (400, 400, 400), (55, 54, 53)),
                row("2025-01-01 00:01:00", 1000, (400, 400, 400), (55, 54, 53)),
                row("2025-01-01 00:02:00", 0, (0, 0, 0), (0, 0, 0)),
                row("2025-01-01 00:03:00", 1500, (300, 450, 750), (57, 56, 53.2)),
                row("2025-01-01 00:04:00", 1500, (300, 450, 750), (57, 56, 53.2)),
                "",
            ]
        ),
        encoding="utf-8",
    )
    labels.write_text(
        "event_id,start_time,end_time,anomaly_code,anomaly_subtype,reference_impact_value\n"
        "TR0001,2025-01-01 00:00:00,2025-01-01 00:01:00,C06,AVOIDABLE_START_STOP,0.600\n"
        "TR0002,2025-01-01 00:03:00,2025-01-01 00:04:00,C06,INEFFICIENT_POWER_ALLOCATION,1.100\n"
        "TR0003,2025-01-01 00:02:00,2025-01-01 00:02:00,C03,BESS_DIRECTION_REVERSED,0.000\n",
        encoding="utf-8",
    )

    report = build_c06_calibration_report(timeseries, labels)

    assert report["sourceFiles"]["timeseries"]["dataRowCount"] == 5
    assert report["sourceFiles"]["eventLabels"]["dataRowCount"] == 3
    assert len(report["sourceFiles"]["timeseries"]["sha256"]) == 64
    assert report["c06"]["eventCount"] == 2
    avoidable = report["c06"]["subtypes"]["AVOIDABLE_START_STOP"]
    inefficient = report["c06"]["subtypes"]["INEFFICIENT_POWER_ALLOCATION"]
    assert avoidable["inclusiveSampleCount"] == 2
    assert avoidable["calibratedRate"] == "0.018"
    assert avoidable["roundedReferenceMatchCount"] == 1
    assert inefficient["inclusiveSampleCount"] == 2
    assert inefficient["calibratedRate"] == "0.022"
    assert inefficient["roundedReferenceMatchCount"] == 1
    signature = report["c06"]["inefficientDetectionSignature"]
    assert signature["eventCount"] == 1
    assert signature["signatureRunCount"] == 1
    assert signature["exactBoundaryMatchCount"] == 1
    assert signature["extraSignatureRunCount"] == 0
    assert signature["signatureSampleCount"] == 2
    assert signature["selectedPairSampleCounts"] == {"ELZ02->ELZ03": 2}
