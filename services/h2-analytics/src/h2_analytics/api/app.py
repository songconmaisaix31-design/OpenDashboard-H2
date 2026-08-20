from __future__ import annotations

from datetime import datetime
from typing import Any
from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from h2_analytics.api.envelopes import error_envelope, success_envelope
from h2_analytics.api.models import (
    AssistantRequest,
    CsvImportRequest,
    DatasetIdRequest,
    EventListRequest,
    EventRequest,
    ReportRequest,
    RunIdRequest,
    SeriesRequest,
)
from h2_analytics.api.route_map import ROUTE_MAP
from h2_analytics.errors import AnalyticsError
from h2_analytics.ingestion import CsvImportError
from h2_analytics.service import AnalyticsService
from h2_analytics.settings import (
    AGGREGATION_VERSION,
    API_NAMESPACE,
    API_VERSION,
    CONFIGURATION_VERSION,
    FEATURE_VERSION,
    MAX_CSV_BYTES,
    RULE_VERSION,
    SERVICE_VERSION,
)

_LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}


def create_app(service: AnalyticsService | None = None) -> FastAPI:
    analytics = service or AnalyticsService()
    application = FastAPI(
        title="H2 Sentinel Analytics",
        version=SERVICE_VERSION,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )

    @application.middleware("http")
    async def loopback_boundary(request: Request, call_next: Any) -> Any:
        host = request.url.hostname
        if host not in _LOOPBACK_HOSTS:
            return JSONResponse(
                status_code=400,
                content=error_envelope(
                    code="boundary.invalid_host",
                    message="The analytics API accepts loopback Host values only.",
                ),
            )
        origin = request.headers.get("origin")
        if origin:
            try:
                origin_host = urlsplit(origin).hostname
            except ValueError:
                origin_host = None
            if origin_host not in _LOOPBACK_HOSTS:
                return JSONResponse(
                    status_code=403,
                    content=error_envelope(
                        code="boundary.invalid_origin",
                        message="The analytics API accepts loopback browser origins only.",
                    ),
                )
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                declared_length = int(content_length)
            except ValueError:
                declared_length = -1
            if declared_length < 0 or declared_length > MAX_CSV_BYTES + 65_536:
                return JSONResponse(
                    status_code=413,
                    content=error_envelope(
                        code="request.too_large",
                        message="Request exceeds the bounded in-memory API limit.",
                    ),
                )
        return await call_next(request)

    @application.exception_handler(CsvImportError)
    async def csv_error(_request: Request, error: CsvImportError) -> JSONResponse:
        return JSONResponse(
            status_code=400,
            content=error_envelope(
                code=error.code,
                message=error.message,
                details=error.details,
            ),
        )

    @application.exception_handler(AnalyticsError)
    async def analytics_error(_request: Request, error: AnalyticsError) -> JSONResponse:
        status_code = (
            404
            if error.code.endswith(".not_found")
            else 409
            if error.code == "quality.blocked"
            else 400
        )
        return JSONResponse(
            status_code=status_code,
            content=error_envelope(
                code=error.code,
                message=error.message,
                retryable=error.retryable,
                details=error.details,
            ),
        )

    @application.exception_handler(RequestValidationError)
    async def validation_error(
        _request: Request, error: RequestValidationError
    ) -> JSONResponse:
        fields = sorted(
            {
                ".".join(str(part) for part in item["loc"] if part != "body")
                for item in error.errors()
            }
        )
        return JSONResponse(
            status_code=422,
            content=error_envelope(
                code="request.invalid",
                message="Request validation failed.",
                details=tuple(f"Invalid field: {field}" for field in fields),
            ),
        )

    @application.exception_handler(Exception)
    async def unexpected_error(_request: Request, _error: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content=error_envelope(
                code="internal.error",
                message="The analytics request failed; internal details were redacted.",
            ),
        )

    @application.get("/health", operation_id="health")
    def health() -> dict[str, Any]:
        return success_envelope(
            {
                "status": "healthy",
                "apiVersion": API_VERSION,
                "serviceVersion": SERVICE_VERSION,
                "featureVersion": FEATURE_VERSION,
                "aggregationVersion": AGGREGATION_VERSION,
                "ruleVersion": RULE_VERSION,
                "configurationVersion": CONFIGURATION_VERSION,
                "namespace": API_NAMESPACE,
                "bindHost": "127.0.0.1",
                "detectorVersion": analytics.detector_version,
            }
        )

    @application.get(f"{API_NAMESPACE}/routes", operation_id="routeMap")
    def route_map() -> dict[str, Any]:
        return success_envelope(
            {"namespace": API_NAMESPACE, "routes": [dict(item) for item in ROUTE_MAP]}
        )

    @application.get(f"{API_NAMESPACE}/mode", operation_id="getMode")
    def get_mode() -> dict[str, Any]:
        return success_envelope("LIVE_ANALYSIS")

    @application.get(f"{API_NAMESPACE}/datasets", operation_id="listDatasets")
    def list_datasets() -> dict[str, Any]:
        return success_envelope(analytics.list_datasets())

    @application.post(f"{API_NAMESPACE}/datasets:import", operation_id="importCsv")
    def import_csv(request: CsvImportRequest) -> dict[str, Any]:
        result = analytics.import_csv(filename=request.filename, text=request.text)
        quality = result["quality"]
        warning_messages = [*quality["warnings"], *quality["blockingReasons"]]
        warnings = [
            {
                "code": (
                    "quality.blocked"
                    if quality["status"] == "blocked"
                    else "quality.warning"
                ),
                "message": message,
                "evidenceIds": [],
            }
            for message in warning_messages
        ]
        return success_envelope(
            result,
            provenance=result["dataset"]["provenance"],
            warnings=warnings,
        )

    @application.post(
        f"{API_NAMESPACE}/datasets/quality", operation_id="getDataQuality"
    )
    def get_quality(request: DatasetIdRequest) -> dict[str, Any]:
        quality = analytics.get_quality(request.dataset_id)
        return success_envelope(quality, provenance=quality["provenance"])

    @application.post(
        f"{API_NAMESPACE}/datasets:analyze", operation_id="runAnalysis"
    )
    def run_analysis(request: DatasetIdRequest) -> dict[str, Any]:
        run = analytics.run_analysis(request.dataset_id)
        return success_envelope(run, provenance=run["provenance"])

    @application.post(f"{API_NAMESPACE}/runs/overview", operation_id="getOverview")
    def get_overview(request: RunIdRequest) -> dict[str, Any]:
        run = analytics.get_run(request.run_id)
        return success_envelope(run, provenance=run["provenance"])

    @application.post(f"{API_NAMESPACE}/runs/events", operation_id="listEvents")
    def list_events(request: EventListRequest) -> dict[str, Any]:
        events = analytics.list_events(request.run_id)
        filter_value = request.filter
        selected = [
            event
            for event in events
            if filter_value is None
            or _matches_filters(
                event,
                codes=set(filter_value.codes or ()),
                severities=set(filter_value.severities or ()),
                equipment_ids=set(filter_value.equipment_ids or ()),
                review_states=set(filter_value.review_states or ()),
                minimum_confidence=filter_value.min_confidence,
                starts_at_or_after=filter_value.starts_at_or_after,
                ends_at_or_before=filter_value.ends_at_or_before,
            )
        ]
        return success_envelope(
            selected, provenance=analytics.get_run(request.run_id)["provenance"]
        )

    @application.post(f"{API_NAMESPACE}/runs/event", operation_id="getEvent")
    def get_event(request: EventRequest) -> dict[str, Any]:
        event = analytics.get_event(request.run_id, request.event_id)
        return success_envelope(event, provenance=event["provenance"])

    @application.post(f"{API_NAMESPACE}/runs/series", operation_id="getSeries")
    def get_series(request: SeriesRequest) -> dict[str, Any]:
        result = analytics.get_series(
            run_id=request.run_id,
            variables=request.variables,
            start_time=request.start_time,
            end_time=request.end_time,
        )
        return success_envelope(
            result, provenance=analytics.get_run(request.run_id)["provenance"]
        )

    @application.post(f"{API_NAMESPACE}/assistant:ask", operation_id="ask")
    def ask(request: AssistantRequest) -> dict[str, Any]:
        answer = analytics.ask(
            run_id=request.run_id,
            question_id=request.question_id,
            event_id=request.event_id,
            allow_llm_rendering=request.allow_llm_rendering,
        )
        return success_envelope(answer, provenance=answer["provenance"])

    @application.post(f"{API_NAMESPACE}/reports:export", operation_id="exportReport")
    def export_report(request: ReportRequest) -> dict[str, Any]:
        time_range = (
            {
                "startTime": request.time_range.start_time,
                "endTime": request.time_range.end_time,
            }
            if request.time_range is not None
            else None
        )
        artifact = analytics.export_report(
            run_id=request.run_id,
            kind=request.kind,
            event_id=request.event_id,
            time_range=time_range,
        )
        return success_envelope(
            artifact, provenance=artifact["descriptor"]["provenance"]
        )

    @application.post(
        f"{API_NAMESPACE}/submissions:export", operation_id="exportSubmission"
    )
    def export_submission(request: RunIdRequest) -> dict[str, Any]:
        artifact = analytics.export_submission(request.run_id)
        return success_envelope(
            artifact, provenance=artifact["descriptor"]["provenance"]
        )

    return application


def _matches_filters(
    event: dict[str, Any],
    *,
    codes: set[str],
    severities: set[str],
    equipment_ids: set[str],
    review_states: set[str],
    minimum_confidence: float | None,
    starts_at_or_after: str | None,
    ends_at_or_before: str | None,
) -> bool:
    if codes and event["code"] not in codes:
        return False
    if severities and event["severity"] not in severities:
        return False
    if equipment_ids and not equipment_ids.intersection(
        item["id"] for item in event["affectedEquipment"]
    ):
        return False
    if review_states and event["reviewState"] not in review_states:
        return False
    if minimum_confidence is not None and event["confidence"] < minimum_confidence:
        return False
    if starts_at_or_after is not None and _instant(event["startTime"]) < _instant(
        starts_at_or_after
    ):
        return False
    if ends_at_or_before is not None and _instant(event["endTime"]) > _instant(
        ends_at_or_before
    ):
        return False
    return True


def _instant(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise AnalyticsError("time.invalid", "Timestamp must be ISO-8601 with timezone.") from error
    if parsed.tzinfo is None:
        raise AnalyticsError("time.invalid", "Timestamp must include a timezone.")
    return parsed


app = create_app()
