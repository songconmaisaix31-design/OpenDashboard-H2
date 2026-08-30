# H2 Sentinel P2 B-Line Runtime Evidence Checklist

## Candidate record

- Exact final candidate SHA: coordinator records after this documentation
  commit and regenerates ignored evidence on that exact clean SHA.
- Working-tree state: must be clean except intentional ignored generated
  evidence and known nested worktrees; generated evidence from an earlier SHA
  is a pre-documentation baseline, not final-candidate evidence.
- Official package: bounded read-only integrity check only.
- Package integrity: all data/material entries plus the workbook match, 21 of
  24 total manifest entries; three top-level requirement/README Markdown or DOCX files differ,
  so the package is not described as pristine and remains read-only.
- Latest local public-data metrics, visual QA, measured receipt, and full
  test-set checker verdict are recorded below as the pre-documentation
  baseline; pending final-candidate rerun.

| ID | Required evidence | Lane C status | Final release rule |
| --- | --- | --- | --- |
| R01 | Exact candidate SHA and changed-path audit | Pre-documentation clean-SHA gate passed; final documentation SHA not yet recorded | Coordinator records the post-commit clean SHA, audits allowed paths, and rejects evidence bound to an earlier SHA. |
| R02 | Frozen SHA-256 identities for public source CSVs | Locally evidenced by the frozen official-source contract and read-only package audit | Revalidate hashes on the exact final clean SHA; never infer hashes or read credentials. |
| R03 | Directed C04 manifest and 69-field detector CSV | Locally evidenced: complete source verified, VA0034 selected, 117 detector rows, labels excluded from detector input | Regenerate ignored manifest and slice on the exact final clean SHA and revalidate padding, coverage, relative paths, fields, and label exclusion. |
| R04 | Q01-Q10 deterministic answers | Locally evidenced by focused and assembled contract gates | Rerun both LLM-rendering flags, citation invariants, context errors, alias rejection, and Q09 on the final SHA; this is not organizer evidence. |
| R05 | Human review transitions and reliability | Locally evidenced by focused, assembled, and demo gates | Rerun transitions, replay, conflict, notes, and per-event isolation on the final SHA. |
| R06 | Detector/submission immutability after review | Locally evidenced by contract and demo gates | Recompare event snapshots and exact submission bytes before and after review on the final SHA. |
| R07 | Review-audit export | Locally evidenced by contract and demo gates | Revalidate all events, revision-zero entries, stable ordering, UTF-8 notes, and actor notice on the final SHA. |
| R08 | Chinese report structure and safety | Locally evidenced by contract and demo gates | Revalidate zh-CN, script-free escaped HTML, provenance, safety, and hash metadata on the final SHA. |
| R09 | Validation-slice provenance | Locally evidenced in prepared-slice, Web/report, and demo validation | Regenerate on the final SHA and retain prepared-slice provenance without promoting Fixture or HTTP success to official proof. |
| R10 | Local public validation metrics | Locally evidenced: TP=69, FP=3, FN=1; precision 0.9583333333, recall 0.9857142857, F1 0.9718309859; mean delay 7.7826 minutes; mean start/end error 3.3623/2.7971 minutes; classification 69/69; per-code F1 C01=0.9, C04=0.90909, all others=1.0 | Regenerate the event-match-v2 report on the exact final clean SHA. Treat it as local public-data contract evidence, never an organizer score. |
| R11 | Disjoint public-data overfit sentinel | Locally evidenced green: absolute F1 delta 0.0120399818, validation 0.97183 versus train-last-90-day 0.98387 | Regenerate on the final SHA; do not describe public-data separation as hidden-test evidence. |
| R12 | Full public test-set smoke and submission | Locally evidenced: 172,800 rows, 69 fields, 98 events (C01=10, C02=14, C03=14, C04=17, C05=14, C06=15, C07=14), exact 16-column/98-row CSV, checker passed | Rerun on the final SHA; this proves the local pipeline, not deployment or organizer acceptance. |
| R13 | Two scripted local executions below 180 seconds | Pre-documentation executions and independent receipt validation passed; all unsupported-claim flags false | Regenerate on the exact final clean SHA, validate distinct execution IDs and ordered stages, and record timing only in ignored evidence. |
| R14 | Desktop and iPhone 12 rendering | Visual QA locally evidenced across all six Fixture routes; Local empty/loading/error theme tokens were corrected | Repeat final-SHA visual QA for overflow, clipping, overlap, scrolling, theme states, and official field identities; screenshots and HTTP success remain bounded local evidence. |
| R15 | Required project checks | Pre-documentation baseline passed: 132 repository; 117 H2; 75 contract QA; 5 static QA; 6 assembled QA; 9 launcher; 169 Python; Ruff; Mypy on 45 files; 686-module build; 9-scenario smoke | Coordinator reruns the exact final gate, package wording/evidence boundaries, Markdown validation, ignored-output checks, and changed-path/diff audits. |
| R16 | Organizer result, hidden testing, deployment, production, clean-machine, and remote CI | Not evidenced; all corresponding claims remain false | Require separate authoritative evidence. Do not derive an official D01-D13 completion score because no authoritative mapping or weight table was supplied. |
| R17 | Full training-file session import | Local standard-launcher HTTP run passed with provider environment cleared: 236991870 bytes, 29 chunks, 525,600 rows, exact SHA-256, finalized session, and passed quality | Retain this as bounded local HTTP evidence; separately capture browser file-picker and require independent evidence for clean machine, organizer, production, remote CI, or official score. |
| R18 | Bounded NLU and control refusal | Backend/Web source and focused tests reported | Probe Q01-Q10 paraphrases, ambiguity, overlength, stale context, and equipment-control requests in final integrated Local runtime. |
| R19 | Optional StepFun restatement | Strict opt-in, bounded payload, validation, disclosure, and fallback are implemented; no live-provider evidence | Verify deterministic off/fallback locally. Treat any authorized live-provider run as separate external evidence and never record a secret. |
| R20 | C01-C07 dedicated charts | Canonical requirements and Web configurations are implemented; final integrated visual QA pending | Inspect every code plus missing-series fallback at desktop and 390x844, including signs, units, overflow, and no fabricated measurements. |
| R21 | Doctor/check-all/CI | Source and worker checks reported | Run doctor and check-all on final SHA; record clean-machine and named remote CI only after those environments actually pass. |

## Current documentation-lane command set

    node scripts/h2-sentinel/doctor.mjs --mode local
    node scripts/h2-sentinel/check-all.mjs
    node --test "tests/h2-sentinel/contract/*.test.mjs"
    npm run h2:qa
    npm run h2:launcher:test
    pwsh -NoProfile -File submission/h2-sentinel/scripts/validate-submission.ps1
    git diff --check

## Receipt interpretation

A passing receipt proves that two scripted local workflows and their referenced
files meet the evidence schema on the named clean SHA. A tracked documentation
commit changes that SHA, so the coordinator must regenerate the ignored receipt
after this commit before calling it final-candidate evidence. The receipt does
not by itself prove the separate full public-validation run and never proves
hidden testing, organizer scoring, deployment, remote CI, clean-machine or
production behavior, or correctness beyond the recorded local workflow.

---

## plan0830 D-P0-1 换机复现演练记录（2026-08-30 追加节，D 线持笔）

> 本节由 plan0830 D 线 D-P0-1 追加；上方 Candidate record 与 R01-R21 行保持
> 原样（evidence-boundaries 契约断言所依）。本节 SHA 证据仅对标注 commit
> 有效，其后任何提交使对应证据失效；G2 冻结时对最终 clean commit 统一
> 重生成。本节所有结果均为本地演练证据，不等于组织方验收、隐藏测试、
> 部署生产或官方评分。

### 0. plan0829「两次换机演练」留痕复核结论

plan0829 P0-3/B-4 规划了两次换机演练与 `CLEAN_MACHINE_RUNBOOK.md`，但：
`submission/h2-sentinel/` 内不存在该文件；git 全历史无演练执行提交记录；
plan0829 看板 P0-3 终态为「未开始」；本清单 R16 亦自证 clean-machine
「Not evidenced」。**结论：plan0829 两次演练不可复核，以 plan0830 本轮
两次演练记录为准。**

### 1. 演练环境口径声明（降级明示）

- 要求口径：异机/异账号 clean-machine。
- 实际口径（用户 2026-08-30 会话确认）：**同机隔离目录模拟**——独立
  `git clone --no-local` + 独立 npm/uv 缓存目录 + 无 node_modules/venv
  残留；Node/Python/uv 运行时为本机预装（符合 RUNBOOK 前置要求）。
- 未覆盖：真实异机硬件、独立 Windows 账号 profile、Ctrl+C 交互式退出
  （演练工具以进程树终止替代，行为差异见失败项 F2）。按 D-P0-1 裁剪位
  要求在此明示降级；G1 前如条件允许可升级补真异机演练。

### 2. 演练 1（RUN1，2026-08-30）

- 机器标识：LAPTOP-0PKLP0AG / 用户 86156 / Windows 11（10.0.26200）
- 基线：commit `e4b3076`（tag `p3-base`，含 B-P0-1 四文件与 plan0830 文档）
- 隔离：`D:\allcode\qingneng-wt\_drills\run1`（`.cache/npm`、`.cache/uv`
  独立；克隆目录全新）
- 原始日志：`D:\allcode\qingneng-wt\_drills\run1\logs\`（仓库外留存，
  关键结果下表嵌入）

| # | 步 | 命令 | 结果 | 耗时 |
| --- | --- | --- | --- | --- |
| 1 | 克隆 | `git clone --no-local --branch codex/p3-d D:\allcode\qingneng ..\run1\repo` | exit 0；HEAD=e4b3076=p3-base | 4s |
| 2 | Node 依赖 | `npm_config_cache=..\run1\.cache\npm npm ci` | exit 0（隔离缓存全量安装） | 17s |
| 3 | Python 依赖 | `cd services/h2-analytics` + `UV_CACHE_DIR=..\run1\.cache\uv uv sync --locked --extra dev` | 首跑失败（F1）；按 RUNBOOK 原文重跑 exit 0 | 9s |
| 4 | 体检 | `node scripts/h2-sentinel/doctor.mjs --mode local --web-port 5193 --analytics-port 8795` | 全项「通过」exit 0 | 3s |
| 5a | 演示冒烟 | `npm run h2:fixture -- --web-port 5193 --analytics-port 8795` | READY；HTTP 200；页面正常（console 仅 favicon 404，F3）；截图 01 | <10s |
| 5b | 完整启动 | `npm run h2:local -- --web-port 5193 --analytics-port 8795` | 首跑快速失败（F2：端口被残留占用）；清残留后 READY（webPid 52332 / analyticsPid 52652）；analytics `/health`=200 | 7s |
| 6 | 导入测试集 | UI 数据分析页 → 选择 `03_test_timeseries.csv`（74.3MB，8MiB 分片上传） | 172,800 行；质量检查 8 项通过；数据集 `live-h2-f641e0b773cecdc0`；SHA-256 `f641e0b7…de288`；截图 02 | ~50s |
| 7 | 运行分析 | 导入后自动分析 | 98 事件（C01–C07 = 10/14/14/17/14/15/14，与 R12 官方 test 基线一致）；高风险 73；截图 03 | 含上步 |
| 8 | 导出 | 报告中心 → 竞赛提交结果 → 下载 `submission.csv` | 文件 sha256 `ed944f61bde6df4ab7de241054e295efc5bf21a559592b2076279600a5bc30e7` 与 UI 报告一致；`node validation/check-submission.mjs` → `valid=true`、98 行、16 列按官方模板顺序、零 issue 零 warning；截图 04 | <10s |
| 9 | 收官门禁 | `node validation/offline-deploy-smoke.mjs --official-data D:\allcode\h2-t01-official\dataandfiles` | `verdict=passed`，candidateCommit=e4b3076 | 68s |

- 截图入库：`plan0830/D/evidence/D-P0-1/run1-01-fixture-overview.png`、
  `run1-02-local-overview-imported.png`、`run1-03-local-events.png`、
  `run1-04-local-export-submission.png`。

### 3. 演练 1 失败项闭环表（问题→修复→复验；排障详版见 OPERATOR_RUNBOOK）

| # | 问题 | 根因 | 修复与复验 | 状态 |
| --- | --- | --- | --- | --- |
| F1 | `uv sync` 报 `No pyproject.toml found` | 演练执行者在仓库根目录运行，漏掉 RUNBOOK 安装块中的 `cd services/h2-analytics` 步骤（文档本身正确） | 复验：按 RUNBOOK 原文重跑一次通过（9s）；RUNBOOK 故障表新增对应条目；不改代码 | 已闭环 |
| F2 | local 首次启动失败：`Web port 5193 is already in use` | 演练工具非正常终止 fixture 后 vite 子进程残留监听端口；launcher 行为正确（快速失败+明确提示），但提示未含占用 PID 与清理命令 | 复验：`netstat -ano` 定位 + `taskkill /PID <pid> /T /F` 树杀后二次启动 7s READY；RUNBOOK 故障表新增「残留进程定位与清理」条目；启动前置检查给出 PID 归入 D-P1-1 加固项 | 已闭环（文档+任务登记） |
| F3 | fixture 页面 console error：`favicon.ico 404` | web 静态资源缺 favicon（`apps/web`，C 线域） | 不阻断验收；按 CONTRACTS §7 向 C 线登记 change-request（登记处见 plan0830/D/TASKS 看板）；D 线不改 C 线文件 | 已登记待 C 线处置 |

### 4. 演练 2（RUN2）

（待演练 2 执行后填写：计划在 F1/F2 文档闭环所在新 commit 上，以第二个
全新隔离目录复跑六步，预期一次通过。）
