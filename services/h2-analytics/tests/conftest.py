from __future__ import annotations

from pathlib import Path

import pytest


@pytest.fixture(scope="session")
def repository_root() -> Path:
    return Path(__file__).resolve().parents[3]


@pytest.fixture(scope="session")
def valid_csv(repository_root: Path) -> str:
    return (
        repository_root / "packages/h2-contracts/fixtures/tiny-valid-timeseries.csv"
    ).read_text(encoding="utf-8")

@pytest.fixture(scope="session")
def invalid_csv(repository_root: Path) -> str:
    return (
        repository_root / "packages/h2-contracts/fixtures/tiny-invalid-timeseries.csv"
    ).read_text(encoding="utf-8")
