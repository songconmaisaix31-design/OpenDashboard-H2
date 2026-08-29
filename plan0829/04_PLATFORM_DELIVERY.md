# 04 · 平台、交付与工程专项（PLATFORM & DELIVERY）

> 版本：2026-08-29 ｜ 责任阶段：`05_ROADMAP.md` S0/S1/S3/S5 ｜ 覆盖优化项：P0-1/P0-2/P0-3/P0-6/P0-7/P0-8/P1-6/P1-7/P1-8 + P2 项
>
> 本专项承接 01 号文档的工程债清单（D-1 至 D-6），每项给出现状锚点、改造方案、验收标准。

---

## §1 T01 导入改造（P1-6）：分块/流式上传

**现状锚点**：`services/h2-analytics/src/h2_analytics/settings.py` 的 `MAX_CSV_BYTES = 96 * 1024 * 1024`、`MAX_CSV_ROWS = 180_000`；`ingestion/csv_loader.py` 单次全文解析；前端 `apps/web/src/features/h2-sentinel/model/workspace-loader.ts` 将整份 CSV 作为 JSON 文本 POST。后果：训练集 237MB / 525,600 行无法导入（T01 "可导入全部数据文件"不满足），现依赖离线分片。

**方案**（流式优先于切块拼接）：
1. 后端新增**上传会话端点**（`api/app.py` + `api/route_map.py` 注册）：`POST /api/v1/h2-sentinel/ingest/sessions` 开会话 → `PUT .../chunks` 追加分块 → `POST .../commit` 合并校验；会话状态存临时目录（SHA-256 逐块累进）；
2. `csv_loader.py` 增加**流式解析入口**（逐块增量解析，表头锁定 + 行数累进），`MAX_CSV_*` 上限对会话模式放宽为配置项并保留单请求模式原上限；
3. 前端 `workspace-loader.ts` 分片读取 File（如 8MB/片）逐片上传，进度反馈接入 `ViewState`；
4. **质量检查与指纹幂等**：`_build_diagnostics` 与 SHA-256 指纹在 commit 时对全量数据执行，结果必须与整文件单次导入逐字段一致（幂等性测试）；标签列拒收（`FORBIDDEN_LABEL_FIELDS`）在流式路径同样生效。

**验收**：237MB 训练集单次操作全量导入成功；导入后质量诊断/指纹与整文件导入一致；单请求旧路径回归零变化。

**风险**：内存峰值与请求超时——分块大小、uvicorn body 限制、磁盘临时空间需实现时压测（中等）。

---

## §2 T13 clean-machine 一键复现（P0-3）

**现状锚点**：`start-h2-sentinel.bat`（58 字节）/`start-h2-sentinel.sh`（256 字节）薄封装；启动器 `scripts/h2-sentinel/launch.mjs` + 9 冒烟场景健壮；**无换机证据**（Web 验收 4 分项）。

**方案**：
1. 入口脚本升级：环境自检（Node ≥22.12 / Python ≥3.11 / uv / 端口 5173+8765 空闲）→ 依赖安装（`npm ci` + `uv sync --locked`，离线优先支持 npm 缓存/pip 本地 wheel）→ 启动 → READY JSON 健康探测；
2. 新增 `scripts/h2-sentinel/doctor.mjs`：一键诊断（版本/端口/依赖/磁盘/防火墙提示），失败输出中文排查建议；
3. 新增 `submission/h2-sentinel/CLEAN_MACHINE_RUNBOOK.md`：换机步骤、预期时长（≤15 分钟）、故障排查决策树（Windows 执行策略/Python 版本/端口占用三大翻车点）、演练记录模板（截图+命令日志）；
4. 端口冲突自愈提示（检测占用进程并给出改端口指引）。

**验收**：在一台从未 clone 仓库的机器上，单脚本完成"安装→启动→导入测试集→运行→导出"全流程并通过 `validation/offline-deploy-smoke.mjs`；演练全程留痕归档。

---

## §3 CI 补全（P0-2）

**现状锚点**：`.github/workflows/ci.yml` 单 job（ubuntu-latest, Node 22.12.0, `npm ci` + `npm run check`，10 分钟超时）。Python 侧车 169 pytest / Ruff / Mypy、`h2:qa`、验证工具均不在 CI。

**方案**：
1. `ci.yml` 扩展：setup-python 3.11 + uv 缓存 → `uv sync --locked --extra dev` → `pytest -q` + `ruff check` + `mypy`；Node 侧追加 `npm run h2:check`；
2. 缓存：npm/uv 双缓存控制安装时长（当前 10 分钟超时需复核，必要时放宽至 20）；
3. 本地等效入口：`scripts/h2-sentinel/check-all.mjs` 一条命令 = 全套门禁，供 S0 基线复现与日常使用。

**验收**：PR 上 Python 回归或契约破坏必红；本地 `node scripts/h2-sentinel/check-all.mjs` 与 CI 等效。

---

## §4 事件可视化均衡化（P1-7）

**现状锚点**：`apps/web/src/features/h2-sentinel/model/chart-options.ts` 的 `powerSeriesByCode` 仅定义 C03；`getEventChartUnitSummary` 仅特判 C03/C04；C01/C02/C05/C06/C07 走 `createEvidenceSeries`"前 5 证据变量"降级路径。

**方案**（每类至少 1 个专属配置，含阈值带/标注线）：

| 类别 | 专属图表设计 |
|---|---|
| C01 | 电解槽指令 + BESS 反向补偿双轴时序，标注滑窗与翻转计数 |
| C02 | 上报容量 vs 实际功率 + 额定参考线（0.9×额定阈值带） |
| C04 | PCC 实际/指令 + 动态限值带（import/export 分色）+ 越限量柱 |
| C05 | `grid_*_energy_remaining_kwh` 剩余配额轨迹 + 消耗速率线 + 阈值线 |
| C06 | 三台 ELZ 功率堆叠 + 单位电耗散点（效率曲线叠加）+ 最优分配参考 |
| C07 | SOC 轨迹 + 目标带（20-90%）+ 可用备用能量与 target 差值区域 |

变量中文名/单位一律取自 `h2-vocabulary`（红线：不出现矛盾中文名）。C03 已有配置保留。

**验收**：7 类各有专属配置；`chart-options` 单测覆盖 7 类；DiagnosisPage 联动时间轴一致。

---

## §5 submission 防御加固（P0-6）

**现状锚点**：`services/h2-analytics/src/h2_analytics/reports/submission.py` + `validation/check-submission.mjs`（16 列校验，测试集 98 行通过）。

**方案**：
1. **设备 token 归一化**：`ELZ1→ELZ01`、`BESS→BESS01`、`PCC→PCC01` 映射扩展入 `packages/h2-vocabulary/data/submission-equipment-tokens.json`（文件已存在，扩覆盖度）；生成时归一化并留痕；checker 对台账外 token 报错；
2. **多值字段防御**：`affected_equipment` 引号内逗号（如 `"ELZ3,ELZ1,BESS,PCC"`）——生成端显式控制引号包裹；校验端用真 CSV 解析器（禁 `split(',')`）双向验证；
3. `pred_event_id` 沿用 `{code}-{YYYYMMDD}-{ordinal:03d}` 规则并在 README 声明（官方规范待确认 → 07 号文档 Q4）；
4. 16 列 checker 加固：空值/布尔/编码（UTF-8 无 BOM）/`evidence_json` 可解析性全断言。

**验收**：checker 对坏 token/坏转义/坏编码样例全报错；对现测试集产物继续通过。

---

## §6 影响量化口径复核（P0-7）

**现状锚点**：`impact/calculators.py`（284 行）+ `impact-formulas.json`（自述"仅由公开 TRAIN 经验校准"）。

**方案**：按 `01_GAP_ANALYSIS.md` §4 的 7 条官方公式逐条产出四元组：公式原文引用（数据字典 158-164 行）→ 实现位置（函数名）→ 单测断言（构造已知输入验证数值）→ 与标签 `reference_impact_value` 偏差记录（验证集 70 事件全量对账）。

**重点**：C01/C03 的"参考基线功率"定义；C06 的参考高效分配须与检测端反事实重分配同源（效率曲线 70% 负荷率最优、ELZ01<ELZ02<ELZ03）。

**验收**：7/7 四元组完成；偏差超预期指标列出修订方案并过门禁（影响值不参与事件匹配，F1 风险可控）。

---

## §7 根因数据驱动文本（P1-8）

**现状锚点**：`diagnosis/builder.py`（1192 行）`_METADATA` 模块级硬编码中文模板；`evidence.py` 已读官方目录（报警/操作/维修/合理工况/维护记录）。

**方案**：
1. 根因文本从纯模板 → **模板 + 具体条目引用**：引用 `12_operation_log.csv` 事件前 20-90 分钟内参数变更条目（`record_id`/`alarm_id` + 时间戳 + 参数名 + 变更值）；
2. **root_cause 5 种固定表述模板命中器**：官方标签 root_cause 仅 5 种表述（按类别），用操作日志模式（符号映射变更→C03、死区变更→C01、SOC 计划未更新→C07、配额下调→C05、限值下调→C04）做归因打分，输出最可能表述 + 支撑条目；
3. 无日志支撑时明确写"证据不足"（不编造）；
4. 维持"证据链至少含时间/变量/实际值/参考值"（T06）。

**验收**：`test_diagnosis_regressions.py` 断言根因引用可回溯条目 ID；验证集事件根因与官方标签表述命中率记录基线。

---

## §8 3 分钟演示路径固化（P0-8）

**现状锚点**：`validation/run-demo.mjs` + `tests/h2-sentinel/scripts/validate-demo-receipt.mjs`（双次 <180s 收据验证）；`OverviewPage.tsx` 评委黄金路径。

**方案**：
1. 一键演示：启动 → 预置 fixture → 逐页断言（6 页面）→ 导出报告 → 收据校验，单命令完成；
2. `submission/h2-sentinel/DEMO_SCRIPT.md`：逐句解说词对应页面元素（含 Q09 现场生成、人工确认标记、LLM/离线模式切换说明）；
3. 首屏保险：演示机预热脚本 + 端口占用预检（与 P0-3 doctor 合并）。

**验收**：单命令 <180s 全绿；演练双次留痕。

---

## §9 文档瘦身与 HANDOFF 归档（P2-2）

- `docs/archive/` 归档自标"历史存档"的 HANDOFF（`apps/web/.../HANDOFF.md`、`scripts/h2-sentinel/HANDOFF.md`）与过期规格；
- 现行 HANDOFF（services/h2-analytics、packages/h2-contracts、plugins/h2-ems、tests、submission）保留并更新指向；
- 重复的"证据边界"声明合并为单一来源引用；
- **顺序约束**：文档移动会改变 SHA → S6 冻结前完成，之后重生成证据（00§6 纪律）。

---

## §10 P2 项备忘

| 项 | 内容 | 档位 |
|---|---|---|
| P2-1 | Playwright 黄金路径 e2e（3 分钟脚本） | M |
| P2-3 | 复核/审计产品化（`review/journal.py` 基础上） | M |
| P2-4 | 真实 EMS 只读适配（`plugins/h2-ems/src/live-data-source.ts` 骨架，须离线降级） | L |
| P2-5 | 角色权限演示分层（不做真鉴权） | M |
| P2-6 | 质量检查扩展（枚举/单位/跨文件一致性，`quality/checker.py`） | S |
| P2-7 | 报告模板美化（`reports/renderer.py` + templates） | S |