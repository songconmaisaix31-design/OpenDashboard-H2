# 状态文件（Agent A3 · 诊断与支撑域 + 评审）

> 全量重写式维护；每次任务完成或会话结束更新。

## 当前契约版本

internal-a.md v1.0 / api.md v1.0（未变；[A3] 澄清请求 1 条待裁决）

## 当前任务

无进行中任务。T13 gate-1 已出具，等指挥官执行合并。

## 已完成任务

- **T10（P0-7 影响量化口径复核）** ✅ `feat/a3-diag @ c05d419`：7/7 四元组（`impact/QUADRUPLES.md`），TRAIN 280/280 + VALIDATION 70/70 对账全绿；C01/C02 修订 v2（TRAIN 推导）；工具 `impact/reconcile.py`
- **T12（P1-8 根因数据驱动 + IF-2 冻结）** ✅ `feat/a3-diag @ e3f62e7`：五模式归因 `[start−60,start−5]`（TRAIN 50/50 推导）、ref_id=OP-合成键（77/77 唯一）、rootCauseCitations（schema 加法式，h2:qa 6/6）；基线 TRAIN 17.9%/VAL 15.7%，回溯断言 61/61（`diagnosis/ROOT_CAUSE.md`）
- **T13 gate-1（M-Gate 1 评审）** ✅ 2026-08-29 `docs/reviews/gate-1.md`：🟢 放行建议（A1→A2→A3）；报告已入库 `feat/a3-diag @ c4ca38a`（主树 untracked 副本已按 §4.4 清理）
  - 独立验证：三分支各自 pytest 全绿 + 三方合并预演无冲突全绿 + h2:qa 6/6
  - 越界检查：A1/A2/A3 全过，无同文件交叉
  - 记录：f61802d 误提交事故（A1 重建 52d7435 + A2 Reset 21a5029，reflog 可溯，已闭环）
  - 风险 5 项：官方门禁欠账（合并后先跑）、共享工作区纪律、3 条 CR + detector_version 3 文件 + p2-base tag 指向待裁决、A3 主树已清理、B 线公告 2 条
  - 本会话补核（gate-1 清单外新提交）：A1 T05（9155fd3）校准块 ✅ signatureBandChange 四要素齐全；遗留小瑕疵=旧 `toleranceRationale` 仍描述已删除的 1 kW 带（A1 领土，gate-2 提出）

## 断点

- **等指挥官**：按 gate-3 §0（承 gate-1/2）执行三分支合并（A1→A2→A3）→ 合并后补跑官方门禁（A1 evaluate 含 T03b 指标+T04-T06 判据 / A3 对账复验 + 尺子交叉验证）
- **gate-3 增量评审已出具** `feat/a3-diag`（gate-3.md）：追平 A1 T06（6960ff3，T04-T06 三连全完成），🟢 维持放行；纯树合并预演 pytest **201** + 契约 83/83 绿；T06 校准块双段 signatureBandChange 四要素 ✅
- 评审覆盖现状：gate-1（T02/T03a/T04/T10/T12）+ gate-2（T05/T03b）+ gate-3（T06）+ **gate-4（A2 T08 特征工程 652696a/55a7c34：领土字面内 ✅、泄漏红线核查过——全因果窗/日志 split 过滤/守 ADR-002，纯树预演 201+23+83/83 绿）**= 当前全部待合并提交已过审
- 待裁决累计：CR 3 条 + schemaVersion 2→3 通报 + p2-base tag 指向 + A1 detector_version 3 文件 + gate-2 标注 b 领土表备案；gate-2 标注 a（C05 toleranceRationale 漂移）维持待修
- gate-5 预置关注：T09 训练仅 TRAIN split + MODELS_REGISTRY 四要素；T07 判定矩阵验收口径
- A3 专属 worktree = `C:/Users/86156/AppData/Local/Temp/a3-work`；主树检出 feat/a2-evalml @ 52b6dd1，残留 docs 状态文件 modified 按 gate-1 §4.4 保留待指挥官随合并提交

## 待确认决策

- change-requests.md 3 条待裁决（[A2]×2、[A3]×1 IF-2 ref_id）
- p2-base tag 指向 a4c6168≠7007e3d（A2 发现，T01 验收语义）
- A1 detector_version v4→v5 涉 3 处非其领土文件

## 已提交的变更请求指针

- [A3] 2026-08-29 IF-2 ref_id 对 operation_log 源需澄清（change-requests.md）
