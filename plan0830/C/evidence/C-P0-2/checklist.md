# C-P0-2 手动验收清单（2026-08-30）

对照任务卡验收四条 + 审计表 #1 行。数值经 Playwright a11y 快照逐项核对（非目测）。

## 一、六要素逐项走查（fixture + local 双模式）

| 用例 | 页面 | 模式 | 操作步骤 | 预期 | 实际 | 截图编号 | 结论 |
|---|---|---|---|---|---|---|---|
| T1 光伏 | 总览 | fixture | 打开 5199 首屏 | KPI 卡：实际功率+单位 kW+预测 detail | 766 kW · 预测 1,900 kW（序列末值吻合 fixtureSeries） | 01/02 | 通过 |
| T2 储能 | 总览 | fixture | 同上 | SOC %+充放功率+目标 | 59.2 % · 230 kW（正放电 · 负充电） · 目标 55 % | 01 | 通过 |
| T3 PCC | 总览 | fixture | 同上 | 功率+边界；超限警示 | 590 kW · 上网边界 500 kW；590>500 → warning 态（如实反映瞬时越界） | 01 | 通过 |
| T4 配额 | 总览 | fixture | 同上 | 上网累计/配额+下网 | 1,053.8 / 5,200 kWh · 下网 0 / 24,500 kWh（官方实测口径，序列原生值零计算） | 01 | 通过 |
| T5 电解槽 | 总览 | fixture | 同上 | 三台合计+分台+状态 | 500 kW · ELZ01 500（运行）· ELZ02 0（待机）· ELZ03 0（待机）；台账名一致 | 01 | 通过 |
| T6 异常 | 总览 | fixture | 同上 | 事件数+高风险+待复核 | 2 个 · 高风险 2 · 待复核 2（run 契约侧） | 01 | 通过 |
| T7-T12 同六项 | 总览 | local | 导入 tiny-valid 切片后首屏 | 六要素齐备且数值随数据集变化 | 光伏 836/储能 59.2/PCC 400<500（neutral）/配额 **5,000 / 10,000**（≠fixture 5200 口径）/ELZ02·03 **停机**（run_state=0≠fixture 待机）/异常 2 → 数值数据驱动零硬编码 | 06/07/11 | 通过 |

## 二、演示黄金路径（KPI → 下钻）

| 用例 | 模式 | 操作 | 预期 | 实际 | 截图 | 结论 |
|---|---|---|---|---|---|---|
| G1 | fixture | 点光伏卡「查看趋势」 | 跳分析页 | `#h2/analysis` 落地 | 03 | 通过 |
| G2 | fixture | 点异常卡「查看事件」 | 跳事件中心 | `#h2/events` 落地 | 04 | 通过 |
| G3 | local | 同 G1 | 同 | 同 | 08 | 通过 |
| G4 | local | 同 G2 | 同 | 同 | 09 | 通过 |

## 三、响应式断点

| 用例 | 视口 | 预期 | 截图 | 结论 |
|---|---|---|---|---|
| R1 | 1280×800 | 六卡 3 列 × 2 行 | 01/06 | 通过 |
| R2 | 390×844 | 六卡 1 列、无裁切 | 05/10 | 通过 |

## 四、KPI 中文名/单位与 fields.json 对照（单源核对）

| 卡 | UI 文案/单位 | fields.json 依据 | 结论 |
|---|---|---|---|
| 光伏 | kW | `pv_actual_kw` unit=kW（光伏实际功率） | 一致 |
| 储能 | % / kW | `bess_soc_pct` unit=%；`bess_power_actual_kw` unit=kW | 一致 |
| PCC | kW | `pcc_power_actual_kw` unit=kW | 一致 |
| 配额 | kWh | `grid_export_energy_used_kwh_day` unit=kWh（当日累计上网电量） | 一致 |
| 电解槽 | kW | `elz1_power_actual_kw` unit=kW（1号电解槽实际功率） | 一致 |
| 状态文案 | 停机/待机/运行/降额 | `elz*_run_state` sign 原文「0停机，1待机，2运行，3降额」 | 一致（直读非自造） |
| 设备名 | ELZ01/ELZ02/ELZ03 | equipment.json 台账 | 一致 |

发现的不一致：无（六要素范围内零偏差；六页全量抽查归 C-P1-1）。

## 五、命令验收

- `npm run h2:check`：typecheck ✅ / `h2:test` 96/96 ✅ / assembled QA **1 项基线红**（P1-API/P1-QA：Python sidecar `assistant:ask` allowLlmRendering true/false 两态 deep-equal 失败——B 线域 service/llm_client 行为，本卡改动未触及该链路；同套 QA 中引用本卡改动的 A02/P1-W2 均 PASS）→ 已登记 TASKS.md 看板注记，待 B 线核查
- `npm run h2:fixture` 冒烟：✅（READY ~2.4s，见 note.md）

## 六、审计表与看板回填

- ACCEPTANCE_AUDIT #1 行 → 已达标（残余差距：无；呈现面 polish 归 C-P1-2 演示脚本）
- TASKS.md C-P0-2 → 已完成
