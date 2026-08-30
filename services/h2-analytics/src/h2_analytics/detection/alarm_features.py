"""报警弱特征（plan0830 A-P0-2）。

官方报警日志（11 号文件，2,460 条：train 1540 / val 405 / test 515）19 码两簇：
噪声簇 5（全 CLEARED，与 C 码无镜像关系，显式排除）；关联簇 14（全 ACTIVE，
与 C01-C07 近一一镜像）。关联码信号降级为**弱特征**：仅做已触发事件的
置信度增强（会话2 再做子类消歧），绝不作为触发或计数判据。

共现核实结论（2026-08-30，``tools/verify_alarm_cooccurrence.py``，
350 标签事件起点 ±10min 窗，train+val 每类 50）：
- 呈严格一对一共现：每个 C 码在起点窗内只与唯一关联码共现，反之亦然；
- 实测强共现映射（覆盖率）：C01←EMS_SETPOINT_OSC 8%｜C02←ELZ_POWER_DEVIATION
  22%｜C03←BESS_DIRECTION_CONFLICT 16%｜C04←PCC_POWER_LIMIT_EXCEED 10%｜
  C05←GRID_ENERGY_QUOTA_RISK 8%｜C06←ELZ_ALLOCATION_EFF_LOW 14%｜
  C07←BESS_RESERVE_SHORTFALL 4%；
- 任务卡假设表据此修正：C02 的关联码由 CAPACITY_SYNC_WARN 改判
  ELZ_POWER_DEVIATION（前者起点窗零共现）；C04/C05/C06/C07 的多码假设
  收敛为上述唯一码；
- 其余 7 个关联码（GRID_ENERGY_QUOTA_EXCEED / CAPACITY_SYNC_WARN /
  ELZ_AVOIDABLE_START / PCC_DEVIATION / BESS_REGULATION_HIGH /
  SOC_TRAJECTORY_DEVIATION / DISPATCH_LIMIT_NOT_TRACKED）起点窗与任何
  C 码零共现，保留在关联簇常量但不进置信映射。
- 会话2 全程窗再核（同脚本 mode=full，窗=[start,end]）：7 码全部确认为
  事件后段信号，且与 C 码严格一对一配对（覆盖率）——C01←BESS_REGULATION_HIGH
  60%｜C02←CAPACITY_SYNC_WARN 84%｜C03←PCC_DEVIATION 64%｜C04←
  DISPATCH_LIMIT_NOT_TRACKED 58%｜C05←GRID_ENERGY_QUOTA_EXCEED 76%｜
  C06←ELZ_AVOIDABLE_START 68%｜C07←SOC_TRAJECTORY_DEVIATION 60%；
  每类形成「起点窗主码 + 后段副码」双码结构（副码备用，不进当前映射）。
- 会话2 子类消歧结论（**数据否证，不接线**）：报警 message 为每码固定
  文案、无方向字段；C04/C05 关联码在 IMPORT/EXPORT 两子类上的全程窗
  覆盖率几乎对称（如 PCC_POWER_LIMIT_EXCEED 两子类均 88%），无子类
  判别力。val 实测子类一致率 67/69（C05 10/10、C04 8/10），两条不一致
  （VA0034/VA0040）均出自 rules.py C04 fallback 方向分支：violation 列
  全窗恒 0，PCC 表计方向为正而 bess_power_cmd=-450（标签 IMPORT 按 BESS
  指令方向）——时序证据本身两可且报警不可修正。详见
  plan0830/A/SUBTYPE_CONSISTENCY_REPORT.md。

设计约束（红线）：
1. 仅当环境变量 ``H2_ALARM_LOG_PATH`` 指向官方 11 号文件时激活（惰性加载、
   进程内单例）；未设置时行为与基线一致（回归安全）。
2. ``codes_near`` 返回**码集合**（无计数语义）；输出只被 confidence 消费，
   触发路径零引用（红线 §7.3-6：不凭报警计数判异常）。
3. 置信上调只在事件已确认后施加：无码不罚、有码小幅上调、设上限。

参数（匹配窗、上调幅度、上限）暂为本模块代码常量；与 oplogPrior 同因
（CR-B1：v5 字面锁阻塞版本递增），v6 收口时一并迁入
``detection-thresholds.json`` 的 ``alarmFeatures`` 段。
"""

from __future__ import annotations

import csv
import os
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

# --- 数据事实常量（2026-08-30 对 11 号文件 2,460 条全量核实） -----------------

# 噪声簇 5：与 C 码无镜像关系（status 全 CLEARED；条数占七成），显式排除。
NOISE_CODES = frozenset(
    {
        "COMM_PACKET_LOSS_LOW",
        "FORECAST_REFRESH_DELAY",
        "DATA_DELAY_WARN",
        "METER_QUALITY_WARN",
        "AUX_TEMP_WARN",
    }
)

# 关联簇 14：C01-C07 近一一镜像（status 全 ACTIVE），本模块对象。
RELATED_CODES = frozenset(
    {
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
    }
)

# 置信增强映射：C 码 → 起点窗内实测唯一强共现关联码（见模块 docstring）。
START_WINDOW_ASSOCIATIONS: dict[str, str] = {
    "C01": "EMS_SETPOINT_OSC",
    "C02": "ELZ_POWER_DEVIATION",
    "C03": "BESS_DIRECTION_CONFLICT",
    "C04": "PCC_POWER_LIMIT_EXCEED",
    "C05": "GRID_ENERGY_QUOTA_RISK",
    "C06": "ELZ_ALLOCATION_EFF_LOW",
    "C07": "BESS_RESERVE_SHORTFALL",
}

# 匹配窗：与共现核实口径一致（事件起点 ±10 分钟，含端点）。
MATCH_WINDOW_MINUTES = 10

# 置信上调幅度与上限：小幅增强（弱特征语义），无码不罚。
CONFIDENCE_BOOST = 0.02
CONFIDENCE_CAP = 0.99


@dataclass(frozen=True, slots=True)
class AlarmEntry:
    """一条关联簇报警（11 号文件）。"""

    timestamp: datetime
    alarm_code: str


class AlarmFeatureIndex:
    """按时间排序的关联码报警索引；提供窗口查询（集合语义，无计数）。"""

    def __init__(self, entries: tuple[AlarmEntry, ...]) -> None:
        self._entries = tuple(sorted(entries, key=lambda item: item.timestamp))

    @property
    def entries(self) -> tuple[AlarmEntry, ...]:
        return self._entries

    def codes_near(
        self,
        timestamp: datetime,
        *,
        window_minutes: int = MATCH_WINDOW_MINUTES,
    ) -> frozenset[str]:
        """返回 [timestamp-窗口, timestamp+窗口] 内出现的关联码集合。"""
        window = timedelta(minutes=window_minutes)
        hits = {
            entry.alarm_code
            for entry in self._entries
            if timestamp - window <= entry.timestamp <= timestamp + window
        }
        return frozenset(hits)

    def matches(self, code: str, timestamp: datetime) -> bool:
        """该 C 码的实测强共现关联码是否出现在事件起点窗内。"""
        associated = START_WINDOW_ASSOCIATIONS.get(code)
        if associated is None:
            return False
        return associated in self.codes_near(timestamp)


def parse_alarm_log(text: str) -> tuple[AlarmEntry, ...]:
    """解析 11 号文件内容；仅保留关联簇 14 码（噪声簇显式跳过）。"""
    entries: list[AlarmEntry] = []
    for row in csv.DictReader(text.splitlines()):
        alarm_code = (row.get("alarm_code") or "").strip()
        if alarm_code not in RELATED_CODES:
            continue
        timestamp_raw = (row.get("timestamp") or "").strip()
        try:
            timestamp = datetime.fromisoformat(timestamp_raw)
        except ValueError:
            continue
        # 11 号时间戳为 naive 分钟级（YYYY-MM-DD HH:MM）；服务管线为 aware，
        # naive 视为 UTC——与 oplog_prior.parse_operation_log 同口径。
        if timestamp.tzinfo is None:
            timestamp = timestamp.replace(tzinfo=UTC)
        entries.append(AlarmEntry(timestamp=timestamp, alarm_code=alarm_code))
    return tuple(entries)


def build_alarm_index(path: str) -> AlarmFeatureIndex:
    """从官方 11 号文件路径构建弱特征索引。"""
    with open(path, encoding="utf-8-sig", newline="") as handle:
        return AlarmFeatureIndex(parse_alarm_log(handle.read()))


# --- 进程内单例（未注入环境变量时保持 None = 基线行为） ---------------------

_ENV_VAR = "H2_ALARM_LOG_PATH"
_loaded: AlarmFeatureIndex | None = None
_load_attempted = False


def load_alarm_features() -> AlarmFeatureIndex | None:
    """惰性加载报警弱特征；环境变量未设置时返回 None（回归安全）。"""
    global _loaded, _load_attempted
    if _load_attempted:
        return _loaded
    _load_attempted = True
    path = os.environ.get(_ENV_VAR, "").strip()
    if not path:
        return None
    _loaded = build_alarm_index(path)
    return _loaded
