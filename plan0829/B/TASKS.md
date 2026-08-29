# B 线任务卡（TASKS）— 运维助手与交付域

> 每张卡：目标 ｜ 现状锚点 ｜ 实施步骤 ｜ 验收 ｜ 工作量 ｜ 回退 ｜ 依赖。
> 完整论述在 `../03_ASSISTANT_NLU.md`（助手与 LLM）/`../04_PLATFORM_DELIVERY.md`（平台交付）/`../06_RISK_AND_VALIDATION.md`（风险验证）。

---

## B-1 ｜ P0-6 submission 防御加固（核心）

- **目标**：checker 对一切坏提交报错，生成端对歧义 token 归一化留痕。
- **现状锚点**：`reports/submission.py` + `validation/check-submission.mjs`（16 列校验，测试集 98 行通过）；台账 token `PV01/BESS01/PCC01/EMS01/ELZ01-03/AUX01`，但官方标签出现 `ELZ3,ELZ1,BESS,PCC`；`affected_equipment` 引号内逗号多值。
- **实施步骤**：
  1. 扩展 `h2-vocabulary/data/submission-equipment-tokens.json` 归一化映射（`ELZ1/2/3→ELZ01..03`、`BESS→BESS01`、`PCC→PCC01`），生成端归一化 + 留痕；
  2. 校验端换真 CSV 解析器（禁 `split(',')`），双向验证引号多值字段；
  3. checker 坏样例集：台账外 token / 坏转义 / UTF-8 BOM / `evidence_json` 不可解析 / 缺列；
  4. `pred_event_id` 规则写入 README（官方规范待确认 → `../07` Q4）。
- **验收**：坏样例全报错；现测试集 98 行产物继续通过。
- **工作量**：S（0.5 天）｜ **回退**：纯新增断言。｜ **依赖**：无。

## B-2 ｜ P0-8 3 分钟演示路径固化（核心）

- **目标**：一条命令完成可重复的评委演示路径。
- **现状锚点**：`validation/run-demo.mjs` + `validate-demo-receipt.mjs`（双次 <180s 收据）；`OverviewPage.tsx` 评委黄金路径。
- **实施步骤**：启动→预置 fixture→6 页面逐页断言→导出报告→收据校验单命令化；`DEMO_SCRIPT.md` 解说词对应页面元素（预留 Q09 生成、人工确认标记、LLM/离线徽标三个演示位，随 B-6/B-8 补齐）；演示机预热 + 端口预检并入 doctor.mjs。
- **验收**：单命令 <180s 双次全绿。｜ **工作量**：S（0.5 天）｜ **依赖**：无。

## B-3 ｜ P1-6 T01 分块/流式导入（核心，最大平台改造）

- **目标**：训练集 237MB/525,600 行单次操作全量导入，与整文件导入幂等。
- **现状锚点**：`settings.py` `MAX_CSV_BYTES=96MiB`、`MAX_CSV_ROWS=180_000`；`csv_loader.py` 全文解析；前端 `workspace-loader.ts` 整份 CSV 作 JSON POST。
- **实施步骤**：
  1. 后端上传会话端点（`api/app.py` + `route_map.py`）：`POST .../ingest/sessions` → `PUT .../chunks` → `POST .../commit`；SHA-256 逐块累进；
  2. `csv_loader.py` 流式解析入口，会话模式放宽上限为配置（D1 预置骨架）；
  3. 前端 File 分片（8MB/片）上传，进度接 `ViewState`；
  4. commit 时全量执行 `_build_diagnostics` 与指纹，**幂等测试**：与整文件导入逐字段一致；标签列拒收在流式路径同样生效。
- **验收**：237MB 全量导入成功；幂等测试绿；旧路径零变化。
- **工作量**：M（1.5 天）｜ **回退**：保留旧路径。｜ **依赖**：D1 预置。
- **协作点**：commit 指纹与 A 线基线不一致立即通报 A。

## B-4 ｜ P0-3 clean-machine 一键复现（核心，4 分项）

- **目标**：从未 clone 仓库的机器 ≤15 分钟完成"安装→启动→导入→运行→导出"。
- **现状锚点**：`start-h2-sentinel.bat/.sh` 薄封装；`launch.mjs` + 9 冒烟健壮；无换机证据。
- **实施步骤**：入口脚本环境自检（Node/Python/uv/端口）→ 依赖安装（npm ci + uv sync，离线优先）→ 启动 → READY 健康探测；`scripts/h2-sentinel/doctor.mjs` 一键诊断 + 中文排查；`CLEAN_MACHINE_RUNBOOK.md`（含 Windows 执行策略/Python 版本/端口占用三大翻车点决策树）；D7/D13 两次演练留痕。
- **验收**：两次演练留痕；换机环境过 `offline-deploy-smoke.mjs`。
- **工作量**：M（1.5 天 + 演练）｜ **回退**：runbook 人工兜底。｜ **依赖**：B-2（联排）。

## B-5 ｜ P1-3 助手 AnswerProvider 参数化（核心，助手地基）

- **目标**：Q01-Q10 答案从静态文案变为当前 run 真实数值 + 可回溯引用。
- **现状锚点**：`assistant/service.py`（327 行，`_answer_content` 10 段 if/elif）；`claimKind` 与 citations 机制已有。
- **实施步骤**：
  1. 重构为 AnswerProvider 注册表：`{paragraphs, claimKinds, citations, requiresEvent}`；
  2. 数据源：当前 run 检测结果 / `evidence.py` 官方目录证据 / `09_control_constraints.csv` 原文 / 操作·报警·维修日志 / 效率曲线；
  3. 每题 ≥1 个真实数值或约束原文引用；计算类展示公式与代入值；建议类带"需人工确认"；
  4. 契约 schema 尽量不变（加法式变更须公告 A + h2:qa）。
- **验收**：Q01-Q10 逐题含真实数据；citation 可回溯；契约 QA 绿。
- **工作量**：L（3 天）｜ **回退**：provider 逐题切换可部分回退。｜ **依赖**：A 线接口 IF-1（D11 前）、IF-2（D12）——不阻塞先做其余 8 题。

## B-6 ｜ P1-5 Q09 生成链路端到端（核心）

- **目标**：现场问答"生成测试集异常诊断报告"全链路可演示。
- **现状锚点**：`assistant/service.py` Q09 分支有 report_factory 桩，未端到端验证。
- **实施步骤**：Q09 → `_select_event`（事件上下文强制）→ report_factory → `reports/renderer.py` → 报告中心可见 → 含数据来源与限制声明 + `requires_human_confirmation` 标记；`test_assistant_reports.py` 端到端断言；DEMO_SCRIPT 补演示位。
- **验收**：端到端测试绿；演示位就绪。｜ **工作量**：M（1 天）｜ **依赖**：B-5。
- **注意**：`reports/**` 为 B 独占；`diagnosis/builder.py` 为 A 独占——Q09 只消费报告工厂接口，不改正文内容。

## B-7 ｜ P1-4 受限 NLU 愈图分类（核心）

- **目标**：自然语言追问从关键词封闭路由升级为受限意图分类，越界 100% 拒答。
- **现状锚点**：前端 `model/assistant.ts` `resolveH2AssistantFollowUp()`（正则→精确文本→10 组关键词；120 字上限）。
- **实施步骤**：
  1. 新建 `assistant/nlu.py`（离线）：归一化 → 同义词/槽位表 → 打分选择 questionId → `{questionId, eventRef, timeWindow, confidence}`；
  2. 低置信度 → 标准拒答 + 引导至 Q01-Q10；
  3. 前端：自由文本入口（500 字）、意图确认卡片、引用折叠、拒答态；
  4. 40 条追问样例集（每 QId ≥3 改写 + 5 越界）入测试。
- **验收**：命中率 ≥90%；越界 100% 标准拒答；零编造。｜ **工作量**：M/L（2 天）｜ **回退**：退回关键词路由。｜ **依赖**：B-5。

## B-8 ｜ P1-10 StepFun 云端 LLM 增强层（核心，可整体关闭）

- **目标**：开放追问由 LLM 理解与组织语言；事实/数值/引用 100% 由确定性层供给。
- **现状锚点**：`assistant/service.py` `del allow_llm_rendering`——本项在隔离层重新引入 LLM，不改铁律。
- **实施步骤**：
  1. `assistant/llm_client.py`：StepFun OpenAI 兼容接口（`https://api.stepfun.com/v1/chat/completions`），模型名配置项 `H2_LLM_MODEL`；温度 0；超时 10s/重试 1 次/会话轮数上限；
  2. RAG 上下文装配：数据字典 + 约束原文 + 维修/操作/合理工况条目 + 当前事件证据（脱敏）；
  3. 反幻觉护栏：数值白名单后置校验、引用强制、系统提示词限定"只基于上下文"；
  4. 路由：受限 NLU 命中→本地答案；未命中且有 key→LLM；失败/无网→标准拒答引导；UI 模式徽标；
  5. 断网降级演练；`CLAIMS_LEDGER.md` + submission 材料补外部 API 声明。
- **验收**：断网自动降级；护栏拦截可复现；声明入包；验收问答全链路离线可完成。
- **工作量**：M/L（2 天）｜ **回退**：不注入 key 即整体关闭。｜ **依赖**：B-7；key 持有者配合。

## B-9 ｜ P1-7 事件可视化均衡化（冲刺）

- **目标**：C01/C02/C04/C05/C06/C07 补专属图表配置（C03 已有）。
- **现状锚点**：`model/chart-options.ts` `powerSeriesByCode` 仅 C03；其余走"前 5 证据变量"降级。
- **实施步骤**：按 `../04_PLATFORM_DELIVERY.md` §4 表格逐类实现；变量名/单位一律取自 `h2-vocabulary`。
- **验收**：7 类单测覆盖；DiagnosisPage 时间轴联动一致。｜ **工作量**：M（1.5 天）｜ **回退**：保留降级路径。｜ **依赖**：无（D13 冲刺位）。

## B-10 ｜ P2 可选项

- P2-1 Playwright 黄金路径 e2e（M）；P2-2 HANDOFF 归档（S，**D14 冻结前完成**）。时间不足按裁剪顺序放弃。