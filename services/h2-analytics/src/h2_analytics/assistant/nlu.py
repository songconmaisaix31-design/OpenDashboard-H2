from __future__ import annotations

import re
import unicodedata
from datetime import datetime
from typing import Any

from h2_analytics.contracts import ASSISTANT_PROMPTS, ASSISTANT_QUESTION_IDS

MAX_NLU_INPUT_CHARS = 500
_EVENT_ID = re.compile(r"\bC0[1-7]-[A-Za-z0-9_-]+\b", re.IGNORECASE)
_ISO_INSTANT = re.compile(
    r"\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?",
    re.IGNORECASE,
)
_CONTROL_INTENT = re.compile(
    r"(?:替我|帮我|立即|直接|自动).{0,12}(?:下发|控制|启停|调节|修改设定|切换模式|开机|关机)"
)

_INTENT_TERMS: dict[str, tuple[tuple[str, ...], ...]] = {
    "Q01": (("pcc",), ("正负", "正值", "负值", "符号", "送电", "受电", "方向")),
    "Q02": (("pcc",), ("功率越限", "动态边界", "c04"), ("电量配额", "累计电量", "c05"), ("区别", "区分", "不同")),
    "Q03": (("储能", "bess"), ("方向异常", "指令与实际", "反向", "功率方向"), ("pcc", "并网")),
    "Q04": (("soc",), ("备用", "余量", "调节能力", "不足")),
    "Q05": (("降额", "容量变化", "可用容量"), ("ems",), ("同步", "定位", "旧容量", "容量模型")),
    "Q06": (("云团", "天气", "光伏波动"), ("指令振荡", "控制振荡", "反复反转"), ("区分", "区别", "判断")),
    "Q07": (("电解槽",), ("多台", "逐台", "机组"), ("负荷分配", "功率分配", "效率", "能耗")),
    "Q08": (("建议", "处置"), ("人工确认", "人工复核", "必须确认", "哪些")),
    "Q09": (("生成", "导出", "制作"), ("异常诊断报告", "诊断报告", "单事件报告")),
    "Q10": (("pcc",), ("合规日报", "日报", "日合规"), ("包含", "内容", "字段", "生成")),
}


def resolve_intent(text: str) -> dict[str, Any]:
    normalized = unicodedata.normalize("NFKC", text).strip().casefold()
    if len(normalized) > MAX_NLU_INPUT_CHARS:
        return _refusal("input_too_long", 0.0)
    if not normalized:
        return _refusal("low_confidence", 0.0)
    if _CONTROL_INTENT.search(normalized):
        return _refusal("unsupported_intent", 1.0)

    direct_id = re.fullmatch(r"q(0[1-9]|10)", normalized, re.IGNORECASE)
    if direct_id:
        return _match(f"Q{direct_id.group(1)}", 1.0, normalized)
    for question_id, prompt in ASSISTANT_PROMPTS.items():
        if _compact(normalized) == _compact(prompt):
            return _match(question_id, 1.0, normalized)

    scores = {
        question_id: sum(
            1 for alternatives in groups if any(term in normalized for term in alternatives)
        )
        for question_id, groups in _INTENT_TERMS.items()
    }
    highest = max(scores.values())
    if highest == 0:
        return _refusal("unsupported_intent", 0.0)
    leaders = [question_id for question_id, score in scores.items() if score == highest]
    if len(leaders) != 1:
        return _refusal("ambiguous_intent", min(0.5, highest / 4))
    question_id = leaders[0]
    required_groups = len(_INTENT_TERMS[question_id])
    confidence = round(min(0.99, highest / required_groups), 2)
    if confidence < 0.66:
        return _refusal("low_confidence", confidence)
    return _match(question_id, confidence, normalized)


def _match(question_id: str, confidence: float, text: str) -> dict[str, Any]:
    result: dict[str, Any] = {
        "schemaVersion": 1,
        "status": "matched",
        "questionId": question_id,
        "confidence": confidence,
    }
    event = _EVENT_ID.search(text)
    if event is not None:
        result["eventId"] = event.group(0).upper()
    instants = _ISO_INSTANT.findall(text)
    if len(instants) == 2 and _ordered_instants(instants):
        result["timeRange"] = {"startTime": instants[0], "endTime": instants[1]}
    return result


def _refusal(reason: str, confidence: float) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "status": "refused",
        "reason": reason,
        "confidence": confidence,
        "allowedQuestionIds": list(ASSISTANT_QUESTION_IDS),
    }


def _compact(value: str) -> str:
    return re.sub(r"[\s，。！？?、：:；;]", "", value)


def _ordered_instants(values: list[str]) -> bool:
    try:
        parsed = [
            datetime.fromisoformat(re.sub(r"z$", "+00:00", value, flags=re.IGNORECASE))
            for value in values
        ]
    except (TypeError, ValueError):
        return False
    return parsed[0] <= parsed[1]
