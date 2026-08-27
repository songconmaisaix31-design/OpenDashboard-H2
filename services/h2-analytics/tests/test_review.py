from __future__ import annotations

from copy import deepcopy
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
import hashlib
import json

import pytest

from h2_analytics.errors import AnalyticsError
from h2_analytics.service import AnalyticsService


def _analyzed(valid_csv: str) -> tuple[AnalyticsService, str, str]:
    service = AnalyticsService(
        clock=lambda: datetime(2026, 1, 5, 11, 0, tzinfo=UTC)
    )
    dataset_id = service.import_csv(
        filename="tiny-valid-timeseries.csv", text=valid_csv
    )["dataset"]["datasetId"]
    run = service.run_analysis(dataset_id)
    return service, run["runId"], dataset_id


def _request(
    *,
    run_id: str,
    event_id: str,
    request_id: str,
    action: str,
    expected_revision: int,
    note: str | None = None,
) -> dict:
    value = {
        "schemaVersion": 1,
        "requestId": request_id,
        "runId": run_id,
        "eventId": event_id,
        "action": action,
        "expectedRevision": expected_revision,
        "actor": {"kind": "local_operator", "displayName": "本地值班员"},
    }
    if note is not None:
        value["note"] = note
    return value


def test_review_journal_covers_allowed_transitions_and_revision_order(
    valid_csv: str,
) -> None:
    service, run_id, _ = _analyzed(valid_csv)
    event_id = "C03-20260105-001"

    initial = service.get_event_review(run_id, event_id)
    assert initial["currentState"] == "open"
    assert initial["revision"] == 0
    assert initial["entries"] == []

    confirmed = service.review_event(
        _request(
            run_id=run_id,
            event_id=event_id,
            request_id="review-confirm-1",
            action="confirm",
            expected_revision=0,
        )
    )["review"]
    noted = service.review_event(
        _request(
            run_id=run_id,
            event_id=event_id,
            request_id="review-note-2",
            action="add_note",
            expected_revision=1,
            note="继续核对储能符号映射。",
        )
    )["review"]
    resolved = service.review_event(
        _request(
            run_id=run_id,
            event_id=event_id,
            request_id="review-resolve-3",
            action="resolve",
            expected_revision=2,
            note="现场核对完成，记录闭环。",
        )
    )["review"]
    reopened = service.review_event(
        _request(
            run_id=run_id,
            event_id=event_id,
            request_id="review-reopen-4",
            action="reopen",
            expected_revision=3,
            note="发现新证据，重新打开。",
        )
    )["review"]

    assert confirmed["currentState"] == "confirmed"
    assert noted["currentState"] == "confirmed"
    assert resolved["currentState"] == "resolved"
    assert reopened["currentState"] == "open"
    assert [entry["revision"] for entry in reopened["entries"]] == [1, 2, 3, 4]
    assert reopened["entries"][0]["createdAt"] == "2026-01-05T11:00:00Z"
    assert service.get_event(run_id, event_id)["reviewState"] == "open"

    other_event = "C04-20260105-001"
    dismissed = service.review_event(
        _request(
            run_id=run_id,
            event_id=other_event,
            request_id="review-reject-1",
            action="reject",
            expected_revision=0,
            note="与现场记录不一致。",
        )
    )["review"]
    assert dismissed["currentState"] == "dismissed"
    assert service.review_event(
        _request(
            run_id=run_id,
            event_id=other_event,
            request_id="review-reopen-2",
            action="reopen",
            expected_revision=1,
            note="补充记录后重新复核。",
        )
    )["review"]["currentState"] == "open"


def test_review_idempotency_conflicts_and_analysis_immutability(valid_csv: str) -> None:
    service, run_id, _ = _analyzed(valid_csv)
    event_id = "C04-20260105-001"
    event_before = deepcopy(service.get_event(run_id, event_id))
    submission_before = service.export_submission(run_id)["content"]
    request = _request(
        run_id=run_id,
        event_id=event_id,
        request_id="idempotent-confirm",
        action="confirm",
        expected_revision=0,
        note="核对 PCC 计量与动态上限。",
    )

    first = service.review_event(request)
    replay = service.review_event(request)
    assert first["replayed"] is False
    assert replay["replayed"] is True
    assert replay["entry"] == first["entry"]
    assert replay["review"] == first["review"]
    assert service.get_event_review(run_id, event_id)["revision"] == 1

    service.review_event(
        _request(
            run_id=run_id,
            event_id=event_id,
            request_id="second-note",
            action="add_note",
            expected_revision=1,
            note="第二条审计备注。",
        )
    )
    late_replay = service.review_event(request)
    assert late_replay["review"]["revision"] == 1
    assert service.get_event_review(run_id, event_id)["revision"] == 2

    conflicting_request = {**request, "action": "reject", "note": "不同语义"}
    with pytest.raises(AnalyticsError) as idempotency_conflict:
        service.review_event(conflicting_request)
    assert idempotency_conflict.value.code == "review.idempotency_conflict"

    stale_request = _request(
        run_id=run_id,
        event_id=event_id,
        request_id="stale-revision",
        action="add_note",
        expected_revision=1,
        note="这个版本已经过期。",
    )
    with pytest.raises(AnalyticsError) as revision_conflict:
        service.review_event(stale_request)
    assert revision_conflict.value.code == "review.conflict"
    assert service.get_event_review(run_id, event_id)["revision"] == 2

    event_after = deepcopy(service.get_event(run_id, event_id))
    event_before["reviewState"] = event_after["reviewState"]
    assert event_after == event_before
    assert service.export_submission(run_id)["content"] == submission_before


@pytest.mark.parametrize(
    ("mutator", "expected_code"),
    [
        (lambda request: {**request, "note": None}, "review.note_required"),
        (lambda request: {**request, "note": " \t "}, "review.note_required"),
        (lambda request: {**request, "note": "x" * 2001}, "request.invalid"),
        (lambda request: {**request, "note": "bad\x00note"}, "request.invalid"),
        (
            lambda request: {
                **request,
                "actor": {"kind": "local_operator", "displayName": "bad\nactor"},
            },
            "request.invalid",
        ),
        (lambda request: {**request, "requestId": "请求-1"}, "request.invalid"),
    ],
)
def test_review_validation_rejects_unsafe_or_missing_values(
    valid_csv: str, mutator, expected_code: str
) -> None:
    service, run_id, _ = _analyzed(valid_csv)
    request = _request(
        run_id=run_id,
        event_id="C04-20260105-001",
        request_id="review-validation",
        action="reject",
        expected_revision=0,
        note="需要备注。",
    )

    with pytest.raises(AnalyticsError) as captured:
        service.review_event(mutator(request))

    assert captured.value.code == expected_code
    assert service.get_event_review(run_id, "C04-20260105-001")["revision"] == 0


def test_review_forbidden_transition_is_non_mutating(valid_csv: str) -> None:
    service, run_id, _ = _analyzed(valid_csv)
    event_id = "C04-20260105-001"

    with pytest.raises(AnalyticsError) as captured:
        service.review_event(
            _request(
                run_id=run_id,
                event_id=event_id,
                request_id="invalid-resolve",
                action="resolve",
                expected_revision=0,
                note="不能从 open 直接闭环。",
            )
        )

    assert captured.value.code == "review.invalid_transition"
    assert service.get_event_review(run_id, event_id)["revision"] == 0


def test_concurrent_review_requests_append_once_and_conflict_cleanly(
    valid_csv: str,
) -> None:
    service, run_id, _ = _analyzed(valid_csv)
    event_id = "C04-20260105-001"
    requests = [
        _request(
            run_id=run_id,
            event_id=event_id,
            request_id=f"concurrent-{action}",
            action=action,
            expected_revision=0,
            note="并发复核请求。" if action == "reject" else None,
        )
        for action in ("confirm", "reject")
    ]

    def submit(request: dict) -> str:
        try:
            service.review_event(request)
        except AnalyticsError as error:
            return error.code
        return "accepted"

    with ThreadPoolExecutor(max_workers=2) as executor:
        outcomes = list(executor.map(submit, requests))

    assert sorted(outcomes) == ["accepted", "review.conflict"]
    review = service.get_event_review(run_id, event_id)
    assert review["revision"] == 1
    assert len(review["entries"]) == 1


def test_review_audit_includes_revision_zero_events_and_utf8_notes(
    valid_csv: str,
) -> None:
    service, run_id, dataset_id = _analyzed(valid_csv)
    event_id = "C04-20260105-001"
    service.review_event(
        _request(
            run_id=run_id,
            event_id=event_id,
            request_id="audit-note",
            action="add_note",
            expected_revision=0,
            note="中文复核备注：保持人工确认。",
        )
    )
    artifact = service.export_report(run_id=run_id, kind="review_audit_json")
    payload = json.loads(artifact["content"])

    assert payload["actorIdentityNotice"] == "local_operator_labels_are_unverified"
    assert [item["event"]["eventId"] for item in payload["events"]] == [
        "C03-20260105-001",
        "C04-20260105-001",
    ]
    assert payload["events"][0]["review"]["revision"] == 0
    assert payload["events"][1]["review"]["entries"][0]["note"] == (
        "中文复核备注：保持人工确认。"
    )
    assert "C:\\" not in artifact["content"]
    expected_hash = hashlib.sha256(artifact["content"].encode("utf-8")).hexdigest()
    assert artifact["descriptor"]["contentHash"] == f"sha256:{expected_hash}"

    rerun = service.run_analysis(dataset_id)
    assert rerun["runId"] == run_id
    assert service.get_event_review(run_id, event_id)["revision"] == 1
    assert service.get_event(run_id, event_id)["reviewState"] == "open"
