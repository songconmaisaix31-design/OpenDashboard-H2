# ADR-004 指标口径：lead_time_minutes 与 10 分钟检出率

- **日期**：2026-08-29 ｜ **状态**：已接受（上游 02§5 拍板，此处留档）
- **背景**：官方 detection_expectation="C05/C07 强调提前预警；其他事件开始后 10 分钟内发现"；现有评估器只有 F1 族指标，无提前量测量；`first_detection_time` 由 `aggregator.py` 的 confirmation_row 决定。
- **选项**：
  1. 仅维持 F1 族指标
  2. 新增 `lead_time_minutes = first_detection_time − event_start_time`（C05/C07，目标 >0）+ "其余 5 类 10 分钟内检出率"（目标 100%），入 `validation/evaluate.mjs` 评估报告
  3. 自造官方评分规则
- **理由**：选项 2 以官方 detection_expectation 原文为唯一口径来源，显式可测、可纳入门禁；选项 3 违反"不虚构官方评分"纪律（`../../07` Q2 挂起）。
- **被否方案**：选项 1（官方期望无法对账）、选项 3（越权）。
- **后果**：`evaluate.mjs` 报告新增两节指标；IF-4 契约（api.md）向 B 线公开口径；企业答复 Q2 后如有差异按契约变更流程调整。