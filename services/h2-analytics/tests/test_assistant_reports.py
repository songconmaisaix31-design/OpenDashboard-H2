from __future__ import annotations

import hashlib
import json
import re

import pytest

from h2_analytics.contracts import ASSISTANT_QUESTION_IDS, SUBMISSION_COLUMNS
from h2_analytics.errors import AnalyticsError
from h2_analytics.service import AnalyticsService
from h2_analytics.reports.submission import (
    submission_normalization_trace,
    submission_rows,
)

_EVENT_CONTEXT = {
    "Q03": "C03-20260105-001",
    "Q09": "C04-20260105-001",
}
_HAN_TEXT = re.compile(r"[\u4e00-\u9fff]")


def _analyzed(valid_csv: str) -> tuple[AnalyticsService, str]:
    service = AnalyticsService()
    dataset_id = service.import_csv(
        filename="tiny-valid-timeseries.csv", text=valid_csv
    )["dataset"]["datasetId"]
    return service, service.run_analysis(dataset_id)["runId"]


def test_all_ten_answers_are_deterministic_chinese_and_referentially_valid(
    valid_csv: str,
) -> None:
    service, run_id = _analyzed(valid_csv)

    answers = [
        service.ask(
            run_id=run_id,
            question_id=question_id,
            event_id=_EVENT_CONTEXT.get(question_id),
            allow_llm_rendering=True,
        )
        for question_id in ASSISTANT_QUESTION_IDS
    ]

    assert ASSISTANT_QUESTION_IDS == tuple(f"Q{index:02d}" for index in range(1, 11))
    assert [answer["questionId"] for answer in answers] == list(
        ASSISTANT_QUESTION_IDS
    )
    assert all(answer["mode"] == "DETERMINISTIC_TEMPLATE" for answer in answers)
    assert all(answer["refusedControlClaim"] is True for answer in answers)
    deterministic_answers = [
        service.ask(
            run_id=run_id,
            question_id=question_id,
            event_id=_EVENT_CONTEXT.get(question_id),
            allow_llm_rendering=False,
        )
        for question_id in ASSISTANT_QUESTION_IDS
    ]
    assert answers == deterministic_answers
    for answer in answers:
        _assert_answer_invariants(answer)
        context = next(
            section
            for section in answer["sections"]
            if section["sectionId"] == "current_run_context"
        )
        assert "22 行数据" in context["text"]
        assert "1.0 分钟采样间隔" in context["text"]
        assert "不代表官方评分" in context["text"]


def test_assistant_enforces_event_context_and_rejects_legacy_alias(
    valid_csv: str,
) -> None:
    service, run_id = _analyzed(valid_csv)

    cases = [
        ("Q03", None, "assistant.event_required"),
        ("Q09", None, "assistant.event_required"),
        ("Q02", "C03-20260105-001", "assistant.event_mismatch"),
        ("Q04", "C04-20260105-001", "assistant.event_mismatch"),
        ("Q03", "missing-event", "assistant.event_not_found"),
        ("H2Q03", "C03-20260105-001", "assistant.question_unknown"),
    ]
    for question_id, event_id, expected_code in cases:
        with pytest.raises(AnalyticsError) as captured:
            service.ask(
                run_id=run_id,
                question_id=question_id,
                event_id=event_id,
                allow_llm_rendering=False,
            )
        assert captured.value.code == expected_code


def test_q09_returns_one_matching_chinese_generated_report(valid_csv: str) -> None:
    service, run_id = _analyzed(valid_csv)
    run = service.get_run(run_id)
    answer = service.ask(
        run_id=run_id,
        question_id="Q09",
        event_id="C04-20260105-001",
        allow_llm_rendering=True,
    )
    artifact = answer["generatedReport"]
    descriptor = artifact["descriptor"]
    report_citations = [
        citation
        for citation in answer["citations"]
        if citation["sourceType"] == "report"
    ]

    assert run["provenance"]["generatedAt"] == run["dataset"]["provenance"][
        "generatedAt"
    ]
    assert run["completedAt"] != run["provenance"]["generatedAt"]
    assert answer["generatedAt"] == run["completedAt"]
    assert answer["provenance"]["generatedAt"] == run["completedAt"]
    assert answer["provenance"]["modelVersion"] == run["provenance"][
        "modelVersion"
    ]
    assert descriptor["kind"] == "single_event_diagnosis"
    assert descriptor["format"] == "html"
    assert descriptor["runId"] == run_id
    assert descriptor["eventId"] == answer["eventId"]
    assert descriptor["generatedAt"] == run["completedAt"]
    assert descriptor["provenance"]["generatedAt"] == run["completedAt"]
    assert descriptor["provenance"]["modelVersion"] == run["provenance"][
        "modelVersion"
    ]
    assert artifact["mediaType"] == "text/html"
    assert report_citations == [
        {
            "citationId": report_citations[0]["citationId"],
            "claimKind": "recommendation",
            "sourceType": "report",
            "sourceId": descriptor["reportId"],
            "eventId": answer["eventId"],
        }
    ]
    assert '<html lang="zh-CN">' in artifact["content"]
    assert "FIXTURE · 脱敏固定样例（不是测试集结果）" in artifact["content"]
    assert _section_positions(
        artifact["content"],
        [
            "报告范围与数据来源",
            "异常概览",
            "证据链",
            "原因判断：事实与推断",
            "影响量化",
            "安全检查",
            "建议与人工确认",
            "人工复核记录",
            "版本与溯源",
            "安全声明与限制",
        ],
    ) == sorted(
        _section_positions(
            artifact["content"],
            [
                "报告范围与数据来源",
                "异常概览",
                "证据链",
                "原因判断：事实与推断",
                "影响量化",
                "安全检查",
                "建议与人工确认",
                "人工复核记录",
                "版本与溯源",
                "安全声明与限制",
            ],
        )
    )
    _assert_hash(artifact)


def test_validation_slice_source_label_is_preserved_in_report(valid_csv: str) -> None:
    service = AnalyticsService()
    dataset_id = service.import_csv(
        filename="validation-slice-timeseries.csv", text=f"{valid_csv}\n"
    )["dataset"]["datasetId"]
    run_id = service.run_analysis(dataset_id)["runId"]

    artifact = service.export_report(
        run_id=run_id,
        kind="single_event_diagnosis",
        event_id="C04-20260105-001",
    )

    assert "LIVE_ANALYSIS · 验证集切片" in artifact["content"]
    _assert_hash(artifact)


@pytest.mark.parametrize(
    ("kind", "event_id", "time_range", "expected_format", "expected_media_type"),
    [
        ("single_event_diagnosis", "C04-20260105-001", None, "html", "text/html"),
        ("period_summary", None, None, "html", "text/html"),
        (
            "pcc_daily_compliance",
            None,
            {
                "startTime": "2026-01-05T00:00:00Z",
                "endTime": "2026-01-06T00:00:00Z",
            },
            "html",
            "text/html",
        ),
        ("analysis_result_json", None, None, "json", "application/json"),
        ("submission_csv", None, None, "csv", "text/csv"),
        ("quality_report", None, None, "html", "text/html"),
        ("review_audit_json", None, None, "json", "application/json"),
    ],
)
def test_report_kind_format_parity_and_content_addressing(
    valid_csv: str,
    kind: str,
    event_id: str | None,
    time_range: dict[str, str] | None,
    expected_format: str,
    expected_media_type: str,
) -> None:
    service, run_id = _analyzed(valid_csv)
    artifact = service.export_report(
        run_id=run_id,
        kind=kind,
        event_id=event_id,
        time_range=time_range,
    )

    _assert_hash(artifact)
    assert artifact["descriptor"]["format"] == expected_format
    assert artifact["mediaType"] == expected_media_type
    assert artifact["descriptor"]["filename"].endswith(f".{expected_format}")
    assert "C:\\" not in artifact["content"]

    if expected_format == "html":
        assert "<!doctype html>" in artifact["content"]
        assert '<html lang="zh-CN">' in artifact["content"]
        assert "所有操作建议均须人工确认" in artifact["content"]
        assert "<script" not in artifact["content"].lower()
        assert "http://" not in artifact["content"].lower()
        assert "https://" not in artifact["content"].lower()
        if kind == "single_event_diagnosis":
            assert "120.0" in artifact["content"]
        if kind == "pcc_daily_compliance":
            assert "证据不足，未计算该项合规结论" in artifact["content"]
            assert "8.0 min" in artifact["content"]
        if kind == "quality_report":
            assert "数据行数" in artifact["content"]
            assert "未加载公开标签，未生成验证指标" in artifact["content"]
    elif expected_format == "json":
        payload = json.loads(artifact["content"])
        assert payload["runId"] == run_id
        if kind == "review_audit_json":
            assert payload["exportKind"] == "event_review_audit"
            assert len(payload["events"]) == 2
    else:
        assert artifact["content"].splitlines()[0] == ",".join(SUBMISSION_COLUMNS)
        assert artifact["content"].splitlines()[1].endswith(",true")


def test_validation_metrics_fail_without_labels_and_matching_definition(
    valid_csv: str,
) -> None:
    service, run_id = _analyzed(valid_csv)

    with pytest.raises(AnalyticsError) as captured:
        service.export_report(run_id=run_id, kind="validation_metrics")

    assert captured.value.code == "report.metrics_unavailable"
    assert "未生成验证指标" in captured.value.message


def test_submission_normalizes_aliases_with_internal_trace(valid_csv: str) -> None:
    service, run_id = _analyzed(valid_csv)
    event = dict(service.get_event(run_id, "C03-20260105-001"))
    event["affectedEquipment"] = [
        {**item, "id": {"BESS01": "BESS", "PCC01": "PCC"}.get(item["id"], item["id"])}
        for item in event["affectedEquipment"]
    ]
    row = submission_rows([event])[0]
    assert row["affected_equipment"] == "BESS,PCC"
    assert submission_normalization_trace([event]) == [
        {
            "eventId": "C03-20260105-001",
            "mappings": [
                {"original": "BESS", "normalized": "BESS01"},
                {"original": "PCC", "normalized": "PCC01"},
            ],
        }
    ]


@pytest.mark.parametrize(
    ("kind", "event_id", "time_range"),
    [
        ("single_event_diagnosis", None, None),
        (
            "single_event_diagnosis",
            "C04-20260105-001",
            {
                "startTime": "2026-01-05T00:00:00Z",
                "endTime": "2026-01-06T00:00:00Z",
            },
        ),
        ("period_summary", "C04-20260105-001", None),
        ("pcc_daily_compliance", None, None),
        (
            "pcc_daily_compliance",
            None,
            {
                "startTime": "2026-01-05T10:00:00Z",
                "endTime": "2026-01-06T10:00:00Z",
            },
        ),
        (
            "review_audit_json",
            None,
            {
                "startTime": "2026-01-05T00:00:00Z",
                "endTime": "2026-01-06T00:00:00Z",
            },
        ),
    ],
)
def test_report_scope_matrix_fails_closed(
    valid_csv: str,
    kind: str,
    event_id: str | None,
    time_range: dict[str, str] | None,
) -> None:
    service, run_id = _analyzed(valid_csv)

    with pytest.raises(AnalyticsError) as captured:
        service.export_report(
            run_id=run_id,
            kind=kind,
            event_id=event_id,
            time_range=time_range,
        )

    assert captured.value.code == "report.invalid_scope"


def test_html_reports_escape_filename_actor_and_note(valid_csv: str) -> None:
    service = AnalyticsService()
    dataset_id = service.import_csv(filename="<script>.csv", text=valid_csv + "\n")[
        "dataset"
    ]["datasetId"]
    run = service.run_analysis(dataset_id)
    event_id = run["events"][0]["eventId"]
    service.review_event(
        {
            "schemaVersion": 1,
            "requestId": "escape-review-1",
            "runId": run["runId"],
            "eventId": event_id,
            "action": "confirm",
            "expectedRevision": 0,
            "actor": {
                "kind": "local_operator",
                "displayName": "<img src=x onerror=alert(1)>",
            },
            "note": "<script>alert('x')</script>",
        }
    )
    artifact = service.export_report(
        run_id=run["runId"],
        kind="single_event_diagnosis",
        event_id=event_id,
    )

    assert "&lt;script&gt;.csv" in artifact["content"]
    assert "&lt;img src=x onerror=alert(1)&gt;" in artifact["content"]
    assert "&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;" in artifact["content"]
    assert "<script>.csv" not in artifact["content"]
    assert "<img src=x" not in artifact["content"]


def _assert_answer_invariants(answer: dict) -> None:
    sections = answer["sections"]
    citations = answer["citations"]
    assert sections
    assert len({section["sectionId"] for section in sections}) == len(sections)
    assert len({citation["citationId"] for citation in citations}) == len(citations)
    citation_by_id = {citation["citationId"]: citation for citation in citations}
    referenced: set[str] = set()

    for section in sections:
        assert _HAN_TEXT.search(section["text"])
        assert section["citationIds"]
        assert len(set(section["citationIds"])) == len(section["citationIds"])
        for citation_id in section["citationIds"]:
            citation = citation_by_id[citation_id]
            assert citation["claimKind"] == section["claimKind"]
            referenced.add(citation_id)
    assert referenced == set(citation_by_id)
    if answer["questionId"] == "Q09":
        assert "generatedReport" in answer
    else:
        assert "generatedReport" not in answer


def _assert_hash(artifact: dict) -> None:
    expected = hashlib.sha256(artifact["content"].encode("utf-8")).hexdigest()
    assert artifact["descriptor"]["contentHash"] == f"sha256:{expected}"


def _section_positions(content: str, headings: list[str]) -> list[int]:
    positions = [content.index(heading) for heading in headings]
    assert all(position >= 0 for position in positions)
    return positions
