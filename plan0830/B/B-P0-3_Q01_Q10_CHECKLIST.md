# B-P0-3 十问现场问答勾验清单（会话3 留痕）

> 依据任务卡验收第 4 条：十问逐题人工过一遍，每题按 **数值 / 引用 / 三段 / 安全边界** 四列勾验。
> 审计对象：`services/h2-analytics/src/h2_analytics/assistant/service.py`（@54010db，会话1+2 数值化后）。
> 十问原文以官方 16 号文件为准，仓库内对应 `packages/h2-vocabulary/data/assistant-questions.json`。
> 数值来源纪律：一律透传当前 run 对象 `series/overview/events` 证据（`evidenceId` 可溯）或冻结词表效率曲线；
> **禁止引用标签文件**；无证据时如实声明，不以零替代。

## 逐题勾验

| 题 | 官方原文 | 数值段 | 引用（sourceType） | claimKind 三段 | 安全边界句 | 结论 |
|---|---|---|---|---|---|---|
| Q01 | PCC正值和负值分别代表什么？ | ✓ `run_pcc_observed`：PCC 实测条数/区间/方向（全正=送电，含负=受电） | variable / knowledge_base / evidence | fact + calculation | "只覆盖已检出事件窗，不代表全时段正负时长占比" | 通过 |
| Q02 | 如何区分PCC功率越限与电量配额异常？ | ✓ `current_run_counts`：C04/C05 事件计数 + 焦点事件实测行 + impact 值 | variable / constraint / knowledge_base / evidence | fact + calculation | 无配额实测时"配额余量不在本回答内计算，不以零替代" | 通过 |
| Q03 | 储能方向异常如何影响PCC功率？ | ✓ `observed_mismatch` 事件实测行 + `bounded_impact` impact 值（必选 C03 事件） | event / evidence / knowledge_base | fact + calculation + inference | "现有证据只支持有界排查，不支持直接下发控制指令" | 通过 |
| Q04 | 如何判断SOC调节备用是否不足？ | ✓ `c07_observed`：C07 事件实测（无则声明"不提供 SOC 实测数值"） | knowledge_base / constraint / event / evidence | calculation + inference + fact | "缺少容量或时间窗时只能标记证据不足，不能把缺失值当作零" | 通过 |
| Q05 | 设备降额但EMS未同步如何定位？ | ✓ `c02_observed`：C02 事件实测（无则声明） | knowledge_base / constraint / event / evidence | fact + recommendation | "应明确列出缺项并请求人工核验，不能从单个功率点反推降额事实" | 通过 |
| Q06 | 如何区分云团变化和控制指令振荡？ | ✓ `c01_observed`：C01 事件实测（无则声明不给波动幅度/反转计数） | knowledge_base / constraint / event / evidence | fact + inference | "缺少证据时结论必须保持未确定" | 通过 |
| Q07 | 如何评价多台电解槽负荷分配？ | ✓ `efficiency_baseline`（额定单耗基线，程序化取自效率曲线词表）+ `elz_observed` 逐台功率实测 | knowledge_base / constraint / evidence | calculation + fact | "没有电解槽健康评分，不能把效率差异解释成设备健康结论" | 通过 |
| Q08 | 哪些建议必须人工确认？ | 无数值段（**设计使然**：安全基准题，任务卡定级"维持"） | constraint / knowledge_base | fact + recommendation | 本题即安全边界："不具备设备控制…权限""执行任何操作前均须人工确认" | 通过 |
| Q09 | 生成测试集异常诊断报告。 | ✓ 端到端：`report_factory(eventId)` 产物整体入答案 `generatedReport` | event / report | fact + recommendation | "查看报告后仍须由人工决定后续处置"；数据来源模式声明 | 通过 |
| Q10 | PCC合规日报包含哪些内容？ | ✓ `observed_compliance`：C04/C05 计数 + 焦点事件越限电量实测 + 累计电量证据（无则"证据不足"声明） | report / variable / constraint / evidence / knowledge_base | recommendation + calculation + fact | "证据不足，未计算该项合规结论，不得用零替代" | 通过 |

**共有段落**（每题追加）：
- `current_run_context`（fact）：runId / 行数 / 采样间隔 / 事件数 + "不代表官方评分或隐藏测试结论"免责。
- `selected_event_context`（fact，事件题且非 Q03/Q09）：限定所选事件，未混入其他运行或标签数据。

**事件门控**（`_ALLOWED_EVENT_CODES` 未动）：Q02/C04·C05、Q03/C03、Q04/C07、Q05/C02、Q06/C01、Q07/C06、Q10/C04·C05；Q01/Q08/Q09 不限码，Q03/Q09 必选事件。

## 样例集验收统计（会话3 收口）

| 项 | 验收标准 | 实测 | 结论 |
|---|---|---|---|
| 每题变体数 | ≥3 | 每题 6 例（口语化 4 + 带事件 ID 1 + 追问式 1），共 60 例 | 达标 |
| 变体类型 | 口语化/带事件 ID/追问式 | 三类每题各 ≥1，`test_sample_set_meets_acceptance_gate` 断言固化 | 达标 |
| 命中率 | ≥90% | 60/60 = 100%（逐例参数化断言） | 达标 |
| 越界拒答 | ≥5 例、100% 拒答 | 6 例（unsupported_intent×3 / ambiguous / low_confidence / input_too_long）全拒答 | 达标 |
| 事件码一致性 | — | 带事件 ID 样例码与 `_ALLOWED_EVENT_CODES` 一致（`test_with_event_samples_match_event_gate`） | 达标 |
| 测试回归 | pytest 全绿 | `tests/` 315 passed + 3 skipped，exit=0 | 达标 |

## 已知边界（如实记录，不在本卡范围）

1. **事件码子串歧义**：问句带 `C04-xxx`/`C05-xxx` 事件 ID 时，码子串命中 Q02 词组（`c04`/`c05`），若与其他题同分则拒答 `ambiguous_intent`（如"C04-001 事件里 PCC 正负是什么"）。**拒答语义安全**（不乱答、不撞红线），词表级改进（事件码不计入意图打分）归 **B-P1-2**；样例集内 Q01 带事件变体已选用无歧义码 C01 并注释说明。
2. **多轮追问**（"然后呢/再具体点"跨轮深化）为 B-P1-2 交付；本卡"追问式"变体指单轮可解析的追问语气句式。

## 证据指针

- 测试：`services/h2-analytics/tests/test_assistant_nlu_rendering.py`（`_MATCH_CASES` 60 例类型化三元组、`_REJECT_CASES` 6 例、聚合断言×2）
- 会话1/2 数值化详情：TASKS.md 完成记录 2026-08-30 两行（commit 6d001a9 / 54010db）
- 十问原文：`packages/h2-vocabulary/data/assistant-questions.json`
