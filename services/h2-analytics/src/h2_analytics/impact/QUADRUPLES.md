# 影响量化四元组与对账表（P0-7 / T10 / 任务卡 A-6）

> 归属：A3 诊断与支撑域 ｜ 日期：2026-08-29 ｜ 工具：`impact/reconcile.py`（`python -m h2_analytics.impact.reconcile`）
> 官方公式来源：`数据与材料/00_变量中文描述与数据字典.csv` 第 158-164 行（is_derived=是，C01-C07 逐行对应）
> 纪律：口径候选与系数只用公开 TRAIN 推导（calibrationSplit=public_train）；VALIDATION 仅验收（acceptance-only）；测试集全程未触碰。

## 一、四元组总表（7/7）

| # | 公式原文（数据字典行号） | 实现位置（版本） | 单测断言（tests/test_impact.py） | 对账偏差（TRAIN / VALIDATION） |
|---|---|---|---|---|
| C01 | `Σ\|异常储能功率-参考基线储能功率\|×1/60`（158 行） | `calculators.py::_calculate_c01`（**impact-c01-v2**，修订） | `test_c01_integrates_deviation_from_the_train_calibrated_soc_response`：gain 17.892×5pp→反事实 89.46 kW，两行偏离 10.54+300 → **310.54 kWh**；版本断言 impact-c01-v2 | 40/40 ≤0.037% ｜ 10/10 ≤0.021%（最大绝对残差 0.068/0.045 kWh） |
| C02 | `Σmax(0,电解槽指令-实际功率)×1/60`（159 行） | `calculators.py::_calculate_c02`（**impact-c02-v2**，修订） | `test_c02_integrates_only_the_affected_units_positive_command_gap`：ELZ2 缺口 200 kW 计入、ELZ1 缺口 200 kW 排除 → **200**；无归因回退全机 → 400 | 40/40 ≤0.0001% ｜ 10/10 ≤0.0001%（38/40、9/10 三位小数全等） |
| C03 | `Σ\|异常PCC功率-参考PCC功率\|×1/60`（160 行） | `calculators.py::_calculate_c03`（impact-c03-v2，沿用） | `test_c03_integrates_deviation_from_train_calibrated_soc_response`：**757.84**；版本 impact-c03-v2 | 40/40 ≤0.028% ｜ 10/10 ≤0.013%（残差源于官方圆整测量值，见 impact-formulas.json limitation） |
| C04 | `Σ(上网越限量+下网越限量)×1/60`（161 行） | `calculators.py::_calculate_c04`（impact-c04-v1，沿用） | `test_c04_sums_export_and_import_violations_when_both_are_reported`：120+30→**150**；`..._falls_back_to_limits...`：回退 200/150/0 | 40/40 ≤0.087% ｜ 10/10 ≤0.0001% |
| C05 | `max(上网配额超出量,下网配额超出量)`（162 行） | `calculators.py::_calculate_c05`（impact-c05-v1，沿用） | `test_c05_and_c07_report_the_peak_not_the_integral`：峰值 **40.0**（非积分） | 40/40 全等 ｜ 10/10 全等（残差 0.000） |
| C06 | `异常分配耗电量-参考高效分配耗电量`（163 行） | `calculators.py::_calculate_c06`（impact-c06-v3，沿用） | `test_c06_integrates_varying_targets_for_every_inclusive_sample`：Σtargets×rate×interval/60 逐参数断言（0.018/0.022） | 40/40 ≤0.0005% ｜ 10/10 ≤0.0006%（40+10 全部三位小数全等） |
| C07 | `max(0,调节备用目标-实际可用备用能量)`（164 行） | `calculators.py::_calculate_c07`（impact-c07-v1，沿用） | `test_c05_and_c07_report_the_peak_not_the_integral`：峰值 **110.0**；`..._charge_subtype...`：充电子类读 charge 字段 | 40/40 全等 ｜ 10/10 全等（残差 0.000） |

对账工具自身断言：`tests/test_impact_reconciliation.py`（偏差口径含零/零、C02 设备映射、合成数据端到端、覆盖缺失报错）。

## 二、本次修订记录（偏差 >10% → 修订 → 过门禁）

T10 开工前基线对账（旧实现直接对 VALIDATION）：C01 8/10、C02 6/10 在 ±10% 内，其余 5 类全过。两项修订**均只从 TRAIN 推导**，VALIDATION 仅验收：

### C01 v1→v2：参考基线 = SOC 跟踪反事实
- **v1（旧）**：窗内中位数作基线。TRAIN 候选对比 36/40；事件前窗口中位数最好 38/40（TR0011/TR0021 各窗口均 1.14-1.23 失配）。
- **v2（新）**：`参考基线储能功率 = 17.892 kW/pp × (bess_soc_pct − soc_target_pct)`，与 C03 共用同一 TRAIN 冻结系数（正放电约定），不新增任何拟合参数。TRAIN **40/40**、VALIDATION **10/10**。
- 依据：`impact-formulas.json classes.C01.derivationProcedure`；窗内中位数对振荡事件有系统性拉偏（如 VA0007 旧口径偏差 54%）。

### C02 v1→v2：只计受影响设备的正缺口
- **v1（旧）**：三台电解槽正缺口全部求和。TRAIN 仅 23/40（偏差事件最高 3.12 倍）。
- **v2（新）**：仅累计 `implicated_equipment_ids` 中的受影响机组（检测端 rules.py 已按单机归因）；无归因时回退全机（盲测集降级不崩溃）。可用/运行状态过滤均不能解释旧偏差（all=running=avail=23/40），排除"状态过滤"备择。TRAIN **40/40**、VALIDATION **10/10**。
- 依据：`impact-formulas.json classes.C02.derivationProcedure`。

**门禁判定**：修订后 TRAIN 280/280、VALIDATION 70/70 全部 ≤10% 阈值（实际最大 0.087%），无剩余需修订指标。

## 三、对账运行汇总

| split | 时序列（行数/SHA256 前 16） | 标签（行数/SHA256 前 16） | 结果 |
|---|---|---|---|
| train | 525600 / `67513c9b1d443d25` | 280 / `50f84b18f905b584` | 7 类 ×40/40 全过 |
| validation | 129600 / `182728b3a4c53265` | 70 / `47989467020fad54` | 7 类 ×10/10 全过 |

分类聚合（TRAIN｜VALIDATION）：C01 40/40｜10/10（maxRelDev 0.037%｜0.021%）；C02 40/40｜10/10（0.0001%｜0.0001%）；C03 40/40｜10/10（0.028%｜0.013%）；C04 40/40｜10/10（0.087%｜0.0001%）；C05-C07 40/40｜10/10（全等）。

注：C04 的 VA0034/0036/0040 与参考值双侧为 0（越限未实际发生），零/零对账记 0 偏差，非除零。

## 四、验证集 70 事件对账明细

| event_id | 类别/子类 | 受影响设备 | 计算值 (kWh) | 参考值 (kWh) | 绝对残差 | 相对偏差 |
|---|---|---|---|---|---|---|
| VA0051 | C06/INEFFICIENT_POWER_ALLOCATION | ELZ1,ELZ2,ELZ3 | 181.175 | 181.175 | 0.000 | 0.000% |
| VA0014 | C02/CAPACITY_NOT_SYNCHRONIZED | ELZ2 | 871.285 | 871.285 | 0.000 | 0.000% |
| VA0053 | C06/INEFFICIENT_POWER_ALLOCATION | ELZ1,ELZ2,ELZ3 | 86.520 | 86.520 | 0.000 | 0.001% |
| VA0066 | C07/CHARGE_HEADROOM_SHORTFALL | BESS,PCC,PV,ELZ | 339.474 | 339.474 | 0.000 | 0.000% |
| VA0048 | C05/IMPORT_ENERGY_QUOTA_RISK | PCC,BESS,ELZ | 4665.345 | 4665.345 | 0.000 | 0.000% |
| VA0042 | C05/IMPORT_ENERGY_QUOTA_RISK | PCC,BESS,ELZ | 9632.099 | 9632.099 | 0.000 | 0.000% |
| VA0024 | C03/BESS_DIRECTION_REVERSED | BESS,PCC | 374.108 | 374.096 | 0.012 | 0.003% |
| VA0013 | C02/CAPACITY_NOT_SYNCHRONIZED | ELZ3 | 861.074 | 861.073 | 0.001 | 0.000% |
| VA0011 | C02/CAPACITY_NOT_SYNCHRONIZED | ELZ2 | 1004.004 | 1004.004 | 0.000 | 0.000% |
| VA0049 | C05/EXPORT_ENERGY_QUOTA_RISK | PCC,BESS,ELZ | 3100.496 | 3100.496 | 0.000 | 0.000% |
| VA0058 | C06/AVOIDABLE_START_STOP | ELZ1,ELZ2,ELZ3 | 49.680 | 49.680 | 0.000 | 0.000% |
| VA0019 | C02/CAPACITY_NOT_SYNCHRONIZED | ELZ1 | 1151.713 | 1151.713 | 0.000 | 0.000% |
| VA0010 | C01/SETPOINT_OSCILLATION | ELZ2,ELZ3,BESS,PCC | 111.857 | 111.841 | 0.016 | 0.014% |
| VA0025 | C03/BESS_DIRECTION_REVERSED | BESS,PCC | 420.411 | 420.398 | 0.013 | 0.003% |
| VA0052 | C06/AVOIDABLE_START_STOP | ELZ1,ELZ2,ELZ3 | 32.760 | 32.760 | 0.000 | 0.000% |
| VA0063 | C07/DISCHARGE_RESERVE_SHORTFALL | BESS,PCC,PV,ELZ | 331.000 | 331.000 | 0.000 | 0.000% |
| VA0068 | C07/CHARGE_HEADROOM_SHORTFALL | BESS,PCC,PV,ELZ | 339.474 | 339.474 | 0.000 | 0.000% |
| VA0034 | C04/IMPORT_POWER_LIMIT_NOT_TRACKED | PCC,BESS,ELZ,PV | 0.000 | 0.000 | 0.000 | 0.000% |
| VA0044 | C05/IMPORT_ENERGY_QUOTA_RISK | PCC,BESS,ELZ | 8091.335 | 8091.335 | 0.000 | 0.000% |
| VA0012 | C02/CAPACITY_NOT_SYNCHRONIZED | ELZ1 | 1007.904 | 1007.904 | 0.000 | 0.000% |
| VA0008 | C01/SETPOINT_OSCILLATION | ELZ1,ELZ2,BESS,PCC | 145.227 | 145.235 | 0.008 | 0.005% |
| VA0062 | C07/CHARGE_HEADROOM_SHORTFALL | BESS,PCC,PV,ELZ | 339.474 | 339.474 | 0.000 | 0.000% |
| VA0029 | C03/BESS_DIRECTION_REVERSED | BESS,PCC | 348.748 | 348.747 | 0.001 | 0.000% |
| VA0056 | C06/AVOIDABLE_START_STOP | ELZ1,ELZ2,ELZ3 | 75.600 | 75.600 | 0.000 | 0.000% |
| VA0003 | C01/SETPOINT_OSCILLATION | ELZ3,ELZ2,BESS,PCC | 409.891 | 409.882 | 0.009 | 0.002% |
| VA0033 | C04/EXPORT_POWER_LIMIT_NOT_TRACKED | PCC,BESS,ELZ,PV | 7248.172 | 7248.172 | 0.000 | 0.000% |
| VA0057 | C06/INEFFICIENT_POWER_ALLOCATION | ELZ1,ELZ2,ELZ3 | 61.106 | 61.106 | 0.000 | 0.001% |
| VA0002 | C01/SETPOINT_OSCILLATION | ELZ3,ELZ2,BESS,PCC | 140.601 | 140.612 | 0.011 | 0.008% |
| VA0064 | C07/CHARGE_HEADROOM_SHORTFALL | BESS,PCC,PV,ELZ | 339.474 | 339.474 | 0.000 | 0.000% |
| VA0001 | C01/SETPOINT_OSCILLATION | ELZ2,ELZ1,BESS,PCC | 192.985 | 193.020 | 0.035 | 0.018% |
| VA0004 | C01/SETPOINT_OSCILLATION | ELZ3,ELZ1,BESS,PCC | 158.606 | 158.609 | 0.003 | 0.002% |
| VA0020 | C02/CAPACITY_NOT_SYNCHRONIZED | ELZ2 | 1055.743 | 1055.743 | 0.000 | 0.000% |
| VA0047 | C05/EXPORT_ENERGY_QUOTA_RISK | PCC,BESS,ELZ | 8787.904 | 8787.904 | 0.000 | 0.000% |
| VA0039 | C04/EXPORT_POWER_LIMIT_NOT_TRACKED | PCC,BESS,ELZ,PV | 7926.477 | 7926.478 | 0.001 | 0.000% |
| VA0028 | C03/BESS_DIRECTION_REVERSED | BESS,PCC | 680.922 | 680.918 | 0.004 | 0.001% |
| VA0007 | C01/SETPOINT_OSCILLATION | ELZ3,ELZ2,BESS,PCC | 357.518 | 357.508 | 0.010 | 0.003% |
| VA0069 | C07/DISCHARGE_RESERVE_SHORTFALL | BESS,PCC,PV,ELZ | 331.000 | 331.000 | 0.000 | 0.000% |
| VA0036 | C04/IMPORT_POWER_LIMIT_NOT_TRACKED | PCC,BESS,ELZ,PV | 0.000 | 0.000 | 0.000 | 0.000% |
| VA0009 | C01/SETPOINT_OSCILLATION | ELZ3,ELZ1,BESS,PCC | 149.989 | 149.988 | 0.001 | 0.000% |
| VA0016 | C02/CAPACITY_NOT_SYNCHRONIZED | ELZ2 | 1342.158 | 1342.158 | 0.000 | 0.000% |
| VA0017 | C02/CAPACITY_NOT_SYNCHRONIZED | ELZ2 | 1365.891 | 1365.891 | 0.000 | 0.000% |
| VA0040 | C04/IMPORT_POWER_LIMIT_NOT_TRACKED | PCC,BESS,ELZ,PV | 0.000 | 0.000 | 0.000 | 0.000% |
| VA0027 | C03/BESS_DIRECTION_REVERSED | BESS,PCC | 305.391 | 305.374 | 0.017 | 0.006% |
| VA0046 | C05/IMPORT_ENERGY_QUOTA_RISK | PCC,BESS,ELZ | 5938.569 | 5938.569 | 0.000 | 0.000% |
| VA0032 | C04/IMPORT_POWER_LIMIT_NOT_TRACKED | PCC,BESS,ELZ,PV | 5055.357 | 5055.357 | 0.000 | 0.000% |
| VA0026 | C03/BESS_DIRECTION_REVERSED | BESS,PCC | 414.779 | 414.767 | 0.012 | 0.003% |
| VA0037 | C04/EXPORT_POWER_LIMIT_NOT_TRACKED | PCC,BESS,ELZ,PV | 3131.975 | 3131.975 | 0.000 | 0.000% |
| VA0055 | C06/INEFFICIENT_POWER_ALLOCATION | ELZ1,ELZ2,ELZ3 | 123.587 | 123.587 | 0.000 | 0.000% |
| VA0005 | C01/SETPOINT_OSCILLATION | ELZ3,ELZ2,BESS,PCC | 168.978 | 168.992 | 0.014 | 0.008% |
| VA0041 | C05/EXPORT_ENERGY_QUOTA_RISK | PCC,BESS,ELZ | 6991.552 | 6991.552 | 0.000 | 0.000% |
| VA0035 | C04/EXPORT_POWER_LIMIT_NOT_TRACKED | PCC,BESS,ELZ,PV | 367.288 | 367.288 | 0.000 | 0.000% |
| VA0050 | C05/IMPORT_ENERGY_QUOTA_RISK | PCC,BESS,ELZ | 8757.312 | 8757.312 | 0.000 | 0.000% |
| VA0023 | C03/BESS_DIRECTION_REVERSED | BESS,PCC | 366.593 | 366.588 | 0.005 | 0.001% |
| VA0065 | C07/DISCHARGE_RESERVE_SHORTFALL | BESS,PCC,PV,ELZ | 331.000 | 331.000 | 0.000 | 0.000% |
| VA0038 | C04/IMPORT_POWER_LIMIT_NOT_TRACKED | PCC,BESS,ELZ,PV | 5414.716 | 5414.716 | 0.000 | 0.000% |
| VA0015 | C02/CAPACITY_NOT_SYNCHRONIZED | ELZ3 | 966.965 | 966.965 | 0.000 | 0.000% |
| VA0070 | C07/CHARGE_HEADROOM_SHORTFALL | BESS,PCC,PV,ELZ | 339.474 | 339.474 | 0.000 | 0.000% |
| VA0031 | C04/EXPORT_POWER_LIMIT_NOT_TRACKED | PCC,BESS,ELZ,PV | 5084.452 | 5084.452 | 0.000 | 0.000% |
| VA0043 | C05/EXPORT_ENERGY_QUOTA_RISK | PCC,BESS,ELZ | 9589.566 | 9589.566 | 0.000 | 0.000% |
| VA0030 | C03/BESS_DIRECTION_REVERSED | BESS,PCC | 331.689 | 331.689 | 0.000 | 0.000% |
| VA0060 | C06/AVOIDABLE_START_STOP | ELZ1,ELZ2,ELZ3 | 81.000 | 81.000 | 0.000 | 0.000% |
| VA0067 | C07/DISCHARGE_RESERVE_SHORTFALL | BESS,PCC,PV,ELZ | 331.000 | 331.000 | 0.000 | 0.000% |
| VA0006 | C01/SETPOINT_OSCILLATION | ELZ1,ELZ2,BESS,PCC | 220.062 | 220.107 | 0.045 | 0.021% |
| VA0021 | C03/BESS_DIRECTION_REVERSED | BESS,PCC | 432.528 | 432.583 | 0.055 | 0.013% |
| VA0054 | C06/AVOIDABLE_START_STOP | ELZ1,ELZ2,ELZ3 | 66.960 | 66.960 | 0.000 | 0.000% |
| VA0022 | C03/BESS_DIRECTION_REVERSED | BESS,PCC | 540.628 | 540.647 | 0.019 | 0.004% |
| VA0045 | C05/EXPORT_ENERGY_QUOTA_RISK | PCC,BESS,ELZ | 3176.802 | 3176.802 | 0.000 | 0.000% |
| VA0061 | C07/DISCHARGE_RESERVE_SHORTFALL | BESS,PCC,PV,ELZ | 331.000 | 331.000 | 0.000 | 0.000% |
| VA0018 | C02/CAPACITY_NOT_SYNCHRONIZED | ELZ2 | 998.730 | 998.730 | 0.000 | 0.000% |
| VA0059 | C06/INEFFICIENT_POWER_ALLOCATION | ELZ1,ELZ2,ELZ3 | 107.608 | 107.608 | 0.000 | 0.000% |

## 五、复现命令

```bash
# TRAIN（口径推导 split）
python -m h2_analytics.impact.reconcile 01_train_timeseries.csv 04_train_event_labels.csv --split train
# VALIDATION（验收 split）
python -m h2_analytics.impact.reconcile 02_validation_timeseries.csv 05_validation_event_labels.csv --split validation
# 单测
python -m pytest tests/test_impact.py tests/test_impact_reconciliation.py -q
```

## 六、IF-1（B 线 Q03）口径说明对齐

B 线 AnswerProvider 引用 C03 指标时，按 `api.md` IF-1 形状取值（本表为权威来源）：

```json
{
  "metric": "abnormal_grid_exchange_energy_kwh",
  "formula_quote": "Σ|异常PCC功率−参考PCC功率|×1/60",
  "reference_baseline_definition": "参考PCC功率 = SOC 跟踪反事实 BESS 响应 = 17.892 kW/pp × (bess_soc_pct − soc_target_pct)（TRAIN 冻结系数，正放电约定；与 C01 参考基线同族）",
  "unit": "kWh",
  "citations": ["数据字典第160行", "impact/calculators.py::_calculate_c03", "impact-formulas.json classes.C03"]
}
```
