from __future__ import annotations

from dataclasses import dataclass

API_NAMESPACE = "/api/v1/h2-sentinel"
API_VERSION = "v1"
SERVICE_VERSION = "0.1.0"
RULE_VERSION = "h2-rules-v2"
FEATURE_VERSION = "h2-features-v1"
AGGREGATION_VERSION = "h2-events-v2"
CONFIGURATION_VERSION = "official-constraints-v1"
FALLBACK_DETECTOR_VERSION = "deterministic-c01-c07-v4"
# P1-9 ML 校验层总开关（ADR-001 灰度混合）：默认 False = 纯规则模式；
# 灰度五条（off 一致/指标不降/哨兵绿/top-5 特征/3 seed 方差）全过并经 D12 go/no-go 后方可置 True。
# D1 共同日 A 侧预置条目；B 侧流式导入配置条目由 B 机补写（COORDINATION §2 共享-预置）。
H2_ML_ENABLED = False
MAX_CSV_BYTES = 96 * 1024 * 1024
MAX_CSV_ROWS = 180_000
OFFICIAL_DATASET_ROW_COUNTS = {
    "train": 525_600,
    "validation": 129_600,
    "test": 172_800,
}
OFFICIAL_SINGLE_IMPORT_BYTES = {
    "validation": 58_368_123,
    "test": 77_865_257,
}


@dataclass(frozen=True, slots=True)
class H2Constraints:
    bess_soc_min_percent: float = 20.0
    bess_soc_max_percent: float = 90.0
    bess_max_power_kw: float = 500.0
    bess_energy_capacity_kwh: float = 1_000.0
    electrolyzer_min_stable_power_kw: float = 300.0
    electrolyzer_max_power_kw: float = 1_000.0
    electrolyzer_ramp_limit_kw_per_minute: float = 120.0
    pcc_boundary_detection_margin_kw: float = 0.0
    power_balance_warning_kw: float = 50.0


DEFAULT_CONSTRAINTS = H2Constraints()
