"""P1-9c ML 校验层（T11 / A-5 步骤 4；ADR-001 灰度混合）。

``H2_ML_ENABLED`` 开启时在规则候选之上叠加 LightGBM 行级补充候选：

- 规则为主：规则候选**原样保留**，ML 不改写、不降档、不删除；
- ML 只补充：三 seed 概率平均后 argmax 类非 NORMAL、置信度不低于
  ``_MIN_SUPPLEMENT_CONFIDENCE``、且该行未被规则以同 (code, subtype)
  覆盖时，才产出补充候选（detector_version = h2-ml-row-lgbm-v1）。

特征口径与 ``tools/features.py``（A2 领土，单一事实源）逐值一致：本模块
复刻其族 0-5 的运行时桥接（族 6 日志邻近特征运行时无日志输入、恒为缺失，
registry 消融已证日志特征族非判别主力）；一致性由单测对齐两实现拦截漂移。

缺失口径与训练一致（``tools/train_lightgbm.py``）：None -> NaN，
LightGBM 原生缺失处理；矩阵以 ndarray 供给（lightgbm 4.x 拒 list）。

模型产物按 IF-A2→A1 契约只读消费：``models/``（gitignored）下三 seed
文件，SHA256 与 MODELS_REGISTRY 摘录值比对（下方 ``_MODEL_SHA256``）。
"""

from __future__ import annotations

import hashlib
import math
from collections import deque
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from h2_analytics.models import DataRow

from .base import DetectionCandidate

# ---------------------------------------------------------------------------
# 契约常量（来源 = MODELS_REGISTRY.md h2-lgbm-row-v1 条目，A2 领土交付）
# ---------------------------------------------------------------------------
#: ML 类目与 LightGBM label 编码（= tools/train_lightgbm.py ML_CLASSES）
ML_CLASSES: tuple[str, ...] = ("NORMAL", "C03", "C04", "C05", "C07")
#: 模型命名空间（registry detector_version 建议值，区别于规则检测器 v4）
ML_DETECTOR_VERSION = "h2-ml-row-lgbm-v1"
#: 三 seed 模型文件 -> SHA256（摘录自 MODELS_REGISTRY.md；篡改/漂移即拒载）
_MODEL_SHA256: dict[str, str] = {
    "h2-lgbm-row-v1-seed1.txt": (
        "0d3bca24f7d42fe2d11384b47513d5617bb315e4976560d27c7db654d6521cdd"
    ),
    "h2-lgbm-row-v1-seed2.txt": (
        "68ed13572ba4fe0686a60258d7dec24e4442c205e1dc005a98dd1e59510f2427"
    ),
    "h2-lgbm-row-v1-seed3.txt": (
        "e70b86ca36453b00000e0287ecd673e89513c5091a9142e185721512f4b33f66"
    ),
}
#: 补充候选最低置信度（三 seed 平均概率；灰度保守门槛）
_MIN_SUPPLEMENT_CONFIDENCE = 0.9

# ---------------------------------------------------------------------------
# 特征口径（= tools/features.py 族配置；一致性单测锚定两处同步）
# ---------------------------------------------------------------------------
FEATURE_WINDOW_MINUTES = 15
RATE_WINDOW_MINUTES = 5

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
_SLIDING_FULL: tuple[str, ...] = (
    "bess_power_cmd_kw",
    "bess_power_actual_kw",
    "pcc_power_actual_kw",
    "ems_power_balance_error_kw",
    "bess_soc_pct",
    "bus_frequency_hz",
)
_SLIDING_ELZ: tuple[str, ...] = (
    "elz1_power_cmd_kw",
    "elz2_power_cmd_kw",
    "elz3_power_cmd_kw",
)
_SLIDING_FULL_STATS = ("mean", "range", "p10", "p90")
_SLIDING_ELZ_STATS = ("mean", "range")
_DELTA1: tuple[str, ...] = (
    "bess_soc_pct",
    "bess_power_actual_kw",
    "pcc_power_actual_kw",
    "bus_frequency_hz",
    "ems_power_balance_error_kw",
    "bess_power_cmd_kw",
)
_RATE5: tuple[str, ...] = (
    "grid_export_energy_remaining_kwh",
    "grid_import_energy_remaining_kwh",
    "bess_available_charge_energy_kwh",
    "bess_available_discharge_energy_kwh",
    "bess_soc_pct",
    "ems_power_balance_error_kw",
)
_DIFF_SPECS: tuple[tuple[str, str | float, str | float], ...] = (
    ("margin_bess_charge_reserve_kwh", "bess_available_charge_energy_kwh", "bess_regulation_reserve_target_kwh"),
    ("margin_bess_discharge_reserve_kwh", "bess_available_discharge_energy_kwh", "bess_regulation_reserve_target_kwh"),
    ("margin_bess_soc_low_pct", "bess_soc_pct", 20.0),
    ("margin_bess_soc_high_pct", 90.0, "bess_soc_pct"),
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
_FLIP: tuple[str, ...] = ("bess_power_cmd_kw", "bess_power_actual_kw")
_LOG_ALARM_FEATURES: tuple[str, ...] = (
    "log_alarm_count_90_20",
    "log_alarm_high_severity_count_90_20",
    "log_alarm_direction_conflict_count_90_20",
    "log_operation_count_90_20",
)


def runtime_feature_names() -> tuple[str, ...]:
    """运行时特征清单（列序 = 训练 FEATURE_NAMES；族 6 在尾部恒缺失）。"""

    def sliding_names() -> list[str]:
        names: list[str] = []
        for column in _SLIDING_FULL:
            names.extend(
                f"win15_{stat}_{column}" for stat in _SLIDING_FULL_STATS
            )
        for column in _SLIDING_ELZ:
            names.extend(
                f"win15_{stat}_{column}" for stat in _SLIDING_ELZ_STATS
            )
        return names

    return (
        *_FAMILY0_PASSTHROUGH,
        *sliding_names(),
        *(f"d1_{column}" for column in _DELTA1),
        *(f"rate5_{column}" for column in _RATE5),
        *(name for name, _left, _right in _DIFF_SPECS),
        *(f"flip15_{column}" for column in _FLIP),
        *_LOG_ALARM_FEATURES,
    )


# ---------------------------------------------------------------------------
# 滑窗原语（因果窗：只含 (t-W, t] 历史样本；缺失不入窗、缺失传播）
# ---------------------------------------------------------------------------
class _RollingColumn:
    def __init__(self, window_minutes: int) -> None:
        self._span_seconds = (window_minutes - 1) * 60
        self._entries: deque[tuple[datetime, float]] = deque()

    def push(self, timestamp: datetime, value: float | None) -> None:
        if value is None:
            return
        self._entries.append((timestamp, value))
        while self._entries and (
            timestamp - self._entries[0][0]
        ).total_seconds() > self._span_seconds:
            self._entries.popleft()

    def values(self) -> list[float] | None:
        if not self._entries:
            return None
        return [value for _, value in self._entries]


def _percentile(sorted_values: list[float], fraction: float) -> float:
    if len(sorted_values) == 1:
        return sorted_values[0]
    position = fraction * (len(sorted_values) - 1)
    lower = int(position)
    upper = min(lower + 1, len(sorted_values) - 1)
    weight = position - lower
    return sorted_values[lower] * (1.0 - weight) + sorted_values[upper] * weight


def _sign_flip_count(values: list[float]) -> int:
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


class _RateWindow:
    def __init__(self, rate_minutes: int) -> None:
        self._rate_minutes = rate_minutes
        self._entries: deque[tuple[datetime, float]] = deque()

    def push_and_rate(self, timestamp: datetime, value: float | None) -> float | None:
        if value is not None:
            self._entries.append((timestamp, value))
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
# 运行时特征桥接：DataRow 元组 -> 特征行（族 0-5；族 6 恒 None）
# ---------------------------------------------------------------------------
def runtime_feature_rows(
    rows: tuple[DataRow, ...],
) -> list[dict[str, float | None]]:
    """逐行计算运行时特征（须按 timestamp 升序，同训练口径含 t 时刻）。"""
    sliding = {
        column: _RollingColumn(FEATURE_WINDOW_MINUTES)
        for column in _SLIDING_FULL + _SLIDING_ELZ
    }
    flip_windows = {
        column: _RollingColumn(FEATURE_WINDOW_MINUTES) for column in _FLIP
    }
    rate_windows = {
        column: _RateWindow(RATE_WINDOW_MINUTES) for column in _RATE5
    }
    delta_previous: dict[str, float | None] = {
        column: None for column in _DELTA1
    }

    output: list[dict[str, float | None]] = []
    for row in rows:
        if row.timestamp is None:
            continue
        timestamp = row.timestamp
        features: dict[str, float | None] = {}

        for column in _FAMILY0_PASSTHROUGH:
            features[column] = row.value(column)

        for column in _SLIDING_FULL:
            sliding[column].push(timestamp, row.value(column))
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
            sliding[column].push(timestamp, row.value(column))
            window_values = sliding[column].values()
            if window_values is None:
                for stat in _SLIDING_ELZ_STATS:
                    features[f"win15_{stat}_{column}"] = None
                continue
            ordered = sorted(window_values)
            features[f"win15_mean_{column}"] = sum(ordered) / len(ordered)
            features[f"win15_range_{column}"] = ordered[-1] - ordered[0]

        for column in _DELTA1:
            value = row.value(column)
            previous = delta_previous[column]
            features[f"d1_{column}"] = (
                None if value is None or previous is None else value - previous
            )
            if value is not None:
                delta_previous[column] = value

        for column in _RATE5:
            features[f"rate5_{column}"] = rate_windows[column].push_and_rate(
                timestamp, row.value(column)
            )

        for name, left, right in _DIFF_SPECS:
            left_value = row.value(left) if isinstance(left, str) else left
            right_value = row.value(right) if isinstance(right, str) else right
            features[name] = (
                None
                if left_value is None or right_value is None
                else left_value - right_value
            )

        for column in _FLIP:
            flip_windows[column].push(timestamp, row.value(column))
            window_values = flip_windows[column].values()
            features[f"flip15_{column}"] = (
                None
                if window_values is None
                else float(_sign_flip_count(window_values))
            )

        # 族 6 日志邻近：运行时检测管线无日志输入，恒缺失（NaN 口径）。
        for name in _LOG_ALARM_FEATURES:
            features[name] = None

        output.append(features)
    return output


# ---------------------------------------------------------------------------
# ML 类目 -> subtype 的行级方向语义（与规则判据同口径）
# ---------------------------------------------------------------------------
def _subtype_for(code: str, row: DataRow) -> str | None:
    """按行数据给 ML 类目定 subtype（方向语义锚定规则判据）。"""
    if code == "C03":
        return "BESS_DIRECTION_REVERSED"
    if code == "C04":
        pcc_actual = row.value("pcc_power_actual_kw")
        if pcc_actual is None:
            return None
        return (
            "IMPORT_POWER_LIMIT_NOT_TRACKED"
            if pcc_actual < 0
            else "EXPORT_POWER_LIMIT_NOT_TRACKED"
        )
    if code == "C05":
        export_used = row.value("grid_export_energy_used_kwh_day")
        export_quota = row.value("grid_export_energy_quota_kwh_day")
        import_used = row.value("grid_import_energy_used_kwh_day")
        import_quota = row.value("grid_import_energy_quota_kwh_day")
        if (
            export_used is None
            or export_quota is None
            or import_used is None
            or import_quota is None
        ):
            return None
        export_margin = export_quota - export_used
        import_margin = import_quota - import_used
        return (
            "EXPORT_ENERGY_QUOTA_RISK"
            if export_margin <= import_margin
            else "IMPORT_ENERGY_QUOTA_RISK"
        )
    if code == "C07":
        soc = row.value("bess_soc_pct")
        target = row.value("soc_target_pct")
        if soc is None or target is None:
            return None
        return (
            "CHARGE_HEADROOM_SHORTFALL"
            if soc - target < 0
            else "DISCHARGE_RESERVE_SHORTFALL"
        )
    return None


# ---------------------------------------------------------------------------
# 模型目录定位与校验
# ---------------------------------------------------------------------------
def _default_models_dir() -> Path | None:
    """从本模块向上定位含 seed 模型文件的 models/ 目录（gitignored 产物）。"""
    current = Path(__file__).resolve().parent
    for _ in range(14):
        candidate = current / "models"
        if candidate.is_dir() and any(candidate.glob("h2-lgbm-row-v1-seed*.txt")):
            return candidate
        if current.parent == current:
            break
        current = current.parent
    return None


def _load_boosters(models_dir: Path | None) -> list[Any]:
    """加载三 seed booster 并校验 SHA256（与 MODELS_REGISTRY 摘录值比对）。"""
    import lightgbm  # 延迟导入：off 路径零依赖

    directory = models_dir or _default_models_dir()
    if directory is None:
        raise RuntimeError(
            "ML verification layer requires the models/ artifacts "
            "(h2-lgbm-row-v1-seed*.txt) from MODELS_REGISTRY."
        )
    boosters: list[Any] = []
    for filename, expected in _MODEL_SHA256.items():
        path = directory / filename
        if not path.is_file():
            raise RuntimeError(f"Model artifact is missing: {path}")
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != expected:
            raise RuntimeError(
                f"Model artifact SHA256 mismatch for {filename}: "
                f"expected {expected}, got {digest}."
            )
        boosters.append(lightgbm.Booster(model_file=str(path)))
    return boosters


# ---------------------------------------------------------------------------
# 校验层：规则候选之上的补充候选
# ---------------------------------------------------------------------------
def ml_supplemental_candidates(
    rows: tuple[DataRow, ...],
    rule_candidates: tuple[DetectionCandidate, ...],
    *,
    models_dir: Path | None = None,
    minimum_confidence: float = _MIN_SUPPLEMENT_CONFIDENCE,
) -> tuple[DetectionCandidate, ...]:
    """三 seed 平均概率下的行级补充候选（规则候选之外，不重叠不干扰）。

    仅当 H2_ML_ENABLED（service 层门控）时被调用；本函数自身不做开关判断。
    """
    import numpy

    boosters = _load_boosters(models_dir)
    feature_rows = runtime_feature_rows(rows)
    names = runtime_feature_names()
    matrix: list[list[float]] = []
    for features in feature_rows:
        row_values: list[float] = []
        for name in names:
            value = features.get(name)
            row_values.append(float(value) if value is not None else math.nan)
        matrix.append(row_values)
    if not matrix:
        return ()

    data = numpy.asarray(matrix, dtype=float)
    averaged = None
    for booster in boosters:
        probabilities = numpy.asarray(booster.predict(data), dtype=float)
        averaged = (
            probabilities if averaged is None else averaged + probabilities
        )
    assert averaged is not None
    averaged /= len(boosters)

    rule_keys = {
        (candidate.row_index, candidate.code, candidate.subtype)
        for candidate in rule_candidates
    }
    supplemental: list[DetectionCandidate] = []
    for row, scores in zip(rows, averaged, strict=False):
        if row.timestamp is None or not len(scores):
            continue
        class_index = int(
            max(range(len(scores)), key=lambda index: scores[index])
        )
        confidence = float(scores[class_index])
        code = ML_CLASSES[class_index] if class_index < len(ML_CLASSES) else None
        if code in (None, "NORMAL") or confidence < minimum_confidence:
            continue
        assert code is not None
        subtype = _subtype_for(code, row)
        if subtype is None:
            continue
        if (row.index, code, subtype) in rule_keys:
            continue
        supplemental.append(
            DetectionCandidate(
                row_index=row.index,
                timestamp=row.timestamp,
                code=code,
                subtype=subtype,
                confidence=confidence,
                detector_version=ML_DETECTOR_VERSION,
            )
        )
    return tuple(supplemental)
