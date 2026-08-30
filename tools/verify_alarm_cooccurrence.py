"""A-P0-2 会话1：14 关联码与 350 标签事件的窗共现率核实脚本。

用法（官方数据目录为绝对路径）：
    uv run python tools/verify_alarm_cooccurrence.py "D:\\allcode\\h2-t01-official\\dataandfiles"

口径（plan0830/A/TASKS.md A-P0-2 卡）：
- 标签事件 = 04_train + 05_validation 全量 350 条（anomaly_code + start_time）；
- 共现窗 = 事件起点 ±10 分钟（含端点）；
- 输出 = C 码 × 关联码 共现计数矩阵 + 每类事件各关联码覆盖率，
  用于修正假设对应表（结论固化进 detection/alarm_features.py 注释）。

本脚本只读标签与报警两个官方小文件，不触碰时序大 CSV；仅做离线统计，
不参与运行时检测（红线：报警不作触发/计数判据）。
"""

from __future__ import annotations

import csv
import sys
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path

# 关联簇 14 码（与任务卡假设对应表一致，待本次统计核实修正）
RELATED_CODES = [
    "ELZ_POWER_DEVIATION",
    "GRID_ENERGY_QUOTA_RISK",
    "GRID_ENERGY_QUOTA_EXCEED",
    "ELZ_ALLOCATION_EFF_LOW",
    "BESS_RESERVE_SHORTFALL",
    "BESS_DIRECTION_CONFLICT",
    "PCC_POWER_LIMIT_EXCEED",
    "EMS_SETPOINT_OSC",
    "CAPACITY_SYNC_WARN",
    "ELZ_AVOIDABLE_START",
    "PCC_DEVIATION",
    "BESS_REGULATION_HIGH",
    "SOC_TRAJECTORY_DEVIATION",
    "DISPATCH_LIMIT_NOT_TRACKED",
]

ANOMALY_CODES = [f"C0{index}" for index in range(1, 8)]

WINDOW_MINUTES = 10


def parse_timestamp(value: str) -> datetime:
    """标签文件时间含秒（HH:MM:SS），报警日志为分钟级（HH:MM）——两者兼容。"""
    text = value.strip()
    if text.count(":") == 2:
        return datetime.strptime(text, "%Y-%m-%d %H:%M:%S")
    return datetime.strptime(text, "%Y-%m-%d %H:%M")


def load_events(official_data: Path) -> list[tuple[str, str, datetime]]:
    """读 04/05 标签事件的 (event_id, anomaly_code, start_time)。"""
    events: list[tuple[str, str, datetime]] = []
    for filename in ("04_train_event_labels.csv", "05_validation_event_labels.csv"):
        with (official_data / filename).open(encoding="utf-8-sig", newline="") as handle:
            for row in csv.DictReader(handle):
                events.append(
                    (
                        row["event_id"].strip(),
                        row["anomaly_code"].strip(),
                        parse_timestamp(row["start_time"]),
                    )
                )
    return events


def load_alarms(official_data: Path) -> list[tuple[str, datetime]]:
    """读 11 号报警日志的 (alarm_code, timestamp)，按时间升序供窗内扫描。"""
    alarms: list[tuple[str, datetime]] = []
    with (official_data / "11_alarm_log.csv").open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            alarms.append((row["alarm_code"].strip(), parse_timestamp(row["timestamp"])))
    alarms.sort(key=lambda item: item[1])
    return alarms


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    official_data = Path(sys.argv[1])
    events = load_events(official_data)
    alarms = load_alarms(official_data)

    # counts[C 码][关联码] = 该类事件中「窗内出现该关联码」的事件数（按码去重）
    counts: dict[str, Counter[str]] = {code: Counter() for code in ANOMALY_CODES}
    totals: Counter[str] = Counter()
    for _event_id, code, start in events:
        totals[code] += 1
        window_lo = start - timedelta(minutes=WINDOW_MINUTES)
        window_hi = start + timedelta(minutes=WINDOW_MINUTES)
        seen: set[str] = set()
        for alarm_code, stamp in alarms:
            if stamp < window_lo:
                continue
            if stamp > window_hi:
                break
            if alarm_code in RELATED_CODES:
                seen.add(alarm_code)
        counts[code].update(seen)

    related_total = sum(1 for code, _ in alarms if code in RELATED_CODES)
    print(f"events total={len(events)} by_code={dict(sorted(totals.items()))}")
    print(f"alarms total={len(alarms)} related={related_total}")
    print()
    print("共现计数矩阵（行=C 码，列=关联码，窗=事件起点±10min）：")
    print("C码\\alarm\t" + "\t".join(RELATED_CODES))
    for code in ANOMALY_CODES:
        cells = [str(counts[code][alarm]) for alarm in RELATED_CODES]
        print(f"{code}\t" + "\t".join(cells))
    print()
    print("每类事件各关联码覆盖率（仅列 >0，降序前 5）：")
    for code in ANOMALY_CODES:
        ratios = {
            alarm: counts[code][alarm] / totals[code]
            for alarm in RELATED_CODES
            if counts[code][alarm] > 0
        }
        top = sorted(ratios.items(), key=lambda kv: -kv[1])[:5]
        rendered = ", ".join(f"{name}={ratio:.0%}" for name, ratio in top)
        print(f"  {code} (n={totals[code]}): {rendered or '—'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
