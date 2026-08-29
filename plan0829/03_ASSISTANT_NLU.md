# 03 · 运维助手与受限 NLU + 云端 LLM 增强层专项（ASSISTANT & NLU）

> 版本：2026-08-29 ｜ 责任阶段：`05_ROADMAP.md` S4 ｜ 覆盖优化项：P1-3 / P1-4 / P1-5 / P1-10
>
> **用户已确认**：在证据驱动参数化 + 受限 NLU 基础上接入 **StepFun 云端 LLM API**（用户持有 StepFun token 订阅，支持多款模型）。本文给出隔离架构、反幻觉护栏与离线降级链设计。项目红线不变：**LLM 绝不影响检测/证据/复核事实；外部 API 须声明并提供离线降级**。

---

## §1 现状解剖

| 位置 | 现状 | 缺口 |
|---|---|---|
| `services/h2-analytics/src/h2_analytics/assistant/service.py`（327 行） | `answer()` 只接受 Q01-Q10；`del allow_llm_rendering` 显式丢弃渲染钩子；答案为 10 段硬编码中文文案（`_answer_content` 第 124 行起 if/elif）；Q03/Q09 强制事件上下文；Q09 有 report_factory 桩（第 286-300 行） | 答案不含当前 run 真实数值；Q09 未端到端验证 |
| `apps/web/src/features/h2-sentinel/model/assistant.ts` | `resolveH2AssistantFollowUp()`（第 39 行）：NFKC 归一化 → `^q\d{1,2}$` 正则 → 精确问题文本匹配 → 10 组 token-group 关键词规则（第 22-36 行）；120 字上限；多义/未识别一律拒绝 | 自然语言追问仅词面匹配，T11 验收"自然语言追问"差距明显 |
| 官方评测题 | `16_assistant_questions.csv` 10 题：概念 2 / 辨析 2 / 机理 1 / 判据 3 / 安全 1 / 生成 1 / 报告结构 1；Q09「生成测试集异常诊断报告」为生成型任务 | — |

## §2 证据驱动参数化答案（P1-3）

**目标形态**：`AnswerProvider` 注册表——每个 QId 一个 provider，从当前 run 真实数据取数填模板。

```
AnswerProvider(qid) -> {
  paragraphs: [...],            # 含运行时数值
  claimKinds: [fact|calculation|inference|recommendation],  # 事实/计算/建议三分
  citations: [citationId, ...], # 可回溯引用
  requiresEvent: bool,          # Q03/Q09
}
```

数据来源（全部已有，无需新采集）：当前 run 检测结果、事件证据（`evidence.py` 官方目录支撑文件）、`09_control_constraints.csv` 原文、操作/报警/维修日志、效率曲线。

验收：Q01-Q10 每个答案含 ≥1 个从当前 run 取出的具体数值或约束原文引用，citation 可回溯；契约 schema 不变则前端零改动。

## §3 受限意图分类（P1-4，离线层 + 降级兜底）

新增 `services/h2-analytics/src/h2_analytics/assistant/nlu.py` + 前端路由升级：

1. **流水线**：词面归一化（NFKC/去标点/同义词表）→ 槽位抽取（QId 引用、事件引用、时间窗）→ 打分选择 `questionId`；
2. **输出**：`{questionId, eventRef, timeWindow, confidence}`；置信度低于阈值 → **明确拒答**并引导至 Q01-Q10（拒答是合法且受鼓励的输出）；
3. **范围纪律**：NLU 只做"映射到 Q01-Q10 + 事件引用"，不做开放生成；**绝不引入网络依赖**；
4. 追问样例集 ≥40 条中文问句（每 QId ≥3 条改写 + 5 条越界拒答样例），验收意图命中率 ≥90%、越界 100% 标准拒答。

## §4 云端 LLM 增强层（P1-10，用户决策：StepFun）

### 4.1 定位与隔离（红线落地）
| 层 | 责 | 禁止 |
|---|---|---|
| 确定性层（AnswerProvider + NLU） | 事实数值、结论、引用、拒答判定 | — |
| LLM 层（新增） | **仅两件事**：①开放追问的意图理解（受限 NLU 不命中时）；②命中后答案的语言组织/改写 | 不得生成新数值/新结论；不得触碰检测/证据/复核状态；不得改变 citation 集合 |

### 4.2 RAG 上下文装配
结构化 prompt 上下文（全部离线文件，按需裁剪控制 token）：
- 数据字典 164 行（含 7 影响公式与派生公式）；`09_control_constraints.csv` 约束原文；
- `14_maintenance_history.csv`（5 条）、`13_normal_context` 相关条目、`12_operation_log.csv` 事件邻近条目、`15_knowledge_base.md` 4 条规则；
- 当前事件证据快照（脱敏后）。

### 4.3 反幻觉护栏
1. 数值白名单：答案中的数值只能来自注入上下文（后置校验：LLM 输出中的数字必须命中白名单，否则剔除该句并降级）；
2. 引用强制：答案须携带 citationId 集合，缺失即降级；
3. "无法确认"为合法输出；越界问题标准拒答话术；
4. 温度 0；系统提示词声明"只能基于上下文作答"。

### 4.4 工程集成
- 新增 `services/h2-analytics/src/h2_analytics/assistant/llm_client.py`：StepFun OpenAI 兼容接口（`https://api.stepfun.com/v1/chat/completions`），**模型名可配置**（配置项 `H2_LLM_MODEL`，默认值以用户 StepFun 订阅可用模型列表为准，如 step 系列任一支撑 chat 的型号）；base URL 可覆盖；
- API key：环境变量 `STEPFUN_API_KEY`，**不入库、不进日志**；未配置或调用失败 → 自动走本地层；
- 超时 10s / 重试 1 次 / 单次对话 token 上限；成本护栏：单会话轮数上限；
- 路由顺序：**受限 NLU（离线优先）→ 未命中且已配置 key → LLM 层 → LLM 失败 → 标准拒答引导**；
- 前端 `AssistantPage`：自由文本入口、模式指示（LLM 在线 / 本地离线）、加载态、引用折叠。

### 4.5 离线降级链（红线：外部 API 须声明 + 离线降级；验收为本地离线部署）
```
用户追问 → 受限 NLU 命中？ ──是→ AnswerProvider 出答案（离线，主路径）
                │否
                ├─ STEPFUN_API_KEY 已配置且网络可达 → LLM 理解+组织答案（护栏生效）
                └─ 未配置/超时/失败 → 标准拒答 + 引导至 Q01-Q10
```
现场无网时自动降级，UI 明示当前模式；**验收问答全链路在离线模式下可完整完成**（Q01-Q10 + 常见追问由 NLU 命中）。

### 4.6 合规声明（写入提交材料）
- 声明外部 API 用途（仅追问理解与文案组织）、发送内容边界（仅问题文本 + 脱敏上下文，可配置关闭）、降级方案、key 不随包分发；
- `submission/h2-sentinel/CLAIMS_LEDGER.md` 增补对应条目；演示脚本注明"若现场无网自动切换本地模式"。

## §5 事实/计算/建议三分与引用规范
沿用现有 `claimKind` 机制并强化：每段必带 citationId；计算类须展示公式与代入值；建议类必须带"需人工确认"标记（T14）。无法确认时明确说明——评审时是加分项。

## §6 Q09 生成链路打通（P1-5）
端到端：助手 Q09 → `_select_event`（须带事件上下文）→ `report_factory` 生成诊断报告 → 报告中心可见 → 含数据来源与限制声明 → `requires_human_confirmation` 标记。
验收：`test_assistant_reports.py` 端到端断言；演示脚本含 Q09 现场生成动作。

## §7 答案质量验收
- rubric：事实/计算/建议三分正确性、引用可回溯性、数值真实性（对账当前 run）、拒答恰当性；
- 现场问答演练脚本（`submission/h2-sentinel/DEMO_SCRIPT.md` 增补）：Q01-Q10 逐题 + 3 条追问 + 1 条越界拒答演示。

## §8 前端改造清单
`AssistantPage.tsx`：自由文本输入框（120 字上限放宽至 500）、意图确认卡片（"您是想问 Q04 吗"）、引用折叠展开、拒答态、LLM/本地模式徽标、会话上下文继承提示。

## §9 明确不做
- 不做重型 RAG 基建（向量库/微服务）；LLM 不参与检测/证据/复核/导出链路；不做多轮自主 agent；
- 不把 key 写进任何仓库文件或演示机持久化配置（每次现场以环境变量注入）。