# 状态文件（Agent A1 · 规则域）

> 全量重写式维护；每次任务完成或会话结束更新。

## 当前契约版本

internal-a.md v1.0 / api.md v1.0

## 当前任务

**T11 已完成待合并**（feat/a1-t11-ml @ edcfab3，含 cherry-pick d542c4c），等待指挥官 M-Gate 指令。A1 任务池任务（T03a/T04-T07/T11）已全部完成。

## 已完成任务

- **T03a**（bf4277e）：C05/C07 前瞻判据 + C07 确认行 1→3。N05/N07 22/22 零候选；TRAIN 输出不变；lead_time C05=3min/C07=2min>0。
- **T04**（52d7435）：C03 去签名带——相对带 [0.75,0.85]×限额 + 平台 + 因果门。TRAIN 候选 2717 逐行一致、40/40、边界零偏差、FP 0。
- **T05**（9155fd3）：C05 去签名带——相对带 [0.55,0.7] + quota 排他 + run 锚定。TRAIN 段恰 40、边界零偏差、FP 0。
- **T06**（6960ff3）：C06 去签名带——SS 相对容量带 + INEFF 滑窗份额带 + ELZ3 结构门。TRAIN 新旧 byte-equal。
- **T07**（bae530e）：C04/C07 可执行纠偏判定矩阵三分支。TRAIN 276 事件 byte-equal。
- **T11**（2026-08-29，edcfab3 @ feat/a1-t11-ml）：P1-9c ML 校验层接线 + 灰度五条全绿（M3 里程碑 A1 侧收官）。
  - **接线**：`service.py` run_analysis 检测编排段接入 `detection/ml_verification.py::ml_supplemental_candidates`——规则为主、ML 只补充：规则候选原样保留；补充候选与规则/fixture 候选 `(row_index, code, subtype)` 排他；LIVE C03 因果门后置覆盖 ML 补充。开关 = `settings.H2_ML_ENABLED`（默认 False）或 env `H2_ML_ENABLED=true`（灰度评测通道：evaluate/哨兵/尺子 → launcher → `uv run` 全链 env 透传，与 `H2_LLM_ENABLED` 同式）。
  - **ml_verification.py**（新）：特征桥接对齐 `tools/features.py` 单一事实源（列序命名 + 逐值一致由单测双锚拦截漂移；族 6 日志特征运行时恒缺失，registry 消融已证非判别主力）；三 seed SHA256 与 MODELS_REGISTRY 摘录值比对拒载；off 路径零 lightgbm 依赖（延迟导入）；类目→subtype 行级方向语义与规则判据同口径。
  - **灰度五条（A-5 验收，全部 @ commit edcfab3）**：
    1. **off=逐字节一致** ✓：TRAIN 276 事件 JSON 与 base（dc8e7b1）byte-equal（3,117,359 bytes，T06 方法 stash 对照双跑）；官方评估 off F1=0.971830985915493 与 I1 冻结值逐位一致（tp=69/fp=3/fn=1）。
    2. **on=F1 不降、误报不升** ✓：on 官方评估 F1 同值 0.971830985915493、tp/fp/fn 全同。**消歧证据**：rawCount off=75 → on=91（ML 在服务路径真实执行、env 生效），mergedCount 72=72（+16 原始事件全被 grace 合并吸收、零新增事件）——指标一致的成因确证非"ML 未跑"。
    3. **哨兵绿** ✓：on 模式 |ΔF1|=0.012040 ≤ 0.15（与 I1 off 模式 0.012 一致）。
    4. **top-5 特征** ✓：MODELS_REGISTRY 注记引用——gain top 全为裕量/滑窗物理量（reserve_target / discharge 裕量 / cmd 滑窗分位极差 / quota 裕量 / ELZ 跟踪误差），非日志/报警泄漏。
    5. **3 seed 方差可接受** ✓：registry std=0.000000，max−min=0.000000。
    - **附加**：误报尺子 on 模式 check PASSED——N01-N07 各 11 窗 ×7 = 77 窗全 0 FP，violations 空，与冻结基线（21a5029）一致。
  - **静态门禁**：pytest 210 绿（新 6 测试：特征双锚一致 / SHA 拒载 / 排他不重叠 / off golden / on 规则保留）；ruff（E4,E7,E9,F）绿；detection+service mypy 干净。
  - **灵敏度数据（D12 go/no-go 输入）**：validation 129,600 行 ML 异常 argmax 行 14,992（C05 8059/C07 5250/C04 952/C03 731），置信度 ≥0.9 占 99.8%；排他后补充候选 0.9→1650、0.5→1666（阈值不敏感，排他键为主控）——规则已覆盖 ML 判别面的绝大部分，ML on 在 0.9 门槛下零指标扰动。
  - **IF-3 口径（api.md v1.0 形状，待 I4 交付 B）**：`{"ml_enabled": false, "statement": "ML 校验层已实现并通过灰度门禁；当前配置为纯规则模式，可通过 H2_ML_ENABLED 开启"}`。

## 断点

- **A1 任务池清零**（T03a/T04-T07/T11 全完成）。剩余任务池项：T13/T14（A3/ALL）。下一可能场景：M-Gate 3 合并 feat/a1-t11-ml（建议对齐 I4/D12，需 A3 出 gate 评审）、D12 go/no-go（灰度五条证据板在上方）、I4 整合门（轮值整合人 A）。
- 官方数据目录：`D:\allcode\h2-t01-official\dataandfiles`。

## ⚠️ 并行协作记录

1. **worktree 工作模式**：A1 现役 worktree `%TEMP%\a1-t11`（feat/a1-t11-ml，T11 专用）；历史 `%TEMP%\a1-work`（feat/a1-rules @ bae530e）可由指挥官清理。
2. **cherry-pick d542c4c**（= 指挥官 87df5c3 原文 `-x` 照搬，A2 领土文件 validation/lib/candidate.mjs 白名单 +5 行）：dc8e7b1 基 worktree 跑官方评估必需（models/ 未在旧白名单会锁死 clean-tree 检查）。**交 A3 门审 + A2 追认**（与该 fixup 在 integration 分支的追认状态一致）。
3. **detector_version 递增**（挂账，T03a 起未决）：判据五连改后仍 v4；递增需同步 vocabulary.py:399 / settings.py:12 / test_official_contract.py:79 三处非 A1 领土文件，建议随 M-Gate 统一处理。ML 层用独立命名空间 `h2-ml-row-lgbm-v1`（registry 建议值）不参与 v4/v5。
4. **ADR-004 口径备注**（挂账）：跳变型 onset 下以 lead_time>0 + 先于硬性超限实现"提前预警"。
5. **C04 碎片化挂账**：TR0124/TR0152 聚合 gap 断段（maximumGapIntervals=1）；非 A-4 范围未动。
6. **UV_NO_SYNC=1 运行时通道**（新）：launcher `uv run --extra dev` 默认精确同步会剥 lightgbm；on 模式官方评估须 `H2_ML_ENABLED=true UV_NO_SYNC=1` 前缀（env 全链透传，不改文件）。哨兵/评估重型作业勿与本机其他全量任务并发（首跑哨兵 train-last-90 曾因争抢超时，无争抢重跑即绿）。
7. **门禁补跑欠账已清**：T03a-T07 判据级等效验证 + T11 官方评估/哨兵/尺子均已在 clean commit edcfab3 复跑登记。

## 待确认决策

（无新增；挂账见记录 3-5）

## 已提交的变更请求指针

（无）

## 会话备注

- 会话起点：契约 v1.0 无升级；断点续作 T11（T09 已交付解除依赖）。上一压缩会话已建 worktree `%TEMP%\a1-t11` + ml_verification.py/test 草稿（未跟踪），本会话完成 service.py 接线与全部灰度门禁。
- worktree 复跑三坑实证：venv 需 `uv sync --locked --extra dev --extra ml`；根目录需 `npm ci`（launcher 本地模式起 web）；误报尺子基线 json（gitignored）需从主仓复制到 `validation/baseline/`。
- TRAIN byte-equal 方法沿用 T06：stash 接线改动跑 base → pop 跑 wired-off → cmp（本会话脚本未入仓）。
- 临时脚本/日志（t11-*.py/t11-*.log/JSON）在 %TEMP%，未入仓。
