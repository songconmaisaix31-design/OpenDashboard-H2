# 状态文件（Agent A1 · 规则域）

> 全量重写式维护；每次任务完成或会话结束更新。

## 当前契约版本

internal-a.md v1.0 / api.md v1.0

## 当前任务

T03a 已完成待合并（commit bf4277e @ feat/a1-rules），等待指挥官指令

## 已完成任务

- **T03a**（2026-08-29，bf4277e）：`detection/rules.py` C05/C07 前瞻判据 + `detection-thresholds.json` 阈值与校准块。
  - C05 前瞻：静态低配额未触发时，15 行滑窗 `grid_*_energy_used_kwh_day` 差分速率外推 `grid_*_energy_remaining_kwh` 将于当日日终前耗尽（严格早于）的单侧方向预警；共用方向化 300kW±1kW 签名门（签名带去除属 T05，本任务不触碰）。
  - C07 前瞻：SOC 15 行滑窗速率 × 30min 视界外推将越 `socTargetDeviationPct` 且与当前偏差同向 → 预警；共用 reserve≥350 门。
  - C07 aggregation.confirmationRow 1→3：lead_time 0→2min>0（ADR-004）；边界/匹配/minimumRows 不变。
  - TRAIN 实证：40 C05 + 40 C07 事件官方首行均由静态路径命中（C05 双静态条件同真；C07 跳变型 onset，前导 120min dev≤±8、start 处跳 −35~−45），前瞻为纯兜底，TRAIN 输出逐字节不变。
  - 验收证据：22/22 N05+N07 区间（train 16 + validation 6，含 ±30min 上下文）C05/C07 零候选（判据级等效验证脚本，用后已删）；pytest 179 全绿；ruff 干净。
  - 校准块：C05.calibration.forecast 三要素（design/thresholdsRationale/trainEvidence/normalContextGuard）+ C07 完整 calibration（含 confirmationRowChange 记录）。

## 断点

- **门禁补跑欠账**：`node validation/evaluate.mjs --official-data <dir>` 与 `node validation/normal-context-regression.mjs --official-data <dir> --mode check` 均要求 clean tracked tree；本次因 A2/A3 会话并行未提交（impact/calculators.py、validation/lib/*.mjs 等在工作区）而无法执行。待 A2/A3 提交后择机补跑，预期：F1/FN/边界不变（TRAIN 逐字节不变 + C07 仅 first_detection +2min 不影响匹配）、N01-N07 零误报（判据级已验证）。
- **下一任务**：T04（C03 去签名带，T03a 侧已满足；T03b 为 A2 侧指标，互不阻塞）→ T05 → T06 → T07 → T11。
- 官方数据目录：`D:\allcode\h2-t01-official\dataandfiles`（TRAIN 校准合法；validation/test 红线禁调参）。

## 待确认决策

1. **detector_version 递增**：本次判据行为有变更（C07 first_detection +2min），但 `detectorVersion` 保持 v4——递增需同步改三处非 A1 领土文件：`src/h2_analytics/vocabulary.py:399`（硬校验）、`settings.py:12`（FALLBACK_DETECTOR_VERSION）、`tests/test_official_contract.py:79`。请指挥官裁决归属（建议随 M-Gate 由用户或 A3 统一处理 v4→v5）。
2. **ADR-004 口径备注**：evaluate.mjs timing 注释称 `firstDetectionDelayMinutes` 负值=early warning；ADR-004 目标 lead_time>0。C05/C07 官方事件均为跳变型 onset（数据实证无渐变前兆），"事件开始前预警"在公开数据上无物理基础，本次以 lead_time>0 + 远先于硬性超限（C05 实测提前 141-640min）实现"提前预警"。若企业 Q2 答复要求负 lead_time 语义，需走契约变更。

## 已提交的变更请求指针

（无）

## 会话备注

- 会话起点：T01 未完整（无 p2-base tag、三分支未建）；经指挥官裁决"建分支+并行实现"，已建 `feat/a1-rules` 并直接进入 T03a。tag 与另两分支归指挥官/对应 Agent。
- tests/ 归属未在 internal-a.md 明示：本次将 5 个新测试最小追加至既有 `tests/test_detection_pipeline.py`（检测管线既有归属），如视为越界请裁决。
- mypy 唯一报错位于 `impact/reconcile.py:238`——A3 会话未提交的新文件（存量于并行工作区），非 A1 引入。
