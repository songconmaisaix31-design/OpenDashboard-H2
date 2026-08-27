from __future__ import annotations

import json
from pathlib import Path

from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from h2_analytics.api import ROUTE_MAP, create_app
from h2_analytics.settings import API_NAMESPACE


def test_fastapi_routes_exactly_match_exported_namespace_map() -> None:
    app = create_app()
    actual = {
        (method, route.path, route.operation_id)
        for route in app.routes
        if isinstance(route, APIRoute)
        for method in route.methods
    }
    expected = {
        (item["method"], item["path"], item["operationId"]) for item in ROUTE_MAP
    }

    assert actual == expected
    assert all(
        path == "/health" or path.startswith(f"{API_NAMESPACE}/")
        for _, path, _ in actual
    )
    route_document = json.loads(
        (Path(__file__).resolve().parents[1] / "ROUTES.json").read_text(encoding="utf-8")
    )
    assert route_document == {
        "namespace": API_NAMESPACE,
        "routes": [dict(item) for item in ROUTE_MAP],
    }


def test_complete_api_golden_flow(valid_csv: str) -> None:
    client = TestClient(create_app(), base_url="http://127.0.0.1")
    health = client.get("/health").json()
    assert health["ok"] is True
    assert health["data"]["bindHost"] == "127.0.0.1"
    assert health["data"]["serviceVersion"]

    mode = client.get(f"{API_NAMESPACE}/mode").json()
    assert mode["ok"] is True
    assert mode["data"] == "LIVE_ANALYSIS"

    imported = client.post(
        f"{API_NAMESPACE}/datasets:import",
        json={"filename": "tiny-valid-timeseries.csv", "text": valid_csv},
    ).json()
    assert imported["ok"] is True
    assert imported["status"] == "warning"
    dataset_id = imported["data"]["dataset"]["datasetId"]

    analyzed = client.post(
        f"{API_NAMESPACE}/datasets:analyze", json={"datasetId": dataset_id}
    ).json()
    assert analyzed["ok"] is True
    run_id = analyzed["data"]["runId"]
    assert analyzed["data"]["events"][1]["impact"]["value"] == 29.333333333333332

    series = client.post(
        f"{API_NAMESPACE}/runs/series",
        json={
            "runId": run_id,
            "variables": ["pcc_power_kw", "pcc_export_limit_kw"],
            "startTime": "2026-01-05T10:32:00Z",
            "endTime": "2026-01-05T10:39:00Z",
        },
    ).json()
    assert len(series["data"]["points"]) == 8

    answer = client.post(
        f"{API_NAMESPACE}/assistant:ask",
        json={
            "runId": run_id,
            "questionId": "Q03",
            "eventId": "C03-20260105-001",
            "allowLlmRendering": False,
        },
    ).json()
    assert answer["data"]["mode"] == "DETERMINISTIC_TEMPLATE"

    initial_review = client.get(
        f"{API_NAMESPACE}/runs/{run_id}/events/C04-20260105-001/review"
    ).json()
    assert initial_review["data"]["revision"] == 0

    reviewed = client.post(
        f"{API_NAMESPACE}/runs/{run_id}/events/C04-20260105-001:review",
        json={
            "schemaVersion": 1,
            "requestId": "api-review-confirm",
            "runId": run_id,
            "eventId": "C04-20260105-001",
            "action": "confirm",
            "expectedRevision": 0,
            "actor": {"kind": "local_operator", "displayName": "本地值班员"},
        },
    ).json()
    assert reviewed["data"]["review"]["currentState"] == "confirmed"

    report = client.post(
        f"{API_NAMESPACE}/reports:export",
        json={
            "runId": run_id,
            "kind": "single_event_diagnosis",
            "eventId": "C04-20260105-001",
        },
    ).json()
    assert report["data"]["mediaType"] == "text/html"

    submission = client.post(
        f"{API_NAMESPACE}/submissions:export", json={"runId": run_id}
    ).json()
    assert submission["data"]["descriptor"]["filename"] == "submission.csv"


def test_review_and_assistant_errors_are_typed_chinese_and_redacted(
    valid_csv: str,
) -> None:
    client = TestClient(create_app(), base_url="http://127.0.0.1")
    dataset_id = client.post(
        f"{API_NAMESPACE}/datasets:import",
        json={"filename": "tiny-valid-timeseries.csv", "text": valid_csv},
    ).json()["data"]["dataset"]["datasetId"]
    run_id = client.post(
        f"{API_NAMESPACE}/datasets:analyze", json={"datasetId": dataset_id}
    ).json()["data"]["runId"]
    event_id = "C04-20260105-001"

    legacy_alias = client.post(
        f"{API_NAMESPACE}/assistant:ask",
        json={
            "runId": run_id,
            "questionId": "H2Q03",
            "eventId": "C03-20260105-001",
            "allowLlmRendering": False,
        },
    )
    assert legacy_alias.status_code == 422
    assert legacy_alias.json()["error"]["code"] == "assistant.question_unknown"
    assert "Q01" in legacy_alias.json()["error"]["message"]

    request = {
        "schemaVersion": 1,
        "requestId": "api-review-idempotent",
        "runId": run_id,
        "eventId": event_id,
        "action": "confirm",
        "expectedRevision": 0,
        "actor": {"kind": "local_operator", "displayName": "本地值班员"},
        "note": "仅用于当前运行。",
    }
    first = client.post(
        f"{API_NAMESPACE}/runs/{run_id}/events/{event_id}:review",
        json=request,
    )
    replay = client.post(
        f"{API_NAMESPACE}/runs/{run_id}/events/{event_id}:review",
        json=request,
    )
    assert first.status_code == 200
    assert replay.json()["data"]["replayed"] is True

    stale = client.post(
        f"{API_NAMESPACE}/runs/{run_id}/events/{event_id}:review",
        json={
            **request,
            "requestId": "api-review-stale",
            "action": "add_note",
            "note": "private-stale-note",
        },
    )
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "review.conflict"
    assert "private-stale-note" not in json.dumps(stale.json())

    mismatch = client.post(
        f"{API_NAMESPACE}/runs/{run_id}/events/{event_id}:review",
        json={
            **request,
            "requestId": "api-review-mismatch",
            "eventId": "C03-20260105-001",
            "note": "private-path-note",
        },
    )
    assert mismatch.status_code == 422
    assert mismatch.json()["error"]["code"] == "request.invalid"
    assert "private-path-note" not in json.dumps(mismatch.json())

    unknown_field = client.post(
        f"{API_NAMESPACE}/runs/{run_id}/events/{event_id}:review",
        json={**request, "unexpected": "private-value"},
    )
    assert unknown_field.status_code == 422
    assert unknown_field.json()["error"]["code"] == "request.invalid"
    assert "private-value" not in json.dumps(unknown_field.json())

    oversized_review = client.post(
        f"{API_NAMESPACE}/runs/{run_id}/events/{event_id}:review",
        content=b"{}",
        headers={"content-length": "65537"},
    )
    assert oversized_review.status_code == 413
    assert oversized_review.json()["error"]["code"] == "request.too_large"


def test_api_rejects_paths_commands_and_non_loopback_boundaries(valid_csv: str) -> None:
    client = TestClient(create_app(), base_url="http://127.0.0.1")
    path_response = client.post(
        f"{API_NAMESPACE}/datasets:import",
        json={"filename": "../secret.csv", "text": valid_csv},
    )
    assert path_response.status_code == 400
    assert path_response.json()["error"]["code"] == "import.invalid_filename"
    assert "secret.csv" not in json.dumps(path_response.json())

    command_response = client.post(
        f"{API_NAMESPACE}/datasets:import",
        json={"filename": "data.csv", "text": valid_csv, "command": "ignored"},
    )
    assert command_response.status_code == 422
    assert command_response.json()["error"]["code"] == "request.invalid"

    host_response = client.get(
        "/health", headers={"host": "example.com"}
    )
    assert host_response.status_code == 400
    assert host_response.json()["error"]["code"] == "boundary.invalid_host"

    origin_response = client.get(
        "/health", headers={"origin": "https://example.com"}
    )
    assert origin_response.status_code == 403
    assert origin_response.json()["error"]["code"] == "boundary.invalid_origin"

    oversized = client.post(
        f"{API_NAMESPACE}/datasets:import",
        content=b"{}",
        headers={"content-length": str(6 * 1024 * 1024)},
    )
    assert oversized.status_code == 413
    assert oversized.json()["error"]["code"] == "request.too_large"


def test_malformed_csv_and_blocked_analysis_return_redacted_errors(invalid_csv: str) -> None:
    client = TestClient(create_app(), base_url="http://127.0.0.1")
    malformed = client.post(
        f"{API_NAMESPACE}/datasets:import",
        json={"filename": "broken.csv", "text": 'timestamp\n"unterminated'},
    )
    assert malformed.status_code == 400
    assert malformed.json()["status"] == "error"

    imported = client.post(
        f"{API_NAMESPACE}/datasets:import",
        json={"filename": "tiny-invalid-timeseries.csv", "text": invalid_csv},
    ).json()
    dataset_id = imported["data"]["dataset"]["datasetId"]
    blocked = client.post(
        f"{API_NAMESPACE}/datasets:analyze", json={"datasetId": dataset_id}
    )
    assert blocked.status_code == 409
    payload = blocked.json()
    assert payload["error"]["code"] == "quality.blocked"
    assert "Traceback" not in json.dumps(payload)
