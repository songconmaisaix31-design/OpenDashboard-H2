"""训练脚本（T09 / P1-9b）：LightGBM 行级分类器 + 3 seed + MODELS_REGISTRY 登记。

上游规格：plan0829/02_ALGO_ROBUSTNESS.md §4.3；ADR-001（ML 校验层、灰度五条）、ADR-002。

铁律落地
--------
- **只用公开 train + validation**：train 拟合，validation 仅作早停（无调参循环）；
  **禁止测试集/测试标签**（03/17 等测试文件不出现在任何参数中）；
- **类目 = {NORMAL, C03, C04, C05, C07}**：C01/C02/C06 是规则领地
  （``detection/lightgbm_adapter.py`` 显式拒绝动态归因三类），训练/评估行直接过滤；
- 防泄漏：特征全因果窗（features.py）；无偏参考用 **train 内按月 rolling expanding** 评估
  （validation 指标因参与早停，报告中标注为"早停集指标，非无偏估计"）；
- 产物不入库：模型与训练报告落 ``models/``（gitignored）；摘要登记 ``MODELS_REGISTRY.md``
  （SHA256 / 参数 / 训练数据哈希 / 3 seed 方差 / detector_version 建议值，IF-A2→A1 契约）。

CLI
---
    uv run --project services/h2-analytics python tools/train_lightgbm.py \
        --train-features models/features-train.csv \
        --train-labels <official>/06_train_row_labels.csv \
        --validation-features models/features-validation.csv \
        --validation-labels <official>/07_validation_row_labels.csv \
        [--models-dir models] [--name h2-lgbm-row-v1] [--seeds 1,2,3] \
        [--no-rolling] [--registry-append]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path
from typing import Mapping, Sequence

from features import FEATURE_NAMES, read_csv_rows

# ---------------------------------------------------------------------------
# 契约常量（改动即训练口径变更，须同步 MODELS_REGISTRY 与状态文件）
# ---------------------------------------------------------------------------
#: ML 类目（顺序即 LightGBM label 编码与 class_map 索引）
ML_CLASSES: tuple[str, ...] = ("NORMAL", "C03", "C04", "C05", "C07")
#: 规则领地类（行级过滤，不训练不评估；与 adapter 拒绝清单一致）
RULE_ONLY_CLASSES: frozenset[str] = frozenset({"C01", "C02", "C06"})
DEFAULT_SEEDS: tuple[int, ...] = (1, 2, 3)
#: 保守固定超参（无调参循环，validation 仅早停——避免用早停集调参）
HYPERPARAMS: dict[str, object] = {
    "objective": "multiclass",
    "num_class": len(ML_CLASSES),
    "metric": "multi_logloss",
    "learning_rate": 0.05,
    "num_leaves": 31,
    "min_data_in_leaf": 200,
    "feature_fraction": 0.9,
    "bagging_fraction": 0.8,
    "bagging_freq": 1,
    "verbosity": -1,
}
EARLY_STOPPING_ROUNDS = 50
NUM_BOOST_ROUND = 400
ROLLING_WARMUP_MONTHS = 6  # expanding 首折前至少累计的月数
DETECTOR_VERSION_HINT = "h2-ml-row-lgbm-v1"  # 模型命名空间（区别于检测器 v4/v5）

TIMESTAMP_COLUMN = "timestamp"
LABEL_CODE_COLUMN = "anomaly_code"


# ---------------------------------------------------------------------------
# 数据对齐（特征行 ↔ 行级标签；错位即报错，禁止静默错位训练）
# ---------------------------------------------------------------------------
def join_features_labels(
    feature_rows: Sequence[Mapping[str, str]],
    label_rows: Sequence[Mapping[str, str]],
) -> tuple[list[str], list[list[float]], list[int]]:
    """按 timestamp 逐行对齐特征与标签，过滤规则领地类。

    返回 (timestamps, X, y)；X 缺失格转 NaN（LightGBM 原生缺失）。
    """
    if len(feature_rows) != len(label_rows):
        raise ValueError(
            f"feature/label row count mismatch: {len(feature_rows)} vs {len(label_rows)}"
        )
    class_index = {code: index for index, code in enumerate(ML_CLASSES)}
    timestamps: list[str] = []
    matrix: list[list[float]] = []
    labels: list[int] = []
    for feature_row, label_row in zip(feature_rows, label_rows, strict=True):
        feature_ts = (feature_row.get(TIMESTAMP_COLUMN) or "").strip()
        label_ts = (label_row.get(TIMESTAMP_COLUMN) or "").strip()
        if feature_ts != label_ts:
            raise ValueError(
                f"feature/label timestamp misalignment at {feature_ts!r} vs {label_ts!r}"
            )
        code = (label_row.get(LABEL_CODE_COLUMN) or "").strip()
        if code in RULE_ONLY_CLASSES:
            continue  # 规则领地：不训练不评估
        if code not in class_index:
            raise ValueError(f"unknown anomaly_code in row labels: {code!r}")
        timestamps.append(feature_ts)
        matrix.append([
            float(cell) if cell not in (None, "") else math.nan
            for cell in (feature_row.get(name) for name in FEATURE_NAMES)
        ])
        labels.append(class_index[code])
    if not matrix:
        raise ValueError("no trainable rows remain after class filtering")
    return timestamps, matrix, labels


# ---------------------------------------------------------------------------
# 纯 Python 指标（环境无 sklearn：混淆矩阵 + per-class P/R/F1 + macro）
# ---------------------------------------------------------------------------
def confusion_matrix(y_true: Sequence[int], y_pred: Sequence[int], size: int) -> list[list[int]]:
    if len(y_true) != len(y_pred):
        raise ValueError("confusion inputs must be aligned")
    matrix = [[0] * size for _ in range(size)]
    for truth, prediction in zip(y_true, y_pred, strict=True):
        matrix[truth][prediction] += 1
    return matrix


def classification_report(matrix: Sequence[Sequence[int]]) -> dict[str, dict[str, float]]:
    """从混淆矩阵导出每类 precision/recall/f1 与 macro（零分母=0，与 evaluate.mjs 口径一致）。"""
    size = len(matrix)
    report: dict[str, dict[str, float]] = {}
    precisions: list[float] = []
    recalls: list[float] = []
    f1_values: list[float] = []
    for index in range(size):
        tp = matrix[index][index]
        fp = sum(matrix[other][index] for other in range(size)) - tp
        fn = sum(matrix[index]) - tp
        precision = tp / (tp + fp) if tp + fp else 0.0
        recall = tp / (tp + fn) if tp + fn else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        report[ML_CLASSES[index]] = {
            "support": float(sum(matrix[index])),
            "precision": precision,
            "recall": recall,
            "f1": f1,
        }
        precisions.append(precision)
        recalls.append(recall)
        f1_values.append(f1)
    report["macro"] = {
        "precision": sum(precisions) / size,
        "recall": sum(recalls) / size,
        "f1": sum(f1_values) / size,
    }
    return report


def argmax_row(row: Sequence[float]) -> int:
    best = 0
    for index in range(1, len(row)):
        if row[index] > row[best]:
            best = index
    return best


def standard_deviation(values: Sequence[float]) -> float:
    if len(values) < 2:
        return 0.0
    mean = sum(values) / len(values)
    return math.sqrt(sum((value - mean) ** 2 for value in values) / len(values))


def sha256_file(path: str | Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


# ---------------------------------------------------------------------------
# 训练（lightgbm 延迟导入：无 ml extra 的环境仍可跑单测）
# ---------------------------------------------------------------------------
def _balanced_weights(labels: Sequence[int]) -> list[float]:
    """类频率倒数平衡权重（多分类 balanced 口径，由 Dataset weight 承载）。"""
    size = len(ML_CLASSES)
    counts = [0] * size
    for label in labels:
        counts[label] += 1
    total = len(labels)
    per_class = [total / (size * count) if count else 0.0 for count in counts]
    return [per_class[label] for label in labels]


def _as_numpy(matrix: Sequence[Sequence[float]]) -> object:
    """lightgbm 4.7+ 要求数据为 ndarray（list-of-list 已被收紧拒绝）；numpy 属 ml extra，延迟导入。"""
    import numpy as np  # noqa: PLC0415

    return np.asarray(matrix, dtype=np.float64)


def train_booster(
    train_matrix: Sequence[Sequence[float]],
    train_labels: Sequence[int],
    valid_matrix: Sequence[Sequence[float]],
    valid_labels: Sequence[int],
    seed: int,
) -> tuple[object, int]:
    """训练单 seed 模型（validation 仅早停），返回 (booster, best_iteration)。"""
    import lightgbm as lgb  # noqa: PLC0415 — ml extra 延迟导入

    params = {**HYPERPARAMS, "seed": seed}
    train_set = lgb.Dataset(_as_numpy(train_matrix), label=list(train_labels),
                            weight=_balanced_weights(train_labels))
    valid_set = lgb.Dataset(_as_numpy(valid_matrix), label=list(valid_labels),
                            weight=_balanced_weights(valid_labels), reference=train_set)
    booster = lgb.train(
        params,
        train_set,
        num_boost_round=NUM_BOOST_ROUND,
        valid_sets=[valid_set],
        callbacks=[lgb.early_stopping(EARLY_STOPPING_ROUNDS, verbose=False)],
    )
    return booster, booster.best_iteration or NUM_BOOST_ROUND


def predict_labels(booster: object, matrix: Sequence[Sequence[float]]) -> list[int]:
    probabilities = booster.predict(_as_numpy(matrix))
    return [argmax_row(row) for row in probabilities]


def month_of(timestamp: str) -> str:
    return timestamp[:7]


def rolling_month_splits(timestamps: Sequence[str]) -> list[tuple[str, list[int], list[int]]]:
    """train 内按月 expanding 折：(验证月, train_idx, eval_idx)；首折前累计 ROLLING_WARMUP_MONTHS 个月。"""
    months = sorted({month_of(timestamp) for timestamp in timestamps})
    folds: list[tuple[str, list[int], list[int]]] = []
    for fold_index in range(ROLLING_WARMUP_MONTHS, len(months) - 1):
        eval_month = months[fold_index]
        train_index = [i for i, ts in enumerate(timestamps) if month_of(ts) < eval_month]
        eval_index = [i for i, ts in enumerate(timestamps) if month_of(ts) == eval_month]
        if train_index and eval_index:
            folds.append((eval_month, train_index, eval_index))
    return folds


# ---------------------------------------------------------------------------
# Registry 条目（IF-A2→A1：SHA256 / 参数 / 数据哈希 / 3 seed 方差 / 版本建议值）
# ---------------------------------------------------------------------------
def registry_entry_markdown(name: str, summary: Mapping[str, object]) -> str:
    return "\n".join([
        f"## {name}",
        "",
        f"- 登记日期：{summary['registeredAt']}",
        f"- 模型文件：{', '.join(summary['modelFiles'])}（gitignored，本地 models/）",
        f"- SHA256：{json.dumps(summary['modelSha256'], ensure_ascii=False)}",
        f"- 特征：{summary['featureCount']} 列（`tools/features.py` FEATURE_NAMES，全因果窗）",
        f"- 类目：{', '.join(ML_CLASSES)}（C01/C02/C06 为规则领地，行级过滤）",
        f"- 超参（固定，无调参循环）：`{json.dumps(summary['hyperparams'], ensure_ascii=False)}`",
        f"- 训练数据：train {summary['trainRows']} 行；validation {summary['validationRows']} 行仅早停",
        f"- 数据哈希：{json.dumps(summary['dataSha256'], ensure_ascii=False)}",
        f"- 3 seed 方差（validation macro-F1）：std={summary['macroF1Std']:.6f}，"
        f"max−min={summary['macroF1Range']:.6f}，seeds={json.dumps(summary['seeds'])}",
        f"- rolling 月分割 macro-F1（train 内无偏参考，seed={summary['rollingSeed']}）："
        f"{json.dumps(summary['rollingMacroF1'], ensure_ascii=False)}",
        f"- detector_version 建议值：`{summary['detectorVersionHint']}`（模型命名空间，非检测器 v4/v5）",
        f"- 灰度开关：`H2_ML_ENABLED`（默认 false；ADR-001 灰度五条为启用前置）",
    ])


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="H2 Sentinel LightGBM trainer (T09/P1-9b)")
    parser.add_argument("--train-features", required=True)
    parser.add_argument("--train-labels", required=True, help="官方 06_train_row_labels.csv")
    parser.add_argument("--validation-features", required=True)
    parser.add_argument("--validation-labels", required=True, help="官方 07_validation_row_labels.csv")
    parser.add_argument("--models-dir", default="models")
    parser.add_argument("--name", default="h2-lgbm-row-v1")
    parser.add_argument("--seeds", default="1,2,3")
    parser.add_argument("--no-rolling", action="store_true", help="跳过 rolling 月分割评估")
    parser.add_argument("--registry-append", action="store_true",
                        help="将条目追加写入仓库根 MODELS_REGISTRY.md（默认仅打印）")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    seeds = tuple(int(item) for item in args.seeds.split(",") if item.strip())
    models_dir = Path(args.models_dir)
    models_dir.mkdir(parents=True, exist_ok=True)

    train_timestamps, train_x, train_y = join_features_labels(
        read_csv_rows(args.train_features), read_csv_rows(args.train_labels),
    )
    _valid_timestamps, valid_x, valid_y = join_features_labels(
        read_csv_rows(args.validation_features), read_csv_rows(args.validation_labels),
    )
    print(json.dumps({
        "stage": "joined",
        "trainRows": len(train_y),
        "validationRows": len(valid_y),
        "trainClassCounts": {
            ML_CLASSES[index]: sum(1 for label in train_y if label == index)
            for index in range(len(ML_CLASSES))
        },
        "validationClassCounts": {
            ML_CLASSES[index]: sum(1 for label in valid_y if label == index)
            for index in range(len(ML_CLASSES))
        },
    }, ensure_ascii=False))

    # 3 seed 训练（validation 仅早停）
    seed_results: list[dict[str, object]] = []
    macro_scores: list[float] = []
    model_files: list[str] = []
    model_sha256: dict[str, str] = {}
    for seed in seeds:
        booster, best_iteration = train_booster(train_x, train_y, valid_x, valid_y, seed)
        predictions = predict_labels(booster, valid_x)
        matrix = confusion_matrix(valid_y, predictions, len(ML_CLASSES))
        report = classification_report(matrix)
        macro = report["macro"]["f1"]
        macro_scores.append(macro)
        model_path = models_dir / f"{args.name}-seed{seed}.txt"
        booster.save_model(str(model_path))
        model_files.append(model_path.name)
        model_sha256[model_path.name] = sha256_file(model_path)
        seed_results.append({
            "seed": seed,
            "bestIteration": best_iteration,
            "validationMacroF1": macro,
            "validationReport": report,
            "validationConfusion": matrix,
        })
        print(json.dumps({"stage": "seed-trained", "seed": seed,
                          "bestIteration": best_iteration, "validationMacroF1": macro},
                         ensure_ascii=False))

    # rolling 月分割（train 内无偏参考，仅用第一个 seed）
    rolling_summary: dict[str, float] = {}
    if not args.no_rolling:
        rolling_seed = seeds[0]
        for eval_month, train_index, eval_index in rolling_month_splits(train_timestamps):
            fold_train_x = [train_x[i] for i in train_index]
            fold_train_y = [train_y[i] for i in train_index]
            fold_eval_x = [train_x[i] for i in eval_index]
            fold_eval_y = [train_y[i] for i in eval_index]
            booster, _ = train_booster(fold_train_x, fold_train_y, fold_eval_x, fold_eval_y, rolling_seed)
            fold_report = classification_report(
                confusion_matrix(fold_eval_y, predict_labels(booster, fold_eval_x), len(ML_CLASSES)),
            )
            rolling_summary[eval_month] = fold_report["macro"]["f1"]
            print(json.dumps({"stage": "rolling-fold", "month": eval_month,
                              "macroF1": fold_report["macro"]["f1"]}, ensure_ascii=False))

    summary = {
        "registeredAt": "2026-08-29",
        "name": args.name,
        "modelFiles": model_files,
        "modelSha256": model_sha256,
        "featureCount": len(FEATURE_NAMES),
        "hyperparams": {**HYPERPARAMS, "numBoostRound": NUM_BOOST_ROUND,
                        "earlyStoppingRounds": EARLY_STOPPING_ROUNDS},
        "trainRows": len(train_y),
        "validationRows": len(valid_y),
        "dataSha256": {
            "trainFeatures": sha256_file(args.train_features),
            "trainLabels": sha256_file(args.train_labels),
            "validationFeatures": sha256_file(args.validation_features),
            "validationLabels": sha256_file(args.validation_labels),
        },
        "seeds": list(seeds),
        "macroF1Std": standard_deviation(macro_scores),
        "macroF1Range": max(macro_scores) - min(macro_scores),
        "rollingSeed": seeds[0],
        "rollingMacroF1": rolling_summary,
        "detectorVersionHint": DETECTOR_VERSION_HINT,
        "validationCaveat": "validation 指标来自早停集，非无偏估计；无偏参考见 rollingMacroF1",
    }

    report_path = models_dir / f"train-report-{args.name}.json"
    report_path.write_text(
        json.dumps({"summary": summary, "seeds": seed_results}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    if args.registry_append:
        registry_path = Path("MODELS_REGISTRY.md")
        if registry_path.exists():
            existing = registry_path.read_text(encoding="utf-8")
            if f"## {args.name}" in existing:
                raise SystemExit(f"MODELS_REGISTRY.md already contains entry {args.name!r}; refusing duplicate")
            registry_path.write_text(existing.rstrip("\n") + "\n\n" + registry_entry_markdown(args.name, summary) + "\n", encoding="utf-8")
        else:
            registry_path.write_text(
                "# 模型登记簿（MODELS_REGISTRY）\n\n"
                "> A2 领土：ML 模型产物不入库（models/ gitignored），本文件登记供 A1 接线（T11）只读消费；"
                "契约 = internal-a.md IF-A2→A1。\n\n" + registry_entry_markdown(args.name, summary) + "\n",
                encoding="utf-8",
            )
    print(json.dumps({
        "stage": "done",
        "report": str(report_path),
        "validationMacroF1": {str(seed): result["validationMacroF1"] for seed, result in zip(seeds, seed_results)},
        "macroF1Std": summary["macroF1Std"],
        "registryAppended": args.registry_append,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
