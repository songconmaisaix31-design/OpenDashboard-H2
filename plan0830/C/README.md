# C 线作战手册 — 前端演示与可视化 · 企业价值物料（plan0830）

> 版本：2026-08-30 ｜ 线域：`apps/web` 六页 + `model` 呈现层 + `plugins/h2-ems` + `reports/renderer.py` + `submission` 演示物料 + 企业价值物料
>
> 必读三件套：`../00_README.md`（总入口/看板）+ `../CONTRACTS.md`（跨线契约/所有权）+ `../COORDINATION.md`（时间线/整合窗）；本手册 + `TASKS.md` 为本线自包含两件。本目录第三件 `ACCEPTANCE_AUDIT.md` 为**全周知共享工件**（C 线持笔，四线与整合人共读）。
>
> 执行环境：worktree `qingneng-wt/c`，分支 `codex/p3-c`；整合在主检出 `codex/p3-integration` 做。

---

## §0 定位与上下文预算声明

### 0.1 C 线在四线中的位置

| 线 | 域 | 与 C 线关系 |
|---|---|---|
| A 检测精度 | detection/events/impact/diagnosis | C 只消费其数值与事件口径（经 API 契约），不自算 |
| B 助手质量 | assistant/settings/service | 助手页 UI 归 C；问答内容/渲染契约归 B |
| **C 前端演示** | **apps/web 六页 + renderer + 演示/价值物料** | **本线** |
| D 部署合规 | scripts/validation(D侧)/quality/submission 包 | 启动器/换机/submission 导出归 D；C 的截图终版晋升入 submission 包 |

**C 线持分**：18 分表中 **10 分直接责任**（系统总览 4 + 事件中心 4 + 报告 2）；另承担助手 4 分与部署 4 分的**演示呈现面**（现场问答怎么演、换机复现怎么展示、访问方式怎么讲）。

### 0.2 上下文预算（四线统一模板）

- 必读文档 ≈1.3k 行（00_README + CONTRACTS + COORDINATION 摘录 + 本 README + TASKS）
- 工作代码 ≤8k 行（六页 + model 五件 + renderer.py + 演示物料）
- 工具输出 ≤2k 行/次（命令输出即看即弃，不整读大文件）
- 稳态 **<150k tokens**（警戒 200k；会话上限 700k）

### 0.3 超限症状与续作规程

**超限症状**：开始全仓库漫游 / 重复读同一大文件 / 忘记任务卡字段 / 越过 §3 白名单翻检 detection、assistant 内部实现。

**续作规程**：出现症状或会话收尾 → 重开会话 → 读 `../00_README.md` 状态看板 + 本手册 §2 总表 + `TASKS.md` 开头状态看板 → 续下一张未完成卡。**禁止凭记忆跨卡操作**；每卡开工前重读该卡全文。

### 0.4 首会话开工序列（自包含入口）

1. 读必读三件套（00_README / CONTRACTS / COORDINATION）+ 本手册 + `TASKS.md` 开头看板。
2. 核对环境：worktree 分支 `codex/p3-c`；`npm run h2:fixture` 能起（起不来 → 报 D 线，不自修 `scripts/`）。
3. 首卡 = **C-P0-1**（18 分表逐项审计）：按 `TASKS.md` 该卡实现要点执行，产出 `ACCEPTANCE_AUDIT.md` 现状列。
4. 收工纪律：更新看板 → 截图/清单入 `plan0830/C/evidence/C-P0-1/` → 独立 commit（message 带 `C-P0-1`）→ push `origin/codex/p3-c`。

---

## §1 事实速览

### 1.1 六页清单（`apps/web/src/features/h2-sentinel/pages/`）

| # | 页面 | 文件 | 承担 |
|---|---|---|---|
| 1 | 系统总览 | `pages/overview/OverviewPage.tsx` | 18分#1 系统总览（4 分）；验收-T09/T10 |
| 2 | 事件中心 | `pages/events/EventsPage.tsx` | 18分#2 事件中心（4 分）；验收-T10 |
| 3 | 诊断详情 | `pages/diagnosis/DiagnosisPage.tsx` | 事件详情/证据链呈现；验收-T06 呈现面 |
| 4 | 多变量分析 | `pages/analysis/AnalysisPage.tsx` | 多变量趋势；验收-T10 |
| 5 | 运维助手 | `pages/assistant/AssistantPage.tsx` | 18分#3 现场问答（4 分；B 线主责内容，C 线呈现） |
| 6 | 报告导出 | `pages/reports/ReportsPage.tsx` | 18分#4 报告（2 分）；验收-T12 |

入口与路由：`H2SentinelApp.tsx` / `H2SentinelView.tsx` / `routes.ts` / `index.ts`。

### 1.2 呈现层关键文件（`model/` 与插件）

| 文件 | 职责 |
|---|---|
| `model/presentation.ts` | 变量中文名/单位**单源映射**（fields.json → 六页 UI） |
| `model/chart-options.ts` | 图表序列/联动曲线配置（现状：仅 C03 有专属序列，其余类别走"前 5 证据变量"降级） |
| `model/reporting.ts` | 导出装配 |
| `model/assistant.ts` | 助手前端呈现（内容与渲染契约归 B 线） |
| `model/view-state.ts` `model/series-loader.ts` `model/workspace-loader.ts` `model/sha256.ts` `model/review.ts` | 视图状态/数据装载/哈希/复核 |
| `components/charts/EChartsCanvas.tsx`（+Runtime） | 图表画布 |
| `plugins/h2-ems/src/**` | 数据源适配（fixture/loopback/live）+ 导出服务（`services/export-service.ts`、`mode-service.ts`） |
| `services/h2-analytics/src/h2_analytics/reports/renderer.py` | 异常报告 HTML 渲染器（renderer v2；**C 独占写**） |

### 1.3 Web 验收 18 分表（唯一可见评分，原文）

来源：T03 资料包 `01_数据材料与字段说明_.xlsx`「Web验收」sheet（经 `plan0829/01_GAP_ANALYSIS.md` §1 抄录）：

| # | 验收项（原文口径） | 分值 | 验收方式 |
|---|---|---|---|
| 0 | 访问方式（现场打开 localhost） | 门槛（无分值） | 现场打开 localhost |
| 1 | 系统总览：**光伏、储能、PCC、配额、电解槽和异常 KPI** | 4 | 页面检查 |
| 2 | 事件中心：**筛选、排序、事件详情和联动曲线** | 4 | 页面操作 |
| 3 | 运维助手：固定问答/追问/引用/安全边界 | 4 | **现场问答** |
| 4 | 报告：异常报告 + PCC 合规日报 | 2 | 导出文件 |
| 5 | 部署：本地离线/一键启动/说明完整 | 4 | **换机复现** |

逐项现状/差距/负责任务滚动更新 → 本目录 `ACCEPTANCE_AUDIT.md`（C-P0-1 持笔）。

### 1.4 单源与台账纪律

- **中文名/单位单源** = `packages/h2-vocabulary/data/fields.json`（163 行字典），经 `model/presentation.ts` 映射到六页；**任何页面禁止自造译名/单位/缩写**。
- **设备名与台账一致** = PV01 / BESS01 / PCC01 / EMS01 / ELZ01 / ELZ02 / ELZ03 / AUX01（`packages/h2-vocabulary/data/equipment.json`）。
- 数值口径（配额 4500/20000kWh、SOC 20-90%、爬坡 120kW/min 等）出自 `packages/h2-vocabulary/data/constraints.json` —— 前端展示常数必须可溯源到 vocabulary 只读文件或 API 契约，**禁止前端硬编码自算**。

### 1.5 双模式启动

| 模式 | 命令 | 说明 |
|---|---|---|
| fixture（演示） | `npm run h2:fixture` | 无 CSV 依赖；web=5173；演示/截图默认模式；UI 如实带 FIXTURE 标签 |
| local（完整） | `npm run h2:local` | analytics 侧车=8765；完整导入/检测链路 |

### 1.6 现状基线（plan0829 冻结时点，2026-08-30 gate-s6）

- 六页 + fixture/local 双模式已交付；tag `gate-s6`；验证集 F1=0.9718（TP69/FP3/FN1）。
- 演示固化：`validation/run-demo.mjs` 双次 <180s。
- `submission/h2-sentinel/SCREENSHOT_SHOT_LIST.md` 15 项（S01-S15）多为 "pending" 留痕状态 → 截图留痕是本线 P0/P1 的显式补课面。
- 已知差距（承 plan0829 §1）：事件中心仅 C03 专属图表序列；报告模板美化与 PCC 日报完整性待复核；演示路径未固化为可重复脚本（v1 已有，v2 待升）。

---

## §2 任务总表（8 卡）

| 编号 | 任务 | 档位 | 量 | 服务条款 | 依赖 | 状态 |
|---|---|---|---|---|---|---|
| C-P0-1 | 18 分表逐项审计（持笔 ACCEPTANCE_AUDIT.md） | P0 核心 | 0.5d | 18分全项 + 验收-T09/T10/T12 视角 | 无 | 未开始 |
| C-P0-2 | 总览 KPI 完整性（4 分） | P0 核心 | 1d | 验收-T09、验收-T10 | C-P0-1 | 未开始 |
| C-P0-3 | 事件中心联动补强（4 分） | P0 核心 | 1.5d（2 会话） | 验收-T10 | C-P0-1 | 未开始 |
| C-P1-1 | 六页中文名/单位一致性 | P1 | 1d | 验收-T09、验收-T10 | 建议 P0 后 | 未开始 |
| C-P1-2 | 演示脚本 v2 | P1 | 1d | 验收-T09 + 18分#2/#3 呈现 | C-P0-2/C-P0-3 | 未开始 |
| C-P1-3 | 报告导出打磨（2 分） | P1 | 1.5d（2 会话） | 验收-T12 | 无（R2 执行） | 未开始 |
| C-P1-4 | 企业价值物料包 | P1 | 1.5d（2 会话） | 企业价值呈现（非条款分） | R2 功能冻结后取终值 | 未开始 |
| C-P2-1 | 分析/诊断页残余打磨 | P2 可裁 | 1d | 验收-T10 | 可裁 | 未开始 |

### 2.1 跨线接口（本线常触点）

| 对端 | 事项 | 通道 |
|---|---|---|
| B 线 | 助手页呈现契约、Q09/Q10 报告数据口径、LLM 三态演示口径 | `../CONTRACTS.md` 助手响应契约 + change-request |
| A 线 | KPI/事件数值口径疑问（异常 KPI 计数、影响值） | change-request；契约视图=`services/h2-analytics/src/h2_analytics/api/models.py` |
| D 线 | submission 包截图晋升、启动器问题（fixture 起不来先报 D 不自修） | change-request / 整合窗 |
| 整合人 | version.json、00_README 看板、审计表在 G1/G2 被引用 | 整合窗 |

详细任务卡（目标/背景/改动文件/实现要点/验收/条款/会话数/依赖/裁剪位/风险回退）→ `TASKS.md`。

---

## §3 读白名单

**可读（开工必需；超出者须有明确卡片指向）**：

- 本线文档：`plan0830/C/**`、`plan0830` 顶层四文档
- 前端域：`apps/web/src/features/h2-sentinel/**`（六页 + model + components + routes + test）
- 插件：`plugins/h2-ems/src/**`
- 渲染器：`services/h2-analytics/src/h2_analytics/reports/renderer.py`
- 契约窗口：`services/h2-analytics/src/h2_analytics/api/models.py`（与检测/助手交互的唯一契约视图，禁入其实现目录）
- 演示物料：`submission/h2-sentinel/` 内 C 线名下件（见 §4 清单）+ 根目录 `使用说明.md`
- 小文件只读：`packages/h2-vocabulary/data/fields.json`、`equipment.json`、`constraints.json`
- 素材：`claudedocs/项目与云端原始版优化对比.md`

**禁读**：

- `services/h2-analytics` 的 `detection/`、`events/`、`impact/`、`diagnosis/`、`assistant/` 内部实现（A/B 线域；需求一律经 `api/models.py` 契约 + change-request）
- `validation/**`（只跑不改不读源码）、`quality/**`、`ingestion/**`、`scripts/**`（D 线域）
- 大 CSV（382MB 官方数据；仅经脚本/采样读，禁止整读入上下文）
- `packages/**` 冻结契约（只读引用；改动走 change-request）

---

## §4 独占写清单

| 域 | 路径 |
|---|---|
| 前端全部 | `apps/web/src/features/h2-sentinel/**` |
| 插件 | `plugins/h2-ems/src/**` |
| 渲染器 | `services/h2-analytics/src/h2_analytics/reports/renderer.py` |
| 演示物料 | `submission/h2-sentinel/{DEMO_SCRIPT, JUDGE_CHECKLIST, TEN_PAGE_PROJECT_NARRATIVE, LEIDONG_ENTERPRISE_ALIGNMENT_BRIEF, LEIDONG_WECHAT_ALIGNMENT_PLAYBOOK, SCREENSHOT_SHOT_LIST}.md` + 新增 `答辩QA.md` |
| 本线文档 | `plan0830/C/**` |

边界提醒：

- `settings.py` / `service.py` / `api/**` = B 线；`reports/submission.py` = D 线；`version.json` = 仅整合人。
- `renderer.py` 版本号（rendererVersion）若与 B 线 `service.py` 引用联动 → change-request，不代改。
- `fields.json` 等 vocabulary 数据 = 冻结只读；缺口（字典未覆盖项）走 change-request，**不自行造词**。

---

## §5 验收命令集

| 用途 | 命令 |
|---|---|
| 启动（fixture 演示） | `npm run h2:fixture`（web=5173） |
| 启动（local 完整） | `npm run h2:local`（web=5173 / analytics=8765） |
| 前端全量自检 | `npm run h2:check`（typecheck + test + qa + launcher + build） |
| 本线单元 | `npm run h2:test` |
| 演示固化 | `node validation/run-demo.mjs`（双次 <180s；C-P1-2 对齐基准） |

**手动验收清单模板**（每卡收工填写，存 `plan0830/C/evidence/<任务ID>/checklist.md`）：

```
| 用例 | 页面 | 模式(fixture|local) | 操作步骤 | 预期 | 实际 | 截图编号 | 结论(通过|不通过) |
```

填写示例（一行即可说明口径）：

```
| T1 | 总览 | fixture | 打开 5173 首屏 | 光伏/储能/PCC/配额/电解槽/异常六 KPI 全部可见且带单位 | 六项全见，单位与 fields.json 一致 | 01-overview-kpi.png | 通过 |
```

**截图留痕路径约定**：

- 迭代期：`plan0830/C/evidence/<任务ID>/<序号>-<说明>.png`；同目录 `note.md` 记录生成命令/视口/模式/日期。
- G2 晋升：`submission/h2-sentinel/screenshots/`，对齐 `SCREENSHOT_SHOT_LIST.md` 的 S01-S15 编号与 capture rule（不泄露绝对路径/密钥/账号；官方标签不得入画作为检测输入）。
- 截图只证明记录时的 UI 状态——不得表述为"官方评分/全量验证"证据。
- 工具不限（手动截图或 Playwright MCP 均可），留痕格式必须一致。

**少测试快交付**：验收 = 手动清单 + 截图留痕为主；不新增自动化测试；确需断言 <100 行/任务；不引新框架；不破坏既有门禁（收工跑一次 `npm run h2:check`；动 `renderer.py` 加跑相关 pytest）。

---

## §6 日程与裁剪序

### R1（D1-D7，功能）

| 日 | 内容 | 产出/门禁 |
|---|---|---|
| D1 | C-P0-1 审计（现状列首日填） | ACCEPTANCE_AUDIT 全行初判 + 截图 |
| D2-D4 | C-P0-2 与 C-P0-3 **并行推进**（互不依赖，均只依赖 C-P0-1；单实例接力执行，D2 起 C-P0-2 → D2-D4 C-P0-3 两会话）；D3 晚整合窗 | 审计表 #1/#2 行转绿 |
| D5 | P0 收尾 + 双模式复验；D5 晚整合窗 | `h2:check` 绿 |
| D7 | **G1**：审计表全行有结论；差距转 R2 或明示放弃；D7 晚整合窗 | check-all 绿 |

### R2（D8-D13，打磨）

| 日 | 内容 |
|---|---|
| D8-D9 | C-P1-3 报告导出打磨（2 会话） |
| D9-D10 | C-P1-1 中文名/单位一致性（30 项抽查） |
| D10-D11 | C-P1-2 演示脚本 v2（run-demo 双次 <180s 复核） |
| D11-D12 | C-P1-4 企业价值物料（R2 功能冻结后取终值） |
| D12-D13 | C-P2-1 残余打磨（有余量才做） |
| D14 | **G2 冻结**：物料 3 件 v1；截图晋升 `submission/h2-sentinel/screenshots/`；审计表全绿或差距明示 |

（整合窗 D9/D11/D13 晚轮值，见 `../COORDINATION.md`。）

### 裁剪序（总量 ≈9d / 13 实例日）

1. **C-P2-1**（首先裁）
2. **C-P1-1** → 缩为总览/事件两页抽查
3. **C-P1-4** → 降为演进对比一页纸

核心不可裁 = C-P0-*（直接持 8 分 + 审计表持笔职责）。

---

## §7 红线（违反即回退）

1. **图表时间轴一致**：同一事件在总览/事件/诊断/分析页的时间窗与轴刻度必须一致，禁止各页自算时间轴。
2. **中文名/单位跨页一致**：一律 `fields.json` 单源经 `presentation.ts`；禁止自造译名/单位/缩写。
3. **事件可定位到原始证据**：任何事件卡片 → 诊断页 → 证据变量 + 时间窗 + 实际/参考值可回溯；数据缺列时如实展示缺省说明，**不造假序列**。
4. **演示不造假**：fixture 模式必须如实声明（FIXTURE 标签 + 演示脚本注明合成数据）；不得把 fixture 结果表述为官方切片/全量验证结果。
5. **截图留痕真实**：不摆拍不存在的状态；不泄露绝对路径/密钥/账号；caption 与实际状态一致。
6. **继承 plan0829 §6 全部红线**：local-first / loopback-only、不发控制指令、建议带人工确认、LLM 不复核检测事实、不构造健康度、不硬编码测试答案、不凭报警计数判异常。
7. **不越界写**：只写 §4 清单；跨线口径疑问走 `../CONTRACTS.md` change-request；不代改他线文件。
