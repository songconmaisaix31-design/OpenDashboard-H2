# 终局追认与 T14 冻结记录（final-ack-freeze）

> 日期：2026-08-30 ｜ 出具：指挥官授权整合会话（[I]）｜ 性质：**用户明示"全权放开、不要人工接入、准备交付"**——本记录为该授权下的追认与冻结凭据
> 上游：gate-1..6（A3）｜ 契约：api.md v1.1 / internal-a.md v1.0

## §1 [I] fixup 与跨领土改动追认（指挥官代笔 → 全部追认）

| # | 改动 | 提交 | 域主 | 追认理由 |
|---|---|---|---|---|
| 1 | reconcile.py `float(str(raw))` 类型窄化 | 158dbb2 | A3 | 过 B 新增 mypy 门禁面；语义不变；test_impact_reconciliation 全绿 |
| 2 | candidate.mjs 白名单补 models/.ruff_cache/.mypy_cache | 87df5c3 系 | A2 | 与 A2 CR#2 同类缺口；models/ 为契约声明 gitignored 目录；后两者为 B 新门禁工具缓存 |
| 3 | service.py import 冲突消解（B 超集 `Callable, Mapping`） | ad687d9 | A1+B | `import os` 由既有行覆盖；两侧功能保留；全测试绿 |
| 4 | ml_verification lightgbm `type: ignore[import-not-found]` | 83fafdf | A1 | 可选依赖（ml extra）延迟导入无 stub 的标准处理；off 路径零依赖已由 gate-6 三态复跑反证 |
| 5 | check-all 条件接入尺子 + H2_OFFICIAL_DATA_DIR 环境隔离 | 241569b/f94bdf1 | B | CR[A2]#1 裁决①；隔离防该变量（应用证据层开关）泄漏改变被测行为；CI（无官方数据）计划不变；delivery-tools 契约测试绿 |

## §2 裁决落地记录（change-requests.md 同步）

- CR[A3] IF-2 `ref_id` 放宽：接受，api.md → **v1.1**（OP- 合成键，77/77 唯一可回溯）
- CR[A2]#1 check-all 接入：按①落地（条件式运行时装配）
- CR[A2]#2 白名单：已入库
- detector_version v4→v5：**本记录 §3 执行清账**（28a175f）
- 维持记录：p2-base tag 指向（a4c6168，B 契约锚点，保留不改）；schemaVersion 2→3（通报性质，已双方知悉）

## §3 T14 冻结记录（用户豁免"B 同机"前提）

- 前提事实：B 线工作已全部并入 integration（dfeee9a8，零冲突）；B 远端无新增；用户明示单方交付授权
- **detector_version v4→v5**：4 文件（thresholds.json/settings.py/vocabulary.py 守卫/契约断言）+ 尺子基线重冻结（28a175f，77 窗 0 FP @ v5）；evaluate F1=0.9718 零回退复核
- 冻结套件（本记录提交后的 clean commit 上重跑，见 gate-s6 tag 指向）：check-all 全步（doctor/lint/双 typecheck/H2 测试/契约 QA/launcher/Python/仓库测试/构建/loopback 冒烟/whitespace/尺子）+ evaluate validation + overfit-sentinel + offline-deploy-smoke + check-submission
- 证据边界保留声明：主办方验收、官方评分、生产部署、真实换机第三方复现——仍无，且不得声称

## §4 交付判定

A 线任务池 T01-T13 ✓（T13=gate-1..6 + 本追认）；T11 gate-6 建议 go（`H2_ML_ENABLED` 默认 off，开关就绪，IF-3 已入 api.md v1.1）；T14 由本记录执行。**A/B 双线合并完成，判定可交付。**
## §5 实机端到端验证与守卫修复补充（2026-08-30）

- **Playwright 实测**（local 模式，官方验证集 CSV 58MB 经 UI 导入）：导入→质量门禁→分析(52.7s, 200)→工作区注水→助手 Q03 作答全通——答案含事实/计算/推断三分、真实影响值 84.33 kWh、citation 引用链、"未请求语言重述"隔离声明；总览/事件/诊断/分析/助手/报告六页渲染正常（仅 favicon 404 装饰性缺失）
- **交付阻断级 bug 修复**：`plugins/h2-ems/src/remote-anomaly-validation.ts` isEvent 闭合守卫缺 A3 T12 新增的 `rootCauseCitations` optional 键 → 所有含事件的分析响应被拒、local 导入必失败。修复=键入 optionalKeys（契约 optional 语义）；h2:test 138/138、h2:qa 6/6。交 A3/B 追认
- **教训登记**：h2:qa 契约测试过 ≠ TS 运行时守卫同步；此后 contracts 加法式字段必须同步 remote-anomaly-validation 白名单（optionalKeys）
