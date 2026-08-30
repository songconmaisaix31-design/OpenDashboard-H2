# C-P0-3 会话 1 留痕说明（2026-08-30）

> 会话 2（排序+组合）追加改动与截图见文末「会话 2 追加」节。

## 生成命令

- `npm run h2:fixture`（web=5173）；Playwright MCP 打开 `http://127.0.0.1:5173/h2-sentinel/?mode=fixture#h2/events`。

## 改动摘要（会话 1）

- `pages/events/EventsPage.tsx`：①行可选中（点击/Enter + `aria-selected` + 选中高亮）驱动页内联动曲线；②新增「联动曲线」面板——与诊断页**同源**复用 `createH2DiagnosisSeriesQuery`（事件窗查询）与 `createEventChartOption`（markArea 事件窗底纹 + 专属序列），零新增时间轴逻辑（红线 #1）；③所选事件被筛掉时如实提示、不偷换数据（红线 #3）；④筛选态改受控 props。
- `H2SentinelApp.tsx` / `H2SentinelView.tsx`：筛选态提升至 App 层（`eventFilters`）——事件页↔诊断页互跳返回不丢筛选；EventsPage 增接 `dataSource/selectedEventId/onSelectEvent`（复用全局选中事件）。
- `styles/h2-sentinel.css`：`h2-table--selectable` 行选中/键盘焦点样式 + `h2-linkage-panel` 面板样式（浅色蓝白主题）。
- `test/presentation.test.tsx`：renderView 补传新增 props（必填项）。
- `model/chart-options.ts` / `series-loader.ts`：**未改**（直接复用，诊断页既有装配）。

## 截图（会话 1）

| 编号 | 视口 | 内容 |
|---|---|---|
| 01 | 1440×900 | C03 默认选中：行高亮 + 联动面板（视口） |
| 02 | 1440×900 fullPage | C03 联动面板全页：三序列 + 事件窗底纹 + 图例 + dataZoom |
| 03 | 1440×900 | 筛选 C03 + 选中 C04：计数 1/2 + 诚实提示（诊断页返回后筛选/选中保留态） |
| 04 | 1440×900 fullPage | C04 行选中联动切换：PCC 专属序列（实际功率/送出边界 500kW 虚线/受电边界）+ 事件窗 18:32–18:40 |

## 会话 2 追加（排序+组合，2026-08-30 同日）

### 改动

- `model/presentation.ts`：新增 `H2EventSortKey/H2EventSortState/INITIAL_EVENT_SORT`（默认 startTime 降序）+ `sortH2Events` 纯函数（严重度序取自 `H2_SEVERITIES` 契约数组；同级稳定排序）。
- `pages/events/EventsPage.tsx`：计数行扩为工具行（计数 + 排序字段 select〔开始时间/严重度/置信度〕+ 升降切换按钮，aria-label 声明当前序与切换结果）；`filteredEvents = sortH2Events(filterH2Events(...))`——排序只变展示序，不改筛选结果与源数据。
- `H2SentinelApp.tsx` / `H2SentinelView.tsx` / `test/presentation.test.tsx`：`eventSort` 态提升与传递（与 eventFilters 并列）。
- `styles/h2-sentinel.css`：`h2-list-toolbar`/`h2-sort-controls` 样式。

### 截图（会话 2）

| 编号 | 视口 | 内容 |
|---|---|---|
| 05 | 1440×900 | 排序控件（开始时间 ↑ 升序）+ 表格顺序反转（C03→C04） |
| 06 | 1440×900 | 组合族：类别 C04 × 严重度 高 → 1/2，排序仍生效 |
| 07 | 1440×900 | 跳诊断返回后筛选（C04）+ 排序（置信度 ↑）双保留 |

## 门禁

- 会话 1：`npm run h2:test` 138/138 绿；typecheck 通过。
- 会话 2：`npm run h2:test` 138/138 绿；typecheck 通过（两次独立跑）。

## 事实备注

- fixture 本 run 仅 C03/C04 两事件；C01/C02/C05/C06/C07 联动序列为 `chart-options.ts` 代码级齐备（专属定义）+ 缺列降级（前 5 证据变量）路径，逐类 UI 实测待 local 切片（AUDIT#2 差距列已登记）。
- 诊断页跳转携带事件标识为既有行为（`onNavigate({route:'diagnosis', eventId})` + hash 同步），两会话验证其与筛选/排序态保持组合可用。
- 设备筛选 PCC 命中 C03+C04 两事件：C03 事件 affectedEquipment 含 PCC 设备（其证据含并网点功率），契约行为非缺陷（S5a 记录）。

