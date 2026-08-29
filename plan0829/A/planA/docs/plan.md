# 实施计划（阶段 3 产出）— A 线检测算法与诊断域

> 状态：执行中 ｜ 任务状态由执行方更新，结构由用户维护
> 规则：每完成一个任务把 ☐ 改为 ✓ 并附一句话；一个 agent 会话只做一个任务
> 对齐：`../README.md` 14 天日程 ｜ 协作契约 `../COORDINATION.md` ｜ **机内并行契约 `docs/contracts/internal-a.md`（v1.0）**
> 双模式：默认**三 Agent 并行**（A1 规则域 / A2 评估ML域 / A3 诊断支撑域，Prompt 见 `prompts/parallel-agents.md`）；单线 fallback 见 `../agent-prompt.md`。两模式共享本任务池。

## 里程碑

| 里程碑 | 内容 | 验收标准 | 状态 |
|---|---|---|---|
| M1 基线与守门资产 | D1 共同日 + T02 | tag `p2-base`；N01-N07 分列误报率冻结 | ☐ |
| M2 提前预警与判据稳健化 | T03-T07 | lead_time 可测；去签名带后四重门禁全绿 | ☐ |
| M3 ML 灰度与口径复核 | T08-T11 + T10 | 灰度五条 go/no-go；7/7 四元组 | ☐ |
| M4 收尾与联合冻结 | T12-T14 | 根因可回溯；clean SHA 证据重生成 | ☐ |

## 任务池（归属 [A1]规则域 / [A2]评估ML域 / [A3]诊断支撑+评审 / [ALL]=D1 共同日）

| 任务号 | 归属 | 任务 | 依赖 | 验收标准 | 状态 |
|---|---|---|---|---|---|
| T01 | [ALL] | D1 共同日：基线 JSON 确认 + `settings.py` 预置确认 + 分支切割（`codex/p2-algo` + 机内 `feat/a1-rules`/`feat/a2-evalml`/`feat/a3-diag`） | - | tag `p2-base`；三分支存在 | ☐ |
| T02 | [A2] | P0-4：`validation/normal-context-regression.mjs` + 分列误报率 + 基线冻结 + 接入 check-all | T01 | A-1 门禁（`../../TASKS.md`） | ✓ A2 完成：基线全零误报（77 窗口 0 FP @h2-rules-v2），check 门禁正/负双向验证过；check-all 接入登记 change-requests 待裁决，feat/a2-evalml @ 21a5029 |
| T03a | [A1] | P0-5 判据侧：`detection/rules.py` C05/C07 前瞻判据（消耗速率/备用差值外推） | T02 | N05/N07 不误报；判据三要素入校准块 | ✓ A1 完成：前瞻兜底路径+确认行 1→3，N05/N07 22/22 零候选，feat/a1-rules @ bf4277e |
| T03b | [A2] | P0-5 指标侧：`evaluate.mjs` 新增 `lead_time_minutes` 与 10 分钟检出率 | T02 | A-2 门禁指标可产出（口径=ADR-004/IF-4） | ✓ A2 完成：报告 schema v3 + detectionExpectation 节，哨兵 canonical 防篡改同步；实测（A2 分支 v4 检测器）C05 lead=3min>0 / C07=0 待合 A1-T03a、5 类检出率 0.76 待 T04-T07；契约测试 83/83，feat/a2-evalml @ d53a939 |
| T04-T06 | [A1] | P1-1 三连：C03 → C05 → C06 去签名带（逐类独立 commit） | T03a+b | 每类四重门禁绿 + TRAIN 40 全命中 | ✓ A1 三连完成：C03 相对带+平台+因果门 @ 52d7435；C05 相对带+quota 排他+run 锚定 @ 9155fd3；C06 SS 相对容量带+可避免门、INEFF 滑窗份额带+锚定+ELZ3 结构门+效率门保留，新旧管线 TRAIN 输出 byte-equal @ 6960ff3 |
| T07 | [A1] | P1-2：C04/C07 可执行性判定矩阵（三分支单测） | T03a | A-4 门禁 | ✓ A1 完成：execurability.py 三分支（充足/顶格降档/缺数据降观察）+ 方向化纠偏通道，TRAIN byte-equal、三分支单测绿，feat/a1-rules @ bae530e |
| T08 | [A2] | P1-9a：特征工程 `tools/features.py` | T04 | 特征覆盖清单 + 单测 | ✓ A2 完成：六族 69 特征（全因果窗防泄漏，docstring 清单+--catalog），纯标准库，单测 23/23 + 真实数据冒烟过；tools/tests/ 目录为领土字面扩展已备案，feat/a2-evalml @ 652696a |
| T09 | [A2] | P1-9b：训练 + 3 seed + MODELS_REGISTRY 登记 | T08 | 训练报告落盘 | ✓ A2 完成：h2-lgbm-row-v1 三模型（validation macro-F1 3×1.0，rolling 首折 0.8）+ Registry 五要素登记 + 1.0 成因消融在案；tools/tests 39/39；T11 依赖解除，feat/a2-evalml @ 4b3ea51 |
| T10 | [A3] | P0-7：影响量化 7/7 四元组 + 验证集对账表 | T04（宜后） | A-5 门禁 | ✓ A3 完成：TRAIN 280/280 + VALIDATION 70/70 对账全绿，C01/C02 修订 v2，feat/a3-diag @ c05d419 |
| T11 | [A1] | P1-9c：`service.py` 接线 + 灰度验证 + IF-3 口径交付 B | T09, T10 | 灰度五条全绿 → D12 go/no-go | ☐ |
| T12 | [A3] | P1-8：根因数据驱动文本 + IF-2 冻结 | T10 | A-6 门禁 | ✓ A3 完成：五模式归因+引用回溯断言全过，基线 TRAIN 17.9%/VAL 15.7%（数据上限），feat/a3-diag @ e3f62e7 |
| T13 | [A3] | 每个 M-Gate 出评审报告 `docs/reviews/gate-<n>.md` + 校准记录块补全督促 | T02 起 | 报告与门禁证据齐备 | ½ gate-1 已出具：🟢 放行（A1→A2→A3），独立复跑+合并预演全绿，风险 5 项见 docs/reviews/gate-1.md |
| T14 | [ALL] | D14 联合冻结：clean commit 重生成全部 ignored 证据 | T01-T13 | tag `gate-s6`；证据包归档 | ☐ |

## 集成点计划（机内 M-Gate → 跨机整合门）

| 集成点 | 日期 | 机内流程（M-Gate，先做） | 跨机整合门 |
|---|---|---|---|
| I1 | D3 | A3 评审 → 用户合并三分支入 `codex/p2-algo` → check-all 绿 | 轮值整合人 B 合入 integration |
| I2 | D6 | 同上（A: T03-T04） | 轮值整合人 A |
| I3 | D9 | 同上（A: T05-T07、T08-T09 中间态） | 轮值整合人 B |
| I4 | D12 | 同上（A: T10-T12 + go/no-go） | 轮值整合人 A |
| S6 | D14 | 全线收尾 | 两人同机；证据重生成；tag `gate-s6` |

## 每日纪律（承自 `../README.md` §4）

1. 收工 push `origin/codex/p2-algo`（机内分支本地留存，合并后才入远端）；2. 算法改动三件套；3. 改动前必跑哨兵与误报回归；4. 只写自己领土文件；5. 口径疑问登记 `../../../07_APPENDIX_ENTERPRISE_QUESTIONS.md`；6. 红线不松动。