# 状态文件（Agent A2 · 评估与 ML 域）

> 全量重写式维护；每次任务完成或会话结束更新。

## 当前契约版本

internal-a.md v1.0 / api.md v1.0

## 当前任务

**T03b（P0-5 指标侧）已完成，待 M-Gate 合并**（feat/a2-evalml @ d53a939，T03b 单提交）

## 已完成任务

### T03b ｜ P0-5 lead_time_minutes 与 10 分钟检出率（2026-08-29 完成）

- **口径**：ADR-004 / api.md IF-4 **字面**——lead_time = first_detection − GT start（分钟，C05/C07 目标 >0）；
  5 类（C01/C02/C03/C04/C06）检出率分母 = 该 5 类**全部 GT 事件**（FN 计入），`delay ≤ 10min` 达标（负值即提前检出也算达标），目标 1。
  实现前核对上游 02§5 原文钉死方向（"目标 >0"字面无歧义；A1 挂账备注"跳变型 onset 下以 lead_time>0 + 先于硬性超限实现提前预警"与此一致）。
- **实现**（全 A2 领土，纯加法）：
  - `lib/metrics.mjs`：`detectionExpectationMetrics` 纯函数 + `ADVANCE_WARNING_CODES`；5 类清单由 ANOMALY_CODES 差集派生防手写漂移；
    匹配但无 first_detection 计 `unmeasurableMatches`；空集 rate/meetsTarget = null（不编造）；perEvent 明细可审计
  - `evaluate.mjs`：metrics 增 `detectionExpectation` 节、parameters 增口径串、**schemaVersion 2→3**（event-match-v2 不变）
  - `overfit-sentinel.mjs` 同步防篡改：metrics exact-keys 增节 + 节内恒等式（measured = GT−unmatched−unmeasurable；四项和 = GT）
    + structural canonical 重算 sameJsonValue 对比 + schemaVersion/口径串断言
  - 测试：新增 `detection-expectation.test.mjs` 8 例；`overfit-sentinel.test.mjs` fixture 同步 v3
- **验证**：契约测试 **83/83** 绿（原 75 + 新 8）；真实管线在 clean-tree worktree（d53a939）跑 validation 全窗成功，
  F1=0.9718 与基线逐位一致（指标纯加法，预测集合不变）；**真实报告过哨兵 assertEvaluationIdentity**（canonical 新节对比）。
  证据：`tests/h2-sentinel/reports/generated/official-evaluation-d53a939664d7-<run>/evaluate-validation.json`（gitignored）
- **实测值（A2 分支检测器 = deterministic-c01-c07-v4，不含 A1 T03a 判据）**：
  - lead_time：C05 10/10 全 **3min >0** ✓；C07 10/10 全 **0min**（确认行路径无前瞻，预期合并 A1-T03a 后 =2min，A1 状态已实测）→ allPositive=false
  - 5 类检出率 **38/50 = 0.76**：unmatched 1（VA0005 = 基线那 1 个 FN，对账吻合）+ overdue 11（VA0001-0010、VA0040、VA0053——
    匹配成功但 first_detection 晚于 GT start >10min，判据侧待 T04-T07 改进，指标侧如实呈现）
  - 解读：gate-s2 门禁全绿是 **M2（T03-T07 全部完成 + 合并后）** 的目标；T03b 验收"指标可产出"已达成

### T02 ｜ P0-4 N01-N07 合理工况误报回归资产（2026-08-29 完成）

- **工具**：`validation/normal-context-regression.mjs`（report/freeze/check 三模式；全模式 clean-tree 证据纪律）
- **冻结基线**（@21a5029，检测器同 D1 F1=0.9718 证据源）：**N01-N07 每列 11 窗口 0 FP，总览 77 窗口 0 FP**；
  同批真实产出 124 原始/121 合并预测（非空跑）。基线：`validation/baseline/normal-context-baseline.json`（gitignored）
- **门禁验证**：check 正向 passed/exit 0；篡改基线 failed/exit 1 且违规列精确命中；基线已还原
- 详见 git 21a5029/08bac29 提交信息

## 断点（下一会话从这里继续）

1. 下一任务 **T08**（P1-9a 特征工程 `tools/features.py`，依赖 T04 已完成 ✓）→ T09（train_lightgbm.py + 3 seed +
   MODELS_REGISTRY 登记；只用 train+validation，**禁测试集**；N01-N07 不作训练增强 ADR-002）
2. T08 前建议先看：A1 的 C03/C05 去签名带判据（52d7435/9155fd3 @ feat/a1-rules）决定特征面；M-Gate 合并后特征口径以合并版为准
3. **worktree 复跑清单**（T03b 实测补充 T02 两坑之后第三坑）：① 日志放树外；② 先 `uv sync --locked --extra dev`；
   ③ **worktree 还需根目录 `npm ci`**（launcher 起 vite 需要 node_modules/vite，缺它报 "Launcher readiness failed"）
4. 5 类检出率 0.76 的 overdue 名单（VA0001-0010/0040/0053）留档给 M-Gate 后判据侧分析；指标本身无需再动

## 待确认决策（等指挥官，均已报备）

1. **check-all 接入**（change-requests [A2] #1）：B 线落地后接入 vs 授权 A2 先建（A2 倾向前者）
2. **p2-base tag 指向**：现指 a4c6168（B 线契约），非 7007e3d（D1 证据绑定点）——是否移动由你定
3. **schemaVersion 2→3**（本任务）：报告结构加法演进 + 哨兵同步；若 B 线已有 v2 硬编码消费方请告知（IF-4 未锁版本号，A2 判断为安全加法）

## 已提交的变更请求指针

- change-requests.md 两条 [A2]（2026-08-29）：check-all.mjs 属 B 领土无法接入；T01 白名单缺口已在 A2 领土内修复备案

## 附注（git 操作记录，供 M-Gate 审阅）

- T03b 单提交链：feat/a2-evalml = 41aedd8→69d78cd→21a5029→08bac29→**d53a939**（纯 A2 链）
- T03b 真实管线运行在临时 worktree（%TEMP%\a2-t03b，d53a939 干净检出）完成，报告已拷回主树 generated/（gitignored），
  worktree 已清理；A1（a1-work）/A3（a3-work）worktree 未触碰
- 主工作树在 feat/a2-evalml（d53a939）；docs 在途文件（plan.md/agent-a*.md/change-requests.md/reviews/）为三线共享状态更新
