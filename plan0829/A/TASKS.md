# A 线任务卡（TASKS）— 检测算法与诊断域

> 每张卡：目标 ｜ 现状锚点 ｜ 实施步骤 ｜ 验收 ｜ 工作量 ｜ 回退 ｜ 依赖。
> 方案细节完整论述在 `../02_ALGO_ROBUSTNESS.md`（算法）/`../04_PLATFORM_DELIVERY.md`（平台）/`../06_RISK_AND_VALIDATION.md`（验证）。

---

## A-1 ｜ P0-4 N01-N07 误报回归资产（核心，先于一切算法改动）

- **目标**：把官方 77 条合理工况变成可量化的误报尺子，冻结基线。
- **现状锚点**：`13_train_validation_normal_context.csv`（字段 `split, context_id, start_time, end_time, context_code, description, review_result`；N02↔C02 … N07↔C07 一一对应）从未被用作回归资产。
- **实施步骤**：
  1. 新建 `validation/normal-context-regression.mjs`：读 CSV → 对每个 [start,end] 窗口调用与 `evaluate.mjs` 相同的检测管线 → 统计窗口内 FP 事件数；
  2. 按 `context_code` 分列产出 `normal_context_fp_rate`（N02-N07 各一列 + 总览）；
  3. 基线 JSON 入 `validation/baseline/normal-context-baseline.json`；
  4. `validation/README.md` 增补指标定义；接入 `check-all.mjs`。
- **验收**：一条命令复现分列误报率；基线冻结；此后任何算法改动该指标不得上升。
- **工作量**：M（1.5 天）｜ **回退**：纯新增文件。｜ **依赖**：D1 基线冻结。
- **注意**：基线误报偏高 → 如实记录，正是 P1-1/P1-2 立项依据（`../06` R-04）。

## A-2 ｜ P0-5 C05/C07 提前预警语义（核心）

- **目标**："提前预警"从口号变成可测指标。
- **现状锚点**：`events/aggregator.py` `first_detection_time = segment[confirmation_row - 1]`（confirmation_row=3）→ 事件开始后才确认，无前瞻；`evaluate.mjs` 无提前量指标。
- **实施步骤**：
  1. `detection/rules.py` 新增前瞻判据：C05 = `grid_import/export_energy_remaining_kwh` 消耗速率 + 功率外推 → 预计超限时刻 < 当日剩余时长；C07 = `bess_available_*_energy_kwh` 与 `bess_regulation_reserve_target_kwh` 差值趋势 + SOC 轨迹外推；
  2. 阈值入 `detection-thresholds.json` 附可解释三要素；
  3. `evaluate.mjs` 新增 `lead_time_minutes`（C05/C07）与"其余 5 类 10 分钟内检出率"；
  4. 在 A-1 回归集验证前瞻判据不误报 N05/N07。
- **验收**：C05/C07 lead_time 可测（目标 >0）；其余 5 类检出率 100%；N01-N07 不升。
- **工作量**：M（1.5 天）｜ **回退**：git revert + 阈值快照。｜ **依赖**：A-1。

## A-3 ｜ P1-1 去签名带过拟合（核心，最大收益/最大风险）

- **目标**：消除 ±1kW 绝对精确带，改为特征驱动的三级鲁棒判据：
- **现状锚点**：`detection/c03.py` 400kW±1kW + 5 行因果确认；`rules.py` `_detect_c05` ±300±1kW 带；`c06.py` 冻结 TRAIN 标记（ELZ2=50%）。
- **实施步骤**（**C03→C05→C06 三个独立 commit**）：
  1. 相对容差：`|abs(cmd)−target| ≤ max(τ_abs, τ_rel × |target|)`；
  2. 滑窗分位数带（P10-P90）；
  3. 保留强化 `_command_opposes_control_need` 因果门（物理内核不删）；
  4. 每 commit 附「前后四项指标对照表」入校准记录块。
- **验收**：每类 commit 后：TRAIN 40 事件/类全命中；F1 降幅≤0.012；FN≤1；误报不升；哨兵绿。
- **工作量**：L（3 天）｜ **回退**：单类 revert + 快照。｜ **依赖**：A-1、A-2。

## A-4 ｜ P1-2 C04/C07 可执行纠偏能力判定（核心）

- **目标**：官方判据限定词落地，降误报不降真报。
- **现状锚点**：`rules.py` `_detect_c04`/`_detect_c07` 纯阈值；`safety/evaluator.py` 已有约束检查可复用。
- **实施步骤**：判定矩阵三分支（裕量充足→成立 / 不足→成立但降级建议强度 / **数据缺失→降级"观察"不报警**）；裕量 = BESS 充放限、SOC 距 20%/90% 边界、ELZ 爬坡空间；约束值从 `h2-vocabulary` 读。
- **验收**：三分支单测；C04/C07 FP 降 TP 不降；N04/N07 不误报。
- **工作量**：M（1.5 天）｜ **回退**：开关式判定。｜ **依赖**：A-1。

## A-5 ｜ P1-9 规则 + LightGBM 混合（主线冲刺，go/no-go @ D12）

- **目标**：数据学习判别面替代手工带，冲检测上限。
- **现状锚点**：`detection/lightgbm_adapter.py`（91 行，拒 C01/C02/C06）；`pyproject.toml` ml extra 已声明；未接线。
- **实施步骤**：
  1. 特征工程 `tools/features.py`（滑窗统计/差分/速率/裕量/翻转/日志邻近特征）；
  2. `tools/train_lightgbm.py`：train+validation（**禁测试集**）、行级标签 `06/07_row_labels.csv`、按月 rolling、3 seed；训练期穿插 A-6；
  3. MODELS_REGISTRY 登记（产物 gitignored）；
  4. 接线 `service.py`：规则为主、ML 校验层（C03/C04/C05/C07 + 全类别二次评分）；`H2_ML_ENABLED` 灰度；
  5. 灰度五条门禁。
- **验收**：off=逐字节一致；on=F1 不降、误报不升、哨兵绿、top-5 特征、3 seed 方差可接受。
- **工作量**：L（3.5 天）｜ **回退**：`H2_ML_ENABLED=false`。｜ **依赖**：A-1..A-3。

## A-6 ｜ P0-7 影响量化口径复核（核心）

- **目标**：7 条官方公式逐条证明口径一致。
- **现状锚点**：`impact/calculators.py`（284 行）+ `impact-formulas.json`；官方公式数据字典 158-164 行。
- **实施步骤**：逐条四元组（公式原文→实现函数→单测断言→验证集 70 事件与 `reference_impact_value` 对账）；重点 C01/C03 基线定义、C06 与检测端重分配同源。
- **验收**：7/7 四元组 + 对账表；偏差 >10% 指标给出修订并过门禁。
- **工作量**：M（1.5 天）｜ **依赖**：宜在 A-3 后。

## A-7 ｜ P1-8 根因数据驱动文本（收尾）

- **目标**：根因从硬编码模板变为可回溯数据驱动文本。
- **现状锚点**：`diagnosis/builder.py`（1192 行）`_METADATA` 模板；`evidence.py` 已接官方目录；操作日志先验 20-90 分钟、root_cause 标签 5 种固定表述。
- **实施步骤**：操作日志模式归因打分（符号映射→C03、死区→C01、SOC 计划→C07、配额→C05、限值→C04）→ 输出表述 + 条目引用（`record_id`/`alarm_id` + 时间戳 + 参数 + 变更值）；无支撑写"证据不足"。
- **验收**：引用可回溯断言；命中率基线记录。｜ **工作量**：M（1.5 天）｜ **依赖**：无硬依赖，D12 收尾位。
- **协作点**：产出供 B 线 Q05 答案引用（`COORDINATION.md` §5 接口 2）。