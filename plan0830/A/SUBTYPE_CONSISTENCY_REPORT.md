# A-P0-2 会话2 · 子类一致率报告（val）

> 生成：2026-08-30（会话2）｜基线 detector：`deterministic-c01-c07-v5`（CR-B1 未解锁，v6 收口挂起）
> 核实工具：`tools/verify_alarm_cooccurrence.py`（mode=full）+ `tools/verify_subtype_consistency.py`（离线管线复现）
> 结论速览：**消歧介入事件数 = 0（假设被数据否证，不接线）**；val 匹配事件子类一致率 **67/69**；
> 改动前后子类**零变化**（本会话无检测行为变更）；两条不一致（VA0034/VA0040，C04）根因在
> rules.py fallback 方向分支的时序侧两可，报警弱特征不可修正。

## 一、全程窗再核：7 个起点窗零共现码（任务卡会话2 第一项）

窗口径 = 事件全程 [start_time, end_time]（350 标签事件 × 11 号报警）。结论：**7 码全部为
事件后段信号，且与 C 码严格一对一配对**——每类形成「起点窗主码（会话1 已接线置信增强）+
后段副码（本次核实，备用不接线）」双码结构：

| C 码 | 起点窗主码（已接线） | 后段副码（本次核实） | 副码全程窗覆盖率 |
|---|---|---|---|
| C01 | EMS_SETPOINT_OSC 8% | BESS_REGULATION_HIGH | 60% |
| C02 | ELZ_POWER_DEVIATION 22% | CAPACITY_SYNC_WARN | 84% |
| C03 | BESS_DIRECTION_CONFLICT 16% | PCC_DEVIATION | 64% |
| C04 | PCC_POWER_LIMIT_EXCEED 10% | DISPATCH_LIMIT_NOT_TRACKED | 58% |
| C05 | GRID_ENERGY_QUOTA_RISK 8% | GRID_ENERGY_QUOTA_EXCEED | 76% |
| C06 | ELZ_ALLOCATION_EFF_LOW 14% | ELZ_AVOIDABLE_START | 68% |
| C07 | BESS_RESERVE_SHORTFALL 4% | SOC_TRAJECTORY_DEVIATION | 60% |

副码不进当前置信映射（保持会话1 冻结行为）；若后续（如 A-P2-2 哨兵覆盖或置信扩展 CR）
需要，可经算法三件套接入。

## 二、消歧可行性核实：假设被数据否证

任务卡会话2 设想「C04/C05 事件窗内关联码的方向 → IMPORT/EXPORT 子类消歧」。两项证据否证：

1. **报警数据无方向字段**：11 号文件 `alarm_message` 为每码固定文案（如
   PCC_POWER_LIMIT_EXCEED →「PCC上下网功率超过动态边界」），无 per-record 侧向信息。
2. **码身份×子类统计无判别力**（全程窗交叉表，train+val 各 25/25）：

| 分组 | 主码覆盖率 | 副码覆盖率 |
|---|---|---|
| C04/EXPORT (n=25) | PCC_POWER_LIMIT_EXCEED 88% | DISPATCH_LIMIT_NOT_TRACKED 60% |
| C04/IMPORT (n=25) | PCC_POWER_LIMIT_EXCEED 88% | DISPATCH_LIMIT_NOT_TRACKED 56% |
| C05/EXPORT (n=25) | GRID_ENERGY_QUOTA_RISK 88% | GRID_ENERGY_QUOTA_EXCEED 68% |
| C05/IMPORT (n=25) | GRID_ENERGY_QUOTA_RISK 96% | GRID_ENERGY_QUOTA_EXCEED 84% |

两组分布几乎对称（无任何码能把 IMPORT/EXPORT 分开）→ **消歧不接线**（最小变更原则，
不引入死代码）；红线同时禁止把弱特征强行用作判据。

## 三、val 子类一致率（离线管线复现实测）

方法：`tools/verify_subtype_consistency.py` 流式读 02 号 val CSV（按日分块 1440 行）→
`RuleRowDetector.detect` + `EventAggregator.aggregate`（与 evaluate.mjs 同口径注入
`H2_OPERATION_LOG_PATH`/`H2_ALARM_LOG_PATH`）→ evaluate 层同码 2 分钟合并 → 与 407ed1b
基点 evaluate 报告 72 条预测**逐条对照一致（72/72，id+code+起止）**后，借报告 matches
对齐 05 号标签比较子类。

- **val 匹配事件子类一致率：67/69**（FN1=VA0005 C01 无预测，不计入分母）
- 分码：C01 9/9 ｜ C02 10/10 ｜ C03 10/10 ｜ **C04 8/10** ｜ C05 10/10 ｜ C06 10/10 ｜ C07 10/10
- **消歧介入事件数：0**；子类改动前后对照：全部事件「新=原」（未接线，行为与会话1 三绿基点完全一致）

### 不一致两条的根因（均 C04，均 fallback 方向分支）

| 事件 | 预测子类 | 标签子类 | 窗内时序证据（探针实测） |
|---|---|---|---|
| VA0034（01-22 11:19-12:15） | EXPORT_POWER_LIMIT_NOT_TRACKED | IMPORT_POWER_LIMIT_NOT_TRACKED | violation 两列全窗恒 0；pcc_actual 恒正（+79~390kW）；bess_cmd 恒 -450 |
| VA0040（02-20 11:06-13:01） | EXPORT_POWER_LIMIT_NOT_TRACKED | IMPORT_POWER_LIMIT_NOT_TRACKED | violation 两列全窗恒 0；pcc_actual 由 -82 转正；bess_cmd 恒 -450 |

rules.py `_detect_c04` 的 violation 分支未触发（两列恒 0）→ 子类出自 fallback：按
`pcc_actual` 符号（正→EXPORT）；标签 IMPORT 与 `bess_power_cmd`（充电方向）一致。
即 **PCC 表计方向与 BESS 指令方向相反、时序证据本身两可**，且报警码（第二节）不可修正。
候选修法=fallback 改用/叠加 BESS 指令方向判据——属时序判据变更（非报警弱特征），超出
本卡范围，登记至 A-P1-3（边界与判据调优）参考；A-P0-3 做映射收口时本表可作对账底数。

## 四、C04/C05 逐事件表（事件 ID / 原 subtype / 新 subtype / 标签 subtype）

「新 subtype」= 消歧后（本会话结论：不接线，故恒等于原值）。

| 事件 ID | C 码 | 原 subtype | 新 subtype | 标签 subtype | 结论 |
|---|---|---|---|---|---|
| VA0031 | C04 | EXPORT_POWER_LIMIT_NOT_TRACKED | （同原） | EXPORT_POWER_LIMIT_NOT_TRACKED | 一致 |
| VA0032 | C04 | IMPORT_POWER_LIMIT_NOT_TRACKED | （同原） | IMPORT_POWER_LIMIT_NOT_TRACKED | 一致 |
| VA0033 | C04 | EXPORT_POWER_LIMIT_NOT_TRACKED | （同原） | EXPORT_POWER_LIMIT_NOT_TRACKED | 一致 |
| VA0034 | C04 | EXPORT_POWER_LIMIT_NOT_TRACKED | （同原） | IMPORT_POWER_LIMIT_NOT_TRACKED | **不一致** |
| VA0035 | C04 | EXPORT_POWER_LIMIT_NOT_TRACKED | （同原） | EXPORT_POWER_LIMIT_NOT_TRACKED | 一致 |
| VA0036 | C04 | IMPORT_POWER_LIMIT_NOT_TRACKED | （同原） | IMPORT_POWER_LIMIT_NOT_TRACKED | 一致 |
| VA0037 | C04 | EXPORT_POWER_LIMIT_NOT_TRACKED | （同原） | EXPORT_POWER_LIMIT_NOT_TRACKED | 一致 |
| VA0038 | C04 | IMPORT_POWER_LIMIT_NOT_TRACKED | （同原） | IMPORT_POWER_LIMIT_NOT_TRACKED | 一致 |
| VA0039 | C04 | EXPORT_POWER_LIMIT_NOT_TRACKED | （同原） | EXPORT_POWER_LIMIT_NOT_TRACKED | 一致 |
| VA0040 | C04 | EXPORT_POWER_LIMIT_NOT_TRACKED | （同原） | IMPORT_POWER_LIMIT_NOT_TRACKED | **不一致** |
| VA0041 | C05 | EXPORT_ENERGY_QUOTA_RISK | （同原） | EXPORT_ENERGY_QUOTA_RISK | 一致 |
| VA0042 | C05 | IMPORT_ENERGY_QUOTA_RISK | （同原） | IMPORT_ENERGY_QUOTA_RISK | 一致 |
| VA0043 | C05 | EXPORT_ENERGY_QUOTA_RISK | （同原） | EXPORT_ENERGY_QUOTA_RISK | 一致 |
| VA0044 | C05 | IMPORT_ENERGY_QUOTA_RISK | （同原） | IMPORT_ENERGY_QUOTA_RISK | 一致 |
| VA0045 | C05 | EXPORT_ENERGY_QUOTA_RISK | （同原） | EXPORT_ENERGY_QUOTA_RISK | 一致 |
| VA0046 | C05 | IMPORT_ENERGY_QUOTA_RISK | （同原） | IMPORT_ENERGY_QUOTA_RISK | 一致 |
| VA0047 | C05 | EXPORT_ENERGY_QUOTA_RISK | （同原） | EXPORT_ENERGY_QUOTA_RISK | 一致 |
| VA0048 | C05 | IMPORT_ENERGY_QUOTA_RISK | （同原） | IMPORT_ENERGY_QUOTA_RISK | 一致 |
| VA0049 | C05 | EXPORT_ENERGY_QUOTA_RISK | （同原） | EXPORT_ENERGY_QUOTA_RISK | 一致 |
| VA0050 | C05 | IMPORT_ENERGY_QUOTA_RISK | （同原） | IMPORT_ENERGY_QUOTA_RISK | 一致 |

## 五、遗留与去向

1. **VA0034/VA0040（C04 fallback 方向两可）**：候选修法=BESS 指令方向参与 fallback
   判据（时序侧变更，需算法三件套+三绿）→ 登记 A-P1-3 参考；A-P0-3 对账断言沿用本表底数。
2. **后段副码双码结构**（第一节表）：备用；接入任何运行时行为需走算法三件套。
3. **alarmFeatures/oplogPrior 参数 v6 收口**：仍挂 CR-B1（B 线解锁 v5 字面锁后迁
   `detection-thresholds.json` 并递增版本）。
4. 分类准确（C 码级）69/69 与基线持平；子类级 67/69 为本报告首次显式测量口径。
