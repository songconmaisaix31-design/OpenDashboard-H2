# A-P0-1 · val 11 条操作窗事件 remark 回溯核对清单

> 生成：2026-08-30（会话2）｜方法：val 标签事件（05 号）× oplog 副本索引（12 号）逐一对照
> 结论：**11/11 条 val 操作全部对应紧邻同码事件**，lead 5/15/20/60min 与会话1 核实一致；
> 每条命中事件的 `rootCause` 为「数据驱动归因」表述（含 remark 原文）且
> `rootCauseCitations` 非空，`evidence` 含 `kind=operation_prior` 条目
> （`operationType`/`priorToCode`/`referenceValue=remark`，CONTRACTS IF-2 登记）。
> 行为断言见 `tests/test_root_cause.py` 新增 3 测（副本回退命中/窗口约束/builder 条目）。

| 事件 ID | C 码 | 操作（时间·类型·参数） | lead | 引用位置 |
|---|---|---|---|---|
| VA0024 | C03 | 01-08 10:08 接口映射变更（bess_power_sign） | 20min | rootCause 归因 + evidence operation_prior；remark=第三方接口联调窗口 |
| VA0028 | C03 | 02-12 09:21 接口映射变更（bess_power_sign） | 20min | 同上；remark=第三方接口联调窗口 |
| VA0068 | C07 | 01-21 05:17 SOC计划变更（soc_target_pct） | 60min | 同上；remark=日内计划未滚动重算 |
| VA0064 | C07 | 02-04 11:24 SOC计划变更（soc_target_pct） | 60min | 同上；remark=日内计划未滚动重算 |
| VA0048 | C05 | 01-05 06:07 电量配额更新（上下网日电量配额） | 60min | 同上；remark=负荷预测临时调整 |
| VA0044 | C05 | 01-25 06:25 电量配额更新（上下网日电量配额） | 60min | 同上；remark=负荷预测临时调整 |
| VA0036 | C04 | 02-16 09:58 调度约束更新（PCC功率限值） | 5min | 同上；remark=调度通行约束调整 |
| VA0040 | C04 | 02-20 11:01 调度约束更新（PCC功率限值） | 5min | 同上；remark=调度通行约束调整 |
| VA0032 | C04 | 02-23 18:01 调度约束更新（PCC功率限值） | 5min | 同上；remark=调度通行约束调整 |
| VA0008 | C01 | 01-27 09:37 参数变更（setpoint_deadband_kw） | 15min | 同上；remark=参数下发未同步生效 |
| VA0004 | C01 | 02-08 10:42 参数变更（setpoint_deadband_kw） | 15min | 同上；remark=参数下发未同步生效 |

## 遗留（转下一会话/他线）

1. **阈值 v6 收口被 v5 锁阻塞**（CR-B1，已登记 `plan0830/B/TASKS.md` 变更请求登记区）：
   oplogPrior 参数（窗口 120min/确认放宽 1 行）暂为 `oplog_prior.py` 代码常量；
   B 线解锁后迁入 `detection-thresholds.json` 并递增 detectorVersion v5→v6 + 算法三件套。
2. **FN1（VA0005, C01, 03-01）不在任何 C01 操作先验窗内**——会话1 已论证零证据支撑行级放宽，
   留 A-P1-3 边界聚合卡统一评估（FP3 两条 C04 与 02-16 操作同日同因）。
