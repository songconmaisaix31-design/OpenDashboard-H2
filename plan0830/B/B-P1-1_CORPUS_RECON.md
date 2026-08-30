# B-P1-1 知识语料对账清单（会话1+会话2）

> 对象：`packages/h2-vocabulary/data/knowledge-base.md`（9 行 4 条 → 结构化 89 条）。
> 条目 schema：`### {ID}` + 正文 + sourceType + sourceId；sourceType ∈ official_knowledge / data_dictionary / requirement_doc / control_constraint / equipment_master / efficiency_curve。

## 条数统计（corpus.py 解析实测，2026-08-30 会话2）

| 分区 | 条数 | 出处类型 |
|---|---|---|
| 一、官方知识（15 号文件原文逐字保留） | 4 | official_knowledge |
| 二、数据字典归纳（00 号 CSV，行号可溯） | 40 | data_dictionary |
| 三、需求书条款（00_需求书.md） | 15 | requirement_doc |
| 四、答案引用条目（service.py 既有 ID 落位） | 7 | data_dictionary / requirement_doc |
| 五、控制约束（09 号 CSV 全量 12 条，行号可溯） | 12 | control_constraint |
| 六、设备台账（08 号 CSV 全量 8 台，行号可溯） | 8 | equipment_master |
| 七、效率曲线（10 号 CSV 全量 3 台，行号可溯） | 3 | efficiency_curve |
| **合计** | **89** | 解析分布：official 4 / dict 43 / req 19 / constraint 12 / equipment 8 / curve 3 |

> 会话1 记录"63 条"系人工统计口径差 3（dict/req 分区归属）；以 corpus.py 解析实测 66（存量）+23（会话2 新增）=89 为准。验收下限 ≥60 超额达成。

## service.py 既有 knowledge_base 引用 ID 落位对账（会话1 落位，会话2 起由 corpus 强制断言）

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
| run:{runId}:summary | — | 运行时动态 ID（当前 run 摘要），不落静态语料库，`is_dynamic_source` 跳过 |

10/10 静态 ID 全部落位。会话2 起 `AssistantService.answer()` 内置 `entries_for_citations` 一致性断言（失配 → `assistant.knowledge_unresolvable` fail-fast）；`test_answer_knowledge_citations_resolve_to_corpus` 十问全覆盖。

## corpus.py 接线（会话2）

| 组件 | 职责 |
|---|---|
| `knowledge_entries()` | 解析全量条目；断言 ≥60 条、正文/出处非空、sourceType 枚举合法、ID 唯一 |
| `entry_by_id()` / `entries_for_citations()` | 按 ID 取条目 / 按答案引用检索（引用一致性断言） |
| `rendering_injection_entries()` | 渲染注入：按题检索 + 每条正文 ≤600 字 + 总量 ≤2400 字（`MAX_ENTRY_TEXT_CHARS`/`MAX_INJECTION_CHARS`） |
| `llm_client.render()` | user content 注入 `knowledgeEntries`（口径参考）；系统提示补"参考条目数字不得写入输出"；`_valid_output` 数字子集校验不放松（语料数字进入输出即 invalid_output→fallback） |
| 答案契约 | **零变化**（`assistant-answer.schema.json` 为 `additionalProperties:false` 且不属 B 线写域，语料不挂答案对象；IF-7 交付=条目 schema 本身，C 线可经共享词表读取，API 字段诉求走 change-request） |

## token 预算实测（2026-08-30 会话2，tiny-valid fixture 十问全跑）

| 项 | 实测值 |
|---|---|
| 语料全量正文字符 | 8380 字（89 条） |
| 逐题注入条数/字符 | Q01 1/43；Q02 1/31；Q03 1/51；Q04 1/156；Q05 1/177；Q06 1/113；Q07 2/183；Q08 1/91；Q09 0/0；Q10 0/0 |
| 逐题源文本 | 216-581 字（全部远低于 8000 截断） |
| user 内容合计峰值 | ≈649 字（Q07：源文本 466+注入 183） |
| 结论 | **按题检索注入未击穿 8000 字源文本框架**；预算护栏（600/条+2400 总量）留有余量；Q09/Q10 仅 `run:` 动态引用故注入 0 条（答案全靠当前 run 对象，符合红线 §7-6） |

## 门禁实测（2026-08-30 会话2）

| 门禁 | 结果 |
|---|---|
| `python -m pytest tests/test_assistant_nlu_rendering.py tests/test_assistant_reports.py -q` | 全绿（115 例，含新增 3 例语料验收） |
| `python -m pytest -q`（全量） | 全绿（100% 进度，3 skip 与既有基线一致） |
| `npm run h2:qa` | 契约 96 pass/0 fail；SUMMARY PASS=5；P1-API 超时为环境既有问题（同会话1 基线，非本卡引入） |

