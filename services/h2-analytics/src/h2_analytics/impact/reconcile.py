"""影响量化对账：官方 reference_impact_value vs 计算器实现（P0-7 / T10）。

逐事件把官方事件标签的 `reference_impact_value` 与 `ImpactCalculator` 的输出对账，
产出四元组的"对账偏差"证据：按类聚合 + 逐事件明细，JSON 输出到 stdout。

用法（官方公开文件路径由调用方传入，本工具不落盘任何官方行）::

    python -m h2_analytics.impact.reconcile TIMESERIES LABELS --split train
    python -m h2_analytics.impact.reconcile TIMESERIES LABELS --split validation

纪律：TRAIN 用于口径推导（calibrationSplit=public_train），VALIDATION 仅作验收
（heldOutPolicy=acceptance-only）；两种模式共用同一计算路径，无任何 split 专属系数。
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from h2_analytics.events import EventWindow
from h2_analytics.impact import ImpactCalculator
from h2_analytics.impact.calculators import DECLARED_IMPACT_METRICS
from h2_analytics.models import DataRow

# 对账窗口使用的检测器版本标记：与任何 fixture 版本不同，确保走公开校准路径。
RECONCILE_DETECTOR_VERSION = "impact-reconcile-v1"
# 相对偏差阈值：与任务卡 A-6 的修订触发线一致（偏差 >10% 需给出修订）。
DEVIATION_THRESHOLD = 0.10

# 各类计算器消费的时序列字段（含 C04 的限值回退字段）。
_RECONCILE_FIELDS = (
    "bess_power_actual_kw",
    "bess_soc_pct",
    "soc_target_pct",
    "elz1_power_cmd_kw",
    "elz1_power_actual_kw",
    "elz2_power_cmd_kw",
    "elz2_power_actual_kw",
    "elz3_power_cmd_kw",
    "elz3_power_actual_kw",
    "pcc_power_actual_kw",
    "pcc_export_power_violation_kw",
    "pcc_import_power_violation_kw",
    "grid_export_power_limit_kw",
    "grid_import_power_limit_kw",
    "grid_export_energy_quota_excess_kwh",
    "grid_import_energy_quota_excess_kwh",
    "ems_total_elz_target_kw",
    "bess_available_charge_energy_kwh",
    "bess_available_discharge_energy_kwh",
    "bess_regulation_reserve_target_kwh",
)

# 官方标签 affected_equipment 记号（ELZ1/ELZ2/ELZ3）→ 内部 implicated ID（ELZ01/…）。
_LABEL_EQUIPMENT_TO_INTERNAL = {"ELZ1": "ELZ01", "ELZ2": "ELZ02", "ELZ3": "ELZ03"}


@dataclass(slots=True)
class _ReconcileEvent:
    """一条官方标签事件及其对账结果（不保留官方行内容，仅聚合量）。"""

    event_id: str
    code: str
    subtype: str
    affected_equipment: str
    start: datetime
    end: datetime
    reference_kwh: float
    rows: list[DataRow] = field(default_factory=list)
    calculated_kwh: float | None = None


def relative_deviation(calculated: float, reference: float) -> float:
    """相对偏差：参考值为 0 时，双侧为 0 记 0，否则记 1.0（表示 100% 以上）。"""
    if reference > 0.0:
        return abs(calculated - reference) / reference
    return 0.0 if calculated == 0.0 else 1.0


def implicated_ids_from_label(code: str, affected_equipment: str) -> tuple[str, ...]:
    """C02 的官方受影响设备记号转内部 implicated ID；其他类不参与影响口径。"""
    if code != "C02":
        return ()
    return tuple(
        internal
        for token in (item.strip() for item in affected_equipment.split(","))
        if (internal := _LABEL_EQUIPMENT_TO_INTERNAL.get(token)) is not None
    )


def build_reconciliation_report(
    timeseries_path: Path,
    labels_path: Path,
    *,
    split: str,
    sampling_interval_minutes: float = 1.0,
) -> dict[str, Any]:
    """返回对账报告：源文件哈希 + 逐事件明细 + 分类聚合。"""
    events, label_row_count = _read_events(labels_path)
    timeseries_row_count = _accumulate_rows(timeseries_path, events)
    _validate_coverage(events)
    calculator = ImpactCalculator()
    per_event: list[dict[str, Any]] = []
    for event in events:
        window = EventWindow(
            event_id=event.event_id,
            code=event.code,
            subtype=event.subtype,
            rows=tuple(event.rows),
            start_time=event.start,
            end_time=event.end,
            first_detection_time=event.start,
            confidence=1.0,
            detector_version=RECONCILE_DETECTOR_VERSION,
            implicated_equipment_ids=implicated_ids_from_label(
                event.code, event.affected_equipment
            ),
        )
        calculation = calculator.calculate(
            window=window,
            sampling_interval_minutes=sampling_interval_minutes,
        )
        event.calculated_kwh = calculation.value
        deviation = relative_deviation(calculation.value, event.reference_kwh)
        per_event.append(
            {
                "eventId": event.event_id,
                "code": event.code,
                "subtype": event.subtype,
                "affectedEquipment": event.affected_equipment,
                "sampleCount": len(event.rows),
                "calculatedKwh": round(calculation.value, 6),
                "referenceKwh": round(event.reference_kwh, 6),
                "absoluteResidualKwh": round(
                    abs(calculation.value - event.reference_kwh), 6
                ),
                "relativeDeviation": round(deviation, 6),
                "withinThreshold": deviation <= DEVIATION_THRESHOLD,
            }
        )
    return {
        "split": split,
        "samplingIntervalMinutes": sampling_interval_minutes,
        "deviationThreshold": DEVIATION_THRESHOLD,
        "detectorVersionForReconciliation": RECONCILE_DETECTOR_VERSION,
        "formulaVersions": {
            code: metric[1] for code, metric in DECLARED_IMPACT_METRICS.items()
        },
        "sourceFiles": {
            "timeseries": {
                **_file_digest(timeseries_path),
                "dataRowCount": timeseries_row_count,
            },
            "eventLabels": {
                **_file_digest(labels_path),
                "dataRowCount": label_row_count,
            },
        },
        "classSummaries": _class_summaries(per_event),
        "events": per_event,
    }


def _class_summaries(per_event: list[dict[str, Any]]) -> dict[str, Any]:
    summaries: dict[str, Any] = {}
    for code in sorted({item["code"] for item in per_event}):
        rows = [item for item in per_event if item["code"] == code]
        within = sum(1 for item in rows if item["withinThreshold"])
        exact = sum(
            1
            for item in rows
            if round(item["calculatedKwh"], 3) == round(item["referenceKwh"], 3)
        )
        summaries[code] = {
            "metric": DECLARED_IMPACT_METRICS[code][0],
            "eventCount": len(rows),
            "withinThresholdCount": within,
            "exactToThreeDecimalsCount": exact,
            "maxAbsoluteResidualKwh": max(
                item["absoluteResidualKwh"] for item in rows
            ),
            "maxRelativeDeviation": max(
                item["relativeDeviation"] for item in rows
            ),
        }
    return summaries


def _read_events(path: Path) -> tuple[list[_ReconcileEvent], int]:
    events: list[_ReconcileEvent] = []
    row_count = 0
    with path.open(encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream):
            row_count += 1
            events.append(
                _ReconcileEvent(
                    event_id=row["event_id"],
                    code=row["anomaly_code"],
                    subtype=row["anomaly_subtype"],
                    affected_equipment=row["affected_equipment"],
                    start=datetime.fromisoformat(row["start_time"]),
                    end=datetime.fromisoformat(row["end_time"]),
                    reference_kwh=float(row["reference_impact_value"]),
                )
            )
    events.sort(key=lambda event: (event.start, event.event_id))
    return events, row_count


def _accumulate_rows(path: Path, events: list[_ReconcileEvent]) -> int:
    """单次流式扫描，把闭区间 [start, end] 内的行分配给各事件。"""
    next_event_index = 0
    active: list[_ReconcileEvent] = []
    row_count = 0
    with path.open(encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream):
            row_count += 1
            timestamp = datetime.fromisoformat(row["timestamp"])
            while (
                next_event_index < len(events)
                and events[next_event_index].start <= timestamp
            ):
                active.append(events[next_event_index])
                next_event_index += 1
            active = [event for event in active if event.end >= timestamp]
            if not active:
                continue
            values: dict[str, float | None] = {}
            for name in _RECONCILE_FIELDS:
                raw = row.get(name)
                try:
                    values[name] = None if raw in (None, "") else float(raw)
                except ValueError:
                    values[name] = None
            for event in active:
                if event.start <= timestamp <= event.end:
                    event.rows.append(DataRow(row_count, timestamp, row["timestamp"], values))
    return row_count


def _validate_coverage(events: list[_ReconcileEvent]) -> None:
    missing = [event.event_id for event in events if not event.rows]
    if missing:
        raise ValueError(
            f"Labels have no matching time-series samples: {', '.join(missing)}"
        )


def _file_digest(path: Path) -> dict[str, Any]:
    digest = hashlib.sha256()
    byte_count = 0
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
            byte_count += len(chunk)
    return {"sha256": digest.hexdigest(), "byteCount": byte_count}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Reconcile impact values against official reference labels."
    )
    parser.add_argument("timeseries", type=Path)
    parser.add_argument("labels", type=Path)
    parser.add_argument(
        "--split",
        choices=("train", "validation"),
        default="validation",
        help="Split name recorded in the report (train=calibration, validation=acceptance).",
    )
    parser.add_argument(
        "--sampling-minutes",
        type=float,
        default=1.0,
        help="Sampling interval in minutes (official minute data = 1.0).",
    )
    arguments = parser.parse_args()
    print(
        json.dumps(
            build_reconciliation_report(
                arguments.timeseries,
                arguments.labels,
                split=arguments.split,
                sampling_interval_minutes=arguments.sampling_minutes,
            ),
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
