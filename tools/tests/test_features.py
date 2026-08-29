"""T08 特征工程单测：口径锚点、因果性、数值正确性、缺失传播、防泄漏。"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from features import (  # noqa: E402
    FEATURE_NAMES,
    LOG_LOOKBACK_END_MINUTES,
    LOG_LOOKBACK_START_MINUTES,
    RATE_WINDOW_MINUTES,
    RateWindow,
    RollingColumn,
    _percentile,
    _sign_flip_count,
    compute_feature_rows,
    load_log_events,
    parse_float,
    parse_timestamp,
)

BASE = datetime(2025, 1, 1, 0, 0, 0)


def ts(minutes: int) -> str:
    moment = BASE + timedelta(minutes=minutes)
    return moment.strftime("%Y-%m-%d %H:%M:%S")


def row(minutes: int, **columns: str) -> dict[str, str]:
    values = {"timestamp": ts(minutes)}
    values.update(columns)
    return values


REQUIRED_COLUMNS = (
    "timestamp", "system_alarm_count", "bus_frequency_hz", "ems_power_balance_error_kw",
    "bess_soc_pct", "elz1_run_state", "elz2_run_state", "elz3_run_state",
    "bess_regulation_reserve_target_kwh",
    "bess_power_cmd_kw", "bess_power_actual_kw", "pcc_power_actual_kw",
    "grid_export_energy_remaining_kwh", "grid_import_energy_remaining_kwh",
    "bess_available_charge_energy_kwh", "bess_available_discharge_energy_kwh",
    "grid_export_energy_quota_kwh_day", "grid_export_energy_used_kwh_day",
    "grid_import_energy_quota_kwh_day", "grid_import_energy_used_kwh_day",
    "bess_discharge_power_limit_kw", "bess_charge_power_limit_kw",
    "pcc_power_cmd_kw",
    "elz1_power_cmd_kw", "elz2_power_cmd_kw", "elz3_power_cmd_kw",
    "elz1_power_actual_kw", "elz2_power_actual_kw", "elz3_power_actual_kw",
)


def base_row(minutes: int, **overrides: float) -> dict[str, str]:
    """全列在场的合成行：默认 0，overrides 覆盖指定数值列（timestamp 由 minutes 生成）。"""
    values = {column: 0.0 for column in REQUIRED_COLUMNS if column != "timestamp"}
    values["bess_soc_pct"] = 50.0
    values["bus_frequency_hz"] = 50.0
    values.update(overrides)
    return row(minutes, **{column: str(value) for column, value in values.items()})


class TestCatalog:
    def test_feature_names_count_matches_documented_catalog(self) -> None:
        # 覆盖清单（features.py docstring 六族）：8 + 30 + 6 + 6 + 13 + 2 + 4 = 69
        assert len(FEATURE_NAMES) == 69
        assert len(set(FEATURE_NAMES)) == len(FEATURE_NAMES)  # 无重名

    def test_feature_names_cover_all_families(self) -> None:
        names = set(FEATURE_NAMES)
        assert "system_alarm_count" in names  # 族 0
        assert "win15_mean_bess_power_cmd_kw" in names and "win15_p90_bus_frequency_hz" in names
        assert "win15_range_elz2_power_cmd_kw" in names  # 族 1 ELZ 判别面
        assert "d1_bess_soc_pct" in names  # 族 2
        assert "rate5_grid_export_energy_remaining_kwh" in names  # 族 3（C05 前瞻同源）
        assert "margin_bess_charge_reserve_kwh" in names  # 族 4（C07 前瞻同源）
        assert "flip15_bess_power_cmd_kw" in names  # 族 5
        assert "log_operation_count_90_20" in names  # 族 6


class TestParsing:
    def test_parse_timestamp_and_float(self) -> None:
        assert parse_timestamp("2025-01-01 00:00:00") == datetime(2025, 1, 1)
        assert parse_timestamp("  ") is None
        assert parse_timestamp("2025/01/01") is None
        assert parse_float("1.5") == 1.5
        assert parse_float("") is None
        assert parse_float(None) is None
        assert parse_float("abc") is None


class TestPrimitives:
    def test_percentile_linear_interpolation(self) -> None:
        assert _percentile([1.0], 0.5) == 1.0
        assert _percentile([1.0, 2.0, 3.0], 0.5) == 2.0
        assert _percentile([1.0, 2.0, 3.0, 4.0], 0.1) == pytest.approx(1.3)
        with pytest.raises(ValueError):
            _percentile([], 0.5)

    def test_sign_flip_count_skips_zero(self) -> None:
        assert _sign_flip_count([1.0, 1.0, -1.0]) == 1
        assert _sign_flip_count([1.0, 0.0, -1.0]) == 1  # 0 不算翻转也不断裂
        assert _sign_flip_count([1.0, 2.0, 3.0]) == 0
        assert _sign_flip_count([1.0, -1.0, 1.0, -1.0]) == 3
        assert _sign_flip_count([]) == 0

    def test_rolling_window_is_causal_and_time_bounded(self) -> None:
        window = RollingColumn(15)
        for index in range(20):
            window.push(BASE + timedelta(minutes=index), float(index))
        # 只含最近 15 分钟样本 [5..19]（因果：无未来样本）
        assert window.values() == [float(index) for index in range(5, 20)]

    def test_rolling_window_ignores_missing(self) -> None:
        window = RollingColumn(15)
        window.push(BASE, 1.0)
        window.push(BASE + timedelta(minutes=1), None)
        assert window.values() == [1.0]

    def test_rate_window_five_minute_quotient(self) -> None:
        rate = RateWindow(5)
        for index in range(5):
            assert rate.push_and_rate(BASE + timedelta(minutes=index), float(index)) is None
        # t=5：基点 t=0（恰 5 分钟前），差商 (10−0)/5
        assert rate.push_and_rate(BASE + timedelta(minutes=5), 10.0) == pytest.approx(2.0)

    def test_rate_window_insufficient_history_is_none(self) -> None:
        rate = RateWindow(5)
        assert rate.push_and_rate(BASE, 1.0) is None
        assert rate.push_and_rate(BASE + timedelta(minutes=1), 2.0) is None


class TestComputeFeatureRows:
    def test_output_keys_exactly_match_feature_names(self) -> None:
        result = compute_feature_rows([base_row(0)])
        assert len(result) == 1
        assert set(result[0].keys()) == {"timestamp", *FEATURE_NAMES}

    def test_first_row_leading_window_features_are_none(self) -> None:
        result = compute_feature_rows([base_row(0)])[0]
        assert result["d1_bess_soc_pct"] is None  # 无前值
        assert result["rate5_bess_soc_pct"] is None  # 速率窗不足
        assert result["win15_mean_bus_frequency_hz"] == 50.0  # 单样本滑窗可用
        assert result["flip15_bess_power_cmd_kw"] == 0.0  # 单样本 0 翻转

    def test_missing_raw_value_propagates_to_none(self) -> None:
        partial = {"timestamp": ts(0)}  # 除 timestamp 全缺
        result = compute_feature_rows([partial])[0]
        assert result["bess_soc_pct"] is None
        assert result["win15_mean_bess_soc_pct"] is None
        assert result["margin_bess_soc_low_pct"] is None

    def test_sliding_statistics_values(self) -> None:
        rows = [
            base_row(minute, bus_frequency_hz=value)
            for minute, value in enumerate([50.0, 52.0, 54.0])
        ]
        result = compute_feature_rows(rows)[2]
        assert result["win15_mean_bus_frequency_hz"] == pytest.approx(52.0)
        assert result["win15_range_bus_frequency_hz"] == pytest.approx(4.0)
        assert result["win15_p10_bus_frequency_hz"] == pytest.approx(50.4)  # 位置 0.1×2=0.2 → 50×0.8+52×0.2
        assert result["win15_p90_bus_frequency_hz"] == pytest.approx(53.6)  # 位置 0.9×2=1.8 → 52×0.2+54×0.8

    def test_causality_future_rows_do_not_change_past_features(self) -> None:
        past_rows = [base_row(minute, bus_frequency_hz=float(minute)) for minute in range(10)]
        alone = compute_feature_rows(past_rows)
        extended = compute_feature_rows(past_rows + [base_row(10, bus_frequency_hz=999.0)])
        assert alone[5] == extended[5]  # 未来行不影响第 5 行特征

    def test_first_order_delta(self) -> None:
        rows = [base_row(0, bess_soc_pct=50.0), base_row(1, bess_soc_pct=50.5)]
        result = compute_feature_rows(rows)
        assert result[0]["d1_bess_soc_pct"] is None
        assert result[1]["d1_bess_soc_pct"] == pytest.approx(0.5)

    def test_margin_features_direction(self) -> None:
        result = compute_feature_rows([
            base_row(0, bess_soc_pct=30.0, bess_available_charge_energy_kwh=100.0,
                     bess_regulation_reserve_target_kwh=60.0),
        ])[0]
        assert result["margin_bess_soc_low_pct"] == pytest.approx(10.0)  # soc − 20
        assert result["margin_bess_soc_high_pct"] == pytest.approx(60.0)  # 90 − soc
        assert result["margin_bess_charge_reserve_kwh"] == pytest.approx(40.0)  # C07 前瞻同源

    def test_cmd_track_error(self) -> None:
        result = compute_feature_rows([
            base_row(0, bess_power_cmd_kw=-300.0, bess_power_actual_kw=-295.0),
        ])[0]
        assert result["cmd_track_error_bess_kw"] == pytest.approx(-5.0)

    def test_flip_count_over_window(self) -> None:
        rows = [
            base_row(0, bess_power_cmd_kw=100.0),
            base_row(1, bess_power_cmd_kw=100.0),
            base_row(2, bess_power_cmd_kw=-100.0),
            base_row(3, bess_power_cmd_kw=-100.0),
            base_row(4, bess_power_cmd_kw=100.0),
        ]
        result = compute_feature_rows(rows)
        assert result[1]["flip15_bess_power_cmd_kw"] == 0.0
        assert result[2]["flip15_bess_power_cmd_kw"] == 1.0
        assert result[4]["flip15_bess_power_cmd_kw"] == 2.0

    def test_requires_parseable_timestamp(self) -> None:
        with pytest.raises(ValueError):
            compute_feature_rows([{"timestamp": "not-a-time"}])

    def test_determinism_same_input_same_output(self) -> None:
        rows = [base_row(minute, bess_soc_pct=50.0 + minute) for minute in range(30)]
        assert compute_feature_rows(rows) == compute_feature_rows(rows)


class TestLogFeatures:
    def test_lookback_window_bounds_and_split_filter(self, tmp_path: Path) -> None:
        # 观测时刻 t = BASE+100min；样本按"相对 t 的偏移"构造（ts(x) 为绝对分钟）
        t = 100
        log = tmp_path / "11_alarm_log.csv"
        log.write_text(
            "split,alarm_id,timestamp,source,alarm_code,alarm_message,severity,status\n"
            f"train,A1,{ts(t - 15)},EMS01,OTHER,太近,高,ACTIVE\n"  # t−15min：距 t 不足 20 分钟 → 排除
            f"train,A2,{ts(t - 20)},EMS01,OTHER,普通,低,ACTIVE\n"  # t−20min：恰在窗内（近端闭）
            f"train,A3,{ts(t - 30)},EMS01,BESS_DIRECTION_CONFLICT,冲突,高,ACTIVE\n"  # 窗内 + 高 + 冲突
            f"train,A4,{ts(t - 90)},EMS01,OTHER,普通,低,ACTIVE\n"  # t−90min：远端开区间 → 排除
            f"train,A5,{ts(t - 89)},EMS01,OTHER,普通,低,ACTIVE\n"  # 恰入窗（> t−90）
            f"validation,A6,{ts(t - 60)},EMS01,OTHER,跨集,低,ACTIVE\n",  # split 过滤掉
            encoding="utf-8-sig",
        )
        stamps, flags = load_log_events(
            log, split="train", severity_column="severity", code_column="alarm_code",
        )
        assert len(stamps) == 5  # validation 行被过滤
        result = compute_feature_rows([base_row(t)], alarm_log=(stamps, flags))[0]
        # 窗 (t−90, t−20] 命中 {A5(−89), A3(−30), A2(−20)} 共 3 条
        assert result["log_alarm_count_90_20"] == 3.0
        assert result["log_alarm_high_severity_count_90_20"] == 1.0
        assert result["log_alarm_direction_conflict_count_90_20"] == 1.0
        assert result["log_operation_count_90_20"] is None  # 未提供操作日志 → 显式 None

    def test_absent_logs_yield_none_not_zero(self) -> None:
        result = compute_feature_rows([base_row(0)])[0]
        assert result["log_alarm_count_90_20"] is None

    def test_window_constants_are_contracted(self) -> None:
        # 先验窗口径锚点：改动即特征口径变更，须同步覆盖清单与 MODELS_REGISTRY
        assert (LOG_LOOKBACK_START_MINUTES, LOG_LOOKBACK_END_MINUTES) == (90, 20)
        assert RATE_WINDOW_MINUTES == 5
