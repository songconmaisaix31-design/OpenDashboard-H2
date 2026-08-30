# B 线任务卡（TASKS）— 运维助手 LLM 质量域

> **卡格式**（每卡固定字段）：目标 ｜ 背景 ｜ 改动文件 ｜ 实现要点 ｜ 验收命令与标准 ｜ 服务验收条款 ｜ 会话数 ｜ 依赖 ｜ 裁剪位 ｜ 风险与回退。
> 粒度 = 1 个 AI 会话一次完成（0.25-1d；>1d 已拆会话标注）。编号纪律：内部任务 `B-Px-n`；赛题条款一律 `验收-Txx`。
> 配套：`README.md`（事实速览/白名单/命令/日程/红线）；跨线接口走 `../CONTRACTS.md` §6-§7。

---

## 状态看板（每卡收工就地更新；00_README §7 仅整合窗汇总）

| 卡 | 状态 | 门禁 | 证据留痕 |
|---|---|---|---|
| B-P0-1 4 文件收尾提交 | 未开始（D0） | 干净 commit + assistant pytest 绿 + CLAIMS_LEDGER 登记 | commit SHA |
| B-P0-2 三态启用/降级 | 未开始 | 三态各演示 1 次 + 切换 ≤30s + fail-closed 不变 | 录屏/截图 |
| B-P0-3 Q01-Q10 强化 | 未开始 | 样例 ≥90% 命中 + 越界 100% 拒答 + Q09/Q10 端到端 | 十问清单+pytest 输出 |
| B-P1-1 语料扩充 | 未开始 | ≥60 条 100% 出处 + token 预算记录 | 语料文件+对账清单 |
| B-P1-2 追问意图扩展 | 未开始 | ≥30 样例 ≥90% 命中 + 拒答语义不变 | pytest 输出 |
| B-P1-3 渲染层对照 | 未开始 | 10 组对照样例一致（断言 <100 行） | pytest 输出 |

### 他线对本线的变更请求登记区（CONTRACTS §7；B 线下一会话处理）

| # | 发起线 | 文件 | 诉求 | 理由 | 登记 |
|---|---|---|---|---|---|
| CR-B1 | A（A-P0-1） | `settings.py:12`（附 `vocabulary.py:399`、`tests/test_official_contract.py:79` 两处同源 v5 字面锁，所有权未声明，请 B 线牵头协同整合人裁决） | 解除 `deterministic-c01-c07-v5` 硬编码校验：改为参数化或随 `detection-thresholds.json` 的 `detectorVersion` 字段联动校验，允许 v6+ | A-P0-1 需把 oplogPrior 参数迁入 thresholds JSON 并按 CONTRACTS §8.3 递增 detectorVersion v5→v6；当前三处 v5 字面锁使任何版本递增即 pytest 红，A 线无法收口版本（参数暂为 oplog_prior.py 代码常量） | 2026-08-30 |

### 开工输入速查（每卡第一会话先读什么；行号=2026-08-30 实测）

| 卡 | 必读输入 |
|---|---|
| B-P0-1 | `git diff --stat`（4 文件）；README §1.2；测试文件全文（410 行） |
| B-P0-2 | `llm_client.py` 全文（201 行）；`settings.py:28-32`；`service.py:341-400`（ask/渲染接线）；README §5.3 |
| B-P0-3 | `assistant/service.py` 全文（338 行）；`16_assistant_questions.csv`（11 行）；`run` 对象结构（`service.py` run_analysis 产物）；Q09 另读 `tests/test_assistant_reports.py`（416 行） |
| B-P1-1 | `knowledge-base.md`（9 行）；官方 00 字典/08/09/10/15 号文件（§1.4 全列）；现答案全部 `knowledge_base` 引用点（grep `knowledge_base` service.py） |
| B-P1-2 | `nlu.py` 全文（108 行）；测试 `_MATCH_CASES`（40 例）；拒答语义四类 |
| B-P1-3 | `llm_client.py` render/_valid_output；`service.py:341-400`；测试渲染组 7 个用例 |

---

## B-P0-1 ｜ StepFun 4 文件收尾提交（D0 阻断项）

- **目标**：把工作区 4 个 StepFun Pro Plan 收尾文件在 `codex/p2-integration` 干净提交，构成 `p3-base` 基线的组成部分。
- **背景**：Pro Plan 已开通并人工验证（端点/模型/子集校验语义三件均通过），但改动滞留工作区（+41/-7 行）；D0 全部门禁、plan0830 文档提交与 tag `p3-base` 均以此提交为前置。
- **改动文件（恰 4 个，不得夹带）**：
  1. `services/h2-analytics/src/h2_analytics/settings.py` —— 端点 `https://api.stepfun.com/v1/chat/completions` → `https://api.stepfun.com/step_plan/v1/chat/completions`（Pro Plan 专属）；`H2_LLM_RENDERER_VERSION` v1→v2 并注释子集校验语义；
  2. `services/h2-analytics/src/h2_analytics/assistant/llm_client.py` —— `_valid_output` 控制词校验由**绝对禁止**改为**子集校验**：仅当渲染文本出现源答案中不存在的 `_UNSAFE_CONTROL` 措辞才判违规；源答案自带的否定/免责表述（"不具备设备控制权限""不构成控制指令"）被忠实保留时放行；
  3. `services/h2-analytics/src/h2_analytics/service.py` —— fallback 分支 rendererVersion 拼接由硬编码 v1 改为 `f"{H2_LLM_RENDERER_VERSION}:{reason}"`（引用常量，杜绝版本漂移）；
  4. `services/h2-analytics/tests/test_assistant_nlu_rendering.py` —— 合法端点断言更新为 step_plan 唯一 URL；2 个"控制"负例改写（源 Q08 答案免责句已含"控制"一词，单独复用不构成新增，须同时携带源中不存在的控制动词才应被拦）；新增 `test_renderer_allows_source_disclaimer_control_wording` 放行测试。
- **实现要点**：**无新代码，纯收尾提交**。提交前 `git diff --stat` 复核仅此 4 文件；`test.md`/`.playwright-mcp/`/`claudedocs/` 归置属 D-P1-4，D0 允许暂留但不入本 commit；commit message 写明 v2 子集语义与端点变更。
- **验收命令与标准**：
  ```
  cd services/h2-analytics && python -m pytest tests/test_assistant_nlu_rendering.py tests/test_assistant_reports.py -q   # 全绿
  git status --short          # 4 文件已入 commit，无本卡残留
  node scripts/h2-sentinel/check-all.mjs   # 全门禁绿（lead 复核）
  ```
  另：`submission/h2-sentinel/CLAIMS_LEDGER.md` 登记 B 线声明条目（端点=step_plan、三态、子集校验语义）。
- **服务验收条款**：验收-T14（外部 API 声明+离线降级的代码底座）；18 分表-助手 4 分的提交前置。
- **会话数**：0.25d（单会话；**D0 由 lead+用户执行**，B 实例待命复核 diff 与测试输出）。
- **依赖**：无。
- **裁剪位**：**不可裁**（D0 阻断项，全方案第一张卡）。
- **风险与回退**：pytest 红 → 先修后提，不得带病提交；提交后 tag 前全门禁复跑；回退 = 单 commit `git revert`。

---

## B-P0-2 ｜ LLM 三态启用/降级策略（云端/本地降级/禁用）

- **目标**：三态 30 秒内可切换、降级对用户可见、演示可复现；env 矩阵核对入档；产出双路径演示段素材。
- **背景**：现场 LLM 可用性未知（企业 Q7"现场网络条件"未答复，D-P0-3 跟踪）；助手 4 分=现场问答，**评分不能依赖云端**。三态代码机制已备（disabled/fallback/rendered），缺的是切换操作规程、降级可见性对接与演示编排。
- **改动文件**：`assistant/llm_client.py`、`api/**`（仅当需状态端点）、`settings.py`（仅当需新常量）；`../CONTRACTS.md` §4 矩阵核对（经整合窗）；`使用说明.md` 助手节**文稿**（该文件属 D 线，走 change-request 交 D 落笔）。
- **实现要点**：
  1. **三态定义（全部既有语义，不新造）**：禁用=`H2_LLM_ENABLED`≠字面 `"true"`（默认，零配置跑通全流程）；云端=`"true"`+`STEPFUN_API_KEY`+`H2_LLM_MODEL`（验证值 `step-3.7-flash`）→ `rendered`；降级=云端态下 `timeout`/`provider_unavailable`/`invalid_output` → 自动回确定性答案（`mode=DETERMINISTIC_TEMPLATE`，rendererVersion 带 `:原因` 后缀）。
  2. **切换机制实测**：改 env → 重启 analytics sidecar → `GET /health` 探活，全流程计时 ≤30s（README §5.3 步骤）；实测超标才考虑 api 层最小热切换（新增断言 <100 行，不为优雅过度设计）。
  3. **降级可见性（IF-6）**：响应 `provenance.mode`/`rendererVersion` 已携带状态信号 → 向 C 线交付字段说明（UI 降级提示渲染）；向 D 线交付双路径演示段素材。
  4. **env 矩阵**：与 CONTRACTS §4 v1 逐行核对，缺漏项（如 `H2_LLM_TIMEOUT_SECONDS`、`H2_LLM_BASE_URL` 覆盖语义）经整合窗补录。
  5. **双路径演示段**：Q7 未答期间，演示脚本必须含云端段+降级段各一次（降级演示=移除 key 或断网重放同一问）。
- **验收命令与标准**：三态各演示 1 次留痕（录屏/截图）；态间切换计时 ≤30s；fail-closed 语义回归不变（`"true"` 无 key → RuntimeError；非官方端点 4 仿冒例零调用）；`python -m pytest tests/test_assistant_nlu_rendering.py -q` 绿。
- **服务验收条款**：验收-T14（外部 API 声明+**离线降级**）、验收-T11（现场可用性）。
- **会话数**：1d（单会话）。
- **依赖**：B-P0-1。
- **裁剪位**：不可裁（P0；风险 6"现场 LLM 不可用"的唯一缓解位）。
- **风险与回退**：重启切换实测超 30s → 实施最小热切换，或在演示脚本如实标注"分钟级切换"（诚实优先）；回退 = 保持默认禁用态，评分不受损。

---

## B-P0-3 ｜ Q01-Q10 现场问答强化（真实数值/引用/三段式/安全边界）

- **目标**：十问逐条审计补强到"现场评委即问即答"标准——每题有当前运行**真实数值**、**引用**（字典/约束/事件）、**事实/计算/建议三段显式**、**安全边界**句不缺。
- **背景**：现答案以方法学表述为主（如 Q04 只讲双向余量公式不给实测值）；助手 4 分=**演示即评分**，评委追问的第一反应是"现在是多少"。十问原文以官方 `16_assistant_questions.csv` 为准。
- **改动文件**：`assistant/service.py`（答案分支数值化）、`packages/h2-vocabulary/data/assistant-questions.json`（仅当需题面变体）、`tests/test_assistant_*.py`（参数化样例，<100 行/会话）。
- **实现要点**：十问逐条审计（现状→补强，数值一律取自当前 run 对象 series/overview/events，**禁止引用标签文件**）：

  | 题 | 原文 | 现状 | 补强 |
  |---|---|---|---|
  | Q01 | PCC正值和负值分别代表什么？ | 符号约定+双源引用 | 补当前运行 PCC 功率区间/正负时长占比实测 |
  | Q02 | 如何区分PCC功率越限与电量配额异常？ | C04 瞬时 vs C05 累计已清 | 补当前运行 C04/C05 事件计数与越限/配额余量数值 |
  | Q03 | 储能方向异常如何影响PCC功率？ | 事件门控 C03+三段+影响值 | 补事件窗储能指令/实际/PCC 三序列关键数值 |
  | Q04 | 如何判断SOC调节备用是否不足？ | **仅方法学**（最弱项） | 补实测：当前 SOC/目标/可充可放功率/剩余时间→双向余量计算 |
  | Q05 | 设备降额但EMS未同步如何定位？ | 方法学+缺项声明 | 补 run_state=3 降额台次与 reported vs actual 容量差 |
  | Q06 | 如何区分云团变化和控制指令振荡？ | 判别方法+最小证据 | 补事件窗光伏波动幅度/指令反转计数实例 |
  | Q07 | 如何评价多台电解槽负荷分配？ | 基线方法+健康度禁区声明 | 补三台逐台功率与效率曲线能耗对比（ELZ01 较优/02 中/03 较低） |
  | Q08 | 哪些建议必须人工确认？ | 四类建议+人工边界已固化 | **维持**（安全基准题，演示首问位） |
  | Q09 | 生成测试集异常诊断报告。 | 已端到端（report_factory 入答案） | 维持+与 C-P1-3 导出口径经 CONTRACTS 对接 |
  | Q10 | PCC合规日报包含哪些内容？ | 内容清单+证据不足声明 | 有累计电量证据则补当日实际数值；无则**维持证据不足声明**（不得以零替代） |

  每题保持 claimKind 三段显式与 `current_run_context`/`selected_event_context` 免责句；事件门控 `_ALLOWED_EVENT_CODES` 不动。
- **验收命令与标准**：
  1. 样例集：每题 ≥3 变体（口语化改写/带事件 ID/追问式）+ 越界问 ≥5 例，全部参数化断言 → **命中 ≥90%、越界 100% 拒答**；
  2. `python -m pytest tests/test_assistant_*.py -q` 全绿；
  3. Q09/Q10 **端到端**：导入→分析→问答→（Q09 报告已入答案；Q10 日报口径与导出一致）；
  4. 十问逐题人工过一遍，清单（每题：数值/引用/三段/安全边界四列勾验）留痕入 `plan0830/B/`。
- **服务验收条款**：验收-T11（运维助手，现场问答=演示即评分，**直挂 4 分**）、验收-T08（安全运行建议三段式+人工确认）。
- **会话数**：2d（会话1=Q01-Q05 数值化；会话2=Q06-Q10+样例集；可选会话3=命中率断言收尾+清单）。
- **依赖**：无硬依赖（B-P0-1 提交后即可开工；B-P0-2 可并行）。
- **裁剪位**：**不可裁**（P0，直接挂 18 分表 4 分）。
- **风险与回退**：数值化引入口径错误 → 每个数值必带 citation（变量/事件/证据 ID），审计清单双人过目；回退 = 逐题 revert 保方法学版本（答案结构未变，回退零风险）。

---

## B-P1-1 ｜ 知识语料扩充（4 条 → ≥60 条，100% 出处）

- **目标**：`knowledge-base.md` 从 9 行 4 条规则扩到 **≥60 条结构化语料**，每条 100% 标出处；引用可溯源；prompt token 预算有记录。
- **背景**：官方知识库仅 4 条（符号/功率平衡/瞬时 vs 累计/不闭环）；现答案大量 `knowledge_base` 引用指向自造 ID（如 `h2-sign-conventions-v1`），语料单薄且不可溯源——评委点开引用应能看到真实条目。语料结构同时是 IF-7（B→C 引用渲染）的交付物。
- **改动文件**：`packages/h2-vocabulary/data/knowledge-base.md`（重扩）、`assistant/corpus.py`（**新建**，按 ID 取条目+引用一致性断言）、`assistant/service.py`（引用落位）、`tests/test_assistant_*.py`。
- **实现要点**：语料来源与配额（合计 ≥60，来源全部经 §1.4 核实）：

  | 来源 | 条数 | 出处标注 |
  |---|---|---|
  | 数据字典 163 行逐变量（按 PV/储能/PCC/EMS/电解槽/辅机分组归纳） | ≥30 | 字典行号+中文描述/单位/公式/related_anomaly |
  | 需求书条款 | ≥10 | 条款号 |
  | 控制约束 12 条全量 | 12 | 约束 ID |
  | 设备台账 8 台全量 | 8 | 设备 ID（PV01..AUX01，与台账一致） |
  | 电解槽效率曲线 3 台 | 3 | 曲线文件出处 |
  | 官方知识库既有 4 条 | 4（保留原文） | 官方 15 号文件 |

  条目 schema：`ID + 正文 + sourceType + sourceId`（出处字段非空由脚本断言）；既有答案全部 `knowledge_base` ID 落到真实条目；**prompt token 预算**：语料注入渲染请求的规模上限实测并记录（现源文本截断 8000 字，语料扩张不得击穿）。
- **验收命令与标准**：语料 100% 有出处（断言 source 字段非空）；Q01-Q10 每处 knowledge_base 引用可溯源到条目（对账清单留痕）；`python -m pytest tests/test_assistant_*.py -q` 绿；`npm run h2:qa` 绿（词表变更）；token 预算数字写入本卡收尾记录。
- **服务验收条款**：验收-T11（引用可溯源）。
- **会话数**：1.5d（会话1=字典+需求书语料化；会话2=约束/台账/曲线+corpus.py+token 预算）。
- **依赖**：B-P0-3（引用结构先行定型）。
- **裁剪位**：第 3 裁——降为**核心 30 条**（字典重点组+约束 12+台账 8）。
- **风险与回退**：语料膨胀撑爆 prompt → 按题检索注入+token 上限；回退 = 保留官方 4 条原文版（引用结构不变）。

---

## B-P1-2 ｜ 追问意图扩展（受限 NLU + 多轮追问）

- **目标**：受限 NLU 意图组扩展+多轮追问（证据/数值追问）；新增样例 ≥30 条，命中 ≥90%；拒答语义不变。
- **背景**：现 NLU 40 匹配样例全部单轮十问域内；评委现场必然追问（"证据是什么/数值多少/那这个事件呢"）。**不开放自由生成**（红线）——扩展仍收敛到 Q01-Q10 + 事件上下文。
- **改动文件**：`assistant/nlu.py`、`assistant/service.py`、`tests/test_assistant_*.py`。
- **实现要点**：
  1. 意图组扩展：证据追问→映射对应题+eventId 复答证据段；数值追问→复答计算段实测值；"然后呢/再具体点"→上一轮题深化段；
  2. 多轮=解析结果携带上一轮 `questionId`/`eventId` 上下文（服务端内存即可，**不落盘**）；
  3. 拒答四类（`input_too_long`/`low_confidence`/`unsupported_intent`/`ambiguous_intent`）语义与阈值 0.66 不松动；控制意图入口拒答 `_CONTROL_INTENT` 不动。
- **验收命令与标准**：新增样例 ≥30 条参数化断言命中 ≥90%；越界（自由闲聊/域外/控制意图变体）100% 拒答；`python -m pytest tests/test_assistant_nlu_rendering.py -q` 绿。
- **服务验收条款**：验收-T11。
- **会话数**：1.5d（会话1=意图组；会话2=多轮+样例）。
- **依赖**：B-P0-3（R2 执行）。
- **裁剪位**：第 2 裁。
- **风险与回退**：意图组交叉致 `ambiguous_intent` 上升 → 每组必有独占关键词；回退 = revert `nlu.py`（单文件，零牵连）。

---

## B-P1-3 ｜ 三段式与引用渲染层强化（云端/降级对照一致）

- **目标**：云端渲染与本地降级输出**对照一致**——三段标签与引用在两态下均不丢；10 组对照样例断言全绿。
- **背景**：`rendered` 态输出纯文本 `renderedText`，降级态是 `sections` 结构化段落——两态呈现差异若不对齐，C 线（IF-6 消费方）无法统一渲染，评委横跳观感差。
- **改动文件**：`assistant/llm_client.py`、`assistant/service.py`、`tests/test_assistant_*.py`。
- **实现要点**：渲染输出保三段标签（claimKind 标记随渲染保留），或渲染后由 `service.py` 重组 `sections`+`renderedText` 对照结构；10 组对照样例=同一问在云端态与降级态各渲染一次，断言 citationIds 一致、claimKind 标签保留、人工确认句保留；**断言扩展合计 <100 行**；解析失败即整体 fallback（沿用既有 fail-closed，不新增部分采纳路径）。
- **验收命令与标准**：10 组对照样例断言全绿；`python -m pytest tests/test_assistant_nlu_rendering.py -q` 绿；断言行数清点 <100。
- **服务验收条款**：验收-T11、验收-T14（降级一致性）。
- **会话数**：1d（单会话）。
- **依赖**：B-P0-2（R2 执行）。
- **裁剪位**：第 1 裁。
- **风险与回退**：LLM 文本破坏分段 → 解析失败整体 fallback（语义已备）；回退 = 维持两态现状差异，在使用说明（经 D）注明"降级态为结构化原文"。

---

## 附：跨线接口备忘（本线参与的 IF，全文见 ../CONTRACTS.md §6）

| IF | 内容 | 方向 | 时点 |
|---|---|---|---|
| IF-2 | 操作日志 remark 证据条目格式 | A→B（根因联动答案消费） | G1 前 |
| IF-6 | LLM 三态切换与降级提示信号 | **B→**C（助手页渲染）、D（演示双路径段） | G1 |
| IF-7 | 知识语料结构（条目 schema 与出处字段） | **B→**C（引用渲染） | G2 |

变更请求：向他线文件的任何诉求，按 CONTRACTS §7 在对方 TASKS.md 看板追加 `change-request` 行。

---

## 他线对本线的 change-request 登记区（B 收到请求在此登记并排期）

| # | 发起线 | 文件 | 诉求 | 理由 | 状态 |
|---|---|---|---|---|---|
| — | — | — | （空；收到首条请求后追加） | — | — |

> 本线向外发起的请求登记到**对方线** TASKS.md 的同名区域。预登记：B-P0-2 将向 D 线发起 `使用说明.md` 助手节文稿 change-request。

## 完成记录（收工追加一行：日期｜卡｜commit｜证据指针）

| 日期 | 卡 | commit | 证据 |
|---|---|---|---|
| — | — | — | — |

## 附 2：本线在三级门禁的交付对照

| 门禁 | 时点 | 本线须交付 |
|---|---|---|
| G0（D0） | B-P0-1 提交+tag `p3-base` | 4 文件干净 commit+全门禁绿+CLAIMS_LEDGER 条目 |
| G1（D7） | R1 功能收口 | B-P0-2/3 完成（三态演示留痕+样例 ≥90% 命中）；B-P1-1 提前量尽量完成；整合分支全门禁绿 |
| G2（D14 冻结） | R2 打磨收口 | B-P1-1/2/3 完成或按裁剪序明示放弃；IF-6/IF-7 交付确认；18 分表-助手 4 分自查行结论 |
