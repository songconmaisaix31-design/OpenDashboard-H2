from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta

from h2_analytics.detection import DetectionCandidate
from h2_analytics.models import DataRow


@dataclass(frozen=True, slots=True)
class AggregationPolicy:
    minimum_rows: int
    confirmation_row: int
    maximum_gap_intervals: int = 1


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


POLICIES = {
    "C03": AggregationPolicy(minimum_rows=5, confirmation_row=5),
    "C04": AggregationPolicy(minimum_rows=3, confirmation_row=3),
}
DEFAULT_POLICY = AggregationPolicy(minimum_rows=3, confirmation_row=3)


class EventAggregator:
    def aggregate(
        self,
        *,
        rows: tuple[DataRow, ...],
        candidates: tuple[DetectionCandidate, ...],
        sampling_interval_minutes: float,
    ) -> tuple[EventWindow, ...]:
        rows_by_index = {row.index: row for row in rows}
        grouped: dict[tuple[str, str], list[DetectionCandidate]] = defaultdict(list)
        for candidate in candidates:
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
            confirmation_index = min(policy.confirmation_row - 1, len(segment) - 1)
            confidence = sum(item.confidence for item in segment) / len(segment)
            event_id = f"{code}-{start:%Y%m%d}-{ordinal:03d}"
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
                )
            )
        return tuple(output)


def _segments(
    candidates: list[DetectionCandidate],
    *,
    maximum_gap: timedelta,
) -> tuple[tuple[DetectionCandidate, ...], ...]:
    if not candidates:
        return ()
    segments: list[list[DetectionCandidate]] = [[candidates[0]]]
    for candidate in candidates[1:]:
        previous = segments[-1][-1]
        if candidate.timestamp - previous.timestamp <= maximum_gap:
            segments[-1].append(candidate)
        else:
            segments.append([candidate])
    return tuple(tuple(segment) for segment in segments)
