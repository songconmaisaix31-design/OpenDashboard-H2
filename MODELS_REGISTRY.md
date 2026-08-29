# 模型登记簿（MODELS_REGISTRY）

> A2 领土：ML 模型产物不入库（models/ gitignored），本文件登记供 A1 接线（T11）只读消费；
> 契约 = internal-a.md IF-A2→A1（SHA256/参数/训练数据哈希/3 seed 方差/detector_version 建议值）。

## h2-lgbm-row-v1

- 登记日期：2026-08-29
- 模型文件：h2-lgbm-row-v1-seed1.txt, h2-lgbm-row-v1-seed2.txt, h2-lgbm-row-v1-seed3.txt（gitignored，本地 models/）
- SHA256：{"h2-lgbm-row-v1-seed1.txt": "0d3bca24f7d42fe2d11384b47513d5617bb315e4976560d27c7db654d6521cdd", "h2-lgbm-row-v1-seed2.txt": "68ed13572ba4fe0686a60258d7dec24e4442c205e1dc005a98dd1e59510f2427", "h2-lgbm-row-v1-seed3.txt": "e70b86ca36453b00000e0287ecd673e89513c5091a9142e185721512f4b33f66"}
- 特征：69 列（`tools/features.py` FEATURE_NAMES，全因果窗）
- 类目：NORMAL, C03, C04, C05, C07（C01/C02/C06 为规则领地，行级过滤）
- 超参（固定，无调参循环）：`{"objective": "multiclass", "num_class": 5, "metric": "multi_logloss", "learning_rate": 0.05, "num_leaves": 31, "min_data_in_leaf": 200, "feature_fraction": 0.9, "bagging_fraction": 0.8, "bagging_freq": 1, "verbosity": -1, "numBoostRound": 400, "earlyStoppingRounds": 50}`
- 训练数据：train 511281 行；validation 126063 行仅早停
- 数据哈希：{"trainFeatures": "1c99ef2095066519e84058e40a6a05b44a7d4f554d7b2375735c352fefc8eaed", "trainLabels": "0c4cc3a0de09695eff47c84e9514d36c2cc81149c7f0d0b304b22df30d5888a8", "validationFeatures": "296bb10c1e9a31b8ca37c4550fbf10b5be572d0dc29791d1838b382c3beeef76", "validationLabels": "5e623cf9ad90a6195cb9abec5aaae6be7b2114b34cb0f56d15c8a293589af70c"}
- 3 seed 方差（validation macro-F1）：std=0.000000，max−min=0.000000，seeds=[1, 2, 3]
- rolling 月分割 macro-F1（train 内无偏参考，seed=1）：{"2025-07": 0.8, "2025-08": 1.0, "2025-09": 1.0, "2025-10": 1.0, "2025-11": 1.0}
- detector_version 建议值：`h2-ml-row-lgbm-v1`（模型命名空间，非检测器 v4/v5）
- 灰度开关：`H2_ML_ENABLED`（默认 false；ADR-001 灰度五条为启用前置）

### 注记（T09 训练会话，2026-08-29）

- **行级 1.0 的成因**：官方行级标签由运行量阈值化派生（C05=quota 裕量、C03=指令带、C04=越限跟踪、C07=备用差值），
  裕量特征族即判别面本身 → 行级完全可分。**消融证据**：去掉 system_alarm_count + 全部日志邻近特征后
  validation macro-F1 仍 = 1.0（排除报警/日志泄漏驱动）；gain top 特征全为裕量/滑窗物理量
  （reserve_target / discharge_power 裕量 / cmd 滑窗分位极差 / quota 裕量 / ELZ 跟踪误差）。
- **泛化的诚实信号**：rolling 首折 2025-07 = 0.8（前 6 个月分布与后期不同）；validation 1.0 是早停集指标非无偏。
  事件级泛化考验在 T11 灰度（事件级 F1 门禁 + N01-N07 误报尺子）。
- **环境坑**：lightgbm 4.7 要求 data 为 ndarray（list-of-list 被拒，`_as_numpy` 处理）；
  本机 venv 曾出现 lightgbm 包损坏（缺 `__init__.py`/`basic.py`，import 得到空 namespace），
  以 `uv sync --reinstall-package lightgbm --locked --extra ml` 修复——重训/接线前若遇
  `module 'lightgbm' has no attribute ...` 先查包完整性。
- 条目由 `models/train-report-h2-lgbm-row-v1.json` 经 `registry_entry_markdown()` 生成（未用 --registry-append
  以避免重复训练；sha256 与报告一致）。
