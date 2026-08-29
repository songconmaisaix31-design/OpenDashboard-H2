from __future__ import annotations

from datetime import datetime, timedelta

from h2_analytics import vocabulary
from h2_analytics.models import DataRow

from .base import DetectionCandidate

_ELZ_POWER_ACTUAL = tuple(
    f"elz{index}_power_actual_kw" for index in ("1", "2", "3")
)


def _threshold(name: str) -> float:
    value = vocabulary.detection_thresholds()["classes"]["C03"][name]
    if not isinstance(value, (int, float)):
        raise vocabulary.VocabularyError(
            f"Detection threshold C03.{name} must be numeric."
        )
    return float(value)


_ACTUAL_TRACKING_TOLERANCE_KW = _threshold("actualTrackingToleranceKw")
_CAUSAL_CONFIRMATION_ROWS = int(_threshold("causalConfirmationRows"))
_SAMPLING_INTERVAL_MINUTES = _threshold("samplingIntervalMinutes")
# T04 去签名带（ADR-003 三级鲁棒判据）：绝对值带 400±1kW 替换为
# "相对限额带 + 段内恒功率平台 + 因果门保留" 的组合判据。
_RELATIVE_BAND_LOW_RATIO = _threshold("relativeBandLowRatio")
_RELATIVE_BAND_HIGH_RATIO = _threshold("relativeBandHighRatio")
_PLATEAU_TOLERANCE_KW = _threshold("plateauToleranceKw")


def c03_causal_row_keys(
    rows: tuple[DataRow, ...],
) -> frozenset[tuple[int, datetime]]:
    """Return rows authorized by the frozen public C03 causal gate."""
    segments: list[list[DataRow]] = []
    current: list[DataRow] = []
    expected_interval = timedelta(minutes=_SAMPLING_INTERVAL_MINUTES)

    for row in rows:
        if not _is_public_signature_row(row):
            if current:
                segments.append(current)
                current = []
            continue
        if (
            current
            and row.timestamp is not None
            and current[-1].timestamp is not None
            and row.timestamp - current[-1].timestamp != expected_interval
        ):
            segments.append(current)
            current = []
        current.append(row)
    if current:
        segments.append(current)

    accepted: set[tuple[int, datetime]] = set()
    for segment in segments:
        if len(segment) < _CAUSAL_CONFIRMATION_ROWS:
            continue
        # 二级判据：段内恒功率平台——C03 事件的异常指令是恒定功率平台
        # （TRAIN 全部 40 事件极差为 0），正常调节行（C01 等场景的分钟级
        # 大幅波动）即使落入相对带也被平台门排除。
        commands = [
            abs(command)
            for command in (
                row.value("bess_power_cmd_kw") for row in segment
            )
            if command is not None
        ]
        if max(commands) - min(commands) > _PLATEAU_TOLERANCE_KW:
            continue
        if not any(
            _command_opposes_control_need(row)
            for row in segment[:_CAUSAL_CONFIRMATION_ROWS]
        ):
            continue
        accepted.update(
            (row.index, row.timestamp)
            for row in segment
            if row.timestamp is not None
        )
    return frozenset(accepted)


def filter_c03_candidates(
    *,
    rows: tuple[DataRow, ...],
    candidates: tuple[DetectionCandidate, ...],
) -> tuple[DetectionCandidate, ...]:
    """Fail closed on C03 proposals that lack the shared causal evidence."""
    accepted = c03_causal_row_keys(rows)
    return tuple(
        candidate
        for candidate in candidates
        if candidate.code != "C03"
        or (
            candidate.subtype == "BESS_DIRECTION_REVERSED"
            and (candidate.row_index, candidate.timestamp) in accepted
        )
    )


def _is_public_signature_row(row: DataRow) -> bool:
    """一级+三级判据：相对限额带内、实际跟踪、PCC 方向一致的候选签名行。

    T04 起，绝对值带（400kW±1kW）由"相对当行充/放限额的功率带"替代：
    事件签名位落在限额的 0.75-0.85 区间，正常晚高峰恒功率平台（0.9×限额）
    与 N03 合理工况（<0.6×限额）天然落在带外。
    """
    if row.timestamp is None:
        return False
    command = row.value("bess_power_cmd_kw")
    actual = row.value("bess_power_actual_kw")
    pcc = row.value("pcc_power_actual_kw")
    if command is None or actual is None or pcc is None or command == 0:
        return False
    limit = (
        row.value("bess_discharge_power_limit_kw")
        if command > 0
        else row.value("bess_charge_power_limit_kw")
    )
    if limit is None or limit <= 0:
        # 限额缺失时无法形成相对带，保守放弃该行（fail closed）。
        return False
    magnitude = abs(command)
    return (
        _RELATIVE_BAND_LOW_RATIO * limit
        <= magnitude
        <= _RELATIVE_BAND_HIGH_RATIO * limit
        and abs(actual - command) <= _ACTUAL_TRACKING_TOLERANCE_KW
        and command * pcc > 0
    )


def _command_opposes_control_need(row: DataRow) -> bool:
    command = row.value("bess_power_cmd_kw")
    electrolyzer_powers = [row.value(field) for field in _ELZ_POWER_ACTUAL]
    auxiliary_load = row.value("aux_load_kw")
    pv_power = row.value("pv_actual_kw")
    soc = row.value("bess_soc_pct")
    soc_target = row.value("soc_target_pct")
    if command is None:
        return False
    power_gap_conflict = False
    if (
        auxiliary_load is not None
        and pv_power is not None
        and all(power is not None for power in electrolyzer_powers)
    ):
        load_minus_pv = (
            sum(power for power in electrolyzer_powers if power is not None)
            + auxiliary_load
            - pv_power
        )
        power_gap_conflict = command * load_minus_pv < 0
    soc_conflict = (
        soc is not None
        and soc_target is not None
        and command * (soc - soc_target) < 0
    )
    return power_gap_conflict or soc_conflict
