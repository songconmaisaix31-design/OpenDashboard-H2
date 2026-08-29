from __future__ import annotations

from typing import Final

from h2_analytics.settings import API_NAMESPACE

ROUTE_MAP: Final[tuple[dict[str, str], ...]] = (
    {"operationId": "health", "method": "GET", "path": "/health"},
    {"operationId": "routeMap", "method": "GET", "path": f"{API_NAMESPACE}/routes"},
    {"operationId": "getMode", "method": "GET", "path": f"{API_NAMESPACE}/mode"},
    {"operationId": "listDatasets", "method": "GET", "path": f"{API_NAMESPACE}/datasets"},
    {"operationId": "importCsv", "method": "POST", "path": f"{API_NAMESPACE}/datasets:import"},
    {
        "operationId": "createCsvUploadSession",
        "method": "POST",
        "path": f"{API_NAMESPACE}/ingest/sessions",
    },
    {
        "operationId": "uploadCsvChunk",
        "method": "PUT",
        "path": f"{API_NAMESPACE}/ingest/sessions/{{sessionId}}/chunks/{{chunkIndex}}",
    },
    {
        "operationId": "finalizeCsvUpload",
        "method": "POST",
        "path": f"{API_NAMESPACE}/ingest/sessions/{{sessionId}}/commit",
    },
    {
        "operationId": "getDataQuality",
        "method": "POST",
        "path": f"{API_NAMESPACE}/datasets/quality",
    },
    {"operationId": "runAnalysis", "method": "POST", "path": f"{API_NAMESPACE}/datasets:analyze"},
    {"operationId": "getOverview", "method": "POST", "path": f"{API_NAMESPACE}/runs/overview"},
    {"operationId": "listEvents", "method": "POST", "path": f"{API_NAMESPACE}/runs/events"},
    {"operationId": "getEvent", "method": "POST", "path": f"{API_NAMESPACE}/runs/event"},
    {
        "operationId": "getEventReview",
        "method": "GET",
        "path": f"{API_NAMESPACE}/runs/{{runId}}/events/{{eventId}}/review",
    },
    {
        "operationId": "reviewEvent",
        "method": "POST",
        "path": f"{API_NAMESPACE}/runs/{{runId}}/events/{{eventId}}:review",
    },
    {"operationId": "getSeries", "method": "POST", "path": f"{API_NAMESPACE}/runs/series"},
    {"operationId": "ask", "method": "POST", "path": f"{API_NAMESPACE}/assistant:ask"},
    {"operationId": "resolveIntent", "method": "POST", "path": f"{API_NAMESPACE}/assistant/nlu"},
    {"operationId": "exportReport", "method": "POST", "path": f"{API_NAMESPACE}/reports:export"},
    {
        "operationId": "exportSubmission",
        "method": "POST",
        "path": f"{API_NAMESPACE}/submissions:export",
    },
)
