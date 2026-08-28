"""Reproduce C06 impact-rate calibration from public TRAIN files only."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any

from h2_analytics.detection.c06 import inefficient_allocation_signature
from h2_analytics.models import DataRow

_C06_SUBTYPES = ("AVOIDABLE_START_STOP", "INEFFICIENT_POWER_ALLOCATION")
_REFERENCE_PRECISION = Decimal("0.001")
_RATE_PRECISION = Decimal("0.001")
_MINUTES_PER_HOUR = Decimal(60)


@dataclass(slots=True)
class _CalibrationEvent:
    event_id: str
    subtype: str
    start: datetime
    end: datetime
    reference_impact_kwh: Decimal
    inclusive_sample_count: int = 0
    target_kw_minutes: Decimal = Decimal(0)


@dataclass(frozen=True, slots=True)
class _SignatureRun:
    start: datetime
    end: datetime
    sample_count: int


_SIGNATURE_FIELDS = (
    "ems_total_elz_target_kw",
    *(
        f"elz{index}_{suffix}"
        for index in (1, 2, 3)
        for suffix in (
            "power_cmd_kw",
            "power_actual_kw",
            "actual_available_capacity_kw",
            "available_flag",
            "run_state",
            "specific_energy_kwh_per_kg",
        )
    ),
)


def build_c06_calibration_report(
    timeseries_path: Path,
    labels_path: Path,
) -> dict[str, Any]:
    """Return hashes and derivation statistics without retaining official rows."""
    events, label_row_count = _read_c06_events(labels_path)
    timeseries_row_count, signature_stats = _accumulate_targets(
        timeseries_path,
        events,
    )
    subtype_stats = {
        subtype: _subtype_statistics(
            [event for event in events if event.subtype == subtype]
        )
        for subtype in _C06_SUBTYPES
    }
    return {
        "sourceFiles": {
            "timeseries": {
                **file_digest(timeseries_path),
                "dataRowCount": timeseries_row_count,
            },
            "eventLabels": {
                **file_digest(labels_path),
                "dataRowCount": label_row_count,
            },
        },
        "c06": {
            "eventCount": len(events),
            "subtypes": subtype_stats,
            "inefficientDetectionSignature": signature_stats,
        },
    }


def _read_c06_events(path: Path) -> tuple[list[_CalibrationEvent], int]:
    events: list[_CalibrationEvent] = []
    row_count = 0
    with path.open(encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream):
            row_count += 1
            if row["anomaly_code"] != "C06":
                continue
            subtype = row["anomaly_subtype"]
            if subtype not in _C06_SUBTYPES:
                raise ValueError(f"Unsupported C06 subtype: {subtype}")
            events.append(
                _CalibrationEvent(
                    event_id=row["event_id"],
                    subtype=subtype,
                    start=datetime.fromisoformat(row["start_time"]),
                    end=datetime.fromisoformat(row["end_time"]),
                    reference_impact_kwh=Decimal(row["reference_impact_value"]),
                )
            )
    events.sort(key=lambda event: (event.start, event.event_id))
    return events, row_count


def _accumulate_targets(
    path: Path,
    events: list[_CalibrationEvent],
) -> tuple[int, dict[str, Any]]:
    next_event_index = 0
    active: list[_CalibrationEvent] = []
    row_count = 0
    signature_runs: list[_SignatureRun] = []
    signature_start: datetime | None = None
    signature_end: datetime | None = None
    signature_sample_count = 0
    pair_counts: Counter[str] = Counter()
    maximum_tracking_error_kw = Decimal(0)
    maximum_target_balance_error_kw = Decimal(0)
    maximum_elz2_share_error_kw = Decimal(0)
    maximum_elz3_share_error_kw = Decimal(0)
    minimum_reallocation_kw: Decimal | None = None
    minimum_measured_advantage: Decimal | None = None
    minimum_curve_advantage: Decimal | None = None
    with path.open(encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream):
            row_count += 1
            timestamp = datetime.fromisoformat(row["timestamp"])
            signature = inefficient_allocation_signature(
                _signature_row(row_count, timestamp, row)
            )
            if signature is not None:
                if (
                    signature_end is not None
                    and timestamp - signature_end != timedelta(minutes=1)
                ):
                    assert signature_start is not None
                    signature_runs.append(
                        _SignatureRun(
                            signature_start,
                            signature_end,
                            signature_sample_count,
                        )
                    )
                    signature_start = None
                    signature_sample_count = 0
                signature_start = signature_start or timestamp
                signature_end = timestamp
                signature_sample_count += 1
                pair_counts[
                    f"{signature.inefficient_equipment_id}->"
                    f"{signature.alternative_equipment_id}"
                ] += 1
                numeric = {
                    field: Decimal(row[field]) for field in _SIGNATURE_FIELDS
                }
                powers = [
                    numeric[f"elz{index}_power_actual_kw"]
                    for index in (1, 2, 3)
                ]
                commands = [
                    numeric[f"elz{index}_power_cmd_kw"]
                    for index in (1, 2, 3)
                ]
                target = numeric["ems_total_elz_target_kw"]
                elz3_capacity = numeric[
                    "elz3_actual_available_capacity_kw"
                ]
                maximum_tracking_error_kw = max(
                    maximum_tracking_error_kw,
                    *(abs(command - power) for command, power in zip(
                        commands,
                        powers,
                        strict=True,
                    )),
                )
                maximum_target_balance_error_kw = max(
                    maximum_target_balance_error_kw,
                    abs(sum(powers, Decimal(0)) - target),
                )
                maximum_elz2_share_error_kw = max(
                    maximum_elz2_share_error_kw,
                    abs(powers[1] - Decimal("0.3") * target),
                )
                maximum_elz3_share_error_kw = max(
                    maximum_elz3_share_error_kw,
                    abs(
                        powers[2]
                        - min(Decimal("0.5") * target, elz3_capacity)
                    ),
                )
                minimum_reallocation_kw = _minimum_decimal(
                    minimum_reallocation_kw,
                    Decimal(str(signature.reallocation_kw)),
                )
                minimum_measured_advantage = _minimum_decimal(
                    minimum_measured_advantage,
                    Decimal(str(
                        signature.inefficient_specific_energy
                        - signature.alternative_specific_energy
                    )),
                )
                minimum_curve_advantage = _minimum_decimal(
                    minimum_curve_advantage,
                    Decimal(str(
                        signature.inefficient_curve_specific_energy
                        - signature.alternative_curve_specific_energy
                    )),
                )
            elif signature_start is not None:
                assert signature_end is not None
                signature_runs.append(
                    _SignatureRun(
                        signature_start,
                        signature_end,
                        signature_sample_count,
                    )
                )
                signature_start = None
                signature_end = None
                signature_sample_count = 0
            while (
                next_event_index < len(events)
                and events[next_event_index].start <= timestamp
            ):
                active.append(events[next_event_index])
                next_event_index += 1
            active = [event for event in active if event.end >= timestamp]
            if not active:
                continue
            target = Decimal(row["ems_total_elz_target_kw"])
            for event in active:
                if event.start <= timestamp <= event.end:
                    event.inclusive_sample_count += 1
                    event.target_kw_minutes += target
    if signature_start is not None:
        assert signature_end is not None
        signature_runs.append(
            _SignatureRun(
                signature_start,
                signature_end,
                signature_sample_count,
            )
        )
    if any(event.inclusive_sample_count == 0 for event in events):
        missing = ", ".join(
            event.event_id for event in events if event.inclusive_sample_count == 0
        )
        raise ValueError(f"C06 labels have no matching time-series samples: {missing}")
    inefficient_events = [
        event
        for event in events
        if event.subtype == "INEFFICIENT_POWER_ALLOCATION"
    ]
    matched_event_ids = {
        event.event_id
        for run in signature_runs
        for event in inefficient_events
        if _overlaps(run, event)
    }
    exact_boundary_match_count = sum(
        any(run.start == event.start and run.end == event.end for event in inefficient_events)
        for run in signature_runs
    )
    extra_signature_run_count = sum(
        not any(_overlaps(run, event) for event in inefficient_events)
        for run in signature_runs
    )
    return row_count, {
        "eventCount": len(inefficient_events),
        "inclusiveEventSampleCount": sum(
            event.inclusive_sample_count for event in inefficient_events
        ),
        "signatureRunCount": len(signature_runs),
        "matchedEventCount": len(matched_event_ids),
        "exactBoundaryMatchCount": exact_boundary_match_count,
        "extraSignatureRunCount": extra_signature_run_count,
        "signatureSampleCount": sum(run.sample_count for run in signature_runs),
        "eventLengthRows": {
            "minimum": min(
                (event.inclusive_sample_count for event in inefficient_events),
                default=0,
            ),
            "maximum": max(
                (event.inclusive_sample_count for event in inefficient_events),
                default=0,
            ),
        },
        "maximumTrackingErrorKw": _decimal_text(maximum_tracking_error_kw),
        "maximumTargetBalanceErrorKw": _decimal_text(
            maximum_target_balance_error_kw
        ),
        "maximumElz2ShareErrorKw": _decimal_text(
            maximum_elz2_share_error_kw
        ),
        "maximumElz3ShareErrorKw": _decimal_text(
            maximum_elz3_share_error_kw
        ),
        "minimumFeasibleReallocationKw": _optional_decimal_text(
            minimum_reallocation_kw,
            precision=Decimal("0.000001"),
        ),
        "minimumMeasuredSpecificEnergyAdvantageKwhPerKg": (
            _optional_decimal_text(
                minimum_measured_advantage,
                precision=Decimal("0.000001"),
            )
        ),
        "minimumCurveSpecificEnergyAdvantageKwhPerKg": (
            _optional_decimal_text(
                minimum_curve_advantage,
                precision=Decimal("0.000001"),
            )
        ),
        "selectedPairSampleCounts": dict(sorted(pair_counts.items())),
    }


def _signature_row(
    index: int,
    timestamp: datetime,
    row: dict[str, str],
) -> DataRow:
    values: dict[str, float | None] = {}
    for field in _SIGNATURE_FIELDS:
        raw = row.get(field)
        try:
            values[field] = None if raw is None or raw == "" else float(raw)
        except ValueError:
            values[field] = None
    return DataRow(index, timestamp, row["timestamp"], values)


def _overlaps(run: _SignatureRun, event: _CalibrationEvent) -> bool:
    return not (run.end < event.start or run.start > event.end)


def _minimum_decimal(
    current: Decimal | None,
    candidate: Decimal,
) -> Decimal:
    return candidate if current is None else min(current, candidate)


def _optional_decimal_text(
    value: Decimal | None,
    *,
    precision: Decimal | None = None,
) -> str | None:
    if value is None:
        return None
    normalized = value.quantize(precision) if precision is not None else value
    return _decimal_text(normalized)


def _subtype_statistics(events: list[_CalibrationEvent]) -> dict[str, Any]:
    target_kw_minutes = sum(
        (event.target_kw_minutes for event in events), Decimal(0)
    )
    target_energy_kwh = target_kw_minutes / _MINUTES_PER_HOUR
    reference_impact_kwh = sum(
        (event.reference_impact_kwh for event in events), Decimal(0)
    )
    aggregate_rate = reference_impact_kwh / target_energy_kwh
    calibrated_rate = aggregate_rate.quantize(_RATE_PRECISION, rounding=ROUND_HALF_UP)
    per_event_rates = [
        event.reference_impact_kwh
        / (event.target_kw_minutes / _MINUTES_PER_HOUR)
        for event in events
    ]
    residuals = [
        abs(
            (
                event.target_kw_minutes
                / _MINUTES_PER_HOUR
                * calibrated_rate
            ).quantize(_REFERENCE_PRECISION, rounding=ROUND_HALF_UP)
            - event.reference_impact_kwh
        )
        for event in events
    ]
    return {
        "eventCount": len(events),
        "inclusiveSampleCount": sum(
            event.inclusive_sample_count for event in events
        ),
        "targetKwMinutes": _decimal_text(target_kw_minutes),
        "targetEnergyKwh": _decimal_text(target_energy_kwh),
        "referenceImpactKwh": _decimal_text(reference_impact_kwh),
        "aggregateDerivedRate": _decimal_text(aggregate_rate),
        "calibratedRate": _decimal_text(calibrated_rate),
        "perEventDerivedRateMinimum": _decimal_text(min(per_event_rates)),
        "perEventDerivedRateMaximum": _decimal_text(max(per_event_rates)),
        "roundedReferenceMatchCount": sum(
            residual == 0 for residual in residuals
        ),
        "maximumAbsoluteRoundedResidualKwh": _decimal_text(max(residuals)),
    }


def file_digest(path: Path) -> dict[str, Any]:
    digest = hashlib.sha256()
    byte_count = 0
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
            byte_count += len(chunk)
    return {"sha256": digest.hexdigest(), "byteCount": byte_count}


def _decimal_text(value: Decimal) -> str:
    return format(value.normalize(), "f")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Derive C06 impact coefficients from public TRAIN files."
    )
    parser.add_argument("timeseries", type=Path)
    parser.add_argument("labels", type=Path)
    arguments = parser.parse_args()
    print(
        json.dumps(
            build_c06_calibration_report(arguments.timeseries, arguments.labels),
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
