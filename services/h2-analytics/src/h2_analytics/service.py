from __future__ import annotations

from collections.abc import Callable
from collections import Counter
from copy import deepcopy
from datetime import UTC, datetime, timedelta
from threading import Lock
from typing import Any

from h2_analytics.contracts import ANOMALY_CODES, SEVERITIES, build_provenance
from h2_analytics.assistant import AssistantService
from h2_analytics.detection import (
    RowDetector,
    RuleRowDetector,
    filter_c03_candidates,
    sanitized_fixture_c03_candidates,
)
from h2_analytics.diagnosis import DiagnosisBuilder
from h2_analytics.errors import AnalyticsError
from h2_analytics.events import EventAggregator
from h2_analytics.ingestion import DatasetLoader
from h2_analytics.models import ImportedDataset
from h2_analytics.reports import ReportRenderer
from h2_analytics.review import (
    append_review_entry,
    create_event_review,
    normalize_review_request,
)


class AnalyticsService:
    def __init__(
        self,
        detector: RowDetector | None = None,
        *,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._loader = DatasetLoader()
        self._uses_default_detector = detector is None
        self._detector = detector or RuleRowDetector()
        self._aggregator = EventAggregator()
        self._diagnosis = DiagnosisBuilder()
        self._assistant = AssistantService()
        self._reports = ReportRenderer()
        self._clock = clock or (lambda: datetime.now(UTC))
        self._datasets: dict[str, ImportedDataset] = {}
        self._runs: dict[str, dict[str, Any]] = {}
        self._reviews: dict[str, dict[str, dict[str, Any]]] = {}
        self._review_lock = Lock()
        self._review_receipts: dict[
            tuple[str, str], tuple[dict[str, Any], dict[str, Any]]
        ] = {}

    @property
    def detector_version(self) -> str:
        return self._detector.version

    def import_csv(self, *, filename: str, text: str) -> dict[str, Any]:
        imported = self._loader.import_csv(filename=filename, text=text)
        dataset_id = imported.manifest["datasetId"]
        self._datasets[dataset_id] = imported
        return {"dataset": imported.manifest, "quality": imported.quality}

    def list_datasets(self) -> list[dict[str, Any]]:
        return [
            self._datasets[key].manifest for key in sorted(self._datasets)
        ]

    def get_quality(self, dataset_id: str) -> dict[str, Any]:
        return self._dataset(dataset_id).quality

    def run_analysis(self, dataset_id: str) -> dict[str, Any]:
        imported = self._dataset(dataset_id)
        if imported.quality["status"] == "blocked":
            raise AnalyticsError(
                "quality.blocked",
                "Analysis is blocked by data-quality failures.",
                details=tuple(imported.quality["blockingReasons"]),
            )
        candidates = self._detector.detect(imported.rows)
        if imported.manifest["mode"] == "LIVE_ANALYSIS":
            candidates = filter_c03_candidates(
                rows=imported.rows,
                candidates=candidates,
            )
        if self._uses_default_detector:
            candidates = (
                *candidates,
                *sanitized_fixture_c03_candidates(
                    manifest=imported.manifest,
                    rows=imported.rows,
                ),
            )
        windows = self._aggregator.aggregate(
            rows=imported.rows,
            candidates=candidates,
            sampling_interval_minutes=float(imported.manifest["samplingIntervalMinutes"]),
        )
        events = [
            self._diagnosis.build(window=window, manifest=imported.manifest)
            for window in windows
        ]
        generated_at = imported.manifest["provenance"]["generatedAt"]
        completed_at = _plus_one_second(generated_at)
        run_id = (
            "run-fixture-h2-sentinel-golden"
            if imported.manifest["mode"] == "FIXTURE"
            else f"run-{dataset_id}"
        )
        code_counts = Counter(event["code"] for event in events)
        severity_counts = Counter(event["severity"] for event in events)
        run = {
            "schemaVersion": 1,
            "runId": run_id,
            "dataset": imported.manifest,
            "quality": imported.quality,
            "status": "completed",
            "startedAt": generated_at,
            "completedAt": completed_at,
            "eventCountsByCode": {code: code_counts[code] for code in ANOMALY_CODES},
            "eventCountsBySeverity": {
                severity: severity_counts[severity] for severity in SEVERITIES
            },
            "events": events,
            "warnings": list(imported.quality["warnings"]),
            "provenance": build_provenance(
                mode=imported.manifest["mode"],
                generated_at=generated_at,
                fingerprint=imported.manifest["fingerprint"],
                model_version=self._detector.version,
            ),
        }
        with self._review_lock:
            existing_reviews = self._reviews.get(run_id, {})
            reviews: dict[str, dict[str, Any]] = {}
            for event in events:
                event_id = event["eventId"]
                review = existing_reviews.get(event_id) or create_event_review(
                    run_id=run_id,
                    event=event,
                )
                event["reviewState"] = review["currentState"]
                reviews[event_id] = review
            self._reviews[run_id] = reviews
            self._runs[run_id] = run
        return run

    def get_run(self, run_id: str) -> dict[str, Any]:
        try:
            return self._runs[run_id]
        except KeyError as error:
            raise AnalyticsError("run.not_found", "Analysis run was not found.") from error

    def list_events(self, run_id: str) -> list[dict[str, Any]]:
        return list(self.get_run(run_id)["events"])

    def get_event(self, run_id: str, event_id: str) -> dict[str, Any]:
        for event in self.list_events(run_id):
            if event["eventId"] == event_id:
                return event
        raise AnalyticsError("event.not_found", "Anomaly event was not found.")

    def get_event_review(self, run_id: str, event_id: str) -> dict[str, Any]:
        with self._review_lock:
            if run_id not in self._runs:
                raise AnalyticsError(
                    "review.run_not_found",
                    "未找到指定的分析运行。",
                )
            try:
                return deepcopy(self._reviews[run_id][event_id])
            except KeyError as error:
                raise AnalyticsError(
                    "review.event_not_found",
                    "当前运行中不存在指定事件。",
                ) from error

    def review_event(self, request: dict[str, Any]) -> dict[str, Any]:
        normalized = normalize_review_request(request)
        run_id = normalized["runId"]
        event_id = normalized["eventId"]
        with self._review_lock:
            if run_id not in self._runs:
                raise AnalyticsError(
                    "review.run_not_found",
                    "未找到指定的分析运行。",
                )
            try:
                review = self._reviews[run_id][event_id]
            except KeyError as error:
                raise AnalyticsError(
                    "review.event_not_found",
                    "当前运行中不存在指定事件。",
                ) from error

            receipt_key = (run_id, normalized["requestId"])
            prior = self._review_receipts.get(receipt_key)
            if prior is not None:
                prior_request, prior_receipt = prior
                if prior_request != normalized:
                    raise AnalyticsError(
                        "review.idempotency_conflict",
                        "该 requestId 已用于不同的复核请求。",
                    )
                replayed = deepcopy(prior_receipt)
                replayed["replayed"] = True
                return replayed

            if normalized["expectedRevision"] != review["revision"]:
                raise AnalyticsError(
                    "review.conflict",
                    "复核记录已更新，请刷新后基于最新版本重试。",
                )

            entry, updated_review = append_review_entry(
                review=review,
                request=normalized,
                created_at=_timestamp(self._clock()),
            )
            self._reviews[run_id][event_id] = updated_review
            self.get_event(run_id, event_id)["reviewState"] = updated_review[
                "currentState"
            ]
            receipt = {
                "schemaVersion": 1,
                "replayed": False,
                "entry": entry,
                "review": updated_review,
            }
            self._review_receipts[receipt_key] = (
                deepcopy(normalized),
                deepcopy(receipt),
            )
            return deepcopy(receipt)

    def get_series(
        self,
        *,
        run_id: str,
        variables: tuple[str, ...],
        start_time: str,
        end_time: str,
    ) -> dict[str, Any]:
        run = self.get_run(run_id)
        dataset = self._dataset(run["dataset"]["datasetId"])
        start = _parse_timestamp(start_time)
        end = _parse_timestamp(end_time)
        if start > end:
            raise AnalyticsError("series.invalid_range", "Series start must not follow end.")
        known = {
            field["name"]
            for field in run["dataset"]["fields"]
            if field["role"] in {"measurement", "constraint"}
        }
        unknown = sorted(set(variables) - known)
        if unknown or "timestamp" in variables:
            raise AnalyticsError(
                "series.invalid_variable",
                "Series variables must be known numeric fields.",
                details=tuple(unknown),
            )
        points = [
            {
                "timestamp": row.timestamp_text,
                "values": {variable: row.value(variable) for variable in variables},
            }
            for row in dataset.rows
            if row.timestamp is not None and start <= row.timestamp <= end
        ]
        return {"runId": run_id, "variables": list(variables), "points": points}

    def ask(
        self,
        *,
        run_id: str,
        question_id: str,
        event_id: str | None,
        allow_llm_rendering: bool,
    ) -> dict[str, Any]:
        try:
            run = self.get_run(run_id)
        except AnalyticsError as error:
            if error.code == "run.not_found":
                raise AnalyticsError(
                    "assistant.run_not_found",
                    "未找到指定的分析运行。",
                ) from error
            raise
        reviews = self._review_snapshot(run_id)
        return self._assistant.answer(
            run=run,
            question_id=question_id,
            event_id=event_id,
            allow_llm_rendering=allow_llm_rendering,
            report_factory=lambda selected_event_id: self._reports.render(
                run=run,
                kind="single_event_diagnosis",
                event_id=selected_event_id,
                reviews=reviews,
            ),
        )

    def export_report(
        self,
        *,
        run_id: str,
        kind: str,
        event_id: str | None = None,
        time_range: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        try:
            run = self.get_run(run_id)
        except AnalyticsError as error:
            if error.code == "run.not_found":
                raise AnalyticsError(
                    "report.run_not_found",
                    "未找到指定的分析运行。",
                ) from error
            raise
        try:
            reviews = self._review_snapshot(run_id)
            return self._reports.render(
                run=run,
                kind=kind,
                event_id=event_id,
                time_range=time_range,
                reviews=reviews,
            )
        except AnalyticsError:
            raise
        except Exception as error:
            raise AnalyticsError(
                "report.render_failed",
                "报告生成失败，内部细节已隐藏。",
            ) from error

    def export_submission(self, run_id: str) -> dict[str, Any]:
        return self.export_report(run_id=run_id, kind="submission_csv")

    def _dataset(self, dataset_id: str) -> ImportedDataset:
        try:
            return self._datasets[dataset_id]
        except KeyError as error:
            raise AnalyticsError("dataset.not_found", "Dataset was not found.") from error

    def _review_snapshot(self, run_id: str) -> dict[str, dict[str, Any]]:
        with self._review_lock:
            return deepcopy(self._reviews[run_id])


def _plus_one_second(value: str) -> str:
    parsed = _parse_timestamp(value) + timedelta(seconds=1)
    return parsed.isoformat(timespec="seconds").replace("+00:00", "Z")


def _parse_timestamp(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise AnalyticsError("time.invalid", "Timestamp must be ISO-8601 with timezone.") from error
    if parsed.tzinfo is None:
        raise AnalyticsError("time.invalid", "Timestamp must include a timezone.")
    return parsed


def _timestamp(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")
