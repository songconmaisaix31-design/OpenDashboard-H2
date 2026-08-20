from __future__ import annotations

import pytest

from h2_analytics.contracts import FIXTURE_FINGERPRINT
from h2_analytics.ingestion import CsvImportError, DatasetLoader


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
            text='timestamp,pcc_power_kw\n"unterminated,1',
        )


def test_timestamp_offsets_are_normalized_to_utc(valid_csv: str) -> None:
    offset_csv = valid_csv.replace(
        "2026-01-05T10:20:00Z", "2026-01-05T18:20:00+08:00", 1
    )
    result = DatasetLoader().import_csv(filename="offset.csv", text=offset_csv)

    assert result.rows[0].timestamp_text == "2026-01-05T10:20:00Z"
    assert result.manifest["timeRange"]["startTime"] == "2026-01-05T10:20:00Z"
