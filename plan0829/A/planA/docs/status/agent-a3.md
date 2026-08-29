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

- **M-Gate 1 合并已完成**（整合人 [I]：0dea5c1 a1 → 3c2c22a a2 → 6cabaa3 a3 → dc8e7b1 a2-T09）；**gate-5 追认已出具** `feat/a3-diag @ d65ff66`：🟢 放行——T09 红线过 + **四件套门禁全绿**（F1=0.9718 恰回基线 / N01-N07 尺子 77 窗口 0 FP 0→0 / lead_time C05+C07 20 事件 allPositive——C07=2min 标志 T03a 前瞻判据在 VALIDATION 生效 / 5 类检出率 0.76 持平）
- **A3 合并后必办已执行** ✅：对账复验 TRAIN 280 true/0 false + VAL 70/0（与 T10 一致）；尺子交叉验证 passed；evaluate 已代跑留档（建议 A2 择机重冻结基线至新检测器版本，0→0 下语义等价、其裁量）
- **gate-6 T11 评审已出具** `feat/a3-diag`（gate-6.md）：🟢 放行合并 feat/a1-t11-ml + **D12 go/no-go 建议 go**（默认 off + 开关就绪）——三态复跑（无 lgbm 207+3skip 反证零依赖 / 有 lgbm 无模型 208+2fail / 补模型 **210 绿**）；cherry-pick d542c4c 门审**接受**（=指挥官 87df5c3 原文，条件：A2 追认 + 合并去重注意）；灰度五条采信（消歧证据 rawCount 75→91 / merged 72=72）；非阻塞建议：2 个模型依赖测试加 skipif
- **下一评审对象**：M-Gate 3 合并 feat/a1-t11-ml（指挥官执行）后的增量追认；此后 A 线仅剩 T14（D14 联合冻结，[ALL]）
- 待裁决累计：CR 3 条 + schemaVersion 2→3 通报 + p2-base tag 指向 + detector_version 3 文件 + 标注 a/b（清单见 gate-5 §4）
- 主树检出 codex/p2-integration（整合线使用），A3 产出全部经 a3-work worktree 入 feat/a3-diag（HEAD d65ff66）
- A3 专属 worktree = `C:/Users/86156/AppData/Local/Temp/a3-work`；主树检出 feat/a2-evalml @ 52b6dd1，残留 docs 状态文件 modified 按 gate-1 §4.4 保留待指挥官随合并提交

## 待确认决策

- change-requests.md 3 条待裁决（[A2]×2、[A3]×1 IF-2 ref_id）
- p2-base tag 指向 a4c6168≠7007e3d（A2 发现，T01 验收语义）
- A1 detector_version v4→v5 涉 3 处非其领土文件

## 已提交的变更请求指针

- [A3] 2026-08-29 IF-2 ref_id 对 operation_log 源需澄清（change-requests.md）
