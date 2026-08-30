# CONTRACTS · plan0830 跨线契约（全员必读）

> 本文件是四线并行的**唯一接口事实源**：文件所有权、跨线数据结构、环境变量、开关三态、变更请求流程。
> 修改本文件 = 高危操作：仅整合人在整合窗可改，改动须在整合 commit 信息中公告。
> 配套：`COORDINATION.md`（时间线/分支/整合窗）、各线 README（白名单细则）。

---

## §1 文件所有权矩阵

**独占写**（仅该线可改；他线需求走 §7 变更请求）：

| 所有者 | 独占路径 |
|---|---|
| A 线 | `services/h2-analytics/src/h2_analytics/detection/**`、`events/**`、`impact/**`、`diagnosis/**`、`evidence.py`；`tools/features.py`、`tools/train_lightgbm.py`、`tools/calibrate_*.py`；`validation/evaluate.mjs`、`validation/normal-context-regression.mjs`、`validation/overfit-sentinel.mjs`、`validation/lib/**`、`validation/baseline/**`；`packages/h2-vocabulary/data/{detection-thresholds,anomaly-taxonomy,impact-formulas,efficiency-curves}.json`；`models/**`(ignored)、`MODELS_REGISTRY.md`；`plan0830/A/**` |
| B 线 | `services/h2-analytics/src/h2_analytics/assistant/**`、`settings.py`、`service.py`、`api/**`；`services/h2-analytics/tests/test_assistant_*.py`；`packages/h2-vocabulary/data/{knowledge-base.md,assistant-questions.json}`；`plan0830/B/**` |
| C 线 | `apps/web/src/features/h2-sentinel/**`；`plugins/h2-ems/src/**`；`services/h2-analytics/src/h2_analytics/reports/renderer.py`；`submission/h2-sentinel/` 内演示物料（DEMO_SCRIPT、JUDGE_CHECKLIST、TEN_PAGE_*、LEIDONG_*、SCREENSHOT*）；`plan0830/C/**` |
| D 线 | `scripts/h2-sentinel/**`、`start-h2-sentinel.*`、`.github/workflows/ci.yml`；`validation/{check-submission,offline-deploy-smoke,run-demo}.mjs`；`services/h2-analytics/src/h2_analytics/{quality,ingestion}/**`、`reports/submission.py`；`submission/h2-sentinel/` 内运维文档（OPERATOR_RUNBOOK、HANDOFF、RUNTIME_EVIDENCE_CHECKLIST、LICENSE、README）；`使用说明.md`；`plan0830/D/**` |

**冻结只读**（任何线不得直接改；变更须整合窗 + 全线周知 + `npm run h2:qa` + 版本递增）：
`packages/contracts/**`、`packages/h2-contracts/**`、`packages/plugin-runtime/**`；`packages/h2-vocabulary/data/{fields,equipment,constraints,submission-equipment-tokens,deprecated-field-map,version}.json`；`plan0830/` 顶层四文档（00_README/CONTRACTS/COORDINATION/RISK）。

**共享工件**（指定持笔人，全员可读）：
`plan0830/C/ACCEPTANCE_AUDIT.md`（C 持笔）｜`plan0830/D/ENTERPRISE_OUTREACH.md`（D 持笔）｜`submission/h2-sentinel/CLAIMS_LEDGER.md`（D 主笔，A/B/C 贡献本线声明条目）。

## §2 submission.csv 16 字段生产者矩阵（验收-T12）

字段清单（与 `17_submission_template.csv` 表头一致）：`pred_event_id, start_time, end_time, anomaly_code, anomaly_subtype, severity, primary_control_object, affected_equipment, confidence, evidence_json, root_cause, recommended_action, primary_impact_metric, estimated_impact_value, first_detection_time, requires_human_confirmation`

| 字段组 | 生产者 | 来源约束 |
|---|---|---|
| pred_event_id / start_time / end_time / first_detection_time | A（检测+聚合） | 时效硬指标：非 C05/C07 ≤10min；C05/C07 预警 |
| anomaly_code / anomaly_subtype / severity | A（A-P0-3 确定性映射） | severity=C 码唯一映射（C01/C06=中，余=高）；子类全表见 A/TASKS |
| primary_control_object / affected_equipment | A（A-P1-4 收窄） | 设备 token 与 `submission-equipment-tokens.json` 一致 |
| confidence / evidence_json / root_cause | A（A-P0-1 remark 入链） | evidence_json 至少含时间/变量/实际值/参考值或限值 |
| recommended_action / requires_human_confirmation | A 生成 + B 口径复核 | 建议必带人工确认=TRUE |
| primary_impact_metric / estimated_impact_value | A（A-P1-2 对账） | 单位 kWh、时间窗与基线方法可复现 |
| 导出与 checker | D（D-P0-2） | 易漏四字段硬门禁：confidence/evidence_json/first_detection_time/requires_human_confirmation |

## §3 助手响应契约（验收-T11，B 线持有，C 线消费渲染）

固定问题答案（Q01-Q10）与追问回答的统一结构：
1. **三段式显式**：`事实`（来自数据/字典/约束，带引用）→ `计算`（实时数值与公式）→ `建议`（带人工确认标记）；无法确认时明确说明，不编造。
2. **引用**：`citation_ids ⊆` 知识语料/字典/约束/事件 ID 集合；渲染层（C 线）须把引用显示为可点击来源。
3. **安全边界**：任何含控制动作的建议必须带 `requires_human_confirmation`；`_UNSAFE_CONTROL` 措辞校验（子集校验，见 B/TASKS B-P0-1）。
4. **三态**：云端（step_plan 端点）/本地降级/禁用——降级时 UI 必须可见提示（C 线渲染该状态）。

## §4 环境变量矩阵（B 线持有 settings.py；D 线写启动脚本与文档）

| 变量 | 用途 | 默认 | 约束 |
|---|---|---|---|
| `H2_ML_ENABLED` | ML 校验层开关 | `false` | 字面 `"true"` 才启用；A-P2-1 决策后由 D-P2-1 冻结终值 |
| `H2_LLM_ENABLED` | StepFun LLM 层开关 | `false` | 字面 `"true"` 才启用 |
| `STEPFUN_API_KEY` | 云端鉴权 | 未注入 | 与 `H2_LLM_MODEL` 在 LLM 启用时必填，否则 fail-closed 报错 |
| `H2_LLM_MODEL` | 模型名 | 未设置 | 同上 |
| `H2_LLM_BASE_URL` | 端点覆盖 | Pro Plan 专属端点 | 非官方端点拒绝渲染（llm_client.py 端点守卫） |
| `H2_LLM_RENDERER_VERSION` | 渲染器版本 | v2 | 仅 B 线随版本递增改 |
| 流式导入开关 | 237MB 分块会话导入 | off | plan0829 P1-6 既有；终值随 D-P2-1 冻结 |

## §5 数据纪律（382MB 官方数据）

1. 官方数据目录：`D:\allcode\h2-t01-official\dataandfiles`（20 文件，382MB）——**不进 git**；各 worktree 以绝对路径引用。
2. 三个时序 CSV（01/02/03 号，226MB/56MB/74MB）**禁止整读入 AI 会话上下文**——仅经脚本/工具采样（head、行数统计、切片）。
3. 小文件可整读：11 报警日志、12 操作日志、13 正常工况、14 检修、15 知识库、16 问题、17 模板、18 质量说明、19 manifest、00 字典、04/05 事件标签。
4. 时间格式：`YYYY-MM-DD HH:MM`（分钟级，三分区连续）；标签分区见 00_README §2。

## §6 跨线接口（IF 清单）

| # | 接口 | 供给方 | 消费方 | 时点 |
|---|---|---|---|---|
| IF-1 | A-P0-3 severity/子类映射表（C 码→severity/子类） | A | D-P0-2（submission 导出消费） | G1 前 |
| IF-2 | 操作日志 remark 证据条目格式（evidence_json 新增 optional 字段） | A（A-P0-1） | B（根因联动答案）、C（诊断页渲染） | G1 前 |
| IF-3 | 时效报告口径（lead_time 定义与检出率计算） | A（A-P1-1） | C（演示讲稿/物料）、D（CLAIMS_LEDGER） | G1 |
| IF-4 | 影响值对账表 v2（中位数/P90） | A（A-P1-2） | D（外联 Q5 口径）、C（物料） | G2 |
| IF-5 | ML go/no-go 决策记录 | A（A-P2-1） | D（D-P2-1 默认值冻结） | D12 前 |
| IF-6 | LLM 三态切换与降级提示信号 | B（B-P0-2） | C（助手页渲染）、D（演示脚本双路径段） | G1 |
| IF-7 | 知识语料结构（条目 schema 与出处字段） | B（B-P1-1） | C（引用渲染） | G2 |
| IF-8 | 质量检查结论结构（枚举/单位/跨文件） | D（D-P1-2） | C（分析页展示） | G2 |
| IF-9 | 18 分审计表行状态 | C（ACCEPTANCE_AUDIT） | 全员（G1/G2 检查点） | 滚动 |

## §7 变更请求流程（改不属于自己的东西的唯一合法路径）

1. 在目标文件所有者线的 TASKS.md 看板下追加 `change-request` 行（发起线/文件/诉求/理由）。
2. 所有者线在下一会话处理：接受→排任务卡并回注；拒绝→给出替代方案。
3. 紧急冲突（阻塞本线 P0）：在整合窗由整合人裁决，裁决记录写整合 commit 信息。
4. 冻结只读文件的任何变更：额外须全线周知 + `npm run h2:qa` 绿 + 版本递增，仅整合窗执行。

## §8 D0 核对清单（建 worktree 后、四开前，逐项打勾）

- [ ] B-P0-1 已提交：`git log` 可见 4 个 StepFun 文件（settings.py/llm_client.py/service.py/test_assistant_nlu_rendering.py）的干净 commit，`git status` 干净（test.md 归置属 D-P1-4，D0 允许暂留）
- [ ] assistant pytest 绿；`node scripts/h2-sentinel/check-all.mjs` 全绿
- [ ] plan0830/ 文档已提交，tag `p3-base` 已打
- [ ] 4 个 worktree 就绪：`D:\allcode\qingneng-wt\{a,b,c,d}` → `codex/p3-{a,b,c,d}`
- [ ] 各 worktree：`npm ci` 成功；`cd services/h2-analytics && uv sync --locked --extra dev` 成功
- [ ] 各 worktree 冒烟：`npm run h2:fixture` 能起（web 5173；`--web-port/--analytics-port` 可覆盖）
- [ ] 官方数据绝对路径在每个 worktree 可达：`D:\allcode\h2-t01-official\dataandfiles`
- [ ] 环境变量现状确认：三开关默认 off；StepFun key 不注入也能全流程运行（降级路径可用）
- [ ] `start-h2-sentinel.bat` 带参验证：必须 `--mode fixture|local`，双击报错属已知行为
- [ ] 各线首任务已从自线 TASKS.md 指认（A=A-P0-1；B=B-P0-2〔B-P0-1 已在 D0 完成〕；C=C-P0-1；D=D-P0-1）

---

*契约版本：v1（2026-08-30 定稿）。本文件与 00_README/COORDINATION/RISK 同为 plan0830 顶层冻结文档。*
