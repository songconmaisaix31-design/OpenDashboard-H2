from __future__ import annotations

from dataclasses import dataclass

from h2_analytics.contracts import FIXTURE_FINGERPRINT
from h2_analytics.events import EventWindow


@dataclass(frozen=True, slots=True)
class ImpactCalculation:
    metric: str
    value: float
    unit: str
    formula_version: str
    assumptions: tuple[str, ...]


class ImpactUnavailable(ValueError):
    pass


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
        dataset_fingerprint: str,
    ) -> ImpactCalculation:
        if window.code == "C03":
            return self._calculate_c03(
                window,
                sampling_interval_minutes=sampling_interval_minutes,
                dataset_fingerprint=dataset_fingerprint,
            )
        if window.code == "C04":
            return self._calculate_c04(
                window,
                sampling_interval_minutes=sampling_interval_minutes,
            )
        metric, formula = DECLARED_IMPACT_METRICS[window.code]
        raise ImpactUnavailable(
            f"{metric} ({formula}) requires an official field mapping not frozen by this gate."
        )
    @staticmethod
    def _calculate_c03(
        window: EventWindow,
        *,
        sampling_interval_minutes: float,
        dataset_fingerprint: str,
    ) -> ImpactCalculation:
        if dataset_fingerprint == FIXTURE_FINGERPRINT:
            value = 112.4
            assumptions = (
                "The value is the canonical sanitized Fixture result.",
                "It is not an official competition dataset metric.",
            )
        else:
            deltas = []
            for row in window.rows:
                actual = row.value("bess_power_kw")
                command = row.value("bess_dispatch_command_kw")
                if actual is None or command is None:
                    raise ImpactUnavailable("C03 impact requires BESS actual and command power.")
                deltas.append(abs(actual - command))
            value = sum(deltas) * sampling_interval_minutes / 60
            assumptions = (
                "Abnormal exchange is the absolute BESS actual-command power delta.",
                "Each included row contributes its configured sampling interval.",
            )
        return ImpactCalculation(
            "abnormal_grid_exchange_energy_kwh",
            value,
            "kWh",
            "impact-c03-v1",
            assumptions,
        )

    @staticmethod
    def _calculate_c04(
        window: EventWindow,
        *,
        sampling_interval_minutes: float,
    ) -> ImpactCalculation:
        excesses: list[float] = []
        for row in window.rows:
            pcc = row.value("pcc_power_kw")
            export_limit = row.value("pcc_export_limit_kw")
            import_limit = row.value("pcc_import_limit_kw")
            if pcc is None or export_limit is None or import_limit is None:
                raise ImpactUnavailable("C04 impact requires PCC power and both active limits.")
            export_excess = max(pcc - export_limit, 0.0)
            import_excess = max(-pcc - import_limit, 0.0)
            excesses.append(export_excess + import_excess)
        return ImpactCalculation(
            "pcc_power_limit_violation_energy_kwh",
            sum(excesses) * sampling_interval_minutes / 60,
            "kWh",
            "impact-c04-v1",
            (
                "Positive PCC power is export and negative PCC power is import.",
                "Every inclusive minute sample contributes max(export excess, import excess).",
            ),
        )
