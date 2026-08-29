# M-Gate 前增量评审报告（A3 出具 ｜ 2026-08-29）

> 评审人：A3 ｜ 依据：internal-a.md v1.0「IF-A3→用户」｜ 性质：**gate-2 放行结论的增量复核**——M-Gate 1 合并仍未执行，本报告追平 gate-2 之后的新提交（A1 T06），使评审覆盖面与当前全部待合并内容一致。合并时可径引本报告 + gate-1/2。
> 方法：只读 diff + 隔离 worktree 纯树合并预演（PYTHONPATH 强制预演树 src，方法见 gate-2 §4 修正）；不代改任何他人文件。

## 0. 结论

**🟢 增量放行，合并建议与合并序（A1→A2→A3）维持不变。** T04-T06 三连至此全部完成且逐项过审。

## 1. 增量提交清单（gate-2 清单之外）

| 分支 | 新增提交 | 内容 | 类型 |
|---|---|---|---|
| feat/a1-rules | `6960ff3` | **T06 C06 去签名带**：SS 相对容量带 [0.35,0.45]×可用容量 + 可避免因果门（0.95×2×最小容量）；INEFF share2 相对带 [0.28,0.32] + run 首行锚定 + ELZ3 结构门（[0.45,0.55]×t 或容量贴顶 ±2kW）；效率门原样保留 | 代码+测试+阈值 |
| feat/a2-evalml | — | 停在 52b6dd1（T03b 收尾，断点移交 T08 进行中） | — |
| feat/a3-diag | — | 停在 5aff6df（gate-2） | — |

## 2. 越界检查与校准块 ✅

- **T06 改动文件**：`detection/c06.py`、`detection/rules.py`、`detection-thresholds.json`、`tests/test_detection_pipeline.py`——全部 A1 领土，无交叉。
- **校准块合规**：SS 与 INEFF 双段均附 `signatureBandChange` 四要素（from/to/rationale/exclusivityEvidence）。亮点实证：① SS 段 2025-11-27 ELZ03 降容日（407-454kW/407-454kW，ratio 1.0）被逐台容量分母 + 因果门正确排除；② INEFF 段"效率门单独在 TRAIN 多 21 长段（含 N02 型降容合理工况）、宽带 [0.25,0.35] 多 7288 段、事件外 share2 全数据带内零行（最近观测 0.24/0.33 两侧空档）"——份额条件"不可删只能相对化"论证完整。
- **等价性声明**："新旧管线 TRAIN 输出 byte-equal（276 事件全同，C06 20+20 边界零偏差）"为 A1 自报，与本评审独立复跑（§3 pytest 201 绿）不矛盾；官方 evaluate 全量对账仍列入合并后必办（承 gate-1 §4.1）。

## 3. 独立验证（隔离 worktree，2026-08-29 本会话）

| 验证项 | 结果 |
|---|---|
| 三方合并预演（a1@6960ff3 + a2@52b6dd1 + a3@5aff6df，A1→A2→A3 序） | ✅ 无冲突干净合并 |
| 纯合并树全量 pytest | ✅ **201 passed**（gate-2 时 195 + T06 新测试 6，数目吻合） |
| 纯合并树契约测试 | ✅ **83/83** |

## 4. 待办与移交（累计视图）

1. **合并后必办**（承 gate-1 §4.1，不变）：A1 补跑官方 evaluate（现含 T03b 指标与 T04-T06 全部判据）；A3 对账复验 + 尺子交叉验证。
2. **待裁决**：CR 3 条 + schemaVersion 2→3 通报 + gate-2 标注 b（领土表解释备案）+ p2-base tag 指向 + A1 detector_version 3 文件。
3. **gate-2 标注 a 维持**：C05 段 `toleranceRationale` 旧文本漂移仍未修（T06 未触碰该段）——A1 下次判据改动顺带更新。
4. gate-4+：A1 T07（C04/C07 判定矩阵）与 A2 T08-T09（特征/训练）为下一批。
