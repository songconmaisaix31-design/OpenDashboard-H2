from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from . import vocabulary
from .settings import CONFIGURATION_VERSION, RULE_VERSION

ANOMALY_CODES = vocabulary.anomaly_codes()
SEVERITIES = ("low", "medium", "high", "critical")
ANOMALY_SUBTYPES_BY_CODE = vocabulary.subtypes_by_code()
PRIMARY_IMPACT_METRIC_BY_CODE = vocabulary.primary_impact_metric_by_code()
ASSISTANT_QUESTIONS = tuple(
    (entry["questionId"], entry["question"])
    for entry in vocabulary.assistant_questions()
)
ASSISTANT_QUESTION_IDS = tuple(
    question_id for question_id, _ in ASSISTANT_QUESTIONS
)
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
    "sha256:98373685e71cb8df828f5d5dcc108a7972c46f1e45ca564e36b26a22d9b4e6b1"
)
FIXTURE_GENERATED_AT = "2026-01-05T10:45:00Z"
FIXTURE_LIMITATIONS = (
    "Synthetic, sanitized official-schema contract fixture only.",
    "Not an official competition dataset or score artifact.",
)
LIVE_LIMITATIONS = (
    "Deterministic local analysis; no official-dataset score is claimed.",
    "Rules cover the official C01-C07 field mappings from the frozen vocabulary.",
)

FIELD_DEFINITIONS: dict[str, dict[str, Any]] = {
    name: vocabulary.field_descriptor(name)
    for name in vocabulary.official_field_names()
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
