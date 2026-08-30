# plan0830 A 线作战手册 —— ML 检测与指标精度

> 线域：`services/h2-analytics/src/h2_analytics/{detection,events,impact,diagnosis}` + `tools/**` + A 侧 `validation/` 三脚本 + 4 个 vocabulary JSON。
> 基线：plan0829 gate-s6 冻结（tag gate-s6），detectorVersion=`deterministic-c01-c07-v5`。
> 本文件自包含：四开 AI 会话只读「本文件 + A/TASKS.md + 顶层三件套（00_README/CONTRACTS/COORDINATION）」即可开工。

---

## §0 定位与上下文预算声明

**定位**：A 线负责检测精度与指标口径——把 plan0829 已冻结的 F1=0.9718 基线，通过「操作日志触发先验 + 报警弱特征融合 + 确定性映射收口」三条 P0 主线加固，并用 P1/P2 任务攻时效显式化、影响值对齐、边界聚合、设备定位与 ML 开关决策。服务条款：验收-T03（事件检测+时效）/验收-T04（分类子类）/验收-T05（对象定位）/验收-T06（根因证据链）/验收-T07（影响量化）。

**工作位置**：worktree `D:\allcode\qingneng-wt\a`，分支 `codex/p3-a`；整合在主检出 `D:\allcode\qingneng`（分支 `codex/p3-integration`）由整合人做，A 线实例不碰主检出。官方数据不进 git，一律绝对路径 `D:\allcode\h2-t01-official\dataandfiles`。

**上下文预算（700k 并行会话上限的核心纪律）**：

| 项 | 预算 | 说明 |
|---|---|---|
| 必读文档 | ≈1.6k 行 | 00_README(~280) + CONTRACTS(~320) + COORDINATION(~260) + 本文件(~330) + A/TASKS.md(~450)，一次性读完 |
| 工作代码 | ≤8k 行 | 按当前卡只读相关文件（单卡通常 ≤2k 行），禁全仓库漫游 |
| 工具输出 | ≤2k 行/次 | evaluate/尺子/哨兵/pytest 只看摘要与失败段 |
| 稳态目标 | **<150k tokens** | 警戒线 200k；触线即停 |

**新会话冷启动序**（每个会话第一步，约 10 分钟）：

1. 读 `plan0830/A/TASKS.md` 状态看板 → 认领第一张「未开始」卡（按 §6 日程顺序）；
2. 只读该卡的「改动文件」清单内的代码（TASKS 卡内已列，勿扩大）；
3. 读 `A/README.md` §5（命令）+ §7（纪律）即开工；
4. 收工：更新看板状态+证据列，commit/push `origin/codex/p3-a`。

**超限自检表**：

| 症状 | 处置 |
|---|---|
| 开始全仓库漫游、逐文件翻找 | 立即停；对照 §3 白名单收窄 |
| 重复贴大段工具输出 | 只留摘要行 |
| 上下文 >150k 仍未见当前卡产出 | 收工commit，重开会话从看板续 |

历史上下文不跨会话搬运，看板即交接。

---

## §1 事实速览（写卡与对账的事实来源）

### 1.1 基线指标（plan0829 gate-s6 冻结口径）

| 指标 | 值 | 备注 |
|---|---|---|
| 验证集事件级 F1 | **0.9718** | TP=69 / FP=3 / FN=1；A 线全部改动的回退下限 = 0.9718−0.012 = **0.9598** |
| 验证集分类准确 | **69/69** | 匹配事件 C 码全对 |
| 误报尺子 | **77 窗 0 FP** | @`deterministic-c01-c07-v5`；A-1 门禁「误报不得上升」 |
| C05 提前量 | **lead=3min** | C05/C07 为提前预警类；A-P1-1 显式化后不得 <3min |
| 影响量化 | **7/7 对账** | 7 条官方公式四元组 + 验证集 70 事件 `reference_impact_value` 对账 |
| 根因模式 | 五模式 | TRAIN 覆盖 17.9% / VAL 15.7%（A-P0-1 的 remark 引用在其上叠加） |
| pytest | 169 项全绿 | plan0829 冻结口径；A 线改动后不得出现红项 |

### 1.2 版本与事实源

| 事实 | 值与位置 |
|---|---|
| detectorVersion 唯一事实源 | `packages/h2-vocabulary/data/detection-thresholds.json` 第 3 行 `detectorVersion`，当前 `deterministic-c01-c07-v5`；A 线改动阈值 → 递增 **v5→v6** |
| 聚合策略版本 | 同文件 `aggregationPolicyVersion: h2-events-v2`；A-P1-3 若改边界聚合 → **v2→v3** |
| 尺子基线 | `validation/baseline/normal-context-baseline.json`（gitignored，每 worktree 各持一份；重冻结需 `--force`） |
| ML 登记 | `MODELS_REGISTRY.md`（**仓库根**）；模型 `h2-lgbm-row-v1`（3 seed，类目 NORMAL/C03/C04/C05/C07，C01/C02/C06 规则领地）；模型产物在 `models/`（**gitignored，worktree 内无**） |
| ML 开关 | `H2_ML_ENABLED` 现状 **false**；启用前置 = ADR-001 灰度五条（见 A-P2-1 卡） |
| 评估报告输出 | `tests/h2-sentinel/reports/generated/`（gitignored 生成区，只读消费勿手改） |

### 1.3 数据线索速记（详细事实在各任务卡）

- 操作日志 **77 条**（train 50 / val 11 / test 16），**5 类操作→C 码**一一对应，每条紧邻事件 → A-P0-1 的先验源。
- 报警 **2,460 条**（test 515），**19 码两簇**（噪声 5 + 关联 14），全部 source=EMS01 → A-P0-2 的弱特征源。
- `detection_expectation` 全 350 条同一句：「C05和C07强调提前预警；其他事件开始后10分钟内发现」→ A-P1-1 的时效口径。
- severity 由 C 码唯一推出：C01/C06=中，其余=高 → A-P0-3 的确定性映射。
- 7 类 11 子类，train/val 每类 40/10（合计 350 事件）→ A-P0-3 的对账底数。
- N0k↔C0k 一一镜像（77 窗=7 类×11）：判别核心=「EMS 是否正在正确纠偏/有合理约束原因」；**N05/N07=提前预警主误报源**。

### 1.4 官方数据文件速查（目录 `D:\allcode\h2-t01-official\dataandfiles`，共 20 文件）

| 文件 | 内容 | A 线读取方式 |
|---|---|---|
| `00_变量中文描述与数据字典.csv` | 163 行字典；related_anomaly 列逐变量标 C 码；官方公式 158-164 行 | **可整读** |
| `01/02/03_*_timeseries.csv` | train/val/test 时序，69 列，共约 382MB | **仅经脚本/采样读**，禁整读 |
| `04_train_event_labels.csv` / `05_validation_event_labels.csv` | 事件标签 16 列，后 7 列=参考答案级（root_cause/expected_evidence/recommended_action/impact×3/detection_expectation） | **可整读**（对账底数） |
| `06_train_row_labels.csv` / `07_validation_row_labels.csv` | 行级标签 | 仅 `tools/train_lightgbm.py` 消费 |
| `08_equipment_master.csv` | 台账：PV01/BESS01/PCC01/EMS01/ELZ01-03/AUX01 | **可整读** |
| `09_control_constraints.csv` | 控制约束 | **可整读** |
| `10_electrolyzer_efficiency_curves.csv` | 电解槽效率曲线（ELZ01 优/02 中/03 低） | **可整读** |
| `11_alarm_log.csv` | 报警 2,460 条 19 码，source=EMS01 | **可整读** |
| `12_operation_log.csv` | 操作日志 77 条 5 类 | **可整读** |
| `13_train_validation_normal_context.csv` | 77 条合理工况窗口（N01-N07） | **可整读** |
| `14_maintenance_history.csv` | 维保记录 | 可整读（备查） |
| `15_knowledge_base.md` / `16_assistant_questions.csv` | 助手语料源 | **B 线领土，A 禁读** |
| `17_submission_template.csv` | 提交模板 16 字段 | 只读参考（D 线持） |
| `18_data_quality_notes.csv` | 数据质量注记 | **可整读** |
| `19_dataset_manifest_public.json` | 清单 | **可整读** |

---

## §2 任务总表（9 卡，ID 与蓝图严格一致，不得增删改号）

| ID | 任务 | 档位 | 会话数 | 依赖 | 服务条款 |
|---|---|---|---|---|---|
| A-P0-1 | 操作日志触发先验融合 | P0 | 2（1.5d） | 无 | 验收-T03、验收-T06 |
| A-P0-2 | 报警弱特征融合 | P0 | 2（1.5d） | A-P0-1 合并后（同文件串行） | 验收-T03、验收-T04 |
| A-P0-3 | severity/子类确定性映射收口 | P0 | 1（0.5d） | 无 | 验收-T04 |
| A-P1-1 | 时效显式化+C07 lead_time | P1 | 2（1.5d） | A-P0-1/2 | 验收-T03 |
| A-P1-2 | 影响值数值对齐审计 | P1 | 1-2（1d） | 无 | 验收-T07 |
| A-P1-3 | 事件边界聚合优化 | P1 | 1（1d） | A-P0-*（R2 执行） | 验收-T03 |
| A-P1-4 | 验收-T05 设备定位收窄 | P1 | 1（1d） | 无（R2） | 验收-T05 |
| A-P2-1 | ML 开关 go/no-go 决策 | P2 | 1（0.5d） | A-P0 全 + R1 整合后 | 验收-T03（辅助） |
| A-P2-2 | 哨兵扩展覆盖新先验 | P2 | 1（0.5d） | A-P0-1/2 | 内部质量门禁 |

总量 ≈9d / 13d 实例容量。详细任务卡（目标/背景事实/改动文件/实现要点/验收标准/风险回退）见 `A/TASKS.md`。

---

## §3 读白名单（上下文纪律的硬边界）

### 3.1 可读

**本线域代码**（按卡取用，勿整目录通读）：

```
services/h2-analytics/src/h2_analytics/
  detection/    base.py rules.py c03.py c06.py execurability.py fixture.py
                lightgbm_adapter.py ml_verification.py （oplog_prior.py/alarm_features.py 为 A 线新建）
  events/       aggregator.py
  impact/       calculators.py reconcile.py
  diagnosis/    builder.py root_cause.py
  settings.py evidence.py models.py contracts.py vocabulary.py   ← 只读，理解接线用
tools/          features.py train_lightgbm.py
```

**A 侧 validation**：`validation/evaluate.mjs`、`validation/normal-context-regression.mjs`、`validation/overfit-sentinel.mjs`、`validation/lib/**`、`validation/README.md`（命令权威口径）、`validation/baseline/`。

**vocabulary JSON**：A 独占 4 个（detection-thresholds/anomaly-taxonomy/impact-formulas/efficiency-curves）可读可写；冻结 5 个（fields/equipment/constraints/submission-equipment-tokens/version）只读。

**根目录**：`MODELS_REGISTRY.md`；归档参考 `plan0829/A/planA/docs/decisions/ADR-001-ml-hybrid-architecture.md`（灰度五条出处，仅 A-P2-1 需要）。

**小数据文件**：见 §1.4 速查表「可整读」行。

### 3.2 禁读

| 禁读 | 原因 |
|---|---|
| `apps/web/**`、`plugins/**` | C 线领土；A 线产出经 api 契约被消费，无需读实现 |
| `scripts/**` | D 线领土（check-all/doctor/launch 只跑不改，见 §5） |
| `src/h2_analytics/assistant/**`、`api/**`、`service.py`（写） | B 线领土；A 需求走 change-request |
| submission 包、`reports/submission.py` | D 线领土（D-P0-2 消费 A-P0-3 的映射） |
| `01/02/03_*.csv`（382MB 大 CSV） | **仅经脚本/采样读**，禁止整读入上下文 |
| `06/07_row_labels.csv` | 行级标签仅 `tools/train_lightgbm.py` 消费（训练只用 train+validation） |
| `15/16` 号文件 | B 线语料源 |

### 3.3 大文件读纪律

时序 CSV 只经两类通道接触：① 门禁脚本（evaluate/尺子/哨兵自行流式处理，A 只读其报告摘要）；② 采样核对（PowerShell `Get-Content <file> -TotalCount 5` 看头部、脚本按时间戳切片取窗）。任何「把整日数据读进上下文」的操作即违反本节。

---

## §4 独占写清单（越界即拒合）

### 4.1 A 线独占写

```
services/h2-analytics/src/h2_analytics/detection/**   （含新建 oplog_prior.py、alarm_features.py）
services/h2-analytics/src/h2_analytics/events/**
services/h2-analytics/src/h2_analytics/impact/**
services/h2-analytics/src/h2_analytics/diagnosis/**
tools/**
validation/evaluate.mjs
validation/normal-context-regression.mjs
validation/overfit-sentinel.mjs
packages/h2-vocabulary/data/detection-thresholds.json
packages/h2-vocabulary/data/anomaly-taxonomy.json
packages/h2-vocabulary/data/impact-formulas.json
packages/h2-vocabulary/data/efficiency-curves.json
plan0830/A/**   （README/TASKS 本线自维护 + A/DECISIONS.md 由 A-P2-1 产出）
```

### 4.2 共享与冻结

- `validation/lib/**`：四线共享。A-P1-1 若需扩展 `lib/metrics.mjs`（时效指标），在 COORDINATION 登记 change-request 后可改，commit 说明注明。
- 冻结只读（任何改动走 CONTRACTS 变更流程，整合人裁定）：`packages/contracts/**`、`packages/h2-contracts/**`、plugin-runtime、vocabulary 冻结 5 JSON（fields/equipment/constraints/submission-equipment-tokens/version）、plan0830 顶层四文档。
- `settings.py`/`service.py`：B 独占。A 线若需接线（如 oplog 路径配置），提 change-request 由 B 实现或整合窗协调。
- `version.json`：仅整合人在整合窗改。A 线永不 bump。

### 4.3 跨线接口（A 产出的消费方，改动前知会）

| 方向 | 接口物 | 消费方与约束 |
|---|---|---|
| A→D | severity/subtype 确定性映射（A-P0-3） | D-P0-2 submission 16 字段硬门禁直接消费；映射改动须同步知会 D 线 |
| A→C | 事件字段（code/severity/subtype/equipment/confidence/evidence） | C 线六页展示与筛选；A 增字段不删不改名，新增入 evidence_json 内部 |
| A→B | evidence_json 结构、根因文本 | B 线助手引用检测事实；A-P0-1 新增 operation_prior 条目需在 CONTRACTS 登记结构 |
| A→D | ML 默认值结论（A-P2-1） | D-P2-1 落 launch 默认值+.env 样例；go/no-go 结论当日登记 |
| 整合人→A | version.json、整合窗合并 | A 不改，被动接收整合结果并在 worktree rebase |

---

## §5 验收命令集（PowerShell，官方数据目录为绝对路径）

### 5.1 门禁命令与通过标准

```powershell
# 官方评估：验证集事件级 P/R/F1 + 分类准确 + 时效（--grace-minutes 默认 10，对应验收-T03 时效口径）
node validation/evaluate.mjs --mode local --set validation --official-data 'D:\allcode\h2-t01-official\dataandfiles'

# 误报尺子：77 窗 N01-N07；check=门禁模式（任一列 FP 高于基线即非零退出）
node validation/normal-context-regression.mjs --official-data 'D:\allcode\h2-t01-official\dataandfiles' --mode check
#   阈值变更需重冻结时：--mode freeze --force（写入 validation/baseline/，gitignored）

# 过拟合哨兵：validation vs train-last-90（63 TRAIN 事件），|F1 gap|>0.15 即红
node validation/overfit-sentinel.mjs --official-data 'D:\allcode\h2-t01-official\dataandfiles'

# Python 单测（169 项口径；在 services/h2-analytics 下）
cd services/h2-analytics; uv run pytest

# 前端契约 QA（A 改动 vocabulary JSON 后必跑，防消费端破约）
npm run h2:qa

# 全量门禁（整合窗口径；脚本属 D 领土，A 只跑不改）
node scripts/h2-sentinel/check-all.mjs
```

| 命令 | 绿的标准 |
|---|---|
| evaluate | F1 ≥0.9598（对基线卡）；分类准确不低于基线；无新增失败断言 |
| 尺子 check | 全部列 `contextsWithFp`/`fpEventCount` 不高于基线（当前基线=77 窗 0 FP） |
| 哨兵 | |F1 gap| ≤0.15 且绑定校验全过 |
| pytest | 全绿（plan0829 冻结口径 169 项，A 线可增不可减） |
| h2:qa | exit 0（契约测试+run-contract-qa） |

### 5.2 辅助命令

```powershell
# 单测聚焦（改哪个模块跑哪个）
cd services/h2-analytics; uv run pytest tests/test_detection_pipeline.py -q
# 查看最近评估报告（生成区，gitignored）
ls tests/h2-sentinel/reports/generated/
# 大 CSV 采样头
Get-Content 'D:\allcode\h2-t01-official\dataandfiles\01_train_timeseries.csv' -TotalCount 3
```

**注意**：evaluate/尺子/哨兵全模式要求 **clean working tree**（SHA 只对 clean commit 有效）→ 算法三件套的「独立 commit」纪律（§7）正好配合：先 commit 再跑门禁，失败则 revert 该 commit。

---

## §6 日程与裁剪序

### 6.1 两轮排布（总量 ≈9d / 13d，D0 为全局启动日）

| 阶段 | 日 | 任务 | 产出/门禁 |
|---|---|---|---|
| R1 | D1-D2 | **A-P0-1**（会话1：映射表+oplog_prior.py+规则接线；会话2：remark 证据链+根因引用+阈值 v6） | evaluate+尺子+哨兵三绿；整合窗 D3 |
| R1 | D3-D4 | **A-P0-2**（会话1：alarm_features.py 两簇+置信增强；会话2：子类消歧+一致率报告）——**与 A-P0-1 同改 rules.py，必须串行在其合并后** | 同上三绿+169 pytest；整合窗 D5 |
| R1 | D5 | **A-P0-3**（severity/子类映射收口+350 事件对账断言） | 对账 100%+h2:qa 绿 |
| R1 | D5-D6 | **A-P1-1**（会话1：evaluate 时效报告；会话2：C07 前瞻判据）——与 A-P0-3 并行推进 | 时效基线冻结；整合窗 D7 |
| R1 | D6-D7 | **A-P1-2**（350 事件影响值偏差分布+对账表 v2） | 对账表 v2 入 plan0830/A |
| G1 | D7 | 全 P0 完成、整合分支全门禁绿 | 见 COORDINATION |
| R2 | D8-D9 | **A-P1-3**（边界聚合攻 FN1/FP3） | F1 不降且 FN/FP 至少一项改善 |
| R2 | D9-D10 | **A-P1-4**（C02/C06 设备定位收窄） | val 定位一致率报告 |
| R2 | D11 | **A-P2-1**（ML go/no-go，R1 整合后证据才有效） | A/DECISIONS.md |
| R2 | D11-D12 | **A-P2-2**（哨兵扩展覆盖 oplog/alarm 特征） | 哨兵绿+覆盖声明 |
| R2 | D12-D13 | 全量回归；若阈值有改 → 77 窗 0 FP 重冻结+版本递增 | G2 冻结前置 |
| G2 | D14 | 冻结、merge main、tag gate-p3 | 见 COORDINATION |

### 6.2 裁剪序（两周超支时按序放弃，P0 不可裁）

```
第 1 裁：A-P2-2（哨兵扩展——R1 已有三前置门禁兜底，裁后新特征无哨兵覆盖需在 DECISIONS 记录）
第 2 裁：A-P1-4（设备定位收窄——现状宽口径可用，验收-T05 靠既有 token 校验兜底）
第 3 裁：A-P1-3（边界聚合——F1 已 0.9718，边际收益最小）
不可裁：A-P0-1/2/3（P0）+ A-P1-1（时效显式化，验收-T03 直接相关）
```

裁剪决定由整合人在 COORDINATION 宣布；A 线实例执行后回看板把对应卡标 `已裁剪` 并注明日期与理由。

### 6.3 整合窗配合（D3/D5/D7/D9/D11/D13）

A 线在整合窗的动作：① 当日 12:00 前把已三绿的 commit push `origin/codex/p3-a`；② 不在整合窗当日开新检测行为变更（阈值文件冲突高发）；③ 整合人合并后次日在 worktree `git rebase codex/p3-integration` 并重跑三绿确认无回归，异常登记 COORDINATION。

---

## §7 红线与变更纪律

### 7.1 算法三件套（每次检测行为变更的强制流程）

1. **独立 commit**：一次阈值/判据变更一个 commit，禁混合无关改动（配合门禁的 clean-tree 要求）。
2. **阈值快照**：commit 附 `detection-thresholds.json` 变更前后对照（diff 即快照）。
3. **四项指标对照**：commit message 记录 P / R / F1 / 分类准确 四项前→后值。

commit message 模板：

```
[A] A-P0-1 操作日志触发先验融合：C03 判据接入先验加权
- 指标对照：P 0.958→0.958 | R 0.986→0.986 | F1 0.9718→0.9718 | 分类 69/69
- 阈值快照：detection-thresholds.json +oplogPrior 段；detectorVersion v5→v6
- 三前置：evaluate 绿 / 尺子 77 窗 0 FP / 哨兵绿
```

### 7.2 阈值变更前置（顺序不可倒置）

**先跑三绿，后改合并**：`evaluate`（F1≥0.9598）→ `尺子 check`（0 FP 不升）→ `哨兵`（|gap|≤0.15）。三者任一红 → revert，不得带病合并。合并后 `detectorVersion` 递增 v5→v6（若 A-P1-3 改聚合策略，`aggregationPolicyVersion` 同步 v2→v3）。

### 7.3 红线七条（继承 plan0829 §6，A 线特别标注）

| # | 红线 | A 线落点 |
|---|---|---|
| 1 | local-first / loopback-only，不连外部服务 | 检测管线零外呼 |
| 2 | 不发任何控制指令；建议必带人工确认 | evidence/根因措辞不得含执行语气 |
| 3 | LLM 不复核检测事实 | A 线产出与 B 线助手 strictly 分界 |
| 4 | 不构造电解槽健康度 | C06 判据只用实测运行量（效率曲线可用，健康度不可造） |
| 5 | 不硬编码测试答案 | 先验映射表写「操作类型→C 码」通则，禁按时间戳/事件 ID 特判 |
| 6 | **不凭报警计数判异常** | A-P0-2 关联 14 码只作置信增强+子类消歧，**严禁单独触发事件或以计数为判据** |
| 7 | 检测输入不含公共标签 | 先验源=操作/报警日志（12/11 号文件），不是标签文件；标签只在对账脚本中出现 |

补充两条 A 线专项：训练只用 train+validation（**禁测试集**，ADR-001）；N01-N07 只作误报尺子、不作训练增强（ADR-002）。

### 7.4 版本递增检查单（每次触及 detection-thresholds.json）

- [ ] detectorVersion 已递增（v5→v6→…，单调）
- [ ] 改动原因与指标对照写入 commit message
- [ ] 三绿截图/读数留档（报告路径记入看板证据列）
- [ ] 若重冻结尺子基线：`--mode freeze --force` 已执行且新读数记录
- [ ] 整合窗前的 push 包含该 commit

### 7.5 口径疑问

影响值容差（企业 Q5 未答）、时效口径细化等外部依赖问题 → 登记 `plan0830/D/ENTERPRISE_OUTREACH.md`（D 线持笔），A 线先用保守口径并在 A/DECISIONS.md 记录假设，答复到达后经 change-request 修订。

---

*本文件由 plan0830 A 线编写（2026-08-30）。路径均已 Glob 核实；与蓝图不一致处：`MODELS_REGISTRY.md` 位于仓库根（蓝图未指明位置），`models/` 目录 gitignored（worktree 内无模型文件，A-P2-1 需从主检出复制或重训）。*
