"""根因数据驱动归因（P1-8 / T12 / 任务卡 A-7）。

把根因从 `_METADATA` 硬编码模板升级为可回溯的数据驱动文本：事件开始前
`[start−60, start−5]` 分钟窗口内的官方操作日志按五组既定模式映射到异常类别
（符号映射→C03、死区→C01、SOC 计划→C07、配额→C05、限值→C04），输出
表述 + IF-2 形状条目引用；无支撑时明确写"证据不足"，不编造归因。

先验窗口与支撑分口径只用公开 TRAIN 推导（见 diagnosis/ROOT_CAUSE.md）：
TRAIN 50/50 条日志均落在其后同类事件开始前 5-60 分钟，故窗口取
[−60, −5] 分钟、支撑分随间隔线性衰减。VALIDATION 仅作验收。
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from h2_analytics.evidence import EvidenceContext

# 先验窗口（分钟）：TRAIN 推导（全部日志先验 5-60 分钟），VALIDATION 验收通过。
ATTRIBUTION_LOOKBACK_MINUTES = 60.0
# 事件开始前剔除带（分钟）：排除与事件起点几乎同时的日志噪声。
ATTRIBUTION_EXCLUSION_MINUTES = 5.0

# 五组操作日志模式 → 异常类别（官方 12_operation_log.csv 的 operation_type+parameter）。
OPERATION_LOG_PATTERNS: dict[str, dict[str, str]] = {
    "C03": {
        "operation_type": "接口映射变更",
        "parameter": "bess_power_sign",
        "mechanism": "储能接口符号/映射变更",
    },
    "C01": {
        "operation_type": "参数变更",
        "parameter": "setpoint_deadband_kw",
        "mechanism": "控制死区参数变更",
    },
    "C07": {
        "operation_type": "SOC计划变更",
        "parameter": "soc_target_pct",
        "mechanism": "SOC 计划未滚动重算",
    },
    "C05": {
        "operation_type": "电量配额更新",
        "parameter": "上下网日电量配额",
        "mechanism": "上下网日电量配额调整",
    },
    "C04": {
        "operation_type": "调度约束更新",
        "parameter": "PCC功率限值",
        "mechanism": "PCC 功率限值更新",
    },
}


@dataclass(frozen=True, slots=True)
class RootCauseAttribution:
    """归因结果：数据驱动表述（或"证据不足"回退）+ IF-2 条目引用。"""

    statement: str
    citations: tuple[dict[str, Any], ...]
    cited: bool


def operation_log_ref_id(timestamp_text: str, parameter: str) -> str:
    """操作日志官方文件无 id 列，用 (timestamp, parameter) 合成确定性引用键。

    官方 77 行数据上 (split, timestamp, parameter) 三元组 77/77 唯一，时间戳+
    参数即可回溯唯一条目（见 ROOT_CAUSE.md 与 change-requests.md [A3] 澄清）。
    """
    compact = (
        timestamp_text.strip()
        .replace("-", "")
        .replace(":", "")
        .replace(" ", "")
        .replace("T", "")
    )
    return f"OP-{compact}-{parameter}"


def support_score(lead_minutes: float) -> float:
    """支撑分：随日志先验间隔在 [5, 60] 分钟内线性衰减到 [0.92, 0.0]。"""
    return round(max(0.0, 1.0 - lead_minutes / ATTRIBUTION_LOOKBACK_MINUTES), 2)


def attribute_root_cause(
    *,
    code: str,
    window_start: datetime,
    template: str,
    context: EvidenceContext,
) -> RootCauseAttribution:
    """对单个事件做操作日志模式归因；无映射类别或无支撑日志时回退"证据不足"。"""
    pattern = OPERATION_LOG_PATTERNS.get(code)
    candidates: tuple[dict[str, str], ...] = ()
    if pattern is not None and context.data_dir is not None:
        rows = context.operation_logs(
            start=window_start - timedelta(minutes=ATTRIBUTION_LOOKBACK_MINUTES),
            end=window_start - timedelta(minutes=ATTRIBUTION_EXCLUSION_MINUTES),
        )
        candidates = tuple(
            row
            for row in rows
            if row.get("operation_type") == pattern["operation_type"]
            and row.get("parameter") == pattern["parameter"]
        )
    if pattern is None:
        fallback = (
            f"证据不足：{code} 类异常无操作日志归因映射，且事件前"
            f" {ATTRIBUTION_LOOKBACK_MINUTES:.0f} 分钟窗口内无可回溯日志条目；"
            f"以下为规则推断——{template}"
        )
        return RootCauseAttribution(fallback, (), False)
    if not candidates:
        fallback = (
            f"证据不足：事件开始前 {ATTRIBUTION_LOOKBACK_MINUTES:.0f} 分钟窗口内"
            f"未发现与 {code} 类映射（{pattern['mechanism']}）相符的操作日志条目；"
            f"以下为规则推断——{template}"
        )
        return RootCauseAttribution(fallback, (), False)

    # 多条候选时取最接近事件开始（最新）的一条，保证确定性。
    log = max(
        candidates,
        key=lambda row: row.get("timestamp", ""),
    )
    timestamp_text = log.get("timestamp", "")
    lead_minutes = max(
        (window_start - _parse(timestamp_text)).total_seconds() / 60.0,
        0.0,
    )
    score = support_score(lead_minutes)
    ref_id = operation_log_ref_id(timestamp_text, log.get("parameter", ""))
    statement = (
        f"数据驱动归因：事件开始前 {lead_minutes:.0f} 分钟的操作日志"
        f"（{timestamp_text}，{log.get('operator_role', '')}执行"
        f"「{log.get('operation_type', '')}」，参数 {log.get('parameter', '')}"
        f" 变更为「{log.get('change', '')}」，备注「{log.get('remark', '')}」）"
        f"与 {code} 类异常的既定映射（{pattern['mechanism']}）相符；"
        f"引用 {ref_id} 可回溯原始条目，支撑分 {score:.2f}。"
    )
    citation = {
        "source": "operation_log",
        "ref_id": ref_id,
        "timestamp": timestamp_text,
        "parameter": log.get("parameter", ""),
        "change": log.get("change", ""),
        "support_score": score,
    }
    return RootCauseAttribution(statement, (citation,), True)


def _parse(timestamp_text: str) -> datetime:
    """与 EvidenceContext._parse_iso 相同口径：naive 视为 UTC，失败返回零点。"""
    try:
        parsed = datetime.fromisoformat(timestamp_text.strip().replace("Z", "+00:00"))
    except ValueError:
        return datetime.min.replace(tzinfo=timezone.utc)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed
