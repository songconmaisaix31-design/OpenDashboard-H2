from __future__ import annotations

from collections.abc import Callable
from typing import Any

from h2_analytics.assistant.corpus import (
    KnowledgeCorpusError,
    entries_for_citations,
)
from h2_analytics.contracts import ASSISTANT_QUESTION_IDS, build_provenance
from h2_analytics.errors import AnalyticsError
from h2_analytics.vocabulary import efficiency_curve_by_equipment

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


def _fmt_number(value: float) -> str:
    """数值显示：整数直显、浮点保留两位去尾零，避免答案文本出现长小数。"""
    rounded = round(float(value), 2)
    if rounded == int(rounded):
        return str(int(rounded))
    return f"{rounded:g}"


def _fact_measurements(event: dict[str, Any]) -> list[dict[str, Any]]:
    """事件 fact 证据中的数值条目（变量/实测/单位/时点全部透传自 run 对象，不加工）。"""
    return [
        item
        for item in event["evidence"]
        if item["claimKind"] == "fact"
        and isinstance(item.get("actualValue"), (int, float))
        and not isinstance(item.get("actualValue"), bool)
    ]


def _measurement_lines(items: list[dict[str, Any]]) -> list[str]:
    """把数值证据条目渲染为可读文本行；只报实测值，不复述检测算子以免误导。"""
    lines: list[str] = []
    for item in items:
        unit = item.get("unit") or ""
        timestamp = item.get("timestamp")
        moment = f"（{timestamp}）" if timestamp else ""
        lines.append(
            f"{item['variable']} 实测 {_fmt_number(item['actualValue'])}"
            f"{' ' + unit if unit else ''}{moment}"
        )
    return lines


def _first_event_of_code(
    run: dict[str, Any], code: str
) -> dict[str, Any] | None:
    """run 内指定异常码的第一个事件（无则 None）。"""
    return next(
        (item for item in run["events"] if item["code"] == code), None
    )


def _pcc_observed(
    run: dict[str, Any],
) -> list[tuple[dict[str, Any], dict[str, Any]]]:
    """跨事件收集 PCC 实际功率实测条目（(事件, 证据) 对，按事件顺序）。"""
    collected: list[tuple[dict[str, Any], dict[str, Any]]] = []
    for event in run["events"]:
        for item in _fact_measurements(event):
            if item["variable"] == "pcc_power_actual_kw":
                collected.append((event, item))
    return collected


def _elz_observed(
    run: dict[str, Any],
) -> list[tuple[dict[str, Any], dict[str, Any]]]:
    """跨事件收集电解槽逐台功率实测条目（elz{n}_power_actual_kw）。"""
    collected: list[tuple[dict[str, Any], dict[str, Any]]] = []
    for event in run["events"]:
        for item in _fact_measurements(event):
            variable = item["variable"]
            if (
                variable.startswith("elz")
                and variable.endswith("_power_actual_kw")
                and variable[len("elz") : -len("_power_actual_kw")].isdigit()
            ):
                collected.append((event, item))
    return collected


def _rated_energy_baseline() -> list[tuple[str, float, float]]:
    """效率曲线额定工况（load_ratio=1.0）单耗基线：(设备号, 额定功率 kW, 单耗 kWh/kg)。

    数值取自冻结词表效率曲线，属静态参考基线，不是当前运行实测。
    """
    rows: list[tuple[str, float, float]] = []
    for equipment_id, curve in sorted(efficiency_curve_by_equipment().items()):
        rated = next(
            (row for row in curve if str(row.get("load_ratio")) == "1.0"),
            None,
        )
        if rated is not None:
            rows.append(
                (
                    equipment_id,
                    float(rated["power_kw"]),
                    float(rated["specific_energy_kwh_per_kg"]),
                )
            )
    return rows


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
        # 引用一致性断言（B-P1-1）：knowledge_base 静态引用必须可溯源到
        # knowledge-base.md 的真实条目（run: 动态 ID 除外），失配即 fail-fast。
        try:
            entries_for_citations(citations)
        except KnowledgeCorpusError as error:
            raise AnalyticsError(
                "assistant.knowledge_unresolvable",
                "答案引用的知识条目不可溯源。",
            ) from error
        generated_at = run["completedAt"]
        provenance = build_provenance(
            mode=run["dataset"]["mode"],
            generated_at=generated_at,
            fingerprint=run["dataset"]["fingerprint"],
            model_version=run["provenance"]["modelVersion"],
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
        pcc_observed = _pcc_observed(run)
        if pcc_observed:
            observed_values = [
                float(item["actualValue"]) for _, item in pcc_observed
            ]
            detail = "；".join(
                f"{evt['eventId']} {_fmt_number(item['actualValue'])} "
                f"{item.get('unit') or 'kW'}（{item.get('timestamp', '')}）"
                for evt, item in pcc_observed
            )
            direction = (
                "均为正值，即上网送电方向"
                if all(value >= 0 for value in observed_values)
                else "含负值，即存在受电时段"
            )
            add(
                "run_pcc_observed",
                "calculation",
                f"当前运行已检出事件的证据中共 {len(pcc_observed)} 条 PCC 功率实测：{detail}；"
                f"实测范围 {_fmt_number(min(observed_values))} 至 "
                f"{_fmt_number(max(observed_values))} kW，{direction}。"
                "该范围只覆盖已检出事件窗，不代表全时段正负时长占比，后者须回看完整时序。",
                [
                    ("evidence", item["evidenceId"], evt["eventId"])
                    for evt, item in pcc_observed
                ],
            )
        else:
            add(
                "run_pcc_observed",
                "calculation",
                "当前运行未检出含 PCC 功率实测证据的事件，无法给出实测区间；"
                "正负号方向判断以符号约定为准，如需正负时长占比须回看完整时序。",
                [("knowledge_base", f"run:{run['runId']}:summary", None)],
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
        c04_count = run["eventCountsByCode"]["C04"]
        c05_count = run["eventCountsByCode"]["C05"]
        focus_event = event or _first_event_of_code(run, "C04") or (
            _first_event_of_code(run, "C05")
        )
        count_parts = [
            f"当前运行检出 C04 功率越限 {c04_count} 起、"
            f"C05 电量配额异常 {c05_count} 起"
        ]
        focus_sources: list[tuple[str, str, str | None]] = [
            ("knowledge_base", f"run:{run['runId']}:summary", None)
        ]
        if focus_event is not None:
            measurements = _fact_measurements(focus_event)
            lines = _measurement_lines(measurements)
            if lines:
                count_parts.append(
                    f"以事件 {focus_event['eventId']}"
                    f"（{focus_event['startTime']} 至 {focus_event['endTime']}）为例，"
                    f"事件证据实测：{'；'.join(lines)}"
                )
                focus_sources.extend(
                    ("evidence", item["evidenceId"], focus_event["eventId"])
                    for item in measurements
                )
            impact = focus_event.get("impact") or {}
            if isinstance(impact.get("value"), (int, float)):
                count_parts.append(
                    f"该事件影响量化为 {_fmt_number(impact['value'])} "
                    f"{impact.get('unit', '')}（{impact.get('formulaVersion', '')}）"
                )
        if c05_count == 0 and (focus_event is None or focus_event["code"] != "C05"):
            count_parts.append(
                "当前运行未提供当日累计电量与配额实测值，配额余量不在本回答内计算，不以零替代"
            )
        add(
            "current_run_counts",
            "calculation",
            "；".join(count_parts) + "。",
            focus_sources,
        )
    elif question_id == "Q03":
        assert event is not None
        calculation_evidence = [
            item
            for item in event["evidence"]
            if item["claimKind"] == "calculation"
        ]
        fact_measurements = _fact_measurements(event)
        measurement_lines = _measurement_lines(fact_measurements)
        observed_detail = (
            f"事件证据实测：{'；'.join(measurement_lines)}。"
            if measurement_lines
            else "本事件证据未含可引用的数值实测条目。"
        )
        add(
            "observed_mismatch",
            "fact",
            f"事件 {event['eventId']} 在 {event['startTime']} 至 {event['endTime']} 出现储能指令与实际功率方向不一致。{observed_detail}"
            "如需逐分钟核对 PCC 实际功率，应回到同一运行的 pcc_power_actual_kw 时序，不能仅凭异常标签推断。",
            [
                ("event", event["eventId"], event["eventId"]),
                *[
                    ("evidence", item["evidenceId"], event["eventId"])
                    for item in fact_measurements
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
        c07_event = event or _first_event_of_code(run, "C07")
        if c07_event is not None:
            c07_measurements = _fact_measurements(c07_event)
            c07_lines = _measurement_lines(c07_measurements)
            c07_detail = (
                f"事件证据实测：{'；'.join(c07_lines)}"
                if c07_lines
                else "本事件证据未含可引用的数值实测条目"
            )
            add(
                "c07_observed",
                "fact",
                f"当前运行检出的 C07 事件 {c07_event['eventId']}"
                f"（{c07_event['startTime']} 至 {c07_event['endTime']}）{c07_detail}；"
                "以上为 SOC 备用判断的实测输入，双向余量仍须结合容量与时间窗证据计算。",
                [
                    ("event", c07_event["eventId"], c07_event["eventId"]),
                    *[
                        ("evidence", item["evidenceId"], c07_event["eventId"])
                        for item in c07_measurements
                    ],
                ],
            )
        else:
            add(
                "c07_observed",
                "fact",
                "当前运行未检出 C07（SOC 调节备用不足）事件，本回答不提供 SOC 实测数值；"
                "双向余量须在检出该类事件后以事件证据与容量、时间窗数据计算，不以零替代。",
                [("knowledge_base", f"run:{run['runId']}:summary", None)],
            )
    elif question_id == "Q05":
        add(
            "localization_method",
            "fact",
            "定位时应把设备可用状态与额定/可用容量、EMS 容量模型和已发设定值按同一时间轴对齐，找出设备已经降额而 EMS 仍沿用旧容量的区间，并记录受影响设备。",
            [("knowledge_base", "c02-capacity-synchronization-v1", None)],
        )
        c02_event = event or _first_event_of_code(run, "C02")
        if c02_event is not None:
            c02_measurements = _fact_measurements(c02_event)
            c02_lines = _measurement_lines(c02_measurements)
            c02_detail = (
                f"事件证据实测：{'；'.join(c02_lines)}"
                if c02_lines
                else "本事件证据未含可引用的数值实测条目"
            )
            add(
                "c02_observed",
                "fact",
                f"当前运行检出的 C02 事件 {c02_event['eventId']}"
                f"（{c02_event['startTime']} 至 {c02_event['endTime']}）{c02_detail}；"
                "定位时把以上数值与 EMS 容量模型、已发设定值按同一时间轴对齐。",
                [
                    ("event", c02_event["eventId"], c02_event["eventId"]),
                    *[
                        ("evidence", item["evidenceId"], c02_event["eventId"])
                        for item in c02_measurements
                    ],
                ],
            )
        else:
            add(
                "c02_observed",
                "fact",
                "当前运行未检出 C02（设备降额与 EMS 未同步）事件，本回答不提供降额容量差实测数值；"
                "定位结论须以该类事件证据与设备主数据为准，不从单个功率点反推降额事实。",
                [("knowledge_base", f"run:{run['runId']}:summary", None)],
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
        c01_event = event or _first_event_of_code(run, "C01")
        if c01_event is not None:
            c01_measurements = _fact_measurements(c01_event)
            c01_lines = _measurement_lines(c01_measurements)
            c01_detail = (
                f"事件证据实测：{'；'.join(c01_lines)}"
                if c01_lines
                else "本事件证据未含可引用的数值实测条目"
            )
            add(
                "c01_observed",
                "fact",
                f"当前运行检出的 C01 事件 {c01_event['eventId']}"
                f"（{c01_event['startTime']} 至 {c01_event['endTime']}）{c01_detail}；"
                "以上为区分云团变化与控制指令振荡的实测输入，结论仍须以时间对齐的光伏与指令证据共同判断。",
                [
                    ("event", c01_event["eventId"], c01_event["eventId"]),
                    *[
                        ("evidence", item["evidenceId"], c01_event["eventId"])
                        for item in c01_measurements
                    ],
                ],
            )
        else:
            add(
                "c01_observed",
                "fact",
                "当前运行未检出 C01 事件，本回答不提供事件窗光伏波动幅度与指令反转计数实测；"
                "云团变化与控制指令振荡的区分须在检出该类事件后，"
                "以时间对齐的光伏与指令证据判断，不以单一采样点下结论。",
                [("knowledge_base", f"run:{run['runId']}:summary", None)],
            )
    elif question_id == "Q07":
        add(
            "allocation_baseline",
            "calculation",
            "评价多台电解槽分配时，应在各机组容量、稳定运行区间、爬坡限制和启停约束内，比较逐台指令/实际功率，并按效率曲线计算同等产出下的能耗基线。",
            [("knowledge_base", "c06-allocation-baseline-v1", None)],
        )
        baseline_rows = _rated_energy_baseline()
        if baseline_rows:
            baseline_detail = "、".join(
                f"{equipment} 额定 {_fmt_number(power)} kW 单耗 "
                f"{_fmt_number(energy)} kWh/kg"
                for equipment, power, energy in baseline_rows
            )
            energies = [row[2] for row in baseline_rows]
            order_note = (
                f"，同一产出下 {baseline_rows[energies.index(min(energies))][0]}"
                f" 能耗基线最低、{baseline_rows[energies.index(max(energies))][0]} 最高"
                if len(baseline_rows) >= 2
                else ""
            )
            add(
                "efficiency_baseline",
                "fact",
                f"按电解槽效率曲线额定工况基线：{baseline_detail}{order_note}；"
                "该基线取自效率曲线参考值，仅用于同等产出下的能耗比较，不构成设备健康结论。",
                [("constraint", "electrolyzer-efficiency-curves-v1", None)],
            )
        else:
            add(
                "efficiency_baseline",
                "fact",
                "效率曲线参考值中未提供额定工况单耗基线，本回答不给出静态能耗对比参考；"
                "逐台能耗比较须以效率曲线证据为准。",
                [("constraint", "electrolyzer-efficiency-curves-v1", None)],
            )
        elz_items = _elz_observed(run)
        if elz_items:
            elz_detail = "；".join(
                f"{item['variable']} 实测 {_fmt_number(item['actualValue'])} "
                f"{item.get('unit') or 'kW'}（{item.get('timestamp', '')}）"
                for _, item in elz_items
            )
            add(
                "elz_observed",
                "calculation",
                f"当前运行已检出事件证据中共 {len(elz_items)} 条电解槽逐台功率实测：{elz_detail}；"
                "逐台负荷分配与能耗对比须把以上实测与效率曲线、产出证据结合计算，"
                "不由单点功率推断分配优劣。",
                [
                    ("evidence", item["evidenceId"], evt["eventId"])
                    for evt, item in elz_items
                ],
            )
        else:
            add(
                "elz_observed",
                "calculation",
                "当前运行已检出事件的证据中未含电解槽逐台功率实测，"
                "无法给出逐台功率与能耗对比实测；"
                "该项比较须以逐台功率与效率曲线证据完成，不以零或估算替代。",
                [("knowledge_base", f"run:{run['runId']}:summary", None)],
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
        c04_count = run["eventCountsByCode"]["C04"]
        c05_count = run["eventCountsByCode"]["C05"]
        compliance_parts = [
            f"当前运行检出 C04 功率越限 {c04_count} 起、C05 电量配额异常 {c05_count} 起"
        ]
        compliance_sources: list[tuple[str, str, str | None]] = [
            ("knowledge_base", f"run:{run['runId']}:summary", None)
        ]
        compliance_event = event or _first_event_of_code(run, "C04") or (
            _first_event_of_code(run, "C05")
        )
        if compliance_event is not None:
            impact = compliance_event.get("impact") or {}
            if isinstance(impact.get("value"), (int, float)):
                compliance_parts.append(
                    f"以事件 {compliance_event['eventId']}"
                    f"（{compliance_event['startTime']} 至 {compliance_event['endTime']}）为例，"
                    f"越限电量实测 {_fmt_number(impact['value'])} "
                    f"{impact.get('unit', '')}（{impact.get('formulaVersion', '')}）"
                )
                compliance_sources.extend(
                    ("evidence", evidence_id, compliance_event["eventId"])
                    for evidence_id in impact.get("evidenceIds", [])
                )
        energy_items = [
            item
            for run_event in run["events"]
            for item in _fact_measurements(run_event)
            if "energy" in item["variable"]
        ]
        if energy_items:
            energy_detail = "；".join(_measurement_lines(energy_items))
            compliance_parts.append(f"累计电量证据实测：{energy_detail}")
            compliance_sources.extend(
                ("evidence", item["evidenceId"], run_event["eventId"])
                for run_event in run["events"]
                for item in _fact_measurements(run_event)
                if "energy" in item["variable"]
            )
        else:
            compliance_parts.append(
                "已检出事件证据中无当日累计进/出电量与配额实测，"
                "日报该项按证据不足处理，未计算合规结论，不以零替代"
            )
        add(
            "observed_compliance",
            "calculation",
            "；".join(compliance_parts) + "。",
            compliance_sources,
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

    add(
        "current_run_context",
        "fact",
        (
            f"本回答使用当前运行 {run['runId']} 的 {run['dataset']['rowCount']} 行数据、"
            f"{run['dataset']['samplingIntervalMinutes']} 分钟采样间隔和 "
            f"{len(run['events'])} 个已检测事件；这些本地运行数值不代表官方评分或隐藏测试结论。"
        ),
        [("knowledge_base", f"run:{run['runId']}:summary", None)],
    )

    if event is not None and question_id not in {"Q03", "Q09"}:
        add(
            "selected_event_context",
            "fact",
            f"本回答限定于当前运行中的事件 {event['eventId']}（{event['code']}，{event['startTime']} 至 {event['endTime']}），未将其他运行或标签数据混入结论。",
            [("event", event["eventId"], event["eventId"])],
        )
    return sections, citations
