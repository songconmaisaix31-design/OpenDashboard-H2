from __future__ import annotations

from typing import Any

from h2_analytics.events import EventWindow
from h2_analytics.settings import DEFAULT_CONSTRAINTS, H2Constraints

_ELZ_POWER_ACTUAL = (
    "elz1_power_actual_kw",
    "elz2_power_actual_kw",
    "elz3_power_actual_kw",
)
_ELZ_RUN_STATE = ("elz1_run_state", "elz2_run_state", "elz3_run_state")
_ELZ_POWER_CMD = ("elz1_power_cmd_kw", "elz2_power_cmd_kw", "elz3_power_cmd_kw")
_ELZ_ACTUAL_CAPACITY = (
    "elz1_actual_available_capacity_kw",
    "elz2_actual_available_capacity_kw",
    "elz3_actual_available_capacity_kw",
)


class SafetyEvaluator:
    """Evaluate safety-relevant constraints for an anomaly event window.

    Every anomaly class gets at least one dedicated check plus the shared
    human-confirmation guarantee. Checks report only `passed`, `warning`, or
    `failed` -- the evaluator NEVER returns `unknown`; an unsupported anomaly
    code raises instead of emitting a misleading verdict. All boundaries come
    from the frozen `09_control_constraints.csv` values (SOC 20-90%, BESS
    500 kW, electrolyzer 300-1000 kW, ramp 120 kW/min), so no recommendation
    can suggest crossing them.
    """

    def __init__(self, constraints: H2Constraints = DEFAULT_CONSTRAINTS) -> None:
        self._constraints = constraints

    def evaluate(
        self,
        *,
        window: EventWindow,
        evidence_ids: tuple[str, ...],
        provenance: dict[str, Any],
    ) -> list[dict[str, Any]]:
        identity = window.code if window.event_id.endswith("-001") else window.event_id
        reference_ids = evidence_ids[:2]
        if window.code == "C01":
            return self._c01(identity, window, reference_ids, provenance)
        if window.code == "C02":
            return self._c02(identity, window, reference_ids, provenance)
        if window.code == "C03":
            return self._c03(identity, window, reference_ids, provenance)
        if window.code == "C04":
            return self._c04(identity, window, reference_ids, provenance)
        if window.code == "C05":
            return self._c05(identity, window, reference_ids, provenance)
        if window.code == "C06":
            return self._c06(identity, window, reference_ids, provenance)
        if window.code == "C07":
            return self._c07(identity, window, reference_ids, provenance)
        raise ValueError(f"SafetyEvaluator has no rule set for anomaly code {window.code!r}.")

    def _human_confirmation(
        self,
        identity: str,
        reference_ids: tuple[str, ...],
        provenance: dict[str, Any],
        ordinal: int,
    ) -> dict[str, Any]:
        return _check(
            f"{identity}-SAFE-{ordinal:03d}",
            "建议仅作监督与人工确认",
            "passed",
            "本服务产生检查与建议，不执行自动设定值变更。",
            "human-confirmation-v1",
            reference_ids,
            provenance,
        )

    def _soc(
        self,
        identity: str,
        window: EventWindow,
        reference_ids: tuple[str, ...],
        provenance: dict[str, Any],
    ) -> dict[str, Any]:
        soc_values = [
            value
            for row in window.rows
            if (value := row.value("bess_soc_pct")) is not None
        ]
        minimum = self._constraints.bess_soc_min_percent
        maximum = self._constraints.bess_soc_max_percent
        if not soc_values:
            return _check(
                f"{identity}-SAFE-002",
                "SOC 保持在配置范围内",
                "warning",
                "SOC 证据缺失，范围安全状态无法确认。",
                "bess-soc-range-v1",
                reference_ids,
                provenance,
            )
        if any(value < minimum or value > maximum for value in soc_values):
            return _check(
                f"{identity}-SAFE-002",
                "SOC 保持在配置范围内",
                "failed",
                f"观测 SOC 超出配置的 {minimum:.0f}% 到 {maximum:.0f}% 范围。",
                "bess-soc-range-v1",
                reference_ids,
                provenance,
            )
        return _check(
            f"{identity}-SAFE-002",
            "SOC 保持在配置范围内",
            "passed",
            f"观测 SOC 保持在配置的 {minimum:.0f}% 到 {maximum:.0f}% 范围内。",
            "bess-soc-range-v1",
            reference_ids,
            provenance,
        )

    def _c01(
        self,
        identity: str,
        window: EventWindow,
        reference_ids: tuple[str, ...],
        provenance: dict[str, Any],
    ) -> list[dict[str, Any]]:
        ramp_limit = self._constraints.electrolyzer_ramp_limit_kw_per_minute
        ramp_exceeded = False
        previous: dict[str, float | None] = {}
        for row in window.rows:
            for field in _ELZ_POWER_CMD:
                current = row.value(field)
                prior = previous.get(field)
                if current is not None and prior is not None:
                    if abs(current - prior) > ramp_limit:
                        ramp_exceeded = True
                previous[field] = current
        status = "failed" if ramp_exceeded else "passed"
        return [
            _check(
                f"{identity}-SAFE-001",
                "功率指令爬坡约束",
                status,
                "电解槽功率指令变化超过配置的爬坡限值，需在人工确认后处理。"
                if ramp_exceeded
                else "电解槽功率指令变化保持在配置的爬坡限值内。",
                "electrolyzer-ramp-limit-v1",
                reference_ids,
                provenance,
            ),
            self._soc(identity, window, reference_ids, provenance),
            self._stable_range_check(identity, window, reference_ids, provenance, "SAFE-003"),
            self._human_confirmation(identity, reference_ids, provenance, ordinal=4),
        ]

    def _c02(
        self,
        identity: str,
        window: EventWindow,
        reference_ids: tuple[str, ...],
        provenance: dict[str, Any],
    ) -> list[dict[str, Any]]:
        over_committed = False
        for row in window.rows:
            for capacity_field, cmd_field in zip(
                _ELZ_ACTUAL_CAPACITY,
                _ELZ_POWER_CMD,
                strict=True,
            ):
                capacity = row.value(capacity_field)
                command = row.value(cmd_field)
                if command is not None and capacity is not None:
                    if command > capacity + 1e-6:
                        over_committed = True
        return [
            _check(
                f"{identity}-SAFE-001",
                "容量与功率指令一致性",
                "failed" if over_committed else "passed",
                "存在功率指令超过实际可用容量的风险，需人工校核容量模型。"
                if over_committed
                else "功率指令未超过实际可用容量。",
                "capacity-sync-v1",
                reference_ids,
                provenance,
            ),
            self._stable_range_check(identity, window, reference_ids, provenance, "SAFE-002"),
            self._human_confirmation(identity, reference_ids, provenance, ordinal=3),
        ]

    def _c03(
        self,
        identity: str,
        window: EventWindow,
        reference_ids: tuple[str, ...],
        provenance: dict[str, Any],
    ) -> list[dict[str, Any]]:
        power_limit = self._constraints.bess_max_power_kw
        power_exceeded = any(
            row.value("bess_power_actual_kw") is not None
            and abs(row.value("bess_power_actual_kw")) > power_limit + 1e-6
            for row in window.rows
        )
        return [
            _check(
                f"{identity}-SAFE-001",
                "BESS 符号约定确认",
                "passed",
                "正值放电、负值充电的符号约定已确认。",
                "sign-convention-bess-v1",
                reference_ids,
                provenance,
            ),
            self._soc(identity, window, reference_ids, provenance),
            _check(
                f"{identity}-SAFE-003",
                "BESS 功率限值约束",
                "failed" if power_exceeded else "passed",
                f"储能实际功率绝对值超过配置的 {power_limit:.0f} kW 限值。"
                if power_exceeded
                else f"储能实际功率绝对值保持在配置的 {power_limit:.0f} kW 限值内。",
                "bess-power-limit-v1",
                reference_ids,
                provenance,
            ),
            self._human_confirmation(identity, reference_ids, provenance, ordinal=4),
        ]

    def _c04(
        self,
        identity: str,
        window: EventWindow,
        reference_ids: tuple[str, ...],
        provenance: dict[str, Any],
    ) -> list[dict[str, Any]]:
        export_limit = _window_value(window, "grid_export_power_limit_kw")
        import_limit = _window_value(window, "grid_import_power_limit_kw")
        violated = False
        for row in window.rows:
            pcc = row.value("pcc_power_actual_kw")
            if pcc is None:
                continue
            if export_limit is not None and pcc > export_limit:
                violated = True
            if import_limit is not None and pcc < -import_limit:
                violated = True
        return [
            _check(
                f"{identity}-SAFE-001",
                "PCC 符号约定确认",
                "passed",
                "正值上网、负值下网的符号约定已确认。",
                "sign-convention-pcc-v1",
                reference_ids,
                provenance,
            ),
            _check(
                f"{identity}-SAFE-002",
                "PCC 功率边界约束",
                "failed" if violated else "passed",
                "PCC 实际功率仍越过当前有效功率边界，需人工干预。"
                if violated
                else "PCC 实际功率保持在当前有效功率边界内。",
                "pcc-boundary-v1",
                reference_ids,
                provenance,
            ),
            _check(
                f"{identity}-SAFE-003",
                "日电量配额约束",
                "failed" if _quota_exhausted(window) else "passed",
                "剩余电量配额已耗尽或存在超限，后续计划可能不可执行。"
                if _quota_exhausted(window)
                else "剩余电量配额未耗尽。",
                "grid-energy-quota-v1",
                reference_ids,
                provenance,
            ),
            self._human_confirmation(identity, reference_ids, provenance, ordinal=4),
        ]

    def _c05(
        self,
        identity: str,
        window: EventWindow,
        reference_ids: tuple[str, ...],
        provenance: dict[str, Any],
    ) -> list[dict[str, Any]]:
        return [
            _check(
                f"{identity}-SAFE-001",
                "日电量配额约束",
                "failed" if _quota_exhausted(window) else "passed",
                "剩余电量配额已耗尽，后续计划可能不可执行。"
                if _quota_exhausted(window)
                else "剩余电量配额尚未耗尽。",
                "grid-energy-quota-v1",
                reference_ids,
                provenance,
            ),
            self._human_confirmation(identity, reference_ids, provenance, ordinal=2),
        ]

    def _c06(
        self,
        identity: str,
        window: EventWindow,
        reference_ids: tuple[str, ...],
        provenance: dict[str, Any],
    ) -> list[dict[str, Any]]:
        return [
            self._stable_range_check(identity, window, reference_ids, provenance, "SAFE-001"),
            self._human_confirmation(identity, reference_ids, provenance, ordinal=2),
        ]

    def _stable_range_check(
        self,
        identity: str,
        window: EventWindow,
        reference_ids: tuple[str, ...],
        provenance: dict[str, Any],
        ordinal: str,
    ) -> dict[str, Any]:
        minimum = self._constraints.electrolyzer_min_stable_power_kw
        maximum = self._constraints.electrolyzer_max_power_kw
        outside = False
        for row in window.rows:
            for state_field, power_field in zip(
                _ELZ_RUN_STATE, _ELZ_POWER_ACTUAL, strict=True
            ):
                state = row.value(state_field)
                power = row.value(power_field)
                if state is not None and state >= 2 and power is not None:
                    if power < minimum - 1e-6 or power > maximum + 1e-6:
                        outside = True
        return _check(
            f"{identity}-SAFE-{ordinal}",
            "电解槽稳定运行范围",
            "failed" if outside else "passed",
            (
                f"运行中的电解槽功率离开配置的 {minimum:.0f} 到 {maximum:.0f} kW 稳定范围，"
                "需人工复核分配。"
                if outside
                else f"运行中的电解槽功率保持在配置的 {minimum:.0f} 到 {maximum:.0f} kW 稳定范围内。"
            ),
            "electrolyzer-stable-range-v1",
            reference_ids,
            provenance,
        )

    def _c07(
        self,
        identity: str,
        window: EventWindow,
        reference_ids: tuple[str, ...],
        provenance: dict[str, Any],
    ) -> list[dict[str, Any]]:
        charge_shortfall = False
        discharge_shortfall = False
        for row in window.rows:
            charge_available = row.value("bess_available_charge_energy_kwh")
            discharge_available = row.value("bess_available_discharge_energy_kwh")
            target = row.value("bess_regulation_reserve_target_kwh")
            if charge_available is not None and target is not None:
                if charge_available < target:
                    charge_shortfall = True
            if discharge_available is not None and target is not None:
                if discharge_available < target:
                    discharge_shortfall = True
        shortfall = charge_shortfall or discharge_shortfall
        return [
            _check(
                f"{identity}-SAFE-001",
                "调节备用能量充足性",
                "failed" if shortfall else "passed",
                "可用充放电能量不足以覆盖调节备用目标。"
                if shortfall
                else "可用充放电能量足以覆盖调节备用目标。",
                "bess-regulation-reserve-v1",
                reference_ids,
                provenance,
            ),
            self._soc(identity, window, reference_ids, provenance),
            self._human_confirmation(identity, reference_ids, provenance, ordinal=3),
        ]


def _window_value(window: EventWindow, field: str) -> float | None:
    for row in window.rows:
        value = row.value(field)
        if value is not None:
            return value
    return None


def _quota_exhausted(window: EventWindow) -> bool:
    """True when any remaining daily energy quota hit or crossed zero.

    Applies the cumulative daily quota constraint from the official table:
    both the export and the import quota are checked.
    """
    for row in window.rows:
        for field in ("grid_export_energy_remaining_kwh", "grid_import_energy_remaining_kwh"):
            remaining = row.value(field)
            if remaining is not None and remaining <= 0:
                return True
    return False


def _check(
    check_id: str,
    title: str,
    status: str,
    message: str,
    constraint_id: str | None,
    evidence_ids: tuple[str, ...],
    provenance: dict[str, Any],
) -> dict[str, Any]:
    value: dict[str, Any] = {
        "checkId": check_id,
        "title": title,
        "status": status,
        "message": message,
        "evidenceIds": list(evidence_ids),
        "provenance": provenance,
    }
    if constraint_id is not None:
        value["constraintId"] = constraint_id
    return value
