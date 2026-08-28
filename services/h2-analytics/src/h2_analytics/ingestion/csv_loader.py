from __future__ import annotations

import csv
import hashlib
import io
import re
import statistics
import unicodedata
from collections import Counter
from datetime import UTC, datetime
from typing import Any

from h2_analytics import vocabulary
from h2_analytics.contracts import (
    FIXTURE_FINGERPRINT,
    FIXTURE_GENERATED_AT,
    NUMERIC_FIELDS,
    REQUIRED_FIELDS,
    build_provenance,
)
from h2_analytics.models import DataRow, ImportedDataset, ParseDiagnostics
from h2_analytics.quality.checker import QualityChecker
from h2_analytics.settings import MAX_CSV_BYTES, MAX_CSV_ROWS

_ELZ_POWER_FIELDS = (
    "elz1_power_actual_kw",
    "elz2_power_actual_kw",
    "elz3_power_actual_kw",
)

# Public label files are evaluation artifacts, never detector inputs. Reject
# their identifying columns before any row is parsed into the runtime model.
FORBIDDEN_LABEL_FIELDS = frozenset(
    {
        "is_anomaly",
        "event_id",
        "pred_event_id",
        "eventid",
        "label_event_id",
        "anomaly_code",
        "event_code",
        "code",
        "anomaly_subtype",
        "anomaly_name",
        "severity",
        "confidence",
        "start_time",
        "starttime",
        "event_start_time",
        "end_time",
        "endtime",
        "event_end_time",
        "ground_truth",
        "ground_truth_label",
        "event_label",
        "primary_control_object",
        "affected_equipment",
        "root_cause",
        "recommended_action",
        "evidence_json",
        "primary_impact_metric",
        "primary_impact_metric_cn",
        "estimated_impact_value",
        "first_detection_time",
        "requires_human_confirmation",
        "detection_expectation",
        "事件id",
        "事件编号",
        "异常事件id",
        "异常编码",
        "异常类别",
        "异常类型",
        "开始时间",
        "事件开始时间",
        "结束时间",
        "事件结束时间",
    }
)
_CAMEL_CASE_BOUNDARY = re.compile(r"(?<=[a-z0-9])(?=[A-Z])")
_HEADER_SEPARATORS = re.compile(r"[\s./-]+")


class CsvImportError(ValueError):
    def __init__(self, code: str, message: str, details: tuple[str, ...] = ()) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details


class DatasetLoader:
    def __init__(self, quality_checker: QualityChecker | None = None) -> None:
        self._quality_checker = quality_checker or QualityChecker()

    def import_csv(self, *, filename: str, text: str) -> ImportedDataset:
        safe_filename = _validate_filename(filename)
        if "\x00" in text:
            raise CsvImportError("import.invalid_text", "CSV contains a NUL byte.")
        encoded = text.encode("utf-8")
        if len(encoded) > MAX_CSV_BYTES:
            raise CsvImportError(
                "import.too_large",
                f"CSV exceeds the {MAX_CSV_BYTES}-byte in-memory import limit.",
            )
        fingerprint = f"sha256:{hashlib.sha256(encoded).hexdigest()}"
        # The parser consumes the caller-owned text. Do not retain a second
        # full-size byte buffer while materializing the bounded row model.
        del encoded
        mode = "FIXTURE" if fingerprint == FIXTURE_FINGERPRINT else "LIVE_ANALYSIS"
        reader = csv.reader(io.StringIO(text, newline=""), strict=True)
        try:
            header_cells = next(reader)
        except StopIteration:
            raise CsvImportError("import.empty", "CSV must include a header row.")
        except csv.Error as error:
            raise CsvImportError("import.malformed_csv", "CSV syntax is malformed.") from error

        headers = tuple(cell.strip() for cell in header_cells)
        if not headers or any(not header for header in headers):
            raise CsvImportError("import.invalid_header", "CSV header names must be non-empty.")
        duplicates = sorted(name for name, count in Counter(headers).items() if count > 1)
        if duplicates:
            raise CsvImportError(
                "import.duplicate_header",
                "CSV header names must be unique.",
                tuple(duplicates),
            )

        forbidden_fields = tuple(
            sorted(header for header in headers if _is_forbidden_label_header(header))
        )
        if forbidden_fields:
            raise CsvImportError(
                "import.label_columns_forbidden",
                "Public label columns cannot be imported into the detector.",
                forbidden_fields,
            )

        missing_fields = tuple(name for name in REQUIRED_FIELDS if name not in headers)
        try:
            parsed_rows, parse_counts = _parse_rows(headers, reader)
        except csv.Error as error:
            raise CsvImportError("import.malformed_csv", "CSV syntax is malformed.") from error
        timestamps = [row.timestamp for row in parsed_rows if row.timestamp is not None]
        interval_minutes = _sampling_interval_minutes(timestamps)
        start_time, end_time = _time_range(timestamps)
        generated_at = FIXTURE_GENERATED_AT if mode == "FIXTURE" else end_time
        provenance = build_provenance(
            mode=mode,
            generated_at=generated_at,
            fingerprint=fingerprint,
        )
        dataset_id = (
            "fixture-h2-sentinel-golden"
            if mode == "FIXTURE"
            else f"live-h2-{fingerprint.removeprefix('sha256:')[:16]}"
        )
        manifest: dict[str, Any] = {
            "schemaVersion": 1,
            "datasetId": dataset_id,
            "name": (
                "H2 Sentinel sanitized golden fixture"
                if mode == "FIXTURE"
                else f"H2 Sentinel import: {safe_filename}"
            ),
            "mode": mode,
            "sourceFilename": safe_filename,
            "fingerprint": fingerprint,
            "rowCount": len(parsed_rows),
            "timeRange": {"startTime": start_time, "endTime": end_time},
            "samplingIntervalMinutes": interval_minutes,
            "fields": [vocabulary.field_descriptor(name) for name in headers],
            "provenance": provenance,
        }
        diagnostics = _build_diagnostics(
            parsed_rows,
            missing_fields=missing_fields,
            parse_counts=parse_counts,
            expected_interval_minutes=interval_minutes,
        )
        quality = self._quality_checker.evaluate(
            manifest=manifest,
            diagnostics=diagnostics,
            generated_at=generated_at,
        )
        return ImportedDataset(manifest, quality, tuple(parsed_rows))


def _validate_filename(filename: str) -> str:
    candidate = filename.strip()
    if (
        not candidate
        or len(candidate) > 128
        or candidate in {".", ".."}
        or "/" in candidate
        or "\\" in candidate
        or "\x00" in candidate
    ):
        raise CsvImportError(
            "import.invalid_filename",
            "Filename must be a plain CSV basename without path segments.",
        )
    if not candidate.lower().endswith(".csv"):
        raise CsvImportError("import.invalid_extension", "Only .csv imports are accepted.")
    return candidate


def _normalize_header(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value.strip())
    normalized = _CAMEL_CASE_BOUNDARY.sub("_", normalized)
    return _HEADER_SEPARATORS.sub("_", normalized.casefold())


def _is_forbidden_label_header(header: str) -> bool:
    normalized = _normalize_header(header)
    return (
        normalized in FORBIDDEN_LABEL_FIELDS
        or normalized == "label"
        or normalized.startswith("label_")
        or normalized.endswith("_label")
        or normalized.startswith("ground_truth_")
    )


def _parse_rows(
    headers: tuple[str, ...],
    body: Any,
) -> tuple[list[DataRow], dict[str, Any]]:
    parsed: list[DataRow] = []
    missing_values: Counter[str] = Counter()
    invalid_numeric_values: Counter[str] = Counter()
    invalid_timestamps = 0
    malformed_rows = 0
    for index, cells in enumerate(body, start=1):
        if not any(cell.strip() for cell in cells):
            continue
        if len(parsed) >= MAX_CSV_ROWS:
            raise CsvImportError(
                "import.too_many_rows",
                f"CSV exceeds the {MAX_CSV_ROWS}-row in-memory import limit.",
            )
        if len(cells) != len(headers):
            malformed_rows += 1
        record = {
            header: (cells[position].strip() if position < len(cells) else "")
            for position, header in enumerate(headers)
        }
        timestamp_text = record.get("timestamp", "")
        timestamp = _parse_timestamp(timestamp_text)
        if "timestamp" in headers and not timestamp_text:
            missing_values["timestamp"] += 1
        elif "timestamp" in headers and timestamp is None:
            invalid_timestamps += 1

        values: dict[str, float | None] = {}
        for field in headers:
            if field == "timestamp":
                continue
            raw = record[field]
            if not raw:
                if field in REQUIRED_FIELDS:
                    missing_values[field] += 1
                values[field] = None
                continue
            try:
                values[field] = float(raw)
            except ValueError:
                if field in NUMERIC_FIELDS:
                    invalid_numeric_values[field] += 1
                values[field] = None
        normalized_timestamp = _format_timestamp(timestamp) if timestamp is not None else timestamp_text
        parsed.append(DataRow(index, timestamp, normalized_timestamp, values))
    return parsed, {
        "missing_values": dict(missing_values),
        "invalid_numeric_values": dict(invalid_numeric_values),
        "invalid_timestamps": invalid_timestamps,
        "malformed_rows": malformed_rows,
    }


def _parse_timestamp(value: str) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _format_timestamp(value: datetime) -> str:
    return value.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def _time_range(timestamps: list[datetime]) -> tuple[str, str]:
    if not timestamps:
        return "1970-01-01T00:00:00Z", "1970-01-01T00:00:00Z"
    return _format_timestamp(min(timestamps)), _format_timestamp(max(timestamps))


def _sampling_interval_minutes(timestamps: list[datetime]) -> float:
    ordered = sorted(set(timestamps))
    intervals = [
        (current - previous).total_seconds() / 60
        for previous, current in zip(ordered, ordered[1:], strict=False)
        if current > previous
    ]
    return float(statistics.median(intervals)) if intervals else 1.0


def _build_diagnostics(
    rows: list[DataRow],
    *,
    missing_fields: tuple[str, ...],
    parse_counts: dict[str, Any],
    expected_interval_minutes: float,
) -> ParseDiagnostics:
    valid_timestamps = [row.timestamp for row in rows if row.timestamp is not None]
    duplicate_count = len(valid_timestamps) - len(set(valid_timestamps))
    out_of_order = sum(
        current < previous
        for previous, current in zip(valid_timestamps, valid_timestamps[1:], strict=False)
    )
    irregular = sum(
        abs((current - previous).total_seconds() / 60 - expected_interval_minutes)
        > 1e-9
        for previous, current in zip(valid_timestamps, valid_timestamps[1:], strict=False)
        if current > previous
    )
    invalid_ranges: Counter[str] = Counter()
    residuals: list[float] = []
    for row in rows:
        soc = row.value("bess_soc_pct")
        if soc is not None and not 0 <= soc <= 100:
            invalid_ranges["bess_soc_pct"] += 1
        for field in ("grid_export_power_limit_kw", "grid_import_power_limit_kw"):
            value = row.value(field)
            if value is not None and value < 0:
                invalid_ranges[field] += 1
        residual = _power_balance_residual_kw(row)
        if residual is not None:
            residuals.append(residual)
    invalid_timestamps = int(parse_counts["invalid_timestamps"])
    if parse_counts["malformed_rows"]:
        invalid_timestamps += int(parse_counts["malformed_rows"])
    return ParseDiagnostics(
        missing_fields=missing_fields,
        missing_values=parse_counts["missing_values"],
        invalid_numeric_values=parse_counts["invalid_numeric_values"],
        invalid_timestamps=invalid_timestamps,
        duplicate_timestamps=duplicate_count,
        out_of_order_timestamps=out_of_order,
        irregular_intervals=irregular,
        invalid_ranges=dict(invalid_ranges),
        maximum_power_balance_residual_kw=max(residuals) if residuals else None,
    )


def _power_balance_residual_kw(row: DataRow) -> float | None:
    pv = row.value("pv_actual_kw")
    bess = row.value("bess_power_actual_kw")
    pcc = row.value("pcc_power_actual_kw")
    aux = row.value("aux_load_kw")
    elz_values = [row.value(field) for field in _ELZ_POWER_FIELDS]
    if any(value is None for value in (pv, bess, pcc, aux, *elz_values)):
        return None
    elz_total = sum(value for value in elz_values if value is not None)
    assert pv is not None
    assert bess is not None
    assert pcc is not None
    assert aux is not None
    return abs(pv + bess - pcc - elz_total - aux)
