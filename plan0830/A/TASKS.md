# plan0830 A 线任务卡 —— ML 检测与指标精度

> 配套 `A/README.md`（作战手册）使用。本文件 = 9 张任务卡 + 内嵌状态看板。
> 命令与红线详见 README §5/§7；此处只写每卡的验收命令要点。

## 任务卡格式说明

每卡固定字段：**目标 / 背景与数据事实 / 现状锚点 / 改动文件 / 实现要点 / 验收命令与通过标准 / 服务验收条款 / 会话数与拆会话点 / 依赖 / 裁剪序位 / 风险与回退**。粒度 = 1 个 AI 会话一次完成；>1 会话的卡标注拆会话点。状态取值：`未开始 / 进行中 / 已完成 / 已裁剪`。**每完成一卡立即回看板更新状态与证据列**——看板即会话间交接的唯一载体。

## 新会话冷启动检查单（每会话第一步）

1. 本文件看板 → 认领按 README §6 日程顺序的第一张「未开始」卡；
2. 只读该卡「改动文件」+「现状锚点」涉及代码（勿扩大）；
3. `git status` 确认 worktree 干净（门禁要求 clean tree）；不干净先处理再开工；
4. 收工：看板更新+commit/push `origin/codex-p3-a`。

## 状态看板

| ID | 任务 | 档位 | 状态 | 门禁 | 证据（commit/报告路径） |
|---|---|---|---|---|---|
| A-P0-1 | 操作日志触发先验融合 | P0 | 已完成 | evaluate+尺子+哨兵三绿 | @26440ec 复验三绿：evaluate F1=0.9718（TP69/FP3/FN1，与基线持平零回退）｜尺子 77 窗 0 FP passed｜哨兵 green Δ=0.012｜pytest 全绿（含 test_root_cause +3）。代码链 16aefb5→0d39c42→26440ec（+3 修复 1369753/59d1a99/1fe23bb）；回溯清单 `plan0830/A/OPLOG_PRIOR_TRACEABILITY.md`（val 11/11 remark 可回溯）。**遗留**：oplogPrior 参数迁 thresholds JSON+v6 收口被三处 v5 字面锁阻塞，CR-B1 已登记 B 线；FN1（VA0005）不在先验窗，转 A-P1-3 |
| A-P0-2 | 报警弱特征融合 | P0 | 已完成 | 三绿+169 pytest+子类一致率 | **会话1** @407ed1b：共现核实（`tools/verify_alarm_cooccurrence.py`）修正假设表——严格一对一共现，C02←ELZ_POWER_DEVIATION（原判 CAPACITY_SYNC_WARN 零共现），C04/C05/C06/C07 收敛唯一码，余 7 关联码起点窗零共现留会话2；`alarm_features.py` 两簇+集合语义+H2_ALARM_LOG_PATH 惰性单例；aggregator 置信 +0.02（上限 0.99，无码不罚，事件集合不变）；三绿复验 F1=0.9718 持平/尺子 77 窗 0 FP/哨兵 Δ=0.012/pytest 全绿（+5 测）；真实数据端到端命中 28/350 与离线核实逐一吻合。**会话2 完成**（本 commit，零检测行为变更）：①全程窗再核——7 个零共现码全部确认为事件后段信号且与 C 码一对一配对（副码备用不接线，C02←CAPACITY_SYNC_WARN 84% 复活为后段码）；②子类消歧**数据否证不接线**——报警 message 每码固定文案无方向字段，C04/C05 关联码在 IMPORT/EXPORT 两子类覆盖率对称（88%/88%），无判别力；③离线管线复现 val（72/72 与 evaluate 报告逐条一致）实测子类一致率 **67/69**（C05 10/10、C04 8/10），两条不一致（VA0034/VA0040）根因=rules.py C04 fallback 方向分支时序两可（violation 恒 0、PCC 表计正 vs bess_cmd=-450），候选修法（BESS 指令方向）登记 A-P1-3 参考；报告 `plan0830/A/SUBTYPE_CONSISTENCY_REPORT.md`；三绿+pytest 复验通过（见 commit message）。alarmFeatures 参数随 CR-B1 v6 收口 |
| A-P0-3 | severity/子类映射收口 | P0 | 未开始 | 350 对账 100%+h2:qa | — |
| A-P1-1 | 时效显式化+C07 lead | P1 | 未开始 | 时效基线冻结+C05 lead≥3min | — |
| A-P1-2 | 影响值对齐审计 | P1 | 未开始 | 对账表 v2 | — |
| A-P1-3 | 事件边界聚合优化 | P1 | 未开始 | F1 不降+FN/FP 至少一项改善 | — |
| A-P1-4 | 设备定位收窄 | P1 | 未开始 | val 定位一致率报告 | — |
| A-P2-1 | ML go/no-go 决策 | P2 | 未开始 | 双模式 check-all+决策记录 | — |
| A-P2-2 | 哨兵扩展 | P2 | 未开始 | 哨兵绿+覆盖声明 | — |

---

## A-P0-1 ｜ 操作日志触发先验融合

**目标**：把官方操作日志（12 号文件）的 5 类操作作为「触发先验」融合进规则检测——同类 C 码在操作事件后的先验窗内判据加权提前/增强，remark 直接入证据链，操作因果入根因引用。test 分区 16 条操作日志为盲测独立线索，此卡是盲测增益的最大来源。

**背景与数据事实**：
- 操作日志 = `D:\allcode\h2-t01-official\dataandfiles\12_operation_log.csv`，共 **77 条**（train 50 / val 11 / test 16），字段 `split / timestamp / operator_role / operation_type / parameter / change / remark`。
- **5 类操作→C 码映射表**（通则，禁按时间戳特判）：

| operation_type | → C 码 | 典型 parameter/change |
|---|---|---|
| 接口映射变更 | C03 | `bess_power_sign` 反转 |
| SOC 计划变更 | C07 | SOC 充放计划曲线调整 |
| 配额更新 | C05 | PCC 日电量配额改判 |
| 调度限值下调 | C04 | PCC 功率限值下调 |
| 参数变更 | C01 | `setpoint_deadband_kw` 35→10（未回退） |

- TRAIN 首条先例：接口映射变更 14:59 → C03 事件 15:19（操作先于事件 20 分钟）。每条操作=紧邻同码事件的触发先验。
- 语义红线：先验**只在先验窗内加权搜索，不得单独触发事件**；检测输入不含标签文件（操作日志不是标签）。

**现状锚点**：`detection/rules.py` 为规则主体（各类判据+聚合参数消费）；`detection/base.py` 判据基类；`diagnosis/root_cause.py` 五模式归因（TRAIN 17.9%/VAL 15.7%）；`evidence.py` 证据条目组装；无任何 oplog 通路存在。

**改动文件**：
- `services/h2-analytics/src/h2_analytics/detection/oplog_prior.py`（**新建**：映射表+窗口匹配+加权输出）
- `services/h2-analytics/src/h2_analytics/detection/rules.py`（各 C 码判据接入先验加权）
- `services/h2-analytics/src/h2_analytics/diagnosis/root_cause.py`（根因模式引用操作条目）
- `packages/h2-vocabulary/data/detection-thresholds.json`（先验窗/权重参数；detectorVersion **v5→v6**）

**实现要点**：
1. 会话1：读 12 号文件全量（77 条可整读）+ `detection/rules.py` 相关段；写 `oplog_prior.py`：`load_operation_log()` 解析（按 split 分组）→ `match_prior(code, event_start)` 返回窗内操作条目；映射表写成数据常量（操作类型→C 码+方向）。
2. 会话1：rules.py 接线——命中先验时该 C 码判据的确认行/裕量要求按 `detection-thresholds.json` 新增的 `oplogPrior` 段（窗口分钟、加权系数）放宽，**放宽只作用于先验窗内**；无操作日志输入时行为与 v5 完全一致（回归安全）。
3. 会话2：`evidence.py` 路径——命中先验的事件 `evidence_json` 追加条目，结构：

```json
{"type": "operation_prior", "timestamp": "…", "operation_type": "接口映射变更",
 "parameter": "bess_power_sign", "change": "…", "remark": "…", "prior_to_code": "C03"}
```

4. 会话2：`root_cause.py` 根因文本引用操作条目（如「14:59 接口映射变更（bess_power_sign 反转）为触发先验」）；新增结构在 CONTRACTS 登记（B 线助手消费 evidence_json）。
5. 会话2：阈值 v6 递增+算法三件套 commit（README §7.1/7.2，commit 模板见 §7.1）。

**验收命令与通过标准**：
- `node validation/evaluate.mjs --mode local --set validation --official-data 'D:\allcode\h2-t01-official\dataandfiles'` → F1 ≥ **0.9598**（0.9718−0.012）且分类准确不降。
- `node validation/normal-context-regression.mjs … --mode check` → 77 窗 0 FP 不升。
- `node validation/overfit-sentinel.mjs …` → 绿（|F1 gap|≤0.15）。
- val 11 条操作窗事件：抽查 remark 可在 evidence_json 与根因文本中回溯（人工核对清单入 plan0830/A，逐事件一行：事件 ID/操作时间/引用位置）。

**服务验收条款**：验收-T03（事件检测）、验收-T06（根因证据链）。

**会话数与拆会话点**：2 会话（1.5d）。拆点=会话1 完成检测行为接线并过三绿；会话2 完成证据链/根因引用+版本收口。

**依赖**：无。**裁剪序位**：P0 不可裁。

**风险与回退**：先验放宽导致误报上升 → 尺子门禁前置拦截；若 val FP 升，缩先验窗或降权重系数，仍红则 revert（单 commit 独立，git 还原+detection-thresholds 回 v5）。过拟合风险由 A-P2-2 哨兵扩展兜底。

---

## A-P0-2 ｜ 报警弱特征融合

**目标**：报警日志（11 号文件）19 码中与 C01-C07 近一一对应的 14 个关联码作为**弱特征**接入——仅做置信度增强与子类消歧，绝不作为触发或计数判据。

**背景与数据事实**：
- 报警 = `11_alarm_log.csv`，共 **2,460 条**（test 515），**19 码两簇**，全部 `source=EMS01`：
  - **噪声簇 5**（不使用）：`COMM_PACKET_LOSS_LOW`、`FORECAST_REFRESH_DELAY`、`DATA_DELAY_WARN`、`METER_QUALITY_WARN`、`AUX_TEMP_WARN`。
  - **关联簇 14**（本卡对象）：`ELZ_POWER_DEVIATION`、`GRID_ENERGY_QUOTA_RISK`、`GRID_ENERGY_QUOTA_EXCEED`、`ELZ_ALLOCATION_EFF_LOW`、`BESS_RESERVE_SHORTFALL`、`BESS_DIRECTION_CONFLICT`、`PCC_POWER_LIMIT_EXCEED`、`EMS_SETPOINT_OSC`、`CAPACITY_SYNC_WARN`、`ELZ_AVOIDABLE_START`、`PCC_DEVIATION`、`BESS_REGULATION_HIGH`、`SOC_TRAJECTORY_DEVIATION`、`DISPATCH_LIMIT_NOT_TRACKED`。
- 关联码与 C 码对应但信号降级（弱特征）：仅能在事件已由时序判据触发后，增强 confidence 与消歧 C04/C05 的 IMPORT/EXPORT 子类。
- 关联码→C 码**工程假设对应表**（语义推断，开工时以 11 号文件与事件窗共现统计核实后固化进 `alarm_features.py` 常量，核实结论留注释）：

| 假设 C 码 | 关联码（待核实） |
|---|---|
| C01 | EMS_SETPOINT_OSC |
| C02 | CAPACITY_SYNC_WARN |
| C03 | BESS_DIRECTION_CONFLICT |
| C04 | PCC_POWER_LIMIT_EXCEED、PCC_DEVIATION、DISPATCH_LIMIT_NOT_TRACKED |
| C05 | GRID_ENERGY_QUOTA_RISK、GRID_ENERGY_QUOTA_EXCEED |
| C06 | ELZ_POWER_DEVIATION、ELZ_ALLOCATION_EFF_LOW、ELZ_AVOIDABLE_START |
| C07 | BESS_RESERVE_SHORTFALL、SOC_TRAJECTORY_DEVIATION、BESS_REGULATION_HIGH |

- **红线（README §7.3 第 6 条）**：严禁单独触发事件、严禁以报警计数作为异常判据。

**现状锚点**：`detection/rules.py` 无报警输入通路；`tools/features.py` 的日志邻近特征（system_alarm_count 族）曾用于 ML 特征但被消融验证为非判别来源——本卡走规则侧置信增强，与 ML 特征路径无关。

**改动文件**：
- `services/h2-analytics/src/h2_analytics/detection/alarm_features.py`（**新建**：两簇清单+窗内关联码提取）
- `services/h2-analytics/src/h2_analytics/detection/rules.py`（C04/C05 子类消歧与 confidence 接线）
- `packages/h2-vocabulary/data/detection-thresholds.json`（alarmFeatures 段；detectorVersion 已于 A-P0-1 递增 v6，若先合并本卡则此处递增）

**实现要点**：
1. 会话1：先核实——用脚本统计 14 关联码与 350 标签事件的窗共现率（事件起点 ±10min），修正假设对应表并固化；`alarm_features.py` 写两簇常量（噪声 5 显式排除并注释原因）+ `window_alarm_features(event_window)` 返回窗内关联码集合（**不含任何计数语义**）。
2. 会话1：rules.py 接线——事件已触发后，窗内出现对应关联码 → confidence 上调（幅度入 thresholds 的 alarmFeatures 段），无码不罚；**与 A-P0-1 的操作先验在 rules.py 上串行——本卡必须在其合并后开工**（同文件冲突）。
3. 会话2：子类消歧——C04 事件窗内 `DISPATCH_LIMIT_NOT_TRACKED`/`PCC_*` 的方向（import/export 侧限值）→ `IMPORT/EXPORT_POWER_LIMIT_NOT_TRACKED`；C05 窗内 `GRID_ENERGY_QUOTA_RISK/EXCEED` 方向 → `IMPORT/EXPORT_ENERGY_QUOTA_RISK`。消歧只在时序判据本身两可时生效，默认子类不变。
4. 会话2：产出子类一致率报告（val 70 事件，改动前后对照，格式：事件 ID/原 subtype/新 subtype/标签 subtype）。

**验收命令与通过标准**：
- evaluate → F1 不回退（≥0.9598 且不低于 A-P0-1 完成值）。
- 尺子 `--mode check` → 不升。哨兵 → 绿。
- `cd services/h2-analytics; uv run pytest` → 169 项全绿（plan0829 冻结口径）。
- 子类一致率报告入 plan0830/A：消歧介入事件数、子类前后对照、与标签一致率变化。

**服务验收条款**：验收-T03（检测置信）、验收-T04（分类子类）。

**会话数与拆会话点**：2 会话（1.5d）。拆点=会话1 置信增强+三绿；会话2 子类消歧+报告。

**依赖**：A-P0-1 合并后（同文件串行）。**裁剪序位**：P0 不可裁。

**风险与回退**：最大风险=把弱特征偷渡成触发条件（红线违规）→ 代码评审点：`alarm_features.py` 输出只被 confidence/子类消费，rules.py 触发路径零引用计数。共现核实发现某码与任何 C 码无对应 → 移入噪声簇并记录。回退=revert 单 commit，行为即回 v6 基线。

---

## A-P0-3 ｜ severity/子类确定性映射收口

**目标**：severity 与 subtype 改为 C 码的**确定性后处理映射**（数据事实：severity 由 C 码唯一推出、子类有限枚举），加对账断言，消灭提交一致性冗余列的漂移风险。

**背景与数据事实**：
- **severity 全表**：C01=中、C06=中；C02/C03/C04/C05/C07=高。
- **子类全表**（7 类 11 子类，train/val 每类 40/10）：

| C 码 | subtype 枚举 |
|---|---|
| C01 | `SETPOINT_OSCILLATION` |
| C02 | `CAPACITY_NOT_SYNCHRONIZED` |
| C03 | `BESS_DIRECTION_REVERSED` |
| C04 | `IMPORT_POWER_LIMIT_NOT_TRACKED` / `EXPORT_POWER_LIMIT_NOT_TRACKED` |
| C05 | `IMPORT_ENERGY_QUOTA_RISK` / `EXPORT_ENERGY_QUOTA_RISK` |
| C06 | `INEFFICIENT_POWER_ALLOCATION` / `AVOIDABLE_START_STOP` |
| C07 | `CHARGE_HEADROOM_SHORTFALL` / `DISCHARGE_RESERVE_SHORTFALL` |

- 对账底数：train 280 + val 70 = **350 事件**，标签文件 `04/05_*_event_labels.csv` 后 7 列为参考答案级标注。
- 消费方：D-P0-2（submission 导出硬门禁）直接消费本卡映射——A-P0-3 完成质量决定 D 线 16 字段收口的 severity/subtype 列。

**现状锚点**：`events/aggregator.py` 已产出 severity/subtype（各判据内嵌逻辑，未单源化）；`anomaly-taxonomy.json` 已有类目骨架；无 350 全量对账断言。

**改动文件**：
- `packages/h2-vocabulary/data/anomaly-taxonomy.json`（severity/subtype 映射单源化）
- `services/h2-analytics/src/h2_analytics/events/aggregator.py`（确定性后处理+断言）

**实现要点**：
1. anomaly-taxonomy.json 补齐 severity 与 subtype 枚举的显式声明（作为唯一事实源）。
2. aggregator.py 后处理：事件产出后按 C 码查表覆写 severity（中/高）；subtype 若为空或非法枚举 → 按判据默认子类填充；加断言「输出 subtype ∈ 枚举、severity ∈ {中,高}」。
3. 写一次性对账脚本（tools/ 下或 pytest 参数化）：跑 train+val 全量 350 事件，逐事件比对外推 severity+subtype vs 标签两列。输出规格：

```
severity: 350/350 一致（不一致事件 ID 列表）
subtype : 350/350 一致（不一致事件 ID 列表 + 原值/期望值）
```

**验收命令与通过标准**：
- 对账脚本输出 **350/350 = 100% 一致**（不一致项列表为空）。
- `cd services/h2-analytics; uv run pytest` 全绿；`npm run h2:qa` 绿（vocabulary JSON 变更的消费端契约）。

**服务验收条款**：验收-T04（分类子类）。

**会话数与拆会话点**：1 会话（0.5d），不拆。

**依赖**：无（与 A-P0-1/2 无文件冲突，可并行）。**裁剪序位**：P0 不可裁。

**风险与回退**：子类两可事件（C04/C05 方向、C06 双子类）若对账不一致 → 不改映射硬凑，先核对判据默认子类逻辑；C06 双子类并存属正常（一事件两 subtype 记录按官方口径处理，以 04/05 标签实际结构为准）。回退=revert JSON+aggregator 两文件。

---

## A-P1-1 ｜ 时效显式化 + C07 lead_time

**目标**：evaluate 产出显式时效报告（验收-T03 的「10 分钟内检出/提前预警」条款从隐式变显式指标），并增强 C07 前瞻判据使 lead_time>0 可衡量。

**背景与数据事实**：
- `detection_expectation` 全 **350 条同一句**：「C05和C07强调提前预警；其他事件开始后10分钟内发现」→ 时效口径 = 非提前类 ≤10min 检出率 + 提前类 lead 分布。
- 现状：`evaluate.mjs` 已有 `detectionExpectationMetrics`（`validation/lib/metrics.mjs`）与 `--grace-minutes`（默认 10）参数、signed first-detection delay 输出——本卡是**报告显式化与判据增强**，不是从零建指标。
- C05 lead=3min（基线）；**N05/N07 是提前预警主误报源**（回归集 77 窗中对应两列），C07 判据增强时是误报最敏感处。

**现状锚点**：`validation/evaluate.mjs` 报告段已有 signed delay 汇总；`detection/rules.py` C07 判据为充/放备用差值的反应式判据（无前瞻窗）；A-P0-1 的 C07←SOC 计划变更先验是前瞻信息源。

**改动文件**：
- `validation/evaluate.mjs`（时效报告输出段）
- `validation/lib/metrics.mjs`（若需扩展 detectionExpectationMetrics 的分组口径——lib 为共享文件，按 README §4.2 在 COORDINATION 登记）
- `services/h2-analytics/src/h2_analytics/detection/rules.py` 或 `execurability.py`（C07 前瞻判据；具体落点开工时读码定）
- `packages/h2-vocabulary/data/detection-thresholds.json`（若 C07 判据参数化；版本递增）

**实现要点**：
1. 会话1：evaluate.mjs 报告段——按类输出时效报告，字段规格：

| 字段 | 定义 |
|---|---|
| `detection_rate_within_10min`（非 C05/C07 类） | 检出延迟 ≤10min 事件数 / 该类事件数 |
| `lead_stats`（C05/C07 类） | lead 的 min / 中位 / P90（负值=提前，与既有 signed delay 口径一致） |
| `lead_positive_ratio`（C05/C07 类） | lead>0 事件占比 |

   冻结该报告为时效基线（入 plan0830/A，标注 detectorVersion）。
2. 会话2：C07 前瞻判据——基于 SOC 计划变更先验（A-P0-1 的 C07 映射）+ 充/放备用裕量的前瞻窗口（reserve_target 裕量族为 ML gain-top 特征，可作判据参考）；判据改动走算法三件套+三前置。
3. 会话2：若 C07 lead>0 无法不升误报地实现 → 文档化不可行结论（写明尝试过的判据与尺子 N07 列读数），同样算验收通过。

**验收命令与通过标准**：
- 时效报告冻结基线（v6 版本号关联）。
- C05 lead ≥3min 不降（evaluate 报告 signed delay）。
- C07 lead>0 事件比例提升，**或** DECISIONS 记录文档化不可行。
- 三绿（evaluate/尺子/哨兵）——N05/N07 两列重点盯。

**服务验收条款**：验收-T03（时效）。

**会话数与拆会话点**：2 会话（1.5d）。拆点=会话1 报告显式化（纯输出，零检测行为变更）；会话2 C07 判据（有行为变更，走三件套）。

**依赖**：A-P0-1/2（先验与弱特征是 C07 前瞻的输入）。**裁剪序位**：不可裁（核心=A-P0-*+本卡）。

**风险与回退**：C07 前瞻提前量换误报 → 尺子 N07 列前置拦截；权衡不成则判据不合并，报告显式化收益独立保留（会话1 产出不受会话2 失败影响）。

---

## A-P1-2 ｜ 影响值数值对齐审计

**目标**：estimated impact vs `reference_impact_value` 在 350 事件全量上做逐类偏差分布审计，修正口径偏差，产出容差口径建议（对接企业 Q5——影响值容差未答复）。

**背景与数据事实**：
- plan0829 已完成 7 条官方公式四元组（公式原文→实现函数→单测→验证集 70 事件对账，7/7 过）；本卡从「公式一致」推进到「数值分布对齐」，底数扩到 train+val 350。
- 官方公式在数据字典 `00_…字典.csv` 158-164 行；实现于 `impact/calculators.py`；`impact-formulas.json` 为口径声明。
- `reference_impact_value` 在 `04/05_*_event_labels.csv` 后 7 列中（参考答案级标注，仅对账用）。

**现状锚点**：`impact/reconcile.py` 已有 val 段对账（7/7）；`tests/test_impact_reconciliation.py` 已有断言可扩展；train 段从未对账。

**改动文件**：
- `services/h2-analytics/src/h2_analytics/impact/calculators.py`（口径修正）
- `services/h2-analytics/src/h2_analytics/impact/reconcile.py`（对账扩展到 train）
- `packages/h2-vocabulary/data/impact-formulas.json`（口径修订同步）

**实现要点**：
1. reconcile.py 扩展：train 280 + val 70 全量跑，逐事件记录 `estimated / reference / 偏差%`，按 C 码+子类分组。
2. 产出**对账表 v2**，列规格：

| 列 | 说明 |
|---|---|
| C 码 / 子类 | 分组键 |
| n | 事件数 |
| 偏差中位数% / P90% | 相对 reference |
| 超差事件数（>10%） | 阈值沿用 plan0829 的 10% 口径 |
| train vs val 分布差 | 两段中位数差，提示口径漂移 |

3. 超差簇逐个归因（单位换算/基线定义/边界取整）；至少修正一类的口径偏差（对照 04/05 标签与字典公式原文复核实现）；修正走 pytest 断言同步更新。
4. 容差口径建议（如「C0x 类中位数偏差 ≤Y%、P90 ≤Z%」）写入对账表 v2 头部，标注「企业 Q5 未答，保守假设」。

**验收命令与通过标准**：
- `cd services/h2-analytics; uv run pytest` 全绿（含 test_impact_reconciliation.py）。
- 对账表 v2 入 plan0830/A：350 事件全覆盖、至少一类口径改善（改善前后中位数对照）。

**服务验收条款**：验收-T07（影响量化）。

**会话数与拆会话点**：1 会话为主（1d）；若超差归因复杂可拆第 2 会话专做口径修正。

**依赖**：无（不碰 rules.py，可与 P0 并行——但 R1 排在 D6-D7）。**裁剪序位**：前三裁之后（默认保留）。

**风险与回退**：train 段超差系统性偏大（若 train 标注口径与 val 不同）→ 如实记录分布差异，不硬调实现迁就；口径修订仅限「实现与字典公式原文不符」类，其余登记 change-request 待企业答复（走 README §7.5 流程）。

---

## A-P1-3 ｜ 事件边界聚合优化

**目标**：相邻同码检测的合并/分裂容差按类调优，攻基线 FN1/FP3——F1 0.9718 → 上限≈0.983。

**背景与数据事实**：
- FN=1（漏检 1 事件）、FP=3（多报 3 事件）：FP3 中跨日/跨窗合并断裂是已知形态（尺子与 evaluate 均按 2 分钟间隔合并相邻同码预测；`aggregationPolicyVersion: h2-events-v2`）。
- 各类聚合参数在 `detection-thresholds.json` 每类 `aggregation` 段（`minimumRows`/`confirmationRow`/`maximumGapIntervals`/`daily`），现为一组统一经验值——按类差异化是本卡主杠杆。
- 约束：F1 已高位，**任何调参不得使 F1 下降**；误报尺子不得上升。

**现状锚点**：`events/aggregator.py` 合并逻辑消费各类 aggregation 段；`detection-thresholds.json` 各类的 `maximumGapIntervals` 现值 1-12 不等（读码确认当前值后逐类评估）。

**改动文件**：
- `services/h2-analytics/src/h2_analytics/events/aggregator.py`（按类容差逻辑）
- `packages/h2-vocabulary/data/detection-thresholds.json`（各类 aggregation 参数；detectorVersion 递增，`aggregationPolicyVersion` **h2-events-v2→v3**）

**实现要点**：
1. 先取证：从最近一次 evaluate 报告（`tests/h2-sentinel/reports/generated/` 下的 generated 报告，勿手改）提取 FN1/FP3 的具体事件区间与类别，写**边界 case 清单**，模板：

| case | 类别 | 预测区间 vs 标签区间 | 现行为成因假设 | 调参动作 | 前后读数 |
|---|---|---|---|---|---|

2. 逐 case 调参：每类独立 commit+三件套（算法纪律同 README §7）；先攻 FN1（合并容差放宽类）再攻 FP3（分裂/最小行数收紧类），一次一类。
3. 全量回归+基线重冻结：若尺子基线需重冻结（`--mode freeze --force`），detectorVersion 与 aggregationPolicyVersion 同步递增。

**验收命令与通过标准**：
- evaluate：F1 不降，且 FN 或 FP 至少一项改善（目标 FN1→0 或 FP3→≤2）。
- 尺子 `--mode check` 不升（若重冻结，冻结后记录 77 窗读数）。
- 哨兵绿；边界 case 清单留痕（plan0830/A，含每个 case 的前后区间对照）。

**服务验收条款**：验收-T03（事件检测）。

**会话数与拆会话点**：1 会话（1d）；若 FN/FP 双攻则第 2 会话（此时总量 9d→10d，需在 COORDINATION 重新平衡）。

**依赖**：A-P0-*（R2 执行，避免与 P0 的 rules.py 变更叠加回归噪音）。**裁剪序位**：第 3 裁。

**风险与回退**：按类容差过拟合验证集 → 只接受有物理理由的参数（如 C05 日配额类的 `daily` 语义），纯拟合值的改动不合并；回退=revert 对应类 commit（按类独立 commit 保证可局部回退）。

---

## A-P1-4 ｜ 验收-T05 设备定位收窄

**目标**：`affected_equipment`/`primary_control_object` 按类收窄到具体设备——C02 定位到具体电解槽 ELZ0x，C06 三台归因——同时保证设备 token 与提交校验一致。

**背景与数据事实**：
- C02 直接信号：电解槽 `reported_capacity_kw` vs `actual_available_capacity_kw` 容量差（69 列中电解槽 33 列=3×11，含 reported/actual 对）；哪台出现容量差即定位哪台。
- C06 分配依据：ELZ01 效率较优 / ELZ02 中等 / ELZ03 较低（`10_electrolyzer_efficiency_curves.csv`）；三台同时在线时的归因=按效率曲线的应然分配 vs 实际分配偏差。
- 台账与 token：`08_equipment_master.csv` 设备 ID 为 PV01/BESS01/PCC01/EMS01/ELZ01-03/AUX01；但 submission 校验（`check-submission.mjs`）要求**精确 token** `BESS/PCC/PV/ELZ/ELZ1-ELZ3`——台账 ID（BESS01）与提交 token（BESS）不同，输出层必须走 token 映射：

| 内部维度 | submission token |
|---|---|
| ELZ01 / ELZ02 / ELZ03 | `ELZ1` / `ELZ2` / `ELZ3` |
| 储能 BESS01 | `BESS` |
| 并网点 PCC01 | `PCC` |
| 光伏 PV01 | `PV` |

**现状锚点**：`diagnosis/builder.py` 现产宽口径设备（容器级，如 ELZ 全列或不定位）；`rules.py` 检测阶段未携带每台设备维度元数据。

**改动文件**：
- `services/h2-analytics/src/h2_analytics/diagnosis/builder.py`（设备定位归因）
- `services/h2-analytics/src/h2_analytics/detection/rules.py`（C02/C06 事件携带设备维度信息；只加元数据不改触发）

**实现要点**：
1. C02：检测阶段记录每台 ELZ 的 reported/actual 差值序列；builder 按差值非零台次生成 `affected_equipment=[ELZ0x]`。
2. C06：builder 按效率曲线算应然分配，与实际分配偏差最大的台次组合归因；三台皆偏则全列（`ELZ1`,`ELZ2`,`ELZ3`）。
3. token 映射：设备维度 → submission token（按上表）；与 `packages/h2-vocabulary/data/submission-equipment-tokens.json`（冻结只读）对齐，h2:qa 验证。

**验收命令与通过标准**：
- val 70 事件设备定位一致率报告（vs 04/05 标签的 affected 列）：C02/C06 类逐事件对照，格式=事件 ID/预测设备/标签设备/是否一致；改善幅度记录。
- `npm run h2:qa` 绿（token 契约不破）；pytest 全绿。
- 定位输出 token 全部 ∈ submission-equipment-tokens 枚举。

**服务验收条款**：验收-T05（对象定位）。

**会话数与拆会话点**：1 会话（1d），不拆。

**依赖**：无硬依赖（R2 执行，避开 rules.py 高峰）。**裁剪序位**：第 2 裁。

**风险与回退**：收窄反而降低一致率（标签口径比预期宽）→ 保留宽窄两口径对照数据，择优提交并在 DECISIONS 记录；回退=revert，定位回宽口径（现状可用）。

---

## A-P2-1 ｜ ML 开关 go/no-go 决策记录

**目标**：把 `H2_ML_ENABLED` 的灰度证据跑齐，产出 `plan0830/A/DECISIONS.md` 决策记录（go / no-go）；若 go → 通知 D-P2-1 落 launch 默认值与 .env 样例。

**背景与数据事实**：
- 现状：`H2_ML_ENABLED` 默认 **false**；ML 校验层已实现（`detection/ml_verification.py` + `detection/lightgbm_adapter.py`），模型 `h2-lgbm-row-v1`（3 seed）已登记 `MODELS_REGISTRY.md`（仓库根）。
- **灰度五条**（ADR-001 一票否决，口径出处 `plan0829/A/planA/docs/decisions/ADR-001-ml-hybrid-architecture.md` 与 P1-9 验收）：① off 模式输出与纯规则逐字节一致（回退安全前提）② on 模式事件级 F1 不降 ③ 误报尺子不升 ④ 过拟合哨兵绿 ⑤ 命中事件附 top-5 特征可解释且 3 seed 方差可接受。
- **模型文件陷阱**：`models/` gitignored——worktree 内**没有**模型与特征文件（3 个 seed txt + features csv 只在主检出 `D:\allcode\qingneng\models\`）。跑 on 模式前需从主检出复制（绝对路径拷贝，SHA 对照 MODELS_REGISTRY）或 `tools/train_lightgbm.py` 重训（禁测试集）。
- ML 类目为 NORMAL/C03/C04/C05/C07（C01/C02/C06 规则领地，adapter 显式拒绝动态归因）——go 的增益上限集中在 C03/C04/C05/C07 的校验与二次评分。
- 环境坑（MODELS_REGISTRY 注记）：lightgbm 4.7 要求 ndarray 输入；本机 venv 曾现包损坏，遇 `module 'lightgbm' has no attribute …` 先 `uv sync --reinstall-package lightgbm --locked --extra ml`。

**现状锚点**：接线代码齐备（service 层开关消费）；缺的只是「在整合分支上、对 v6 检测器」的五条证据与决策文书。

**改动文件**：
- `plan0830/A/DECISIONS.md`（**新建**：决策记录+证据表）
- 只读消费：`MODELS_REGISTRY.md`、`detection/ml_verification.py`、`settings.py`（B 领土，开关环境变量定义处——若需改默认值，提 change-request 由 D-P2-1 在 launch 层落）

**实现要点**：
1. 复制/校验模型文件（SHA256 对照登记值）。
2. off 模式跑 evaluate+尺子 → 与 v6 纯规则输出逐事件对照（①）。
3. on 模式（`H2_ML_ENABLED=true`）跑 evaluate+尺子+哨兵（②③④），记录 top-5 特征抽样与 3 seed 方差（⑤）。
4. 写 DECISIONS.md，证据表模板：

| # | 判据 | 命令 | 读数 | 通过 |
|---|---|---|---|---|
| ① | off=纯规则逐字节一致 | evaluate off + diff | … | ✓/✗ |
| ② | on 模式 F1 不降 | evaluate on | F1=… vs 0.9718 | |
| ③ | 尺子不升 | 尺子 check on | 77 窗读数 | |
| ④ | 哨兵绿 | 哨兵 on | gap=… | |
| ⑤ | top-5 特征+seed 方差 | 抽样+登记 | … | |

5. 结论 go/no-go；no-go 时默认值维持 false 并写明差距项。若 go：COORDINATION 登记 → D-P2-1（D12-13）落默认值。

**验收命令与通过标准**：
- 双模式（on/off）`node scripts/h2-sentinel/check-all.mjs` 全绿。
- DECISIONS.md 含五条证据表（每条：判据/命令/读数/通过与否）+明确结论。

**服务验收条款**：验收-T03（辅助——ML 校验层提升检测置信，不直接对条款）。

**会话数与拆会话点**：1 会话（0.5d），不拆。

**依赖**：A-P0 全 + R1 整合后（在整合分支跑，证据才对最终代码有效）。**裁剪序位**：可裁（裁后默认 no-go=false，D-P2-1 按 false 冻结，零风险）。

**风险与回退**：on 模式任一条红 → no-go 即为合法产出（决策记录本身是交付物）；不强行调模型迁就门禁（红线：训练只用 train+validation）。

---

## A-P2-2 ｜ 哨兵扩展覆盖新先验

**目标**：把 A-P0-1/A-P0-2 引入的操作先验与报警弱特征纳入过拟合哨兵的覆盖声明——哨兵不仅比 F1 gap，还断言新特征通路在 train-last-90 与 validation 两个窗口上行为一致。

**背景与数据事实**：
- 哨兵现状：`validation/overfit-sentinel.mjs` 对 validation 与 train-last-90（63 TRAIN 事件：C01=9/C02=13/C03=8/C04=9/C05=11/C06=2/C07=11）两份 fresh 报告绑定 hash/来源/指标/配置/runID，|F1 gap|>0.15 即红。
- 缺口：oplog/alarm 特征引入后，若两窗口上「先验命中率/置信增强分布」差异悬殊（train 高 val 低=过拟合信号），现版哨兵看不见。
- 数据事实：操作日志 train 50 / val 11 / test 16；报警 test 515（全量 2,460）——train 窗特征密度天然高于 val，需归一化比较。

**现状锚点**：`overfit-sentinel.mjs` 报告绑定段结构清晰（hash/identity/metrics/config/runID 绑定），扩展点=在 metrics 绑定中追加特征通路读数。

**改动文件**：
- `validation/overfit-sentinel.mjs`（覆盖声明+特征通路一致性断言）

**实现要点**：
1. 报告绑定段新增：oplog 先验命中事件数/占比、alarm 置信增强事件数/占比（两窗口各记）。
2. 断言：两窗口先验命中率相对差超过阈值（建议 0.3，参数化常量并注释依据——先跑一轮观察实际分布再定值）→ 哨兵红。
3. 覆盖声明：哨兵输出头部明示「覆盖 oplog_prior + alarm_features 通路 @v6」。

**验收命令与通过标准**：
- `node validation/overfit-sentinel.mjs --official-data 'D:\allcode\h2-t01-official\dataandfiles'` 绿，且输出含新覆盖声明与两窗口特征读数。
- evaluate/尺子不受影响（纯断言扩展，零检测行为变更）。

**服务验收条款**：内部质量门禁（不直接对赛题条款；为验收-T03 的检测稳定性兜底）。

**会话数与拆会话点**：1 会话（0.5d），不拆。

**依赖**：A-P0-1/2（特征存在才有覆盖对象）。**裁剪序位**：**第 1 裁**（R1 期间已有 evaluate+尺子+三件套前置兜底；裁后须在 DECISIONS.md 记录「新特征无哨兵覆盖」的残余风险）。

**风险与回退**：train/val 特征密度天然差异触发误红 → 阈值以「相对差」而非绝对值比较，先跑 report 观察实际分布再定阈值；回退=revert 单文件。

---

## 附一：完成定义（每卡通用）

1. 看板状态更新+证据列填 commit hash/报告路径。
2. 触及检测行为的卡：算法三件套齐（独立 commit+阈值快照+四项指标对照，模板见 README §7.1）。
3. 触及 vocabulary JSON 的卡：`npm run h2:qa` 绿。
4. 触及 Python 的卡：`uv run pytest` 全绿。
5. 产出报告/清单的卡：文件落 `plan0830/A/`（对账表、边界清单、决策记录、一致率报告、时效基线）。

## 附二：与蓝图的路径核对结论（2026-08-30）

全部蓝图引用路径经 Glob 核实存在；两处补充修正：`MODELS_REGISTRY.md` 实际位于仓库根（非 models/ 内）；`models/` 目录 gitignored，worktree 内无模型文件（A-P2-1 已按此写卡）。`detection/oplog_prior.py`、`detection/alarm_features.py`、`plan0830/A/DECISIONS.md` 为本线新建目标文件，当前不存在属预期。
