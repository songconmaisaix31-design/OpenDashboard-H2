from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from h2_analytics import vocabulary
from h2_analytics.models import DataRow
from h2_analytics.settings import DEFAULT_CONSTRAINTS, H2Constraints

_ELZ_IDS = ("1", "2", "3")
_ELZ_EQUIPMENT = ("ELZ01", "ELZ02", "ELZ03")


def _threshold(name: str) -> float:
    value = vocabulary.detection_thresholds()["classes"]["C06"][name]
    if not isinstance(value, (int, float)):
        raise vocabulary.VocabularyError(
            f"Detection threshold C06.{name} must be numeric."
        )
    return float(value)


_TRACKING_TOLERANCE_KW = _threshold("allocationTrackingToleranceKw")
_TARGET_BALANCE_TOLERANCE_KW = _threshold("targetBalanceToleranceKw")
_ELZ2_TARGET_SHARE = _threshold("elz2TargetShare")
_ELZ3_TARGET_SHARE = _threshold("elz3TargetShare")
_SPECIFIC_ADVANTAGE = _threshold("specificEnergyAdvantageKwhPerKg")
_MINIMUM_REALLOCATION_KW = _threshold("minimumEquivalentReallocationKw")
_REFERENCE_REALLOCATION_KW = _threshold("equivalentReallocationReferenceKw")


@dataclass(frozen=True, slots=True)
class C06Reallocation:
    inefficient_equipment_id: str
    alternative_equipment_id: str
    target_kw: float
    actual_total_kw: float
    reallocation_kw: float
    inefficient_power_kw: float
    alternative_power_kw: float
    inefficient_equivalent_power_kw: float
    alternative_equivalent_power_kw: float
    inefficient_specific_energy: float
    alternative_specific_energy: float
    inefficient_curve_specific_energy: float
    alternative_curve_specific_energy: float
    inefficient_run_state: float
    alternative_run_state: float
    inefficient_available_flag: float
    alternative_available_flag: float
    inefficient_actual_capacity_kw: float
    alternative_actual_capacity_kw: float


def inefficient_allocation_signature(
    row: DataRow,
    constraints: H2Constraints = DEFAULT_CONSTRAINTS,
) -> C06Reallocation | None:
    """Return a feasible equivalent-output reference for the frozen TRAIN marker.

    The marker identifies the public-v4.0 allocation pattern. A row qualifies
    only when a bounded power transfer preserves the EMS target, respects both
    units' actual capacity and stable-run state, and remains more efficient on
    the frozen per-unit curves.
    """
    target = row.value("ems_total_elz_target_kw")
    commands = [row.value(f"elz{index}_power_cmd_kw") for index in _ELZ_IDS]
    powers = [row.value(f"elz{index}_power_actual_kw") for index in _ELZ_IDS]
    capacities = [
        row.value(f"elz{index}_actual_available_capacity_kw")
        for index in _ELZ_IDS
    ]
    available = [row.value(f"elz{index}_available_flag") for index in _ELZ_IDS]
    states = [row.value(f"elz{index}_run_state") for index in _ELZ_IDS]
    specifics = [
        row.value(f"elz{index}_specific_energy_kwh_per_kg")
        for index in _ELZ_IDS
    ]
    values = (
        target,
        *commands,
        *powers,
        *capacities,
        *available,
        *states,
        *specifics,
    )
    if any(value is None for value in values):
        return None
    assert target is not None
    numeric_commands = [value for value in commands if value is not None]
    numeric_powers = [value for value in powers if value is not None]
    numeric_capacities = [value for value in capacities if value is not None]
    numeric_available = [value for value in available if value is not None]
    numeric_states = [value for value in states if value is not None]
    numeric_specifics = [value for value in specifics if value is not None]
    if target <= 0 or any(flag != 1 for flag in numeric_available):
        return None
    if any(
        abs(command - power) > _TRACKING_TOLERANCE_KW
        for command, power in zip(
            numeric_commands, numeric_powers, strict=True
        )
    ):
        return None
    actual_total = sum(numeric_powers)
    if abs(actual_total - target) > _TARGET_BALANCE_TOLERANCE_KW:
        return None
    if (
        abs(numeric_powers[1] - _ELZ2_TARGET_SHARE * target)
        > _TRACKING_TOLERANCE_KW
    ):
        return None
    expected_elz3_power = min(
        _ELZ3_TARGET_SHARE * target,
        numeric_capacities[2],
    )
    if (
        abs(numeric_powers[2] - expected_elz3_power)
        > _TRACKING_TOLERANCE_KW
    ):
        return None

    curves = vocabulary.efficiency_curve_by_equipment()
    options: list[tuple[tuple[float, float, float, int, int], C06Reallocation]] = []
    for inefficient_index, inefficient_equipment in enumerate(_ELZ_EQUIPMENT):
        for alternative_index, alternative_equipment in enumerate(_ELZ_EQUIPMENT):
            if inefficient_index == alternative_index:
                continue
            inefficient_specific = numeric_specifics[inefficient_index]
            alternative_specific = numeric_specifics[alternative_index]
            if (
                numeric_states[inefficient_index] < 2
                or numeric_states[alternative_index] < 2
                or inefficient_specific <= 0
                or alternative_specific <= 0
                or inefficient_specific - alternative_specific
                < _SPECIFIC_ADVANTAGE
            ):
                continue
            inefficient_capacity = numeric_capacities[inefficient_index]
            alternative_capacity = numeric_capacities[alternative_index]
            inefficient_power = numeric_powers[inefficient_index]
            alternative_power = numeric_powers[alternative_index]
            if not (
                _within_stable_capacity(
                    inefficient_power,
                    inefficient_capacity,
                    constraints,
                )
                and _within_stable_capacity(
                    alternative_power,
                    alternative_capacity,
                    constraints,
                )
            ):
                continue
            alternative_power_limit = min(
                alternative_capacity,
                constraints.electrolyzer_max_power_kw,
            )
            transferable_kw = min(
                inefficient_power - constraints.electrolyzer_min_stable_power_kw,
                alternative_power_limit - alternative_power,
            )
            if transferable_kw < _MINIMUM_REALLOCATION_KW:
                continue
            reallocation_kw = min(
                transferable_kw,
                _REFERENCE_REALLOCATION_KW,
            )
            inefficient_equivalent_power = (
                inefficient_power - reallocation_kw
            )
            alternative_equivalent_power = (
                alternative_power + reallocation_kw
            )
            if not (
                _within_stable_capacity(
                    inefficient_equivalent_power,
                    inefficient_capacity,
                    constraints,
                )
                and _within_stable_capacity(
                    alternative_equivalent_power,
                    alternative_capacity,
                    constraints,
                )
            ):
                continue
            inefficient_curve_specific = _interpolate_specific_energy(
                curves[inefficient_equipment],
                inefficient_equivalent_power,
            )
            alternative_curve_specific = _interpolate_specific_energy(
                curves[alternative_equipment],
                alternative_equivalent_power,
            )
            curve_advantage = (
                inefficient_curve_specific - alternative_curve_specific
            )
            if curve_advantage < _SPECIFIC_ADVANTAGE:
                continue
            result = C06Reallocation(
                inefficient_equipment_id=inefficient_equipment,
                alternative_equipment_id=alternative_equipment,
                target_kw=target,
                actual_total_kw=actual_total,
                reallocation_kw=reallocation_kw,
                inefficient_power_kw=inefficient_power,
                alternative_power_kw=alternative_power,
                inefficient_equivalent_power_kw=inefficient_equivalent_power,
                alternative_equivalent_power_kw=alternative_equivalent_power,
                inefficient_specific_energy=inefficient_specific,
                alternative_specific_energy=alternative_specific,
                inefficient_curve_specific_energy=inefficient_curve_specific,
                alternative_curve_specific_energy=alternative_curve_specific,
                inefficient_run_state=numeric_states[inefficient_index],
                alternative_run_state=numeric_states[alternative_index],
                inefficient_available_flag=numeric_available[inefficient_index],
                alternative_available_flag=numeric_available[alternative_index],
                inefficient_actual_capacity_kw=inefficient_capacity,
                alternative_actual_capacity_kw=alternative_capacity,
            )
            key = (
                inefficient_specific - alternative_specific,
                curve_advantage,
                reallocation_kw,
                -inefficient_index,
                -alternative_index,
            )
            options.append((key, result))
    if not options:
        return None
    return max(options, key=lambda item: item[0])[1]


def _within_stable_capacity(
    power_kw: float,
    actual_capacity_kw: float,
    constraints: H2Constraints,
) -> bool:
    maximum_kw = min(
        actual_capacity_kw,
        constraints.electrolyzer_max_power_kw,
    )
    return constraints.electrolyzer_min_stable_power_kw <= power_kw <= maximum_kw


def _interpolate_specific_energy(
    points: tuple[dict[str, Any], ...],
    power_kw: float,
) -> float:
    ordered = sorted(
        (
            (float(point["power_kw"]), float(point["specific_energy_kwh_per_kg"]))
            for point in points
        ),
        key=lambda point: point[0],
    )
    if power_kw <= ordered[0][0]:
        return ordered[0][1]
    if power_kw >= ordered[-1][0]:
        return ordered[-1][1]
    for (lower_power, lower_specific), (upper_power, upper_specific) in zip(
        ordered,
        ordered[1:],
        strict=False,
    ):
        if lower_power <= power_kw <= upper_power:
            ratio = (power_kw - lower_power) / (upper_power - lower_power)
            return lower_specific + ratio * (upper_specific - lower_specific)
    raise vocabulary.VocabularyError("C06 efficiency curve is incomplete.")
