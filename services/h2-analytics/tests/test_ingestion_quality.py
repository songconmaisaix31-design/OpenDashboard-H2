from __future__ import annotations

from itertools import repeat

import pytest

from h2_analytics.ingestion import csv_loader
from h2_analytics.contracts import FIXTURE_FINGERPRINT
from h2_analytics.ingestion import CsvImportError, DatasetLoader
from h2_analytics.settings import (
    MAX_CSV_BYTES,
    MAX_CSV_ROWS,
    OFFICIAL_DATASET_ROW_COUNTS,
    OFFICIAL_SINGLE_IMPORT_BYTES,
)


def test_valid_fixture_import_is_in_memory_and_explicitly_fixture(valid_csv: str) -> None:
    result = DatasetLoader().import_csv(
        filename="tiny-valid-timeseries.csv",
        text=valid_csv,
    )

    assert result.manifest["fingerprint"] == FIXTURE_FINGERPRINT
    assert result.manifest["mode"] == "FIXTURE"
    assert result.manifest["provenance"]["mode"] == "FIXTURE"
    assert result.manifest["rowCount"] == 22
    assert result.manifest["timeRange"] == {
        "startTime": "2026-01-05T10:20:00Z",
        "endTime": "2026-01-05T10:41:00Z",
    }
    assert len(result.manifest["fields"]) == 69
    assert result.quality["status"] == "warning"
    assert result.quality["blockingReasons"] == []


def test_invalid_fixture_returns_blocking_quality_without_raising(invalid_csv: str) -> None:
    result = DatasetLoader().import_csv(
        filename="tiny-invalid-timeseries.csv",
        text=invalid_csv,
    )

    assert result.quality["status"] == "blocked"
    codes = {
        check["code"]: check["status"] for check in result.quality["checks"]
    }
    assert codes["missing_values"] == "blocked"
    assert codes["duplicate_timestamps"] == "blocked"
    assert codes["invalid_range"] == "blocked"


@pytest.mark.parametrize(
    "filename",
    ["../data.csv", "folder/data.csv", r"folder\data.csv", "data.xlsx", ""],
)
def test_import_rejects_paths_and_non_csv_names(filename: str) -> None:
    with pytest.raises(CsvImportError):
        DatasetLoader().import_csv(filename=filename, text="timestamp\n")


def test_import_rejects_malformed_csv() -> None:
    with pytest.raises(CsvImportError, match="malformed"):
        DatasetLoader().import_csv(
            filename="broken.csv",
            text='timestamp,pcc_power_actual_kw\n"unterminated,1',
        )


def test_timestamp_offsets_are_normalized_to_utc(valid_csv: str) -> None:
    offset_csv = valid_csv.replace(
        "2026-01-05T10:20:00Z", "2026-01-05T18:20:00+08:00", 1
    )
    result = DatasetLoader().import_csv(filename="offset.csv", text=offset_csv)

    assert result.rows[0].timestamp_text == "2026-01-05T10:20:00Z"
    assert result.manifest["timeRange"]["startTime"] == "2026-01-05T10:20:00Z"


def test_official_naive_timestamps_are_treated_as_utc(valid_csv: str) -> None:
    naive_csv = valid_csv.replace(
        "2026-01-05T10:20:00Z", "2026-01-05 10:20:00", 1
    )
    result = DatasetLoader().import_csv(filename="naive.csv", text=naive_csv)

    assert result.rows[0].timestamp_text == "2026-01-05T10:20:00Z"


def test_validation_and_test_fit_single_import_while_train_requires_chunks() -> None:
    assert MAX_CSV_BYTES == 96 * 1024 * 1024
    assert MAX_CSV_ROWS == 180_000
    assert max(
        OFFICIAL_DATASET_ROW_COUNTS[split] for split in ("validation", "test")
    ) <= MAX_CSV_ROWS
    assert max(OFFICIAL_SINGLE_IMPORT_BYTES.values()) <= MAX_CSV_BYTES
    assert OFFICIAL_DATASET_ROW_COUNTS["train"] > MAX_CSV_ROWS


def test_row_and_byte_limits_reject_before_analysis(
    valid_csv: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    parsed_timestamps: list[str] = []
    parse_timestamp = csv_loader._parse_timestamp

    def recording_parse_timestamp(value: str):
        parsed_timestamps.append(value)
        return parse_timestamp(value)

    monkeypatch.setattr(csv_loader, "_parse_timestamp", recording_parse_timestamp)
    monkeypatch.setattr(csv_loader, "MAX_CSV_ROWS", 1)
    with pytest.raises(CsvImportError) as row_error:
        DatasetLoader().import_csv(filename="too-many.csv", text=valid_csv)
    assert row_error.value.code == "import.too_many_rows"
    assert parsed_timestamps == ["2026-01-05T10:20:00Z"]

    monkeypatch.setattr(csv_loader, "MAX_CSV_ROWS", MAX_CSV_ROWS)
    monkeypatch.setattr(csv_loader, "MAX_CSV_BYTES", 100)
    with pytest.raises(CsvImportError) as byte_error:
        DatasetLoader().import_csv(filename="too-large.csv", text=valid_csv)
    assert byte_error.value.code == "import.too_large"


def test_train_sized_iterator_stops_before_over_limit_rows_are_materialized(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    parsed_timestamps = 0
    retained_rows = 0

    def recording_parse_timestamp(_value: str) -> None:
        nonlocal parsed_timestamps
        parsed_timestamps += 1

    def lightweight_row(*_args: object, **_kwargs: object) -> None:
        nonlocal retained_rows
        retained_rows += 1

    monkeypatch.setattr(csv_loader, "_parse_timestamp", recording_parse_timestamp)
    monkeypatch.setattr(csv_loader, "DataRow", lightweight_row)
    accepted_rows, _counts = csv_loader._parse_rows(
        ("timestamp",),
        repeat(("2026-01-05T10:20:00Z",), MAX_CSV_ROWS),
    )
    assert len(accepted_rows) == MAX_CSV_ROWS
    assert parsed_timestamps == MAX_CSV_ROWS
    assert retained_rows == MAX_CSV_ROWS

    parsed_timestamps = 0
    retained_rows = 0

    with pytest.raises(CsvImportError) as error:
        csv_loader._parse_rows(
            ("timestamp",),
            repeat(("2026-01-05T10:20:00Z",), MAX_CSV_ROWS + 1),
        )

    assert error.value.code == "import.too_many_rows"
    assert parsed_timestamps == MAX_CSV_ROWS
    assert retained_rows == MAX_CSV_ROWS


def test_csv_byte_limit_accepts_exact_boundary_and_rejects_one_more() -> None:
    csv_loader._enforce_csv_byte_limit(MAX_CSV_BYTES)

    with pytest.raises(CsvImportError) as error:
        csv_loader._enforce_csv_byte_limit(MAX_CSV_BYTES + 1)

    assert error.value.code == "import.too_large"


@pytest.mark.parametrize(
    "label_header",
    [
        *sorted(csv_loader.FORBIDDEN_LABEL_FIELDS),
        "Event Id",
        "event-id",
        "event/id",
        "event.id",
        "eventId",
        "GROUND TRUTH LABEL",
        "label_custom",
        "custom_label",
        "ground-truth-score",
    ],
)
def test_every_public_label_alias_is_rejected_at_import(label_header: str) -> None:
    labeled_csv = f"timestamp,{label_header}\n2026-01-05T10:20:00Z,0\n"
    with pytest.raises(CsvImportError) as error:
        DatasetLoader().import_csv(filename="labeled.csv", text=labeled_csv)

    assert error.value.code == "import.label_columns_forbidden"
    assert error.value.details == (label_header,)
