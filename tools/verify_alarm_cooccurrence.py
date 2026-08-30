"""A-P0-2：14 关联码与 350 标签事件的窗共现率核实脚本。

用法（官方数据目录为绝对路径；mode 可选 start/full，默认 start）：
    uv run python tools/verify_alarm_cooccurrence.py "D:\\allcode\\h2-t01-official\\dataandfiles" [start|full]

口径（plan0830/A/TASKS.md A-P0-2 卡）：
- 标签事件 = 04_train + 05_validation 全量 350 条（anomaly_code + start_time [+ end_time]）；
- mode=start（会话1）：共现窗 = 事件起点 ±10 分钟（含端点）；
- mode=full（会话2）：共现窗 = 事件全程 [start_time, end_time]（含端点），
  验证「7 个起点窗零共现码是否为事件后段信号」，并对 C04/C05 输出
  关联码 × 标签子类 交叉表（报警 message 为每码固定文案、无方向字段，
  子类消歧只能依赖码身份与子类的统计相关性）；
- 输出 = C 码 × 关联码 共现计数矩阵 + 每类事件各关联码覆盖率（+ 子类交叉表），
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


def load_events(
    official_data: Path,
) -> list[tuple[str, str, str, datetime, datetime]]:
    """读 04/05 标签事件的 (event_id, anomaly_code, subtype, start, end)。"""
    events: list[tuple[str, str, str, datetime, datetime]] = []
    for filename in ("04_train_event_labels.csv", "05_validation_event_labels.csv"):
        with (official_data / filename).open(encoding="utf-8-sig", newline="") as handle:
            for row in csv.DictReader(handle):
                start = parse_timestamp(row["start_time"])
                # 标签 end_time 缺失时保守取 start（窗退化为起点，不引入额外区间）。
                end = parse_timestamp(row["end_time"]) if row.get("end_time", "").strip() else start
                events.append(
                    (
                        row["event_id"].strip(),
                        row["anomaly_code"].strip(),
                        (row.get("anomaly_subtype") or "").strip(),
                        start,
                        end,
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
    if len(sys.argv) not in (2, 3) or (len(sys.argv) == 3 and sys.argv[2] not in ("start", "full")):
        print(__doc__)
        return 2
    official_data = Path(sys.argv[1])
    mode = sys.argv[2] if len(sys.argv) == 3 else "start"
    events = load_events(official_data)
    alarms = load_alarms(official_data)

    # counts[C 码][关联码] = 该类事件中「窗内出现该关联码」的事件数（按码去重）
    counts: dict[str, Counter[str]] = {code: Counter() for code in ANOMALY_CODES}
    # subtype_counts[C 码][子类][关联码] = 该类该子类事件中窗内出现该关联码的事件数
    subtype_counts: dict[str, dict[str, Counter[str]]] = {
        code: {} for code in ("C04", "C05")
    }
    subtype_totals: dict[str, Counter[str]] = {code: Counter() for code in ("C04", "C05")}
    totals: Counter[str] = Counter()
    for _event_id, code, subtype, start, end in events:
        totals[code] += 1
        if code in subtype_counts:
            subtype_totals[code][subtype] += 1
            subtype_counts[code].setdefault(subtype, Counter())
        if mode == "full":
            # 全程窗：事件 [start, end] 含端点（会话2 口径）。
            window_lo, window_hi = start, end
        else:
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
        if code in subtype_counts:
            subtype_counts[code][subtype].update(seen)

    window_label = "事件全程[start,end]" if mode == "full" else "事件起点±10min"
    related_total = sum(1 for code, _ in alarms if code in RELATED_CODES)
    print(f"mode={mode} 窗口径={window_label}")
    print(f"events total={len(events)} by_code={dict(sorted(totals.items()))}")
    print(f"alarms total={len(alarms)} related={related_total}")
    print()
    print(f"共现计数矩阵（行=C 码，列=关联码，窗={window_label}）：")
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
    if mode != "full":
        return 0
    # 会话2 追加：C04/C05 关联码 × 标签子类 交叉表（消歧信号核实）。
    print()
    print("C04/C05 关联码 × 标签子类 交叉表（窗=事件全程，仅列 >0）：")
    for code in ("C04", "C05"):
        for subtype in sorted(subtype_totals[code]):
            n = subtype_totals[code][subtype]
            ratios = {
                alarm: subtype_counts[code][subtype][alarm] / n
                for alarm in RELATED_CODES
                if subtype_counts[code][subtype][alarm] > 0
            }
            top = sorted(ratios.items(), key=lambda kv: -kv[1])[:6]
            rendered = ", ".join(f"{name}={ratio:.0%}" for name, ratio in top)
            print(f"  {code}/{subtype} (n={n}): {rendered or '—'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
