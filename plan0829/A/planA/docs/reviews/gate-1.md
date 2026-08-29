# M-Gate 1 评审报告（A3 出具 ｜ 2026-08-29）

> 评审人：A3 ｜ 依据：internal-a.md v1.0「IF-A3→用户」｜ 评审对象：三分支待合并提交（基点 7007e3d/41aedd8）
> 方法：只读 diff + 独立 worktree 复跑测试 + 三方合并预演；不代改任何他人文件
> **结论：🟢 建议放行合并（顺序 A1→A2→A3），合并后需补跑官方门禁五层（见 §4）**

## 1. 待合并清单

| 分支 | HEAD | 提交 | 内容 |
|---|---|---|---|
| feat/a1-rules | `52d7435` | bf4277e + 52d7435 | T03a C05/C07 前瞻判据 + T04 C03 去签名带（判据+阈值+校准块+4 测试） |
| feat/a2-evalml | `21a5029` | 69d78cd + 21a5029 | T02 N01-N07 误报回归尺子（三模式）+ 断点状态（基座 41aedd8，有意隔离判据改动） |
| feat/a3-diag | `e3f62e7` | c05d419 + e3f62e7 | T10 影响量化四元组（C01/C02 修订 v2）+ T12 根因数据驱动（IF-2 冻结） |

## 2. 越界检查 ✅ 全过

- **A1**：改动 = `detection/rules.py`、`detection/c03.py`、`detection-thresholds.json`、`tests/test_detection_pipeline.py`（最小追加模式，T03a 裁定沿用）——全部 A1 领土。
- **A2**：改动 = `validation/normal-context-regression.mjs`、`validation/lib/{candidate,official-sources,official-timeseries}.mjs`、`validation/README.md`、状态文档——全部 A2 领土。
- **A3**：改动 = `impact/**`、`diagnosis/**`、`tests/test_impact*.py`、`test_root_cause.py`、`impact-formulas.json`（A3 独占）、`h2-contracts` schema/TS（共享-增量授权路径，加法式 + h2:qa 6/6 + 已列公告项）。
- **互斥矩阵**：无同文件交叉；`detection-thresholds.json` 仅 A1、`impact-formulas.json` 仅 A3、`validation/**` 仅 A2。

## 3. 门禁证据核对（独立复跑，worktree 隔离）

| 验证项 | 结果 |
|---|---|
| feat/a1-rules 全量 pytest（HEAD=52d7435） | ✅ exit 0 全绿（含 T03a+T04 新测试；A1 自报 33/33 检测测试同树绿，与本次一致） |
| feat/a2-evalml 全量 pytest（HEAD=21a5029） | ✅ exit 0 全绿 |
| feat/a3-diag 全量 pytest（HEAD=e3f62e7） | ✅ 184 绿（T10 会话 174 + T12 会话 10） |
| **三方合并预演**（a1 + a3 + 21a5029，无冲突） | ✅ 合并干净 + 全量 pytest exit 0 |
| h2:qa（含 A3 契约加法式变更） | ✅ 6/6 PASS（本会话两次） |
| ruff（A1/A2/A3 各自改动文件） | ✅ 0（A1 自报 + A2/A3 会话内） |

声明核对：A1 声称的 TRAIN 40/40 命中/零偏差/N05-N07 零候选、A2 声称的契约测试 75/75 与纯函数冒烟、A3 的对账 280+70/回溯 61/61——均为各自会话产物且与本评审独立复跑不矛盾；**官方 evaluate.mjs 与 normal-context-regression 门禁运行尚欠**（见 §4）。

## 4. 风险提示与合并后必办

1. **官方门禁欠账（最重要）**：A1 的 T03a/T04 与 A3 的 T10/T12 均未跑 `evaluate.mjs` / `normal-context-regression.mjs` 官方门禁（要求 clean tracked tree，被并行 WIP 阻塞）。**合并入 codex/p2-algo 后第一件事**：① A2 冻结基线（`--mode freeze` → `--mode check`）；② A1 补跑 evaluate（F1/FN/误报不升）；③ A3 补跑对账与尺子交叉验证。
2. **已处置事故（记录在案）**：T04 曾误落 feat/a2-evalml（f61802d，A2 切换共享分支所致）；A1 已在 feat/a1-rules 重建为 52d7435，A2 已 `Reset to 21a5029`（reflog 可溯）。**根因=三 Agent 共享单工作区**，建议：后续各会话用隔离 worktree（本次三会话实际已各自如此），或由指挥官统一在会话边界切分支。
3. **待裁决清单（合并前后均可）**：change-requests.md 3 条（[A2]×2 check-all 接入/白名单备案、[A3]×1 IF-2 ref_id 口径）；A1 的 detector_version v4→v5 需动 3 处非 A1 领土文件（vocabulary.py:399 / settings.py:12 / test_official_contract.py:79）；**p2-base tag 现指向 a4c6168 而非 7007e3d**（T01 验收语义需指挥官确认）。
4. **A3 主树在途文件**：A3 的代码改动已全部在 feat/a3-diag，主树残留的同内容工作副本将于本报告提交后由 A3 自行清理（revert 我的 tracked 改动 + 删除我的 untracked 新文件），以解除 A2 冻结阻塞；plan.md/状态文档的勾选改动保留待指挥官随合并提交。
5. **B 线公告**（合并后随 I1 整合同步）：① impact-formulas.json 新增 C01/C02 类块；② h2-contracts 新增 optional rootCauseCitations + H2RootCauseCitation。

## 5. 建议合并序

```
codex/p2-algo (41aedd8)
  ├─ merge feat/a1-rules  → 跑 check-all + 检测门禁
  ├─ merge feat/a2-evalml → A2 冻结基线 + 尺子 check
  └─ merge feat/a3-diag   → 对账/回溯复验
→ 全绿后按 I1 流程交轮值整合人 B
```
