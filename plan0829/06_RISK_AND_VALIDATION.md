# 06 · 风险登记与验证策略（RISK & VALIDATION）

> 版本：2026-08-29 ｜ 服务对象：`05_ROADMAP.md` 全部阶段门禁 ｜ 原则：**证据 > 假设；每项算法/架构改动必须先有尺子再动手**

---

## §1 风险登记册

概率/影响：低/中/高。回退 = 恢复手段。

| # | 风险 | 触发条件 | 概率 | 影响 | 缓解 | 回退 |
|---|---|---|---|---|---|---|
| R-01 | 去签名带后召回断崖（P1-1） | C03/C05/C06 放宽判据 | 中 | 高 | 逐类独立 commit；每步过 F1/FN/哨兵/N01-N07 四重门禁 | 单类 `git revert` + 阈值快照还原 |
| R-02 | ML 过拟合（P1-9） | LightGBM 在 TRAIN 拟合签名而非规律 | 中 | 高 | 时间 rolling 分割；过拟合哨兵；3 seed 方差检查；默认关闭 | `H2_ML_ENABLED=false` 一键回纯规则 |
| R-03 | ML 不可解释违反红线（P1-9） | 命中无法给出 top 特征 | 低 | 高 | 证据链强制 = 规则判据 + top-5 特征；黑盒命中不进提交 | 关闭 ML 通道 |
| R-04 | N01-N07 回归暴露既有高误报（P0-4） | 分列误报率超预期 | 中 | 中 | 这是有价值发现：倒逼 P1-1/P1-2 排期；不阻塞独立工作 | —（记录基线即可） |
| R-05 | 提前预警误报（P0-5） | 前瞻判据过松在 N05/N07 误报 | 中 | 中 | 判据与 P0-4 联调；lead_time 与误报率双指标权衡 | 收紧速率阈值 |
| R-06 | 现场无网（P1-10） | 验收环境禁外网 | 中 | 中 | 离线降级链（03§4.5）；验收全链路离线可完成；UI 模式徽标 | LLM 层自动旁路 |
| R-07 | LLM 幻觉/数字编造（P1-10） | 上下文外数值 | 中 | 高 | 数值白名单后置校验；引用强制；温度 0；失败即降级 | 剔除该句并走本地答案 |
| R-08 | API key 泄漏 | key 入库/入日志/入演示机持久化 | 低 | 高 | 仅环境变量注入；日志脱敏断言；提交前 secret 扫描 | 立即吊销轮换 |
| R-09 | 流式导入内存/超时（P1-6） | 237MB 分块上传 | 中 | 中 | 分块压测定参；commit 校验后台化；进度反馈 | 保留单请求旧路径（≤96MiB 场景） |
| R-10 | clean-machine 翻车（P0-3） | Windows 执行策略/Python 版本/端口占用 | 中 | **高（4 分项）** | doctor.mjs 自检 + 中文排查决策树；提前演练 ≥2 次并留痕 | runbook 人工步骤兜底 |
| R-11 | 需求书缺失章节（评分/交付物口径未知） | 第 8-10、13 节不可得 | 已发生 | 高 | 双轨口径：按风险覆盖排期；07 号文档持续追问；防御性交付 | 企业答复后按答复重排 |
| R-12 | 证据失效（SHA 与提交顺序） | 文档提交改变 clean SHA | 高（必然） | 中 | S6 冻结前完成全部文档变更；之后一次性重生成 ignored 证据 | 重跑 check-all + 验证链 |
| R-13 | CI 超时（P0-2） | Python 依赖安装拖慢 | 中 | 低 | npm/uv 缓存；必要时超时放宽 20 分钟 | 拆双 job |
| R-14 | 可视化与词汇包不一致（P1-7） | 手写中文名 | 低 | 中 | 变量名/单位强制从 `h2-vocabulary` 读取 | 单测断言 |

## §2 五层验证金字塔（全部复用现有工具链，仅第 4 层半新增）

| 层 | 工具/命令 | 规模 | 门禁作用 |
|---|---|---|---|
| 1 契约层 | `npm run h2:qa`（`tests/h2-sentinel/contract/*`） | 75 项 | contracts/vocabulary 变动必跑；schema 漂移即红 |
| 2 单元层 | `uv run --locked --extra dev python -m pytest -q` + `npm run h2:test` | 169 + 117 项 | 判据/聚合/诊断/助手逻辑回归 |
| 3 评估层 | `node validation/evaluate.mjs` | 验证集 70 事件 | F1/Precision/Recall/分类 + **新增** `lead_time_minutes`（C05/C07）与 10 分钟内检出率（其余 5 类） |
| 4 防过拟合层 | `validation/overfit-sentinel.mjs` + **新增** `validation/normal-context-regression.mjs` | \|ΔF1\| + N02-N07 分列误报率 | 算法改动的一票否决层 |
| 5 交付层 | `validation/check-submission.mjs` + `validation/offline-deploy-smoke.mjs` + `validation/run-demo.mjs` | 16 列/全量冒烟/双次 <180s | 提交与演示兜底 |

**本地一键等效**：`node scripts/h2-sentinel/check-all.mjs`（P0-2 产物）= 五层全跑，产出基线 JSON。

## §3 回退策略
1. **阈值快照**：每次判据改动前，`detection-thresholds.json` 快照入 `validation/baseline/threshold-snapshots/`；
2. **版本联动**：`detector_version` 递增规则（规则改 patch、判据改 minor、ML 启用改 major），`MODELS_REGISTRY.md` 记录模型-SHA 映射；
3. **git tag 门禁**：`gate-s0`…`gate-s6`，回退 = `git revert` 到上一 tag + 快照还原；
4. **双开关联动**：`H2_ML_ENABLED`（检测）、`STEPFUN_API_KEY`（助手）——两者关闭即回到纯确定性系统。

## §4 防过拟合治理纪律
1. 只用公开 train + validation 调参/训练；**测试集只允许最终一次性推理**（不得据其反馈改任何参数）；
2. `06/07_*_row_labels.csv` 仅作行级训练标签与评估，事件级评估以 `validation/evaluate.mjs` 为准；
3. `13_normal_context`（77 条）只用于误报回归，不得用于训练正样本增强（官方定位是"合理工况"反例库）；
4. 任何"验证集上表现变好"的改动，必须同时出示：过拟合哨兵绿 + N01-N07 不升 + TRAIN 40 事件/类全命中不回退，三者缺一不可；
5. 每个门禁通过后，指标对照表（改动前后四项）写入阈值 JSON 校准记录块——**这是评审时证明"没有调测试集"的核心证据**。

## §5 验收对照（本方案如何被验证）
- 每份专项文档（02/03/04）的验收小节即实施完成的判定标准；
- `00_README.md` §5 看板逐项勾选，证据链接指向 `validation/baseline/`、演练记录、checker 输出；
- 最终 S6：一条 `check-all.mjs` 全绿 + 一份 clean SHA 证据包 + 换机演练留痕 = 本轮迭代闭环。