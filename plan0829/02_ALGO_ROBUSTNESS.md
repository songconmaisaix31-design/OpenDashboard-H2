# 02 · 检测算法稳健性与 ML 混合专项（ALGO ROBUSTNESS）

> 版本：2026-08-29 ｜ 责任阶段：`05_ROADMAP.md` S2 ｜ 覆盖优化项：P0-4 / P0-5 / P1-1 / P1-2 / P1-9
>
> **用户已确认的算法策略：全力引入 ML。** 规则稳健化（必做守门）与 LightGBM 混合升级（主线轨道）并行推进；门禁不因"全力"放松——F1 不回退、误报不升是一票否决。项目铁律不变：**模型检测 → 规则校验 → AI 解释 → 人工决策**。

---

## §1 过拟合证据链（为什么必须先建尺子）

### 1.1 三处 TRAIN 经验拟合
| 位置 | 内容 | 为何是经验拟合 |
|---|---|---|
| `services/h2-analytics/src/h2_analytics/detection/c03.py` | 400kW 签名带 **±1kW** 精确容差 + 连续 5 行（分钟）因果确认 | ±1kW 意味着只有与训练事件几乎相同的指令幅值才命中；测试集分布漂移（如指令幅值 350-450kW）会直接漏检。阈值 JSON 校准记录自述"非普适物理定律" |
| `detection/rules.py` `_detect_c05` | 日累计阈值（出口<4500 / 进口<20000 kWh）+ BESS 指令/实际落在 ±300±1kW 签名带 | 绝对带 + ±1kW 容差是 TRAIN 事件经验拟合 |
| `detection/c06.py` | 冻结 TRAIN 标记：ELZ2 目标份额=50%、ELZ3 受容量约束 | "目标分配"是训练数据统计结果而非可推导物理量；新工况下份额不同即失效 |

### 1.2 根本困境
测试集无标签不可得 → 无法在测试集自查召回。唯一防御 = ①判据由"绝对精确带"改"特征驱动鲁棒判据"；②用官方 77 条合理工况（N01-N07）当误报回归集；③用 ML 从数据学习判别面替代手工带。

---

## §2 去签名带方案（P1-1）

每类独立小步提交、可单独回退。三级鲁棒判据替换 ±1kW 绝对带：

1. **相对容差**：`|abs(cmd)−target| ≤ max(τ_abs, τ_rel × |target|)`（如 τ_rel=10%）；
2. **滑窗分位数带**：以过去 N 分钟指令幅值分布（P10-P90）为"正常带"，越带 + 因果方向确认才命中；
3. **多变量联合确认**：保留并强化"指令方向 vs 功率缺口/SOC 需求相反"因果门（`_command_opposes_control_need`）——这是判据真正的物理内核，保留而非删除。

**可解释三要素模板**（每处改动必附，写入 `detection-thresholds.json` 校准记录块）：
> 变量：`<involved variables>`；时间窗：`<window>`；判断依据：`<physical/business rationale>`。

**验收**：放宽后 validation F1 降幅 ≤0.012、FN ≤1、N01-N07 误报率不升、|ΔF1| 哨兵绿。

---

## §3 N01-N07 误报回归资产（P0-4，先于一切算法改动）

**本次迭代最重要的新增守门资产。** 77 条官方合理工况是唯一官方背书的"看似异常实为合理"样本。

- 新增 `validation/normal-context-regression.mjs`：读 `13_train_validation_normal_context.csv`（字段 `split, context_id, start_time, end_time, context_code, description, review_result`），对每个 [start,end] 窗口统计管线 FP，按 N02-N07 分列产出 `normal_context_fp_rate`；
- 基线冻结入 `validation/baseline/`；跑通一次并入门禁（S1 完成）；
- `context_code` 与 C02-C07 一一对应（N02↔C02 … N07↔C07）→ 可设"每类合理工况零误报"分列目标；
- 若现规则在合理工况上误报偏高 → 正是目的：倒逼 P1-1/P1-2 排期。

---

## §4 规则 + LightGBM 混合架构（P1-9，主线轨道）

### 4.1 编排原则（项目铁律落地）
`service.py` 检测器编排改为**规则为主、ML 为校验/补充层**：
- ML 不替代归因/安全/证据链路，只作用于检测判别面；
- ML 输出仍走 `EventAggregator` 聚合与全部下游（证据/影响/安全/报告），单一路径；
- 每条 ML 命中必须携带可解释证据（top 特征 + 判据带），进入 `evidence_json`。

### 4.2 覆盖范围（既有约束保留）
`detection/lightgbm_adapter.py`（91 行已存在未接线）显式拒绝 C01/C02/C06（动态设备归因需规则语义，adapter 第 34-41 行）→ 维持：
- **ML 主战场**：C03/C04/C05/C07（静态属性类，签名带过拟合风险最高的四类）；
- **ML 二次评分**：对规则产出的全部候选输出异常概率做一致性校验，分歧样本进 review 队列；
- C01/C02/C06 归因仍由规则负责（ML 可输出行级概率供规则消费，不做归因）。

### 4.3 训练管线
| 组件 | 内容 |
|---|---|
| 特征工程 `tools/features.py` | 滑窗统计（均值/极差/分位）、一阶差分、速率（kWh/min、kW/min）、裕量特征（`bess_available_*_energy_kwh` vs target、`grid_*_energy_remaining_kwh` 速率）、符号翻转计数、报警/操作日志邻近特征（先验 20-90 分钟） |
| 训练脚本 `tools/train_lightgbm.py` | 数据=公开 train（280 事件）+ validation（70 事件，仅早停/调参）；**禁止测试集/测试标签**；按月 rolling 时间分割防泄漏 |
| 行级标签 | 用公开 `06/07_*_row_labels.csv` 做行级分类；事件级评估仍用 `validation/evaluate.mjs` |
| 模型登记 | 产物不入库：模型落 `models/`（gitignored），`MODELS_REGISTRY.md` 登记 SHA256/参数/训练数据版本哈希/`detector_version` 联动 |
| 回退开关 | `settings.py` 新增 `H2_ML_ENABLED`（默认 **false**）；关闭时零行为差异 |

### 4.4 灰度门禁（一票否决）
1. `H2_ML_ENABLED=false` 时全量测试与基线逐字节一致；
2. 开启后 validation：F1 ≥ 0.9718−0.012、FN ≤1、`normal_context_fp_rate` 不升；
3. `validation/overfit-sentinel.mjs`（|ΔF1| ≤ 0.012）绿；
4. 每条 ML 命中输出 top-5 特征贡献（可解释红线）；
5. 3 个独立 seed 训练 F1 方差可接受（稳定性检查）。
全部通过才允许演示/提交配置默认启用。

### 4.5 风险与合规
- 可解释红线：ML 命中证据链 = 规则判据描述 + top 特征贡献；纯黑盒命中不得进提交；
- 效率曲线/约束值从 `h2-vocabulary` 读取不入模（TRAIN 标记冻结规则延续）；
- 重训触发：官方数据版本变更或门禁跌破。

---

## §5 C05/C07 提前预警语义（P0-5）

官方期望：**C05/C07 强调提前预警；其他类别开始后 10 分钟内发现**。

现状缺陷：`events/aggregator.py` `first_detection_time = segment[confirmation_row - 1]`（confirmation_row=3）→ "事件开始后第 3 行确认"，**无前瞻**，"提前"不成立。

改造：
1. **前瞻判据**（新增至 `detection/rules.py`）：
   - C05：`grid_*_energy_remaining_kwh` 消耗速率 + 当前功率外推 → 预计超限时刻 < 当日剩余时长 → 预警；
   - C07：`bess_available_*_energy_kwh` 与 `bess_regulation_reserve_target_kwh` 差值趋势 + SOC 轨迹外推；
2. **`lead_time_minutes = first_detection_time − event_start`** 入 `validation/evaluate.mjs`（C05/C07 目标 >0；其余 5 类测"10 分钟内检出率"，目标 100%）；
3. 与 P0-4 联调：前瞻判据过松会在 N05/N07 上误报——**必须**在 N01-N07 回归集验证。

---

## §6 C04/C07 可执行纠偏能力判定（P1-2）

官方限定词："且系统仍具备可执行纠偏能力"（C04）、"且此前存在可执行修正机会"（C07）。纯阈值会把"已无力纠偏"也标异常。

判定矩阵（复用 `h2-vocabulary/data/constraints.json` 同一约束源）：

| 维度 | 判定 | 数据来源 |
|---|---|---|
| BESS 可调裕量 | `min(放电裕量, 充电裕量) > 0` 且 ≥ 最低有效调节量 | `bess_discharge/charge_power_limit_kw`、SOC 距 20%/90% 边界 |
| 电解槽可调裕量 | 存在 ELZ 在 [300,1000] 内有 ≥爬坡限×提前量 的调整空间 | 台账 + 实际功率 |
| PCC 越限 vs 限值变化 | 越限持续且限值未变 → 可执行；限值刚变且系统在跟踪 → 合理（N04 场景） | `pcc_*_violation_kw` + 限值序列 |
| 数据缺失 | 任一输入缺失 → **降级"观察"**（不报警），注明原因 | — |

验收：单测三分支（裕量充足/不足/缺失）；C04/C07 FP 下降且 TP 不降。

---

## §7 阈值再校准流程

- 每次判据改动独立 commit，附「改动前后四项指标对照表」写入 `detection-thresholds.json` 校准记录块；
- 扩展 `tools/calibrate_c03.py`（241 行）/ `tools/calibrate_c06.py`（446 行）为全类别校准工具；
- 每次改动必跑：`validation/overfit-sentinel.mjs` + `validation/normal-context-regression.mjs`（新建）。

## §8 验收标准与测试清单

| 测试 | 层 | 断言 |
|---|---|---|
| 去签名带回归（C03/C05/C06 各一组） | pytest | 公开 TRAIN 40 事件/类全命中不回退；放宽后 F1 降幅 ≤0.012 |
| N01-N07 误报回归 | validation | `normal_context_fp_rate`（N02-N07 分列）不升 |
| lead_time 指标 | validation | C05/C07 `lead_time_minutes>0` 可测；其余 5 类 10 分钟内检出率 100% |
| 可执行性判定 | pytest | 三分支覆盖；缺失→观察 |
| ML 开关 | pytest | off=逐字节一致；on=门禁全绿 |
| ML 可解释性 | pytest | 每命中输出 top-5 特征 |

## §9 明确不做
不启用在线学习；不用 `system_alarm_count` 入模（干扰项）；不构造健康度特征；ML 命中不得绕过规则校验层与安全评估器；不在测试集上做任何形式的调参。