from __future__ import annotations

import json

from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator

from h2_analytics import vocabulary
from h2_analytics.api import create_app
from h2_analytics.reports import submission_rows
from h2_analytics.service import AnalyticsService
from h2_analytics.settings import API_NAMESPACE


def _schema(repository_root, name: str):
    return json.loads(
        (
            repository_root / f"packages/h2-contracts/schema/{name}"
        ).read_text(encoding="utf-8")
    )


def test_pipeline_outputs_validate_against_frozen_contract_schemas(
    repository_root, valid_csv: str
) -> None:
    service = AnalyticsService()
    dataset_id = service.import_csv(
        filename="tiny-valid-timeseries.csv", text=valid_csv
    )["dataset"]["datasetId"]
    run = service.run_analysis(dataset_id)
    event_schema = _schema(repository_root, "anomaly-event.schema.json")

    Draft202012Validator(_schema(repository_root, "dataset-manifest.schema.json")).validate(
        run["dataset"]
    )
    Draft202012Validator(
        _schema(repository_root, "data-quality-report.schema.json")
    ).validate(run["quality"])
    Draft202012Validator(_schema(repository_root, "analysis-run.schema.json")).validate(run)
    for event in run["events"]:
        Draft202012Validator(event_schema).validate(event)
    assert run["events"][1]["impact"]["value"] == 120.0

    answer = service.ask(
        run_id=run["runId"],
        question_id="Q09",
        event_id=run["events"][0]["eventId"],
        allow_llm_rendering=False,
    )
    Draft202012Validator(_schema(repository_root, "assistant-answer.schema.json")).validate(
        answer
    )
    artifact = service.export_report(
        run_id=run["runId"],
        kind="single_event_diagnosis",
        event_id=run["events"][0]["eventId"],
    )
    Draft202012Validator(_schema(repository_root, "report-descriptor.schema.json")).validate(
        artifact["descriptor"]
    )
    review = service.get_event_review(run["runId"], run["events"][0]["eventId"])
    Draft202012Validator(_schema(repository_root, "event-review.schema.json")).validate(
        review
    )
    receipt = service.review_event(
        {
            "schemaVersion": 1,
            "requestId": "contract-review-confirm",
            "runId": run["runId"],
            "eventId": run["events"][0]["eventId"],
            "action": "confirm",
            "expectedRevision": 0,
            "actor": {"kind": "local_operator", "displayName": "本地值班员"},
        }
    )
    Draft202012Validator(
        _schema(repository_root, "review-mutation-receipt.schema.json")
    ).validate(receipt)
    Draft202012Validator(_schema(repository_root, "event-review.schema.json")).validate(
        receipt["review"]
    )
    audit = service.export_report(
        run_id=run["runId"], kind="review_audit_json"
    )
    Draft202012Validator(
        _schema(repository_root, "review-audit-export.schema.json")
    ).validate(json.loads(audit["content"]))
    for row in submission_rows(run["events"]):
        Draft202012Validator(_schema(repository_root, "submission-row.schema.json")).validate(
            row
        )
        code = row["anomaly_code"]
        assert row["severity"] == vocabulary.severity_by_code()[code]
        assert row["primary_control_object"] == (
            vocabulary.primary_control_object_by_code()[code]
        )
        assert row["affected_equipment"] == ",".join(
            vocabulary.affected_equipment_tokens_by_code()[code]
        )


def test_success_warning_and_error_api_envelopes_validate(
    repository_root, valid_csv: str
) -> None:
    client = TestClient(create_app(), base_url="http://127.0.0.1")
    schema = _schema(repository_root, "api-envelope.schema.json")
    success = client.get("/health").json()
    warning = client.post(
        f"{API_NAMESPACE}/datasets:import",
        json={"filename": "tiny-valid-timeseries.csv", "text": valid_csv},
    ).json()
    error = client.post(
        f"{API_NAMESPACE}/datasets:import",
        json={"filename": "../blocked.csv", "text": valid_csv},
    ).json()

    for envelope in (success, warning, error):
        Draft202012Validator(schema).validate(envelope)
