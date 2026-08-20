from __future__ import annotations

from typing import Any

from h2_analytics.contracts import ASSISTANT_QUESTION_IDS, build_provenance
from h2_analytics.errors import AnalyticsError


ANSWER_TEMPLATES: dict[str, tuple[str, str, str, str]] = {
    "H2Q01": (
        "fact",
        "Positive PCC power means export to the grid; negative PCC power means import from the grid.",
        "variable",
        "pcc_power_kw",
    ),
    "H2Q02": (
        "fact",
        "A C04 event concerns an active power boundary, while C05 concerns cumulative energy-quota risk.",
        "knowledge_base",
        "h2-anomaly-taxonomy-v1",
    ),
    "H2Q03": (
        "calculation",
        "A reversed BESS response changes the grid exchange relative to the dispatch command; the selected C03 evidence and impact record quantify that interval.",
        "event",
        "C03",
    ),
    "H2Q04": (
        "inference",
        "A C07 warning requires actual SOC, target SOC, available charge or discharge headroom, and the remaining time horizon.",
        "knowledge_base",
        "c07-reserve-rule-v1",
    ),
    "H2Q05": (
        "recommendation",
        "Compare the available-capacity signal with the EMS capacity model and operation log before treating a C02 event as confirmed.",
        "knowledge_base",
        "c02-capacity-check-v1",
    ),
    "H2Q06": (
        "recommendation",
        "Compare PV variation with electrolyzer setpoint direction, repeated reversals, and the configured ramp limit; renewable variation alone is not a root-cause conclusion.",
        "constraint",
        "electrolyzer-ramp-limit-v1",
    ),
    "H2Q07": (
        "calculation",
        "Evaluate stable-power constraints, start-stop count, and efficiency-adjusted energy allocation across available electrolyzers.",
        "knowledge_base",
        "c06-allocation-rule-v1",
    ),
    "H2Q08": (
        "fact",
        "Every operational recommendation requires human confirmation; this service never executes a control action.",
        "constraint",
        "human-confirmation-v1",
    ),
    "H2Q09": (
        "recommendation",
        "Use the selected event report, which separates evidence, calculated impact, inferred cause, safety checks, and advisory recommendations.",
        "report",
        "single_event_diagnosis",
    ),
    "H2Q10": (
        "recommendation",
        "A daily PCC compliance report should include power-boundary intervals, violation duration and energy, sign convention, dataset fingerprint, constraints, and unresolved events.",
        "report",
        "period_summary",
    ),
}


class AssistantService:
    def answer(
        self,
        *,
        run: dict[str, Any],
        question_id: str,
        event_id: str | None,
        allow_llm_rendering: bool,
    ) -> dict[str, Any]:
        del allow_llm_rendering
        if question_id not in ASSISTANT_QUESTION_IDS:
            raise AnalyticsError("assistant.invalid_question", "Question ID is not supported.")
        event = _select_event(run, event_id, question_id)
        claim_kind, text, source_type, source_id = ANSWER_TEMPLATES[question_id]
        if event is not None and question_id in {"H2Q03", "H2Q08", "H2Q09"}:
            source_id = event["eventId"]
            text = f"{text} Selected event: {event['eventId']} ({event['startTime']} to {event['endTime']})."
        citation_id = f"citation-{question_id}-{source_id}"
        generated_at = run.get("completedAt", run["startedAt"])
        mode = run["dataset"]["mode"]
        provenance = build_provenance(
            mode=mode,
            generated_at=generated_at,
            fingerprint=run["dataset"]["fingerprint"],
            renderer_version="deterministic-assistant-v1",
        )
        answer_id_suffix = event["eventId"] if event is not None else run["runId"]
        answer: dict[str, Any] = {
            "schemaVersion": 1,
            "answerId": f"answer-{question_id}-{answer_id_suffix}",
            "runId": run["runId"],
            "questionId": question_id,
            "mode": "DETERMINISTIC_TEMPLATE",
            "generatedAt": generated_at,
            "sections": [
                {
                    "sectionId": "answer",
                    "claimKind": claim_kind,
                    "text": text,
                    "citationIds": [citation_id],
                }
            ],
            "citations": [
                {
                    "citationId": citation_id,
                    "claimKind": claim_kind,
                    "sourceType": source_type,
                    "sourceId": source_id,
                    **({"eventId": event["eventId"]} if event is not None else {}),
                }
            ],
            "refusedControlClaim": True,
            "provenance": provenance,
        }
        if event is not None:
            answer["eventId"] = event["eventId"]
        return answer


def _select_event(
    run: dict[str, Any],
    event_id: str | None,
    question_id: str,
) -> dict[str, Any] | None:
    if event_id is not None:
        for event in run["events"]:
            if event["eventId"] == event_id:
                return event
        raise AnalyticsError("event.not_found", "Anomaly event was not found.")
    if question_id in {"H2Q03", "H2Q09"}:
        preferred_code = "C03" if question_id == "H2Q03" else None
        return next(
            (
                event
                for event in run["events"]
                if preferred_code is None or event["code"] == preferred_code
            ),
            None,
        )
    return None
