from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

_VOCAB_RELATIVE = "packages/h2-vocabulary/data"
_ENV_OVERRIDE = "H2_VOCABULARY_DIR"

_ROLE_BY_CATEGORY = {
    "时间": "timestamp",
    "电网约束": "constraint",
}

_KIND_BY_EQUIPMENT_PREFIX = {
    "PV": "PV",
    "BESS": "BESS",
    "PCC": "PCC",
    "GRID": "GRID",
    "EMS": "EMS",
    "ELZ": "ELECTROLYZER",
    "AUX": "AUXILIARY_LOAD",
}


class VocabularyError(RuntimeError):
    pass


def vocab_dir() -> Path:
    return _resolve_vocab_dir()


@lru_cache(maxsize=1)
def _resolve_vocab_dir() -> Path:
    override = os.environ.get(_ENV_OVERRIDE, "").strip()
    if override:
        candidate = Path(override).resolve()
        if not candidate.is_dir():
            raise VocabularyError(
                f"H2_VOCABULARY_DIR does not point to a directory: {candidate}"
            )
        return candidate
    current = Path(__file__).resolve().parent
    for _ in range(14):
        candidate = (current / _VOCAB_RELATIVE).resolve()
        if candidate.is_dir():
            return candidate
        if current.parent == current:
            break
        current = current.parent
    raise VocabularyError(
        f"Could not locate the frozen vocabulary at {_VOCAB_RELATIVE}."
    )


def _load_json(name: str) -> Any:
    path = vocab_dir() / name
    if not path.is_file():
        raise VocabularyError(f"Vocabulary file is missing: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def _load_text(name: str) -> str:
    path = vocab_dir() / name
    if not path.is_file():
        raise VocabularyError(f"Vocabulary file is missing: {path}")
    return path.read_text(encoding="utf-8")


@lru_cache(maxsize=1)
def load_fields() -> tuple[dict[str, Any], ...]:
    return tuple(_load_json("fields.json")["fields"])


@lru_cache(maxsize=1)
def load_taxonomy() -> tuple[dict[str, Any], ...]:
    return tuple(_load_json("anomaly-taxonomy.json"))


@lru_cache(maxsize=1)
def load_equipment() -> tuple[dict[str, Any], ...]:
    return tuple(_load_json("equipment.json"))


@lru_cache(maxsize=1)
def load_constraints() -> tuple[dict[str, Any], ...]:
    return tuple(_load_json("constraints.json"))


@lru_cache(maxsize=1)
def load_efficiency_curves() -> tuple[dict[str, Any], ...]:
    return tuple(_load_json("efficiency-curves.json"))


@lru_cache(maxsize=1)
def load_assistant_questions() -> tuple[dict[str, Any], ...]:
    return tuple(_load_json("assistant-questions.json"))


@lru_cache(maxsize=1)
def load_deprecated_field_map() -> dict[str, Any]:
    return _load_json("deprecated-field-map.json")


@lru_cache(maxsize=1)
def load_detection_thresholds() -> dict[str, Any]:
    return _load_json("detection-thresholds.json")


@lru_cache(maxsize=1)
def load_impact_formulas() -> dict[str, Any]:
    return _load_json("impact-formulas.json")


@lru_cache(maxsize=1)
def load_submission_equipment_tokens() -> dict[str, Any]:
    return _load_json("submission-equipment-tokens.json")


@lru_cache(maxsize=1)
def knowledge_base() -> str:
    return _load_text("knowledge-base.md")


@lru_cache(maxsize=1)
def field_definitions() -> dict[str, dict[str, Any]]:
    definitions: dict[str, dict[str, Any]] = {}
    for field in load_fields():
        name = field["name"]
        role = _ROLE_BY_CATEGORY.get(field.get("category", ""), "measurement")
        if name == "timestamp":
            role = "timestamp"
        definitions[name] = {
            "name": name,
            "chineseName": field.get("chineseName", name),
            "category": field.get("category", ""),
            "dataType": field.get("dataType", ""),
            "unit": field.get("unit", ""),
            "sign": field.get("sign", ""),
            "description": field.get("description", ""),
            "formula": field.get("formula", ""),
            "isDerived": bool(field.get("isDerived", False)),
            "relatedAnomaly": tuple(field.get("relatedAnomaly", ())),
            "role": role,
            "required": True,
        }
    return definitions


@lru_cache(maxsize=1)
def official_field_names() -> tuple[str, ...]:
    return tuple(field_definitions())


@lru_cache(maxsize=1)
def numeric_field_names() -> tuple[str, ...]:
    return tuple(name for name in official_field_names() if name != "timestamp")


def field_descriptor(name: str) -> dict[str, Any]:
    definition = field_definitions().get(name)
    if definition is None:
        return {
            "name": name,
            "displayNameZh": name,
            "role": "metadata",
            "required": False,
        }
    return {
        "name": name,
        "displayNameZh": definition["chineseName"],
        "role": definition["role"],
        "required": definition["required"],
        "unit": definition["unit"],
    }


@lru_cache(maxsize=1)
def taxonomy_by_code() -> dict[str, dict[str, Any]]:
    return {entry["code"]: dict(entry) for entry in load_taxonomy()}


@lru_cache(maxsize=1)
def anomaly_codes() -> tuple[str, ...]:
    return tuple(entry["code"] for entry in load_taxonomy())


@lru_cache(maxsize=1)
def severity_by_code() -> dict[str, str]:
    return {entry["code"]: entry["severity"] for entry in load_taxonomy()}


@lru_cache(maxsize=1)
def wire_severity_by_code() -> dict[str, str]:
    """Maps public Chinese taxonomy labels to the stable API severity enum."""
    wire_by_label = {"中": "medium", "高": "high"}
    return {
        code: wire_by_label[severity]
        for code, severity in severity_by_code().items()
    }


@lru_cache(maxsize=1)
def primary_control_object_by_code() -> dict[str, str]:
    return {
        entry["code"]: entry["primaryControlObject"] for entry in load_taxonomy()
    }


@lru_cache(maxsize=1)
def primary_impact_metric_by_code() -> dict[str, str]:
    return {entry["code"]: entry["primaryImpactMetric"] for entry in load_taxonomy()}


@lru_cache(maxsize=1)
def subtypes_by_code() -> dict[str, tuple[str, ...]]:
    return {
        entry["code"]: tuple(
            subtype["code"] for subtype in entry["subtypes"]
        )
        for entry in load_taxonomy()
    }


@lru_cache(maxsize=1)
def affected_equipment_by_code() -> dict[str, tuple[dict[str, str], ...]]:
    return {
        entry["code"]: tuple(
            {
                "equipmentId": item["equipmentId"],
                "equipmentName": item["equipmentName"],
            }
            for item in entry["affectedEquipment"]
        )
        for entry in load_taxonomy()
    }


@lru_cache(maxsize=1)
def equipment_by_id() -> dict[str, dict[str, Any]]:
    return {entry["equipment_id"]: dict(entry) for entry in load_equipment()}


@lru_cache(maxsize=1)
def affected_equipment_tokens_by_code() -> dict[str, tuple[str, ...]]:
    """Official `affected_equipment` submission tokens for each anomaly code."""
    values = load_submission_equipment_tokens()["tokensByCode"]
    return {code: tuple(values[code]) for code in anomaly_codes()}


def affected_equipment_tokens_for_event(
    code: str,
    affected_equipment: list[dict[str, Any]] | tuple[dict[str, Any], ...],
) -> tuple[str, ...]:
    """Resolve per-event equipment without violating official token rules.

    C01 and C02 carry event-specific electrolyzer identities. Other classes
    require the exact official token set, including all three units for C06.
    """
    if code in {"C01", "C02", "C06"}:
        equipment_ids = tuple(
            item.get("id")
            for item in affected_equipment
            if isinstance(item.get("id"), str)
        )
        if len(equipment_ids) != len(affected_equipment):
            raise VocabularyError(f"{code} equipment attribution is incomplete.")
        implicated_ids = tuple(
            equipment_id
            for equipment_id in equipment_ids
            if equipment_id in {"ELZ01", "ELZ02", "ELZ03"}
        )
        expected_context_ids = {"BESS01", "PCC01"} if code == "C01" else set()
        context_ids = set(equipment_ids) - set(implicated_ids)
        if (
            not valid_implicated_equipment_ids(code, implicated_ids)
            or context_ids != expected_context_ids
        ):
            raise VocabularyError(f"{code} equipment attribution is invalid.")
        if code == "C06":
            return affected_equipment_tokens_by_code()[code]

    event_tokens = tuple(
        dict.fromkeys(
            token
            for item in affected_equipment
            if (token := _submission_equipment_token(item)) is not None
        )
    )
    if valid_affected_equipment_tokens(code, event_tokens):
        return event_tokens
    if code in {"C01", "C02", "C06"}:
        raise VocabularyError(f"{code} submission equipment attribution is invalid.")
    return affected_equipment_tokens_by_code()[code]


def valid_implicated_equipment_ids(code: str, equipment_ids: tuple[str, ...]) -> bool:
    """Validate event-specific electrolyzer attribution for dynamic classes."""
    if len(equipment_ids) != len(set(equipment_ids)):
        return False
    if not set(equipment_ids).issubset({"ELZ01", "ELZ02", "ELZ03"}):
        return False
    expected_counts = {"C01": {2}, "C02": {1}, "C06": {2, 3}}
    return len(equipment_ids) in expected_counts.get(code, set())


def valid_affected_equipment_tokens(code: str, tokens: tuple[str, ...]) -> bool:
    if len(tokens) != len(set(tokens)):
        return False
    if code == "C01":
        electrolyzers = tuple(token for token in tokens if token.startswith("ELZ"))
        return (
            len(tokens) == 4
            and len(electrolyzers) == 2
            and set(electrolyzers).issubset({"ELZ1", "ELZ2", "ELZ3"})
            and "BESS" in tokens
            and "PCC" in tokens
        )
    if code == "C02":
        return len(tokens) == 1 and tokens[0] in {"ELZ1", "ELZ2", "ELZ3"}
    expected = affected_equipment_tokens_by_code().get(code)
    return expected is not None and len(tokens) == len(expected) and set(tokens) == set(expected)


def _submission_equipment_token(item: dict[str, Any]) -> str | None:
    kind = item.get("kind")
    if kind in {"BESS", "PCC", "PV", "ELZ"}:
        return str(kind)
    equipment_id = item.get("id")
    if isinstance(equipment_id, str) and equipment_id in {"ELZ01", "ELZ02", "ELZ03"}:
        return f"ELZ{equipment_id[-1]}"
    return None


@lru_cache(maxsize=1)
def control_object_type_by_code() -> dict[str, str]:
    return {
        "C01": "EMS_ELECTROLYZER_GROUP_CONTROL",
        "C02": "EMS_CAPACITY_MODEL",
        "C03": "BESS_CONTROL",
        "C04": "PCC_BOUNDARY_CONTROL",
        "C05": "GRID_ENERGY_QUOTA_CONTROL",
        "C06": "ELECTROLYZER_LOAD_ALLOCATION",
        "C07": "BESS_SOC_RESERVE_CONTROL",
    }


@lru_cache(maxsize=1)
def control_object_id_by_code() -> dict[str, str]:
    return {
        "C01": "ems-elz-group-control",
        "C02": "ems-capacity-sync",
        "C03": "ems-bess-control",
        "C04": "ems-pcc-boundary",
        "C05": "ems-quota-plan",
        "C06": "ems-elz-allocation",
        "C07": "ems-bess-soc-reserve",
    }


def equipment_kind(equipment_id: str) -> str:
    return next(
        (
            kind
            for prefix, kind in _KIND_BY_EQUIPMENT_PREFIX.items()
            if equipment_id.startswith(prefix)
        ),
        "METERING",
    )


@lru_cache(maxsize=1)
def assistant_questions() -> tuple[dict[str, str], ...]:
    return tuple(
        {"questionId": entry["questionId"], "question": entry["question"]}
        for entry in load_assistant_questions()
    )


@lru_cache(maxsize=1)
def assistant_question_ids() -> tuple[str, ...]:
    return tuple(entry["questionId"] for entry in assistant_questions())


@lru_cache(maxsize=1)
def deprecated_field_map() -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for mapping in load_deprecated_field_map()["mappings"]:
        result[mapping["internal"]] = dict(mapping)
    return result


@lru_cache(maxsize=1)
def detection_thresholds() -> dict[str, Any]:
    thresholds = load_detection_thresholds()
    if thresholds.get("detectorVersion") != "deterministic-c01-c07-v3":
        raise VocabularyError("Detection threshold version does not match the detector.")
    if thresholds.get("aggregationPolicyVersion") != "h2-events-v2":
        raise VocabularyError("Aggregation policy version does not match the service.")
    return thresholds


@lru_cache(maxsize=1)
def impact_formulas() -> dict[str, Any]:
    formulas = load_impact_formulas()
    if formulas.get("schemaVersion") != 1:
        raise VocabularyError("Impact formula schema version is unsupported.")
    if formulas.get("formulaVersion") != "impact-c06-v3":
        raise VocabularyError("C06 impact formula version does not match the service.")
    c03 = formulas.get("classes", {}).get("C03", {})
    if c03.get("formulaVersion") != "impact-c03-v2":
        raise VocabularyError("C03 impact formula version does not match the service.")
    if not isinstance(c03.get("socTrackingGainKwPerPct"), (int, float)):
        raise VocabularyError("C03 impact formula requires a numeric SOC-tracking gain.")
    c06 = formulas.get("classes", {}).get("C06", {})
    if c06.get("targetField") != "ems_total_elz_target_kw":
        raise VocabularyError("C06 impact formula must use the canonical target field.")
    if set(c06.get("subtypeRates", {})) != set(subtypes_by_code()["C06"]):
        raise VocabularyError("C06 impact rates do not cover the official subtypes.")
    return formulas


@lru_cache(maxsize=1)
def efficiency_curve_by_equipment() -> dict[str, tuple[dict[str, Any], ...]]:
    curves: dict[str, list[dict[str, Any]]] = {}
    for entry in load_efficiency_curves():
        equipment_id = entry["equipment_id"]
        curves.setdefault(equipment_id, []).append(
            {
                "load_ratio": float(entry["load_ratio"]),
                "power_kw": float(entry["power_kw"]),
                "specific_energy_kwh_per_kg": float(
                    entry["specific_energy_kwh_per_kg"]
                ),
            }
        )
    return {equipment_id: tuple(points) for equipment_id, points in curves.items()}
