from __future__ import annotations

import json

from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator

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
    assert run["events"][1]["impact"]["value"] == 29.333333333333332

    answer = service.ask(
        run_id=run["runId"],
        question_id="H2Q03",
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
    for row in submission_rows(run["events"]):
        Draft202012Validator(_schema(repository_root, "submission-row.schema.json")).validate(
            row
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
