from __future__ import annotations

import argparse
import csv
import io
import json
from pathlib import Path
from typing import Any

from h2_analytics.contracts import (
    ANOMALY_SUBTYPES_BY_CODE,
    PRIMARY_IMPACT_METRIC_BY_CODE,
    SUBMISSION_COLUMNS,
)
from h2_analytics.settings import MAX_CSV_BYTES


def validate_submission_text(text: str) -> dict[str, Any]:
    if "\x00" in text:
        raise ValueError("submission contains a NUL byte")
    rows = list(csv.reader(io.StringIO(text, newline=""), strict=True))
    if not rows or tuple(rows[0]) != SUBMISSION_COLUMNS:
        raise ValueError("submission header does not match the frozen column order")
    for index, cells in enumerate(rows[1:], start=2):
        if len(cells) != len(SUBMISSION_COLUMNS):
            raise ValueError(f"row {index} has an invalid column count")
        row = dict(zip(SUBMISSION_COLUMNS, cells, strict=True))
        code = row["anomaly_code"]
        if row["anomaly_subtype"] not in ANOMALY_SUBTYPES_BY_CODE.get(code, ()):
            raise ValueError(f"row {index} has an invalid code/subtype pair")
        if row["primary_impact_metric"] != PRIMARY_IMPACT_METRIC_BY_CODE.get(code):
            raise ValueError(f"row {index} has an invalid code/impact pair")
        confidence = float(row["confidence"])
        if not 0 <= confidence <= 1:
            raise ValueError(f"row {index} confidence is outside zero to one")
        float(row["estimated_impact_value"])
        if row["requires_human_confirmation"] not in {"true", "false"}:
            raise ValueError(f"row {index} has a non-canonical boolean")
        evidence = json.loads(row["evidence_json"])
        if not isinstance(evidence, list) or not evidence:
            raise ValueError(f"row {index} evidence_json must be a non-empty array")
    return {
        "status": "valid",
        "rowCount": max(len(rows) - 1, 0),
        "columns": list(SUBMISSION_COLUMNS),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate a generated H2 submission CSV.")
    parser.add_argument("csv", help="Relative path inside the current working directory")
    arguments = parser.parse_args()
    candidate = Path(arguments.csv)
    if candidate.is_absolute() or candidate.suffix.lower() != ".csv":
        parser.error("csv must be a relative .csv path")
    root = Path.cwd().resolve()
    resolved = (root / candidate).resolve()
    if not resolved.is_relative_to(root):
        parser.error("csv must remain inside the current working directory")
    if resolved.stat().st_size > MAX_CSV_BYTES:
        parser.error("csv exceeds the validation size limit")
    result = validate_submission_text(resolved.read_text(encoding="utf-8"))
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
