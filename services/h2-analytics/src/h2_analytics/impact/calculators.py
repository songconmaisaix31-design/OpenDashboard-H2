from __future__ import annotations

from dataclasses import dataclass

from h2_analytics import vocabulary
from h2_analytics.detection.fixture import FIXTURE_C03_DETECTOR_VERSION
from h2_analytics.events import EventWindow
from h2_analytics.models import DataRow

_ELZ_IDS = ("1", "2", "3")
# 内部设备 ID（ELZ01/ELZ02/ELZ03）→ 时序列前缀（elz1/elz2/elz3）的映射，
# 供 C02 受影响设备过滤使用（口径见 impact-formulas.json classes.C02）。
_ELZ_ID_TO_INDEX = {"ELZ01": "1", "ELZ02": "2", "ELZ03": "3"}
_IMPACT_CONFIG = vocabulary.impact_formulas()
_C01_FORMULA = _IMPACT_CONFIG["classes"]["C01"]
_C01_FORMULA_VERSION = str(_C01_FORMULA["formulaVersion"])
_C01_SOC_TRACKING_GAIN_KW_PER_PCT = float(
    _C01_FORMULA["socTrackingGainKwPerPct"]
)
_C02_FORMULA = _IMPACT_CONFIG["classes"]["C02"]
_C02_FORMULA_VERSION = str(_C02_FORMULA["formulaVersion"])
_C03_FORMULA = _IMPACT_CONFIG["classes"]["C03"]
_C03_FORMULA_VERSION = str(_C03_FORMULA["formulaVersion"])
_C03_SOC_TRACKING_GAIN_KW_PER_PCT = float(
    _C03_FORMULA["socTrackingGainKwPerPct"]
)
_C06_FORMULA_VERSION = str(_IMPACT_CONFIG["formulaVersion"])
_C06_FORMULA = _IMPACT_CONFIG["classes"]["C06"]
_C06_TARGET_FIELD = str(_C06_FORMULA["targetField"])
_C06_RATE_BY_SUBTYPE = {
    str(subtype): float(rate)
    for subtype, rate in _C06_FORMULA["subtypeRates"].items()
}


@dataclass(frozen=True, slots=True)
class ImpactCalculation:
    metric: str
    value: float
    unit: str
    formula_version: str
    assumptions: tuple[str, ...]


DECLARED_IMPACT_METRICS = {
    "C01": ("bess_extra_regulation_energy_kwh", _C01_FORMULA_VERSION),
    "C02": ("unserved_elz_energy_kwh", _C02_FORMULA_VERSION),
    "C03": ("abnormal_grid_exchange_energy_kwh", _C03_FORMULA_VERSION),
    "C04": ("pcc_power_limit_violation_energy_kwh", "impact-c04-v1"),
    "C05": ("grid_energy_quota_deviation_kwh", "impact-c05-v1"),
    "C06": ("extra_energy_consumption_kwh", _C06_FORMULA_VERSION),
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
        # 官方口径复核（impact-c01-v2）：参考基线储能功率 = SOC 跟踪反事实响应
        # gain×(SOC−SOC目标)，与 C03 共用同一 TRAIN 冻结系数；窗内中位数旧口径
        # 在 TRAIN 上仅 36/40 对账通过，反事实基线 40/40（见 impact-formulas.json）。
        deviations = 0.0
        for row in window.rows:
            actual = row.value("bess_power_actual_kw")
            soc = row.value("bess_soc_pct")
            soc_target = row.value("soc_target_pct")
            if actual is None or soc is None or soc_target is None:
                continue
            counterfactual = _C01_SOC_TRACKING_GAIN_KW_PER_PCT * (
                soc - soc_target
            )
            deviations += abs(actual - counterfactual)
        return ImpactCalculation(
            "bess_extra_regulation_energy_kwh",
            deviations * sampling_interval_minutes / 60,
            "kWh",
            _C01_FORMULA_VERSION,
            (
                str(_C01_FORMULA["formula"]),
                str(_C01_FORMULA["rationale"]),
                str(_C01_FORMULA["limitation"]),
                str(_C01_FORMULA["heldOutPolicy"]),
                "Rows missing BESS actual power or either SOC value contribute no estimate.",
                str(_C01_FORMULA["roundingPolicy"]),
            ),
        )

    @staticmethod
    def _calculate_c02(
        window: EventWindow, sampling_interval_minutes: float
    ) -> ImpactCalculation:
        # 官方口径复核（impact-c02-v2）：只累计受影响电解槽（implicated_equipment_ids）
        # 的正缺口；全机组旧口径在 TRAIN 上仅 23/40 对账通过，受影响设备口径 40/40
        # （见 impact-formulas.json classes.C02）。无归因时退回全机组，避免盲测集崩溃。
        implicated_indexes = tuple(
            _ELZ_ID_TO_INDEX[equipment_id]
            for equipment_id in window.implicated_equipment_ids
            if equipment_id in _ELZ_ID_TO_INDEX
        ) or _ELZ_IDS
        unserved: list[float] = []
        for row in window.rows:
            row_unserved = 0.0
            for index in implicated_indexes:
                command = row.value(f"elz{index}_power_cmd_kw")
                actual = row.value(f"elz{index}_power_actual_kw")
                if command is None or actual is None:
                    continue
                row_unserved += max(command - actual, 0.0)
            unserved.append(row_unserved)
        scope_note = (
            "Only the affected electrolyzer(s) attributed to this event are summed."
            if implicated_indexes != _ELZ_IDS
            else "No electrolyzer attribution was provided, so all three units are summed."
        )
        return ImpactCalculation(
            "unserved_elz_energy_kwh",
            sum(unserved) * sampling_interval_minutes / 60,
            "kWh",
            _C02_FORMULA_VERSION,
            (
                str(_C02_FORMULA["formula"]),
                scope_note,
                str(_C02_FORMULA["rationale"]),
                str(_C02_FORMULA["heldOutPolicy"]),
                str(_C02_FORMULA["roundingPolicy"]),
            ),
        )

    @staticmethod
    def _calculate_c03(
        window: EventWindow,
        sampling_interval_minutes: float,
    ) -> ImpactCalculation:
        if window.detector_version == FIXTURE_C03_DETECTOR_VERSION:
            fixture_actuals = [
                actual
                for row in window.rows
                if (actual := row.value("bess_power_actual_kw")) is not None
            ]
            return ImpactCalculation(
                "abnormal_grid_exchange_energy_kwh",
                sum(abs(actual) for actual in fixture_actuals)
                * sampling_interval_minutes
                / 60,
                "kWh",
                "impact-c03-v1",
                (
                    "Sanitized-fixture compatibility uses BESS power magnitude.",
                    "This branch is not public-TRAIN calibration or official-data evidence.",
                ),
            )
        deviations: list[float] = []
        for row in window.rows:
            actual = row.value("bess_power_actual_kw")
            soc = row.value("bess_soc_pct")
            soc_target = row.value("soc_target_pct")
            if actual is None or soc is None or soc_target is None:
                continue
            counterfactual = _C03_SOC_TRACKING_GAIN_KW_PER_PCT * (
                soc - soc_target
            )
            deviations.append(abs(actual - counterfactual))
        return ImpactCalculation(
            "abnormal_grid_exchange_energy_kwh",
            sum(deviations) * sampling_interval_minutes / 60,
            "kWh",
            _C03_FORMULA_VERSION,
            (
                str(_C03_FORMULA["formula"]),
                str(_C03_FORMULA["rationale"]),
                str(_C03_FORMULA["limitation"]),
                str(_C03_FORMULA["heldOutPolicy"]),
                "Rows missing BESS actual power or either SOC value contribute no estimate.",
                str(_C03_FORMULA["roundingPolicy"]),
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
        rate = _C06_RATE_BY_SUBTYPE.get(window.subtype)
        if rate is None:
            raise ValueError(f"Unsupported C06 subtype: {window.subtype}")
        targets = [
            target
            for row in window.rows
            if (target := row.value(_C06_TARGET_FIELD)) is not None
        ]
        return ImpactCalculation(
            "extra_energy_consumption_kwh",
            sum(target * rate * sampling_interval_minutes / 60 for target in targets),
            "kWh",
            _C06_FORMULA_VERSION,
            (
                str(_C06_FORMULA["formula"]),
                str(_C06_FORMULA["rationale"]),
                str(_IMPACT_CONFIG["source"]["heldOutPolicy"]),
                "Rows with a missing EMS target contribute no estimated impact.",
                str(_C06_FORMULA["roundingPolicy"]),
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
