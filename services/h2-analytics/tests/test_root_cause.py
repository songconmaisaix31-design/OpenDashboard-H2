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


# --- A-P0-1 会话2：H2_OPERATION_LOG_PATH 副本回退链（门禁/evaluate 环境） ---

_PRIOR_ROWS = [
    # C03 先验：事件 11:00 前 30 分钟，operator_role/remark 全字段合成常量。
    ["validation", "2026-01-05 10:30:00", "engineer", "接口映射变更",
     "bess_power_sign", "positive_discharge->positive_charge", "联调窗口"],
    # 无关码（C04）操作：同窗但不影响 C03 归因。
    ["validation", "2026-01-05 10:40:00", "dispatcher", "调度约束更新",
     "PCC功率限值", "900->700", "日内"],
]


def _prior_copy_fixture(tmp_path: Path, monkeypatch, rows=None):
    """写合成 12 号文件副本并注入 H2_OPERATION_LOG_PATH；重置 oplog 单例。"""
    import h2_analytics.detection.oplog_prior as oplog_prior

    log_path = tmp_path / "12_operation_log.csv"
    with log_path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(_LOG_HEADER)
        writer.writerows(rows if rows is not None else _PRIOR_ROWS)
    monkeypatch.setenv("H2_OPERATION_LOG_PATH", str(log_path))
    monkeypatch.setattr(oplog_prior, "_loaded", None)
    monkeypatch.setattr(oplog_prior, "_load_attempted", False)
    return log_path


def _reset_prior_singleton() -> None:
    import h2_analytics.detection.oplog_prior as oplog_prior

    oplog_prior._loaded = None
    oplog_prior._load_attempted = False


def test_attribution_falls_back_to_prior_copy_without_data_dir(
    tmp_path: Path, monkeypatch
) -> None:
    """门禁环境（无 H2_OFFICIAL_DATA_DIR）：归因回退 oplog 副本并命中 remark。"""
    try:
        _prior_copy_fixture(tmp_path, monkeypatch)
        result = attribute_root_cause(
            code="C03",
            window_start=_EVENT_START,
            template=_TEMPLATE,
            context=EvidenceContext(data_dir=None),
        )
        assert result.cited is True
        assert "数据驱动归因" in result.statement
        assert "联调窗口" in result.statement  # remark 入根因表述
        assert "engineer" in result.statement  # operator_role 透传
        (citation,) = result.citations
        assert citation["ref_id"] == "OP-20260105103000-bess_power_sign"
        assert citation["timestamp"] == "2026-01-05 10:30:00"
        assert citation["change"] == "positive_discharge->positive_charge"
    finally:
        _reset_prior_singleton()


def test_attribution_prior_copy_respects_window_and_code(tmp_path, monkeypatch) -> None:
    """副本回退同样受 [−60, −5] 窗与模式映射约束：窗外/异码不引。"""
    try:
        _prior_copy_fixture(
            tmp_path,
            monkeypatch,
            rows=[
                # lead 3 分钟 < 剔除带 5 分钟：不计入。
                ["validation", "2026-01-05 10:57:00", "engineer", "接口映射变更",
                 "bess_power_sign", "a->b", "过近"],
                # lead 90 分钟 > 60 分钟窗：不计入。
                ["validation", "2026-01-05 09:30:00", "engineer", "接口映射变更",
                 "bess_power_sign", "c->d", "过远"],
            ],
        )
        result = attribute_root_cause(
            code="C03",
            window_start=_EVENT_START,
            template=_TEMPLATE,
            context=EvidenceContext(data_dir=None),
        )
        assert result.cited is False
        assert "证据不足" in result.statement
    finally:
        _reset_prior_singleton()


def test_builder_emits_operation_prior_evidence_from_copy(
    tmp_path: Path, monkeypatch
) -> None:
    """builder 证据链：先验窗命中的事件追加 operation_prior 条目（IF-2 字段）。"""
    try:
        _prior_copy_fixture(tmp_path, monkeypatch)
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

        prior_items = [
            item for item in event["evidence"] if item["kind"] == "operation_prior"
        ]
        assert len(prior_items) == 1  # C04 操作异码不产条目
        item = prior_items[0]
        assert item["operationType"] == "接口映射变更"
        assert item["priorToCode"] == "C03"
        assert item["variable"] == "bess_power_sign"
        assert item["actualValue"] == "positive_discharge->positive_charge"
        assert item["referenceValue"] == "联调窗口"  # remark 原文入证据链
        assert item["source"] == "operation-log-prior"
        # 归因链同时生效（副本回退）。
        assert event["rootCause"].startswith("数据驱动归因")
        assert event["rootCauseCitations"][0]["ref_id"] == (
            "OP-20260105103000-bess_power_sign"
        )
    finally:
        _reset_prior_singleton()
