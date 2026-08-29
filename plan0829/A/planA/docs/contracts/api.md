# 接口契约（A→B 跨机数据/口径接口）

> 契约版本：v1.0 ｜ 日期：2026-08-29
> 变更记录：
> - v1.0（2026-08-29）：初始版本
>
> ★ 本文件是 A/B 两机的共同法律：A 线产出口径/数据形状，B 线消费。变更走 `../status/change-requests.md` + `../COORDINATION.md` §6 流程；实现与本文冲突时以本文为准。
> 与 `../COORDINATION.md` 的分工：COORDINATION 管**流程**（分支/整合门/领土），本文件管**数据与口径**（B 线消费的具体形状）。

## 通用约定

- 数据来源：仅公开 train/validation 与官方支撑文件（台账/约束/曲线/日志/合理工况）
- 时间格式：`YYYY-MM-DD HH:MM:SS`（与输入 CSV 一致，空格分隔、无时区后缀）
- 编码：UTF-8 无 BOM
- 指标产出：`validation/baseline/*.json`（gitignored；跨机共享以聊天粘贴 JSON 为准）

## 接口定义

### IF-1 Q03 数值口径说明（P0-7 产出，B 线 Q03 答案消费）

- 用途：B 线 AnswerProvider Q03「储能方向异常如何影响 PCC 功率」需引用的影响指标口径
- 交付方：A ｜ 消费方：B ｜ 约定时间：D11 前
- 形状：

```json
{
  "metric": "abnormal_grid_exchange_energy_kwh",
  "formula_quote": "Σ|异常PCC功率−参考PCC功率|×1/60",
  "reference_baseline_definition": "<参考PCC功率基线定义文字，来自四元组>",
  "unit": "kWh",
  "citations": ["数据字典第160行", "impact/calculators.py::<函数名>"]
}
```

### IF-2 根因条目引用结构（P1-8 产出，B 线 Q05 联动答案消费）

- 用途：根因文本引用操作日志/报警/维修记录的具体条目
- 交付方：A ｜ 消费方：B ｜ 约定时间：D12
- 形状（每条引用）：

```json
{
  "source": "operation_log | alarm_log | maintenance_history",
  "ref_id": "record_id 或 alarm_id 字符串",
  "timestamp": "YYYY-MM-DD HH:MM:SS",
  "parameter": "如 bess_power_sign / setpoint_deadband_kw",
  "change": "如 positive_discharge->positive_charge",
  "support_score": 0.87
}
```

### IF-3 ML 演示口径（P1-9 go/no-go 后交付 B 线 DEMO_SCRIPT/CLAIMS_LEDGER）

- 形状：

```json
{
  "ml_enabled": false,
  "statement": "ML 校验层已实现并通过灰度门禁；当前配置为纯规则模式，可通过 H2_ML_ENABLED 开启"
}
```

### IF-4 lead_time / 10 分钟检出率指标定义（P0-5 产出，B 线演示讲稿消费）

- `lead_time_minutes`：仅对 C05/C07 事件计算，`first_detection_time − start_time`，单位分钟，目标 >0；
- `detection_within_10min_rate`：对 C01/C02/C03/C04/C06 事件，`first_detection_time − start_time ≤ 10min` 的事件占比，目标 100%；
- 口径细节见 ADR-004；产出位置：`validation/evaluate.mjs` 评估报告；官方规则差异挂起于 `../../../07_APPENDIX_ENTERPRISE_QUESTIONS.md` Q2。

### IF-5 事件数据字段（B 线 Q03/Q09 只读消费）

B 线消费检测输出（只读，无文件冲突）。字段以 `packages/h2-contracts` 现有 schema 为准：事件标识 `event_id/start_time/end_time/anomaly_code/anomaly_subtype/severity`、归因 `primary_control_object/affected_equipment`、证据 `evidence_json`、影响 `primary_impact_metric/estimated_impact_value`、检测 `first_detection_time/requires_human_confirmation`。A 线不新增必填字段；如需新增 optional 字段（ML top 特征）按共享-增量规则走 `packages/h2-contracts` 加法式变更 + `npm run h2:qa`。

## 错误/异常处理约定

- A 线接口数据缺失时显式返回 `null` + `"unavailable_reason"` 文字（如"日志缺失"），禁止编造数值；
- 契约冲突：B 线在 `../status/change-requests.md` 追加请求，A 线不得单方变更已发布接口。

## Mock 说明

不适用（无运行时服务接口；本契约描述文件/报告形状）。B 线联调可用 `validation/baseline/*.json` 样例。