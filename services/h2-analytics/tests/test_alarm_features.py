"""A-P0-2 报警弱特征单测：解析过滤、时区口径、集合语义与置信上调红线。"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from h2_analytics.detection.alarm_features import (
    CONFIDENCE_BOOST,
    CONFIDENCE_CAP,
    NOISE_CODES,
    RELATED_CODES,
    START_WINDOW_ASSOCIATIONS,
    AlarmFeatureIndex,
    parse_alarm_log,
)

# 最小样本：表头 + 噪声码 1 条 + C02 强共现码 1 条（naive 分钟级时间）。
_SAMPLE = "\n".join(
    [
        "split,alarm_id,timestamp,source,alarm_code,alarm_message,severity,status",
        "train,A-TR-1,2025-01-01 08:00:00,EMS01,COMM_PACKET_LOSS_LOW,噪声,低,CLEARED",
        "train,A-TR-2,2025-01-01 10:00:00,EMS01,ELZ_POWER_DEVIATION,偏离,高,ACTIVE",
    ]
)


def test_parse_filters_noise_and_converts_naive_to_utc() -> None:
    entries = parse_alarm_log(_SAMPLE)
    # 噪声码被显式排除，只保留关联簇。
    assert [entry.alarm_code for entry in entries] == ["ELZ_POWER_DEVIATION"]
    # naive 分钟级时间视为 UTC（与服务管线 aware 口径一致）。
    assert entries[0].timestamp == datetime(2025, 1, 1, 10, 0, tzinfo=UTC)


def test_cluster_constants_partition() -> None:
    # 两簇互不相交；置信映射的码必须落在关联簇内且与 C 码一一对应。
    assert not (NOISE_CODES & RELATED_CODES)
    assert len(START_WINDOW_ASSOCIATIONS) == 7
    assert set(START_WINDOW_ASSOCIATIONS.values()) <= RELATED_CODES
    assert len(set(START_WINDOW_ASSOCIATIONS.values())) == 7


def test_codes_near_returns_set_without_counts() -> None:
    index = AlarmFeatureIndex(parse_alarm_log(_SAMPLE))
    at = datetime(2025, 1, 1, 10, 5, tzinfo=UTC)
    # 集合语义：同一码多条也只出现一次（无计数暴露）。
    assert index.codes_near(at) == frozenset({"ELZ_POWER_DEVIATION"})
    # 窗外（>10min）不命中。
    late = datetime(2025, 1, 1, 10, 11, tzinfo=UTC)
    assert index.codes_near(late) == frozenset()


def test_matches_only_for_associated_code_in_window() -> None:
    index = AlarmFeatureIndex(parse_alarm_log(_SAMPLE))
    start = datetime(2025, 1, 1, 10, 5, tzinfo=UTC)
    assert index.matches("C02", start) is True  # 实测强共现映射命中
    assert index.matches("C06", start) is False  # 同窗但非 C06 的映射码
    assert index.matches("C01", start + timedelta(hours=1)) is False  # 窗外


def test_boost_parameters_are_modest_and_capped() -> None:
    # 弱特征红线：小幅上调 + 上限（无码不罚由 aggregator 的 None/False 分支保证）。
    assert 0 < CONFIDENCE_BOOST <= 0.05
    assert CONFIDENCE_CAP <= 0.99
