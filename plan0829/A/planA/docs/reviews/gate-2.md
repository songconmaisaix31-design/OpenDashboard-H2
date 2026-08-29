# M-Gate 前增量评审报告（A3 出具 ｜ 2026-08-29）

> 评审人：A3 ｜ 依据：internal-a.md v1.0「IF-A3→用户」｜ 性质：**gate-1 放行结论的增量复核**——M-Gate 1 合并尚未执行，但三分支在 gate-1 评审清单之后各有新提交，本报告把评审覆盖面追平到当前全部待合并内容，供指挥官合并时直接使用。
> 方法：只读 diff + 隔离 worktree 纯树合并预演 + 独立复跑；不代改任何他人文件。

## 0. 结论

**🟢 增量放行，gate-1 的合并建议（A1→A2→A3）与合并序维持不变。** 合并后必办仍以 gate-1 §4.1 为准（官方门禁补跑），另见本文 §4 新增项。

## 1. 增量提交清单（gate-1 清单之外）

| 分支 | 新增提交 | 内容 | 类型 |
|---|---|---|---|
| feat/a1-rules | `9155fd3` | T05 C05 去签名带（相对带 [0.55,0.7]×限额 + quota 排他 + run 平台锚定） | 代码+测试+阈值 |
| feat/a2-evalml | `08bac29` → `d53a939` → `52b6dd1` | T02 完成收尾 → **T03b lead_time/10min 检出率指标**（schema v3）→ T03b 收尾（实测值+断点移交 T08） | docs → 代码+测试 → docs |
| feat/a3-diag | `c4ca38a` | gate-1 评审报告入库（A3 自身，自评合规：docs/reviews/** 领土内） | docs |

## 2. 越界检查 ✅（2 条标注）

- **A1 T05**：`detection/rules.py`、`detection-thresholds.json`、`tests/test_detection_pipeline.py`——全部 A1 领土。校准块合规：`signatureBandChange` 四要素齐全（from/to/rationale/exclusivityEvidence，含 21 段非事件平台与 C07 quota 空档实证）。**标注 a**：旧 `toleranceRationale` 字段仍描述已删除的 1 kW 带（文档漂移，建议 A1 下次判据改动顺带更新）。
- **A2 T03b**：`validation/{evaluate.mjs, lib/metrics.mjs, overfit-sentinel.mjs}`——validation/ 域内；测试落在 `tests/h2-sentinel/contract/`（新增 1 + 改 1）。**标注 b**：`validation/overfit-sentinel.mjs` 与 `tests/h2-sentinel/**` 不在领土表字面列举（表列 evaluate.mjs/normal-context-regression.mjs/lib/**/baseline/**），属"配套防篡改与契约测试随主产出"的合理解释（同 gate-1 对 A1 测试追加的"T03a 裁定"先例）；**建议在 change-requests.md 备案一次领土表解释**，由指挥官追认，避免后续争议。未触碰 `packages/h2-contracts/**` ✅（schemaVersion 2→3 是 evaluate 报告自有字段，非共享契约包）。
- **A2 52b6dd1**：纯 docs；提交信息已声明 plan.md 夹带 A1/A3 状态行（共享看板属性）——处置权在指挥官，本次接受。
- **互斥矩阵**：仍无同文件交叉。

## 3. 口径核对（IF-A2→A1 接口，ADR-004 / api.md IF-4）✅

T03b `detectionExpectationMetrics` 实现与契约字面一致：

- `lead_time_minutes` 仅 C05/C07（`ADVANCE_WARNING_CODES`），值 = first_detection − GT start；unmeasurable 单列不编造；
- 5 类清单从 `ANOMALY_CODES` 单一事实源派生（防手写漂移）；`detection_within_10min_rate` 分母 = 该 5 类全部 GT（FN 计入）；空集显式 `null`；
- 负值（先于 start 检出）计入 within-window，注释给出理由——保守方向正确；
- A2 实测中间态（52b6dd1）：C05=3min>0 ✅、C07=0（待 A1 T03a 合并生效）、5 类 0.76（待 T04-T07）——与任务依赖链预期一致，**不构成门禁回退**（基线期指标，改进路径即 T04-T07 本身）。

## 4. 独立验证（隔离 worktree，2026-08-29 本会话）

| 验证项 | 结果 |
|---|---|
| 三方合并预演（a1@9155fd3 + a2@d53a939 + a3@c4ca38a，按 A1→A2→A3 序） | ✅ 无冲突干净合并 |
| 纯合并树全量 pytest | ✅ **195 passed** |
| 纯合并树契约测试（`tests/h2-sentinel/contract/`） | ✅ **83/83**（与 A2 声称一致） |
| h2:qa（web launcher 部分） | 主树 **6/6 PASS**；预演树 4 FAIL 均为 `npm ci` 未装（环境性，与三分支改动正交——A2 在 52b6dd1 亦独立记录同结论） |

**方法修正披露（重要）**：gate-1 时期的合并预演 pytest 受 venv editable 指向主树 src 的影响，实际执行的是"主树代码 + 预演树测试"混合体；当时主树恰含 A3 在途文件，故结论未受实质影响。**本次预演以 `PYTHONPATH` 强制预演树 src 优先，为纯合并树证据**。后续所有 worktree 验证（含 D14 证据重生成）须沿用纯树方法（A2 记录的三坑：日志树外/uv sync/npm ci 与此互证）。

## 5. 待办与移交

1. **合并后必办**（承 gate-1 §4.1）：A2 冻结基线已收尾（@08bac29）；A1 补跑 evaluate（现含 T03b 指标，F1/lead_time/误报不升）；A3 对账复验 + 尺子交叉验证。
2. **待裁决累计 4 条**：CR 3 条（[A2]×2、[A3]×1）+ [A2] 新增 schemaVersion 2→3 通报（B 线 v2 硬编码消费方确认）；另加本报告标注 b 的领土表解释备案建议。
3. p2-base tag 指向（a4c6168≠7007e3d）与 A1 detector_version 3 文件——仍待指挥官。
4. gate-3+：A1 T07（C04/C07 判定矩阵）与 A2 T08-T09（特征/训练）为下一批，届时另出报告。
