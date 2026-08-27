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
    ReviewEventRequest,
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
_JSON_REQUEST_LIMIT_BYTES = 65_536
_ERROR_STATUS = {
    "assistant.event_required": 400,
    "assistant.event_mismatch": 409,
    "assistant.evidence_unavailable": 409,
    "assistant.question_unknown": 422,
    "quality.blocked": 409,
    "report.evidence_unavailable": 409,
    "report.invalid_scope": 422,
    "report.metrics_unavailable": 409,
    "report.render_failed": 500,
    "request.invalid": 422,
    "review.conflict": 409,
    "review.idempotency_conflict": 409,
    "review.invalid_transition": 409,
    "review.note_required": 422,
}
_ERROR_MESSAGE_ZH = {
    "dataset.not_found": "未找到指定数据集。",
    "event.not_found": "当前运行中不存在指定事件。",
    "quality.blocked": "数据质量检查未通过，分析未执行。",
    "run.not_found": "未找到指定的分析运行。",
    "series.invalid_range": "时序开始时间不得晚于结束时间。",
    "series.invalid_variable": "时序请求只能包含已知数值变量。",
    "time.invalid": "时间必须是包含时区的 ISO-8601 值。",
}


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
                    message="分析 API 仅接受本机回环 Host。",
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
                        message="分析 API 仅接受本机回环浏览器来源。",
                    ),
                )
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                declared_length = int(content_length)
            except ValueError:
                declared_length = -1
            request_limit = (
                MAX_CSV_BYTES + _JSON_REQUEST_LIMIT_BYTES
                if request.url.path == f"{API_NAMESPACE}/datasets:import"
                else _JSON_REQUEST_LIMIT_BYTES
            )
            if declared_length < 0 or declared_length > request_limit:
                return JSONResponse(
                    status_code=413,
                    content=error_envelope(
                        code="request.too_large",
                        message="请求超过本地内存处理上限。",
                    ),
                )
        return await call_next(request)

    @application.exception_handler(CsvImportError)
    async def csv_error(_request: Request, error: CsvImportError) -> JSONResponse:
        return JSONResponse(
            status_code=400,
            content=error_envelope(
                code=error.code,
                message="CSV 导入失败，请检查文件名、格式、字段和大小。",
            ),
        )

    @application.exception_handler(AnalyticsError)
    async def analytics_error(_request: Request, error: AnalyticsError) -> JSONResponse:
        status_code = _ERROR_STATUS.get(
            error.code,
            404 if error.code.endswith(".not_found") else 400,
        )
        return JSONResponse(
            status_code=status_code,
            content=error_envelope(
                code=error.code,
                message=_ERROR_MESSAGE_ZH.get(error.code, error.message),
                retryable=error.retryable,
                details=() if error.code in _ERROR_MESSAGE_ZH else error.details,
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
                message="请求字段校验失败。",
                details=tuple(f"Invalid field: {field}" for field in fields),
            ),
        )

    @application.exception_handler(Exception)
    async def unexpected_error(_request: Request, _error: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content=error_envelope(
                code="internal.error",
                message="分析请求失败，内部细节已隐藏。",
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
        warnings: list[dict[str, Any]] = [
            {
                "code": (
                    "quality.blocked"
                    if quality["status"] == "blocked"
                    else "quality.warning"
                ),
                "message": (
                    "数据质量检查未通过，请查看质量报告。"
                    if quality["status"] == "blocked"
                    else "数据质量检查存在提示，请查看质量报告。"
                ),
                "evidenceIds": [],
            }
            for _message in warning_messages
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

    @application.get(
        f"{API_NAMESPACE}/runs/{{runId}}/events/{{eventId}}/review",
        operation_id="getEventReview",
    )
    def get_event_review(runId: str, eventId: str) -> dict[str, Any]:
        review = analytics.get_event_review(runId, eventId)
        return success_envelope(review, provenance=review["provenance"])

    @application.post(
        f"{API_NAMESPACE}/runs/{{runId}}/events/{{eventId}}:review",
        operation_id="reviewEvent",
    )
    def review_event(
        runId: str,
        eventId: str,
        request: ReviewEventRequest,
    ) -> dict[str, Any]:
        if request.run_id != runId or request.event_id != eventId:
            raise AnalyticsError(
                "request.invalid",
                "路径中的运行或事件 ID 与请求体不一致。",
            )
        receipt = analytics.review_event(
            request.model_dump(by_alias=True, exclude_none=True)
        )
        return success_envelope(
            receipt,
            provenance=receipt["review"]["provenance"],
        )

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
