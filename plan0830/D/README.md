# D 线 · 部署交付与验收合规（Deployment & Acceptance Compliance）

> plan0830 四线之一 ｜ 域=`scripts/h2-sentinel/**` + validation D 侧 + `quality/**` + `ingestion/**` + `reports/submission.py` + submission 包运维文档 + 使用说明.md ｜ 版本 v1（D0 基线）

## §0 定位与上下文预算声明

**定位**：D 线负责「装得上、跑得稳、导得出、说得清」——换机复现演练（部署 4 分）、submission 16 字段导出收口、企业 10 题外联与保守口径、一键启动加固、数据质量门禁扩展、离线依赖交付、仓库卫生与三开关终值冻结。D 线不碰检测算法（A 线）、助手语料（B 线）、前端页面（C 线），但为三线成果提供「组织方独立环境可复现」的交付底座。

**上下文预算声明**（每会话开工/收尾自检）：

| 项 | 值 |
|---|---|
| 预算模型 | 必读文档 ≈1.3k 行（本 README + D/TASKS.md + CONTRACTS + COORDINATION 摘录）+ 工作代码 ≤8k 行 + 工具输出 ≤2k 行/次 |
| 稳态目标 | **<150k tokens**（700k 上限的约 1/5），警戒线 200k |
| 超限症状 | 开始全仓库漫游、反复读白名单外文件、单卡超过 2 个会话未收敛 |
| 续作规程 | 出现症状立即停卡 → 重开会话 → 只读本 README §2 看板 + TASKS.md 对应卡续作；禁止在超限会话内做写操作 |
| 数据纪律 | 382MB 官方 CSV（`D:\allcode\h2-t01-official\dataandfiles\`）禁止整读入上下文，仅经 validation 脚本或采样读取；11/12/13 号日志、manifest、变量字典等小文件可整读 |

**新会话首步检查清单**（顺序执行，≈5 分钟）：

1. `git branch` 确认在 `codex/p3-d`（worktree `qingneng-wt/d`）；`git status` 无未解释改动
2. 读本 README §2 任务总表 + `D/TASKS.md` §0.2 看板 → 确定本次会话做哪张卡
3. 读该卡全文 + 卡内列出的改动文件（仅白名单内）
4. 跑该卡「开工自检命令」（各卡定义，通常是 doctor 或对应校验脚本）确认基线绿
5. 开工；收卡按 TASKS.md §2 收卡纪律

## §1 事实速览（开工前必背）

### 1.1 评分与验收事实

| # | 事实 | 说明 |
|---|---|---|
| 1 | **换机复现 = 4 分** | 18 分表「部署」行（总览4/事件4/助手4/报告2/部署4），是唯一以「复现」为验收方式的评分行 |
| 2 | 换机复现语义（验收-T13） | 组织方在**独立环境**完成：安装 → 启动 → 导入测试集 → 运行 → 导出，全程不依赖开发者本机状态与缓存 |
| 3 | 算法分值不可见 | 本地需求书缺第 8-10、13 节（交付物清单 D01-D13 + 评分框架），SHA 与官方校验清单不一致（21/24 匹配）→ 防御性全覆盖，不押注单项 |
| 4 | D 线服务的验收条款 | 验收-T13 部署复现、验收-T02 数据质量、验收-T12 导出、验收-T01 导入维护、验收-T14 合规口径 |
| 5 | submission 16 字段全必填 | 官方模板仅表头无样例行，字段语义靠需求书+字典反推（Q4 悬置，见 ENTERPRISE_OUTREACH.md） |

### 1.2 18 分表与 D 线承接（完整映射见 00_README 追溯矩阵）

| 评分行 | 分值 | 承接 | D 线角色 |
|---|---|---|---|
| 总览（页面检查） | 4 | C-P0-2 | 无（复现环境由 D 保底） |
| 事件中心（页面操作） | 4 | C-P0-3 | 无 |
| 运维助手（现场问答） | 4 | B-P0-3 | Q7 网络条件口径由 D 台账供给 |
| 报告（导出文件） | 2 | C-P1-3 | 导出链路复现由 D 演练覆盖 |
| **部署（换机复现）** | **4** | **D-P0-1（主）** | **D 线主战场：D-P1-1/3、D-P2-1 支撑** |

### 1.3 plan0829 遗留（D 线接手清单）

| 遗留项 | 现状 | 承接卡 |
|---|---|---|
| 两次换机演练留痕 | 未见逐条记录入库，待复核 | D-P0-1 |
| gate-7 追认 | 拖延未补档（终局记录部分入库，需按 plan0830 口径补终档） | D-P1-4 |
| 验收-T02 质量扩展（P2-6） | 枚举/单位/跨文件一致性检查缺位 | D-P1-2 |
| 企业 10 题 | 全部 0 答复悬置 | D-P0-3 |
| 仓库卫生 | 根目录 `test.md`（用户指令草稿）+ `.playwright-mcp/` + `claudedocs/` 未归置 | D-P1-4 |
| 三开关默认 off | 启用策略未决 | D-P2-1（消费 A/B 线决策） |
| 4 个 StepFun 文件未提交 | codex/p2-integration 工作区改动 | B-P0-1（D0 阻断项，D 线等其完成后开跑演练） |

### 1.4 一键启动现状

| 项 | 现状 |
|---|---|
| 演示模式 | `npm run h2:fixture` —— 无 Python、无网络依赖，内置 fixture 数据，评委演示主力 |
| 完整模式 | `npm run h2:local` —— Node + Python（FastAPI 侧车 8765）全栈 |
| 端口 | web=5173，analytics=8765 |
| Windows 入口 | `start-h2-sentinel.bat`（仓库根）—— **必须带 `--mode` 参数**（fixture/local），无参即失败 |
| 体检 | `node scripts/h2-sentinel/doctor.mjs --mode local` |
| 全门禁 | `node scripts/h2-sentinel/check-all.mjs` |
| 冒烟 | `node scripts/h2-sentinel/smoke.mjs` |
| 现有故障注入底座 | `adversarial-launch.mjs` + `launch.test.mjs` + `composition.test.mjs`（D-P1-1 扩展它们，不重造） |

### 1.5 环境矩阵（换机复现的最低要求，RUNBOOK 详版为准）

| 项 | 要求 | 备注 |
|---|---|---|
| OS | Windows 10/11（64 位） | runbook 另有跨平台注记 |
| Node | 按 package.json engines（npm ci 锁版本） | 演练机装错大版本=RUNBOOK 失败项 |
| Python | 3.12（uv 管理，`uv sync --locked --extra dev`） | fixture 模式不需要 Python |
| 浏览器 | 现代 Chromium 系（评委现场打开 5173） | |
| 网络 | 默认无外网（保守口径，Q7/Q10 未答） | 云端 LLM 走离线降级 |
| 磁盘 | 仓库+官方数据 ≈1GB 级 | 382MB 数据不进 git |

### 1.6 依赖安装（换机复现第一步）

| 运行时 | 命令 |
|---|---|
| Node 侧 | `npm ci`（锁版本） |
| Python 侧 | `uv sync --locked --extra dev` |
| 加 ML（可选） | `uv sync --locked --extra dev --extra ml` |
| 官方数据 | 不进 git；按 OPERATOR_RUNBOOK 以绝对路径 `D:\allcode\h2-t01-official\dataandfiles\` 挂载（换机时按 runbook 拷贝） |

### 1.7 submission 16 字段（官方模板表头，逐字）

模板源：`D:\allcode\h2-t01-official\dataandfiles\17_submission_template.csv`（官方数据目录，不进 git）

```
pred_event_id,start_time,end_time,anomaly_code,anomaly_subtype,severity,
primary_control_object,affected_equipment,confidence,evidence_json,
root_cause,recommended_action,primary_impact_metric,estimated_impact_value,
first_detection_time,requires_human_confirmation
```

- 16 字段**全部必填**；**易漏四字段** = `confidence` / `evidence_json` / `first_detection_time` / `requires_human_confirmation`（历史导出最易缺/空）
- 设备 token 以台账为准归一化：`PV01/BESS01/PCC01/EMS01/ELZ01-03/AUX01`（Q4 歧义见 ENTERPRISE_OUTREACH.md）
- `pred_event_id` 现口径：`{code}-{YYYYMMDD}-{ordinal:03d}`
- severity 确定性映射（A-P0-3 收口）：C01/C06=中，C02/C03/C04/C05/C07=高——导出侧只消费不重算

### 1.8 三开关现状（默认全 off，终值由 D-P2-1 冻结）

| 开关 | 环境变量 | 现默认 | 决策来源 | 演示影响 |
|---|---|---|---|---|
| ML 校验层 | `H2_ML_ENABLED` | off | A-P2-1 go/no-go | off 亦全功能（纯确定性系统） |
| 流式导入 | （ingestion 会话级开关） | off | D 线自评（依赖 D-P1-2 质量门禁） | fixture 演示不涉及 |
| 云端 LLM 助手 | `H2_LLM_ENABLED` | off | B-P0-2 三态策略 | off=本地降级路径，问答功能不缺失 |

### 1.9 submission 包文件清单与归属（Glob 已核实，15 个 md + 2 个 docx）

| 文件 | 归属 |
|---|---|
| OPERATOR_RUNBOOK.md / HANDOFF.md / RUNTIME_EVIDENCE_CHECKLIST.md / LICENSE_AND_THIRD_PARTY_CHECKLIST.md / README.md | **D 线独占写** |
| DEMO_SCRIPT.md / JUDGE_CHECKLIST.md / TEN_PAGE_PROJECT_NARRATIVE.md / LEIDONG_ENTERPRISE_ALIGNMENT_BRIEF.md(.docx) / LEIDONG_WECHAT_ALIGNMENT_PLAYBOOK.md(.docx) / SCREENSHOT_SHOT_LIST.md | C 线独占写，D 只读 |
| PRODUCT_AND_ARCHITECTURE.md / CLAIMS_LEDGER.md | 共享只读，改动走 change-request（CLAIMS_LEDGER 追认登记按 D-P1-4 卡内说明） |

## §2 任务总表（8 卡，详卡见 TASKS.md）

| ID | 任务 | 档 | 量 | 服务条款 | 依赖 | 状态 |
|---|---|---|---|---|---|---|
| D-P0-1 | 换机复现演练与留痕（4 分） | P0 | 2d(2-3会话) | 验收-T13 | B-P0-1 | ☐ |
| D-P0-2 | submission 16 字段导出收口 | P0 | 1d | 验收-T12 | A-P0-3(软) | ☐ |
| D-P0-3 | 企业 10 题外联+防御口径 | P0 | 1d | 验收-T14 | 无 | ☐ |
| D-P1-1 | 一键启动加固 | P1 | 1.5d(2会话) | 验收-T13 | 无 | ☐ |
| D-P1-2 | 验收-T02 质量扩展 | P1 | 1.5d(2会话) | 验收-T02+T01 | 无 | ☐ |
| D-P1-3 | 离线依赖清单与包 | P1 | 1d | 验收-T13 | D-P1-1 | ☐ |
| D-P1-4 | gate-7 追认+仓库卫生 | P1 | 0.5d | 验收-T14 | 无（D1） | ☐ |
| D-P2-1 | 三开关最终默认值冻结 | P2 | 0.5d | 验收-T13+T14 | A-P2-1、B-P0-2（D12-13） | ☐ |

- 状态标记：`☐` 未开始 / `◐` 进行中 / `✓` 完成（附日期）/ `✂` 已裁剪（附明示放弃理由）
- 本表与 TASKS.md §0.2 看板同步更新（D 线实例自查，整合窗复核）
- 领卡顺序建议：D-P1-4（D1 清卫生）→ D-P0-1（4 分主战场）→ D-P0-2 ∥ D-P0-3 → R2 按 §6.1

## §3 读白名单（违反即上下文爆炸）

### 3.1 可读

| 类 | 路径 |
|---|---|
| 本线文档 | `plan0830/D/**`、CONTRACTS.md、COORDINATION.md、RISK.md、00_README.md（全周知共享工件另含 C/ACCEPTANCE_AUDIT.md） |
| 启动与门禁脚本 | `scripts/h2-sentinel/**`（launch/doctor/check-all/smoke/adversarial-launch 及其 .test.mjs） |
| validation D 侧 | `validation/check-submission.mjs`、`validation/offline-deploy-smoke.mjs`、`validation/run-demo.mjs`、`validation/lib/submission.mjs`、`validation/lib/official-contract.mjs` |
| A 线脚本（能跑不改） | `validation/evaluate.mjs`、`validation/overfit-sentinel.mjs`、`validation/normal-context-regression.mjs` |
| quality / ingestion | `services/h2-analytics/src/h2_analytics/quality/**`、`services/h2-analytics/src/h2_analytics/ingestion/**` |
| 导出 | `services/h2-analytics/src/h2_analytics/reports/submission.py`（renderer.py 归 C 线，只读） |
| submission 包 | `submission/h2-sentinel/` 全部（运维文档为主；C 线持有文件 D 只读，见 §1.9 归属表） |
| 使用说明 | `使用说明.md`（仓库根）、`start-h2-sentinel.bat` |
| 冻结契约（只读） | `packages/contracts/**`、vocabulary `data/{fields,equipment,constraints,submission-equipment-tokens,version}.json` —— 改动走 CONTRACTS 变更流程 |
| 数据小件 | manifest、11/12/13 号日志、变量字典、`17_submission_template.csv`（表头级引用） |

### 3.2 禁读

| 类 | 路径 | 理由 |
|---|---|---|
| A 线域内部 | `detection/**`、`events/**`、`impact/**`、`diagnosis/**`、`tools/**` | 上下文爆炸；D 线只消费其导出物 |
| B 线域内部 | `assistant/**`、`settings.py`、`service.py`、`api/**` | 同上 |
| C 线域内部 | `apps/web/**`、`plugins/**` 内部实现 | 经 api 契约交互即可 |
| 大 CSV | 官方 train/test 382MB 数据 | 仅经脚本/采样读；整读=会话报废 |

## §4 独占写清单（CONTRACTS 所有权矩阵 D 列，他线禁写）

```
scripts/h2-sentinel/**                                    （含 .test.mjs）
validation/check-submission.mjs
validation/offline-deploy-smoke.mjs
validation/run-demo.mjs
services/h2-analytics/src/h2_analytics/quality/**
services/h2-analytics/src/h2_analytics/ingestion/**
services/h2-analytics/src/h2_analytics/reports/submission.py
submission/h2-sentinel/OPERATOR_RUNBOOK.md
submission/h2-sentinel/HANDOFF.md
submission/h2-sentinel/RUNTIME_EVIDENCE_CHECKLIST.md
submission/h2-sentinel/LICENSE_AND_THIRD_PARTY_CHECKLIST.md
submission/h2-sentinel/README.md
使用说明.md
start-h2-sentinel.bat
.env.example（仓库现无此文件，D-P2-1 新建）
plan0830/D/**
```

- 白名单外 diff 在整合窗**拒合**；需要动他线文件 → COORDINATION change-request。
- `validation/evaluate.mjs`、`overfit-sentinel.mjs`、`normal-context-regression.mjs` 归 A 线写——D 线跑其命令不改动。
- 临时产物（演练日志、故障注入输出、导出样例）按卡指定位置入库或即用即删，禁止散落白名单目录。

## §5 验收命令集（每卡收尾必跑相关项；整合窗跑全量）

| 命令 | 用途 | 通过标准 |
|---|---|---|
| `node scripts/h2-sentinel/doctor.mjs --mode local` | 环境体检 | 全项绿（exit 0） |
| `node scripts/h2-sentinel/check-all.mjs` | 全门禁 | 全项绿 |
| `node scripts/h2-sentinel/smoke.mjs` | 快速冒烟 | 绿 |
| `node validation/check-submission.mjs` | submission 契约校验 | 16 字段全绿，token 归一化绿 |
| `node validation/offline-deploy-smoke.mjs` | 离线部署冒烟 | 断网模拟下启动+导出成功 |
| `node validation/run-demo.mjs`（跑 2 次） | 演示固化 | 双次各 <180s |
| `npm run h2:fixture` / `npm run h2:local` | 双模式启动 | 浏览器可开 5173；local 另有 8765 |

留痕纪律：

- 验收输出（终端日志/清单/截图）按卡要求入库；**SHA 证据只对 clean commit 有效**——文档/代码提交后须对最终 commit 重生成 ignored 证据（见 §7 红线 4）
- 每次留痕三件套 = 命令原文 + 当次 commit SHA + 输出/截图；三缺一=留痕无效

### §5.1 常见失败速查（排障详版在 OPERATOR_RUNBOOK）

| 症状 | 首查 | 常见原因 |
|---|---|---|
| 5173 打不开 | `doctor.mjs --mode local` | 端口占用/依赖未装/vite 未起 |
| 8765 不通 | doctor 的 analytics 节 | Python venv 未 sync/local 模式未启动侧车 |
| bat 一闪而过 | 是否带 `--mode` | 无参即失败（D-P1-1 改为友好提示） |
| 首跑卡很久 | 启动日志阶段行 | 首跑构建/缓存属预期，非挂死 |
| 导出缺列 | check-submission 负样本自测 | 四字段门禁未过=导出器问题，非校验器 |

## §6 日程与裁剪序

### 6.1 排期（对齐 COORDINATION 两轮节奏）

| 轮 | 日 | 卡 | 说明 |
|---|---|---|---|
| R1 | D1 | D-P1-4 | 首周先清仓库卫生（gate-7 追认+归置），后续卡在干净基线上做 |
| R1 | D1-D5 | **D-P0-1** | 提前双演练（占 4 分最大风险项，留修复循环时间）；B-P0-1 完成后即可开跑 |
| R1 | D4-D7 | D-P0-2 ∥ D-P0-3 | 两卡无文件交集，可并行；G1（D7）前完成全 P0 |
| R2 | D8-D10 | D-P1-1 → D-P1-3 | 启动加固先行，离线依赖包复用其故障注入底座 |
| R2 | D8-D11 | D-P1-2（与上并行） | 质量扩展独立于启动链路 |
| R2 | D12-13 | D-P2-1 | 消费 A-P2-1/B-P0-2 决策，G2 冻结前完成；换机演练用终值复跑 |

整合窗（D3/D5/D7/D9/D11/D13）：D 线提交白名单内 diff → 等整合人按 A→B→C→D 序合并 → 回归 §5 全量命令。

### 6.2 裁剪序（进度超支时从上往下裁，P0 不可裁）

| 序 | 裁 | 降级形态 |
|---|---|---|
| 1 | D-P1-3 | 整卡裁：OPERATOR_RUNBOOK 保留「在线安装清单」节，不做离线包与演练 |
| 2 | D-P1-2 | 降为**枚举校验**：只做 run_state/available_flag/plc_heartbeat 枚举门禁，单位/跨文件一致性转 R3 或明示放弃 |
| 3 | D-P1-1 | 降为 **doctor 扩展**：不做 10 连启动与故障注入自动化，doctor 增补端口/进程/依赖检查项+RUNBOOK 排障节 |

### 6.3 总量

≈9 任务日 / 13 实例日容量（占用 ≈70%，留整合窗与缓冲）。

### 6.4 D 线门禁自检（G1/G2 各跑一遍）

| 门 | G1（D7） | G2（D14） |
|---|---|---|
| P0 全完成 | D-P0-1/2/3 ✓ | 维持 |
| §5 命令全绿 | 整合分支上全量 | 终值配置下全量 |
| 换机演练 | 2 次留痕入库 | 用 D-P2-1 终值复跑 |
| submission 样例 | test 分区导出留痕 | 终值下重导出留痕 |
| 台账 | 十题口径 v1 | 终态口径汇总进 HANDOFF |
| 仓库卫生 | git status 可解释 | clean commit + 重生成证据 |

## §7 红线（违反=验收事故，优先级最高）

| # | 红线 | 说明 |
|---|---|---|
| 1 | **不得修改测试答案或人工植入测试标签** | 换机演练中发现的任何「结果不对」只能走代码修复，禁止手改导出 CSV/中间产物 |
| 2 | **处理过程可追溯** | 每次演练/导出留：命令、commit SHA、日志、截图；证据链断=演练无效 |
| 3 | **离线本地部署** | local-first/loopback-only；换机环境默认无外网；云端 LLM 仅增值层且必须可降级（B-P0-2 三态） |
| 4 | **SHA 证据只对 clean commit 有效** | RUNTIME_EVIDENCE_CHECKLIST 所录 SHA 随其后任何提交失效——文档提交后必须对最终 commit 重生成 ignored 证据（G2 冻结流程含此步） |
| 5 | 继承全局红线 | 不发控制指令、建议带人工确认、LLM 不复核检测事实、不构造健康度、不硬编码测试答案、不凭报警计数判异常 |
| 6 | 仓库卫生 | 临时脚本/日志用完即删；不落 `debug.*`/`temp*` 于白名单目录；`git status` 在 G1/G2 门禁必须可解释 |
| 7 | 外联表述纪律 | 任何文档禁用「按企业要求」指未获书面答复的口径（ENTERPRISE_OUTREACH.md §3） |

---

> D 线三件套：本 README（作战手册）+ `D/TASKS.md`（8 卡详卡+看板）+ `D/ENTERPRISE_OUTREACH.md`（企业 10 题滚动台账）。开工顺序：读本 README → TASKS.md 看板领卡 → 卡内自包含执行。
