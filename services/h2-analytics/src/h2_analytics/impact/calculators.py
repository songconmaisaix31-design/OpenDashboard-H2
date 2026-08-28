from __future__ import annotations

import statistics
from dataclasses import dataclass

from h2_analytics.events import EventWindow
from h2_analytics.models import DataRow
from h2_analytics.vocabulary import efficiency_curve_by_equipment

_ELZ_IDS = ("1", "2", "3")
_ELZ_POWER_ACTUAL = tuple(f"elz{index}_power_actual_kw" for index in _ELZ_IDS)
_ELZ_POWER_CMD = tuple(f"elz{index}_power_cmd_kw" for index in _ELZ_IDS)
_ELZ_SPECIFIC = tuple(f"elz{index}_specific_energy_kwh_per_kg" for index in _ELZ_IDS)
_ELZ_AVAILABLE_FLAG = tuple(f"elz{index}_available_flag" for index in _ELZ_IDS)
_ELZ_ACTUAL_CAPACITY = tuple(
    f"elz{index}_actual_available_capacity_kw" for index in _ELZ_IDS
)
_ELZ_EQUIPMENT = ("ELZ01", "ELZ02", "ELZ03")

RATED_CAPACITY_KW = 1_000.0
MIN_STABLE_KW = 300.0
_EPSILON = 1e-9


@dataclass(frozen=True, slots=True)
class ImpactCalculation:
    metric: str
    value: float
    unit: str
    formula_version: str
    assumptions: tuple[str, ...]


DECLARED_IMPACT_METRICS = {
    "C01": ("bess_extra_regulation_energy_kwh", "impact-c01-v1"),
    "C02": ("unserved_elz_energy_kwh", "impact-c02-v1"),
    "C03": ("abnormal_grid_exchange_energy_kwh", "impact-c03-v1"),
    "C04": ("pcc_power_limit_violation_energy_kwh", "impact-c04-v1"),
    "C05": ("grid_energy_quota_deviation_kwh", "impact-c05-v1"),
    "C06": ("extra_energy_consumption_kwh", "impact-c06-v1"),
    "C07": ("bess_regulation_reserve_shortfall_kwh", "impact-c07-v1"),
}


class ImpactCalculator:
    def calculate(
        self,
        *,
        window: EventWindow,
        sampling_interval_minutes: float,
    ) -> ImpactCalculation:
        if window.code == "C01":
            return self._calculate_c01(window, sampling_interval_minutes)
        if window.code == "C02":
            return self._calculate_c02(window, sampling_interval_minutes)
        if window.code == "C03":
            return self._calculate_c03(window, sampling_interval_minutes)
        if window.code == "C04":
            return self._calculate_c04(window, sampling_interval_minutes)
        if window.code == "C05":
            return self._calculate_c05(window)
        if window.code == "C06":
            return self._calculate_c06(window, sampling_interval_minutes)
        return self._calculate_c07(window)

    @staticmethod
    def _calculate_c01(
        window: EventWindow, sampling_interval_minutes: float
    ) -> ImpactCalculation:
        values = [
            value
            for row in window.rows
            if (value := row.value("bess_power_actual_kw")) is not None
        ]
        baseline = statistics.median(values) if values else 0.0
        deviations = sum(abs(value - baseline) for value in values)
        return ImpactCalculation(
            "bess_extra_regulation_energy_kwh",
            deviations * sampling_interval_minutes / 60,
            "kWh",
            "impact-c01-v1",
            (
                "Baseline is the median BESS power within the event window.",
                "Extra regulation energy is the integrated absolute deviation from baseline.",
            ),
        )

    @staticmethod
    def _calculate_c02(
        window: EventWindow, sampling_interval_minutes: float
    ) -> ImpactCalculation:
        unserved: list[float] = []
        for row in window.rows:
            row_unserved = 0.0
            for cmd_field, actual_field in zip(
                _ELZ_POWER_CMD, _ELZ_POWER_ACTUAL, strict=True
            ):
                command = row.value(cmd_field)
                actual = row.value(actual_field)
                if command is None or actual is None:
                    continue
                row_unserved += max(command - actual, 0.0)
            unserved.append(row_unserved)
        return ImpactCalculation(
            "unserved_elz_energy_kwh",
            sum(unserved) * sampling_interval_minutes / 60,
            "kWh",
            "impact-c02-v1",
            (
                "Unserved electrolyzer energy is the positive command-actual gap.",
                "Each included row contributes its configured sampling interval.",
            ),
        )

    @staticmethod
    def _calculate_c03(
        window: EventWindow,
        sampling_interval_minutes: float,
    ) -> ImpactCalculation:
        # Official formula: sum(|abnormal PCC power - reference PCC power|) / 60.
        # The abnormal exchange is the measured PCC power; the reference exchange
        # is what the grid would have seen without the anomalous BESS action
        # (pcc - bess). The deviation per row therefore equals |bess_actual|.
        deviations = [
            abs(value)
            for row in window.rows
            if (value := row.value("bess_power_actual_kw")) is not None
        ]
        return ImpactCalculation(
            "abnormal_grid_exchange_energy_kwh",
            sum(deviations) * sampling_interval_minutes / 60,
            "kWh",
            "impact-c03-v1",
            (
                "Reference PCC excludes the anomalous BESS contribution (pcc - bess).",
                "The per-row deviation is the BESS power magnitude.",
            ),
        )

    @staticmethod
    def _calculate_c04(
        window: EventWindow, sampling_interval_minutes: float
    ) -> ImpactCalculation:
        excesses: list[float] = []
        for row in window.rows:
            export_violation, import_violation = _export_import_violation_kw(row)
            excesses.append(export_violation + import_violation)
        return ImpactCalculation(
            "pcc_power_limit_violation_energy_kwh",
            sum(excesses) * sampling_interval_minutes / 60,
            "kWh",
            "impact-c04-v1",
            (
                "Positive PCC power is export and negative PCC power is import.",
                "Every inclusive minute sample contributes export plus import excess.",
            ),
        )

    @staticmethod
    def _calculate_c05(window: EventWindow) -> ImpactCalculation:
        deviations: list[float] = []
        for row in window.rows:
            export_excess = row.value("grid_export_energy_quota_excess_kwh")
            import_excess = row.value("grid_import_energy_quota_excess_kwh")
            if export_excess is None and import_excess is None:
                continue
            deviations.append(
                max(
                    export_excess or 0.0,
                    import_excess or 0.0,
                )
            )
        value = max(deviations) if deviations else 0.0
        return ImpactCalculation(
            "grid_energy_quota_deviation_kwh",
            value,
            "kWh",
            "impact-c05-v1",
            (
                "Quota deviation is the larger of export and import quota excess.",
                "The event-level value is the peak deviation across the window.",
            ),
        )

    @staticmethod
    def _calculate_c06(
        window: EventWindow, sampling_interval_minutes: float
    ) -> ImpactCalculation:
        extra: list[float] = []
        for row in window.rows:
            actual_power = _elz_total_power(row)
            h2_target = _elz_hydrogen_kgph(row)
            if actual_power is None or h2_target is None:
                continue
            reference_power = _efficient_reference_power(row, h2_target)
            extra.append(max(actual_power - reference_power, 0.0))
        return ImpactCalculation(
            "extra_energy_consumption_kwh",
            sum(extra) * sampling_interval_minutes / 60,
            "kWh",
            "impact-c06-v1",
            (
                "Reference allocates the same hydrogen output to the most efficient available units.",
                "Extra consumption is the integrated gap between actual and reference electrical power.",
            ),
        )

    @staticmethod
    def _calculate_c07(window: EventWindow) -> ImpactCalculation:
        reserve_field = (
            "bess_available_charge_energy_kwh"
            if window.subtype == "CHARGE_HEADROOM_SHORTFALL"
            else "bess_available_discharge_energy_kwh"
        )
        shortfalls: list[float] = []
        for row in window.rows:
            available = row.value(reserve_field)
            target = row.value("bess_regulation_reserve_target_kwh")
            if available is None or target is None:
                continue
            shortfalls.append(max(target - available, 0.0))
        value = max(shortfalls) if shortfalls else 0.0
        return ImpactCalculation(
            "bess_regulation_reserve_shortfall_kwh",
            value,
            "kWh",
            "impact-c07-v1",
            (
                "Shortfall is the positive gap between the reserve target and available reserve energy.",
                "The event-level value is the peak shortfall across the window.",
            ),
        )


def _export_import_violation_kw(row: DataRow) -> tuple[float, float]:
    export = row.value("pcc_export_power_violation_kw")
    import_value = row.value("pcc_import_power_violation_kw")
    if export is not None and import_value is not None:
        return export, import_value
    pcc = row.value("pcc_power_actual_kw")
    export_limit = row.value("grid_export_power_limit_kw")
    import_limit = row.value("grid_import_power_limit_kw")
    export_violation = (
        max(pcc - export_limit, 0.0)
        if pcc is not None and export_limit is not None
        else 0.0
    )
    import_violation = (
        max(-pcc - import_limit, 0.0)
        if pcc is not None and import_limit is not None
        else 0.0
    )
    return export_violation, import_violation


def _elz_total_power(row: DataRow) -> float | None:
    values = [row.value(field) for field in _ELZ_POWER_ACTUAL]
    if any(value is None for value in values):
        return None
    return sum(value for value in values if value is not None)


def _elz_hydrogen_kgph(row: DataRow) -> float | None:
    total = 0.0
    for actual_field, specific_field in zip(
        _ELZ_POWER_ACTUAL, _ELZ_SPECIFIC, strict=True
    ):
        power = row.value(actual_field)
        specific = row.value(specific_field)
        if power is None or specific is None or specific <= 0:
            continue
        total += power / specific
    return total


def _efficient_reference_power(row: DataRow, h2_target: float) -> float:
    """Reference electrical power for the same hydrogen output.

    Loads the available units at their efficiency-curve points in ascending
    specific-energy order (the "efficient allocation"), keeping each assignment
    above the minimum stable power. The curve points are the official
    efficiency-curves vocabulary (10_electrolyzer_efficiency_curves.csv).
    """
    curves = efficiency_curve_by_equipment()
    points_by_unit: list[tuple[float, float, float]] = []
    for actual_field, capacity_field, available_field, equipment_id in zip(
        _ELZ_POWER_ACTUAL,
        _ELZ_ACTUAL_CAPACITY,
        _ELZ_AVAILABLE_FLAG,
        _ELZ_EQUIPMENT,
        strict=True,
    ):
        available = row.value(available_field)
        capacity = row.value(capacity_field)
        if available is None or available != 1 or capacity is None:
            continue
        points = curves.get(equipment_id)
        if not points:
            continue
        capacity_kw = min(capacity, RATED_CAPACITY_KW)
        for point in points:
            specific = float(point["specific_energy_kwh_per_kg"])
            power = float(point["power_kw"])
            points_by_unit.append((specific, power, capacity_kw))
    points_by_unit.sort(key=lambda item: (item[0], item[1]))
    remaining = h2_target
    reference_power = 0.0
    for specific, power_kw, capacity_kw in points_by_unit:
        if remaining <= _EPSILON:
            break
        max_h2 = min(capacity_kw, power_kw) / specific
        assigned_h2 = min(remaining, max_h2)
        assigned_power = assigned_h2 * specific
        if assigned_power > 0 and assigned_power < MIN_STABLE_KW:
            continue
        reference_power += assigned_power
        remaining -= assigned_h2
    return reference_power
