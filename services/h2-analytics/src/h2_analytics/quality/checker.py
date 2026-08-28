from __future__ import annotations

from typing import Any

from h2_analytics.models import ParseDiagnostics
from h2_analytics.settings import DEFAULT_CONSTRAINTS


class QualityChecker:
    def evaluate(
        self,
        *,
        manifest: dict[str, Any],
        diagnostics: ParseDiagnostics,
        generated_at: str,
    ) -> dict[str, Any]:
        provenance = manifest["provenance"]
        checks = [
            self._check(
                "quality-field-mapping",
                "field_mapping",
                blocked=bool(diagnostics.missing_fields),
                warning=False,
                fields=diagnostics.missing_fields,
                passed_message="All required fields are present.",
                failed_message="Required fields are missing.",
                observed=", ".join(diagnostics.missing_fields) or None,
                provenance=provenance,
            ),
            self._check(
                "quality-row-count",
                "row_count",
                blocked=manifest["rowCount"] == 0,
                warning=False,
                fields=(),
                passed_message="CSV contains data rows.",
                failed_message="CSV contains no data rows.",
                observed=manifest["rowCount"],
                provenance=provenance,
            ),
            self._check(
                "quality-missing-values",
                "missing_values",
                blocked=bool(diagnostics.missing_values),
                warning=False,
                fields=tuple(sorted(diagnostics.missing_values)),
                passed_message="Required fields contain no missing values.",
                failed_message="Required fields contain missing values.",
                observed=sum(diagnostics.missing_values.values()),
                provenance=provenance,
            ),
            self._check(
                "quality-duplicate-timestamps",
                "duplicate_timestamps",
                blocked=diagnostics.duplicate_timestamps > 0,
                warning=False,
                fields=("timestamp",),
                passed_message="Timestamps are unique.",
                failed_message="Duplicate timestamps prevent deterministic aggregation.",
                observed=diagnostics.duplicate_timestamps,
                provenance=provenance,
            ),
            self._check(
                "quality-irregular-sampling",
                "irregular_sampling",
                blocked=False,
                warning=diagnostics.irregular_intervals > 0,
                fields=("timestamp",),
                passed_message="Sampling intervals are regular.",
                failed_message="Sampling intervals are irregular; impact integration uses actual intervals.",
                observed=diagnostics.irregular_intervals,
                provenance=provenance,
            ),
            self._check(
                "quality-invalid-range",
                "invalid_range",
                blocked=(
                    bool(diagnostics.invalid_numeric_values)
                    or bool(diagnostics.invalid_ranges)
                    or diagnostics.invalid_timestamps > 0
                ),
                warning=False,
                fields=tuple(
                    sorted(
                        set(diagnostics.invalid_numeric_values)
                        | set(diagnostics.invalid_ranges)
                        | ({"timestamp"} if diagnostics.invalid_timestamps else set())
                    )
                ),
                passed_message="Required numeric values and timestamps are valid.",
                failed_message="Invalid timestamps, numeric values, or physical ranges were found.",
                observed=(
                    sum(diagnostics.invalid_numeric_values.values())
                    + sum(diagnostics.invalid_ranges.values())
                    + diagnostics.invalid_timestamps
                ),
                provenance=provenance,
            ),
            self._check(
                "quality-timestamp-order",
                "timestamp_order",
                blocked=diagnostics.out_of_order_timestamps > 0,
                warning=False,
                fields=("timestamp",),
                passed_message="Timestamps are monotonically ordered.",
                failed_message="Out-of-order timestamps prevent deterministic aggregation.",
                observed=diagnostics.out_of_order_timestamps,
                provenance=provenance,
            ),
            self._power_balance_check(diagnostics, provenance),
        ]
        blocking_reasons = [
            check["message"] for check in checks if check["status"] == "blocked"
        ]
        warnings = [
            check["message"] for check in checks if check["status"] == "warning"
        ]
        status = "blocked" if blocking_reasons else "warning" if warnings else "passed"
        return {
            "schemaVersion": 1,
            "reportId": f"quality-{manifest['datasetId']}",
            "datasetId": manifest["datasetId"],
            "status": status,
            "generatedAt": generated_at,
            "rowCount": manifest["rowCount"],
            "timeRange": manifest["timeRange"],
            "checks": checks,
            "warnings": warnings,
            "blockingReasons": blocking_reasons,
            "provenance": provenance,
        }

    @staticmethod
    def _check(
        check_id: str,
        code: str,
        *,
        blocked: bool,
        warning: bool,
        fields: tuple[str, ...],
        passed_message: str,
        failed_message: str,
        observed: int | float | str | None,
        provenance: dict[str, Any],
    ) -> dict[str, Any]:
        status = "blocked" if blocked else "warning" if warning else "passed"
        severity = "blocking" if blocked else "warning" if warning else "info"
        value: dict[str, Any] = {
            "checkId": check_id,
            "code": code,
            "status": status,
            "severity": severity,
            "affectedFields": list(fields),
            "message": failed_message if blocked or warning else passed_message,
            "evidenceIds": [],
            "provenance": provenance,
        }
        if observed is not None:
            value["observedValue"] = observed
        return value
    @staticmethod
    def _power_balance_check(
        diagnostics: ParseDiagnostics,
        provenance: dict[str, Any],
    ) -> dict[str, Any]:
        observed = diagnostics.maximum_power_balance_residual_kw
        warning = observed is not None and observed > DEFAULT_CONSTRAINTS.power_balance_warning_kw
        value = QualityChecker._check(
            "quality-power-balance-residual",
            "power_balance_residual",
            blocked=False,
            warning=warning,
            fields=(
                "pv_actual_kw",
                "bess_power_actual_kw",
                "pcc_power_actual_kw",
                "elz1_power_actual_kw",
                "elz2_power_actual_kw",
                "elz3_power_actual_kw",
                "aux_load_kw",
            ),
            passed_message="Power-balance residual is within the configured warning threshold.",
            failed_message="Power-balance residual exceeds the configured warning threshold.",
            observed=observed,
            provenance=provenance,
        )
        value["threshold"] = DEFAULT_CONSTRAINTS.power_balance_warning_kw
        value["unit"] = "kW"
        return value
