from __future__ import annotations

from h2_analytics import vocabulary
from h2_analytics.detection import DetectionCandidate
from h2_analytics.events.aggregator import POLICIES
from h2_analytics.models import DataRow
from h2_analytics.service import AnalyticsService


class SevenCodeDetector:
    @property
    def version(self) -> str:
        return "test-seven-code-detector-v1"

    def detect(
        self, rows: tuple[DataRow, ...]
    ) -> tuple[DetectionCandidate, ...]:
        row = rows[0]
        assert row.timestamp is not None
        candidates: list[DetectionCandidate] = []
        for code in vocabulary.anomaly_codes():
            subtype = vocabulary.subtypes_by_code()[code][0]
            implicated = {
                "C01": ("ELZ01", "ELZ02"),
                "C02": ("ELZ01",),
                "C06": ("ELZ01", "ELZ02", "ELZ03"),
            }.get(code, ())
            candidate_rows = (
                rows[: POLICIES[code].minimum_rows]
                if code == "C05"
                else (row,) * POLICIES[code].minimum_rows
            )
            for candidate_row in candidate_rows:
                assert candidate_row.timestamp is not None
                candidates.append(
                    DetectionCandidate(
                        row_index=candidate_row.index,
                        timestamp=candidate_row.timestamp,
                        code=code,
                        subtype=subtype,
                        confidence=0.9,
                        detector_version=self.version,
                        implicated_equipment_ids=implicated,
                    )
                )
        return tuple(candidates)


def test_service_keeps_all_seven_classes_with_versioned_outputs(
    valid_csv: str,
) -> None:
    service = AnalyticsService(detector=SevenCodeDetector())
    dataset_id = service.import_csv(
        filename="tiny-valid-timeseries.csv", text=valid_csv
    )["dataset"]["datasetId"]

    run = service.run_analysis(dataset_id)

    assert [event["code"] for event in run["events"]] == list(
        vocabulary.anomaly_codes()
    )
    for event in run["events"]:
        assert event["severity"] in {"medium", "high"}
        assert event["evidence"]
        assert all(
            item["provenance"]["ruleVersion"] == "h2-rules-v2"
            for item in event["evidence"]
        )
        assert event["impact"]["formulaVersion"].startswith("impact-")
        assert event["impact"]["evidenceIds"]
        assert event["safetyChecks"]
        assert all("-v" in item["constraintId"] for item in event["safetyChecks"])
        assert event["requiresHumanConfirmation"] is True


def test_threshold_and_aggregation_versions_are_frozen() -> None:
    thresholds = vocabulary.detection_thresholds()

    assert thresholds["detectorVersion"] == "deterministic-c01-c07-v5"
    assert thresholds["aggregationPolicyVersion"] == "h2-events-v2"
    assert set(thresholds["classes"]) == set(vocabulary.anomaly_codes())
