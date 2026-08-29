# 契约变更请求（append-only）

> 规则（承自 `../COORDINATION.md` §6 + parallel-guide §6）：任何 agent 发现契约有问题时**禁止自行修改契约**，在本文件末尾追加 [A1]/[A2]/[A3]/[B] 请求（含理由与建议方案）；由用户裁决后在 api.md / internal-a.md 头部递增版本号并写变更摘要；不同意则回复驳回理由。
> 当前契约版本：api.md v1.0 ｜ internal-a.md v1.0

---

[A2] 2026-08-29 ｜ T02 执行发现 ｜ check-all.mjs 接入路径属 B 线领土，A2 无法完成 A-1 卡步骤 4 的「接入 check-all.mjs」

- **事实**：A-1 卡（TASKS.md）步骤 4 要求误报尺子「接入 `check-all.mjs`」，但该文件在仓库中尚不存在；其规划路径为 `scripts/h2-sentinel/check-all.mjs`（04_PLATFORM_DELIVERY.md §43-48），而 `scripts/` 属 B 线独占领土（api.md §领土表 / COORDINATION §2），A2 禁改。
- **现状处理**：尺子已可独立复现（`node validation/normal-context-regression.mjs --official-data <dir> --mode check`，非零退出即门禁红），并在 `validation/README.md` 文档化；导出函数（`runNormalContextRegression` 等）可供未来 check-all 直接 import。
- **建议方案**（二选一，请裁决）：① B 线在 `scripts/h2-sentinel/check-all.mjs` 落地时追加对本工具 `--mode check` 的调用；② 授权 A2 在 B 线落地前以最小新增方式创建该文件（仅编排既有 validation 工具调用）。A2 倾向 ①（不越界）。

[A2] 2026-08-29 ｜ T02 执行发现 ｜ T01 预置缺口：candidate.mjs 白名单漏 `validation/baseline/`（已在 A2 领土内修复，备案）

- **事实**：T01 提交 7007e3d 给 .gitignore 补了 `validation/baseline/`，但 `validation/lib/candidate.mjs` 的 `EXPECTED_IGNORED_ARTIFACTS` 白名单未同步——基线 JSON 一落盘，`trackedTreeClean` 即误判 false，evaluate.mjs / overfit-sentinel / 本尺子全部拒绝运行（自锁）。
- **处理**：`candidate.mjs` 属 A2 领土（validation/lib/**），本次 T02 已加法式补入白名单（附注释），非契约变更，仅备案。api.md v1.0「指标产出：validation/baseline/*.json（gitignored）」的既有声明因此才真正可执行。
- **附注**：另发现当前工作树存在未跟踪 `plan0829/`、`plan0829.zip`，同样导致 `trackedTreeClean=false`；处置权在用户（提交入库或加入 .gitignore），已当面汇报。

[A3] 2026-08-29 ｜ T12 执行发现 ｜ IF-2 `ref_id` 对 `operation_log` 源需澄清：官方操作日志无 id 列

- **事实**：api.md IF-2 定义 `ref_id` 为「record_id 或 alarm_id 字符串」，与 `maintenance_history`（record_id=M-xxx）和 `alarm_log`（alarm_id=A-xx-xxx）吻合；但 `12_operation_log.csv` 官方七列（split/timestamp/operator_role/operation_type/parameter/change/remark）**无 id 列**，字面执行不可能。
- **现状处理**：T12 实现采用合成确定性引用键 `OP-{YYYYMMDDHHMMSS}-{parameter}`；已验证官方 77 行数据上 (split, timestamp, parameter) 三元组 77/77 唯一，ref_id+timestamp+parameter 可回溯唯一条目（见 `diagnosis/ROOT_CAUSE.md`）。schema 侧 `rootCauseCitations` 为 optional 加法式新增（h2:qa 6/6 过）。
- **建议方案**：确认 IF-2 `ref_id` 语义放宽为「官方 id 列，或无 id 列时的确定性合成键（可回溯唯一条目）」；若同意请在 api.md 递增版本号并写变更摘要。A3 不单方修改契约，当前实现按上述口径冻结交付。