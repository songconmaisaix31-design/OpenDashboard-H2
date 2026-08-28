from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta
import hashlib
import json
from pathlib import Path
import re
from typing import Any

from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape

from h2_analytics.contracts import build_provenance
from h2_analytics.errors import AnalyticsError

from .submission import serialize_submission

SAFETY_DISCLAIMER = (
    "本应用仅提供监视、诊断、量化和建议，不下发设备指令；"
    "所有操作建议均须人工确认。"
)
REPORT_KINDS = {
    "single_event_diagnosis",
    "period_summary",
    "pcc_daily_compliance",
    "analysis_result_json",
    "submission_csv",
    "validation_metrics",
    "quality_report",
    "review_audit_json",
}
HTML_KINDS = {
    "single_event_diagnosis",
    "period_summary",
    "pcc_daily_compliance",
    "quality_report",
}
REVIEW_LABELS = {
    "open": "待复核",
    "confirmed": "已确认",
    "dismissed": "已驳回",
    "resolved": "已闭环",
}
QUALITY_CHECK_LABELS = {
    "field_mapping": "字段映射",
    "row_count": "数据行数",
    "missing_values": "缺失值",
    "duplicate_timestamps": "重复时间戳",
    "irregular_sampling": "采样间隔",
    "invalid_range": "数值与范围",
    "timestamp_order": "时间顺序",
    "power_balance_residual": "功率平衡残差",
}
QUALITY_STATUS_LABELS = {
    "passed": "通过",
    "warning": "提示",
    "blocked": "阻断",
}


class ReportRenderer:
    def __init__(self) -> None:
        template_dir = Path(__file__).resolve().parents[3] / "templates"
        self._environment = Environment(
            loader=FileSystemLoader(template_dir),
            autoescape=select_autoescape(("html",)),
            undefined=StrictUndefined,
            trim_blocks=True,
            lstrip_blocks=True,
        )

    def render(
        self,
        *,
        run: dict[str, Any],
        kind: str,
        event_id: str | None = None,
        time_range: dict[str, str] | None = None,
        reviews: dict[str, dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        _validate_scope(kind=kind, event_id=event_id, time_range=time_range)
        event = _event(run, event_id) if event_id is not None else None
        if event is not None and not event.get("evidence"):
            raise AnalyticsError(
                "report.evidence_unavailable",
                "所选事件缺少可引用证据，无法生成报告。",
            )

        generated_at = run["completedAt"]
        report_format = _report_format(kind)
        provenance = build_provenance(
            mode=run["dataset"]["mode"],
            generated_at=generated_at,
            fingerprint=run["dataset"]["fingerprint"],
            model_version=run["provenance"]["modelVersion"],
            renderer_version=(
                "jinja-report-p1-v1"
                if report_format == "html"
                else "structured-export-p1-v1"
            ),
        )
        content = self._content(
            run=run,
            kind=kind,
            event=event,
            time_range=time_range,
            reviews=reviews or {},
            generated_at=generated_at,
            provenance=provenance,
        )
        media_type = {
            "html": "text/html",
            "json": "application/json",
            "csv": "text/csv",
        }[report_format]
        filename = _filename(kind=kind, run_id=run["runId"], event=event)
        report_id_suffix = event["eventId"] if event is not None else run["runId"]
        descriptor: dict[str, Any] = {
            "schemaVersion": 1,
            "reportId": f"report-{kind}-{_safe_identifier(report_id_suffix)}",
            "runId": run["runId"],
            "kind": kind,
            "format": report_format,
            "status": "ready",
            "generatedAt": generated_at,
            "filename": filename,
            "contentHash": f"sha256:{hashlib.sha256(content.encode('utf-8')).hexdigest()}",
            "warnings": _report_warnings(run),
            "safetyDisclaimer": SAFETY_DISCLAIMER,
            "provenance": provenance,
        }
        if event is not None:
            descriptor["eventId"] = event["eventId"]
        return {"descriptor": descriptor, "mediaType": media_type, "content": content}

    def _content(
        self,
        *,
        run: dict[str, Any],
        kind: str,
        event: dict[str, Any] | None,
        time_range: dict[str, str] | None,
        reviews: dict[str, dict[str, Any]],
        generated_at: str,
        provenance: dict[str, Any],
    ) -> str:
        if kind == "submission_csv":
            return serialize_submission(run["events"])
        if kind == "analysis_result_json":
            return json.dumps(run, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
        if kind == "validation_metrics":
            raise AnalyticsError(
                "report.metrics_unavailable",
                "未加载公开标签与事件匹配定义，未生成验证指标。",
            )
        if kind == "review_audit_json":
            return _review_audit_content(
                run=run,
                reviews=reviews,
                generated_at=generated_at,
                provenance=provenance,
            )

        selected_events = _events_in_range(
            run["events"],
            time_range or run["dataset"]["timeRange"],
        )
        context = {
            "run": run,
            "kind": kind,
            "event": event,
            "events": selected_events,
            "review": reviews.get(event["eventId"]) if event is not None else None,
            "reviews": reviews,
            "review_labels": REVIEW_LABELS,
            "review_counts": _review_counts(selected_events, reviews),
            "code_counts": _counts(selected_events, "code"),
            "severity_counts": _counts(selected_events, "severity"),
            "quality_checks": _quality_checks(run["quality"]),
            "time_range": time_range or run["dataset"]["timeRange"],
            "pcc_events": _pcc_events(selected_events, run, reviews),
            "source_label": _source_label(run),
            "generated_at": generated_at,
            "provenance": provenance,
            "disclaimer": SAFETY_DISCLAIMER,
            "title": _title(kind),
        }
        return self._environment.get_template("event_report.html").render(**context)


def _validate_scope(
    *, kind: str, event_id: str | None, time_range: dict[str, str] | None
) -> None:
    if kind not in REPORT_KINDS:
        raise _invalid_scope()
    if kind == "single_event_diagnosis":
        if event_id is None or time_range is not None:
            raise _invalid_scope()
        return
    if event_id is not None:
        raise _invalid_scope()
    if kind == "period_summary":
        if time_range is not None:
            _parse_range(time_range)
        return
    if kind == "pcc_daily_compliance":
        if time_range is None:
            raise _invalid_scope()
        start, end = _parse_range(time_range)
        if (
            end - start != timedelta(days=1)
            or start.timetz().replace(tzinfo=None) != datetime.min.time()
            or end.timetz().replace(tzinfo=None) != datetime.min.time()
            or start.utcoffset() != end.utcoffset()
        ):
            raise _invalid_scope()
        return
    if time_range is not None:
        raise _invalid_scope()


def _parse_range(time_range: dict[str, str]) -> tuple[datetime, datetime]:
    if set(time_range) != {"startTime", "endTime"}:
        raise _invalid_scope()
    try:
        start = datetime.fromisoformat(time_range["startTime"].replace("Z", "+00:00"))
        end = datetime.fromisoformat(time_range["endTime"].replace("Z", "+00:00"))
    except (TypeError, ValueError) as error:
        raise _invalid_scope() from error
    if start.tzinfo is None or end.tzinfo is None or start >= end:
        raise _invalid_scope()
    return start, end


def _invalid_scope() -> AnalyticsError:
    return AnalyticsError(
        "report.invalid_scope",
        "报告类型与事件或时间范围参数不匹配。",
    )


def _event(
    run: dict[str, Any], event_id: str | None
) -> dict[str, Any]:
    for event in run["events"]:
        if event["eventId"] == event_id:
            return event
    raise AnalyticsError(
        "report.event_not_found",
        "当前运行中不存在指定事件。",
    )


def _events_in_range(
    events: list[dict[str, Any]], time_range: dict[str, str]
) -> list[dict[str, Any]]:
    start, end = _parse_range(time_range)
    return sorted(
        (
            event
            for event in events
            if _instant(event["endTime"]) >= start
            and _instant(event["startTime"]) < end
        ),
        key=lambda item: (item["startTime"], item["eventId"]),
    )


def _instant(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("event timestamp lacks timezone")
    return parsed


def _review_audit_content(
    *,
    run: dict[str, Any],
    reviews: dict[str, dict[str, Any]],
    generated_at: str,
    provenance: dict[str, Any],
) -> str:
    events: list[dict[str, Any]] = []
    for event in sorted(
        run["events"], key=lambda item: (item["startTime"], item["eventId"])
    ):
        review = reviews.get(event["eventId"])
        if review is None:
            raise AnalyticsError(
                "report.evidence_unavailable",
                "复核审计数据不完整，无法生成导出文件。",
            )
        events.append(
            {
                "event": {
                    "eventId": event["eventId"],
                    "code": event["code"],
                    "subtype": event["subtype"],
                    "startTime": event["startTime"],
                    "endTime": event["endTime"],
                },
                "review": deepcopy(review),
            }
        )
    payload = {
        "schemaVersion": 1,
        "exportKind": "event_review_audit",
        "runId": run["runId"],
        "datasetFingerprint": run["dataset"]["fingerprint"],
        "generatedAt": generated_at,
        "actorIdentityNotice": "local_operator_labels_are_unverified",
        "events": events,
        "provenance": provenance,
    }
    return json.dumps(payload, ensure_ascii=False, indent=2) + "\n"


def _review_counts(
    events: list[dict[str, Any]], reviews: dict[str, dict[str, Any]]
) -> dict[str, int]:
    counts = {state: 0 for state in REVIEW_LABELS}
    for event in events:
        review = reviews.get(event["eventId"])
        state = review["currentState"] if review is not None else event["reviewState"]
        counts[state] += 1
    return counts


def _counts(events: list[dict[str, Any]], field: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for event in events:
        value = event[field]
        counts[value] = counts.get(value, 0) + 1
    return dict(sorted(counts.items()))


def _quality_checks(quality: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            **check,
            "labelZh": QUALITY_CHECK_LABELS.get(check["code"], "数据质量检查"),
            "statusZh": QUALITY_STATUS_LABELS.get(check["status"], "未知"),
            "messageZh": (
                "检查通过。"
                if check["status"] == "passed"
                else "检查发现提示，请结合受影响字段和观测值复核。"
                if check["status"] == "warning"
                else "检查未通过，当前分析受到阻断。"
            ),
        }
        for check in quality["checks"]
    ]


def _pcc_events(
    events: list[dict[str, Any]],
    run: dict[str, Any],
    reviews: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    sampling_minutes = float(run["dataset"]["samplingIntervalMinutes"])
    values: list[dict[str, Any]] = []
    for event in events:
        if event["code"] not in {"C04", "C05"}:
            continue
        actual = _evidence_value(event, "pcc_power_actual_kw")
        limit_variable = (
            "grid_export_power_limit_kw"
            if event["subtype"].startswith("EXPORT")
            else "grid_import_power_limit_kw"
        )
        limit = _evidence_value(event, limit_variable)
        review = reviews.get(event["eventId"])
        values.append(
            {
                "event": event,
                "directionZh": (
                    "送出" if event["subtype"].startswith("EXPORT") else "受电"
                ),
                "actualPowerKw": actual,
                "limitPowerKw": limit,
                "durationMinutes": (
                    (_instant(event["endTime"]) - _instant(event["startTime"])).total_seconds()
                    / 60
                    + sampling_minutes
                ),
                "reviewStateZh": REVIEW_LABELS[
                    review["currentState"] if review is not None else event["reviewState"]
                ],
            }
        )
    return values


def _evidence_value(event: dict[str, Any], variable: str) -> Any:
    for item in event["evidence"]:
        if item.get("variable") == variable:
            return item.get("actualValue")
    return None


def _source_label(run: dict[str, Any]) -> str:
    if run["dataset"]["mode"] == "FIXTURE":
        return "FIXTURE · 脱敏固定样例（不是测试集结果）"
    source = " ".join(
        (
            str(run["provenance"].get("source", "")),
            str(run["dataset"].get("sourceFilename", "")),
        )
    )
    if "validation" in source.lower():
        return "LIVE_ANALYSIS · 验证集切片"
    return "LIVE_ANALYSIS · 本地导入数据"


def _report_warnings(run: dict[str, Any]) -> list[str]:
    return (
        ["数据质量检查存在提示，请查看报告中的质量检查详情。"]
        if run["warnings"]
        else []
    )


def _report_format(kind: str) -> str:
    if kind in HTML_KINDS:
        return "html"
    if kind == "submission_csv":
        return "csv"
    return "json"


def _filename(
    *, kind: str, run_id: str, event: dict[str, Any] | None
) -> str:
    safe_run_id = _safe_identifier(run_id)
    if kind == "single_event_diagnosis" and event is not None:
        return f"{_safe_identifier(event['eventId'])}-diagnosis.html"
    names = {
        "period_summary": f"{safe_run_id}-period-summary.html",
        "pcc_daily_compliance": f"{safe_run_id}-pcc-daily-compliance.html",
        "analysis_result_json": f"{safe_run_id}-analysis.json",
        "submission_csv": "submission.csv",
        "validation_metrics": f"{safe_run_id}-validation-metrics.json",
        "quality_report": f"{safe_run_id}-quality-report.html",
        "review_audit_json": f"review-audit-{safe_run_id}.json",
    }
    return names[kind]


def _safe_identifier(value: str) -> str:
    normalized = re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip("-._")
    return (normalized or "artifact")[:96]


def _title(kind: str) -> str:
    return {
        "single_event_diagnosis": "氢哨异常诊断报告",
        "period_summary": "氢哨运行摘要",
        "pcc_daily_compliance": "PCC合规日报",
        "quality_report": "氢哨数据质量报告",
    }[kind]
