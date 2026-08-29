# 状态文件（Agent A1 · 规则域）

> 全量重写式维护；每次任务完成或会话结束更新。

## 当前契约版本

internal-a.md v1.0 / api.md v1.0

## 当前任务

T07 已完成待合并（commit bae530e @ feat/a1-rules），等待指挥官指令

## 已完成任务

- **T03a**（bf4277e）：C05/C07 前瞻判据 + C07 确认行 1→3。N05/N07 22/22 零候选；TRAIN 输出不变；lead_time C05=3min/C07=2min>0。
- **T04**（52d7435）：C03 去签名带——相对带 [0.75,0.85]×限额 + 平台 + 因果门。TRAIN 候选 2717 逐行一致、40/40、边界零偏差、FP 0。
- **T05**（9155fd3）：C05 去签名带——相对带 [0.55,0.7] + quota 排他 + run 锚定。TRAIN 段恰 40、边界零偏差、FP 0。
- **T06**（6960ff3）：C06 去签名带（P1-1 三连收官）——SS 相对容量带 [0.35,0.45]×cap + 可避免门；INEFF 滑窗份额带 [0.28,0.32] + 锚定 ±0.01 + ELZ3 结构门 + 效率门保留。TRAIN 新旧 byte-equal；calibrate 20/20+0。
- **T07**（2026-08-29，bae530e @ feat/a1-rules）：C04/C07 可执行纠偏能力判定矩阵（A-4/P1-2）——M2 里程碑 A1 侧收官。
  - 新增 `detection/execurability.py`：行级三分支——裕量充足→原置信度 / 全通道顶格→降档建议强度（C04 0.91→0.8、C07 0.86→0.75）/ 全通道数据缺失→降"观察"删候选；单通道缺失忽略该通道、剩余通道 OR 判定。
  - 纠偏通道方向化：C04 EXPORT=BESS 充电或 ELZ 上调、IMPORT=BESS 放电或 ELZ 下调；C07 CHARGE=BESS 充电或 SOC 上边界（距 90%）、DISCHARGE=BESS 放电或 SOC 下边界（距 20%）。约束值经 H2Constraints（源头=h2-vocabulary 冻结官方约束表）。
  - 侦察锚点：官方 C04/C07 各 40；管线 C04"44"实为 2 事件碎片化（TR0124×4/TR0152×2，gap 断段）非裕量问题、纯 FP=0；C07 40/40 精确边界；**pcc_export/import_power_limit_kw 全量缺失（525600/525600），矩阵刻意不依赖**。
  - TRAIN 全量真实管线终验：**新旧输出 byte-equal**（276 事件全同——事件行全走"充足"分支：C04 marker 425-475 反向通道 ≥25kW、C07 事件 BESS@250 反向 ≥250kW 且 SOC 远离被侵边界）；pytest 189 绿 / ruff / detection 域 mypy 干净。
  - 新测试 3（C04 三分支含降档 / 单通道缺失不降级 / C07 三分支含函数级全缺路径）；既有 C04 合成测试补通道字段（数据缺失不报警的正确语义）。
  - 阈值与降档置信度入 thresholds.json + 校准块 execurabilityMatrix 三要素（C04 段首次补 calibration 块）。

## 断点

- **下一任务**：T11（P1-9c：`service.py` ML 接线 + 灰度验证 + IF-3 口径交付 B）——**依赖 T09（A2 训练交付 MODELS_REGISTRY）**，T08/T09 当前 ☐；A1 在 T09 交付前无可做任务池内任务（M2 已收官，剩余 T08-T09 归 A2、T13/T14 归 A3/ALL）。
- **T11 预研提示**：`detection/lightgbm_adapter.py`（91 行，拒 C01/C02/C06）；接线设计=规则为主、ML 校验层（C03/C04/C05/C07 + 全类别二次评分）；`H2_ML_ENABLED` 开关（settings.py 已预置）归 A1 接线、登记归 A2；灰度五条门禁见 TASKS.md A-5。
- **门禁补跑欠账（T03a-T07）**：官方 evaluate.mjs / normal-context-regression.mjs 需 clean tree；判据级等效验证全部完成。
- 官方数据目录：`D:\allcode\h2-t01-official\dataandfiles`。

## ⚠️ 并行协作记录

1. **T04 事故已解决**（历史）：feat/a2-evalml 已回 21a5029。
2. **worktree 工作模式**：A1 在 `%TEMP%\a1-work`（feat/a1-rules）；A3 已采用同模式（`%TEMP%\a3-work`）。跨会话保留有效。
3. **detector_version 递增**（挂账）：T03a-T07 五次判据变更后仍 v4；递增需同步 vocabulary.py:399 / settings.py:12 / test_official_contract.py:79 三处非 A1 领土文件，建议随 M-Gate 统一处理。
4. **ADR-004 口径备注**（挂账）：跳变型 onset 下以 lead_time>0 + 先于硬性超限实现"提前预警"。
5. **M2 里程碑 A1 侧收官**（T03a+T04-T07 全完成）：C03/C05/C06 去签名带 + C04/C07 可执行性矩阵全部落地，每步 TRAIN byte-equal 或全命中。建议 M-Gate 2（对齐集成点 I2/I3）合并 feat/a1-rules。
6. **C04 碎片化挂账**（新发现）：TR0124/TR0152 两事件被聚合 gap 断为 4/2 段（maximumGapIntervals=1 所限）。非 A-4 范围、TRAIN byte-equal 未动；如需修复应另立任务评估对官方对齐口径的收益。

## 待确认决策

（并入上方记录 3-4、6）

## 已提交的变更请求指针

（无）

## 会话备注

- 会话起点：契约 v1.0 无升级；T06 断点续作 T07；A2 共享区推进中（feat/a2-evalml @ 52b6dd1，T08/T09 未完成）。
- worktree `%TEMP%\a1-work`（保留，T11 复用或指挥官清理）；worktree `.venv` 为 uv 自动建（gitignored）。
- TRAIN 全量终验方法（T06 建立）：monkeypatch `_enforce_csv_byte_limit`/`MAX_CSV_ROWS` 走官方 import→analysis，新旧 diff 事件 JSON；T07 复用确认 byte-equal。
- thresholds.json 多行格式沿用；T07 起文件内含 8 源文件（mypy 口径）。
