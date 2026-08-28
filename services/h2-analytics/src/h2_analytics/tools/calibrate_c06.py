"""Reproduce C06 impact-rate calibration from public TRAIN files only."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any

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


def build_c06_calibration_report(
    timeseries_path: Path,
    labels_path: Path,
) -> dict[str, Any]:
    """Return hashes and derivation statistics without retaining official rows."""
    events, label_row_count = _read_c06_events(labels_path)
    timeseries_row_count = _accumulate_targets(timeseries_path, events)
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


def _accumulate_targets(path: Path, events: list[_CalibrationEvent]) -> int:
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
            target = Decimal(row["ems_total_elz_target_kw"])
            for event in active:
                if event.start <= timestamp <= event.end:
                    event.inclusive_sample_count += 1
                    event.target_kw_minutes += target
    if any(event.inclusive_sample_count == 0 for event in events):
        missing = ", ".join(
            event.event_id for event in events if event.inclusive_sample_count == 0
        )
        raise ValueError(f"C06 labels have no matching time-series samples: {missing}")
    return row_count


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
