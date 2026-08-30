"""A-P0-2 会话2：val 预测子类 vs 标签子类离线一致率核实脚本。

用法（在 services/h2-analytics 下）：
    uv run python ../../tools/verify_subtype_consistency.py "D:\\allcode\\h2-t01-official\\dataandfiles" <evaluate报告.json>

口径（plan0830/A/TASKS.md A-P0-2 卡会话2）：
- 离线复现检测管线：流式读 02 号 val CSV → 按日分块（1440 行/日）→
  RuleRowDetector.detect + EventAggregator.aggregate（与 evaluate.mjs 同口径
  注入 H2_OPERATION_LOG_PATH / H2_ALARM_LOG_PATH，先验/弱特征通路同状态）；
- 复现正确性验证：与 evaluate 报告 evaluatedEvents.predictions 逐条对照
  （event_id/code/start/end），不一致即退出码 1；
- 一致率：借报告 matches 的 groundTruthId↔predictionId 对齐，比较
  预测 subtype vs 05 号标签 anomaly_subtype，输出逐事件表与分码汇总。

本脚本只写 stdout，不参与运行时检测；时序 CSV 仅流式处理，不整读。
"""

from __future__ import annotations

import csv
import json
import os
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path


def _collapse(
    chain: list[tuple[str, str, datetime, datetime]],
    code: str,
) -> list[tuple[str, str, str, datetime, datetime]]:
    """把同码相邻段链折叠为单事件（首段 id/subtype，最早起最晚止）。"""
    if not chain:
        return []
    first_id, first_subtype, start, _ = chain[0]
    end = max(item[3] for item in chain)
    return [(first_id, code, first_subtype, start, end)]


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    official_data = Path(sys.argv[1])
    report_path = Path(sys.argv[2])

    # 与 evaluate.mjs 同口径注入两个特征通路（惰性单例在首次 aggregate 前激活）。
    os.environ.setdefault("H2_OPERATION_LOG_PATH", str(official_data / "12_operation_log.csv"))
    os.environ.setdefault("H2_ALARM_LOG_PATH", str(official_data / "11_alarm_log.csv"))

    from h2_analytics.detection.rules import RuleRowDetector
    from h2_analytics.events.aggregator import EventAggregator
    from h2_analytics.models import DataRow

    with report_path.open(encoding="utf-8") as handle:
        report = json.load(handle)
    report_predictions = report["evaluatedEvents"]["predictions"]
    matches = report["metrics"]["classification"]["matchedPairs"]

    # --- 流式读 02 号 CSV，按 UTC 日分块复现管线 -------------------------------
    detector = RuleRowDetector()
    aggregator = EventAggregator()
    windows: list[tuple[str, str, str, datetime, datetime]] = []
    day_rows: list[DataRow] = []
    day_key: str | None = None
    index = 0

    def flush() -> None:
        nonlocal day_rows
        if not day_rows:
            return
        candidates = detector.detect(tuple(day_rows))
        for window in aggregator.aggregate(
            rows=tuple(day_rows),
            candidates=candidates,
            sampling_interval_minutes=1.0,
        ):
            windows.append(
                (window.event_id, window.code, window.subtype, window.start_time, window.end_time)
            )
        day_rows = []

    with (official_data / "02_validation_timeseries.csv").open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        numeric_fields = [name for name in reader.fieldnames if name != "timestamp"]
        for row in reader:
            raw = (row.get("timestamp") or "").strip()
            stamp = datetime.fromisoformat(raw).replace(tzinfo=UTC) if raw else None
            key = raw[:10] if raw else day_key
            if day_key is not None and key != day_key:
                flush()
            day_key = key
            values = {
                name: (None if (text := (row.get(name) or "").strip()) == "" else _to_float(text))
                for name in numeric_fields
            }
            day_rows.append(
                DataRow(index=index, timestamp=stamp, timestamp_text=raw, values=values)
            )
            index += 1
    flush()

    # --- evaluate 层同码 2 分钟合并（报告 parameters.mergeGapMinutes） ----------
    # 报告 evaluatedEvents.predictions 为合并后口径（rawCount→mergedCount）；
    # 合并链内 subtype 不一致时记首段并在对照时以首段为准（val 实测链内同码同子类）。
    merge_gap = timedelta(minutes=int(report["parameters"].get("mergeGapMinutes", 2)))
    by_code: dict[str, list[tuple[str, str, datetime, datetime]]] = {}
    for event_id, code, subtype, start, end in windows:
        by_code.setdefault(code, []).append((event_id, subtype, start, end))
    merged: list[tuple[str, str, str, datetime, datetime]] = []
    for code in sorted(by_code):
        chain: list[tuple[str, str, datetime, datetime]] = []
        for item in sorted(by_code[code], key=lambda kv: kv[2]):
            if chain and item[2] - chain[-1][3] <= merge_gap:
                chain.append(item)
            else:
                merged.extend(_collapse(chain, code))
                chain = [item]
        merged.extend(_collapse(chain, code))

    # --- 复现正确性：与报告预测逐条对照 ---------------------------------------
    def norm(stamp: str) -> str:
        return stamp.replace("Z", "").replace("+00:00", "")

    mine = {
        (event_id, code, norm(start.isoformat()), norm(end.isoformat()))
        for event_id, code, _subtype, start, end in merged
    }
    theirs = {
        (item["id"], item["code"], norm(item["startTime"]), norm(item["endTime"]))
        for item in report_predictions
    }
    missing = theirs - mine
    extra = mine - theirs
    reproduced = not missing and not extra
    print(f"复现对照：本地事件 {len(merged)} 条（合并前 {len(windows)}） vs 报告预测 {len(theirs)} 条 → {'一致' if reproduced else '不一致'}")
    for item in sorted(missing)[:5]:
        print(f"  报告有本地无: {item}")
    for item in sorted(extra)[:5]:
        print(f"  本地有报告无: {item}")
    if not reproduced:
        return 1

    # --- 子类一致率：借报告 matches 对齐标签 ----------------------------------
    label_subtype: dict[str, str] = {}
    with (official_data / "05_validation_event_labels.csv").open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            label_subtype[row["event_id"].strip()] = (row.get("anomaly_subtype") or "").strip()

    subtype_by_prediction = {event_id: subtype for event_id, _code, subtype, _s, _e in merged}
    prediction_by_gt = {pair["groundTruthId"]: pair["predictionId"] for pair in matches}

    mismatch_lines: list[str] = []
    per_code_total: dict[str, int] = {}
    per_code_ok: dict[str, int] = {}
    c04c05_rows: list[str] = []
    for gt_id in sorted(prediction_by_gt):
        pred_id = prediction_by_gt[gt_id]
        entry = next(item for item in report_predictions if item["id"] == pred_id)
        code = entry["code"]
        predicted = subtype_by_prediction[pred_id]
        expected = label_subtype.get(gt_id, "")
        per_code_total[code] = per_code_total.get(code, 0) + 1
        ok = predicted == expected
        per_code_ok[code] = per_code_ok.get(code, 0) + (1 if ok else 0)
        if not ok:
            mismatch_lines.append(f"{gt_id} {code}: 预测={predicted} 标签={expected}")
        if code in ("C04", "C05"):
            c04c05_rows.append(f"{gt_id} | {code} | {predicted} | {expected} | {'一致' if ok else '不一致'}")

    total = len(prediction_by_gt)
    ok_total = sum(per_code_ok.values())
    print()
    print(f"val 匹配事件子类一致率：{ok_total}/{total}")
    print("分码：", " ".join(f"{code}={per_code_ok.get(code, 0)}/{per_code_total.get(code, 0)}" for code in sorted(per_code_total)))
    if mismatch_lines:
        print("不一致事件：")
        for line in mismatch_lines:
            print(f"  {line}")
    else:
        print("不一致事件：无")
    print()
    print("C04/C05 逐事件表（事件ID | C码 | 预测子类 | 标签子类 | 结论）：")
    for line in c04c05_rows:
        print(f"  {line}")
    return 0


def _to_float(text: str) -> float | None:
    try:
        return float(text)
    except ValueError:
        return None


if __name__ == "__main__":
    raise SystemExit(main())
