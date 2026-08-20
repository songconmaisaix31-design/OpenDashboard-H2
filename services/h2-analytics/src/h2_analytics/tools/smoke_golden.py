from __future__ import annotations

import json
from pathlib import Path

from jsonschema import Draft202012Validator  # type: ignore[import-untyped]

from h2_analytics.service import AnalyticsService
from h2_analytics.tools.validate_submission import validate_submission_text


def main() -> None:
    service_root = Path(__file__).resolve().parents[3]
    repository_root = Path(__file__).resolve().parents[5]
    contracts_root = repository_root / "packages/h2-contracts"
    fixture_path = contracts_root / "fixtures/tiny-valid-timeseries.csv"
    service = AnalyticsService()
    imported = service.import_csv(
        filename=fixture_path.name,
        text=fixture_path.read_text(encoding="utf-8"),
    )
    run = service.run_analysis(imported["dataset"]["datasetId"])
    if [event["code"] for event in run["events"]] != ["C03", "C04"]:
        raise AssertionError("golden smoke did not produce exactly C03 and C04")
    c04 = run["events"][1]
    if c04["impact"]["value"] != 29.333333333333332:
        raise AssertionError("C04 impact does not match the corrected contract gate")

    event_schema = json.loads(
        (contracts_root / "schema/anomaly-event.schema.json").read_text(encoding="utf-8")
    )
    for event in run["events"]:
        Draft202012Validator(event_schema).validate(event)

    submission = service.export_submission(run["runId"])
    validation = validate_submission_text(submission["content"])
    report = service.export_report(
        run_id=run["runId"],
        kind="single_event_diagnosis",
        event_id=c04["eventId"],
    )
    artifacts = service_root / "artifacts"
    artifacts.mkdir(exist_ok=True)
    (artifacts / "submission.csv").write_text(submission["content"], encoding="utf-8")
    (artifacts / "C04-20260105-001-diagnosis.html").write_text(
        report["content"], encoding="utf-8"
    )
    summary = {
        "datasetId": imported["dataset"]["datasetId"],
        "eventIds": [event["eventId"] for event in run["events"]],
        "c04ImpactKwh": c04["impact"]["value"],
        "submissionRows": validation["rowCount"],
        "artifacts": [
            "artifacts/submission.csv",
            "artifacts/C04-20260105-001-diagnosis.html",
        ],
    }
    print(json.dumps(summary, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
