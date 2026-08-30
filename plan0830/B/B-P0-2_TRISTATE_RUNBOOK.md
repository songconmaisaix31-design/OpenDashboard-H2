# B-P0-2 ｜ LLM 三态启用/降级策略 — Runbook 与跨线交付物

> 版本：2026-08-30 ｜ 分支 `codex/p3-b` ｜ 服务：验收-T14（外部 API 声明+离线降级）、验收-T11（现场可用性）
> 实测留痕：`evidence/b_p0_2_tristate_20260830_0907*.log`（三态全绿轮）｜驱动脚本：`evidence/b_p0_2_tristate_demo.py`（可复现）

---

## §1 三态定义（全部既有语义，零新造状态机）

| 态 | env 配置 | 响应特征（`provenance`） | 语义 |
|---|---|---|---|
| **禁用**（默认） | `H2_LLM_ENABLED` ≠ 字面 `"true"` | `mode=DETERMINISTIC_TEMPLATE`，`rendererVersion=deterministic-assistant-p1-v1` | 零 LLM 调用、零网络依赖；评分不依赖云端 |
| **云端** | `"true"` + `STEPFUN_API_KEY` + `H2_LLM_MODEL`（验证值 `step-3.7-flash`） | `mode=LLM_RENDERED`，`rendererVersion=stepfun-compatible-renderer-v2`（无后缀） | 仅语言润色；事实/数字/引用三重子集校验 |
| **降级** | 云端态下 `timeout`/`provider_unavailable`/`invalid_output` 任一 | `mode=DETERMINISTIC_TEMPLATE`，`rendererVersion=stepfun-compatible-renderer-v2:<原因>`，`limitations` 追加 `LLM rendering fallback: <原因>.` | 自动回确定性答案，用户无感知中断 |

fail-closed 不变：`"true"` 缺 key/model → `RuntimeError`（非降级）；`H2_LLM_BASE_URL` 覆盖为非官方端点 → `policy_disabled` 零网络调用（4 仿冒负例测试恒绿）。

## §2 切换操作规程（30s 内实测 1.5-2.8s）

```powershell
# 态1→态2（禁用→云端）：设三件 env 后重启 analytics sidecar
$env:H2_LLM_ENABLED="true"; $env:STEPFUN_API_KEY="<key>"; $env:H2_LLM_MODEL="step-3.7-flash"
# 重启方式：停掉 analytics 进程（start-h2-sentinel.bat 或 npm run h2:fixture 重开）
curl http://127.0.0.1:8765/health    # 探活：data.status == "healthy" 即切换完成
# 态2→态3（降级演示）：改用无效 key（或现场断网）重启，重放同一问
$env:STEPFUN_API_KEY="invalid-key-for-degradation-demo"   # → 401 → provider_unavailable
# 回态1：Remove-Item Env:H2_LLM_ENABLED 后重启
```

**实测结果（2026-08-30 09:07 轮，worktree b）**：

| 态 | 切换耗时（重启+探活） | 端到端（含重建 run+两问） | 观测 |
|---|---|---|---|
| 态1 禁用 | 1.6s | 1.6s | 双 allowLlmRendering 均 DETERMINISTIC_TEMPLATE |
| 态2 云端 | 1.5s | 10.0s（含 LLM 真调用） | `LLM_RENDERED`，v2 无后缀 |
| 态3 降级 | 1.5s | 2.6s | `v2:provider_unavailable`，limitations 注入 fallback 行 |

计时口径：切换=进程停止→`/health` 探活成功；端到端=切换起→`assistant:ask` 返回（run 为进程内存态，重启须重建 import+analyze，已计入端到端）。**结论：env+重启切换远低于 30s 门限，无需 api 层热切换**（不为优雅过度设计）。

**复现**：worktree b 根目录 `py plan0830/B/evidence/b_p0_2_tristate_demo.py`（须先 `uv sync --locked --extra dev`）。

## §3 IF-6 交付：降级提示信号字段说明（B→C，助手页渲染）

C 线从 `assistant:ask` 响应（`data` 内）读取以下字段渲染三态提示：

| 字段 | 取值 | UI 建议 |
|---|---|---|
| `provenance.mode` | `LLM_RENDERED` / `DETERMINISTIC_TEMPLATE` | 前者标"云端润色已启用"，后者不标或标"本地确定性答案" |
| `provenance.rendererVersion` | 精确格式：`stepfun-compatible-renderer-v2` 或 `stepfun-compatible-renderer-v2:<原因>` | **含 `:` 后缀 = 降级**，建议黄条提示"云端润色暂不可用（原因），已自动使用本地答案"；无后缀=云端正常 |
| `provenance.limitations`（数组） | 降级时自动追加 `LLM rendering fallback: <reason>.` | 可直接展示该行作为降级人话说明 |
| `refusedControlClaim` | 恒 `true` | 安全边界标识（两态一致，不随降级变化） |

降级判定式（C 线实现建议）：`mode === "DETERMINISTIC_TEMPLATE" && rendererVersion.includes(":")`。

## §4 IF-6 交付：双路径演示段（B→D，演示脚本嵌入）

> 背景：企业 Q7（现场网络条件）未答复 → 演示必含云端+降级各一段，证明评分不依赖网络。

**段落 A（云端段，约 1 分钟）**：设三件 env 启动 → 问 Q08（勾选"允许云端润色"）→ 指出 UI 标识"云端润色已启用"→ 讲解词："答案事实与数值全部来自本地确定性引擎，云端仅做语言润色，且经数字、引用、控制词三重子集校验，任何越权输出会被整体弃用。"

**段落 B（降级段，约 1 分钟）**：切换无效 key（或拔网线）重启（实测 <3s）→ **重放同一问 Q08** → 指出 UI 黄条"云端润色暂不可用，已自动使用本地答案"→ 讲解词："现场网络不可知。即使完全断网，助手仍以本地确定性答案作答，三段式、引用与人工确认边界完整保留——评分不依赖云端。"

**实测观测（真实素材，可入讲稿）**：2026-08-30 09:01-09:07 轮实测中，本机对 `api.stepfun.com` 出现间歇抖动（09:01 成功 → 09:04 provider_unavailable 自动降级 → 09:07 恢复 LLM_RENDERED），全程答案不中断——降级机制非纸面设计，已被网络波动实测验证。

## §5 env 矩阵核对结论（CONTRACTS §4 补录建议，经整合窗）

逐行核对 `CONTRACTS.md` §4 v1 与代码（`settings.py`/`llm_client.py`）：既有 6 行**全部一致**，无错漏。建议整合窗补录 2 行：

| 变量 | 用途 | 默认 | 约束 |
|---|---|---|---|
| `H2_LLM_TIMEOUT_SECONDS` | LLM 调用超时 | `10.0`（秒，重试 2 次） | 仅运维调参，演示不动 |
| `H2_LLM_BASE_URL` 覆盖语义 | 端点守卫 | 仅接受 step_plan 官方 URL 字面相等 | 覆盖为任何其他值 → `policy_disabled` 零网络调用（4 仿冒负例测试） |

## §6 本卡代码变更（1 处，B 线独占文件）

`assistant/llm_client.py` 系统提示强化：实测发现模型润色会改写掉"证据"一词，触发 `_valid_output` 第 4 条（必含"人工"+"证据/限制"）`invalid_output` 整体弃用 → 云端态恒降级。修复=提示中显式要求原样保留该表述。**校验逻辑零改动**（fail-closed 语义不变，87 测试绿含全部渲染负例）。

## §7 使用说明.md 助手节文稿（change-request → D 线落笔）

> 以下为建议文稿，`使用说明.md` 属 D 线独占（CONTRACTS §1），按 §7 流程交 D 线合入。

```markdown
## 运维助手与云端润色（可选）

助手默认完全本地运行（不联网也能回答全部十个问题）。
如需启用 StepFun 云端语言润色：启动前设置环境变量
H2_LLM_ENABLED=true、STEPFUN_API_KEY=<密钥>、H2_LLM_MODEL=step-3.7-flash。
云端仅润色文字，不改变任何事实、数值与引用；网络不可用时自动回退本地答案，
页面会显示"云端润色暂不可用"提示，无需任何手工干预。
切换约需重启分析服务（实测数秒内完成）。
```
