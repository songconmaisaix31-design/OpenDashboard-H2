"""T09 训练脚本单测：对齐校验、类目契约、指标口径、rolling 分割、registry 结构。

不依赖 lightgbm（延迟导入设计），dev-only 环境可跑。
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from features import FEATURE_NAMES  # noqa: E402
from train_lightgbm import (  # noqa: E402
    DETECTOR_VERSION_HINT,
    ML_CLASSES,
    RULE_ONLY_CLASSES,
    _balanced_weights,
    argmax_row,
    classification_report,
    confusion_matrix,
    join_features_labels,
    registry_entry_markdown,
    rolling_month_splits,
    standard_deviation,
)


def feature_row(timestamp: str, value: float = 1.0) -> dict[str, str]:
    return {"timestamp": timestamp, **{name: str(value) for name in FEATURE_NAMES}}


def label_row(timestamp: str, code: str) -> dict[str, str]:
    return {"timestamp": timestamp, "anomaly_code": code}


class TestJoin:
    def test_row_count_mismatch_raises(self) -> None:
        with pytest.raises(ValueError, match="row count mismatch"):
            join_features_labels([feature_row("2025-01-01 00:00:00")], [])

    def test_timestamp_misalignment_raises(self) -> None:
        with pytest.raises(ValueError, match="misalignment"):
            join_features_labels(
                [feature_row("2025-01-01 00:00:00")],
                [label_row("2025-01-01 00:01:00", "NORMAL")],
            )

    def test_rule_only_classes_are_filtered(self) -> None:
        timestamps, matrix, labels = join_features_labels(
            [
                feature_row("2025-01-01 00:00:00"),
                feature_row("2025-01-01 00:01:00"),
                feature_row("2025-01-01 00:02:00"),
            ],
            [
                label_row("2025-01-01 00:00:00", "C03"),
                label_row("2025-01-01 00:01:00", "C01"),  # 规则领地 → 丢弃
                label_row("2025-01-01 00:02:00", "NORMAL"),
            ],
        )
        assert timestamps == ["2025-01-01 00:00:00", "2025-01-01 00:02:00"]
        assert labels == [ML_CLASSES.index("C03"), ML_CLASSES.index("NORMAL")]
        assert len(matrix) == 2 and len(matrix[0]) == len(FEATURE_NAMES)

    def test_unknown_code_raises(self) -> None:
        with pytest.raises(ValueError, match="unknown anomaly_code"):
            join_features_labels([feature_row("2025-01-01 00:00:00")],
                                 [label_row("2025-01-01 00:00:00", "C99")])

    def test_missing_feature_cell_becomes_nan(self) -> None:
        row = feature_row("2025-01-01 00:00:00")
        row[FEATURE_NAMES[0]] = ""
        _timestamps, matrix, _labels = join_features_labels(
            [row], [label_row("2025-01-01 00:00:00", "NORMAL")],
        )
        assert math.isnan(matrix[0][0])
        assert matrix[0][1] == 1.0

    def test_ml_classes_contract(self) -> None:
        # 类目契约：ML 主战场 5 类；C01/C02/C06 规则领地（与 adapter 拒绝清单一致）
        assert ML_CLASSES == ("NORMAL", "C03", "C04", "C05", "C07")
        assert RULE_ONLY_CLASSES == {"C01", "C02", "C06"}
        assert not set(ML_CLASSES) & RULE_ONLY_CLASSES


class TestMetrics:
    def test_confusion_requires_alignment(self) -> None:
        with pytest.raises(ValueError, match="aligned"):
            confusion_matrix([0, 1], [0], 5)

    def test_confusion_counts(self) -> None:
        matrix = confusion_matrix([0, 1, 1, 2], [0, 1, 2, 2], 3)
        assert matrix == [[1, 0, 0], [0, 1, 1], [0, 0, 1]]

    def test_report_per_class_and_macro(self) -> None:
        matrix = [
            [8, 2, 0, 0, 0],
            [1, 9, 0, 0, 0],
            [0, 0, 10, 0, 0],
            [0, 0, 0, 10, 0],
            [0, 0, 0, 0, 10],
        ]
        report = classification_report(matrix)
        normal = report["NORMAL"]
        assert normal["support"] == 10.0
        assert normal["precision"] == pytest.approx(8 / 9)
        assert normal["recall"] == pytest.approx(0.8)
        assert normal["f1"] == pytest.approx(2 * (8 / 9) * 0.8 / ((8 / 9) + 0.8))
        assert report["macro"]["f1"] == pytest.approx(
            sum(report[code]["f1"] for code in ML_CLASSES) / 5,
        )

    def test_zero_denominator_is_zero(self) -> None:
        report = classification_report([[0] * 5 for _ in range(5)])
        assert report["macro"]["f1"] == 0.0
        assert report["NORMAL"]["precision"] == 0.0

    def test_argmax_row(self) -> None:
        assert argmax_row([0.1, 0.5, 0.2, 0.1, 0.1]) == 1
        assert argmax_row([0.9, 0.1, 0.0, 0.0, 0.0]) == 0

    def test_standard_deviation(self) -> None:
        assert standard_deviation([1.0]) == 0.0
        assert standard_deviation([2.0, 4.0]) == pytest.approx(1.0)

    def test_balanced_weights_invert_frequency(self) -> None:
        labels = [0, 0, 0, 1]  # 3:1；balanced 分母含全部 5 类（与 sklearn 语义一致）
        weights = _balanced_weights(labels)
        assert weights[0] == pytest.approx(4 / (5 * 3))
        assert weights[3] == pytest.approx(4 / (5 * 1))
        # 加权后各类总权重相等（balanced 语义）
        assert sum(weights[:3]) == pytest.approx(weights[3])


class TestRollingSplits:
    def test_expanding_folds_with_warmup(self) -> None:
        timestamps = [f"2025-{month:02d}-{day:02d} 00:00:00"
                      for month in range(1, 13) for day in (1, 2)]
        folds = rolling_month_splits(timestamps)
        # 12 个月 → 折索引 6..10（首个验证月 = 第 7 个月，最后一个月不做折）
        assert [month for month, _, _ in folds] == [
            "2025-07", "2025-08", "2025-09", "2025-10", "2025-11",
        ]
        for _month, train_index, eval_index in folds:
            assert train_index and eval_index
            assert not set(train_index) & set(eval_index)
        july_fold = folds[0]
        assert len(july_fold[1]) == 12  # 前 6 个月 × 2 日
        assert len(july_fold[2]) == 2

    def test_no_future_month_leaks_into_training(self) -> None:
        timestamps = [f"2025-{month:02d}-01 00:00:00" for month in range(1, 13)]
        for month, train_index, _eval_index in rolling_month_splits(timestamps):
            assert all(timestamps[i][:7] < month for i in train_index)


class TestRegistryEntry:
    def test_entry_contains_delivery_contract_fields(self) -> None:
        summary = {
            "registeredAt": "2026-08-29",
            "modelFiles": ["m-seed1.txt"],
            "modelSha256": {"m-seed1.txt": "ab" * 32},
            "featureCount": len(FEATURE_NAMES),
            "hyperparams": {"learning_rate": 0.05},
            "trainRows": 100,
            "validationRows": 50,
            "dataSha256": {"trainFeatures": "cd" * 32},
            "seeds": [1, 2, 3],
            "macroF1Std": 0.001,
            "macroF1Range": 0.002,
            "rollingSeed": 1,
            "rollingMacroF1": {"2025-07": 0.9},
            "detectorVersionHint": DETECTOR_VERSION_HINT,
        }
        entry = registry_entry_markdown("h2-lgbm-row-v1", summary)
        assert entry.startswith("## h2-lgbm-row-v1")
        # IF-A2→A1 交付五要素：SHA256 / 参数 / 数据哈希 / 3 seed 方差 / detector_version 建议值
        for keyword in ("SHA256", "超参", "数据哈希", "3 seed 方差", "detector_version 建议值", "H2_ML_ENABLED"):
            assert keyword in entry
