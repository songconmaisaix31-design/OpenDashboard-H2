from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta

from h2_analytics import vocabulary
from h2_analytics.detection import DetectionCandidate
from h2_analytics.detection.oplog_prior import (
    CONFIRMATION_RELIEF_ROWS,
    load_operation_priors,
)
from h2_analytics.models import DataRow


@dataclass(frozen=True, slots=True)
class AggregationPolicy:
    minimum_rows: int
    confirmation_row: int
    maximum_gap_intervals: int = 1
    daily: bool = False
    requires_exact_sampling_interval: bool = False
    exact_sampling_interval_minutes: float | None = None


@dataclass(frozen=True, slots=True)
class EventWindow:
    event_id: str
    code: str
    subtype: str
    rows: tuple[DataRow, ...]
    start_time: datetime
    end_time: datetime
    first_detection_time: datetime
    confidence: float
    detector_version: str
    implicated_equipment_ids: tuple[str, ...] = ()


def _policy(code: str) -> AggregationPolicy:
    values = vocabulary.detection_thresholds()["classes"][code]["aggregation"]
    return AggregationPolicy(
        minimum_rows=int(values["minimumRows"]),
        confirmation_row=int(values["confirmationRow"]),
        maximum_gap_intervals=int(values["maximumGapIntervals"]),
        daily=bool(values["daily"]),
        requires_exact_sampling_interval=bool(
            values.get("requiresExactSamplingInterval", False)
        ),
        exact_sampling_interval_minutes=(
            float(values["exactSamplingIntervalMinutes"])
            if "exactSamplingIntervalMinutes" in values
            else None
        ),
    )


POLICIES = {code: _policy(code) for code in vocabulary.anomaly_codes()}
DEFAULT_POLICY = AggregationPolicy(minimum_rows=3, confirmation_row=3)


class EventAggregator:
    def aggregate(
        self,
        *,
        rows: tuple[DataRow, ...],
        candidates: tuple[DetectionCandidate, ...],
        sampling_interval_minutes: float,
    ) -> tuple[EventWindow, ...]:
        # A-P0-1 操作先验：未注入 H2_OPERATION_LOG_PATH 时为 None（v5 行为）。
        operation_priors = load_operation_priors()
        rows_by_index = {row.index: row for row in rows}
        grouped: dict[tuple[str, str], list[DetectionCandidate]] = defaultdict(list)
        for candidate in candidates:
            if candidate.code in {"C01", "C02", "C06"} and not (
                vocabulary.valid_implicated_equipment_ids(
                    candidate.code, candidate.implicated_equipment_ids
                )
            ):
                raise vocabulary.VocabularyError(
                    f"{candidate.code} detector candidate lacks valid equipment attribution."
                )
            grouped[(candidate.code, candidate.subtype)].append(candidate)

        draft_windows: list[
            tuple[str, str, tuple[DetectionCandidate, ...], tuple[DataRow, ...]]
        ] = []
        for (code, subtype), values in sorted(grouped.items()):
            policy = POLICIES.get(code, DEFAULT_POLICY)
            ordered = sorted(values, key=lambda item: (item.timestamp, item.row_index))
            for segment in _segments(
                ordered,
                maximum_gap=timedelta(
                    minutes=sampling_interval_minutes * policy.maximum_gap_intervals
                ),
                expected_interval=timedelta(
                    minutes=(
                        policy.exact_sampling_interval_minutes
                        if policy.exact_sampling_interval_minutes is not None
                        else sampling_interval_minutes
                    )
                ),
                daily=policy.daily,
                requires_exact_interval=policy.requires_exact_sampling_interval,
            ):
                if len(segment) < policy.minimum_rows:
                    continue
                segment_rows = tuple(rows_by_index[item.row_index] for item in segment)
                draft_windows.append((code, subtype, segment, segment_rows))

        ordinals: dict[str, int] = defaultdict(int)
        output: list[EventWindow] = []
        for code, subtype, segment, segment_rows in sorted(
            draft_windows,
            key=lambda item: (item[2][0].timestamp, item[0], item[1]),
        ):
            policy = POLICIES.get(code, DEFAULT_POLICY)
            ordinals[code] += 1
            ordinal = ordinals[code]
            start = segment[0].timestamp
            end = segment[-1].timestamp
            # A-P0-1：事件起点落在同码操作的先验窗内 → 确认行提前
            # （只影响 first_detection_time 时效，事件集合不变）。
            confirmation_row = policy.confirmation_row
            if operation_priors is not None and operation_priors.match(code, start):
                confirmation_row = max(
                    1, confirmation_row - CONFIRMATION_RELIEF_ROWS
                )
            confirmation_index = min(confirmation_row - 1, len(segment) - 1)
            confidence = sum(item.confidence for item in segment) / len(segment)
            event_id = f"{code}-{start:%Y%m%d}-{ordinal:03d}"
            implicated_equipment_ids = tuple(
                dict.fromkeys(
                    equipment_id
                    for candidate in segment
                    for equipment_id in candidate.implicated_equipment_ids
                )
            )
            if code in {"C01", "C02", "C06"} and not (
                vocabulary.valid_implicated_equipment_ids(
                    code, implicated_equipment_ids
                )
            ):
                raise vocabulary.VocabularyError(
                    f"{code} event equipment attribution is inconsistent."
                )
            output.append(
                EventWindow(
                    event_id=event_id,
                    code=code,
                    subtype=subtype,
                    rows=segment_rows,
                    start_time=start,
                    end_time=end,
                    first_detection_time=segment[confirmation_index].timestamp,
                    confidence=confidence,
                    detector_version=segment[0].detector_version,
                    implicated_equipment_ids=implicated_equipment_ids,
                )
            )
        return tuple(output)


def _segments(
    candidates: list[DetectionCandidate],
    *,
    maximum_gap: timedelta,
    expected_interval: timedelta,
    daily: bool = False,
    requires_exact_interval: bool = False,
) -> tuple[tuple[DetectionCandidate, ...], ...]:
    if not candidates:
        return ()
    segments: list[list[DetectionCandidate]] = [[candidates[0]]]
    for candidate in candidates[1:]:
        previous = segments[-1][-1]
        crosses_day = daily and candidate.timestamp.date() != previous.timestamp.date()
        interval = candidate.timestamp - previous.timestamp
        interval_matches = (
            interval == expected_interval
            if requires_exact_interval
            else interval <= maximum_gap
        )
        if not crosses_day and interval_matches:
            segments[-1].append(candidate)
        else:
            segments.append([candidate])
    return tuple(tuple(segment) for segment in segments)
