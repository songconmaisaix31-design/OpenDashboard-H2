"""T11 ML 校验层单测：特征一致性（对齐 A2 单一事实源）+ 灰度行为。

一致性测试把 ``tools/features.py``（A2 领土）作为事实源动态导入（测试
环境加仓库根 sys.path）；运行时桥接（``ml_verification``）与训练特征口径
逐值一致由 ``test_runtime_features_match_a2_computation`` 拦截漂移。

on 路径测试依赖 lightgbm（ml extra）：无 lightgbm 的环境自动跳过。
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[3]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))  # tools/features.py（A2 事实源）

import tools.features as a2_features  # noqa: E402

from h2_analytics.detection import RuleRowDetector  # noqa: E402
from h2_analytics.detection.ml_verification import (  # noqa: E402
    ML_DETECTOR_VERSION,
    ml_supplemental_candidates,
    runtime_feature_names,
    runtime_feature_rows,
)
from h2_analytics.ingestion import DatasetLoader  # noqa: E402
from h2_analytics.service import AnalyticsService  # noqa: E402


def test_runtime_feature_names_match_a2_source() -> None:
    """列序与命名 = 训练 FEATURE_NAMES（单一事实源锚点）。"""
    assert runtime_feature_names() == a2_features.FEATURE_NAMES


def test_runtime_features_match_a2_computation(valid_csv: str) -> None:
    """逐特征逐行对齐 A2 compute_feature_rows（ DataRow -> CSV dict 往返）。"""
    imported = DatasetLoader().import_csv(filename="fixture.csv", text=valid_csv)
    rows = imported.rows

    csv_rows = [
        {
            # A2 parse_timestamp 只认官方 "YYYY-MM-DD HH:MM:SS" 格式；
            # 窗口/差分只消费相对时差，格式转换不影响特征值。
            "timestamp": row.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
            **{
                name: ("" if value is None else repr(value))
                for name, value in row.values.items()
            },
        }
        for row in rows
        if row.timestamp is not None
    ]
    expected_rows = a2_features.compute_feature_rows(csv_rows)
    actual_rows = runtime_feature_rows(rows)

    assert len(expected_rows) == len(actual_rows)
    for expected, actual in zip(expected_rows, actual_rows, strict=True):
        for name in runtime_feature_names():
            expected_value = expected.get(name)
            actual_value = actual.get(name)
            if expected_value is None or actual_value is None:
                # 日志族（族 6）双方在无日志输入时同为缺失。
                assert expected_value is None and actual_value is None, name
            else:
                assert actual_value == pytest.approx(
                    expected_value, rel=1e-12, abs=1e-12
                ), name


def test_ml_supplement_requires_lightgbm_artifacts(tmp_path: Path) -> None:
    """模型缺失/篡改即拒载（SHA256 与 MODELS_REGISTRY 摘录值比对）。"""
    pytest.importorskip("lightgbm")
    from h2_analytics.detection.ml_verification import _MODEL_SHA256

    with pytest.raises(RuntimeError, match="missing"):
        ml_supplemental_candidates((), (), models_dir=tmp_path)

    tampered = tmp_path / next(iter(_MODEL_SHA256))
    tampered.write_text("not a booster", encoding="utf-8")
    with pytest.raises(RuntimeError, match="SHA256 mismatch"):
        ml_supplemental_candidates((), (), models_dir=tmp_path)


def test_ml_supplement_never_overlaps_rule_candidates(valid_csv: str) -> None:
    """灰度语义：ML 只补充——补充候选不与规则候选 (row, code, subtype) 重叠，
    置信度不低于门槛且版本号为模型命名空间。"""
    lightgbm = pytest.importorskip("lightgbm")  # noqa: F841
    imported = DatasetLoader().import_csv(filename="fixture.csv", text=valid_csv)
    rows = imported.rows
    rule_candidates = RuleRowDetector().detect(rows)

    supplemental = ml_supplemental_candidates(rows, rule_candidates)

    rule_keys = {
        (candidate.row_index, candidate.code, candidate.subtype)
        for candidate in rule_candidates
    }
    for candidate in supplemental:
        key = (candidate.row_index, candidate.code, candidate.subtype)
        assert key not in rule_keys
        assert candidate.confidence >= 0.9
        assert candidate.detector_version == ML_DETECTOR_VERSION
        assert candidate.code in {"C03", "C04", "C05", "C07"}


def test_service_off_default_keeps_rule_events(valid_csv: str) -> None:
    """H2_ML_ENABLED 默认 False：纯规则路径，golden 事件原样（off=逐字节一致）。"""
    service = AnalyticsService()
    dataset_id = service.import_csv(
        filename="tiny-valid-timeseries.csv", text=valid_csv
    )["dataset"]["datasetId"]
    run = service.run_analysis(dataset_id)

    assert [event["code"] for event in run["events"]] == ["C03", "C04"]
    assert all(
        item["provenance"]["ruleVersion"] == "h2-rules-v2"
        for event in run["events"]
        for item in event["evidence"]
    )


def test_service_on_path_keeps_rule_events(valid_csv: str, monkeypatch) -> None:
    """H2_ML_ENABLED 开启：规则事件原样保留（规则为主；fixture 无 ML 补充）。"""
    pytest.importorskip("lightgbm")
    monkeypatch.setattr("h2_analytics.service.H2_ML_ENABLED", True)
    service = AnalyticsService()
    dataset_id = service.import_csv(
        filename="tiny-valid-timeseries.csv", text=valid_csv
    )["dataset"]["datasetId"]
    run = service.run_analysis(dataset_id)

    rule_event_ids = [event["eventId"] for event in run["events"]]
    assert rule_event_ids == ["C03-20260105-001", "C04-20260105-001"]
