from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from .settings import CONFIGURATION_VERSION, RULE_VERSION

ANOMALY_CODES = ("C01", "C02", "C03", "C04", "C05", "C06", "C07")
SEVERITIES = ("low", "medium", "high", "critical")
ANOMALY_SUBTYPES_BY_CODE = {
    "C01": ("SETPOINT_OSCILLATION",),
    "C02": ("CAPACITY_NOT_SYNCHRONIZED",),
    "C03": ("BESS_DIRECTION_REVERSED",),
    "C04": ("EXPORT_POWER_LIMIT_NOT_TRACKED", "IMPORT_POWER_LIMIT_NOT_TRACKED"),
    "C05": ("EXPORT_ENERGY_QUOTA_RISK", "IMPORT_ENERGY_QUOTA_RISK"),
    "C06": ("AVOIDABLE_START_STOP", "INEFFICIENT_POWER_ALLOCATION"),
    "C07": ("CHARGE_HEADROOM_SHORTFALL", "DISCHARGE_RESERVE_SHORTFALL"),
}
PRIMARY_IMPACT_METRIC_BY_CODE = {
    "C01": "bess_extra_regulation_energy_kwh",
    "C02": "unserved_elz_energy_kwh",
    "C03": "abnormal_grid_exchange_energy_kwh",
    "C04": "pcc_power_limit_violation_energy_kwh",
    "C05": "grid_energy_quota_deviation_kwh",
    "C06": "extra_energy_consumption_kwh",
    "C07": "bess_regulation_reserve_shortfall_kwh",
}
ASSISTANT_QUESTIONS = (
    ("Q01", "PCC正值和负值分别代表什么？"),
    ("Q02", "如何区分PCC功率越限与电量配额异常？"),
    ("Q03", "储能方向异常如何影响PCC功率？"),
    ("Q04", "如何判断SOC调节备用是否不足？"),
    ("Q05", "设备降额但EMS未同步如何定位？"),
    ("Q06", "如何区分云团变化和控制指令振荡？"),
    ("Q07", "如何评价多台电解槽负荷分配？"),
    ("Q08", "哪些建议必须人工确认？"),
    ("Q09", "生成测试集异常诊断报告。"),
    ("Q10", "PCC合规日报包含哪些内容？"),
)
ASSISTANT_QUESTION_IDS = tuple(question_id for question_id, _ in ASSISTANT_QUESTIONS)
ASSISTANT_PROMPTS = dict(ASSISTANT_QUESTIONS)
SUBMISSION_COLUMNS = (
    "pred_event_id",
    "start_time",
    "end_time",
    "anomaly_code",
    "anomaly_subtype",
    "severity",
    "primary_control_object",
    "affected_equipment",
    "confidence",
    "evidence_json",
    "root_cause",
    "recommended_action",
    "primary_impact_metric",
    "estimated_impact_value",
    "first_detection_time",
    "requires_human_confirmation",
)

FIXTURE_FINGERPRINT = (
    "sha256:799ff8549663152c784ad8d687d0df7108e295cf3d96311b122ad146c624f9ca"
)
FIXTURE_GENERATED_AT = "2026-01-05T10:45:00Z"
FIXTURE_LIMITATIONS = (
    "Synthetic, sanitized C03/C04 contract fixture only.",
    "Not an official competition dataset or score artifact.",
)
LIVE_LIMITATIONS = (
    "Deterministic local analysis; no official-dataset score is claimed.",
    "Fallback row rules cover only frozen C03/C04 field mappings.",
)

FIELD_DEFINITIONS: dict[str, dict[str, Any]] = {
    "timestamp": {
        "displayNameZh": "时间戳",
        "role": "timestamp",
        "required": True,
    },
    "pv_actual_kw": {
        "displayNameZh": "光伏实际功率",
        "role": "measurement",
        "required": True,
        "unit": "kW",
    },
    "bess_power_kw": {
        "displayNameZh": "储能功率",
        "role": "measurement",
        "required": True,
        "unit": "kW",
    },
    "pcc_power_kw": {
        "displayNameZh": "并网点功率",
        "role": "measurement",
        "required": True,
        "unit": "kW",
    },
    "total_electrolyzer_power_kw": {
        "displayNameZh": "电解槽总功率",
        "role": "measurement",
        "required": True,
        "unit": "kW",
    },
    "auxiliary_load_kw": {
        "displayNameZh": "辅助负荷",
        "role": "measurement",
        "required": True,
        "unit": "kW",
    },
    "bess_soc_percent": {
        "displayNameZh": "储能荷电状态",
        "role": "measurement",
        "required": True,
        "unit": "percent",
    },
    "pcc_export_limit_kw": {
        "displayNameZh": "并网点送出上限",
        "role": "constraint",
        "required": True,
        "unit": "kW",
    },
    "pcc_import_limit_kw": {
        "displayNameZh": "并网点受电上限",
        "role": "constraint",
        "required": True,
        "unit": "kW",
    },
    "bess_dispatch_command_kw": {
        "displayNameZh": "储能调度指令",
        "role": "measurement",
        "required": True,
        "unit": "kW",
    },
}
REQUIRED_FIELDS = tuple(FIELD_DEFINITIONS)
NUMERIC_FIELDS = tuple(name for name in REQUIRED_FIELDS if name != "timestamp")


def build_provenance(
    *,
    mode: str,
    generated_at: str,
    fingerprint: str | None,
    source: str | None = None,
    model_version: str | None = None,
    renderer_version: str | None = None,
    limitations: Sequence[str] | None = None,
) -> dict[str, Any]:
    is_fixture = mode == "FIXTURE"
    value: dict[str, Any] = {
        "mode": mode,
        "source": source
        or ("sanitized-golden-fixture" if is_fixture else "in-memory-csv-import"),
        "generatedAt": generated_at,
        "ruleVersion": RULE_VERSION,
        "configurationVersion": CONFIGURATION_VERSION,
        "limitations": list(
            limitations
            if limitations is not None
            else (FIXTURE_LIMITATIONS if is_fixture else LIVE_LIMITATIONS)
        ),
    }
    if fingerprint is not None:
        value["datasetFingerprint"] = fingerprint
    if model_version is not None:
        value["modelVersion"] = model_version
    if renderer_version is not None:
        value["rendererVersion"] = renderer_version
    return value
