"""操作日志触发先验（plan0830 A-P0-1）。

官方操作日志（12 号文件，77 条：train 50 / val 11 / test 16）的 5 类操作
与异常码一一映射。train+val 的 61 条操作全部精确对应其后最近的同码事件
（间隔恒定：调度约束更新→C04 为 5 分钟、参数变更→C01 为 15 分钟、接口映射
变更→C03 为 20 分钟、SOC计划变更→C07 与 电量配额更新→C05 均为 60 分钟；
61/61 无一落空，test 分区 16 条为盲测独立线索）。

设计约束（红线）：
1. 先验**只在窗口内加权**——本模块当前仅支持聚合确认行提前（只影响
   first_detection_time 时效，不改变事件集合），绝不单独触发事件。
2. 仅当环境变量 ``H2_OPERATION_LOG_PATH`` 指向官方 12 号文件时激活
   （惰性加载、进程内单例）；未设置时检测行为与 v5 逐字节一致。
3. 映射表是「操作类型 → C 码」的通则，禁止按时间戳/事件 ID 特判。
4. 检测输入不含公共标签文件；操作日志（12 号）是运维事件流，非标签。

参数（窗口分钟、确认行放宽量）暂为本模块代码常量；v6 版本收口时迁入
``detection-thresholds.json`` 的 ``oplogPrior`` 段（版本递增涉及
vocabulary.py / settings.py 的 v5 校验锁，其所有权在 A 线之外，已按
CONTRACTS §7 登记变更请求）。
"""

from __future__ import annotations

import csv
import os
from dataclasses import dataclass
from datetime import datetime, timedelta

# --- 数据事实常量（2026-08-30 对 12 号文件 77 条全量核实） -----------------

# 5 类操作 → C 码通则映射（键为 12 号文件 operation_type 的精确字符串）。
OPERATION_TO_CODE: dict[str, str] = {
    "接口映射变更": "C03",
    "SOC计划变更": "C07",
    "电量配额更新": "C05",
    "调度约束更新": "C04",
    "参数变更": "C01",
}

# 先验窗：操作时刻起 N 分钟内，同码事件享受先验加权。通则保守值——
# 覆盖最长观测间隔（60min）加事件持续期，不按各类精确间隔特调。
PRIOR_WINDOW_MINUTES = 120

# 先验窗内聚合确认行放宽量：confirmationRow 减去该值（下限 1）。
# 只提前 first_detection_time（时效），不改变事件集合（零误报结构风险）。
CONFIRMATION_RELIEF_ROWS = 1


@dataclass(frozen=True, slots=True)
class OperationLogEntry:
    """一条官方操作日志（12 号文件）记录。"""

    timestamp: datetime
    operation_type: str
    parameter: str
    change: str
    remark: str
    split: str


class OperationPriorIndex:
    """按 C 码索引的操作先验；提供窗口匹配查询。"""

    def __init__(self, entries: tuple[OperationLogEntry, ...]) -> None:
        by_code: dict[str, list[OperationLogEntry]] = {}
        for entry in entries:
            by_code.setdefault(OPERATION_TO_CODE[entry.operation_type], []).append(
                entry
            )
        self._by_code = {
            code: tuple(sorted(values, key=lambda item: item.timestamp))
            for code, values in by_code.items()
        }

    @property
    def entries(self) -> tuple[OperationLogEntry, ...]:
        return tuple(entry for values in self._by_code.values() for entry in values)

    def match(
        self,
        code: str,
        timestamp: datetime,
        *,
        window_minutes: int = PRIOR_WINDOW_MINUTES,
    ) -> tuple[OperationLogEntry, ...]:
        """返回 [操作时刻, 操作时刻+窗口] 覆盖 timestamp 的同码操作条目。"""
        window = timedelta(minutes=window_minutes)
        hits = []
        for entry in self._by_code.get(code, ()):
            if entry.timestamp <= timestamp <= entry.timestamp + window:
                hits.append(entry)
        return tuple(hits)


def parse_operation_log(text: str) -> tuple[OperationLogEntry, ...]:
    """解析 12 号文件内容；映射表外的操作类型跳过（前向兼容）。"""
    entries: list[OperationLogEntry] = []
    for row in csv.DictReader(text.splitlines()):
        operation_type = (row.get("operation_type") or "").strip()
        if operation_type not in OPERATION_TO_CODE:
            continue
        timestamp_raw = (row.get("timestamp") or "").strip()
        try:
            timestamp = datetime.fromisoformat(timestamp_raw)
        except ValueError:
            continue
        entries.append(
            OperationLogEntry(
                timestamp=timestamp,
                operation_type=operation_type,
                parameter=(row.get("parameter") or "").strip(),
                change=(row.get("change") or "").strip(),
                remark=(row.get("remark") or "").strip(),
                split=(row.get("split") or "").strip(),
            )
        )
    return tuple(entries)


def build_prior_index(path: str) -> OperationPriorIndex:
    """从官方 12 号文件路径构建先验索引。"""
    with open(path, encoding="utf-8-sig", newline="") as handle:
        return OperationPriorIndex(parse_operation_log(handle.read()))


# --- 进程内单例（未注入环境变量时保持 None = v5 行为） ---------------------

_ENV_VAR = "H2_OPERATION_LOG_PATH"
_loaded: OperationPriorIndex | None = None
_load_attempted = False


def load_operation_priors() -> OperationPriorIndex | None:
    """惰性加载操作先验；环境变量未设置时返回 None（回归安全）。"""
    global _loaded, _load_attempted
    if _load_attempted:
        return _loaded
    _load_attempted = True
    path = os.environ.get(_ENV_VAR, "").strip()
    if not path:
        return None
    _loaded = build_prior_index(path)
    return _loaded
