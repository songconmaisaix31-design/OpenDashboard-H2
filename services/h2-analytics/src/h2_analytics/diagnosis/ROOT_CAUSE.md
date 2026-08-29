# 根因数据驱动文本与 IF-2 冻结（P1-8 / T12 / 任务卡 A-7）

> 归属：A3 诊断与支撑域 ｜ 日期：2026-08-29 ｜ 实现：`diagnosis/root_cause.py`（`attribute_root_cause`）
> 消费：`diagnosis/builder.py::build()` 输出 `rootCause`（数据驱动表述）+ `rootCauseCitations`（IF-2 条目引用，optional，schema 加法式新增）
> 纪律：先验窗口与支撑分口径只用公开 TRAIN 推导；VALIDATION 仅验收；无支撑一律写"证据不足"，不编造归因；不做健康度评分。

## 一、操作日志模式映射（官方 12_operation_log.csv）

| 异常类别 | operation_type | parameter | 机理表述 |
|---|---|---|---|
| C03 | 接口映射变更 | bess_power_sign | 储能接口符号/映射变更 |
| C01 | 参数变更 | setpoint_deadband_kw | 控制死区参数变更 |
| C07 | SOC计划变更 | soc_target_pct | SOC 计划未滚动重算 |
| C05 | 电量配额更新 | 上下网日电量配额 | 上下网日电量配额调整 |
| C04 | 调度约束更新 | PCC功率限值 | PCC 功率限值更新 |

C02/C06 无既定映射（官方日志无对应操作类型），按任务卡口径明确写"证据不足：…无操作日志归因映射…以下为规则推断——{模板}"。

## 二、先验窗口与支撑分（TRAIN 推导）

- **时序事实**：TRAIN 50/50 条日志均落在其后**同类别事件**开始前 **5-60 分钟**（min=5，中位=20，max=60，无一条超过 60 分钟或不足 5 分钟）；VALIDATION 11/11 同分布。
- **窗口**：`[start−60min, start−5min]` 闭区间；多条候选取最接近事件开始的一条（确定性）。
- **支撑分**：`support_score = round(1 − lead/60, 2)`，随间隔线性衰减（lead 5→0.92，30→0.50，60→0.00）。

## 三、引用回溯（IF-2 ref_id 口径）

官方操作日志**无 id 列**（七列：split/timestamp/operator_role/operation_type/parameter/change/remark）。引用键采用合成确定性 ID：

```
ref_id = "OP-{YYYYMMDDHHMMSS}-{parameter}"
```

已验证官方 77 行数据上 (split, timestamp, parameter) 三元组 **77/77 唯一**；引用携带 timestamp+parameter+change 原文，可回溯唯一条目。该口径已提请契约澄清（`plan0829/A/planA/docs/status/change-requests.md` [A3] 2026-08-29），未裁决前按此冻结交付。

IF-2 条目形状（api.md v1.0 原文，键名 snake_case）：

```json
{
  "source": "operation_log",
  "ref_id": "OP-20250101145900-bess_power_sign",
  "timestamp": "2025-01-01 14:59:00",
  "parameter": "bess_power_sign",
  "change": "positive_discharge->positive_charge",
  "support_score": 0.87
}
```

## 四、命中率基线（2026-08-29 冻结）

源文件：`12_operation_log.csv`（77 行，SHA256 前 16 `0182e6094cc176c9`）；标签 TRAIN `50f84b18f905b584` / VALIDATION `47989467020fad54`（与 QUADRUPLES.md 对账同源）。

| split | 总命中 | C01 | C02 | C03 | C04 | C05 | C06 | C07 | 回溯断言 |
|---|---|---|---|---|---|---|---|---|---|
| TRAIN | **50/280（17.9%）** | 10/40 | 0/40 | 10/40 | 10/40 | 10/40 | 0/40 | 10/40 | **50/50 过** |
| VALIDATION | **11/70（15.7%）** | 2/10 | 0/10 | 2/10 | 3/10 | 2/10 | 0/10 | 2/10 | **11/11 过** |

口径说明：
- 官方日志每型仅 10 条（TRAIN），**10/40 即该数据供给下的命中上限**；50 条日志全部被事件认领（无一浪费），窗口无漏配。
- 回溯断言内容：ref_id 在全量日志索引中唯一存在、operation_type/parameter/change/timestamp 与引用逐字段一致、先验间隔 ∈ [5, 60] 分钟。
- C02/C06 命中 0 属设计结果（无映射），其事件根因输出"证据不足 + 规则推断模板"，不编造日志归因。

## 五、IF-2 冻结声明（对 B 线，D12 交付口径）

1. `rootCauseCitations` 为事件 optional 数组字段（`anomaly-event.schema.json` 加法式新增，`h2:qa` 6/6 过）；空数组 = 无可回溯支撑（对应"证据不足"文本）。
2. `rootCauseKind` 保持 enum `"inference"`（日志支撑的是归因线索，因果关系仍属人工确认范围，与 `requiresHumanConfirmation: true` 一致）。
3. B 线 Q05 答案引用根因时，请引用 `rootCauseCitations[i].ref_id` + `timestamp` + `change` 原文，不得改写参数名或变更值。
4. TS 侧类型：`H2RootCauseCitation`（`@h2/contracts` 导出，optional `rootCauseCitations?: readonly H2RootCauseCitation[]`）。

## 六、复现命令

```bash
# 单测（含引用回溯、边界、回退、builder 集成）
python -m pytest tests/test_root_cause.py -q
# 命中率基线：按第四节口径对官方标签逐事件运行 attribute_root_cause（本节表格即输出汇总）
```
