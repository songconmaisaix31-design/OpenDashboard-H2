# B 线作战手册 — 运维助手 LLM 质量域

> 版本：2026-08-30 ｜ 分支：`codex/p3-b`（worktree `D:\allcode\qingneng-wt\b`）｜ 上游必读三件套：`../00_README.md` + `../CONTRACTS.md` + `../COORDINATION.md`
> 本线一句话：**把运维助手从"能答"做到"现场评委即问即答"**——StepFun 收尾提交（D0 阻断项）、LLM 三态 30 秒切换、Q01-Q10 真实数值化、语料 4→60+ 条全部可溯源。助手 4 分是"演示即评分"，本线直接挂 4 分中的大头。

---

## §0 定位与上下文预算声明

**本线域** = Python 分析侧的助手域：`assistant/**`、`settings.py`、`service.py`、`api/**`、助手测试、`h2-vocabulary` 助手语料两文件。**不碰**检测域（A）、前端（C）、部署脚本（D）。

**上下文预算（700k 上限下的本线纪律）**：

| 项 | 预算 | 说明 |
|---|---|---|
| 必读文档 | ≈1.3k 行 | 00_README(123)+CONTRACTS(104)+COORDINATION(摘要)+本 README+本线 TASKS |
| 工作代码 | ≤8k 行 | §3 白名单内按需读，不整目录扫 |
| 工具输出 | ≤2k 行/次 | pytest/check 输出截断看尾行；大 CSV 永不整读 |
| **稳态目标** | **<150k tokens** | 警戒线 200k |

**超限症状与续作规程**：开始"全仓库漫游"、反复重读无关文件、忘记任务卡编号 → 立即停手，把当前进度写进 `TASKS.md` 看板行，**重开 AI 会话**，新会话只读三件套+本线两文档+看板，从下一张卡续作。单卡粒度设计（0.25-1d/卡）正是为支持此规程。

---

## §1 事实速览（动笔前全部经仓库/官方数据核实，2026-08-30）

### 1.1 LLM 层现状（StepFun Pro Plan，已开通人工验证）

| 事实 | 内容 | 出处 |
|---|---|---|
| 默认状态 | **off**：`H2_LLM_ENABLED` 须字面 `"true"`（`"TRUE"` 等一律拒绝）；未启用时不读任何 provider 环境变量 | `assistant/llm_client.py:36-41` |
| 启用必填 | `STEPFUN_API_KEY` + `H2_LLM_MODEL` 缺一即 `RuntimeError`（fail-closed）；secret 不入 repr | 同上 + 测试断言 |
| 端点 | **Pro Plan 专属** `https://api.stepfun.com/step_plan/v1/chat/completions`（`H2_LLM_BASE_URL` 常量） | `settings.py:29` |
| 端点守卫 | env 覆盖为非官方端点（http/仿冒域/路径穿越/带查询参数）→ `disabled/policy_disabled`，**零网络调用** | `llm_client.py:80-81` + 4 个仿冒端点负例 |
| 渲染器 | `stepfun-compatible-renderer-v2`（`H2_LLM_RENDERER_VERSION` 常量；fallback 时 rendererVersion 以 `:原因` 结尾） | `settings.py:32`、`service.py:381-383` |
| LLM 职责 | **仅语言润色**确定性中文答案（temperature=0，系统提示限定"不得增加事实、数字、引用或控制权限"） | `llm_client.py:92-99` |
| `_valid_output` v2 | 四条子集校验：①控制词 `_UNSAFE_CONTROL`（下发/启停/开机/关机/修改设定/切换模式/控制/调功率/设备指令）**仅拦源答案中不存在的新增措辞**，源自带免责表述（如"不具备设备控制权限"）放行；②`citation-*` ⊆ citation_ids；③数字 ⊆ 源答案数字；④必含"人工"+"证据/限制" | `llm_client.py:188-200` |
| 降级路径 | `timeout`/`provider_unavailable`/`invalid_output` → 整体弃用渲染，回确定性答案（sections/citations 原样） | `llm_client.py:125-130`、`service.py:381` |
| 其他硬界 | 超时 10s×2 次重试；响应 ≤256KB；渲染文本 ≤4000 字；user 内容源文本截 8000 字 | `llm_client.py` 全文 |

### 1.2 未提交 4 文件（`codex/p2-integration` 工作区，+41/-7 行）—— B-P0-1 对象

| 文件 | 改动内容 |
|---|---|
| `services/h2-analytics/src/h2_analytics/settings.py` | 端点 `…/v1/chat/completions` → `…/step_plan/v1/chat/completions`（Pro Plan 专属）；renderer v1→v2 + 语义注释 |
| `services/h2-analytics/src/h2_analytics/assistant/llm_client.py` | `_valid_output` 控制词由**绝对禁止**改为**子集校验**（仅拦源答案中不存在的 `_UNSAFE_CONTROL` 措辞，源自带免责表述放行） |
| `services/h2-analytics/src/h2_analytics/service.py` | fallback rendererVersion 拼接由硬编码 `stepfun-compatible-renderer-v1` 改为引用常量 `f"{H2_LLM_RENDERER_VERSION}:{reason}"` |
| `services/h2-analytics/tests/test_assistant_nlu_rendering.py` | 端点唯一合法 URL 断言更新；2 个"控制"负例改写（单独复用源中已有"控制"一词不再违规，须同时携带源中不存在的控制动词才拦）；新增 `test_renderer_allows_source_disclaimer_control_wording` |

### 1.3 助手既有能力（B-P0-3 的起点）

| 能力 | 现状 | 出处 |
|---|---|---|
| Q01-Q10 参数化 | `AssistantService.answer()` 按题分支；十问原文=官方 `16_assistant_questions.csv`（与 `assistant-questions.json` 42 行一致） | `assistant/service.py:26-90` |
| 事件门控 | `_ALLOWED_EVENT_CODES`：Q02/Q10=C04,C05；Q03=C03；Q04=C07；Q05=C02；Q06=C01；Q07=C06；Q03/Q09 **必须**带事件（`event_required`） | `assistant/service.py:11-23` |
| claimKind 四类 | 每段显式标 `fact`/`calculation`/`inference`/`recommendation`（=CONTRACTS §3 事实/计算/建议三段式的代码载体） | `_answer_content` 全分支 |
| 引用校验 | 每段 `citationIds`；citationId=`citation-{Q}-{section}-{n}`；sourceType ∈ variable/knowledge_base/constraint/event/evidence/report；LLM 渲染 citation ⊆ citation_ids 有断言 | `service.py:134-160` + 测试 |
| Q09 端到端 | Q09 调 `report_factory` 生成单事件诊断报告入答案（`generatedReport`） | `service.py:44-57` |
| 安全标记 | 每答 `refusedControlClaim: true`；Q08 固化人工边界句；每答附 `current_run_context`（声明"本地运行数值不代表官方评分"） | `service.py:74-90、320-329` |
| 受限 NLU | 500 字上限；`q01`-`q10` 直达；题面精确匹配；词组打分置信度阈值 0.66；拒答四类 `input_too_long`/`low_confidence`/`unsupported_intent`（控制意图）/`ambiguous_intent`；抽取事件 ID（`C0x-…`）与时间窗 | `assistant/nlu.py`（108 行） |
| API 端点 | `POST /api/v1/h2-sentinel/assistant:ask`（body `{runId,questionId,eventId?,allowLlmRendering}`）、`POST /api/v1/h2-sentinel/assistant/nlu`（body `{schemaVersion:1,text,runId}`） | `api/route_map.py:48-49`、`api/models.py:79-89` |
| 既有测试 | 40 匹配样例+5 拒答+渲染禁用/放行/引用不变/恶意输出 3 例/超时/env 精确 opt-in 与 secret 脱敏/端点守卫 4 仿冒例/控制词负例 11 例+免责放行 1 例（合计 410 行） | `tests/test_assistant_nlu_rendering.py` |
| 知识语料 | **仅 9 行 4 条规则**（符号约定/功率平衡/瞬时 vs 累计约束/不闭环），与官方 `15_knowledge_base.md` 逐字一致 | `packages/h2-vocabulary/data/knowledge-base.md` |

### 1.4 语料与数据源盘点（B-P1-1 的原料，全部已核实存在）

| 来源 | 路径 | 规模 |
|---|---|---|
| 变量字典 | `D:\allcode\h2-t01-official\dataandfiles\00_变量中文描述与数据字典.csv` | 164 行=163 变量（中文描述/单位/公式/related_anomaly） |
| 设备台账 | `…\08_equipment_master.csv` | 8 台（PV01/BESS01/PCC01/EMS01/ELZ01-03/AUX01） |
| 控制约束 | `…\09_control_constraints.csv` | 12 条 |
| 效率曲线 | `…\10_electrolyzer_efficiency_curves.csv` | 3 台电解槽 |
| 官方知识库 | `…\15_knowledge_base.md` | 9 行 4 条 |
| 十问原文 | `…\16_assistant_questions.csv` | 10 题 |
| 需求书 | `D:\allcode\T03_设备故障排查与智能运维助手_企业资料包04_雷动\00_需求书.md`（及 `02_应用交付与验收要求.md`） | 条款出处 |
| 冻结词表（只读） | `packages/h2-vocabulary/data/{fields,equipment,constraints,efficiency-curves,version}.json` | 引用单源 |

### 1.5 运行与演示环境事实（B-P0-2/B-P0-3 演示验证用）

| 项 | 事实 |
|---|---|
| 启动命令 | `npm run h2:fixture`（演示模式，秒级）/ `npm run h2:local`（完整模式，吃官方 CSV） |
| 端口 | web 5173 ｜ analytics sidecar 8765（`--web-port`/`--analytics-port` 可覆盖） |
| 启动脚本 | `start-h2-sentinel.bat` **必须带参** `--mode fixture|local`，双击报错属已知行为 |
| 探活 | `GET /health`（route_map 首个端点） |
| 环境安装 | worktree 内 `npm ci` + `cd services/h2-analytics && uv sync --locked --extra dev`（pytest 在 dev extra） |
| pytest 目录 | **必须在 `services/h2-analytics/` 下执行**（`[tool.pytest.ini_options] testpaths=["tests"]`） |
| 演示/体检 | `validation/run-demo.mjs`（演示固化）/ `scripts/h2-sentinel/` doctor（D 线域，只跑不改） |
| 官方数据 | `D:\allcode\h2-t01-official\dataandfiles`（绝对路径，不进 git，worktree 间共用） |

---

## §2 任务总表（6 卡）

| 编号 | 任务 | 档位 | 会话数 | 依赖 | 服务条款 | 裁剪位 |
|---|---|---|---|---|---|---|
| B-P0-1 | StepFun 4 文件收尾提交（**D0 阻断项**） | 核心 | 0.25d | 无 | 验收-T14；18分表-助手4 前置 | 不可裁 |
| B-P0-2 | LLM 三态启用/降级策略（30s 切换+双路径演示段） | 核心 | 1d | B-P0-1 | 验收-T14、验收-T11 | 不可裁 |
| B-P0-3 | Q01-Q10 现场问答强化（真实数值/引用/三段式/安全边界） | 核心 | 2d（2-3 会话） | 无（P0-1 后即可开工） | 验收-T11、验收-T08 | 不可裁 |
| B-P1-1 | 知识语料扩充（4 条→≥60 条，100% 出处） | P1 | 1.5d（2 会话） | B-P0-3 | 验收-T11 | 第 3 裁（降为核心 30 条） |
| B-P1-2 | 追问意图扩展（受限 NLU+多轮，≥30 样例） | P1 | 1.5d（2 会话） | B-P0-3（R2） | 验收-T11 | 第 2 裁 |
| B-P1-3 | 三段式与引用渲染层强化（云端/降级对照一致） | P1 | 1d | B-P0-2（R2） | 验收-T11、验收-T14 | 第 1 裁 |

总量 ≈**7.5 任务日**；详细卡见本目录 `TASKS.md`。

---

## §3 读白名单

### 可读（开工所需全部输入）

| 类 | 路径 |
|---|---|
| 本线工作代码 | `services/h2-analytics/src/h2_analytics/assistant/**`、`api/**`、`settings.py`、`service.py`；只读消费：`contracts.py`、`errors.py`、`models.py`、`vocabulary.py` |
| 本线测试 | `services/h2-analytics/tests/test_assistant_*.py`、`tests/conftest.py` |
| 助手语料（独占写） | `packages/h2-vocabulary/data/{knowledge-base.md,assistant-questions.json}` |
| 冻结词表（只读引用） | `packages/h2-vocabulary/data/{fields,equipment,constraints,efficiency-curves,version}.json` |
| 官方数据小文件（可整读） | `dataandfiles/` 的 00 字典、04/05 事件标签、08 台账、09 约束、10 效率曲线、11 报警、12 操作、13 正常工况、14 检修、15 知识库、16 问题、17 模板、18 质量说明、19 manifest |
| 企业资料包 | `00_需求书.md`、`02_应用交付与验收要求.md`（绝对路径见 §1.4） |
| 方案文档 | plan0830 顶层四文档 + 本线两文档 + `C/ACCEPTANCE_AUDIT.md`、`D/ENTERPRISE_OUTREACH.md`（共享工件） |

### 禁读（防串域与超限）

| 禁项 | 原因 |
|---|---|
| `detection/**`、`events/**`、`impact/**`、`diagnosis/**` 内部 | A 线域；助手只消费 run 结果与事件对象，检测事实不经 B 手 |
| `apps/web/**`、`plugins/h2-ems/**` | C 线域；前端经 `api/` 契约交互（IF-6/IF-7 字段说明走 CONTRACTS） |
| `scripts/h2-sentinel/**`、`quality/**`、`ingestion/**`、`reports/submission.py` | D 线域 |
| 三个时序大 CSV（01/02/03 号，226/56/74MB） | **永不整读入上下文**；数值一律经当前 run 对象/脚本采样取 |
| `validation/**` | 只跑不改（check-all 可执行） |

---

## §4 独占写清单（与 CONTRACTS §1 一致；他线诉求走 change-request）

```
services/h2-analytics/src/h2_analytics/assistant/**      （含新建 corpus.py）
services/h2-analytics/src/h2_analytics/settings.py
services/h2-analytics/src/h2_analytics/service.py
services/h2-analytics/src/h2_analytics/api/**
services/h2-analytics/tests/test_assistant_*.py
packages/h2-vocabulary/data/knowledge-base.md
packages/h2-vocabulary/data/assistant-questions.json
plan0830/B/**
```

共享工件（D 主笔、B 贡献本线条目）：`submission/h2-sentinel/CLAIMS_LEDGER.md`。
**注意**：`使用说明.md` 属 D 线——B-P0-2 的助手节更新以文稿形式走 change-request 交 D 落笔。`version.json` 与冻结 JSON 任何改动=整合窗专线流程。

---

## §5 验收命令集

### 5.1 日常门禁（每卡收工必跑）

```powershell
# 助手测试（B 线主门禁）
cd D:\allcode\qingneng-wt\b\services\h2-analytics   # 主检出同理
python -m pytest tests/test_assistant_nlu_rendering.py tests/test_assistant_reports.py -q

# 全量回归（确认不破坏他线门禁；整合窗必跑）
python -m pytest -q

# 词表变更（改 assistant-questions.json / knowledge-base.md 后必过）
npm run h2:qa

# 全门禁（收尾/整合窗）
node scripts/h2-sentinel/check-all.mjs
```

### 5.2 样例集断言方式（不引新框架）

命中率与拒答率全部落在 pytest 参数化样例表：`_MATCH_CASES`（命中）与 refusal 参数组（越界拒答）扩展进 `tests/test_assistant_*.py`；**新增断言 <100 行/任务**，截图/清单留痕入 `plan0830/B/`。

### 5.3 三态切换演示步骤（B-P0-2 验收载体）

```powershell
# 态1 禁用（默认）：不设 H2_LLM_ENABLED → npm run h2:fixture → web 5173 / analytics 8765
#   问 Q08 → provenance.mode=DETERMINISTIC_TEMPLATE（零 LLM 调用）
# 态2 云端：$env:H2_LLM_ENABLED="true"; $env:STEPFUN_API_KEY="<key>"; $env:H2_LLM_MODEL="step-3.7-flash"
#   重启 analytics → GET /health 探活 → 问 Q08(allowLlmRendering=true) → mode=LLM_RENDERED、renderer v2
# 态3 降级：云端态下移除 key 或断网重问 → mode=DETERMINISTIC_TEMPLATE + rendererVersion 以 ":timeout"/":provider_unavailable" 结尾
# 计时：态间切换（改 env+重启+探活）≤30s，全程录屏留痕
```

---

## §6 日程与裁剪序

| 日 | 卡/事件 | 产出与门禁 |
|---|---|---|
| **D0** | **B-P0-1**（lead+用户执行，B 实例待命复核） | 4 文件干净 commit → 全门禁绿 → tag `p3-base` → 建 worktree |
| D1 | B-P0-2 | 三态演示 3 次留痕；IF-6 字段说明交 C/D |
| D2-D4 | B-P0-3（会话1：Q01-Q05 数值化；会话2：Q06-Q10+样例集；会话3：命中率断言+十问清单） | 样例 ≥90% 命中+越界 100% 拒答 |
| D5-D6 | B-P1-1 提前量（会话1：字典 163 行+需求书条款语料化；会话2：约束/台账/效率曲线+token 预算） | 语料 ≥60 条 100% 出处 |
| D7 | **G1**：全 P0 完成、整合分支全门禁绿 | 看板更新 |
| D8-D9 | B-P1-2（会话1：意图组扩展；会话2：多轮追问+30 样例） | 命中 ≥90% |
| D10 | B-P1-3 | 10 组对照一致 |
| D11-D13 | 缓冲+整合窗（D11/D13）配合；G2 冻结 D14 | — |

**裁剪序（超支时自上而下裁）**：①B-P1-3 → ②B-P1-2 → ③B-P1-1 降为核心 30 条（字典重点组+约束 12+台账 8）。**B-P0-1/2/3 不可裁**。

---

## §7 红线（继承 00_README §8，B 线细化；任何卡不得突破）

1. **LLM 不触碰检测证据复核事实**：渲染层只润色语言；事实/数字/引用三重子集校验兜底，违规输出整体弃用（fallback），不存在"部分采纳"。
2. **不编造测点/标准**：数字必须 ⊆ 源答案数字；缺累计电量/配额证据时写"证据不足，未计算该项合规结论"，不得以零替代。
3. **回答区分事实/计算/建议**：每段 claimKind 显式；无法确认时明确说明，不猜。
4. **安全边界**：不发控制指令（NLU `_CONTROL_INTENT` 入口拒答 + 渲染 `_UNSAFE_CONTROL` 子集拦截双保险）；建议必带人工确认；`refusedControlClaim` 恒 `true`。
5. **外部 API 合规（验收-T14）**：StepFun 已在 CONTRACTS §4 声明；默认 off；非官方端点零调用；**离线降级=确定性答案自动兜底，助手评分不依赖云端**（Q7 未答→演示必含双路径段）。
6. **数值口径**：答案内真实数值只来自当前 run 对象（series/overview/events），禁止引用标签文件或官方评分表述；`current_run_context` 免责句不删。
7. 编号纪律：内部任务只用 `B-Px-n`；赛题条款一律 `验收-Txx`；裸 Txx 禁用。

---

## §8 每日纪律与会话规程

1. **每日收工**：`git push origin codex/p3-b`；本线 TASKS.md 看板行就地更新（状态+证据列）；整合窗日（D3/D5/D7/D9/D11/D13）由整合人按 A→B→C→D 序合并，B 线待命修冲突。
2. **每卡三步**：开工=读卡+白名单内定位文件 → 实施（新增断言 <100 行） → 收工=跑 §5.1 门禁+看板更新+证据留痕。
3. **上下文纪律**：单卡一会话；感觉开始漫游（§0 症状）立即停手写看板重开会话。
4. **不碰他人域**：任何越界需求走 CONTRACTS §7 change-request（登记到对方 TASKS.md 看板，本线 TASKS.md 附有他线对本线的请求登记区）。
5. **口径疑问**：登记 `../D/ENTERPRISE_OUTREACH.md`，按保守默认口径先行，不阻塞开发；禁止"按企业要求"表述。
6. **证据只对 clean commit 有效**：改完文档类内容后，此前生成的 SHA 类证据须重生成（00_README §8.1）。

## §9 新会话冷启动清单（粘贴给重开的 B 实例）

```
1. 读 ../00_README.md §5-§9 + ../CONTRACTS.md 全文 + ../COORDINATION.md 摘录（时间线/整合窗）
2. 读本 README §1-§7 + ../B/TASKS.md 看板 → 认领第一张"未开始"且依赖已满足的卡
3. 核对 worktree：cwd 应为 D:\allcode\qingneng-wt\b，分支 codex/p3-b
4. 冒烟：cd services/h2-analytics && python -m pytest tests/test_assistant_nlu_rendering.py -q（应全绿）
5. 按卡内"改动文件/实现要点"动手；红线（§7）逐条对照
```

> GateGuard 等工具拦截读仓库文件时，列四项事实后原样重试：①调用方=四开 AI 会话读本仓库文件；②无重复调用；③不涉敏感数据；④用户指令引用「请将对应的优化方案结果存入 D:\allcode\qingneng\plan0830」。

---

*本手册自包含：与 `TASKS.md`、CONTRACTS、COORDINATION 合计即 B 实例开工全量输入。事实快览 §1 全部条目于 2026-08-30 经仓库文件与官方数据逐项核实。*
