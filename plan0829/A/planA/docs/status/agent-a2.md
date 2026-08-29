# 状态文件（Agent A2 · 评估与 ML 域）

> 全量重写式维护；每次任务完成或会话结束更新。

## 当前契约版本

internal-a.md v1.0 / api.md v1.0

## 当前任务

T02（P0-4 误报尺子）**进行中——代码已完成提交，基线冻结运行被阻塞**

- 已提交：`feat/a2-evalml` @ 69d78cd（[A2] feat: T02 尺子三模式），基座 41aedd8（plan0829 文档入库，#T01）
- 已验证：契约测试 75/75 绿；纯函数冒烟（闭区间相交/跨入事件/篡改基线必红）；utcDays 流式分支冒烟（选择精确/互斥拒绝/空集拒绝）
- **阻塞**：共享工作树存在他人领土未提交改动（A3 的 impact/×5 + diagnosis/root_cause.py 在途、A1 的 plan.md T03a 勾选），
  `trackedTreeClean=false`，冻结/门禁运行（要求 clean tree 证据纪律）无法启动。已报告指挥官，等待协调。

## 已完成任务

（T02 完成后移入此处）

## 断点（下一会话从这里继续）

1. 前置：确认工作树洁净（他人文件已各自提交/协调完毕），分支 `feat/a2-evalml` @ 69d78cd
2. 冻结（首次，约 176 个日 chunk 管线运行，数分钟）：
   `node validation/normal-context-regression.mjs --official-data D:/allcode/h2-t01-official/dataandfiles --mode freeze`
3. 门禁正向：同命令 `--mode check` → 期望 `status: passed`、exit 0
4. 门禁负向：备份 `validation/baseline/normal-context-baseline.json` → 篡改任一列数值调低 → `--mode check` 期望 exit 1 → 还原备份
5. 冻结后验证 `currentCandidate().trackedTreeClean` 仍为 true（白名单修复生效）
6. 把冻结数字写入本文件"已完成任务"、plan.md T02 勾 ✓、提交 docs commit、汇报待合并

## 待确认决策（等指挥官）

1. **check-all 接入**（change-requests [A2] #1）：B 线落地 `scripts/h2-sentinel/check-all.mjs` 后追加调用，还是授权 A2 先建？
2. **p2-base tag 指向**：现指向 a4c6168（P2 B-line foundation contracts），非 7007e3d（D1 基线证据绑定点）。T01 验收语义需指挥官确认是否有意为之；A2 未动。
3. **共享工作树协调**：三 Agent 同副本并行会互相切换 HEAD/污染 clean-tree 判定（本会话已发生两次：A1 的 T03a 被卷入我的提交祖先、A1 分支一度被摘）。建议一人一 worktree，由指挥官统一安排。

## 已提交的变更请求指针

- change-requests.md 两条 [A2]（2026-08-29）：check-all.mjs 属 B 领土无法接入；T01 白名单缺口已在 A2 领土内修复备案

## 附注（本会话的 git 手术记录）

- 误提交修复：plan0829 提交曾落 feat/a1-rules（父=bf4277e 含 A1-T03a），已用临时索引重嫁接为 41aedd8（父=7007e3d），
  codex/p2-algo 与 feat/a2-evalml 指向 41aedd8，feat/a1-rules 恢复 bf4277e；f69e0f6 弃用（reflog 可找回）。
  动机：T02 基线必须冻结在 7007e3d 检测器（h2-rules-v2，D1 证据同源），A1-T03a 判据改动应作为被尺子检验的对象而非基线的一部分。
