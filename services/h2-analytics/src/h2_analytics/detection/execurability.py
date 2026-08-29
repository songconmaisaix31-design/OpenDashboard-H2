"""C04/C07 可执行纠偏能力判定矩阵（T07 / A-4）。

官方判据限定词落地：C04"PCC 边界**跟踪**异常"与 C07"调节**裕度**管理异常"
都隐含"系统本可执行纠偏"的前提。本模块按行级裕量把候选分入三分支：

- SUFFICIENT_HEADROOM：任一纠偏通道有空间 → 候选成立（原置信度）；
- CONSTRAINED_HEADROOM：通道数据齐全但全部纠偏通道无空间 → 候选成立，
  建议强度降档（confidence 取 constrainedConfidence）；
- UNVERIFIABLE_DATA：通道数据缺失 → 降级"观察"，不产出候选。

纠偏通道（方向化，OR 语义）：
- C04 EXPORT（上网超限，需吸收功率）：BESS 充电通道 或 ELZ 上调通道；
- C04 IMPORT（下网超限，需送出功率）：BESS 放电通道 或 ELZ 下调通道；
- C07 CHARGE_HEADROOM（SOC 低于目标，需充电）：BESS 充电通道 或 SOC 上边界；
- C07 DISCHARGE_RESERVE（SOC 高于目标，需放电）：BESS 放电通道 或 SOC 下边界。

约束值（SOC 20-90%、BESS 500 kW、ELZ 300-1000 kW 与爬坡参考）经
``H2Constraints`` 读入，源头是 h2-vocabulary 冻结的官方控制约束表。
"""

from __future__ import annotations

from enum import Enum

from h2_analytics.models import DataRow
from h2_analytics.settings import H2Constraints

_ELZ_IDS = ("1", "2", "3")


class HeadroomGrade(Enum):
    """三分支判定结果。"""

    SUFFICIENT = "SUFFICIENT_HEADROOM"
    CONSTRAINED = "CONSTRAINED_HEADROOM"
    UNVERIFIABLE = "UNVERIFIABLE_DATA"


def _bess_charge_headroom_kw(row: DataRow) -> float | None:
    """BESS 充电通道空间（kW）：充电限额减去已在充电的占用量。"""
    actual = row.value("bess_power_actual_kw")
    limit = row.value("bess_charge_power_limit_kw")
    if actual is None or limit is None:
        return None
    return limit + min(actual, 0.0)


def _bess_discharge_headroom_kw(row: DataRow) -> float | None:
    """BESS 放电通道空间（kW）：放电限额减去已在放电的占用量。"""
    actual = row.value("bess_power_actual_kw")
    limit = row.value("bess_discharge_power_limit_kw")
    if actual is None or limit is None:
        return None
    return limit - max(actual, 0.0)


def _elz_upward_headroom_kw(
    row: DataRow,
    constraints: H2Constraints,
) -> float | None:
    """ELZ 上调通道空间（kW）：运行台中最大的上调余量（容量受限）。"""
    values = []
    for index in _ELZ_IDS:
        power = row.value(f"elz{index}_power_actual_kw")
        capacity = row.value(f"elz{index}_actual_available_capacity_kw")
        state = row.value(f"elz{index}_run_state")
        if power is None or capacity is None or state is None:
            return None
        if state < 2:
            continue
        ceiling = min(capacity, constraints.electrolyzer_max_power_kw)
        values.append(max(ceiling - power, 0.0))
    # 三台全停：无即时机动通道，空间记 0（与字段缺失的 UNVERIFIABLE 区分）。
    if not values:
        return 0.0
    return max(values)


def _elz_downward_headroom_kw(
    row: DataRow,
    constraints: H2Constraints,
) -> float | None:
    """ELZ 下调通道空间（kW）：运行台中最大的下调余量（不低于最小稳定）。"""
    values = []
    for index in _ELZ_IDS:
        power = row.value(f"elz{index}_power_actual_kw")
        state = row.value(f"elz{index}_run_state")
        if power is None or state is None:
            return None
        if state < 2:
            continue
        floor = constraints.electrolyzer_min_stable_power_kw
        values.append(max(power - floor, 0.0))
    # 三台全停：无即时机动通道，空间记 0。
    if not values:
        return 0.0
    return max(values)


def _soc_upper_headroom_pct(
    row: DataRow,
    constraints: H2Constraints,
) -> float | None:
    """SOC 上边界空间（百分点）：继续充电到运行上限的余量。"""
    soc = row.value("bess_soc_pct")
    if soc is None:
        return None
    return constraints.bess_soc_max_percent - soc


def _soc_lower_headroom_pct(
    row: DataRow,
    constraints: H2Constraints,
) -> float | None:
    """SOC 下边界空间（百分点）：继续放电到运行下限的余量。"""
    soc = row.value("bess_soc_pct")
    if soc is None:
        return None
    return soc - constraints.bess_soc_min_percent


def _grade(
    channels: tuple[float | None, ...],
    floors: tuple[float, ...],
) -> HeadroomGrade:
    """按 OR 语义归并通道。

    单通道数据缺失时忽略该通道、用剩余通道判定（保守保留候选）；
    全部通道数据缺失 → UNVERIFIABLE（降"观察"）；任一达标 → SUFFICIENT；
    数据齐全但全部低于下限 → CONSTRAINED。
    """
    available = [
        (channel, floor)
        for channel, floor in zip(channels, floors, strict=True)
        if channel is not None
    ]
    if not available:
        return HeadroomGrade.UNVERIFIABLE
    if any(channel >= floor for channel, floor in available):
        return HeadroomGrade.SUFFICIENT
    return HeadroomGrade.CONSTRAINED


def c04_headroom_grade(
    row: DataRow,
    subtype: str,
    constraints: H2Constraints,
    *,
    bess_floor_kw: float,
    elz_floor_kw: float,
) -> HeadroomGrade:
    """C04 候选行的可执行性三分支判定。"""
    if subtype == "EXPORT_POWER_LIMIT_NOT_TRACKED":
        return _grade(
            (
                _bess_charge_headroom_kw(row),
                _elz_upward_headroom_kw(row, constraints),
            ),
            (bess_floor_kw, elz_floor_kw),
        )
    return _grade(
        (
            _bess_discharge_headroom_kw(row),
            _elz_downward_headroom_kw(row, constraints),
        ),
        (bess_floor_kw, elz_floor_kw),
    )


def c07_headroom_grade(
    row: DataRow,
    subtype: str,
    constraints: H2Constraints,
    *,
    bess_floor_kw: float,
    soc_floor_pct: float,
) -> HeadroomGrade:
    """C07 候选行的可执行性三分支判定。"""
    if subtype == "CHARGE_HEADROOM_SHORTFALL":
        return _grade(
            (
                _bess_charge_headroom_kw(row),
                _soc_upper_headroom_pct(row, constraints),
            ),
            (bess_floor_kw, soc_floor_pct),
        )
    return _grade(
        (
            _bess_discharge_headroom_kw(row),
            _soc_lower_headroom_pct(row, constraints),
        ),
        (bess_floor_kw, soc_floor_pct),
    )
