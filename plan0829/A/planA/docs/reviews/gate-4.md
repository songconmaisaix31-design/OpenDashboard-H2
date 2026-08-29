# M-Gate 前增量评审报告（A3 出具 ｜ 2026-08-29）

> 评审人：A3 ｜ 依据：internal-a.md v1.0「IF-A3→用户」｜ 性质：**gate-3 放行结论的增量复核**——追平 A2 T08（特征工程）。合并时径引 gate-1/2/3/4。
> 方法：只读 diff + 隔离 worktree 纯树合并预演（PYTHONPATH 强制预演树 src）；不代改任何他人文件。

## 0. 结论

**🟢 增量放行，合并建议与合并序（A1→A2→A3）维持不变。**

## 1. 增量提交清单（gate-3 清单之外）

| 分支 | 新增提交 | 内容 | 类型 |
|---|---|---|---|
| feat/a2-evalml | `652696a` | **T08 特征工程**：`tools/features.py`（479 行，六族 69 特征 + CLI + catalog）+ `tools/tests/test_features.py`（23 例） | 代码+测试 |
| feat/a2-evalml | `55a7c34` | T08 收尾 docs（plan.md T08 行 + agent-a2.md 断点移交 T09） | docs |

## 2. 领土与红线核查 ✅

- **领土**：`tools/features.py` 在 A2 领土表**字面列举内**（`tools/{features,train_lightgbm}.py`）；`tools/tests/test_features.py` 为配套测试（沿 gate-2 标注 b 解释，仍待指挥官备案追认）。
- **泄漏红线（重点核查，宪法级）**：
  - 全因果窗：滑窗/速率/翻转只回看过去，防标签泄漏，流式推理可实时计算；
  - 日志邻近特征 `(t-90, t-20]` 带 split 过滤（train/validation 不串集）+ t-20 截断保守 gap；
  - 守 ADR-002：不消费 `13_normal_context.csv`（N01-N07 只作尺子不作训练增强）；
  - 缺失传播 `None` 禁止编造 0；效率曲线/约束常量不入模（02§4.5）；
  - 纯标准库 + 确定性输出（3 seed 训练复现基础）。
- 特征面设计合理：族 3/4（速率/裕量）与 C05/C07 前瞻判据同源物理量——规则面与 ML 面共享物理量，ML 校验层（ADR-001）语义一致。

## 3. 独立验证（2026-08-29 本会话）

| 验证项 | 结果 |
|---|---|
| T08 单测（主树 feat/a2-evalml） | ✅ 23/23 |
| 三方合并预演（a1@6960ff3 + a2@55a7c34 + a3@732341d） | ✅ 无冲突干净合并 |
| 纯合并树 services pytest | ✅ **201 passed** |
| 纯合并树 tools/tests | ✅ **23 passed** |
| 纯合并树契约测试 | ✅ **83/83** |

## 4. 下一批关注点（gate-5 预置）

1. **T09 训练（A2）**：`train_lightgbm.py` 消费特征 CSV——**训练数据须仅 TRAIN split 行级标签**；`MODELS_REGISTRY.md` 登记四要素（SHA256/参数/训练数据哈希/3 seed 方差 + detector_version 建议值）；模型文件 gitignored。`H2_ML_ENABLED` 默认 false 不动（宪法）。
2. **T07 判定矩阵（A1）**：C04/C07 三分支覆盖单测；A1 已自列验收口径注意项。
3. 待裁决清单不变（CR 3 条 + schemaVersion 通报 + p2-base tag + detector_version + 标注 a/b）。
