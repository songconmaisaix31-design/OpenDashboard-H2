from __future__ import annotations

from collections.abc import Callable
from typing import Any

from h2_analytics.contracts import ASSISTANT_QUESTION_IDS, build_provenance
from h2_analytics.errors import AnalyticsError

ReportFactory = Callable[[str], dict[str, Any]]

_REQUIRED_EVENT_QUESTIONS = {"Q03", "Q09"}
_ALLOWED_EVENT_CODES: dict[str, set[str] | None] = {
    "Q01": None,
    "Q02": {"C04", "C05"},
    "Q03": {"C03"},
    "Q04": {"C07"},
    "Q05": {"C02"},
    "Q06": {"C01"},
    "Q07": {"C06"},
    "Q08": None,
    "Q09": None,
    "Q10": {"C04", "C05"},
}


class AssistantService:
    def answer(
        self,
        *,
        run: dict[str, Any],
        question_id: str,
        event_id: str | None,
        allow_llm_rendering: bool,
        report_factory: ReportFactory | None = None,
    ) -> dict[str, Any]:
        del allow_llm_rendering
        if question_id not in ASSISTANT_QUESTION_IDS:
            raise AnalyticsError(
                "assistant.question_unknown",
                "仅支持官方 Q01 至 Q10 问题编号。",
            )
        event = _select_event(run, event_id, question_id)

        generated_report: dict[str, Any] | None = None
        if question_id == "Q09":
            if event is None or report_factory is None:
                raise AnalyticsError(
                    "assistant.evidence_unavailable",
                    "当前事件证据不足，无法生成诊断报告。",
                )
            try:
                generated_report = report_factory(event["eventId"])
            except AnalyticsError as error:
                raise AnalyticsError(
                    "assistant.evidence_unavailable",
                    "当前事件证据不足，无法生成诊断报告。",
                ) from error

        sections, citations = _answer_content(
            run=run,
            question_id=question_id,
            event=event,
            generated_report=generated_report,
        )
        generated_at = run.get("completedAt", run["startedAt"])
        provenance = build_provenance(
            mode=run["dataset"]["mode"],
            generated_at=generated_at,
            fingerprint=run["dataset"]["fingerprint"],
            renderer_version="deterministic-assistant-p1-v1",
        )
        answer_id_suffix = event["eventId"] if event is not None else run["runId"]
        answer: dict[str, Any] = {
            "schemaVersion": 1,
            "answerId": f"answer-{question_id}-{answer_id_suffix}",
            "runId": run["runId"],
            "questionId": question_id,
            "mode": "DETERMINISTIC_TEMPLATE",
            "generatedAt": generated_at,
            "sections": sections,
            "citations": citations,
            "refusedControlClaim": True,
            "provenance": provenance,
        }
        if event is not None:
            answer["eventId"] = event["eventId"]
        if generated_report is not None:
            answer["generatedReport"] = generated_report
        return answer


def _select_event(
    run: dict[str, Any],
    event_id: str | None,
    question_id: str,
) -> dict[str, Any] | None:
    if event_id is None:
        if question_id in _REQUIRED_EVENT_QUESTIONS:
            raise AnalyticsError(
                "assistant.event_required",
                "该问题必须选择当前运行中的事件。",
            )
        return None

    event = next(
        (item for item in run["events"] if item["eventId"] == event_id),
        None,
    )
    if event is None:
        raise AnalyticsError(
            "assistant.event_not_found",
            "当前运行中不存在指定事件。",
        )
    allowed_codes = _ALLOWED_EVENT_CODES[question_id]
    if allowed_codes is not None and event["code"] not in allowed_codes:
        raise AnalyticsError(
            "assistant.event_mismatch",
            "所选事件类型与该问题的上下文要求不匹配。",
        )
    return event


def _answer_content(
    *,
    run: dict[str, Any],
    question_id: str,
    event: dict[str, Any] | None,
    generated_report: dict[str, Any] | None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    sections: list[dict[str, Any]] = []
    citations: list[dict[str, Any]] = []

    def add(
        section_id: str,
        claim_kind: str,
        text: str,
        sources: list[tuple[str, str, str | None]],
    ) -> None:
        citation_ids: list[str] = []
        for source_type, source_id, source_event_id in sources:
            citation_id = f"citation-{question_id}-{section_id}-{len(citations) + 1}"
            citation = {
                "citationId": citation_id,
                "claimKind": claim_kind,
                "sourceType": source_type,
                "sourceId": source_id,
            }
            if source_event_id is not None:
                citation["eventId"] = source_event_id
            citations.append(citation)
            citation_ids.append(citation_id)
        sections.append(
            {
                "sectionId": section_id,
                "claimKind": claim_kind,
                "text": text,
                "citationIds": citation_ids,
            }
        )

    if question_id == "Q01":
        add(
            "sign_convention",
            "fact",
            "PCC 功率为正表示向电网送电，为负表示从电网受电；储能功率采用另一套设备方向约定，不能把两者的正负号直接等同。",
            [
                ("variable", "pcc_power_actual_kw", None),
                ("knowledge_base", "h2-sign-conventions-v1", None),
            ],
        )
    elif question_id == "Q02":
        add(
            "boundary_difference",
            "fact",
            "C04 判断某一时段的 PCC 实际功率是否越过动态进/出功率边界，单位为 kW；C05 判断当日累计进/出电量是否接近或超过配额，单位为 kWh。前者是瞬时动态边界，后者是按日累积配额。",
            [
                ("variable", "pcc_power_actual_kw", None),
                ("constraint", "pcc-dynamic-power-limits-v1", None),
                ("knowledge_base", "c04-c05-distinction-v1", None),
            ],
        )
    elif question_id == "Q03":
        assert event is not None
        fact_evidence = [
            item for item in event["evidence"] if item["claimKind"] == "fact"
        ]
        calculation_evidence = [
            item
            for item in event["evidence"]
            if item["claimKind"] == "calculation"
        ]
        add(
            "observed_mismatch",
            "fact",
            f"事件 {event['eventId']} 在 {event['startTime']} 至 {event['endTime']} 出现储能指令与实际功率方向不一致。当前事件记录了储能指令和反馈；若需核对某一分钟的 PCC 实际功率，应回到同一运行的 pcc_power_actual_kw 时序，不能仅凭异常标签推断。",
            [
                ("event", event["eventId"], event["eventId"]),
                *[
                    ("evidence", item["evidenceId"], event["eventId"])
                    for item in fact_evidence
                ],
            ],
        )
        add(
            "bounded_impact",
            "calculation",
            f"该事件按 {event['impact']['formulaVersion']} 计算与异常方向相关的并网交换影响为 {event['impact']['value']} {event['impact']['unit']}；该数值描述关联影响，不单独证明设备故障因果。",
            [
                ("evidence", item["evidenceId"], event["eventId"])
                for item in calculation_evidence
            ]
            or [("knowledge_base", "c03-impact-boundary-v1", None)],
        )
        add(
            "bounded_checks",
            "inference",
            "应在同一时间轴核对储能指令、储能实际功率、PCC 实际功率及功率平衡项，并检查符号映射与通信状态；现有证据只支持有界排查，不支持直接下发控制指令。",
            [("knowledge_base", "h2-power-balance-boundary-v1", None)],
        )
    elif question_id == "Q04":
        add(
            "headroom_calculation",
            "calculation",
            "SOC 调节备用要同时比较实际 SOC 与目标 SOC，并结合可充/可放功率、可用能量容量和剩余时间计算双向余量；缺少容量或时间窗时只能标记证据不足，不能把缺失值当作零。",
            [("knowledge_base", "c07-headroom-calculation-v1", None)],
        )
        add(
            "early_warning",
            "inference",
            "备用不足是面向后续调节能力的提前预警，不等同于已经发生设备故障；应核对 SOC、目标值、功率限制和能量容量后再由人工判断。",
            [("constraint", "bess-soc-reserve-boundary-v1", None)],
        )
    elif question_id == "Q05":
        add(
            "localization_method",
            "fact",
            "定位时应把设备可用状态与额定/可用容量、EMS 容量模型和已发设定值按同一时间轴对齐，找出设备已经降额而 EMS 仍沿用旧容量的区间，并记录受影响设备。",
            [("knowledge_base", "c02-capacity-synchronization-v1", None)],
        )
        add(
            "evidence_limit",
            "recommendation",
            "若当前运行缺少设备主数据、容量变更记录或操作日志，应明确列出缺项并请求人工核验，不能从单个功率点反推降额事实。",
            [("constraint", "human-confirmation-v1", None)],
        )
    elif question_id == "Q06":
        add(
            "comparison_method",
            "fact",
            "应比较光伏实际/预测或天气变化、电解槽指令反转、设备响应延迟、振荡周期和多设备同步性：云团变化通常先体现在光伏或天气证据，控制指令振荡则表现为指令的重复反转及随后响应。",
            [("knowledge_base", "c01-cloud-versus-command-v1", None)],
        )
        add(
            "minimum_evidence",
            "inference",
            "单个告警或单个采样点不足以区分两者；至少需要时间对齐的多点趋势和跨设备证据，缺少这些证据时结论必须保持未确定。",
            [("constraint", "electrolyzer-ramp-limit-v1", None)],
        )
    elif question_id == "Q07":
        add(
            "allocation_baseline",
            "calculation",
            "评价多台电解槽分配时，应在各机组容量、稳定运行区间、爬坡限制和启停约束内，比较逐台指令/实际功率，并按效率曲线计算同等产出下的能耗基线。",
            [("knowledge_base", "c06-allocation-baseline-v1", None)],
        )
        add(
            "health_limit",
            "fact",
            "当前合同没有电解槽健康评分，不能把效率差异解释成设备健康结论；缺少逐台功率或效率曲线时只能说明无法完成该项比较。",
            [("knowledge_base", "electrolyzer-health-score-unavailable-v1", None)],
        )
    elif question_id == "Q08":
        add(
            "human_boundary",
            "fact",
            "所有运行建议都只是辅助信息，执行任何操作前均须人工确认；本应用不具备设备控制、设定值修改或模式切换权限。",
            [("constraint", "human-confirmation-v1", None)],
        )
        add(
            "recommendation_groups",
            "recommendation",
            "建议按检查、监视、升级和报告四类处理：检查数据与映射，监视趋势，必要时升级给责任人员，并生成可审计报告；任何一类都不得自动转成控制命令。",
            [("knowledge_base", "h2-recommendation-actions-v1", None)],
        )
    elif question_id == "Q09":
        assert event is not None and generated_report is not None
        report_id = generated_report["descriptor"]["reportId"]
        add(
            "report_scope",
            "fact",
            f"已针对当前运行事件 {event['eventId']} 生成单事件诊断报告；数据来源标记为 {run['dataset']['mode']}，固定样例不会被描述为测试集结果或隐藏标签结论。",
            [("event", event["eventId"], event["eventId"])],
        )
        add(
            "generated_report",
            "recommendation",
            "报告按证据、事实与推断、影响、安全检查、人工复核和限制分区；查看报告后仍须由人工决定后续处置。",
            [("report", report_id, event["eventId"])],
        )
    elif question_id == "Q10":
        add(
            "daily_sections",
            "recommendation",
            "PCC 合规日报应包含实际 PCC 功率与动态进/出上限、越限区间/时长/越限电量、当日累计进/出电量与配额、C04/C05 事件及复核状态、数据质量、来源与安全声明。",
            [("report", "pcc_daily_compliance", None)],
        )
        add(
            "quota_limit",
            "fact",
            "若当前数据没有累计电量变量或官方配额证据，日报必须写明“证据不足，未计算该项合规结论”，不得用零替代缺失值。",
            [
                ("variable", "pcc_power_actual_kw", None),
                ("constraint", "pcc-energy-quota-evidence-v1", None),
            ],
        )
    else:
        raise AssertionError(f"Unhandled assistant question: {question_id}")

    if event is not None and question_id not in {"Q03", "Q09"}:
        add(
            "selected_event_context",
            "fact",
            f"本回答限定于当前运行中的事件 {event['eventId']}（{event['code']}，{event['startTime']} 至 {event['endTime']}），未将其他运行或标签数据混入结论。",
            [("event", event["eventId"], event["eventId"])],
        )
    return sections, citations
