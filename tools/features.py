"""特征工程（T08 / P1-9a）：为 LightGBM 混合检测提供行级命名特征。

上游规格：plan0829/02_ALGO_ROBUSTNESS.md §4.3；ADR-001（规则为主、ML 校验层）、
ADR-002（N01-N07 只作尺子不作训练增强——本模块不消费 13_normal_context.csv）。

消费契约
--------
- 训练（tools/train_lightgbm.py，T09）：读本模块产出的特征 CSV，与 06/07 行级标签按时间戳对齐；
- 推理（service.py 接线，T11/A1）：检测管线在行级调用同一变换，特征名以 ``FEATURE_NAMES`` 为准
  （与 ``detection/lightgbm_adapter.py`` 的 ``feature_names`` 接口对齐：行级命名值）。

设计约束
--------
- 纯标准库（运行环境无 pandas/numpy）；确定性（同输入同输出，供 3 seed 训练复现）；
- **全因果窗**：滑窗/速率/翻转只回看过去，不看未来行（流式推理可实时计算，且防止标签泄漏）；
- 缺失传播：原始值缺失或窗口样本不足时特征为 ``None``，禁止编造 0；
- 效率曲线/约束常量不入模（02§4.5：TRAIN 标记冻结规则延续，ML 只见运行时序与日志邻近统计）。

特征覆盖清单（六族共 69 个；W=15 分钟滑窗 / R=5 分钟速率窗 / 日志先验窗 (t-90, t-20]）
-----------------------------------------------------------------------------------
族 0 直通（8）：system_alarm_count、bus_frequency_hz、ems_power_balance_error_kw、
    bess_soc_pct、elz{1,2,3}_run_state、bess_regulation_reserve_target_kwh
族 1 滑窗统计（30）：bess_power_cmd_kw、bess_power_actual_kw、pcc_power_actual_kw、
    ems_power_balance_error_kw、bess_soc_pct、bus_frequency_hz 六量 ×
    {win15_mean, win15_range, win15_p10, win15_p90}；elz{1,2,3}_power_cmd_kw 三量 ×
    {win15_mean, win15_range}（C03 指令带/平台判别面）
族 2 一阶差分（6）：d1_{bess_soc_pct, bess_power_actual_kw, pcc_power_actual_kw,
    bus_frequency_hz, ems_power_balance_error_kw, bess_power_cmd_kw}
族 3 速率（6，R=5 分钟差商）：rate5_{grid_export_energy_remaining_kwh,
    grid_import_energy_remaining_kwh, bess_available_charge_energy_kwh,
    bess_available_discharge_energy_kwh, bess_soc_pct, ems_power_balance_error_kw}
    （kWh/min、kW/min、%/min；grid_*_energy_remaining 速率即 C05 前瞻同源物理量）
族 4 裕量/跟踪误差（13）：margin_bess_charge_reserve_kwh、margin_bess_discharge_reserve_kwh
    （备用差值，C07 前瞻同源）、margin_bess_soc_low_pct、margin_bess_soc_high_pct、
    margin_grid_export_quota_kwh、margin_grid_import_quota_kwh、margin_bess_discharge_power_kw、
    margin_bess_charge_power_kw、cmd_track_error_{bess,pcc,elz1,elz2,elz3}_kw
族 5 符号翻转（2）：flip15_bess_power_cmd、flip15_bess_power_actual（方向冲突先验）
族 6 日志邻近（4）：log_alarm_count_90_20、log_alarm_high_severity_count_90_20、
    log_alarm_direction_conflict_count_90_20、log_operation_count_90_20

CLI
---
    python tools/features.py --timeseries <csv> [--alarm-log <csv>] [--operation-log <csv>]
        --log-split train [--output <csv>] [--max-rows <n>] [--catalog]
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from bisect import bisect_right
from collections import deque
from datetime import datetime, timedelta
from pathlib import Path
from typing import Mapping, Sequence

# ---------------------------------------------------------------------------
# 窗口口径常量（改动即特征口径变更，须同步覆盖清单与 MODELS_REGISTRY 登记）
# ---------------------------------------------------------------------------
FEATURE_WINDOW_MINUTES = 15
RATE_WINDOW_MINUTES = 5
LOG_LOOKBACK_START_MINUTES = 90  # 先验窗远端（含）
LOG_LOOKBACK_END_MINUTES = 20  # 先验窗近端（排除最近 20 分钟，避免用"当下报警"当特征）
DIRECTION_CONFLICT_ALARM_CODE = "BESS_DIRECTION_CONFLICT"
HIGH_SEVERITY_TEXT = "高"

TIMESTAMP_COLUMN = "timestamp"

# ---------------------------------------------------------------------------
# 族定义（单一事实源：FEATURE_NAMES 由以下配置推导，手写清单禁止）
# ---------------------------------------------------------------------------
_FAMILY0_PASSTHROUGH: tuple[str, ...] = (
    "system_alarm_count",
    "bus_frequency_hz",
    "ems_power_balance_error_kw",
    "bess_soc_pct",
    "elz1_run_state",
    "elz2_run_state",
    "elz3_run_state",
    "bess_regulation_reserve_target_kwh",
)

# 族 1：六量 × 四统计
_SLIDING_FULL: tuple[str, ...] = (
    "bess_power_cmd_kw",
    "bess_power_actual_kw",
    "pcc_power_actual_kw",
    "ems_power_balance_error_kw",
    "bess_soc_pct",
    "bus_frequency_hz",
)
# 族 1 追加：三台 ELZ 指令 × 两统计（C03 判别面）
_SLIDING_ELZ: tuple[str, ...] = (
    "elz1_power_cmd_kw",
    "elz2_power_cmd_kw",
    "elz3_power_cmd_kw",
)
_SLIDING_FULL_STATS = ("mean", "range", "p10", "p90")
_SLIDING_ELZ_STATS = ("mean", "range")

# 族 2：一阶差分
_DELTA1: tuple[str, ...] = (
    "bess_soc_pct",
    "bess_power_actual_kw",
    "pcc_power_actual_kw",
    "bus_frequency_hz",
    "ems_power_balance_error_kw",
    "bess_power_cmd_kw",
)

# 族 3：R 分钟速率
_RATE5: tuple[str, ...] = (
    "grid_export_energy_remaining_kwh",
    "grid_import_energy_remaining_kwh",
    "bess_available_charge_energy_kwh",
    "bess_available_discharge_energy_kwh",
    "bess_soc_pct",
    "ems_power_balance_error_kw",
)

# 族 4：差分特征 (特征名, 左项[列名或常数], 右项[列名或常数])，值为 左 − 右
_DIFF_SPECS: tuple[tuple[str, str | float, str | float], ...] = (
    ("margin_bess_charge_reserve_kwh", "bess_available_charge_energy_kwh", "bess_regulation_reserve_target_kwh"),
    ("margin_bess_discharge_reserve_kwh", "bess_available_discharge_energy_kwh", "bess_regulation_reserve_target_kwh"),
    ("margin_bess_soc_low_pct", "bess_soc_pct", 20.0),  # soc 距下界裕量 = soc − 20
    ("margin_bess_soc_high_pct", 90.0, "bess_soc_pct"),  # soc 距上界裕量 = 90 − soc
    ("margin_grid_export_quota_kwh", "grid_export_energy_quota_kwh_day", "grid_export_energy_used_kwh_day"),
    ("margin_grid_import_quota_kwh", "grid_import_energy_quota_kwh_day", "grid_import_energy_used_kwh_day"),
    ("margin_bess_discharge_power_kw", "bess_discharge_power_limit_kw", "bess_power_actual_kw"),
    ("margin_bess_charge_power_kw", "bess_charge_power_limit_kw", "bess_power_actual_kw"),
    ("cmd_track_error_bess_kw", "bess_power_cmd_kw", "bess_power_actual_kw"),
    ("cmd_track_error_pcc_kw", "pcc_power_cmd_kw", "pcc_power_actual_kw"),
    ("cmd_track_error_elz1_kw", "elz1_power_cmd_kw", "elz1_power_actual_kw"),
    ("cmd_track_error_elz2_kw", "elz2_power_cmd_kw", "elz2_power_actual_kw"),
    ("cmd_track_error_elz3_kw", "elz3_power_cmd_kw", "elz3_power_actual_kw"),
)

# 族 5：符号翻转
_FLIP: tuple[str, ...] = ("bess_power_cmd_kw", "bess_power_actual_kw")

# 族 6：日志邻近特征名（顺序即 FEATURE_NAMES 顺序）
_LOG_ALARM_FEATURES: tuple[str, ...] = (
    "log_alarm_count_90_20",
    "log_alarm_high_severity_count_90_20",
    "log_alarm_direction_conflict_count_90_20",
    "log_operation_count_90_20",
)


def _sliding_names() -> list[str]:
    names: list[str] = []
    for column in _SLIDING_FULL:
        names.extend(f"win15_{stat}_{column}" for stat in _SLIDING_FULL_STATS)
    for column in _SLIDING_ELZ:
        names.extend(f"win15_{stat}_{column}" for stat in _SLIDING_ELZ_STATS)
    return names


#: 训练/推理一致性锚点：特征矩阵列序（adapter feature_names 以此为准）
FEATURE_NAMES: tuple[str, ...] = (
    *_FAMILY0_PASSTHROUGH,
    *_sliding_names(),
    *(f"d1_{column}" for column in _DELTA1),
    *(f"rate5_{column}" for column in _RATE5),
    *(name for name, _left, _right in _DIFF_SPECS),
    *(f"flip15_{column}" for column in _FLIP),
    *_LOG_ALARM_FEATURES,
)


# ---------------------------------------------------------------------------
# 输入解析（官方 CSV：utf-8-sig BOM、空串=缺失）
# ---------------------------------------------------------------------------
def parse_timestamp(text: str | None) -> datetime | None:
    if text is None:
        return None
    stripped = text.strip()
    if not stripped:
        return None
    try:
        return datetime.strptime(stripped, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return None


def parse_float(text: str | None) -> float | None:
    if text is None:
        return None
    stripped = text.strip()
    if not stripped:
        return None
    try:
        return float(stripped)
    except ValueError:
        return None


def read_csv_rows(path: str | Path) -> list[dict[str, str]]:
    with open(path, encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def load_log_events(
    path: str | Path,
    *,
    split: str,
    severity_column: str | None = None,
    code_column: str | None = None,
) -> tuple[list[datetime], list[tuple[bool, bool]]]:
    """读报警/操作日志，返回 (升序时间戳, (高严重度?, 方向冲突?)) 并行数组。

    split 过滤保证 train/validation 日志不串集（防跨集泄漏）。
    """
    events: list[tuple[datetime, bool, bool]] = []
    for row in read_csv_rows(path):
        if row.get("split", "").strip() != split:
            continue
        timestamp = parse_timestamp(row.get("timestamp", ""))
        if timestamp is None:
            continue
        is_high = severity_column is not None and row.get(severity_column, "").strip() == HIGH_SEVERITY_TEXT
        is_conflict = code_column is not None and row.get(code_column, "").strip() == DIRECTION_CONFLICT_ALARM_CODE
        events.append((timestamp, is_high, is_conflict))
    events.sort(key=lambda item: item[0])
    return [item[0] for item in events], [(item[1], item[2]) for item in events]


# ---------------------------------------------------------------------------
# 滑窗原语（因果窗：只含 (t-W, t] 历史样本）
# ---------------------------------------------------------------------------
class RollingColumn:
    """单列因果滑窗：维护 (时间戳, 值) 队列，供均值/极差/分位/符号翻转统计。

    缺失样本不入窗（缺失传播，不补零）。
    """

    def __init__(self, window_minutes: int) -> None:
        self._span_seconds = (window_minutes - 1) * 60
        self._entries: deque[tuple[datetime, float]] = deque()

    def push(self, timestamp: datetime, value: float | None) -> None:
        if value is None:
            return
        self._entries.append((timestamp, value))
        while self._entries and (timestamp - self._entries[0][0]).total_seconds() > self._span_seconds:
            self._entries.popleft()

    def values(self) -> list[float] | None:
        if not self._entries:
            return None
        return [value for _, value in self._entries]


def _percentile(sorted_values: Sequence[float], fraction: float) -> float:
    """线性插值分位（与 numpy 默认 'linear' 口径一致；输入须已升序）。"""
    if not sorted_values:
        raise ValueError("percentile of an empty sequence")
    if len(sorted_values) == 1:
        return sorted_values[0]
    position = fraction * (len(sorted_values) - 1)
    lower = int(position)
    upper = min(lower + 1, len(sorted_values) - 1)
    weight = position - lower
    return sorted_values[lower] * (1.0 - weight) + sorted_values[upper] * weight


def _sign_flip_count(values: Sequence[float]) -> int:
    """相邻非零样本符号变化次数（0 视为无符号，跳过不断裂序列）。"""
    flips = 0
    previous_sign = 0
    for value in values:
        sign = 0 if value == 0 else (1 if value > 0 else -1)
        if sign == 0:
            continue
        if previous_sign != 0 and sign != previous_sign:
            flips += 1
        previous_sign = sign
    return flips


class RateWindow:
    """速率窗：保留 (t-R, t] 样本，对"恰在 R 分钟前或更早的最近样本"做差商。"""

    def __init__(self, rate_minutes: int) -> None:
        self._rate_minutes = rate_minutes
        self._entries: deque[tuple[datetime, float]] = deque()

    def push_and_rate(self, timestamp: datetime, value: float | None) -> float | None:
        if value is not None:
            self._entries.append((timestamp, value))
        # 清理超出速率窗的过期样本，但保留一个最老样本供差商
        cutoff = timestamp - timedelta(minutes=self._rate_minutes)
        while len(self._entries) > 1 and self._entries[1][0] <= cutoff:
            self._entries.popleft()
        if value is None or len(self._entries) < 2 or self._entries[0][0] > cutoff:
            return None
        old_time, old_value = self._entries[0]
        minutes = (timestamp - old_time).total_seconds() / 60.0
        if minutes <= 0:
            return None
        return (value - old_value) / minutes


# ---------------------------------------------------------------------------
# 主变换：原始时序行 → 行级特征
# ---------------------------------------------------------------------------
def compute_feature_rows(
    rows: Sequence[Mapping[str, str]],
    *,
    alarm_log: tuple[Sequence[datetime], Sequence[tuple[bool, bool]]] | None = None,
    operation_log: tuple[Sequence[datetime], Sequence[tuple[bool, bool]]] | None = None,
) -> list[dict[str, float | None | str]]:
    """逐行计算 69 特征（全因果窗）。

    rows 须按 timestamp 升序；返回行结构 {"timestamp": 原串, <feature>: float|None}。
    alarm_log/operation_log 为 load_log_events 产物；缺省时族 6 特征为 None。
    """
    alarm_stamps, alarm_flags = alarm_log if alarm_log is not None else ((), ())
    operation_stamps, operation_flags = operation_log if operation_log is not None else ((), ())
    log_start_delta = timedelta(minutes=LOG_LOOKBACK_START_MINUTES)
    log_end_delta = timedelta(minutes=LOG_LOOKBACK_END_MINUTES)

    sliding = {column: RollingColumn(FEATURE_WINDOW_MINUTES) for column in _SLIDING_FULL + _SLIDING_ELZ}
    flip_windows = {column: RollingColumn(FEATURE_WINDOW_MINUTES) for column in _FLIP}
    rate_windows = {column: RateWindow(RATE_WINDOW_MINUTES) for column in _RATE5}
    delta_previous: dict[str, float | None] = {column: None for column in _DELTA1}

    output_rows: list[dict[str, float | None | str]] = []
    for row in rows:
        timestamp = parse_timestamp(row.get(TIMESTAMP_COLUMN))
        if timestamp is None:
            raise ValueError("feature rows require a parseable 'timestamp' column")

        features: dict[str, float | None | str] = {TIMESTAMP_COLUMN: row.get(TIMESTAMP_COLUMN, "").strip()}

        # 族 0 直通
        for column in _FAMILY0_PASSTHROUGH:
            features[column] = parse_float(row.get(column))

        # 族 1 滑窗统计（先推入当前行，统计含 t 时刻，窗 (t-W, t]）
        for column in _SLIDING_FULL:
            value = parse_float(row.get(column))
            sliding[column].push(timestamp, value)
            window_values = sliding[column].values()
            if window_values is None:
                for stat in _SLIDING_FULL_STATS:
                    features[f"win15_{stat}_{column}"] = None
                continue
            ordered = sorted(window_values)
            features[f"win15_mean_{column}"] = sum(ordered) / len(ordered)
            features[f"win15_range_{column}"] = ordered[-1] - ordered[0]
            features[f"win15_p10_{column}"] = _percentile(ordered, 0.10)
            features[f"win15_p90_{column}"] = _percentile(ordered, 0.90)
        for column in _SLIDING_ELZ:
            value = parse_float(row.get(column))
            sliding[column].push(timestamp, value)
            window_values = sliding[column].values()
            if window_values is None:
                for stat in _SLIDING_ELZ_STATS:
                    features[f"win15_{stat}_{column}"] = None
                continue
            ordered = sorted(window_values)
            features[f"win15_mean_{column}"] = sum(ordered) / len(ordered)
            features[f"win15_range_{column}"] = ordered[-1] - ordered[0]

        # 族 2 一阶差分（与上一有效行的差；首行无前值 → None）
        for column in _DELTA1:
            value = parse_float(row.get(column))
            previous = delta_previous[column]
            features[f"d1_{column}"] = None if value is None or previous is None else value - previous
            if value is not None:
                delta_previous[column] = value

        # 族 3 速率（R 分钟差商）
        for column in _RATE5:
            features[f"rate5_{column}"] = rate_windows[column].push_and_rate(
                timestamp, parse_float(row.get(column)),
            )

        # 族 4 裕量/跟踪误差（列−列 或 列−常数；任一侧缺失 → None）
        for name, left, right in _DIFF_SPECS:
            left_value = parse_float(row.get(left)) if isinstance(left, str) else left
            right_value = parse_float(row.get(right)) if isinstance(right, str) else right
            features[name] = (
                None if left_value is None or right_value is None else left_value - right_value
            )

        # 族 5 符号翻转
        for column in _FLIP:
            value = parse_float(row.get(column))
            flip_windows[column].push(timestamp, value)
            window_values = flip_windows[column].values()
            features[f"flip15_{column}"] = None if window_values is None else float(_sign_flip_count(window_values))

        # 族 6 日志邻近（先验窗 (t-90, t-20]，开区间远端/闭区间近端）
        window_start = timestamp - log_start_delta
        window_end = timestamp - log_end_delta
        left = bisect_right(alarm_stamps, window_start)
        right = bisect_right(alarm_stamps, window_end)
        high_count = 0
        conflict_count = 0
        for index in range(left, right):
            is_high, is_conflict = alarm_flags[index]
            high_count += int(is_high)
            conflict_count += int(is_conflict)
        operation_left = bisect_right(operation_stamps, window_start)
        operation_right = bisect_right(operation_stamps, window_end)
        features[_LOG_ALARM_FEATURES[0]] = float(right - left) if alarm_log is not None else None
        features[_LOG_ALARM_FEATURES[1]] = float(high_count) if alarm_log is not None else None
        features[_LOG_ALARM_FEATURES[2]] = float(conflict_count) if alarm_log is not None else None
        features[_LOG_ALARM_FEATURES[3]] = float(operation_right - operation_left) if operation_log is not None else None

        output_rows.append(features)
    return output_rows


# ---------------------------------------------------------------------------
# CLI（供 T09 与手工导出；只做 I/O 编排，不含特征逻辑）
# ---------------------------------------------------------------------------
def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="H2 Sentinel ML feature engineering (T08/P1-9a)")
    parser.add_argument("--timeseries", required=False, help="官方 01/02 时序 CSV 路径")
    parser.add_argument("--alarm-log", required=False, help="官方 11_alarm_log.csv 路径（缺省则族 6 报警特征为空）")
    parser.add_argument("--operation-log", required=False, help="官方 12_operation_log.csv 路径（缺省则操作计数特征为空）")
    parser.add_argument("--log-split", choices=("train", "validation"), default="train", help="日志 split 过滤")
    parser.add_argument("--output", required=False, help="特征 CSV 输出路径（缺省仅校验并打印摘要）")
    parser.add_argument("--max-rows", type=int, default=0, help="仅处理前 N 行（冒烟用，0=全量）")
    parser.add_argument("--catalog", action="store_true", help="打印特征清单 JSON 后退出")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    if args.catalog:
        print(json.dumps({"featureCount": len(FEATURE_NAMES), "featureNames": list(FEATURE_NAMES)}, ensure_ascii=False))
        return 0
    if not args.timeseries:
        parser.error("--timeseries is required unless --catalog is given")

    rows = read_csv_rows(args.timeseries)
    if args.max_rows > 0:
        rows = rows[: args.max_rows]
    alarm_log = load_log_events(
        args.alarm_log, split=args.log_split, severity_column="severity", code_column="alarm_code",
    ) if args.alarm_log else None
    operation_log = load_log_events(args.operation_log, split=args.log_split) if args.operation_log else None

    feature_rows = compute_feature_rows(rows, alarm_log=alarm_log, operation_log=operation_log)

    missing_cells = sum(
        1 for feature_row in feature_rows for name in FEATURE_NAMES if feature_row[name] is None
    )
    if args.output:
        output_path = Path(args.output)
        with output_path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.writer(handle)
            writer.writerow([TIMESTAMP_COLUMN, *FEATURE_NAMES])
            for feature_row in feature_rows:
                writer.writerow([
                    feature_row[TIMESTAMP_COLUMN],
                    *(value if value is not None else "" for value in (feature_row[name] for name in FEATURE_NAMES)),
                ])
    print(json.dumps({
        "rows": len(feature_rows),
        "featureCount": len(FEATURE_NAMES),
        "missingCells": missing_cells,
        "windowMinutes": FEATURE_WINDOW_MINUTES,
        "rateWindowMinutes": RATE_WINDOW_MINUTES,
        "logLookbackMinutes": [LOG_LOOKBACK_START_MINUTES, LOG_LOOKBACK_END_MINUTES],
        "output": args.output or None,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
