"""根因数据驱动归因单测（P1-8 / T12）：映射、先验窗、引用回溯与回退。

合成 `12_operation_log.csv`（列结构与官方一致：split/timestamp/
operator_role/operation_type/parameter/change/remark，值全为合成常量），
不引用任何官方数据行。
"""

from __future__ import annotations

import csv
from datetime import UTC, datetime
from pathlib import Path

from h2_analytics.diagnosis import DiagnosisBuilder
from h2_analytics.diagnosis.root_cause import (
    ATTRIBUTION_EXCLUSION_MINUTES,
    ATTRIBUTION_LOOKBACK_MINUTES,
    attribute_root_cause,
    operation_log_ref_id,
    support_score,
)
from h2_analytics.evidence import EvidenceContext
from h2_analytics.events import EventWindow
from h2_analytics.models import DataRow

_EVENT_START = datetime(2026, 1, 5, 11, 0, tzinfo=UTC)
_TEMPLATE = "模板根因表述（测试用）"

_LOG_HEADER = [
    "split",
    "timestamp",
    "operator_role",
    "operation_type",
    "parameter",
    "change",
    "remark",
]


def _write_operation_log(path: Path, rows: list[list[str]]) -> EvidenceContext:
    with (path / "12_operation_log.csv").open(
        "w", encoding="utf-8", newline=""
    ) as stream:
        writer = csv.writer(stream)
        writer.writerow(_LOG_HEADER)
        writer.writerows(rows)
    return EvidenceContext(data_dir=str(path))


def test_ref_id_is_deterministic_and_compact() -> None:
    assert (
        operation_log_ref_id("2025-01-01 14:59:00", "bess_power_sign")
        == "OP-20250101145900-bess_power_sign"
    )


def test_support_score_decays_linearly_over_the_window() -> None:
    assert support_score(5) == 0.92
    assert support_score(30) == 0.5
    assert support_score(60) == 0.0
    assert support_score(120) == 0.0  # 窗外钳到 0，不出现负分


def test_c03_symbol_mapping_log_is_cited_with_if2_shape(tmp_path: Path) -> None:
    context = _write_operation_log(
        tmp_path,
        [["train", "2026-01-05 10:30:00", "engineer", "接口映射变更",
          "bess_power_sign", "positive_discharge->positive_charge", "联调"]],
    )

    result = attribute_root_cause(
        code="C03",
        window_start=_EVENT_START,
        template=_TEMPLATE,
        context=context,
    )

    assert result.cited is True
    assert "数据驱动归因" in result.statement
    assert "bess_power_sign" in result.statement
    assert "30 分钟" in result.statement
    assert "证据不足" not in result.statement
    (citation,) = result.citations
    assert citation["source"] == "operation_log"
    assert citation["ref_id"] == "OP-20260105103000-bess_power_sign"
    assert citation["timestamp"] == "2026-01-05 10:30:00"
    assert citation["parameter"] == "bess_power_sign"
    assert citation["change"] == "positive_discharge->positive_charge"
    assert citation["support_score"] == 0.5


def test_window_boundaries_are_inclusive(tmp_path: Path) -> None:
    context = _write_operation_log(
        tmp_path,
        [
            # lead 恰为剔除带下限 5 分钟：计入。
            ["train", "2026-01-05 10:55:00", "planner", "参数变更",
             "setpoint_deadband_kw", "2.0->0.5", "死区收紧"],
            # lead 恰为先验窗上限 60 分钟：计入。
            ["train", "2026-01-05 10:00:00", "planner", "SOC计划变更",
             "soc_target_pct", "未滚动", "日内"],
        ],
    )

    c01 = attribute_root_cause(
        code="C01", window_start=_EVENT_START, template=_TEMPLATE, context=context
    )
    c07 = attribute_root_cause(
        code="C07", window_start=_EVENT_START, template=_TEMPLATE, context=context
    )

    assert c01.cited and c01.citations[0]["support_score"] == 0.92
    assert c07.cited and c07.citations[0]["support_score"] == 0.0


def test_logs_outside_window_or_after_start_are_not_cited(tmp_path: Path) -> None:
    context = _write_operation_log(
        tmp_path,
        [
            # lead 120 分钟：窗外。
            ["train", "2026-01-05 09:00:00", "planner", "电量配额更新",
             "上下网日电量配额", "下调", "日报"],
            # 事件开始之后：不属于先验。
            ["train", "2026-01-05 11:30:00", "dispatcher", "调度约束更新",
             "PCC功率限值", "900->700", "日内"],
        ],
    )

    for code in ("C05", "C04"):
        result = attribute_root_cause(
            code=code, window_start=_EVENT_START, template=_TEMPLATE, context=context
        )
        assert result.cited is False
        assert "证据不足" in result.statement
        assert result.citations == ()


def test_latest_candidate_wins_for_determinism(tmp_path: Path) -> None:
    context = _write_operation_log(
        tmp_path,
        [
            ["train", "2026-01-05 10:20:00", "engineer", "接口映射变更",
             "bess_power_sign", "a->b", "早"],
            ["train", "2026-01-05 10:45:00", "engineer", "接口映射变更",
             "bess_power_sign", "c->d", "晚"],
        ],
    )

    result = attribute_root_cause(
        code="C03", window_start=_EVENT_START, template=_TEMPLATE, context=context
    )

    assert result.citations[0]["ref_id"] == "OP-20260105104500-bess_power_sign"
    assert result.citations[0]["change"] == "c->d"


def test_unmapped_codes_and_missing_data_dir_fall_back(tmp_path: Path) -> None:
    context = _write_operation_log(tmp_path, [])
    no_dir = EvidenceContext(data_dir=None)

    c02 = attribute_root_cause(
        code="C02", window_start=_EVENT_START, template=_TEMPLATE, context=context
    )
    c03_no_dir = attribute_root_cause(
        code="C03", window_start=_EVENT_START, template=_TEMPLATE, context=no_dir
    )

    # C02/C06 无既定映射，明确写"证据不足"，不编造归因。
    assert c02.cited is False
    assert "无操作日志归因映射" in c02.statement
    assert _TEMPLATE in c02.statement
    assert c03_no_dir.cited is False
    assert "证据不足" in c03_no_dir.statement


def test_builder_emits_data_driven_root_cause_and_citations(tmp_path: Path) -> None:
    context = _write_operation_log(
        tmp_path,
        [["train", "2026-01-05 10:30:00", "engineer", "接口映射变更",
          "bess_power_sign", "positive_discharge->positive_charge", "联调"]],
    )
    row = DataRow(
        1,
        _EVENT_START,
        "2026-01-05 11:00:00",
        {
            "bess_power_cmd_kw": -400.0,
            "bess_power_actual_kw": 400.0,
            "pcc_power_actual_kw": 120.0,
            "bess_soc_pct": 55.0,
            "soc_target_pct": 60.0,
        },
    )
    window = EventWindow(
        event_id="C03-20260105-001",
        code="C03",
        subtype="BESS_DIRECTION_REVERSED",
        rows=(row,),
        start_time=_EVENT_START,
        end_time=_EVENT_START,
        first_detection_time=_EVENT_START,
        confidence=0.9,
        detector_version="test-detector-v1",
    )
    manifest = {
        "provenance": {"generatedAt": "2026-01-05T12:00:00Z"},
        "mode": "offline",
        "fingerprint": "test-fingerprint",
        "samplingIntervalMinutes": 1.0,
    }

    event = DiagnosisBuilder(evidence_context=context).build(
        window=window, manifest=manifest
    )

    assert event["rootCauseKind"] == "inference"
    assert event["rootCause"].startswith("数据驱动归因")
    assert event["rootCauseCitations"][0]["ref_id"] == (
        "OP-20260105103000-bess_power_sign"
    )
    assert event["rootCauseCitations"][0]["support_score"] == 0.5


def test_builder_falls_back_to_insufficient_evidence_without_logs() -> None:
    row = DataRow(
        1,
        _EVENT_START,
        "2026-01-05 11:00:00",
        {
            "bess_power_cmd_kw": -400.0,
            "bess_power_actual_kw": 400.0,
            "pcc_power_actual_kw": 120.0,
            "bess_soc_pct": 55.0,
            "soc_target_pct": 60.0,
        },
    )
    window = EventWindow(
        event_id="C03-20260105-001",
        code="C03",
        subtype="BESS_DIRECTION_REVERSED",
        rows=(row,),
        start_time=_EVENT_START,
        end_time=_EVENT_START,
        first_detection_time=_EVENT_START,
        confidence=0.9,
        detector_version="test-detector-v1",
    )
    manifest = {
        "provenance": {"generatedAt": "2026-01-05T12:00:00Z"},
        "mode": "offline",
        "fingerprint": "test-fingerprint",
        "samplingIntervalMinutes": 1.0,
    }

    event = DiagnosisBuilder(
        evidence_context=EvidenceContext(data_dir=None)
    ).build(window=window, manifest=manifest)

    assert "证据不足" in event["rootCause"]
    assert event["rootCauseCitations"] == []


def test_window_constants_match_train_derivation() -> None:
    """窗口常量即 TRAIN 推导结论（5-60 分钟先验），防止无意漂移。"""
    assert ATTRIBUTION_LOOKBACK_MINUTES == 60.0
    assert ATTRIBUTION_EXCLUSION_MINUTES == 5.0
