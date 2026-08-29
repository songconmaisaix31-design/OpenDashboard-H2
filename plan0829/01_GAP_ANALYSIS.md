# 01 · 差距分析矩阵（GAP ANALYSIS）

> 版本：2026-08-29 ｜ 基线：分支 `codex/p1-coordinator-20260828`，HEAD `f61f996` ｜ 本地公开验证集 F1 = 0.9718（TP69 / FP3 / FN1，Precision 0.9583 / Recall 0.9857，匹配事件分类 69/69）
>
> **口径声明**：需求书本地副本缺失第 8-10、13 节（D01-D13 交付物清单与完整评分框架），可见评分仅 xlsx「Web验收」18 分。本矩阵的优先级依据是「18 分可见分 + T01-T14 验收条款 + 隐藏评分风险覆盖」三轴，**不代表官方权重**。企业（雷动）目前 0 答复，所有"待确认"项见 `07_APPENDIX_ENTERPRISE_QUESTIONS.md`。

---

## §1 可见 18 分逐项差距

来源：`T03_.../01_数据材料与字段说明_.xlsx` →「Web验收」sheet。

| # | 邑收项 | 分值 | 验收方式 | 承担页面/产物 | 猴状证据 | 差距 | 对应优化项 |
|---|---|---|---|---|---|-—|---|
| 1 | 访问方式 | 门槛 | 现场打开 localhost | `start-h2-sentinel.bat/.sh` → `scripts/h2-sentinel/launch.mjs` | 启动器 + 9 冒烟场景已具备 | 无 clean-machine 换机证据；薄封装缺自检 | P0-3 |
| 2 | 系统总览（光伏/储能/PCC/配额/电解槽/异常 KPI） | 4 | 页面检查 | `apps/web/src/features/h2-sentinel/pages/overview/OverviewPage.tsx` | 6 项 KPI + 黄金路径 + C03/C04 案例卡齐备 | 演示路径未固化为可重复脚本 | P0-8 |
| 3 | 事件中心（筛选/排序/详情/联动曲线） | 4 | 页面操作 | `pages/events/EventsPage.tsx` + `pages/diagnosis/DiagnosisPage.tsx` | 列表/筛选/复核投影齐备 | 仅 C03 有专属图表序列（`model/chart-options.ts`），其余类别联动曲线深度不足 | P1-7 |
| 4 | 运维助手（固定问答/追问/引用/安全边界） | 4 | **现场问答** | `pages/assistant/AssistantPage.tsx` + `services/h2-analytics/.../assistant/service.py` | Q01-Q10 静态文案 + 10 组关键词封闭路由 | 答案不含当前数据真实数值；自然语言追问仅词面匹配；Q09 未端到端 | P1-3/P1-4/P1-5/P1-10 |
| 5 | 报告（异常报告 + PCC 合规日报） | 2 | 导出文件 | `pages/reports/ReportsPage.tsx` | 6 种导出 + submission.csv 齐备 | 模板美化与 PCC 日报内容完整性待复核 | P0-7 顺带 + P2-7 |
| 6 | 部署（本地离线/一键启动/说明完整） | 4 | **换机复现** | `submission/h2-sentinel/` 交付包 | 本地全绿但无 clean-machine 证据；启动脚本为薄封装 | 独立环境 15 分钟全流程未演练留痕 | P0-3 |

**小结**：18 分中 8 分（运维助手 4 + 部署 4）与"现场/换机"强相关，是确定性最弱环节；4 分事件中心受可视化均衡度拖累。

---

## §2 T01-T14 逐任务差距表

现状列引用仓库真实文件；自评沿用 `submission/h2-sentinel/LEIDONG_ENTERPRISE_ALIGNMENT_BRIEF.md` §2.2（完整 8 / 部分 6 / 缺失 0）。

| 任务 | 需求要点 | 自评 | 现状证据 | 差距 → 优化项 |
|---|---|---|---|---|
| T01 数据导入与口径识别 | 读全部 CSV；正确应用字典/时间/单位/枚举/符号 | **部分** | `services/h2-analytics/src/h2_analytics/ingestion/csv_loader.py` + `settings.py`（`MAX_CSV_BYTES=96MiB`、`MAX_CSV_ROWS=180_000`） | 训练集 237MB/525,600 行无法单次导入，现只能离线分片 → **P1-6** |
| T02 数据质量检查 | 连续性/重复/缺失/量纲/状态一致；保留日志；验证集可重复评估 | **部分** | `csv_loader.py` `_build_diagnostics`（缺失/非法值/重复/乱序/功率平衡残差） | 枚举/单位/跨文件一致性校验未扩展 → P2-6 |
| T03 异常事件检测 | 事件级检测；不得仅凭 `system_alarm_count` | 完整 | `detection/rules.py`（`deterministic-c01-c07-v4`）+ `events/aggregator.py` | 功能完整，判据稳健性与提前预警语义有缺口 → P0-5/P1-1/P1-9 |
| T04 分类与子类型 | C01-C07 + 子类型 + 严重度；验证集可重复评估 | 完整 | 检测→聚合→报告全链路；严重度按官方确定性映射（C01/C06=中，余=高） | 保持不回退（门禁：分类 69/69） |
| T05 控制对象与设备定位 | `primary_control_object` + `affected_equipment` 与台账一致 | **部分** | `events/aggregator.py`（C01/C02/C06 强制设备归因校验） | 部分设备定位按类别宽化 → P1-8（引用具体设备） |
| T06 根因分析与证据链 | 证据含时间/变量/实际值/参考值；不得只给结论 | **部分** | `diagnosis/builder.py`（1192 行；`evidence.py` 读 `H2_OFFICIAL_DATA_DIR`） | 根因是硬编码模板，未引用具体日志条目 → **P1-8** |
| T07 影响量化 | `primary_impact_metric` + `estimated_impact_value`，口径可复现 | 完整 | `impact/calculators.py`（284 行，`impact-formulas.json`） | 7 条官方公式（数据字典 158-164 行）未逐条对照 → **P0-7** |
| T08 安全建议 | 分步骤可验证；不突破 PCC/SOC/容量/爬坡/联锁 | 完整 | `safety/evaluator.py`（423 行）+ 强制人工确认 | C04/C07 可执行性判定缺失损及建议精度 → P1-2 |
| T09 Web 应用 | 本地部署 + 浏览器访问 + 全功能 | 完整 | 6 页面 + fixture/local 双模式 | 维持；演示固化 → P0-8 |
| T10 可视化与交互 | 总览/事件/详情/多变量趋势/PCC 边界/SOC 轨迹/配额 | 完整 | `EChartsCanvas` + `chart-options.ts` | 仅 C03 有专属序列，其余 5 类走"前 5 证据变量"降级 → **P1-7** |
| T11 运维助手 | 固定问题 + 自然语言追问 + 引用 + 事实/计算/建议三分 | **部分** | `assistant/service.py`（327 行 10 段 if/elif，`del allow_llm_rendering`）；前端 `model/assistant.ts`（`includes()` 关键词路由、120 字上限） | 静态文案无真实数值；追问封闭路由；Q09 未端到端 → **P1-3/P1-4/P1-5/P1-10** |
| T12 报告与导出 | 异常报告 + PCC 合规日报 + submission.csv 可被评分脚本读取 | 完整 | `reports/` + `validation/check-submission.mjs` | ELZ1↔ELZ01 token 歧义、多值引号字段防御待加固 → **P0-6** |
| T13 部署复现 | 一键启动/依赖清单/端口说明/故障排查；独立环境全流程 | **部分** | `start-h2-sentinel.bat/.sh`（薄封装）+ `scripts/h2-sentinel/launch.mjs` | 无 clean-machine 同 SHA 复现证据 → **P0-3** |
| T14 安全边界与合规 | 仅监督诊断辅助，不闭环控制；建议标人工确认 | 完整 | Live 适配器 4 个 remote 校验模块 + 强制人工确认 | 维持不变 |

---

## §3 C01-C07 检测能力矩阵

| 类别 | 判据要点（现实现） | 10分钟内检出 | 提前预警 | 可执行性判定 | 误报风险 | 可视化深度 |
|---|---|---|---|---|---|---|
| C01 指令振荡 | 20 行滑窗极差≥200kW + 符号翻转≥3 + 外部稳定 + BESS 反向补偿 | ✅ | 不适用 | 不适用 | 中（与云团干扰边界） | 弱 |
| C02 容量未同步 | 上报≥0.9×额定 且 差≥200kW 且 指令-实际≥50kW | ✅ | 不适用 | 不适用 | 低（须区分 N02 正确同步） | 弱 |
| C03 储能方向异常 | 400kW 签名带 **±1kW** + 因果确认 5 行（指令与缺口/SOC 需求相反） | ✅ | 不适用 | 不适用 | **高（签名带过拟合）** | 强（专属图表） |
| C04 PCC 边界跟踪 | 越限>600kW + 标记带/兼容分支 | ✅ | 不适用 | ❌ 缺"仍具备可执行纠偏能力" | 中（须区分 N04 合理执行） | 中（仅单位特判） |
| C05 配额风险 | 日累计阈值（4500/20000kWh）+ 签名带 | ✅ | ❌ **无前瞻判据**（first_detection_time=confirmation_row-1，事件开始后才确认） | 不适用 | 中（须区分 N05） | 弱 |
| C06 负荷分配 | 反事实等价重分配（官方效率曲线插值）+ 冻结 TRAIN 标记（ELZ2=50% 份额）+ 可避免启停 | ✅ | 不适用 | 不适用 | **中高（TRAIN 标记非普适）** | 弱 |
| C07 SOC 备用不足 | SOC 偏差或备用缺口最大方向 | ✅ | ❌ **无前瞻判据** | ❌ 缺"此前存在可执行修正机会" | 中（须区分 N07） | 弱 |

> 官方检测期望（280 条训练事件 `detection_expectation` 完全统一）：**C05/C07 强调提前预警；其他类别事件开始后 10 分钟内发现**。当前 C05/C07 无前瞻判据、无提前量测量 → P0-5；签名带/TRAIN 标记过拟合 → P1-1；可执行性判定 → P1-2；ML 混合 → P1-9。

---

## §4 影响量化口径对照表（P0-7 核对底稿）

官方公式来源：`数据与材料/00_变量中文描述与数据字典.csv` 第 158-164 行（is_derived=是）。

| 指标（类别） | 官方公式 | 复核要点 |
|---|---|---|
| `bess_extra_regulation_energy_kwh`（C01） | Σ\|异常储能功率 − 参考基线储能功率\| × 1/60 | 参考基线功率的定义与窗口须逐字对齐 |
| `unserved_elz_energy_kwh`（C02） | Σ max(0, 指令 − 实际) × 1/60 | 直接积分，核对边界行 |
| `abnormal_grid_exchange_energy_kwh`（C03） | Σ\|异常 PCC − 参考 PCC\| × 1/60 | 参考基线定义 |
| `pcc_power_limit_violation_energy_kwh`（C04） | Σ(上网越限 + 下网越限) × 1/60 | 可直接用派生列 `pcc_*_violation_kw` 积分，应零偏差 |
| `grid_energy_quota_deviation_kwh`（C05） | max(上网配额超出, 下网配额超出) | 用 `grid_*_quota_excess_kwh`；"超出量"为负取 0 的口径 |
| `extra_energy_consumption_kwh`（C06） | 异常分配耗电量 − 参考高效分配耗电量 | 参考高效分配须基于官方效率曲线（70% 负荷率最优，ELZ01<ELZ02<ELZ03），与检测端重分配解一致 |
| `bess_regulation_reserve_shortfall_kwh`（C07） | max(0, 调节备用目标 − 实际可用备用) | `bess_available_*_energy_kwh` 派生公式（SOC 20-90%、1000kWh、充放效率） |

验收动作：每条产出「公式原文 → 实现位置 → 单测断言 → 与 `reference_impact_value` 偏差记录」四元组。

---

## §5 红线合规审计表

| 红线 | 实现位置 | 现状 | 动作 |
|---|---|---|---|
| 不构造健康度评分（C06 依据） | 全仓库无 health score 概念 | ✅ | 维持 |
| 不硬编码测试答案/不植入标签 | `csv_loader.py` `FORBIDDEN_LABEL_FIELDS`（50+ 标签列拒收） | ✅ | P1-9 训练只允许 train+validation |
| 不得仅凭 `system_alarm_count` 判断 | 判据均为多变量组合 | ✅ | 维持 |
| 符号口径统一（PCC 正上网/负下网；BESS 正放电/负充电） | `h2-vocabulary` 冻结约束 + `SignConventionNote` | ✅ | P0-6 token 归一化不得引入新口径 |
| 建议不突破约束（SOC 20-90%/300-1000kW/120kW·min⁻¹） | `safety/evaluator.py` | ✅ | P1-2 复用同一约束源 |
| 外部 API 须声明 + 离线降级 | 当前无外部依赖 | ✅（将变化） | **P1-10 引入 StepFun 后必须补声明+降级链**（03§4.5-4.6） |
| LLM 不影响检测/证据/复核事实 | `assistant/service.py` 显式丢弃渲染钩子 | ✅ | P1-10 保持隔离架构 |
| 算法可解释（变量/时间窗/依据） | 阈值版本化 + 校准记录块 | ✅ | P1-1/P1-9 每项改动附三要素 |
| 同一变量中文名不矛盾 | 冻结词汇包 | ✅ | P1-7 新图表配置从词汇包取名 |
| 不参考真实设备连接/不闭环控制 | loopback-only | ✅ | 维持 |

---

## §6 交付物差距

| 交付物 | 现状 | 差距 | 优化项 |
|---|---|---|---|
| submission.csv（16 列） | 生成器 + checker 通过（测试集 98 行） | `pred_event_id` 无官方示例规范；`affected_equipment` 引号内逗号多值；**ELZ1↔ELZ01 token 歧义** | **P0-6** |
| 异常报告/PCC 合规日报 | 6 种导出齐备 | PCC 日报内容要素未逐项对照 | P0-7 顺带 + P2-7 |
| 一键启动包 | bat/sh + launch.mjs + 冒烟 | 换机 runbook/故障排查树/端口自检缺失 | **P0-3** |
| D01-D13 清单 | **资料缺失**（需求书缺第 8-10 节） | 防御性交付 + 持续追问 | 07 号文档 Q1 |
| 评分框架 | **资料缺失**（缺第 13 节） | 按风险覆盖排期 | 07 号文档 Q2/Q3 |

---

## §7 工程债清单

| # | 债项 | 现状 | 影响 | 优化项 |
|---|---|---|---|---|
| D-1 | CI 覆盖不全 | `ci.yml` 仅 `npm run check`；Python 169 测试/h2:check/验证工具不进 CI | 回归靠本地自觉 | **P0-2** |
| D-2 | 前端无组件测试/e2e | 无 Playwright/Vitest | 页面回归靠人工 | P2-1 |
| D-3 | 文档偏重 | docs+submission+HANDOFF ≈ 250KB，重复声明多 | 维护成本、新旧混淆 | P2-2 |
| D-4 | HANDOFF 散落 | 4 处 HANDOFF，部分自标"历史存档" | 新会话误读过期信息 | P2-2 |
| D-5 | 证据与提交顺序耦合 | SHA 证据只对 clean commit 有效 | 文档提交后须重生成 ignored 证据 | 00§6 纪律 |
| D-6 | 浅克隆 | `.git/shallow`（depth=1） | 历史还原需 `git fetch --unshallow` | 备忘 |

---

## 附：优化项编号总索引

- **P0（赛前必做）**：P0-1 基线冻结 ｜ P0-2 CI 补全 ｜ P0-3 clean-machine 部署 ｜ P0-4 N01-N07 误报回归 ｜ P0-5 C05/C07 提前预警 ｜ P0-6 submission 防御 ｜ P0-7 影响量化复核 ｜ P0-8 演示固化
- **P1（高价值）**：P1-1 去签名带 ｜ P1-2 可执行性判定 ｜ P1-3 助手参数化 ｜ P1-4 受限NLU ｜ P1-5 Q09 链路 ｜ P1-6 分块导入 ｜ P1-7 可视化均衡 ｜ P1-8 根因数据驱动 ｜ P1-9 规则+LightGBM 混合（**主线**） ｜ P1-10 StepFun 云端 LLM 增强层
- **P2（锦上添花）**：P2-1 前端测试 ｜ P2-2 文档瘦身 ｜ P2-3 复核产品化 ｜ P2-4 EMS 只读适配 ｜ P2-5 角色权限 ｜ P2-6 质量/枚举校验扩展 ｜ P2-7 报告美化

明细见 02/03/04 号专项文档；排期见 `05_ROADMAP.md`；风险与验证见 `06_RISK_AND_VALIDATION.md`。