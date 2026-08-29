# 状态文件（Agent A2 · 评估与 ML 域）

> 全量重写式维护；每次任务完成或会话结束更新。

## 当前契约版本

internal-a.md v1.0 / api.md v1.0

## 当前任务

**T08（P1-9a 特征工程）已完成，待 M-Gate 合并**（feat/a2-evalml @ 652696a，T08 单提交）

## 已完成任务

### T08 ｜ P1-9a 特征工程 features.py（2026-08-29 完成）

- **交付**：`tools/features.py`（纯标准库——环境无 pandas/numpy）+ `tools/tests/test_features.py`（23 例）
- **特征面**：`FEATURE_NAMES` 六族 69 个（docstring 覆盖清单 + `--catalog` JSON 双出口）：
  族0 直通 8 ｜ 族1 滑窗统计 30（6 量×mean/range/p10/p90 + ELZ 三台指令×mean/range，C03 判别面）｜
  族2 一阶差分 6 ｜ 族3 速率 6（rate5 grid 剩余能量速率 = C05 前瞻同源）｜ 族4 裕量/跟踪误差 13
  （备用差值 = C07 前瞻同源）｜ 族5 符号翻转 2 ｜ 族6 日志邻近 4（先验窗 (t−90, t−20]，split 过滤防跨集泄漏）
- **纪律落实**：全因果窗防泄漏（未来行不改历史特征，有专门测试）；缺失传播 None 禁编造 0；
  不读 13_normal_context（ADR-002）；约束/效率曲线不入模（02§4.5）；确定性输出（3 seed 复现基础）；
  窗口口径常量锚点（改动即口径变更须同步清单与 MODELS_REGISTRY）
- **接口对齐**：特征 = 行级命名值，与 `lightgbm_adapter.py` 的 `feature_names` 接口一致；T09 消费 CLI 特征 CSV，
  行级标签 06/07 对齐归 T09；T11/A1 接线按 FEATURE_NAMES 只读消费
- **验证**：pytest 23/23 绿（`uv run --project services/h2-analytics pytest tools/tests/test_features.py`，
  显式路径不受 testpaths 限制）；真实官方数据冒烟：train 前 2000 行 × 69 特征，BOM 解析 ✓，missing 36 格
  均为首行/前导窗合法缺失
- **领土扩展备案**：契约字面 A2 独占 `tools/{features,train_lightgbm}.py`；本任务因验收要求单测新增
  `tools/tests/` 子目录（加法、无冲突），已在 plan.md 行与 commit 备案，待 M-Gate/指挥官确认

### T03b ｜ P0-5 lead_time_minutes 与 10 分钟检出率（2026-08-29 完成 @ d53a939）

- 口径 = ADR-004/IF-4 字面；报告 schema v3 + detectionExpectation 节 + 哨兵 canonical 防篡改；
  契约测试 83/83；真实管线 F1=0.9718 逐位同基线、报告过哨兵断言
- 实测（A2 分支 v4 检测器）：C05 lead 10/10=3min>0 ✓；C07 10/10=0min（待合 A1-T03a → 2min）；
  5 类检出率 0.76（unmatched=VA0005 即基线 FN；overdue 11=VA0001-0010/0040/0053 留档判据侧）

### T02 ｜ P0-4 N01-N07 误报回归尺子（2026-08-29 完成 @ 21a5029）

- 基线全零误报（77 窗口 0 FP @h2-rules-v2）；check 门禁正/负双向验证过；详见 git 提交信息

## 断点（下一会话从这里继续）

1. 下一任务 **T09**（P1-9b `tools/train_lightgbm.py`：训练 + 3 seed + MODELS_REGISTRY 登记）：
   - 数据：features.py CLI 产出的特征 CSV（train + validation）与 06/07 行级标签按时间戳对齐；
     **只用 train+validation，禁测试集**；validation 仅早停/调参（02§4.3）
   - 分割：按月 rolling 时间分割防泄漏；类目 = 行级 anomaly_code（C03/C04/C05/C07 主战场 + NORMAL）
   - 产物：`models/<name>.lgb`（gitignored）+ `MODELS_REGISTRY.md` 登记
     （SHA256/参数/训练数据版本哈希/3 seed 方差/`detector_version` 建议值）——IF-A2→A1 模型交付契约
   - 环境：lightgbm 在 h2-analytics ml extra（`uv sync --locked --extra ml`）
2. 训练前重跑特征全量导出（train 125 日 + validation 51 日，纯 Python 预计数分钟级）
3. worktree 复跑清单（三坑）：① 日志放树外；② 先 `uv sync --locked --extra dev`；③ 根目录 `npm ci`
4. MODELS_REGISTRY.md 建在仓库根（契约 A2 领土含 `models/**`(ignored) + MODELS_REGISTRY.md）

## 待确认决策（等指挥官，均已报备）

1. **check-all 接入**（change-requests [A2] #1）：B 线落地后接入 vs 授权 A2 先建（A2 倾向前者）
2. **p2-base tag 指向**：现指 a4c6168（B 线契约），非 7007e3d（D1 证据绑定点）——是否移动由你定
3. **schemaVersion 2→3**（T03b）：报告结构加法演进 + 哨兵同步；B 线若有 v2 硬编码消费方请告知
4. **tools/tests/ 领土扩展**（T08）：契约字面外新增单测目录，加法无冲突——需追认或并入契约 v1.1

## 已提交的变更请求指针

- change-requests.md 两条 [A2]（2026-08-29）：check-all.mjs 属 B 领土无法接入；T01 白名单缺口已在 A2 领土内修复备案

## 附注（git 操作记录，供 M-Gate 审阅）

- A2 提交链（纯 A2）：41aedd8→69d78cd→21a5029→08bac29→d53a939→52b6dd1→**652696a**（feat/a2-evalml）
- T08 会话内收到例行重启指令一次，核对契约仍 v1.0 无冲突，按"一会话一任务"继续在途 T08 未切换
- 主工作树在 feat/a2-evalml（652696a）；A1（a1-work）/A3（a3-work）worktree 未触碰
