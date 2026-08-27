from __future__ import annotations

from copy import deepcopy
from typing import Any
import unicodedata

from h2_analytics.errors import AnalyticsError

REVIEW_ACTIONS = {"confirm", "reject", "resolve", "reopen", "add_note"}
NOTE_REQUIRED_ACTIONS = {"reject", "resolve", "reopen", "add_note"}
REVIEW_STATES = {"open", "confirmed", "dismissed", "resolved"}


def create_event_review(
    *, run_id: str, event: dict[str, Any]
) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "reviewId": f"review-{run_id}-{event['eventId']}",
        "runId": run_id,
        "eventId": event["eventId"],
        "initialState": "open",
        "currentState": "open",
        "revision": 0,
        "entries": [],
        "provenance": deepcopy(event["provenance"]),
    }


def normalize_review_request(request: dict[str, Any]) -> dict[str, Any]:
    if request.get("schemaVersion") != 1:
        raise _invalid_request()

    request_id = _trimmed_text(request.get("requestId"), maximum=128)
    if request_id is None or any(ord(character) < 32 or ord(character) > 126 for character in request_id):
        raise _invalid_request()

    run_id = _trimmed_text(request.get("runId"), maximum=256)
    event_id = _trimmed_text(request.get("eventId"), maximum=256)
    if run_id is None or event_id is None:
        raise _invalid_request()

    action = request.get("action")
    if action not in REVIEW_ACTIONS:
        raise _invalid_request()

    expected_revision = request.get("expectedRevision")
    if (
        not isinstance(expected_revision, int)
        or isinstance(expected_revision, bool)
        or expected_revision < 0
    ):
        raise _invalid_request()

    actor = request.get("actor")
    if not isinstance(actor, dict) or set(actor) != {"kind", "displayName"}:
        raise _invalid_request()
    display_name = _trimmed_text(actor.get("displayName"), maximum=64)
    if (
        actor.get("kind") != "local_operator"
        or display_name is None
        or _contains_control(display_name)
    ):
        raise _invalid_request()

    note_value = request.get("note")
    note: str | None
    if note_value is None:
        note = None
    elif not isinstance(note_value, str):
        raise _invalid_request()
    else:
        note = note_value.strip()
        if len(note) > 2_000 or _contains_disallowed_note_control(note):
            raise _invalid_request()
        if not note:
            note = None

    if action in NOTE_REQUIRED_ACTIONS and note is None:
        raise AnalyticsError(
            "review.note_required",
            "该复核操作必须填写非空备注。",
        )

    normalized = {
        "schemaVersion": 1,
        "requestId": request_id,
        "runId": run_id,
        "eventId": event_id,
        "action": action,
        "expectedRevision": expected_revision,
        "actor": {
            "kind": "local_operator",
            "displayName": display_name,
        },
    }
    if note is not None:
        normalized["note"] = note
    return normalized


def append_review_entry(
    *,
    review: dict[str, Any],
    request: dict[str, Any],
    created_at: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    current_state = review["currentState"]
    if current_state not in REVIEW_STATES:
        raise AnalyticsError(
            "review.invalid_transition",
            "当前复核状态无效，未写入复核记录。",
        )
    next_state = _next_state(current_state, request["action"])
    revision = review["revision"] + 1
    entry = {
        "schemaVersion": 1,
        "entryId": f"{review['reviewId']}-entry-{revision}",
        "requestId": request["requestId"],
        "revision": revision,
        "action": request["action"],
        "previousState": current_state,
        "nextState": next_state,
        "actor": deepcopy(request["actor"]),
        "createdAt": created_at,
    }
    if "note" in request:
        entry["note"] = request["note"]

    updated = {
        **review,
        "currentState": next_state,
        "revision": revision,
        "entries": [*review["entries"], entry],
    }
    return entry, updated


def _next_state(current: str, action: str) -> str:
    if action == "add_note":
        return current
    if current == "open" and action == "confirm":
        return "confirmed"
    if current == "open" and action == "reject":
        return "dismissed"
    if current == "confirmed" and action == "resolve":
        return "resolved"
    if action == "reopen" and current in {"confirmed", "dismissed", "resolved"}:
        return "open"
    raise AnalyticsError(
        "review.invalid_transition",
        "该操作不适用于当前复核状态；请先按规定重新打开事件。",
    )


def _trimmed_text(value: object, *, maximum: int) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized if 0 < len(normalized) <= maximum else None


def _contains_control(value: str) -> bool:
    return any(unicodedata.category(character) == "Cc" for character in value)


def _contains_disallowed_note_control(value: str) -> bool:
    return any(
        unicodedata.category(character) == "Cc" and character not in {"\n", "\t"}
        for character in value
    )


def _invalid_request() -> AnalyticsError:
    return AnalyticsError(
        "request.invalid",
        "复核请求字段或取值无效。",
    )
