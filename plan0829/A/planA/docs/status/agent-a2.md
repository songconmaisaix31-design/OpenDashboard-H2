# 状态文件（Agent A2 · 评估与 ML 域）

> 全量重写式维护；每次任务完成或会话结束更新。

## 当前契约版本

internal-a.md v1.0 / api.md v1.0

## 当前任务

**T09（P1-9b 训练+登记）已完成，待下一 M-Gate 合并**（feat/a2-evalml @ 4b3ea51）。
**A2 任务池任务（T02/T03b/T08/T09）已全部完成**——剩余相关项仅 T11（A1 接线，消费本域交付物）。

## 已完成任务

### T09 ｜ P1-9b 训练管线 + 3 seed + MODELS_REGISTRY（2026-08-29 完成 @ 4b3ea51）

- **交付**：`tools/train_lightgbm.py`（join 对齐错位即红/纯 py 指标/rolling 月分割/balanced 权重/lightgbm 延迟导入）
  + `tools/tests/test_train_lightgbm.py`（16 例）+ `MODELS_REGISTRY.md` 首条 + `models/` 产物（gitignored）
- **训练结果**（`models/train-report-h2-lgbm-row-v1.json`）：
  - 数据对账：train 511,281 行 / validation 126,063 行（= 06/07 全量 − C01/C02/C06 规则领地行）
  - 类目 {NORMAL, C03, C04, C05, C07}；3 seed validation macro-F1 **全 1.0**（std=0）；
    rolling 月分割（无偏参考）：2025-07=0.8，其余四折=1.0
  - **1.0 成因消融**：去 system_alarm_count + 全部日志邻近特征后仍 1.0 → 非泄漏驱动；
    行级标签由运行量派生、裕量特征族即判别面（gain top 全为裕量/滑窗物理量）。事件级泛化考验移交 T11 灰度
- **Registry 五要素**：SHA256×3 / 固定超参 / 数据哈希×4 / 3 seed 方差 / detector_version 建议值
  `h2-ml-row-lgbm-v1`；注记含成因分析与环境坑
- **环境坑两个**（Registry 注记在案）：lightgbm 4.7 data 须 ndarray（约束 <5 内 4.5→4.7 漂移，`_as_numpy` 处理）；
  venv lightgbm 曾包损坏（缺 `__init__.py`/`basic.py` → import 得空 namespace，`module has no attribute` 症状），
  `uv sync --reinstall-package lightgbm --locked --extra ml` 修复
- **特征全量导出**：models/features-train.csv（525,600 行）/ features-validation.csv（129,600 行），分钟级纯 py 数分钟

### T08 ｜ P1-9a 特征工程（2026-08-29 完成 @ 652696a，已随 gate-i1 入整合线 3c2c22a）

- 六族 69 特征全因果窗 + docstring/--catalog 双清单 + 23 例单测；详见 git 提交

### T03b ｜ P0-5 指标侧（2026-08-29 完成 @ d53a939，已随 gate-i1 入整合线）

- 报告 schema v3 + detectionExpectation 节 + 哨兵 canonical 防篡改；实测 C05 lead=3min>0、
  C07=0 待合 A1-T03a、5 类检出率 0.76（overdue 名单在案）

### T02 ｜ P0-4 误报尺子（2026-08-29 完成 @ 21a5029，已随 gate-i1 入整合线）

- 基线全零误报（77 窗口 0 FP @h2-rules-v2）；check 门禁正/负双向验证过

## 断点（下一会话从这里继续）

1. **A2 任务池已清**：无下一任务。后续若被召唤，可能场景：
   - T11 灰度联调支援（A1 主导接线，A2 提供特征/模型口径答疑；IF-A2→A1 交付物 = MODELS_REGISTRY + FEATURE_NAMES）
   - I3 整合门（D9：T08-T09 中间态并入）或 S6 联合冻结的证据重生成（评估/尺子在 clean commit 复跑）
   - 企业答复 Q2（官方匹配规则）落地后的指标口径调整（走契约变更流程）
2. **给 A1/T11 的交接要点**：模型在 models/h2-lgbm-row-v1-seed{1,2,3}.txt（建议用 seed1 或三模型投票，
   由 A1 定）；行级推理特征变换 = tools/features.py compute_feature_rows（推理侧逐行流式可用，全因果窗）；
   minimum_confidence 建议从 0.5 起按灰度门禁调；C01/C02/C06 行模型未学（规则领地）
3. worktree 复跑清单（三坑不变）：日志树外 / 先 uv sync --locked --extra dev（+ml 按需）/ 根目录 npm ci

## 待确认决策（等指挥官，均已报备）

1. **check-all 接入**（change-requests [A2] #1）：B 线落地后接入 vs 授权 A2 先建
2. **p2-base tag 指向**：现指 a4c6168 非 7007e3d——是否移动由你定
3. **schemaVersion 2→3**（T03b）：B 线若有 v2 硬编码消费方请告知
4. **tools/tests/ 领土扩展**（T08/T09 单测目录）：待追认或并入契约 v1.1
5. **（已处置备案）T09 提交曾误落 codex/p2-integration**：会话中主树被切至整合分支（gate-i1 进行中），
   A2 未见切换即提交 → 发现后备份摘除（integration 顶端恢复 9870840）、cherry-pick 回 feat/a2-evalml（4b3ea51）；
   教训：每次 commit 前先 `git branch --show-current` 核对

## 已提交的变更请求指针

- change-requests.md 两条 [A2]（2026-08-29）：check-all.mjs 属 B 领土；T01 白名单缺口已修复备案

## 附注（git 操作记录，供 M-Gate 审阅）

- feat/a2-evalml 链：…→652696a→55a7c34→（fe9bb9c 用户推进）→**4b3ea51**（T09）
- T09 训练/评估/消融全程在共享主树（validation/ + tools/ + models/ 均 A2 领土或 ignored，无越界）；
  模型与特征 CSV 落 models/（gitignored）
- gate-i1（用户执行）：A2 三任务已入整合线 3c2c22a；integration 顶端 9870840 未被本会话污染（已恢复）
