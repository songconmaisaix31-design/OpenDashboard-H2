# 状态文件（Agent A2 · 评估与 ML 域）

> 全量重写式维护；每次任务完成或会话结束更新。

## 当前契约版本

internal-a.md v1.0 / api.md v1.0

## 当前任务

**T02（P0-4 误报尺子）已完成，待 M-Gate 合并**（feat/a2-evalml @ 21a5029，2 个 T02 提交）

## 已完成任务

### T02 ｜ P0-4 N01-N07 合理工况误报回归资产（2026-08-29 完成）

- **工具**：`validation/normal-context-regression.mjs`（report/freeze/check 三模式；全模式 clean-tree 证据纪律）
- **管线**：与 evaluate.mjs 完全相同的进程内检测（Local launcher 逐 UTC 日 chunk，train 125 日 + validation 51 日，
  窗口日 ±1 缓冲）；同码 2 分钟合并；合并事件与窗口闭区间相交计 FP；N01-N07 分列 + 总览
- **冻结基线**（@21a5029，运行时 = deterministic-c01-c07-v4 / **h2-rules-v2** / official-constraints-v1，与 D1 的
  F1=0.9718 证据同源检测器）：
  **N01-N07 每列 11 窗口 0 FP，总览 77 窗口 0 FP（fpRate=0）**；管线同批真实产出 124 原始/121 合并预测，
  证明 0 FP 是尺子实测而非空跑。基线：`validation/baseline/normal-context-baseline.json`（gitignored）。
- **门禁验证**：check 正向 passed/exit 0；篡改基线（N03→-1）failed/exit 1 且违规列精确命中；基线已还原。
  证据报告：`tests/h2-sentinel/reports/generated/normal-context-regression-21a50293c316-{275ee495,fb01b0e8,d9541c40}*/`
- **lib 增量**：NORMAL_CONTEXTS 契约 + utcDays 日集合选择 + candidate.mjs 白名单补 validation/baseline/（T01 缺口）
- **离线验证**：契约测试 75/75；纯函数与流式分支冒烟全绿
- **A-1 卡验收对照**：一条命令复现分列误报率 ✓；基线冻结 ✓；"误报不得上升"门禁 ✓（check 模式）；
  check-all 接入 ✗→已登记 change-requests 待裁决（B 领土）
- **执行注记**：冻结在临时 worktree（21a5029 干净检出）完成——共享树含他人在途文件无法过 clean 门禁；
  两个坑备记：① worktree 树内任何杂文件（如 tee 日志）会弄脏判定；② 首跑 uv sync 超 launcher 60s 就绪窗，需先 `uv sync --locked --extra dev`

## 断点（下一会话从这里继续）

1. 下一任务 **T03b**（P0-5 指标侧）：`evaluate.mjs` 新增 `lead_time_minutes`（C05/C07，first_detection − start，
   目标 >0）与 10 分钟检出率（C01/C02/C03/C04/C06，目标 100%）；口径 = ADR-004 + api.md IF-4，禁擅改；
   实现挂 evaluate.mjs 报告 metrics 段；与 A1 的 T04-T07 并行互不等待
2. 之后 T08（features.py，依赖 T04 已完成 ✓）→ T09（train_lightgbm.py + 3 seed + MODELS_REGISTRY；
   只用 train+validation，禁测试集；N01-N07 不作训练增强 ADR-002）
3. 工作树若再被他人在途文件占满 → 复用本次 worktree 方案（预 uv sync、日志放树外）

## 待确认决策（等指挥官，均已报备）

1. **check-all 接入**（change-requests [A2] #1）：B 线落地后接入 vs 授权 A2 先建（A2 倾向前者）
2. **p2-base tag 指向**：现指 a4c6168（B 线契约），非 7007e3d（D1 证据绑定点）——是否移动由你定
3. ~~共享工作树协调~~：A1 已自建 worktree（Temp/a1-work），建议 A3/后续会话沿用

## 已提交的变更请求指针

- change-requests.md 两条 [A2]（2026-08-29）：check-all.mjs 属 B 领土无法接入；T01 白名单缺口已在 A2 领土内修复备案

## 附注（git 操作记录，供 M-Gate 审阅）

- plan0829 提交曾误落 feat/a1-rules（父含 A1-T03a）→ 重嫁接为 41aedd8（父=7007e3d），A1 分支恢复 bf4277e；
  后 A1-T04 stranded 副本 f61802d 落本分支 → 已剔除，feat/a2-evalml = 41aedd8→69d78cd→21a5029 纯 A2 链
- 基线冻结语义：T02 基线绑定 **7007e3d 检测器**（D1 同源）；A1-T03a/T04 判据改动此后一律以 `--mode check`
  过尺子（N01-N07 不得高于全零基线，即任何误报即红）
