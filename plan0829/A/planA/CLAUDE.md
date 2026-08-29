# 项目宪法（CLAUDE.md）— planA 工作区

## 项目
- 名称：planA — T03 氢哨迭代优化 A 线执行工作区（检测算法与诊断域）
- 一句话目标：在 A 机上按 `docs/plan.md` 任务池完成 A 线 7 项任务（P0-4/P0-5/P1-1/P1-2/P1-9/P0-7/P1-8），全程门禁不回退（F1 ≥ 0.9718−0.012、N01-N07 误报不升）。

## 当前状态 ★每次阶段变更必更新
- 阶段：4 实施中（阶段 0-2 已由上游 plan0829 文档冻结并承接，阶段 3 计划已产出待执行）
- 需求：已冻结，见 `docs/requirements.md`（上游 = `../TASKS.md` + `../../01_GAP_ANALYSIS.md`；修改需用户批准）
- 架构：见 `docs/architecture.md`（上游 = `../../02_ALGO_ROBUSTNESS.md`）；决策见 `docs/decisions/`
- 契约：`docs/contracts/api.md` v1.0（A→B 跨机接口）+ `docs/contracts/internal-a.md` v1.0（机内三 Agent 领土与接口）；流程契约 = `../COORDINATION.md`
- 实施方式：**三 Agent 并行**（A1 规则域 / A2 评估ML域 / A3 诊断支撑域；Prompt 见 `prompts/parallel-agents.md`；你是唯一合并人，机内 M-Gate 合并后入 `codex/p2-algo`）；单线 fallback 见 `../agent-prompt.md`。与 B 机跨机并行整合门 D3/D6/D9/D12 见 `../COORDINATION.md`

## 规范
- 技术栈（冻结）：Python 3.11+ / FastAPI 分析服务（uv 锁定）/ pytest / Ruff / Mypy；Node 22 validation 工具（`node --test`）；LightGBM（ml extra，`H2_ML_ENABLED` 默认 false）
- 注释与文档语言：中文（代码标识符保持英文）
- 禁止事项：讨论/实现 Out of Scope 清单内功能；**任何形式使用测试集调参**；改 B 线领土文件与他人契约文件；改动 `detection-thresholds.json` 不附校准记录块；绕过门禁合并
