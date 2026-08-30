# COORDINATION · plan0830 时间线与整合机制（全员必读）

> 四线并行（/liu-new-project 四开）的节奏、分支、整合窗与高危文件协议。
> 配套：`00_README.md`（总览/追溯矩阵）、`CONTRACTS.md`（所有权/接口）、各线 README（日程细则）。

---

## §1 里程碑时间线（14 天两轮，D0=启动日）

```
D0  ─ G0 启动：B-P0-1 提交 4 文件 → plan0830 文档入库 → tag p3-base → 切 4 worktree → D0 核对清单
R1（D1-D7 功能轮）
  D1        各线首任务开工；D 线 D-P1-4（gate-7 追认+仓库卫生）
  D3 晚     整合窗 I1（轮值：A）
  D5 晚     整合窗 I2（轮值：B）
  D7 ─ G1 门禁：全 P0 完成；整合分支全门禁绿；ACCEPTANCE_AUDIT 全行结论；差距转 R2 或明示放弃
R2（D8-D13 打磨轮）
  D9 晚     整合窗 I3（轮值：C）
  D11 晚    整合窗 I4（轮值：D）
  D12       A-P2-1 ML 决策 + D-P2-1 三开关终值冻结
  D13 晚    整合窗 I5（轮值：A）
D14 ─ G2 冻结：P1 完成或裁剪明示；换机演练终值复跑；submission 样例导出；物料 3 件 v1；
             merge main + tag gate-p3；clean commit 后重生成全部 ignored 证据
```

**门禁定义**：
- **G0**：`CONTRACTS.md` §8 D0 核对清单全勾。
- **G1**：①四线 P0 全部完成（看板就地可查）；②`codex/p3-integration` 跑 `node scripts/h2-sentinel/check-all.mjs` 全绿（含 evaluate、误报尺子、哨兵、check-submission、doctor、run-demo 双次 <180s）；③`C/ACCEPTANCE_AUDIT.md` 五行全有结论；④未完成项全部转入 R2 任务或书面裁剪。
- **G2**：①P1 完成或按裁剪序明示放弃；②换机演练用**最终配置**（含三开关终值）复跑一次；③test 分区 submission 样例导出入库；④企业价值物料 3 件 v1；⑤merge main + tag `gate-p3`；⑥SHA 证据在 clean commit 上重生成。

## §2 worktree 物理布局与分支模型

```
D:\allcode\qingneng              主检出 = 整合人（分支 codex/p3-integration，只在整合窗推进）
D:\allcode\qingneng-wt\a         A 线工作区（分支 codex/p3-a）
D:\allcode\qingneng-wt\b         B 线工作区（分支 codex/p3-b）
D:\allcode\qingneng-wt\c         C 线工作区（分支 codex/p3-c）
D:\allcode\qingneng-wt\d         D 线工作区（分支 codex/p3-d）
```

建 worktree 命令（主检出执行，D0）：
```
git tag p3-base
git worktree add D:\allcode\qingneng-wt\a -b codex/p3-a p3-base
git worktree add D:\allcode\qingneng-wt\b -b codex/p3-b p3-base
git worktree add D:\allcode\qingneng-wt\c -b codex/p3-c p3-base
git worktree add D:\allcode\qingneng-wt\d -b codex/p3-d p3-base
```

纪律：
1. 各线只在**自己的 worktree** 工作、只 push 自己的分支；禁止 push 他线分支、禁止在主检出开发。
2. 每天**收工前 push**（含看板更新）；整合失败不清空重写，走 rebase。
3. `382MB` 官方数据不进 git，worktree 内以绝对路径 `D:\allcode\h2-t01-official\dataandfiles` 引用。
4. 各 worktree 首次：`npm ci` + `cd services/h2-analytics && uv sync --locked --extra dev`（ML 相关线可加 `--extra ml`）。

## §3 整合窗流程（I1-I5）

1. **触发时点**：D3/D5/D9/D11/D13 晚（G1 前置 I1-I2，G2 前置 I3-I5）。
2. **固定合并序**：`A → B → C → D`（检测先行、演示殿后）。轮值整合人依次：
   `git checkout codex/p3-integration && git merge codex/p3-a` → B → C → D。
3. **白名单校验**：合并前 `git diff codex/p3-integration..codex/p3-X --name-only` 逐文件比对 `CONTRACTS.md` §1 所有权矩阵；**白名单外 diff 一律拒合**，退回该线。
4. **门禁**：全部合入后主检出跑 `node scripts/h2-sentinel/check-all.mjs`；全绿 → 打 tag `gate-i1..i5` → 通知各线次日 rebase：`git fetch && git rebase codex/p3-integration`。
5. **冲突裁决**：由文件所有者线的方案优先；跨所有权冲突由整合人裁决并记录于整合 commit 信息。
6. **轮值表**：I1=A、I2=B、I3=C、I4=D、I5=A（整合人须持有主检出）。

## §4 高危文件串行化协议

| 文件 | 协议 |
|---|---|
| `packages/h2-vocabulary/data/detection-thresholds.json` | 仅 A 线；每次变更版本递增（v5→v6）+ 算法三件套（独立 commit+阈值快照+四项指标对照表）；合并前置三绿：evaluate + 误报尺子 + 哨兵 |
| `packages/h2-vocabulary/data/version.json` | **仅整合人**在整合窗改（杜绝四线并发 bump 冲突） |
| `services/h2-analytics/.../settings.py`、`service.py` | B 线独占；他线需求走 CONTRACTS §7 变更请求 |
| `packages/h2-contracts/**` | 冻结只读；加法式变更 + `npm run h2:qa` + 整合窗执行 |
| `submission/h2-sentinel/CLAIMS_LEDGER.md` | D 主笔；A/B/C 以文字块发给 D 合入，不直接改 |
| `evidence_json` 结构 | 加法式扩展（各线新增 optional 字段，不改既有键） |

## §5 上下文预算与续作规程（700k 硬约束）

1. 每线实例**开工必读**：自线 README + TASKS 看板 + `CONTRACTS.md` + 本文件 §1-§4（≈1.3k 行文档）。
2. **读代码仅限白名单**（各线 README §3）；稳态上下文目标 <150k tokens，警戒线 200k（上限 700k，留 5 倍冗余应对长会话）。
3. **单卡粒度**：一次会话只做一张任务卡；做完更新看板、commit、push。
4. **超限症状**：开始全仓库漫游、重复读大文件、遗忘看板位置 → **立即收尾当前卡并重开会话**，新会话粘贴 `prompts/agent-X.md` 后从 TASKS 看板续下一卡（不依赖旧会话记忆）。
5. 大 CSV 禁止整读（CONTRACTS §5）；工具输出超长时用采样/head 截断。

## §6 验证金字塔（少测试快交付下的质量底线）

| 层 | 内容 | 频率 | 谁跑 |
|---|---|---|---|
| L1 本卡验收 | 任务卡自带验收命令（冒烟级） | 每卡完成时 | 各线 |
| L2 线内回归 | 本线 README §5 验收命令集 | 每张 P0 卡后 | 各线 |
| L3 整合门禁 | `check-all.mjs` 全量（含 169 pytest + 75 契约 QA + 误报尺子 + 哨兵 + check-submission + doctor + run-demo） | 每整合窗 | 整合人 |
| L4 冻结门禁 | G2 终值复跑 + 换机演练 + submission 样例 | D14 | 整合人+D 线 |

新增自动化断言 <100 行/任务；**不引新测试框架**；L3/L4 只用现有脚本。

## §7 回退策略

1. **算法回退**：`H2_ML_ENABLED=false` + 还原 `detection-thresholds.json` 至上一版本号 + 重冻结误报尺子基线。
2. **助手回退**：`STEPFUN_API_KEY` 不注入 → 本地降级答案（云端渲染层整体旁路）。
3. **整合回退**：整合窗门禁红 → `git reset --hard gate-i(n-1)` 重合并出错分支；各线工作分支不受影响。
4. **冻结回退**：G2 前发现致命问题 → 推迟 tag，砍到裁剪序允许的最小集（各线 P0）再冻结。

---

*节奏版本：v1（2026-08-30）。R1=功能、R2=打磨；任何日程冲突优先保 G1/G2 门禁时点，任务量走各线裁剪序。*
