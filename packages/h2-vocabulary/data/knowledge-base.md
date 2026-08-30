# 弱并网绿电制氢EMS控制异常诊断知识库（结构化语料，B-P1-1）

> 条目 schema（corpus.py 按此解析）：每条 = `### {ID}` + **正文** + **sourceType** + **sourceId**。
> sourceType 取值：`official_knowledge`（官方 15 号文件原文）/ `data_dictionary`（00 号变量字典归纳）/ `requirement_doc`（需求书条款）。
> 纪律：正文忠实转述官方材料（单位/公式/枚举/关联异常码原样保留），不编造测点或标准；官方 4 条逐字保留。

## 一、官方知识条目（15_knowledge_base.md 原文逐字保留）

### h2-sign-conventions-v1
- **正文**：PCC功率正值表示向电网上网，负值表示从电网下网。储能功率正值表示放电，负值表示充电。
- **sourceType**: official_knowledge
- **sourceId**: 15_knowledge_base.md:行3

### h2-power-balance-boundary-v1
- **正文**：功率平衡：光伏实际功率 + 储能实际功率 - PCC实际功率 - 电解槽总功率 - 辅机功率 ≈ 0。
- **sourceType**: official_knowledge
- **sourceId**: 15_knowledge_base.md:行5

### c04-c05-distinction-v1
- **正文**：动态上下网功率限值属于瞬时约束；上下网日电量配额属于累计约束。
- **sourceType**: official_knowledge
- **sourceId**: 15_knowledge_base.md:行7

### h2-no-closed-loop-v1
- **正文**：Web应用只执行监督、诊断、解释、量化和建议，不直接向真实设备闭环下发控制指令。
- **sourceType**: official_knowledge
- **sourceId**: 15_knowledge_base.md:行9

## 二、数据字典条目（00_变量中文描述与数据字典.csv 分组归纳；行号=该 CSV 物理行）

### dict-pv-forecast
- **正文**：光伏预测功率 pv_forecast_kw（kW，非负）由外部预测系统提供，关联异常 C04/C05/C07。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行3

### dict-pv-available-actual
- **正文**：光伏可用功率 pv_available_kw（当前气象条件下可发功率）与光伏实际功率 pv_actual_kw（kW，均非负）关联 C04/C07。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行4-5

### dict-pv-curtailment
- **正文**：光伏限发功率 pv_curtailment_kw（kW，非负，派生）= max(0, pv_available_kw - pv_actual_kw)，关联 C04/C07。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行6

### dict-aux-load
- **正文**：制氢辅助负荷功率 aux_load_kw（kW，非负）涵盖冷却、水处理、仪表和控制等辅助用电。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行7

### dict-bess-soc
- **正文**：储能目标SOC soc_target_pct（EMS计划的目标SOC轨迹）与储能实际SOC bess_soc_pct（%，枚举范围 20~90），关联 C03/C07。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行8-9

### dict-bess-power-limits
- **正文**：储能最大可充电功率 bess_charge_power_limit_kw 与最大可放电功率 bess_discharge_power_limit_kw（kW，非负幅值，当前状态允许值），关联 C03/C04/C07。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行10-11

### dict-bess-power-cmd-actual
- **正文**：储能功率指令 bess_power_cmd_kw（EMS下发）与储能实际功率 bess_power_actual_kw（kW，正值放电、负值充电），关联 C01/C03/C04/C07；两者方向不一致是 C03 的核心观测变量组。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行12-13

### dict-bess-energy-available
- **正文**：储能剩余可充电能量 bess_available_charge_energy_kwh = 1000×(90−SOC)/100/充电效率；剩余可放电能量 bess_available_discharge_energy_kwh = 1000×(SOC−20)/100×放电效率（kWh，非负，派生），关联 C07。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行14-15

### dict-bess-reserve-target
- **正文**：储能调节备用目标 bess_regulation_reserve_target_kwh（kWh，非负）为当前计划要求保留的充电空间或放电备用能量，关联 C07。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行16

### dict-pcc-cmd-actual
- **正文**：PCC目标有功功率 pcc_power_cmd_kw（EMS对并网点目标）与PCC实际有功功率 pcc_power_actual_kw（kW，正值上网、负值下网），关联 C03/C04/C05。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行17-18

### dict-pcc-export-import-power
- **正文**：实际上网功率 grid_export_power_kw = max(0, pcc_power_actual_kw)；实际下网功率 grid_import_power_kw = max(0, −pcc_power_actual_kw)（kW，非负，派生），关联 C04/C05。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行19-20

### dict-grid-power-limits
- **正文**：上网功率上限 grid_export_power_limit_kw 与下网功率上限 grid_import_power_limit_kw（kW，非负幅值，当前有效边界）是 C04 判断的参考限值。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行21-22

### dict-grid-energy-quota
- **正文**：当日上网电量配额 grid_export_energy_quota_kwh_day 与当日下网电量配额 grid_import_energy_quota_kwh_day（kWh/day，非负，自然日允许的累计电量）是 C05 判断的配额基准。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行23-24

### dict-grid-energy-used
- **正文**：当日累计上网电量 grid_export_energy_used_kwh_day 与当日累计下网电量 grid_import_energy_used_kwh_day（kWh，非负，派生）= Σ上/下网功率×1/60，自当日 00:00 起累计，关联 C05。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行25-26

### dict-grid-energy-remaining
- **正文**：剩余上网/下网电量配额 grid_{export,import}_energy_remaining_kwh（kWh，非负，派生）= max(0, 配额 − 累计电量)，关联 C05/C07。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行27-28

### dict-pcc-power-violation
- **正文**：PCC上网功率越限量 pcc_export_power_violation_kw = max(0, pcc_power_actual_kw − 上网限值)；下网越限量 pcc_import_power_violation_kw = max(0, −pcc_power_actual_kw − 下网限值)（kW，非负，派生），关联 C04。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行29-30

### dict-grid-energy-excess
- **正文**：上网/下网电量配额超出量 grid_{export,import}_energy_quota_excess_kwh（kWh，非负，派生）= max(0, 累计电量 − 配额)，关联 C05。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行31-32

### dict-ems-elz-target
- **正文**：EMS电解槽总目标功率 ems_total_elz_target_kw（kW，非负，派生）= Σ elz{n}_power_cmd_kw（三台电解槽目标功率合计），关联 C01/C02/C06。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行33

### dict-ems-balance-error
- **正文**：EMS功率平衡误差 ems_power_balance_error_kw（kW，可正可负，派生）= 光伏+储能−PCC−电解槽−辅机，关联 C03/C04。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行34

### dict-bus-frequency
- **正文**：系统频率 bus_frequency_hz（Hz，约 50）为分钟级频率参考量。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行35

### dict-elz-availability
- **正文**：电解槽可用标志 elz{1,2,3}_available_flag（integer，枚举 0=不可用、1=可用）表示设备是否允许参与功率分配，关联 C02/C06。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行36,47,58

### dict-elz-run-state
- **正文**：电解槽运行状态 elz{1,2,3}_run_state（integer，枚举 0=停机、1=待机、2=运行、3=降额），关联 C02/C06；run_state=3（降额）是 C02 定位的关键状态。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行37,48,59

### dict-elz-capacity-sync
- **正文**：EMS报告可用容量 elz{n}_reported_available_capacity_kw（EMS当前认知）与设备实际可用容量 elz{n}_actual_available_capacity_kw（设备PLC实际提供）（kW，均非负）；两者持续偏差即 C02 的对照变量组，reported 关联 C02，actual 关联 C02/C06。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行38-39,49-50,60-61

### dict-elz-power-cmd-actual
- **正文**：电解槽功率指令 elz{n}_power_cmd_kw（EMS下发）与实际功率 elz{n}_power_actual_kw（kW，均非负），关联 C01/C02/C06；指令与实际的对照是 C01/C02 的核心观测变量组。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行40-41,51-52,62-63

### dict-elz-specific-energy
- **正文**：电解槽单位制氢电耗 elz{n}_specific_energy_kwh_per_kg（kWh/kg，非负，派生，由效率曲线插值）为当前负荷下每千克氢气所需电能，关联 C06。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行42,53,64

### dict-elz-start-stop
- **正文**：电解槽累计启动次数 elz{1,2,3}_start_stop_count（integer，次，非负整数）为模拟期内累计启动次数，关联 C06。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行43,54,65

### dict-elz-plc-heartbeat
- **正文**：电解槽PLC心跳状态 elz{1,2,3}_plc_heartbeat（integer，枚举 0=异常、1=正常）反映电解槽PLC通信状态，关联 C02。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行44,55,66

### dict-elz-run-stop-duration
- **正文**：电解槽当前连续运行时长 elz{n}_current_run_duration_min 与当前连续停机时长 elz{n}_current_stop_duration_min（integer，min，非负整数，派生），关联 C06。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行45-46,56-57,67-68

### dict-h2-production
- **正文**：总产氢速率 total_h2_production_kgph（kg/h，非负，派生）= Σ电解槽功率 / 单位电耗，根据各电解槽功率和单位电耗估算，关联 C02/C05/C06。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行69

### dict-alarm-count
- **正文**：当分钟报警数量 system_alarm_count（integer，条，非负整数，派生）是该分钟产生的报警条数，**不是异常标签**。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行70

### dict-impact-c01
- **正文**：C01 主要影响指标=储能额外调节能量 bess_extra_regulation_energy_kwh（kWh，非负，派生）= Σ|异常储能功率 − 参考基线储能功率|×1/60。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行158

### dict-impact-c02
- **正文**：C02 主要影响指标=电解槽未执行能量 unserved_elz_energy_kwh（kWh，非负，派生）= Σmax(0, 电解槽指令 − 实际功率)×1/60。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行159

### dict-impact-c03
- **正文**：C03 主要影响指标=异常电网交换电量 abnormal_grid_exchange_energy_kwh（kWh，非负，派生）= Σ|异常PCC功率 − 参考PCC功率|×1/60；该公式描述与异常方向相关的交换影响，不单独证明设备故障因果。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行160

### dict-impact-c04
- **正文**：C04 主要影响指标=PCC功率越限电量 pcc_power_limit_violation_energy_kwh（kWh，非负，派生）= Σ(上网越限量 + 下网越限量)×1/60。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行161

### dict-impact-c05
- **正文**：C05 主要影响指标=上下网电量配额偏差 grid_energy_quota_deviation_kwh（kWh，非负，派生）= max(上网配额超出量, 下网配额超出量)。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行162

### dict-impact-c06
- **正文**：C06 主要影响指标=不合理负荷分配额外耗电量 extra_energy_consumption_kwh（kWh，非负，派生）= 异常分配耗电量 − 参考高效分配耗电量。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行163

### dict-impact-c07
- **正文**：C07 主要影响指标=储能调节备用能量缺口 bess_regulation_reserve_shortfall_kwh（kWh，非负，派生）= max(0, 调节备用目标 − 实际可用备用能量)。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行164

### dict-event-label-fields
- **正文**：事件标签文件（04/05 号）字段：event_id、start_time、end_time、anomaly_code、anomaly_subtype、anomaly_name、severity、primary_control_object、affected_equipment、root_cause、expected_evidence、recommended_action、primary_impact_metric、primary_impact_metric_cn、reference_impact_value、detection_expectation。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行71-86

### dict-row-and-master-fields
- **正文**：逐行标签（06/07 号）字段=timestamp、is_anomaly、anomaly_code、anomaly_subtype、event_id；设备台账（08 号）字段=equipment_id、equipment_name、rated_capacity、control_relationship、related_tags、constraint_note；控制约束（09 号）字段=object_id、parameter、value、unit、description。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行87-102

### dict-aux-file-fields
- **正文**：效率曲线（10 号）字段=equipment_id、load_ratio、power_kw、specific_energy_kwh_per_kg；报警日志（11 号）与操作日志（12 号）、正常工况（13 号）与检修记录（14 号）、提交模板（17 号，含 requires_human_confirmation 等 16 字段）、数据质量说明（18 号）各文件字段均以字典为准。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行103-157

## 三、需求书条款条目（00_需求书.md）

### req-app-positioning
- **正文**：应用部署在现有 EMS 之上，承担智能监督、异常诊断、影响量化和运行辅助；应用不替代 EMS，不直接向真实光伏、储能、电解槽或 PCC 设备闭环下发指令。
- **sourceType**: requirement_doc
- **sourceId**: 00_需求书.md:§1

### req-competition-focus
- **正文**：比赛重点不是单点阈值报警，而是识别控制策略、设备状态、PCC 功率边界、电量配额、电解槽群控以及储能 SOC 计划之间的关联异常，并形成可审查的证据链和安全建议。
- **sourceType**: requirement_doc
- **sourceId**: 00_需求书.md:§1

### req-scenario-capacity
- **正文**：系统场景：光伏发电单元 4000 kW（EMS 可功率协调和限发）；储能 500 kW / 1000 kWh（短时功率调节与 SOC 备用管理）；碱性电解槽 3 台×1000 kW；制氢辅助负荷约 150 kW（冷却、水处理、仪表和控制）；PCC 并网点为弱并网；EMS 1 套协调光伏、储能、电解槽和 PCC，AI 应用位于 EMS 上层。
- **sourceType**: requirement_doc
- **sourceId**: 00_需求书.md:§2

### req-elz-operating-envelope
- **正文**：每台电解槽最小稳定功率 300 kW、最大 1000 kW、参考爬坡 120 kW/min；不提供健康度属性。
- **sourceType**: requirement_doc
- **sourceId**: 00_需求书.md:§2

### req-bess-soc-range
- **正文**：储能承担短时功率调节和 SOC 备用管理，SOC 正常范围 20%-90%。
- **sourceType**: requirement_doc
- **sourceId**: 00_需求书.md:§2

### req-pcc-dual-constraint
- **正文**：PCC 并网点受动态上下网功率限值和当日累计上下网电量配额双重约束。
- **sourceType**: requirement_doc
- **sourceId**: 00_需求书.md:§2

### req-direction-sign-rules
- **正文**：PCC 功率正值=向电网上网送电、负值=从电网下网购电，上网功率=max(0,PCC功率)、下网功率=max(0,−PCC功率)；储能功率正值=放电、负值=充电，PCC 与储能方向不得混用；光伏/电解槽/辅机功率非负，限值和配额字段均用非负幅值表示。
- **sourceType**: requirement_doc
- **sourceId**: 00_需求书.md:§3

### req-anomaly-catalog
- **正文**：七类异常与主控对象/主要影响指标：C01 电解槽功率指令振荡→EMS电解槽群控与功率分配模块→储能额外调节能量；C02 设备可用容量未同步→EMS设备状态与容量同步模块→电解槽未执行能量；C03 储能充放电方向异常→EMS储能功率控制与接口映射模块→异常电网交换电量；C04 PCC上下网功率边界跟踪异常→EMS并网点功率边界控制模块→PCC功率越限电量；C05 上下网电量配额执行异常→EMS周期电量配额与日内能量计划模块→上下网电量配额偏差；C06 多台电解槽负荷分配异常→EMS电解槽群控分配模块→不合理负荷分配额外耗电量；C07 储能SOC目标轨迹与调节裕度管理异常→EMS储能SOC计划与调节备用管理模块→储能调节备用能量缺口。
- **sourceType**: requirement_doc
- **sourceId**: 00_需求书.md:§4

### req-data-splits
- **正文**：数据分区：训练集 2025-01-01至2025-12-31（365 天，525,600 行，280 事件）；验证集 2026-01-01至2026-03-31（90 天，70 事件）；测试集 2026-04-01至2026-07-29（120 天，98 事件）；训练/验证标签公开（事件级和逐行），测试集事件答案和逐行标签只存在于组织方审核包。
- **sourceType**: requirement_doc
- **sourceId**: 00_需求书.md:§5

### req-multi-source-evidence
- **正文**：C01-C07 各类异常均应结合变量字典、约束文件和标签示例识别，不得仅根据单一测点或单一报警字段下结论；各异常的主控制对象见需求书 §7。
- **sourceType**: requirement_doc
- **sourceId**: 00_需求书.md:§7

### h2-recommendation-actions-v1
- **正文**：安全运行建议（T08）：给出分步骤、可验证的处理建议，说明调整对象、优先顺序、前置条件和人工确认参考；不得突破 PCC 功率/电量约束、储能 SOC 范围、设备容量、爬坡和保护联锁。
- **sourceType**: requirement_doc
- **sourceId**: 00_需求书.md:§6-T08

### req-t11-answer-discipline
- **正文**：运维助手（T11）：根据知识库和数据回答固定问题及自然语言追问，提供引用依据；回答应区分事实、计算和建议；无法确认时明确说明，不得编造测点或标准。
- **sourceType**: requirement_doc
- **sourceId**: 00_需求书.md:§6-T11

### req-t14-compliance
- **正文**：安全边界与合规（T14）：应用仅作为 EMS 上层监督、诊断和运行辅助，不直接闭环控制真实设备；任何功率、模式或参数调整建议均需标明人工确认，不得参考真实设备连接。
- **sourceType**: requirement_doc
- **sourceId**: 00_需求书.md:§6-T14

### req-dict-authority
- **正文**：Web 应用应优先使用变量字典中的中文名称、单位、正负方向、枚举和计算说明，不应在不同页面使用互相矛盾的中文名称，禁止自行改变符号口径；PCC 实际有功功率必须显示"正值上网、负值下网"，储能功率必须显示"正值放电、负值充电"。
- **sourceType**: requirement_doc
- **sourceId**: 00_需求书.md:§12

### electrolyzer-health-score-unavailable-v1
- **正文**：电解槽不提供健康度变量，不得在模型、页面或报告中自行构造健康度评分作为 C06 依据。
- **sourceType**: requirement_doc
- **sourceId**: 00_需求书.md:§12

### req-derived-metric-marking
- **正文**：派生指标应在报告中标明计算公式、时间窗、单位和基线方法。
- **sourceType**: requirement_doc
- **sourceId**: 00_需求书.md:§12

### req-alarm-not-label
- **正文**：报警日志（11 号）中正常时段也包含普通报警，部分异常报警延迟或缺失，只能作为根因证据之一，不得直接视为异常标签。
- **sourceType**: requirement_doc
- **sourceId**: 00_需求书.md:§11-文件17

## 四、答案引用知识条目（service.py 既有引用 ID 的官方素材落位）

### c01-cloud-versus-command-v1
- **正文**：C01（电解槽功率指令振荡）主控对象为 EMS 电解槽群控与功率分配模块，影响指标为储能额外调节能量；识别须结合变量字典、约束文件和标签示例（光伏/天气类证据与指令序列的时间对齐比对），不得仅根据单一测点或单一报警字段下结论。
- **sourceType**: requirement_doc
- **sourceId**: 00_需求书.md:§7-C01

### c02-capacity-synchronization-v1
- **正文**：C02 的对照变量组：EMS 报告可用容量 elz{n}_reported_available_capacity_kw（EMS 当前认知）与设备实际可用容量 elz{n}_actual_available_capacity_kw（设备 PLC 实际提供，kW 均非负），配合运行状态 run_state（3=降额）判断设备已降额而 EMS 未同步的区间。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行37-39,48-50,59-61

### c03-impact-boundary-v1
- **正文**：C03 影响量化口径：异常电网交换电量 abnormal_grid_exchange_energy_kwh = Σ|异常PCC功率 − 参考PCC功率|×1/60（kWh，非负，派生）；该公式描述与异常方向相关的交换影响，不单独证明设备故障因果。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行160

### c06-allocation-baseline-v1
- **正文**：C06 评价基线：不合理负荷分配额外耗电量 extra_energy_consumption_kwh = 异常分配耗电量 − 参考高效分配耗电量；主控对象为 EMS 电解槽群控分配模块，比较须在各机组容量、稳定运行区间（最小 300 kW/最大 1000 kW）与爬坡约束内进行。
- **sourceType**: requirement_doc
- **sourceId**: 00_需求书.md:§4-C06,§2

### c07-headroom-calculation-v1
- **正文**：SOC 调节备用双向余量计算输入：剩余可充电能量 = 1000×(90−SOC)/100/充电效率，剩余可放电能量 = 1000×(SOC−20)/100×放电效率（kWh，SOC 正常范围 20%-90%），对照调节备用目标 bess_regulation_reserve_target_kwh 判断备用缺口。
- **sourceType**: data_dictionary
- **sourceId**: 00_变量中文描述与数据字典.csv:行14-16
