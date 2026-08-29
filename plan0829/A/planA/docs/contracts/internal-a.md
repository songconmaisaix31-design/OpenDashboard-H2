# A 机内部并行契约（三 Agent 领土与接口）

> 契约版本：v1.0 ｜ 日期：2026-08-29 ｜ 变更记录：v1.0 初始版本
> ★ 与 `api.md`（A→B 跨机契约）并列的**机内法律**：三个并行 Agent 的领土与接口。变更走 `../status/change-requests.md`，只有用户能改。
> 角色模型（parallel-guide 模板 3 退化模式）：A1 主开发·规则域 ｜ A2 主开发·评估与 ML 域 ｜ A3 诊断支撑域 + 兼任评审。

## 领土划分（写权限硬边界）

| Agent | 独占可写 | 只读 | 禁改 |
|---|---|---|---|
| A1 规则域 | `services/h2-analytics/src/h2_analytics/{detection,events,safety}/**`、`service.py`（检测器编排段）、`packages/h2-vocabulary/data/detection-thresholds.json` | `validation/**`、`impact/**`、B 线全部、docs/ | A2/A3 领土、契约文件 |
| A2 评估与 ML 域 | `validation/{evaluate.mjs,normal-context-regression.mjs,lib/**,baseline/**}`、`tools/{features,train_lightgbm}.py`、`models/**`(ignored)、`MODELS_REGISTRY.md` | `detection/**`、`impact/**`、B 线全部、docs/ | A1/A3 领土、契约文件 |
| A3 诊断与支撑域 | `impact/**`、`diagnosis/**`、`evidence.py`、`packages/h2-vocabulary/data/impact-formulas.json`、`docs/reviews/**`、`docs/status/agent-a.md`（汇总） | `detection/**`、`validation/**`、B 线全部 | A1/A2 领土、契约文件 |
| 共享-增量 | `packages/h2-contracts/**`：仅 A3 可代表 A 线落笔（加法式变更 + `npm run h2:qa` + 当次公告 B 线） | — | 其余两人禁改 |

## 内部接口（冻结）

### IF-A1→A2 检测输出（事件级）
A2 的评估器进程内调用检测管线（无网络）。形状 = `packages/h2-contracts` 现有事件 schema（同 api.md IF-5 字段清单）。A1 改判据不得改事件 schema 必填字段；需加 optional 字段 → 经 A3 走 contracts 加法式变更。

### IF-A2→A1 指标命令与门禁结果
`node validation/evaluate.mjs`、`node validation/normal-context-regression.mjs` 输出 JSON（F1/FN/N01-N07 分列误报/lead_time/10min 检出率；口径 = ADR-004 + api.md IF-4）。A1 的每个 commit 以该输出为门禁证据；A2 不得未经契约变更改动指标口径。

### IF-A2→A1 模型交付（P1-9）
A2 产出：`models/<name>.lgb`（gitignored）+ `MODELS_REGISTRY.md` 条目（SHA256/参数/训练数据哈希/3 seed 方差/`detector_version` 建议值）。A1 在 `service.py` 接线时只读 registry 与模型文件；`H2_ML_ENABLED` 开关接线归 A1，登记归 A2。

### IF-A3→全体 影响口径与根因引用
四元组对账表（P0-7）与条目引用结构（P1-8）= api.md IF-1/IF-2。A1/A2 消费影响值或根因文本字段以 IF-1/IF-2 为准。

### IF-A3→用户 评审报告
每个本地合并点（M-Gate）前，A3 对待合并 diff 出一页评审报告（`docs/reviews/gate-<n>.md`）：越界检查 / 门禁证据核对 / 风险提示。

## 分支与合并节奏（机内三层嵌套）

```
feat/a1-rules ─┐
feat/a2-evalml ─┼→ 用户合并 → codex/p2-algo → 整合门 I1-I4 → codex/p2-integration（与 B 机）
feat/a3-diag  ─┘
```
- 每个本地合并点（对齐 plan.md 集成点 I1-I4 之前的 M-Gate）：A3 出评审 → 用户按 A1→A2→A3 顺序合并 → 跑 check-all + validation 五层 → 绿则推进。
- commit 规范：`[A1|A2|A3] type: 摘要 (#T编号)`。
- 冲突文件清单（已知）：无独占重叠；`detection-thresholds.json` 仅 A1、`impact-formulas.json` 仅 A3、`service.py` 仅 A1。

## 启动顺序（尺子先行，避免互锁）

1. T02（A2，误报尺子）最先——它是 A1 全部判据改动的前置门禁；
2. T03a（A1 前瞻判据）与 T03b（A2 lead_time 指标）**并行**，以 ADR-004/IF-4 为契约互不等待；
3. T04-T07（A1）、T08-T09（A2 训练跑批）、T10/T12（A3）三线并行；
4. T11（A1 接线）等 T09 交付后执行。