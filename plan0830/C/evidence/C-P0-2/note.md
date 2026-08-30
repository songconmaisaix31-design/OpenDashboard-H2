# C-P0-2 截图留痕说明（2026-08-30）

## 生成命令

- fixture 套（01-05）：`node scripts/h2-sentinel/launch.mjs --mode fixture --web-port 5199`（5173 被本机他进程占用，换 5199；`npm run h2:fixture -- --web-port` 形式会被 npm 吞参，须直调 launch.mjs）
- local 套（06-11）：`node scripts/h2-sentinel/launch.mjs --mode local --web-port 5200 --analytics-port 8765`
- 工具：Playwright MCP（browser_take_screenshot）；a11y 快照逐项核对数值（见 checklist.md）

## 视口与模式

| 截图 | 视口 | 模式 | 内容 |
|---|---|---|---|
| 01 | 1280×800 | fixture | 六要素 KPI 区整区（3 列 × 2 行） |
| 02 | 1280×800 | fixture | 总览首屏（六要素位于第一视区） |
| 03 | 1280×800 | fixture | 光伏卡下钻 → 分析页（黄金路径） |
| 04 | 1280×800 | fixture | 异常卡下钻 → 事件中心（黄金路径） |
| 05 | 390×844 | fixture | 窄视口六要素 1 列断点 |
| 06 | 1280×800 | local | local 六要素 KPI 区（tiny-valid 切片导入） |
| 07 | 1280×800 | local | local 总览首屏 |
| 08 | 1280×800 | local | local 光伏卡下钻 → 分析页 |
| 09 | 1280×800 | local | local 异常卡下钻 → 事件中心 |
| 10 | 390×844 | local | local 窄视口 1 列断点 |
| 11 | 1280×800 | local | local 配额卡特写（5,000/10,000 动态口径） |

## 数据口径记录

- fixture KPI 序列：`plugins/h2-ems/src/fixture-data-source.ts` 新增 `fixtureKpiExtension`（22 行 × 10 列）；配额 5200.0/24500.0 kWh/day 为官方 CSV 实测值（train=validation 一致，recon-note §2.2）；expUsed 按 PCC/60 递推合成。
- local 数据集：`packages/h2-contracts/fixtures/tiny-valid-timeseries.csv`（官方 163 列 22 行切片，配额 10000/used 5000）——与 fixture 值不同，证明 KPI 数值从数据集动态读取、零硬编码。
- 日期：2026-08-30；截图只证明记录时点的 UI 状态。
