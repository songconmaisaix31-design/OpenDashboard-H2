# A 线作战手册 — 检测算法与诊断域（两人双机分工版）

> 版本：2026-08-29 ｜ 适用：`plan0829` 优化方案的**两人双机独立开发**执行 ｜ A/B 为角色代号，两人各认领一线（**持有 StepFun 订阅者建议认领 B 线**，P1-10 联调需要 key；若认领 A 线，D12-13 向 B 线临时注入 `STEPFUN_API_KEY` 环境变量配合，key 不落盘）
>
> 上游文档：总方案 `../00_README.md` ～ `../07_*.md`；本分工版为 `../05_ROADMAP.md` 的**两人执行版**——阶段门禁语义（S0-S6、gate）完全不变，重排为双线日程。

---

## §1 A 线职责定位

**域 = Python 分析侧：检测（detection/events）· 影响量化（impact）· 诊断与根因（diagnosis）· 评估工具（validation/evaluate 等）**

| 认领项 | 内容 | 档位 | 类型 |
|---|---|---|---|
| P0-4 | N01-N07 误报回归资产 | M | **核心（不可裁）** |
| P0-5 | C05/C07 提前预警语义 + lead_time 指标 | M | **核心（不可裁）** |
| P1-1 | 厯签名带过拟合（C03→C05→C06 逐类独立 commit） | L | **核心（不可裁）** |
| P1-2 | C04/C07 可执行纠偏能力判定 | M | **核心（不可裁）** |
| P1-9 | 规则 + LightGBM 混合（特征→训练→登记→接线→灰度） | L | 主线冲刺（go/no-go @ D12） |
| P0-7 | 影响量化口径复核（7 官方公式四元组） | M | 核心 |
| P1-8 | 根因数据驱动文本（操作日志条目引用） | M | 收尾（裁剪序第 4） |

不承担（B 线负责，勿动其文件）：助手全部、导入/部署/CI/提交/图表。D1 共同日两人一起完成 P0-1/P0-2 与共享文件预置。

**工作量预算**：核心 10.5 人日 + 冲刺 3.5 人日 ≈ 14 人日；D2-D13 共 12 个工作日 → **P1-9 若 D12 go/no-go 未过灰度五条，按裁剪顺序保持关闭**，不影响其余交付。

## §2 A 线 14 天日程

| 日 | 内容 | 产出/门禁 |
|---|---|---|
| **D1（与 B 共同，同机）** | P0-1 基线冻结 + P0-2 CI 补全 + **共享文件预置**（`settings.py` 双条目占位）+ 切分支 `codex/p2-algo` + 过文件所有权矩阵 | tag `p2-base`；gate-s0 |
| D2-D3 | P0-4：normal-context-regression.mjs，N02-N07 分列误报率并冻结基线 | gate A-1；**D3 晚整合门 I1（B 轮值）** |
| D4-D5 | P0-5：前瞻判据 + lead_time_minutes 入 evaluate.mjs | gate A-2 |
| D5-D7 | P1-1：去签名带，**C03、C05、C06 三个独立 commit**，每个附四项指标对照 | gate A-3；**D6 晚整合门 I2（A 轮值）** |
| D7-D8 | P1-2：可执行性判定矩阵（三分支单测） | gate A-4 |
| D8-D11 | P1-9：特征工程 → 训练+登记（跑批与 P0-7 并行）→ 接线+灰度验证 | **D9 晚整合门 I3（B 轮值）** |
| D10-D11（穿插） | P0-7：7 条公式四元组 | gate A-5 |
| D12 | P1-8 根因数据驱动；**P1-9 go/no-go**；**晚整合门 I4（A 轮值）** | gate A-6 |
| D13 | 缓冲：修整合问题；补全校准记录块；向 B 提供 Q03/Q09 所需字段确认 | — |
| **D14（与 B 共同，同机）** | S6 联合冻结：clean commit 重生成证据；submission 定稿；联排演示 | tag `gate-s6` |

## §3 任务看板

| 项 | 状态 | 门禁 | 证据 |
|---|---|---|---|
| P0-4 | 未开始 | A-1：N02-N07 分列误报率产出并冻结 | — |
| P0-5 | 未开始 | A-2：C05/C07 lead_time>0 可测；其余 5 类 10 分钟检出率 100% | — |
| P1-1 | 未开始 | A-3：F1 降幅≤0.012、FN≤1、误报不升、哨兵绿 | — |
| P1-2 | 未开始 | A-4：三分支单测；C04/C07 FP 降 TP 不降 | — |
| P1-9 | 未开始 | 灰度五条 → D12 go/no-go | — |
| P0-7 | 未开始 | A-5：7/7 四元组 + 验证集对账表 | — |
| P1-8 | 未开始 | A-6：根因引用可回溯条目 ID | — |

## §4 每日纪律

1. 每天收工 push `origin/codex/p2-algo`；2. 算法改动三件套；3. 改动前必跑哨兵与误报回归；4. 只写 COORDINATION §2 名下文件；5. 口径疑问登记 `../07` 号文档；6. 红线不松动（不用测试集调参/不用 system_alarm_count 入模/不构造健康度/ML 命中带 top-5 特征）。

## §5 详细任务卡

见本目录 `TASKS.md`。

## §6 执行工作区 planA（liu-new-project 产出）

本线执行细节已按 `/liu-new-project` 五阶段工作流落盘为**冷启动工作区** `planA/`（阶段 0-2 承接上游、阶段 3 实施计划、阶段 4 启动脚手架）：

- `planA/CLAUDE.md` — 项目宪法与当前状态（冷启动锚点）
- `planA/docs/plan.md` — 任务池 T01-T14（已标 [A1]/[A2]/[A3] 并行归属）
- `planA/docs/contracts/api.md` v1.0 + **`internal-a.md` v1.0**（机内三 Agent 领土契约）
- `planA/docs/decisions/` — ADR-001..004
- `planA/docs/status/` — agent-a.md（汇总）+ agent-a1/a2/a3.md + change-requests.md
- `planA/prompts/parallel-agents.md` — **三 Agent 并行 Prompt（默认模式）**
- `planA/agent-prompt.md` — 单线 fallback Prompt

**A 机实施会话入口**：粘贴 `planA/prompts/parallel-agents.md` 对应 A1/A2/A3 代码块（并行，推荐）或 `planA/agent-prompt.md` 首代码块（单线 fallback）。