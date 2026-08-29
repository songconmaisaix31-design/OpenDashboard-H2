# 双线协作契约 — A 线持有副本

> 本文件为 A/B 共同契约，**A/B 两份内容一致**（仅标题标注持有方）。修改须双方确认后同步改两份。
> B 线副本：`../B/COORDINATION.md`

---

## §1 分支模型与同步节奏（双机核心协议）

```
origin/main（保护基线，不动）
   └─ tag p2-base（D1 共同日）
        ├─ codex/p2-algo      ← A 线工作分支（A 机）
        ├─ codex/p2-delivery  ← B 线工作分支（B 机）
        └─ codex/p2-integration ← 整合分支（只在整合门上推进）
```

1. **每天收工各自 push**；
2. **整合门** D3/D6/D9/D12 晚：轮值整合人把两条工作分支先后合入 `codex/p2-integration` → 跑全套门禁 → 全绿打 tag `gate-i1..i4` → 双方次日 rebase；
3. **轮值表**：I1=B，I2=A，I3=B，I4=A；冲突由文件所有者裁决；
4. 禁止：push 对方分支、在 integration 上开发、绕过门禁合并；
5. D14 联合冻结：两人同机，最终 integration commit 上一次性重生成全部 ignored 证据。

## §2 文件所有权矩阵

| 路径 | 所有者 | 类型 |
|---|---|---|
| `h2_analytics/{detection,events}/**`、`safety/**` | A | 独占 |
| `h2_analytics/impact/**` | A | 独占 |
| `h2_analytics/diagnosis/**`、`evidence.py` | A | 独占 |
| `tools/{features,train_lightgbm,calibrate_*}.py` | A | 独占 |
| `validation/evaluate.mjs`、`normal-context-regression.mjs`、`lib/**`、`baseline/**` | A | 独占（lib 允许 B 增量） |
| `h2-vocabulary/data/{detection-thresholds,impact-formulas}.json` | A | 独占 |
| `models/**`(ignored)、`MODELS_REGISTRY.md` | A | 独占 |
| `h2_analytics/assistant/**` | B | 独占 |
| `h2_analytics/ingestion/**`、`api/**` | B | 独占 |
| `h2_analytics/reports/**`、`quality/**` | B | 独占 |
| `apps/web/src/features/h2-sentinel/**` | B | 独占 |
| `scripts/h2-sentinel/**`、`start-h2-sentinel.*`、`.github/workflows/ci.yml` | B | 独占 |
| `validation/{check-submission,offline-deploy-smoke,run-demo}.mjs` | B | 独占 |
| `h2-vocabulary/data/{submission-equipment-tokens,assistant-questions}.json` | B | 独占 |
| `submission/h2-sentinel/**`（文档） | B | 独占（A 贡献 ML 声明条目） |
| `h2_analytics/settings.py` | 共享-预置 → B | D1 双条目一次预置；此后 B 主改 |
| `packages/h2-contracts/**` | 共享-增量 | 加法式变更 + `npm run h2:qa` + 当次公告 |
| `h2-vocabulary/data/`（其余冻结 JSON） | 共享-只读 | 只读；变更须双方同意 + 版本递增 |
| `docs/**`、根 README/AGENTS/MEMORY | 共享-增量 | P2-2 归档由 B 主导 |
| `../07_APPENDIX_ENTERPRISE_QUESTIONS.md` | 共享 | 口径问题双方登记 |

## §3 冲突高发点与预案

| 冲突点 | 预案 |
|---|---|
| `settings.py`（A: `H2_ML_ENABLED`；B: 流式导入配置） | D1 同机一次写入两处 → 归零冲突；再改须公告 + rebase |
| `packages/h2-contracts`（A: ML 证据字段；B: 助手/导入字段） | 一律加法式 + h2:qa；同日双改时后合入者 rebase |
| `validation/lib/metrics.mjs` | A 主改；B 只新增不改既有导出 |
| `evidence_json` 结构 | 加法式扩展，各加各的 optional 字段 |
| `CLAIMS_LEDGER.md` | B 主笔；A 文字块发 B 合入 |

## §4 门禁映射

| 原门禁 | 双线版落点 | 谁 |
|---|---|---|
| gate-s0 | D1 共同日 | 共同 |
| gate-s1 | D3 整合门 I1 | 共同 |
| gate-s2 | A-1..A-4 门禁 + I2/I3 复验 | A |
| gate-s3 | D9 I3 | 共同 |
| gate-s4 | D12 I4 | B 主 A 配合 |
| gate-s5 | D13 | 各自 |
| gate-s6 | D14 联合冻结 | 共同 |

## §5 跨线接口清单（A→B；具体形状见 `planA/docs/contracts/api.md` IF-1..IF-5）

| # | 接口 | A 交付物 | B 消费方 | 时间 |
|---|---|---|---|---|
| 1 | Q03 数值口径 | IF-1 | P1-3 Q03 | D11 前 |
| 2 | Q05 根因条目格式 | IF-2 | P1-3 联动答案 | D12 |
| 3 | ML 演示口径 | IF-3 | DEMO_SCRIPT / CLAIMS_LEDGER | D12 后 |
| 4 | 指标口径 | IF-4 | 演示讲稿 | D6 前 |
| 5 | 事件数据字段 | IF-5 | P1-3/P1-5 | D13 |

反向（B→A）：流式导入指纹差异立即通报 A。

## §6 沟通纪律

1. 每日 15 分钟同步；2. 契约改动同步 A/B 两份，提交信息 `coordination:` 前缀；3. 破坏性操作须对方同意；4. 口径外部问题登记 `../07` 号文档，走保守默认口径。