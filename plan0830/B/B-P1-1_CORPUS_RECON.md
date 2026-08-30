# B-P1-1 会话1 知识语料对账清单

> 对象：`packages/h2-vocabulary/data/knowledge-base.md`（9 行 4 条 → 结构化 63 条）。
> 条目 schema：`### {ID}` + 正文 + sourceType + sourceId；sourceType ∈ official_knowledge / data_dictionary / requirement_doc。

## 条数统计（会话1）

| 分区 | 条数 | 出处类型 |
|---|---|---|
| 一、官方知识（15 号文件原文逐字保留） | 4 | official_knowledge |
| 二、数据字典归纳（00 号 CSV，行号可溯） | 40 | data_dictionary |
| 三、需求书条款（00_需求书.md） | 14 | requirement_doc |
| 四、答案引用条目（service.py 既有 ID 落位） | 5 | data_dictionary / requirement_doc |
| **合计** | **63** | 会话2 再 +23（约束 12+台账 8+曲线 3）→ 预计 86 |

字典条目覆盖：光伏 3、辅机 1、储能 5、PCC 2、电网约束 6、EMS 3、电解槽 8、制氢 1、报警 1、影响指标 7（C01-C07 各 1）、文件结构 3。

## service.py 既有 knowledge_base 引用 ID 落位对账

| 引用 ID（service.py） | 语料条目 | 落位方式 |
|---|---|---|
| h2-sign-conventions-v1 | §一 | 官方原文（15 号文件:行3） |
| h2-power-balance-boundary-v1 | §一 | 官方原文（行5） |
| c04-c05-distinction-v1 | §一 | 官方原文（行7） |
| c01-cloud-versus-command-v1 | §四 | 新增（需求书 §7-C01） |
| c02-capacity-synchronization-v1 | §四 | 新增（字典 行37-39 等） |
| c03-impact-boundary-v1 | §四 | 新增（字典 行160） |
| c06-allocation-baseline-v1 | §四 | 新增（需求书 §4-C06+§2） |
| c07-headroom-calculation-v1 | §四 | 新增（字典 行14-16） |
| electrolyzer-health-score-unavailable-v1 | §三 | 改名对齐（原 req-no-health-score，需求书 §12） |
| h2-recommendation-actions-v1 | §三 | 改名对齐（原 req-t08-safe-advice，需求书 §6-T08） |
| run:{runId}:summary | — | 运行时动态 ID（当前 run 摘要），不落静态语料库，维持现状 |

10/10 静态 ID 全部落位。

## 门禁实测（2026-08-30）

| 门禁 | 结果 |
|---|---|
| `python -m pytest tests/ -q` | 315 passed + 3 skipped（语料文件无运行时消费方，零回归） |
| `npm run h2:qa` | 契约部分见收工记录（P1-API 本地服务启动超时为环境既有问题，与本卡无关） |

## 备注

- `vocabulary.knowledge_base()` 当前无调用方：扩写不冲击 LLM prompt 预算；**token 预算实测归会话2**（corpus.py 接线时按题检索注入并记录规模上限）。
- 语料运行时接线（corpus.py 按 ID 取条目+引用一致性断言）归会话2。
