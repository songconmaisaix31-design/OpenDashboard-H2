# C-P0-1 证据留痕说明

- 日期：2026-08-30
- 环境：worktree `qingneng-wt/c`，分支 `codex/p3-c`（基线 `codex/p2-integration` @ `6c15c81` + 采纳主检出浮动的 3 个 C 线样式/图表文件）
- 启动命令：`npm run h2:fixture`（全新 `npm ci` 后首启；vite ready ~1.7s，随后输出 `READY {"mode":"fixture","webUrl":"http://127.0.0.1:5173/h2-sentinel/?mode=fixture"}`）
- 模式：fixture（合成数据，UI 带 FIXTURE 标签）；analytics 侧车未启动（fixture 模式无 Python 依赖）
- 视口：1440×900（Playwright Chromium），截图 fullPage 为主
- 工具：Playwright MCP（导航/交互/截图）

## 截图清单

| 编号 | 文件 | 内容 | 对应审计行 |
|---|---|---|---|
| S1 | `01-overview-full.png` | 总览首屏：4 张 KPI 卡 + 黄金路径 + C01-C07 覆盖 + PCC/储能图 + 重要事件 | #1 |
| S2 | `02-events-filter-table.png` | 事件中心：筛选面板 7 控件 + 事件表（无排序控件） | #2 |
| S3 | `03-diagnosis-c03-evidence-chart.png` | C03 诊断页：事件窗底纹联动图 + 证据变量表 + 根因 + 影响 + 安全建议 | #2 |
| S4 | `04-reports-cards.png` | 报告页 8 张导出卡（含异常报告/PCC 合规日报） | #4 |
| S5 | `04b-reports-pcc-generated.png` | PCC 日报实测生成：文件名/哈希/来源/安全声明/预览 | #4 |
| S6 | `05-assistant.png` | 助手页：Q01-Q10 网格 + 追问输入 + 安全边界 + 引用区 | #3（呈现面） |
| S7 | `05b-assistant-q01-answer.png` | Q01 实答：三段式 + 实时数值 + 引用 + 人工确认 | #3（呈现面） |

## 交互实测记录（未截图但已执行）

1. 事件筛选：异常类型选 C03 → 计数由 2/2 变 1/2 ✅
2. 事件→诊断跳转：表格行 → 按钮落地 `#h2/diagnosis/C03-20260105-001` ✅
3. PCC 日报导出：生成 → 状态「可下载」✅
4. 助手 Q01：点击 → 回答渲染（响应耗时 0.4s，渲染器 v2）✅
5. console：仅 favicon 404，无功能错误 ✅

## 观察到的演示稳定性风险（转 C-P0-2 复核）

同一浏览器会话内、无用户操作的情况下，工作区数据集从「5,760 行 / 10 事件（C01-C07 全覆盖，01/05-01/08）」变为「22 行 / 1 分钟采样 / 2 事件（C03+C04 聚焦）」。`fixture-data-source.ts` 未发现 setInterval/rotation/random；机制未定位。对评委演示而言数据集应固定，C-P0-2 需复核并锁定演示场景。
