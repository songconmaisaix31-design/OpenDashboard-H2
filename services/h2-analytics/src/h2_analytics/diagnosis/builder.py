from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from h2_analytics import vocabulary
from h2_analytics.contracts import build_provenance
from h2_analytics.detection.c06 import (
    C06Reallocation,
    inefficient_allocation_signature,
)
from h2_analytics.detection.fixture import FIXTURE_C03_DETECTOR_VERSION
from h2_analytics.evidence import EvidenceContext
from h2_analytics.detection.oplog_prior import load_operation_priors
from h2_analytics.diagnosis.root_cause import attribute_root_cause
from h2_analytics.events import EventWindow
from h2_analytics.impact import ImpactCalculator
from h2_analytics.safety import SafetyEvaluator

_METADATA: dict[str, dict[str, Any]] = {
    "C01": {
        "title": "电解槽功率指令振荡",
        "rootCause": (
            "电解槽功率指令在光伏与PCC功率相对稳定的时段发生高频振荡，"
            "指令本身而非负荷扰动导致储能被反复调用以平抑并网点功率。"
        ),
        "recommendation": (
            "核查控制死区、滤波时间常数与各控制环之间的耦合，"
            "在人工确认前避免直接修改电解槽设定值。"
        ),
        "rationale": (
            "规则仅证明指令振荡与外部功率稳定并存，未授权自动闭环控制。"
        ),
        "adjustmentObject": "EMS 电解槽群控的死区与滤波参数",
        "priority": "高",
        "preconditions": "光伏与PCC功率保持相对稳定、已核对参数变更留痕、具备回退条件",
    },
    "C02": {
        "title": "设备可用容量未同步导致功率指令持续偏差",
        "rootCause": (
            "EMS认知的可用容量接近额定值而设备实际可用容量明显偏低，"
            "导致功率指令持续大于设备实际执行功率。"
        ),
        "recommendation": (
            "校核EMS容量模型与PLC状态映射与刷新周期，确认后再决定是否刷新容量。"
        ),
        "rationale": (
            "容量偏差来源（EMS模型或设备侧）需人工确认，规则不直接下结论。"
        ),
        "adjustmentObject": "EMS 容量模型与 PLC 状态映射/刷新周期",
        "priority": "高",
        "preconditions": "设备实际可用容量已现场核实、刷新前备份原容量参数",
    },
    "C03": {
        "title": "储能充放电方向异常",
        "rootCause": (
            "储能功率指令、实际反馈与PCC交换方向之间不符合预期控制关系，"
            "可能存在接口符号、寄存器映射或控制模式冲突，导致并网点异常交换。"
        ),
        "recommendation": (
            "核查储能接口正负号、寄存器映射与控制模式，小功率验证方向后再恢复。"
        ),
        "rationale": (
            "诊断将可能的接口映射问题与确证的设备故障区分开。"
        ),
        "adjustmentObject": "储能接口符号映射、寄存器映射与控制模式",
        "priority": "高",
        "preconditions": "小功率方向验证通过、接口文件符号约定已确认",
    },
    "C04": {
        "title": "PCC上下网功率边界跟踪异常",
        "rootCause": (
            "动态上下网功率限值更新后，EMS未及时调整储能、电解槽或光伏功率，"
            "导致PCC实际功率越过当前有效边界。"
        ),
        "recommendation": (
            "核查边界限值时效性，结合储能、电解槽与光伏可用调节能力，"
            "在人工确认后恢复PCC到边界内。"
        ),
        "rationale": (
            "事件证明存在越限，但不授权自动控制动作。"
        ),
        "adjustmentObject": "储能、电解槽与光伏的出力分配",
        "priority": "高",
        "preconditions": "当前有效限值已带时间戳确认、各类可调容量已核算",
    },
    "C05": {
        "title": "上下网电量配额执行异常",
        "rootCause": (
            "累计上网或下网电量使用过快，剩余配额提前归零，"
            "导致配额超限或后续日内计划不可执行。"
        ),
        "recommendation": (
            "结合剩余配额、负荷预测与光伏预测复核日内电量计划，"
            "必要时在人工确认后调整计划或负荷分配。"
        ),
        "rationale": (
            "配额风险属于累计约束，需结合日内计划人工复核。"
        ),
        "adjustmentObject": "日内电量计划与负荷分配",
        "priority": "中",
        "preconditions": "剩余配额、负荷预测与光伏预测已复核",
    },
    "C06": {
        "title": "多台电解槽负荷分配异常",
        "rootCause": (
            "未综合设备可用性、实际效率曲线、最小稳定功率与运行状态分配负荷，"
            "高单位电耗设备承担过多负荷，或发生可避免的启停。"
        ),
        "recommendation": (
            "按实际效率曲线、可用状态与最小稳定功率重新分配负荷，"
            "在人工确认前不执行任何启停动作。"
        ),
        "rationale": (
            "负荷分配是否可避免需结合运行状态与效率曲线人工确认。"
        ),
        "adjustmentObject": "多台电解槽的负荷分配方案",
        "priority": "中",
        "preconditions": "效率曲线、可用状态与最小稳定功率已读取",
    },
    "C07": {
        "title": "储能SOC目标轨迹与调节裕度管理异常",
        "rootCause": (
            "SOC目标轨迹或充放电计划不合理，未为未来功率波动、PCC约束和制氢计划"
            "保留调节备用，可用充放电能量不足以覆盖调节备用目标。"
        ),
        "recommendation": (
            "结合未来负荷、PCC约束与调节备用目标复核SOC计划，"
            "为可充电空间与放电备用保留足够裕度。"
        ),
        "rationale": (
            "SOC规划问题需结合日内计划人工确认，规则只给出裕度缺口证据。"
        ),
        "adjustmentObject": "SOC 目标轨迹与充放电计划",
        "priority": "中",
        "preconditions": "未来负荷、PCC约束与调节备用目标已核算",
    },
}

_EVIDENCE_PLAN: dict[str, tuple[dict[str, Any], ...]] = {
    "C01": (
        {
            "kind": "measurement",
            "variable": "elz1_power_cmd_kw",
            "reference": "stable electrolyzer setpoint",
            "comparator": "!=",
            "conclusion": "电解槽功率指令在光伏与PCC相对稳定时段高频振荡。",
            "unit": "kW",
        },
        {
            "kind": "measurement",
            "variable": "pcc_power_actual_kw",
            "reference": "stable PCC output",
            "comparator": "within",
            "conclusion": "PCC实际功率保持相对稳定，振荡来源于指令而非外部扰动。",
            "unit": "kW",
        },
    ),
    "C02": (
        {
            "kind": "measurement",
            "variable": "elz1_reported_available_capacity_kw",
            "reference": "rated capacity",
            "comparator": ">=",
            "conclusion": "EMS报告可用容量接近额定值，设备实际可用容量明显偏低。",
            "unit": "kW",
        },
        {
            "kind": "measurement",
            "variable": "elz1_power_cmd_kw",
            "reference": "actual executed power",
            "comparator": ">",
            "conclusion": "电解槽功率指令持续大于实际执行功率。",
            "unit": "kW",
        },
    ),
    "C03": (
        {
            "kind": "measurement",
            "variable": "bess_power_cmd_kw",
            "reference": "power gap or SOC target need",
            "comparator": "!=",
            "conclusion": "储能指令方向与功率缺口或SOC目标需求冲突。",
            "unit": "kW",
        },
        {
            "kind": "measurement",
            "variable": "bess_power_actual_kw",
            "reference": "command direction",
            "comparator": "=",
            "conclusion": "储能实际功率跟随冻结竞争签名中的指令方向。",
            "unit": "kW",
        },
        {
            "kind": "measurement",
            "variable": "pcc_power_actual_kw",
            "reference": "command direction",
            "comparator": "=",
            "conclusion": "PCC交换功率与储能响应同向并被推向不利方向。",
            "unit": "kW",
        },
    ),
    "C04": (
        {
            "kind": "measurement",
            "variable": "pcc_power_actual_kw",
            "reference": "active power boundary",
            "comparator": ">",
            "conclusion": "PCC实际功率越过当前有效功率边界。",
            "unit": "kW",
        },
        {
            "kind": "constraint",
            "variable": "grid_export_power_limit_kw",
            "reference": "configured boundary",
            "comparator": "=",
            "conclusion": "该时段生效的并网点功率边界。",
            "unit": "kW",
        },
    ),
    "C05": (
        {
            "kind": "measurement",
            "variable": "grid_export_energy_quota_excess_kwh",
            "reference": "zero excess",
            "comparator": ">",
            "conclusion": "累计电量超出日配额。",
            "unit": "kWh",
        },
        {
            "kind": "measurement",
            "variable": "grid_export_energy_remaining_kwh",
            "reference": "remaining quota",
            "comparator": "<",
            "conclusion": "剩余配额过低且使用过快，存在配额超限风险。",
            "unit": "kWh",
        },
    ),
    "C06": (
        {
            "kind": "measurement",
            "variable": "elz1_specific_energy_kwh_per_kg",
            "reference": "more efficient unit",
            "comparator": ">",
            "conclusion": "单位电耗较高的设备承担了更多负荷。",
            "unit": "kWh/kg",
        },
        {
            "kind": "measurement",
            "variable": "elz1_power_actual_kw",
            "reference": "available headroom",
            "comparator": ">",
            "conclusion": "更高效率且可用的设备仍有功率裕量。",
            "unit": "kW",
        },
    ),
    "C07": (
        {
            "kind": "measurement",
            "variable": "bess_available_charge_energy_kwh",
            "reference": "reserve target",
            "comparator": "<",
            "conclusion": "可用调节能量不足以覆盖调节备用目标。",
            "unit": "kWh",
        },
        {
            "kind": "constraint",
            "variable": "bess_regulation_reserve_target_kwh",
            "reference": "planned reserve",
            "comparator": "=",
            "conclusion": "当前计划要求的调节备用能量目标。",
            "unit": "kWh",
        },
    ),
}

_CONTROL_ID_BY_CODE = {
    "C01": "ems-elz-group-control",
    "C02": "ems-capacity-sync",
    "C03": "ems-bess-control",
    "C04": "ems-pcc-boundary",
    "C05": "ems-quota-plan",
    "C06": "ems-elz-allocation",
    "C07": "ems-bess-soc-reserve",
}


class DiagnosisBuilder:
    """Compose a single-event diagnosis with an auditable evidence chain.

    Evidence policy (T06 requirement): every measurement-style evidence item
    carries the four required elements -- TIME, VARIABLE, ACTUAL VALUE, and
    REFERENCE/LIMIT value -- so a reader can re-check any claim against the
    official tables.

    Alarm policy (requirement T03 and Track B task B2): records from
    `11_alarm_log.csv` are EVIDENCE ONLY. They enter the diagnosis as
    `alarm_log` facts for human review, but they are NEVER a detection
    criterion: `is_anomaly` decisions come exclusively from the detection
    module, which has no access to the evidence context. The evidence tables
    are read by this builder after an anomaly has already been detected.
    """

    def __init__(
        self,
        impact_calculator: ImpactCalculator | None = None,
        safety_evaluator: SafetyEvaluator | None = None,
        evidence_context: EvidenceContext | None = None,
    ) -> None:
        self._impact = impact_calculator or ImpactCalculator()
        self._safety = safety_evaluator or SafetyEvaluator()
        self._evidence_context = evidence_context or EvidenceContext.from_env()

    def build(
        self,
        *,
        window: EventWindow,
        manifest: dict[str, Any],
    ) -> dict[str, Any]:
        metadata = _METADATA[window.code]
        affected_equipment = _affected_equipment(window)
        generated_at = manifest["provenance"]["generatedAt"]
        provenance = build_provenance(
            mode=manifest["mode"],
            generated_at=generated_at,
            fingerprint=manifest["fingerprint"],
            model_version=window.detector_version,
        )
        calculation = self._impact.calculate(
            window=window,
            sampling_interval_minutes=float(manifest["samplingIntervalMinutes"]),
        )
        evidence, impact_evidence_id = self._evidence(
            window,
            calculation.value,
            calculation.formula_version,
            provenance,
        )
        evidence_ids = tuple(item["evidenceId"] for item in evidence)
        safety_checks = self._safety.evaluate(
            window=window,
            evidence_ids=evidence_ids,
            provenance=provenance,
        )
        identity = window.code if window.event_id.endswith("-001") else window.event_id
        recommendation_id = f"{identity}-REC-001"
        # P1-8：根因数据驱动归因（操作日志模式映射 + IF-2 引用；无支撑回退"证据不足"）。
        attribution = attribute_root_cause(
            code=window.code,
            window_start=window.start_time,
            template=metadata["rootCause"],
            context=self._evidence_context,
        )
        return {
            "schemaVersion": 1,
            "eventId": window.event_id,
            "code": window.code,
            "subtype": window.subtype,
            "title": metadata["title"],
            "startTime": _timestamp(window.start_time),
            "endTime": _timestamp(window.end_time),
            "firstDetectionTime": _timestamp(window.first_detection_time),
            "severity": vocabulary.wire_severity_by_code()[window.code],
            "confidence": window.confidence,
            "primaryControlObject": {
                "type": vocabulary.control_object_type_by_code()[window.code],
                "id": _CONTROL_ID_BY_CODE[window.code],
                "displayName": vocabulary.primary_control_object_by_code()[window.code],
            },
            "affectedEquipment": affected_equipment,
            "evidence": evidence,
            "impact": {
                "metric": calculation.metric,
                "value": calculation.value,
                "unit": calculation.unit,
                "formulaVersion": calculation.formula_version,
                "assumptions": list(calculation.assumptions),
                "evidenceIds": [impact_evidence_id],
                "provenance": provenance,
            },
            "safetyChecks": safety_checks,
            "recommendations": [
                {
                    "recommendationId": recommendation_id,
                    "actionKind": "check",
                    "summary": (
                        f"{metadata['recommendation']} "
                        f"调整对象：{metadata['adjustmentObject']}；"
                        f"前置条件：{metadata['preconditions']}。"
                    ),
                    "rationale": (
                        f"{metadata['rationale']} 优先级：{metadata['priority']}；"
                        "本建议需人工确认后执行，服务不自动闭环下发。"
                    ),
                    "safetyCheckIds": [item["checkId"] for item in safety_checks],
                    "evidenceIds": list(evidence_ids[:2]),
                    "requiresHumanConfirmation": True,
                    "provenance": provenance,
                }
            ],
            "rootCause": attribution.statement,
            "rootCauseKind": "inference",
            "rootCauseCitations": [dict(citation) for citation in attribution.citations],
            "reviewState": "open",
            "provenance": provenance,
            "requiresHumanConfirmation": True,
        }

    def _evidence(
        self,
        window: EventWindow,
        impact_value: float,
        impact_formula_version: str,
        provenance: dict[str, Any],
    ) -> tuple[list[dict[str, Any]], str]:
        detection_row = _detection_row(window)
        plan = self._plan_for(window)
        evidence: list[dict[str, Any]] = []
        for index, item in enumerate(plan):
            reference = _reference_for(window, item)
            evidence.append(
                _evidence_item(
                    _evidence_id(window, index + 1),
                    item["kind"],
                    detection_row,
                    item["variable"],
                    reference,
                    item["comparator"],
                    item["conclusion"],
                    item["unit"],
                    provenance,
                )
            )
        evidence.extend(
            self._c06_reference_evidence(
                window,
                provenance,
                offset=len(evidence),
            )
        )
        impact_variable = vocabulary.primary_impact_metric_by_code()[window.code]
        impact_evidence_id = _evidence_id(window, len(evidence) + 1)
        evidence.append(
            _impact_evidence(
                impact_evidence_id,
                window,
                impact_variable,
                impact_value,
                impact_formula_version,
                "该事件的定量影响结果。",
                provenance,
            )
        )
        evidence.extend(
            self._context_evidence(window, provenance, offset=len(evidence))
        )
        evidence.extend(
            self._operation_prior_evidence(window, provenance, offset=len(evidence))
        )
        return evidence, impact_evidence_id

    def _operation_prior_evidence(
        self,
        window: EventWindow,
        provenance: dict[str, Any],
        *,
        offset: int,
    ) -> list[dict[str, Any]]:
        """A-P0-1：事件起点落在同码操作先验窗内 → 追加 operation_prior 条目。

        与 `_context_evidence` 的 operation_log 条目（事件窗内事实罗列）语义
        不同：本条目引用**事件开始前**的触发先验操作，remark 原文入
        referenceValue，供根因链与 B 线助手回溯（CONTRACTS IF-2，optional
        字段 operationType/priorToCode，加法式扩展）。仅当
        H2_OPERATION_LOG_PATH 注入时产生；未注入时为空（v5 行为）。
        """
        priors = load_operation_priors()
        if priors is None:
            return []
        hits = priors.match(window.code, window.start_time)
        items: list[dict[str, Any]] = []
        for entry in hits[:2]:  # 有界引用：最多 2 条，确定性顺序。
            items.append(
                {
                    "schemaVersion": 1,
                    "evidenceId": _evidence_id(window, offset + len(items) + 1),
                    "kind": "operation_prior",
                    "claimKind": "fact",
                    "timestamp": _timestamp(entry.timestamp),
                    "variable": entry.parameter,
                    "actualValue": entry.change,
                    "referenceValue": entry.remark,
                    "unit": "",
                    "comparator": "=",
                    "source": "operation-log-prior",
                    "operationType": entry.operation_type,
                    "priorToCode": window.code,
                    "conclusion": (
                        f"事件开始前的「{entry.operation_type}」（参数 "
                        f"{entry.parameter} 变更为「{entry.change}」）构成 "
                        f"{window.code} 类检测先验；备注原文可回溯。"
                    ),
                    "provenance": provenance,
                }
            )
        return items

    def _plan_for(self, window: EventWindow) -> tuple[dict[str, Any], ...]:
        plan = [dict(item) for item in _EVIDENCE_PLAN[window.code]]
        implicated = window.implicated_equipment_ids
        if window.code == "C01" and implicated:
            command_template = plan[0]
            plan = [
                {
                    **command_template,
                    "variable": _elz_field(equipment_id, "power_cmd_kw"),
                }
                for equipment_id in implicated
            ] + [plan[1]]
        elif window.code == "C02" and implicated:
            plan[0]["variable"] = _elz_field(
                implicated[0], "reported_available_capacity_kw"
            )
            plan[1]["variable"] = _elz_field(implicated[0], "power_cmd_kw")
        elif (
            window.code == "C03"
            and window.detector_version == FIXTURE_C03_DETECTOR_VERSION
        ):
            detection_row = _detection_row(window)
            command = detection_row.value("bess_power_cmd_kw")
            actual = detection_row.value("bess_power_actual_kw")
            if command is not None and actual is not None and command * actual < 0:
                comparator = "<" if command < 0 else ">"
                plan = [
                    {
                        **plan[0],
                        "reference": 0,
                        "comparator": comparator,
                        "conclusion": "储能功率指令记录了异常时段的请求方向。",
                    },
                    {
                        **plan[2],
                        "variable": "pcc_power_actual_kw",
                        "reference": 0,
                        "comparator": comparator,
                        "conclusion": (
                            "PCC交换功率记录了兼容样例中的并网点响应；"
                            "该样例不用于校准公共TRAIN因果规则。"
                        ),
                    },
                ]
        elif window.code == "C04":
            if window.subtype == "IMPORT_POWER_LIMIT_NOT_TRACKED":
                plan = [
                    {
                        **plan[0],
                        "variable": "pcc_power_actual_kw",
                        "reference": "negative active boundary",
                        "comparator": "<",
                    },
                    {
                        **plan[1],
                        "variable": "grid_import_power_limit_kw",
                        "conclusion": "该时段生效的下网功率边界。",
                    },
                ]
            else:
                plan[1]["variable"] = "grid_export_power_limit_kw"
        elif window.code == "C05":
            if window.subtype == "IMPORT_ENERGY_QUOTA_RISK":
                plan = [
                    {
                        **plan[0],
                        "variable": "grid_import_energy_quota_excess_kwh",
                        "conclusion": "累计下网电量超出日配额。",
                    },
                    {
                        **plan[1],
                        "variable": "grid_import_energy_remaining_kwh",
                    },
                ]
            else:
                plan[0]["variable"] = "grid_export_energy_quota_excess_kwh"
                plan[1]["variable"] = "grid_export_energy_remaining_kwh"
        elif window.code == "C06":
            plan = list(self._c06_plan(window))
        elif window.code == "C07":
            if window.subtype == "DISCHARGE_RESERVE_SHORTFALL":
                plan[0]["variable"] = "bess_available_discharge_energy_kwh"
        return tuple(plan)

    def _c06_plan(self, window: EventWindow) -> tuple[dict[str, Any], ...]:
        if window.subtype == "INEFFICIENT_POWER_ALLOCATION":
            reference = _required_c06_reallocation(window)
            return _c06_inefficient_plan(reference)
        if (
            window.subtype != "AVOIDABLE_START_STOP"
            or len(window.implicated_equipment_ids) != 3
        ):
            raise vocabulary.VocabularyError(
                "C06 start-stop diagnosis requires all implicated electrolyzers."
            )

        detection_row = _detection_row(window)
        plan: list[dict[str, Any]] = []
        for equipment_id in window.implicated_equipment_ids:
            actual_power = detection_row.value(
                _elz_field(equipment_id, "power_actual_kw")
            )
            if actual_power is None:
                raise vocabulary.VocabularyError(
                    "C06 diagnosis requires complete operating evidence."
                )
            for suffix, unit, expected_reference, comparator, conclusion in (
                ("run_state", "", 2, ">=", "事件确认时设备处于稳定运行状态。"),
                ("available_flag", "", 1, "=", "设备在事件时段被标记为可用。"),
                (
                    "actual_available_capacity_kw",
                    "kW",
                    actual_power,
                    ">=",
                    "设备实际可用容量覆盖当前运行功率。",
                ),
                (
                    "power_actual_kw",
                    "kW",
                    "persistent start-stop signature",
                    "within",
                    "设备功率处于冻结的可避免启停竞争签名。",
                ),
                (
                    "specific_energy_kwh_per_kg",
                    "kWh/kg",
                    "frozen efficiency curve",
                    "within",
                    "设备实测单位电耗可与冻结效率曲线复核。",
                ),
            ):
                variable = _elz_field(equipment_id, suffix)
                if detection_row.value(variable) is None:
                    raise vocabulary.VocabularyError(
                        "C06 diagnosis requires complete operating evidence."
                    )
                plan.append(
                    {
                        "kind": "measurement",
                        "variable": variable,
                        "reference": expected_reference,
                        "comparator": comparator,
                        "conclusion": conclusion,
                        "unit": unit,
                    }
                )
        if detection_row.value("ems_total_elz_target_kw") is None:
            raise vocabulary.VocabularyError(
                "C06 diagnosis requires complete operating evidence."
            )
        plan.append(
            {
                "kind": "measurement",
                "variable": "ems_total_elz_target_kw",
                "reference": sum(
                    detection_row.value(_elz_field(equipment_id, "power_actual_kw"))
                    or 0
                    for equipment_id in window.implicated_equipment_ids
                ),
                "comparator": "=",
                "conclusion": "EMS电解槽总目标与事件时段的实际分配可逐行复核。",
                "unit": "kW",
            }
        )
        return tuple(plan)

    def _c06_reference_evidence(
        self,
        window: EventWindow,
        provenance: dict[str, Any],
        *,
        offset: int,
    ) -> list[dict[str, Any]]:
        if window.code != "C06":
            return []
        if window.subtype == "INEFFICIENT_POWER_ALLOCATION":
            reference = _required_c06_reallocation(window)
            return _c06_reallocation_evidence(
                window,
                reference,
                provenance,
                offset=offset,
            )
        return _canonical_c06_curve_evidence(
            window,
            provenance,
            offset=offset,
        )

    def _context_evidence(
        self,
        window: EventWindow,
        provenance: dict[str, Any],
        *,
        offset: int,
    ) -> list[dict[str, Any]]:
        context = self._evidence_context
        if context.data_dir is None:
            return []
        items: list[dict[str, Any]] = []
        equipment_names = context.equipment()
        if equipment_names:
            names = "、".join(
                f"{key}:{name}"
                for key, name in list(equipment_names.items())[:8]
            )
            items.append(
                _knowledge_evidence(
                    _evidence_id(window, offset + len(items) + 1),
                    "equipment_master",
                    f"设备台账（节选）：{names}",
                    provenance,
                )
            )
        constraints = context.control_constraints()
        if constraints:
            sign = next(
                (
                    row
                    for row in constraints
                    if row["parameter"] in {"pcc_sign_convention", "bess_sign_convention"}
                ),
                None,
            )
            if sign is not None:
                items.append(
                    _knowledge_evidence(
                        _evidence_id(window, offset + len(items) + 1),
                        "control_constraints",
                        f"{sign['object_id']} {sign['parameter']}：{sign['value']}",
                        provenance,
                    )
                )
        for alarm in context.alarm_logs(
            start=window.start_time, end=window.end_time
        )[:2]:
            items.append(
                {
                    "schemaVersion": 1,
                    "evidenceId": _evidence_id(window, offset + len(items) + 1),
                    "kind": "alarm_log",
                    "claimKind": "fact",
                    "timestamp": alarm.get("timestamp", ""),
                    "variable": alarm.get("alarm_code", ""),
                    "actualValue": alarm.get("severity", ""),
                    "referenceValue": "ACTIVE",
                    "unit": "",
                    "comparator": "=",
                    "source": "alarm-log",
                    "conclusion": alarm.get("alarm_message", ""),
                    "provenance": provenance,
                }
            )
        for operation in context.operation_logs(
            start=window.start_time, end=window.end_time
        )[:2]:
            items.append(
                {
                    "schemaVersion": 1,
                    "evidenceId": _evidence_id(window, offset + len(items) + 1),
                    "kind": "operation_log",
                    "claimKind": "fact",
                    "timestamp": operation.get("timestamp", ""),
                    "variable": operation.get("parameter", ""),
                    "actualValue": operation.get("change", ""),
                    "referenceValue": operation.get("remark", ""),
                    "unit": "",
                    "comparator": "=",
                    "source": "operation-log",
                    "conclusion": f"{operation.get('operation_type', '')}：{operation.get('change', '')}",
                    "provenance": provenance,
                }
            )
        for normal in context.normal_context(
            start=window.start_time, end=window.end_time
        )[:1]:
            items.append(
                _knowledge_evidence(
                    _evidence_id(window, offset + len(items) + 1),
                    "normal_context",
                    f"{normal.get('context_code', '')} {normal.get('review_result', '')}",
                    provenance,
                )
            )
        for curve in _efficiency_curve_summaries(context):
            items.append(
                _knowledge_evidence(
                    _evidence_id(window, offset + len(items) + 1),
                    "efficiency_curves",
                    (
                        f"{curve['equipment_id']} 单位电耗区间 "
                        f"{curve['min_kwh_per_kg']}~{curve['max_kwh_per_kg']} kWh/kg"
                        f"（{curve['min_power_kw']}~{curve['max_power_kw']} kW 负荷区间）"
                    ),
                    provenance,
                    variable=curve["variable"],
                    actual_value=curve["min_kwh_per_kg"],
                    reference_value=curve["max_kwh_per_kg"],
                    unit="kWh/kg",
                )
            )
        affected_ids = {item["id"] for item in _affected_equipment(window)}
        for maintenance in _maintenance_records(context, affected_ids):
            items.append(
                _knowledge_evidence(
                    _evidence_id(window, offset + len(items) + 1),
                    "maintenance_history",
                    (
                        f"维修记录 {maintenance['record_id']}（{maintenance['equipment_id']} "
                        f"{maintenance['work_item']}）：{maintenance['finding']}；"
                        f"建议：{maintenance['recommendation']}"
                    ),
                    provenance,
                    variable=maintenance["equipment_id"],
                    actual_value=maintenance["date"],
                    reference_value=maintenance["recommendation"],
                    unit="",
                )
            )
        return items


def _affected_equipment(window: EventWindow) -> list[dict[str, str]]:
    if window.code in {"C01", "C02", "C06"}:
        if not vocabulary.valid_implicated_equipment_ids(
            window.code, window.implicated_equipment_ids
        ):
            raise vocabulary.VocabularyError(
                f"{window.code} diagnosis requires valid implicated equipment."
            )
        equipment_ids = window.implicated_equipment_ids
        if window.code == "C01":
            equipment_ids = tuple(
                dict.fromkeys((*equipment_ids, "BESS01", "PCC01"))
            )
        equipment = vocabulary.equipment_by_id()
        return [
            {
                "kind": vocabulary.equipment_kind(equipment_id),
                "id": equipment_id,
                "displayName": str(
                    equipment.get(equipment_id, {}).get(
                        "equipment_name", equipment_id
                    )
                ),
            }
            for equipment_id in equipment_ids
        ]
    return [
        {
            "kind": vocabulary.equipment_kind(item["equipmentId"]),
            "id": item["equipmentId"],
            "displayName": item["equipmentName"],
        }
        for item in vocabulary.affected_equipment_by_code()[window.code]
    ]


def _elz_field(equipment_id: str, suffix: str) -> str:
    if equipment_id not in {"ELZ01", "ELZ02", "ELZ03"}:
        raise ValueError(f"Unsupported electrolyzer equipment id: {equipment_id}")
    return f"elz{equipment_id[-1]}_{suffix}"


def _required_c06_reallocation(window: EventWindow) -> C06Reallocation:
    reference = inefficient_allocation_signature(_detection_row(window))
    if reference is None:
        raise vocabulary.VocabularyError(
            "C06 diagnosis requires complete feasible-reallocation evidence."
        )
    implicated = set(window.implicated_equipment_ids)
    if not {
        reference.inefficient_equipment_id,
        reference.alternative_equipment_id,
    }.issubset(implicated):
        raise vocabulary.VocabularyError(
            "C06 diagnosis equipment does not match the feasible reallocation."
        )
    return reference


def _c06_inefficient_plan(
    reference: C06Reallocation,
) -> tuple[dict[str, Any], ...]:
    inefficient = reference.inefficient_equipment_id
    alternative = reference.alternative_equipment_id
    return (
        {
            "kind": "measurement",
            "variable": _elz_field(inefficient, "specific_energy_kwh_per_kg"),
            "reference": reference.alternative_specific_energy,
            "comparator": ">",
            "conclusion": "该设备实测单位电耗高于可行替代设备。",
            "unit": "kWh/kg",
        },
        {
            "kind": "measurement",
            "variable": _elz_field(inefficient, "power_actual_kw"),
            "reference": reference.inefficient_equivalent_power_kw,
            "comparator": ">",
            "conclusion": "该设备当前功率可在不低于最小稳定负荷时下调。",
            "unit": "kW",
        },
        {
            "kind": "measurement",
            "variable": _elz_field(inefficient, "run_state"),
            "reference": 2,
            "comparator": ">=",
            "conclusion": "高单位电耗设备处于稳定运行状态。",
            "unit": "",
        },
        {
            "kind": "measurement",
            "variable": _elz_field(inefficient, "available_flag"),
            "reference": 1,
            "comparator": "=",
            "conclusion": "高单位电耗设备的可用状态已读取。",
            "unit": "",
        },
        {
            "kind": "measurement",
            "variable": _elz_field(inefficient, "actual_available_capacity_kw"),
            "reference": reference.inefficient_equivalent_power_kw,
            "comparator": ">=",
            "conclusion": "高单位电耗设备实际容量覆盖等功率转移后的参考功率。",
            "unit": "kW",
        },
        {
            "kind": "measurement",
            "variable": _elz_field(alternative, "specific_energy_kwh_per_kg"),
            "reference": reference.inefficient_specific_energy,
            "comparator": "<",
            "conclusion": "替代设备实测单位电耗更低。",
            "unit": "kWh/kg",
        },
        {
            "kind": "measurement",
            "variable": _elz_field(alternative, "power_actual_kw"),
            "reference": reference.alternative_equivalent_power_kw,
            "comparator": "<",
            "conclusion": "替代设备当前功率低于等功率转移后的参考功率。",
            "unit": "kW",
        },
        {
            "kind": "measurement",
            "variable": _elz_field(alternative, "run_state"),
            "reference": 2,
            "comparator": ">=",
            "conclusion": "替代设备处于稳定运行状态。",
            "unit": "",
        },
        {
            "kind": "measurement",
            "variable": _elz_field(alternative, "available_flag"),
            "reference": 1,
            "comparator": "=",
            "conclusion": "替代设备被标记为可用。",
            "unit": "",
        },
        {
            "kind": "measurement",
            "variable": _elz_field(alternative, "actual_available_capacity_kw"),
            "reference": reference.alternative_equivalent_power_kw,
            "comparator": ">=",
            "conclusion": "替代设备实际容量覆盖等功率转移后的参考功率。",
            "unit": "kW",
        },
        {
            "kind": "measurement",
            "variable": "ems_total_elz_target_kw",
            "reference": reference.actual_total_kw,
            "comparator": "=",
            "conclusion": "当前三机实际功率之和与EMS总目标一致。",
            "unit": "kW",
        },
    )


def _c06_reallocation_evidence(
    window: EventWindow,
    reference: C06Reallocation,
    provenance: dict[str, Any],
    *,
    offset: int,
) -> list[dict[str, Any]]:
    interval = {
        "startTime": _timestamp(window.start_time),
        "endTime": _timestamp(window.end_time),
    }
    return [
        {
            "schemaVersion": 1,
            "evidenceId": _evidence_id(window, offset + 1),
            "kind": "derived_metric",
            "claimKind": "calculation",
            "interval": interval,
            "variable": "equivalent_reallocation_kw",
            "actualValue": reference.reallocation_kw,
            "referenceValue": reference.target_kw,
            "unit": "kW",
            "comparator": "<=",
            "source": "c06-equivalent-output-v1",
            "conclusion": (
                f"将{reference.reallocation_kw:g} kW从"
                f"{reference.inefficient_equipment_id}转移至"
                f"{reference.alternative_equipment_id}时，总功率目标保持不变。"
            ),
            "provenance": provenance,
        },
        {
            "schemaVersion": 1,
            "evidenceId": _evidence_id(window, offset + 2),
            "kind": "knowledge_base",
            "claimKind": "fact",
            "variable": (
                f"{reference.inefficient_equipment_id}_to_"
                f"{reference.alternative_equipment_id}_curve_specific_energy"
            ),
            "actualValue": reference.inefficient_curve_specific_energy,
            "referenceValue": reference.alternative_curve_specific_energy,
            "unit": "kWh/kg",
            "comparator": ">",
            "source": "h2-efficiency-curves-v1",
            "conclusion": "冻结效率曲线在等功率转移参考点仍显示替代设备单位电耗更低。",
            "provenance": provenance,
        },
    ]


def _canonical_c06_curve_evidence(
    window: EventWindow,
    provenance: dict[str, Any],
    *,
    offset: int,
) -> list[dict[str, Any]]:
    curves = vocabulary.efficiency_curve_by_equipment()
    evidence: list[dict[str, Any]] = []
    for equipment_id in window.implicated_equipment_ids:
        values = [
            float(point["specific_energy_kwh_per_kg"])
            for point in curves[equipment_id]
        ]
        evidence.append(
            _knowledge_evidence(
                _evidence_id(window, offset + len(evidence) + 1),
                "h2-efficiency-curves-v1",
                "冻结效率曲线给出该设备可复核的单位电耗范围。",
                provenance,
                variable=_elz_field(
                    equipment_id,
                    "specific_energy_kwh_per_kg",
                ),
                actual_value=min(values),
                reference_value=max(values),
                unit="kWh/kg",
            )
        )
    return evidence


def _detection_row(window: EventWindow) -> Any:
    return window.rows[
        min(
            range(len(window.rows)),
            key=lambda index: _detection_distance(
                window.rows[index], window.first_detection_time
            ),
        )
    ]


def _evidence_item(
    evidence_id: str,
    kind: str,
    row: Any,
    variable: str,
    reference: str | float,
    comparator: str,
    conclusion: str,
    unit: str,
    provenance: dict[str, Any],
) -> dict[str, Any]:
    assert row.timestamp is not None
    return {
        "schemaVersion": 1,
        "evidenceId": evidence_id,
        "kind": kind,
        "claimKind": "fact",
        "timestamp": _timestamp(row.timestamp),
        "variable": variable,
        "actualValue": row.value(variable),
        "referenceValue": reference,
        "unit": unit,
        "comparator": comparator,
        "source": (
            "fixture-timeseries"
            if provenance["mode"] == "FIXTURE"
            else "imported-timeseries"
        ),
        "conclusion": conclusion,
        "provenance": provenance,
    }


def _impact_evidence(
    evidence_id: str,
    window: EventWindow,
    variable: str,
    value: float,
    source: str,
    conclusion: str,
    provenance: dict[str, Any],
) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "evidenceId": evidence_id,
        "kind": "derived_metric",
        "claimKind": "calculation",
        "interval": {
            "startTime": _timestamp(window.start_time),
            "endTime": _timestamp(window.end_time),
        },
        "variable": variable,
        "actualValue": value,
        "referenceValue": 0,
        "unit": "kWh",
        "comparator": ">",
        "source": source,
        "conclusion": conclusion,
        "provenance": provenance,
    }


def _efficiency_curve_summaries(
    context: EvidenceContext,
) -> tuple[dict[str, str], ...]:
    """Aggregate `10_electrolyzer_efficiency_curves.csv` per electrolyzer.

    Each summary carries the official per-unit specific-energy field as the
    variable name, so the curve evidence reuses official measurement points
    instead of inventing new ones.
    """
    summaries: list[dict[str, str]] = []
    for equipment_id in ("ELZ01", "ELZ02", "ELZ03"):
        points = [
            curve
            for curve in context.efficiency_curves()
            if curve.get("equipment_id") == equipment_id
        ]
        if not points:
            continue
        values = [float(point["specific_energy_kwh_per_kg"]) for point in points]
        powers = [float(point["power_kw"]) for point in points]
        summaries.append(
            {
                "equipment_id": equipment_id,
                "variable": f"elz{equipment_id[-1]}_specific_energy_kwh_per_kg",
                "min_kwh_per_kg": _format_float(min(values)),
                "max_kwh_per_kg": _format_float(max(values)),
                "min_power_kw": _format_float(min(powers)),
                "max_power_kw": _format_float(max(powers)),
            }
        )
    return tuple(summaries)


def _maintenance_records(
    context: EvidenceContext,
    affected_ids: set[str],
) -> tuple[dict[str, str], ...]:
    """Pick `14_maintenance_history.csv` records relevant to the event.

    Records whose equipment matches the affected equipment come first so the
    most relevant history is citable; the count stays bounded for any event.
    """
    records = list(context.maintenance_history())
    records.sort(
        key=lambda row: (row.get("equipment_id") not in affected_ids, row.get("record_id", ""))
    )
    return tuple(records[:3])


def _format_float(value: float) -> str:
    return f"{value:g}"


def _knowledge_evidence(
    evidence_id: str,
    source: str,
    conclusion: str,
    provenance: dict[str, Any],
    *,
    variable: str = "",
    actual_value: str | float | bool = "",
    reference_value: str | float | bool = "",
    unit: str = "",
) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "evidenceId": evidence_id,
        "kind": "knowledge_base",
        "claimKind": "fact",
        "variable": variable,
        "actualValue": actual_value,
        "referenceValue": reference_value,
        "unit": unit,
        "comparator": "=",
        "source": source,
        "conclusion": conclusion,
        "provenance": provenance,
    }


def _reference_for(window: EventWindow, item: dict[str, Any]) -> str | float:
    if (
        window.code == "C03"
        and item["variable"] == "bess_power_cmd_kw"
        and item["reference"] == "requested direction"
    ):
        command = window.rows[0].value("bess_power_cmd_kw")
        return "charge" if (command or 0) < 0 else "discharge"
    if window.code == "C04" and item["variable"] == "pcc_power_actual_kw":
        limit = window.rows[0].value(
            "grid_export_power_limit_kw"
            if window.subtype == "EXPORT_POWER_LIMIT_NOT_TRACKED"
            else "grid_import_power_limit_kw"
        )
        return -(limit or 0) if window.subtype.startswith("IMPORT") else (limit or 0)
    return item["reference"]


def _timestamp(value: datetime) -> str:
    return value.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def _detection_distance(row: Any, first_detection_time: datetime) -> float:
    if row.timestamp is None:
        raise ValueError("Event rows require valid timestamps.")
    return abs((row.timestamp - first_detection_time).total_seconds())


def _evidence_id(window: EventWindow, index: int) -> str:
    identity = window.code if window.event_id.endswith("-001") else window.event_id
    return f"{identity}-EV-{index:03d}"
