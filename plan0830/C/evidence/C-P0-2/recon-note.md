# C-P0-2 侦察交接笔记（2026-08-30 会话 2 产出）

> 本会话完成 C-P0-2 全部事实侦察，代码未动笔（上下文警戒收尾）。下会话照本笔记直接实施，**无需重读大文件**。

## 1. 任务回顾（C-P0-2 · 总览 KPI 完整性，4 分）

六要素（18 分表 #1 原文）：**光伏、储能、PCC、配额、电解槽和异常 KPI**；验收=页面检查（首屏即见）。
审计表 #1 差距：光伏/配额/电解槽 ❌ 零呈现；储能/PCC ⚠️ 仅趋势图头部值；异常 ✅。

## 2. 已核实事实（全部本会话实测，勿重查）

### 2.1 OverviewPage 现状（apps/web/src/features/h2-sentinel/pages/overview/OverviewPage.tsx，334 行）
- 4 张通用 KPI 卡（数据规模/异常事件/高风险待复核/数据质量）← `createOverviewMetrics(run)`（presentation.ts:286）
- PCC 图头部最新值 `latestPcc`（40-41 行有 fallback：`pcc_power_actual_kw ?? pcc_power_kw`）；SOC 同理（`bess_soc_pct ?? bess_soc_percent`）
- 样式：`.h2-metric-grid` 4 列（css:525）、`.h2-metric` 卡（css:531，tone: neutral/positive/warning）；断点 78rem→2 列、44rem→1 列（css:997-1038）

### 2.2 单源数据（全部已读）
- **fields.json**（163 字段全量）：光伏 `pv_actual_kw`/`pv_forecast_kw`；储能 `bess_soc_pct`/`soc_target_pct`/`bess_power_actual_kw`；PCC `pcc_power_actual_kw`/`grid_export_power_limit_kw`；**配额四变量** `grid_export_energy_used_kwh_day`/`grid_export_energy_quota_kwh_day`/`grid_import_energy_used_kwh_day`/`grid_import_energy_quota_kwh_day`；电解槽 `elz1/2/3_power_actual_kw`、`elz1/2/3_run_state`（sign: 0停机 1待机 2运行 3降额）；`ems_total_elz_target_kw`（目标总量，官方无 actual 总量列）
- **constraints.json**：无 4500/20000；有 SOC 20-90、储能 ±500kW、电解槽单台 300-1000kW（min_stable=300）、爬坡 120kW/min。→ **配额限值必须从序列 quota 字段动态读，禁止硬编码任何数字**
- **官方 CSV 实测**（采样 01/02 号表头+值）：quota 稳定 **上网 5200.0 / 下网 24500.0 kWh/day**（train=validation 一致）；used 列存在（列 24/25）；elz1_run_state=2、elz≈610-620kW、SOC≈56%（凌晨行 pv=0）。**任务卡写的"4500/20000"与官方实测不符——以实测 5200/24500 为 fixture 合成口径**

### 2.3 序列契约
- API 侧 `SeriesRequest.variables` 上限 **32**（api/models.py:66）；前端自设 `H2_VIEW_SERIES_MAX_VARIABLES = 5`（series-loader.ts:16，C 线域可改）
- `requestH2Series` 校验（series-loader.ts:100-141）：变量唯一、**响应每点必须含全部请求变量** → KPI 查询变量必须全部可用，查询失败整区降级（error 态处理）
- `useH2Series` 每 hook 实例独立 state；两个 overview scope 查询并存不冲突（isH2SeriesTargetCurrent 只比 runId）

### 2.4 fixture 数据源（plugins/h2-ems/src/fixture-data-source.ts，C 线独占写域）
- **fields 清单无障碍**：`H2_FIXTURE_DATASET.fields = H2_OFFICIAL_FIELDS.map(...)`（packages/h2-contracts/src/fixtures.ts:41，**冻结只读包不可改**）= 全量官方 163 字段 → 视图层变量选择天然含配额/分台字段
- **缺的是序列数据**：`fixtureSeriesVariableSources` 白名单（192-211 行）无配额四变量、无 elz1/2/3 分台与 run_state
- `fixtureSeries`（167-190 行）：22 行 × 10 列元组（10:20-10:41Z），列序=timestamp, pvActual(820→766), bessPower(230), pccPower(590→**720@10:32-10:39**→590, C04 超限窗), electrolyzerPower(**500 恒定**), auxiliaryLoad(140→106), bessSoc(55→59.2), exportLimit(500), importLimit(450), bessCommand(-240)
- `fixturePoints`（215-243 行）由元组解构 map 成 values 对象（含 10 键，源名如 `bess_power_kw`/`bess_soc_percent`/`pcc_export_limit_kw` 为内部名）
- `createFixtureSeries`（774 行）无变量数上限，仅白名单+时间窗校验
- `H2_FIXTURE_DATASET.fingerprint` 是写死常量，**不随序列内容变** → 加列不影响指纹

### 2.5 路由与导航
- `H2NavigationTarget = { route, eventId? }`（routes.ts）——analysis 不带 variable 参数；KPI 卡下钻只能页面级：要素卡→analysis、异常卡→events

## 3. 实施设计（已定稿，照做）

### 改动 1：plugins/h2-ems/src/fixture-data-source.ts
1. `fixtureSeries` 之后新增 `fixtureKpiExtension` 常量数组（22 行 × 10 值，行序与 fixtureSeries 一一对应），**不动 fixtureSeries 原 10 列**（diff 最小、易审查）。
   列含义 `[elz1P, elz2P, elz3P, elz1S, elz2S, elz3S, expUsed, expQuota, impUsed, impQuota]`：
   - elz 分配：`[500,0,0, 2,1,1, ...]`（ELZ01 运行 500，ELZ02/03 待机 0；和=既有 total 500 恒定；运行台 500 ≥ min_stable 300 自洽）
   - expQuota=5200, impQuota=24500 恒定；impUsed=0（fixture PCC 恒正=纯上网）
   - expUsed 序列（1 位小数，按当分钟 pcc/60 递推）：
     `830.0, 839.8, 849.6, 859.5, 869.3, 879.1, 889.0, 898.8, 908.6, 918.5, 928.3, 938.1, 950.1, 962.1, 974.1, 986.1, 998.1, 1010.1, 1022.1, 1034.1, 1044.0, 1053.8`
     （前 12 行 +9.833/min〔590 段〕，中间 8 行 +12/min〔720 段〕，末 2 行 +9.833）
2. `fixturePoints` map 改为带 `index` 参数，解构扩展行，values 追加 10 键（**官方字段名**）：`elz1_power_actual_kw`/`elz2_power_actual_kw`/`elz3_power_actual_kw`/`elz1_run_state`/`elz2_run_state`/`elz3_run_state`/`grid_export_energy_used_kwh_day`/`grid_export_energy_quota_kwh_day`/`grid_import_energy_used_kwh_day`/`grid_import_energy_quota_kwh_day`
3. `fixtureSeriesVariableSources` 追加上述 10 个官方字段名→同名源键（含中文注释说明 C-P0-2 扩展与口径来源）

### 改动 2：model/series-loader.ts
1. `H2_VIEW_SERIES_MAX_VARIABLES` 5 → **16**（契约 32 内；KPI 组最多 15）
2. 新增 `H2_OVERVIEW_KPI_VARIABLE_GROUPS`（别名组，每组取第一个可用）：
   `['pv_actual_kw']`、`['bess_soc_pct','bess_soc_percent']`、`['bess_power_actual_kw','bess_power_kw']`、`['pcc_power_actual_kw','pcc_power_kw']`、`['grid_export_power_limit_kw','pcc_export_limit_kw']`、配额四单变量组、`['elz1_power_actual_kw']`×3、`['elz1_run_state']`×3 —— 共 15 组
3. 新增 `createH2OverviewKpiSeriesQuery(run)`：仿 `createH2OverviewSeriesQuery`（fields 可用性过滤〔measurement/constraint 角色〕+ 24h 窗 + scope:'overview'）

### 改动 3：model/presentation.ts
新增 `H2SixElementKpi` 接口 + `createSixElementKpis(run, series, seriesStatus)`：
- 六卡：key=`pv|bess|pcc|quota|elz|anomaly`；label 用 18 分表措辞（光伏/储能/PCC 功率/电量配额/电解槽/异常事件）；tone；navigateTo（要素→analysis，异常→events）
- value/detail 装配（变量中文名/单位从 `run.dataset.fields` displayNameZh/unit 取——真单源；数值=序列最新值 `getLatestSeriesValue`）：
  1. 光伏：`{pv_actual} kW`；detail=`预测 {pv_forecast} kW`
  2. 储能：`{soc} %`；detail=`{bess_power} kW（正放电 · 负充电） · 目标 {soc_target}%`
  3. PCC：`{pcc} kW`；detail=`上网边界 {limit} kW`；超限（pcc>limit）→ tone=warning
  4. 配额：`{expUsed} / {expQuota} kWh`；detail=`当日上网累计 · 下网 {impUsed} / {impQuota} kWh`（纯序列原生值零计算）
  5. 电解槽：value=`{elz1+elz2+elz3} kW`（三台合计，源值透明列示）；detail=`ELZ01 {v}（运行） · ELZ02 {v}（待机） · ELZ03 {v}（待机）`（状态文案 0停机/1待机/2运行/3降额）
  6. 异常：value=`{run.events.length} 个`；detail=`高风险 {severe} · 待复核 {open}`（run 契约侧，前端不自算）
- **缺列如实**（红线#3）：某组变量序列无值 → value=`字段未提供`，detail=`当前数据集无 {官方字段名}`；seriesStatus=loading/error/idle → 全区对应提示文案

### 改动 4：pages/overview/OverviewPage.tsx
- 第二个 hook：`const kpiSeriesState = useH2Series(dataSource, createH2OverviewKpiSeriesQuery(workspace.run))`
- 新 section（**放"核心运行指标" section 之前**，首屏第一视区）：`aria-label="系统总览六要素 KPI"`，类 `h2-metric-grid h2-metric-grid--six`；每卡尾 `h2-text-button` 下钻（复用现有按钮样式）
- 为 C-P1-2 标注各 KPI 推荐停留点（**注释即可，不写死文案**——任务卡要点 5）

### 改动 5：styles/h2-sentinel.css
- `.h2-metric-grid--six { grid-template-columns: repeat(3, minmax(0,1fr)); }`
- 78rem 断点追加 `--six` → 2 列；44rem 断点追加 → 1 列（在既有 media 选择器列表补类名）

## 4. 验收清单（任务卡原文 + 本卡补充）

1. `npm run h2:fixture` 冒烟通过；六要素逐项截图（fixture 套 ≥6 张 + local 套 ≥6 张，共 ≥12 张）入 `plan0830/C/evidence/C-P0-2/`，`note.md` 记录命令/视口/模式
2. `npm run h2:check` 绿（typecheck+test+qa+launcher+build）；若 fixture 快照测试因新列红 → 核对断言属预期扩展则更新快照（不破坏既有断言语义）
3. KPI 中文名/单位与 fields.json 逐项核对（发现的偏差登记，大范围归 C-P1-1）
4. 演示黄金路径（KPI→下钻）可走通
5. 审计表 #1 行转绿（证据列填截图编号）；TASKS.md 看板行更新；commit 带 `C-P0-2`；push

## 5. 风险与注意

- `requestH2Series` 响应校验严格（每点必须含全部请求变量）——KPI 变量组若在 local 模式有别名单缺（如自定义 CSV），整查询会 error → UI 降级文案必须兜底
- 不要改 `packages/h2-contracts/**`（冻结）；fields 清单天然全量无需动
- 不要动 fixtureSeries 既有 10 列（保 C03/C04 事件证据与既有测试基线）
- local 模式验证需 `npm run h2:local`（analytics 8765）+ 导入官方 CSV 切片（或既有 local 流程）
