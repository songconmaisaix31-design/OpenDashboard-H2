"""Reproduce the C03 impact formula from public TRAIN files only."""

from __future__ import annotations

import argparse
import csv
import json
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any

from .calibrate_c06 import file_digest

_REFERENCE_PRECISION = Decimal("0.001")
_MINUTES_PER_HOUR = Decimal(60)


@dataclass(slots=True)
class _CalibrationEvent:
    event_id: str
    start: datetime
    end: datetime
    reference_impact_kwh: Decimal
    inclusive_sample_count: int = 0
    samples: list[tuple[Decimal, Decimal]] = field(default_factory=list)


def build_c03_calibration_report(
    timeseries_path: Path,
    labels_path: Path,
) -> dict[str, Any]:
    """Return source identity and C03 formula-fit statistics without raw rows."""
    events, label_row_count = _read_c03_events(labels_path)
    timeseries_row_count = _accumulate_inputs(timeseries_path, events)
    aggregate_derived_gain = _derive_aggregate_gain(events)
    calibrated_gain = aggregate_derived_gain.quantize(
        Decimal("0.001"), rounding=ROUND_HALF_UP
    )
    calculated_impacts = [
        _event_impact(event, calibrated_gain) for event in events
    ]
    rounded_residuals = [
        abs(
            calculated.quantize(_REFERENCE_PRECISION, rounding=ROUND_HALF_UP)
            - event.reference_impact_kwh
        )
        for event, calculated in zip(events, calculated_impacts, strict=True)
    ]
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
        "c03": {
            "eventCount": len(events),
            "inclusiveSampleCount": sum(
                event.inclusive_sample_count for event in events
            ),
            "actualPowerMagnitudeKwMinutes": _decimal_text(
                sum(
                    (
                        abs(actual)
                        for event in events
                        for actual, _soc_deviation in event.samples
                    ),
                    Decimal(0),
                )
            ),
            "signedSocDeviationPctMinutes": _decimal_text(
                sum(
                    (
                        _sign(actual) * soc_deviation
                        for event in events
                        for actual, soc_deviation in event.samples
                    ),
                    Decimal(0),
                )
            ),
            "aggregateDerivedSocTrackingGainKwPerPct": _decimal_text(
                aggregate_derived_gain
            ),
            "calibratedSocTrackingGainKwPerPct": _decimal_text(calibrated_gain),
            "calculatedImpactKwh": _decimal_text(
                sum(calculated_impacts, Decimal(0))
            ),
            "referenceImpactKwh": _decimal_text(
                sum(
                    (event.reference_impact_kwh for event in events),
                    Decimal(0),
                )
            ),
            "roundedReferenceMatchCount": sum(
                residual == 0 for residual in rounded_residuals
            ),
            "maximumAbsoluteRoundedResidualKwh": _decimal_text(
                max(rounded_residuals, default=Decimal(0))
            ),
            "meanAbsoluteRoundedResidualKwh": _decimal_text(
                sum(rounded_residuals, Decimal(0)) / Decimal(len(events))
                if events
                else Decimal(0)
            ),
        },
    }


def _read_c03_events(path: Path) -> tuple[list[_CalibrationEvent], int]:
    events: list[_CalibrationEvent] = []
    row_count = 0
    with path.open(encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream):
            row_count += 1
            if row["anomaly_code"] != "C03":
                continue
            events.append(
                _CalibrationEvent(
                    event_id=row["event_id"],
                    start=datetime.fromisoformat(row["start_time"]),
                    end=datetime.fromisoformat(row["end_time"]),
                    reference_impact_kwh=Decimal(row["reference_impact_value"]),
                )
            )
    events.sort(key=lambda event: (event.start, event.event_id))
    return events, row_count


def _accumulate_inputs(path: Path, events: list[_CalibrationEvent]) -> int:
    next_event_index = 0
    active: list[_CalibrationEvent] = []
    row_count = 0
    with path.open(encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream):
            row_count += 1
            timestamp = datetime.fromisoformat(row["timestamp"])
            while (
                next_event_index < len(events)
                and events[next_event_index].start <= timestamp
            ):
                active.append(events[next_event_index])
                next_event_index += 1
            active = [event for event in active if event.end >= timestamp]
            if not active:
                continue
            actual = Decimal(row["bess_power_actual_kw"])
            soc_deviation = Decimal(row["bess_soc_pct"]) - Decimal(
                row["soc_target_pct"]
            )
            for event in active:
                if event.start <= timestamp <= event.end:
                    event.inclusive_sample_count += 1
                    event.samples.append((actual, soc_deviation))
    if any(event.inclusive_sample_count == 0 for event in events):
        missing = ", ".join(
            event.event_id for event in events if event.inclusive_sample_count == 0
        )
        raise ValueError(f"C03 labels have no matching time-series samples: {missing}")
    return row_count


def _derive_aggregate_gain(events: list[_CalibrationEvent]) -> Decimal:
    actual_magnitude = sum(
        (
            abs(actual)
            for event in events
            for actual, _soc_deviation in event.samples
        ),
        Decimal(0),
    )
    signed_soc_deviation = sum(
        (
            _sign(actual) * soc_deviation
            for event in events
            for actual, soc_deviation in event.samples
        ),
        Decimal(0),
    )
    if signed_soc_deviation == 0:
        raise ValueError("C03 calibration has no signed SOC-deviation signal.")
    reference_power_minutes = (
        sum(
            (event.reference_impact_kwh for event in events),
            Decimal(0),
        )
        * _MINUTES_PER_HOUR
    )
    gain = (actual_magnitude - reference_power_minutes) / signed_soc_deviation
    if any(
        _sign(actual - gain * soc_deviation) != _sign(actual)
        for event in events
        for actual, soc_deviation in event.samples
    ):
        raise ValueError("C03 aggregate gain crosses an observed BESS direction.")
    return gain


def _event_impact(event: _CalibrationEvent, gain: Decimal) -> Decimal:
    return sum(
        (abs(actual - gain * soc_deviation) for actual, soc_deviation in event.samples),
        Decimal(0),
    ) / _MINUTES_PER_HOUR


def _sign(value: Decimal) -> Decimal:
    if value > 0:
        return Decimal(1)
    if value < 0:
        return Decimal(-1)
    return Decimal(0)


def _decimal_text(value: Decimal) -> str:
    return format(value.normalize(), "f")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Verify the C03 impact formula from public TRAIN files."
    )
    parser.add_argument("timeseries", type=Path)
    parser.add_argument("labels", type=Path)
    arguments = parser.parse_args()
    print(
        json.dumps(
            build_c03_calibration_report(arguments.timeseries, arguments.labels),
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
