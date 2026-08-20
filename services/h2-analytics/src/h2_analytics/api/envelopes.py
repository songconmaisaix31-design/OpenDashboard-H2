from __future__ import annotations

import hashlib
import re
from collections.abc import Sequence
from typing import Any

from h2_analytics.contracts import build_provenance

API_GENERATED_AT = "2026-08-19T00:00:00Z"
_ABSOLUTE_PATH = re.compile(r"(?:[A-Za-z]:\\|\\\\|/(?:Users|home|etc)/)")
_SECRET_SHAPE = re.compile(r"(?:api[_-]?key|password|private[_ -]?key|token|secret)", re.I)


def api_provenance() -> dict[str, Any]:
    return build_provenance(
        mode="RULE",
        generated_at=API_GENERATED_AT,
        fingerprint=None,
        source="h2-analytics-api",
        limitations=("Loopback-only deterministic API metadata.",),
    )


def success_envelope(
    data: Any,
    *,
    provenance: dict[str, Any] | None = None,
    warnings: Sequence[dict[str, Any]] = (),
) -> dict[str, Any]:
    return {
        "ok": True,
        "status": "warning" if warnings else "success",
        "data": data,
        "warnings": list(warnings),
        "provenance": provenance or api_provenance(),
    }

def error_envelope(
    *,
    code: str,
    message: str,
    retryable: bool = False,
    details: Sequence[str] = (),
) -> dict[str, Any]:
    safe_details = [
        detail
        for detail in details
        if not _ABSOLUTE_PATH.search(detail) and not _SECRET_SHAPE.search(detail)
    ]
    digest = hashlib.sha256(
        "|".join((code, message, *safe_details)).encode("utf-8")
    ).hexdigest()[:16]
    return {
        "ok": False,
        "status": "error",
        "error": {
            "code": code,
            "message": message,
            "retryable": retryable,
            "incidentId": f"h2-api-{digest}",
            "details": safe_details,
        },
        "warnings": [],
        "provenance": api_provenance(),
    }
