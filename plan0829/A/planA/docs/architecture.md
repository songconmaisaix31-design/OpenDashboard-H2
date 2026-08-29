# 架构设计（阶段 2 产出 · 承接版）

> 状态：**已冻结**（上游 `../../02_ALGO_ROBUSTNESS.md` 已拍板；本文件为 A 线视角的执行视图 + 领土表）
> 关键决策 ADR 见 `docs/decisions/`；跨机流程契约 = `../COORDINATION.md`；机内并行契约 = `docs/contracts/internal-a.md`

## 候选方案对比（上游已拍板，此处留档）

| 维度 | 方案一：仅规则稳健化 | 方案二：双轨并行（规则稳健化 + ML 混合） | 方案三：全 ML 替换 |
|---|---|---|---|
| 技术栈 | 现有规则引擎改造 | 规则 + LightGBM（ml extra 已声明） | LightGBM 为主 |
| 优点 | 风险最低 | 兼顾稳健与上限；ML 不达标可退 | 理论上限最高 |
| 缺点/风险 | 放弃算法上限 | 工作量最大、需治理可解释性 | 可解释性红线不可过；C01/C02/C06 归因无法覆盖 |
| 工作量 | ~8 人日 | ~14 人日 | >20 人日且违规 |
| 结论 | ❌ 被否（放弃上限，见 ADR-001） | ✅ **选用**（用户决策"全力引入ML"） | ❌ 被否（ADR-001） |

## 选定架构

### 技术栈（冻结）

| 层 | 选型 | 版本 | 理由（指向 ADR） |
|---|---|---|---|
| 分析服务 | Python / FastAPI / Pydantic（uv 锁定） | 3.11+ | 现状，检测管线所在（ADR-001） |
| 检测引擎 | 规则为主 + LightGBM 校验层 | lightgbm（ml extra） | ADR-001 |
| 评估工具 | Node 22 `node --test`（validation/*.mjs） | 22.x | 现状，evaluate.mjs 扩展 |
| 阈值配置 | `detection-thresholds.json`（校准记录块） | — | 可解释红线（ADR-003） |

### 系统结构（A 线可见管线）

```
官方数据（train/validation + 台账/约束/曲线/日志/合理工况）
  → ingestion（B线，只读消费）→ detection/rules.py（七类规则判据）
      ├─ detection/c03.py（两段式因果门）  ├─ detection/c06.py（反事实重分配）
      ├─ events/aggregator.py（聚合/确认行） → diagnosis/builder.py（证据/根因）
      ├─ impact/calculators.py（7 官方公式） → safety/evaluator.py（约束检查）
      └─ [P1-9] LightGBM 校验层（C03/C04/C05/C07 + 全类别二次评分，默认关闭）
  → validation/evaluate.mjs（F1/lead_time/检出率） + normal-context-regression.mjs（误报尺子）
```

### 模块/领土划分表 ★并行开发的依据（与 `../COORDINATION.md` §2 一致；机内三 Agent 细分见 `docs/contracts/internal-a.md`）

| 模块 | 职责 | 目录 | 归属 | 对外接口 |
|---|---|---|---|---|
| 检测判据 | 七类异常规则 + 前瞻判据 | `services/h2-analytics/src/h2_analytics/detection/`、`events/` | A 独占（机内 A1） | api.md IF-5 |
| 影响量化 | 7 官方公式 | `impact/` | A 独占（机内 A3） | api.md IF-1 口径说明 |
| 诊断/根因 | 证据链 + 根因文本 | `diagnosis/`、`evidence.py` | A 独占（机内 A3） | api.md IF-2 条目引用结构 |
| 安全评估 | 约束检查 | `safety/` | A 独占（机内 A1） | — |
| ML 通道 | 特征/训练/登记 | `tools/`、`models/`(ignored)、`MODELS_REGISTRY.md` | A 独占（机内 A2） | api.md IF-3 演示口径 |
| 评估工具 | 指标尺子 | `validation/evaluate.mjs`、`normal-context-regression.mjs`、`lib/`、`baseline/` | A 独占（机内 A2；lib 允许 B 增量） | api.md IF-4 指标定义 |
| 助手/导入/交付/前端 | — | assistant/ingestion/api/apps/web/scripts/ci | **B 独占（A 只读）** | api.md |
| 共享-增量 | 契约 | `packages/h2-contracts/**` | 双方增量（机内由 A3 落笔） | 加法式变更 + h2:qa |

### 数据模型概要

核心实体：`DetectionCandidate`（row_index/timestamp/code/subtype/confidence/detector_version/implicated_equipment_ids）→ 聚合事件（event_id `{code}-{YYYYMMDD}-{ordinal:03d}`、first_detection_time）→ 证据项（时间/变量/实际值/参考值）→ 影响值（7 官方公式）→ 提交行（16 列）。阈值经 `vocabulary.detection_thresholds()` 从冻结 JSON 读取并模块级常量化。

## 风险与对策（详见 `../../06_RISK_AND_VALIDATION.md` §1）

| 风险 | 概率 | 影响 | 对策 |
|---|---|---|---|
| R-01 去签名带召回断崖 | 中 | 高 | 逐类独立 commit + 四重门禁 |
| R-02 ML 过拟合 | 中 | 高 | rolling 分割/哨兵/3 seed/默认关闭 |
| R-03 ML 不可解释 | 低 | 高 | 强制 top-5 特征入证据链 |

## 决策记录索引

| ADR | 决策 | 日期 |
|---|---|---|
| ADR-001 | ML 混合采用"规则为主、ML 校验层 + 开关灰度" | 2026-08-29 |
| ADR-002 | N01-N07 只作误报回归尺子，不作训练增强 | 2026-08-29 |
| ADR-003 | 去签名带三级鲁棒判据 + 逐类独立 commit 门禁 | 2026-08-29 |
| ADR-004 | lead_time / 10 分钟检出率指标口径 | 2026-08-29 |