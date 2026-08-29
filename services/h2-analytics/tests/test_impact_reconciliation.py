"""对账工具单测（P0-7 / T10）：偏差口径、设备映射与合成数据上的端到端报告。

合成 CSV 仅覆盖工具读取的官方列结构（timestamp `YYYY-MM-DD HH:MM:SS` +
数值列；标签含 event_id/anomaly_code/anomaly_subtype/affected_equipment/
start_time/end_time/reference_impact_value），不引用任何官方数据行。
"""

from __future__ import annotations

import csv
import json
from pathlib import Path

import pytest

from h2_analytics.impact.reconcile import (
    DEVIATION_THRESHOLD,
    RECONCILE_DETECTOR_VERSION,
    build_reconciliation_report,
    implicated_ids_from_label,
    relative_deviation,
)


def test_relative_deviation_handles_positive_and_zero_references() -> None:
    assert relative_deviation(105.0, 100.0) == pytest.approx(0.05)
    assert relative_deviation(90.0, 100.0) == pytest.approx(0.10)
    # 参考值为 0：双侧为 0 记 0；计算值非 0 记 1.0（>100% 语义）。
    assert relative_deviation(0.0, 0.0) == 0.0
    assert relative_deviation(12.5, 0.0) == 1.0


def test_implicated_ids_from_label_maps_only_c02_equipment_tokens() -> None:
    assert implicated_ids_from_label("C02", "ELZ3") == ("ELZ03",)
    assert implicated_ids_from_label("C02", "ELZ1,ELZ2,ELZ3") == (
        "ELZ01",
        "ELZ02",
        "ELZ03",
    )
    assert implicated_ids_from_label("C02", "BESS01") == ()
    assert implicated_ids_from_label("C01", "ELZ1,BESS01,PCC01") == ()
    assert implicated_ids_from_label("C06", " ELZ2 ") == ()


def _write_csv(path: Path, header: list[str], rows: list[list[object]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(header)
        writer.writerows(rows)


_TIMESERIES_HEADER = [
    "timestamp",
    "ems_total_elz_target_kw",
    "elz1_power_cmd_kw",
    "elz1_power_actual_kw",
    "elz2_power_cmd_kw",
    "elz2_power_actual_kw",
    "elz3_power_cmd_kw",
    "elz3_power_actual_kw",
    "pcc_export_power_violation_kw",
    "pcc_import_power_violation_kw",
]

_LABELS_HEADER = [
    "event_id",
    "start_time",
    "end_time",
    "anomaly_code",
    "anomaly_subtype",
    "affected_equipment",
    "reference_impact_value",
]


def _synthetic_timeseries_rows() -> list[list[object]]:
    base = [
        # ELZ1 缺口 200 kW（E2 未归因到该机，必须被排除）；ELZ3 缺口 50 kW。
        100.0, 300.0, 100.0, 0.0, 0.0, 200.0, 150.0, 0.0, 0.0,
    ]
    return [
        [f"2026-01-05 10:0{minute}:00", *base] for minute in range(3)
    ]


def _synthetic_labels_rows() -> list[list[object]]:
    return [
        # C06：(100+100)×0.018×1/60 = 0.06 kWh，参考值一致。
        ["E1", "2026-01-05 10:00:00", "2026-01-05 10:01:00", "C06",
         "AVOIDABLE_START_STOP", "ELZ1,ELZ2,ELZ3", "0.06"],
        # C02：单行 ELZ3 缺口 50 kW → 50×1/60 ≈ 0.833333 kWh（ELZ1 缺口被排除）。
        ["E2", "2026-01-05 10:02:00", "2026-01-05 10:02:00", "C02",
         "CAPACITY_NOT_SYNCHRONIZED", "ELZ3", "0.833333"],
        # C04：越限字段全 0 且参考值为 0（零/零对账不得报 inf）。
        ["E3", "2026-01-05 10:00:00", "2026-01-05 10:00:00", "C04",
         "EXPORT_POWER_LIMIT_NOT_TRACKED", "PCC", "0.0"],
    ]


def test_build_reconciliation_report_end_to_end_on_synthetic_csvs(
    tmp_path: Path,
) -> None:
    timeseries_path = tmp_path / "timeseries.csv"
    labels_path = tmp_path / "labels.csv"
    _write_csv(timeseries_path, _TIMESERIES_HEADER, _synthetic_timeseries_rows())
    _write_csv(labels_path, _LABELS_HEADER, _synthetic_labels_rows())

    report = build_reconciliation_report(
        timeseries_path, labels_path, split="validation"
    )

    assert report["split"] == "validation"
    assert report["samplingIntervalMinutes"] == 1.0
    assert report["deviationThreshold"] == DEVIATION_THRESHOLD
    assert report["detectorVersionForReconciliation"] == RECONCILE_DETECTOR_VERSION
    assert report["formulaVersions"]["C01"] == "impact-c01-v2"
    assert report["formulaVersions"]["C02"] == "impact-c02-v2"
    for entry in report["sourceFiles"].values():
        assert len(entry["sha256"]) == 64
        assert entry["dataRowCount"] > 0

    summaries = report["classSummaries"]
    assert set(summaries) == {"C02", "C04", "C06"}
    assert summaries["C02"]["eventCount"] == 1
    assert summaries["C02"]["withinThresholdCount"] == 1

    by_event = {item["eventId"]: item for item in report["events"]}
    # E1：C06 精确对账。
    assert by_event["E1"]["calculatedKwh"] == pytest.approx(0.06, abs=1e-6)
    assert by_event["E1"]["withinThreshold"] is True
    # E2：只计 ELZ3 缺口，ELZ1 的 200 kW 缺口被受影响设备口径排除。
    assert by_event["E2"]["calculatedKwh"] == pytest.approx(50.0 / 60.0, abs=1e-6)
    assert by_event["E2"]["relativeDeviation"] < DEVIATION_THRESHOLD
    # E3：参考值为 0 时零/零对账记 0 偏差。
    assert by_event["E3"]["calculatedKwh"] == pytest.approx(0.0)
    assert by_event["E3"]["relativeDeviation"] == 0.0
    assert by_event["E3"]["withinThreshold"] is True

    # 报告必须是合法 JSON（stdout 消费方按 JSON 解析）。
    assert json.loads(json.dumps(report))["split"] == "validation"


def test_labels_without_timeseries_coverage_raise(tmp_path: Path) -> None:
    timeseries_path = tmp_path / "timeseries.csv"
    labels_path = tmp_path / "labels.csv"
    _write_csv(
        timeseries_path,
        _TIMESERIES_HEADER,
        [["2026-01-05 10:00:00", *[0.0] * 9]],
    )
    _write_csv(
        labels_path,
        _LABELS_HEADER,
        [["E9", "2026-01-05 11:00:00", "2026-01-05 11:05:00", "C06",
          "AVOIDABLE_START_STOP", "ELZ1,ELZ2,ELZ3", "1.0"]],
    )

    with pytest.raises(ValueError, match="E9"):
        build_reconciliation_report(timeseries_path, labels_path, split="train")
