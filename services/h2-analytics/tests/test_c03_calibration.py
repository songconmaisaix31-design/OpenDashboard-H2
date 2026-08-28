from __future__ import annotations

from pathlib import Path

from h2_analytics.tools.calibrate_c03 import build_c03_calibration_report


def test_c03_calibration_tool_derives_gain_from_inclusive_train_rows(
    tmp_path: Path,
) -> None:
    timeseries = tmp_path / "train.csv"
    labels = tmp_path / "labels.csv"
    timeseries.write_text(
        "timestamp,bess_power_actual_kw,bess_soc_pct,soc_target_pct\n"
        "2025-01-01 00:00:00,400,40,60\n"
        "2025-01-01 00:01:00,400,40,60\n"
        "2025-01-01 00:02:00,0,50,50\n",
        encoding="utf-8",
    )
    labels.write_text(
        "event_id,start_time,end_time,anomaly_code,anomaly_subtype,reference_impact_value\n"
        "TR0001,2025-01-01 00:00:00,2025-01-01 00:01:00,C03,BESS_DIRECTION_REVERSED,25.261\n"
        "TR0002,2025-01-01 00:02:00,2025-01-01 00:02:00,C06,AVOIDABLE_START_STOP,0.000\n",
        encoding="utf-8",
    )

    report = build_c03_calibration_report(timeseries, labels)

    assert report["sourceFiles"]["timeseries"]["dataRowCount"] == 3
    assert report["sourceFiles"]["eventLabels"]["dataRowCount"] == 2
    assert len(report["sourceFiles"]["eventLabels"]["sha256"]) == 64
    statistics = report["c03"]
    assert statistics["eventCount"] == 1
    assert statistics["inclusiveSampleCount"] == 2
    assert statistics["calibratedSocTrackingGainKwPerPct"] == "17.892"
    assert statistics["roundedReferenceMatchCount"] == 1
    assert statistics["maximumAbsoluteRoundedResidualKwh"] == "0"
