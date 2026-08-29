from __future__ import annotations

import hashlib
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from h2_analytics.api import create_app
from h2_analytics.errors import AnalyticsError
from h2_analytics.ingestion import CsvImportError, CsvUploadSessionManager
from h2_analytics.service import AnalyticsService


def _hash(content: bytes) -> str:
    return f"sha256:{hashlib.sha256(content).hexdigest()}"


def _create(
    manager: CsvUploadSessionManager, content: bytes, *, request_id: str = "create-1"
) -> dict:
    return manager.create(
        request_id=request_id,
        filename="train.csv",
        declared_bytes=len(content),
        expected_content_hash=_hash(content),
    )


def _append(
    manager: CsvUploadSessionManager,
    session_id: str,
    content: bytes,
    *,
    request_id: str = "chunk-1",
    chunk_index: int = 0,
    offset_bytes: int = 0,
) -> dict:
    return manager.append_chunk(
        request_id=request_id,
        session_id=session_id,
        chunk_index=chunk_index,
        offset_bytes=offset_bytes,
        byte_length=len(content),
        content_hash=_hash(content),
        content=content,
    )


def test_streaming_setting_is_disabled_by_default(valid_csv: str) -> None:
    service = AnalyticsService()
    with pytest.raises(AnalyticsError) as captured:
        service.create_csv_upload_session(
            request_id="disabled-1",
            filename="train.csv",
            declared_bytes=len(valid_csv.encode()),
            expected_content_hash=None,
        )
    assert captured.value.code == "upload.disabled"


def test_ordered_upload_finalizes_into_existing_workflow(
    valid_csv: str, tmp_path
) -> None:
    content = valid_csv.encode()
    manager = CsvUploadSessionManager(root=tmp_path / "uploads")
    service = AnalyticsService(
        streaming_import_enabled=True, upload_manager=manager
    )
    session = service.create_csv_upload_session(
        request_id="create-1",
        filename="train.csv",
        declared_bytes=len(content),
        expected_content_hash=_hash(content),
    )
    midpoint = len(content) // 2
    chunks = (content[:midpoint], content[midpoint:])
    offset = 0
    for index, chunk in enumerate(chunks):
        receipt = service.upload_csv_chunk(
            request_id=f"chunk-{index}",
            session_id=session["sessionId"],
            chunk_index=index,
            offset_bytes=offset,
            byte_length=len(chunk),
            content_hash=_hash(chunk),
            content=chunk,
        )
        assert receipt["nextChunkIndex"] == index + 1
        offset += len(chunk)
    finalized = service.finalize_csv_upload(
        request_id="finalize-1",
        session_id=session["sessionId"],
        total_chunks=2,
        total_bytes=len(content),
        content_hash=_hash(content),
    )
    assert finalized["result"]["dataset"]["rowCount"] == 22
    assert finalized["result"]["dataset"]["sourceFilename"] == "train.csv"
    dataset_id = finalized["result"]["dataset"]["datasetId"]
    assert service.run_analysis(dataset_id)["status"] == "completed"

    replay = service.finalize_csv_upload(
        request_id="finalize-1",
        session_id=session["sessionId"],
        total_chunks=2,
        total_bytes=len(content),
        content_hash=_hash(content),
    )
    assert replay["replayed"] is True
    assert replay["result"] == finalized["result"]


def test_create_and_chunk_retries_are_immutable(valid_csv: str, tmp_path) -> None:
    content = valid_csv.encode()
    manager = CsvUploadSessionManager(root=tmp_path / "uploads")
    session = _create(manager, content)
    assert _create(manager, content)["sessionId"] == session["sessionId"]
    with pytest.raises(CsvImportError) as create_error:
        manager.create(
            request_id="create-1",
            filename="other.csv",
            declared_bytes=len(content),
            expected_content_hash=_hash(content),
        )
    assert create_error.value.code == "upload.idempotency_conflict"

    first = _append(manager, session["sessionId"], content)
    replay = _append(manager, session["sessionId"], content)
    assert first["replayed"] is False
    assert replay["replayed"] is True
    changed = content + b"\n"
    with pytest.raises(CsvImportError) as retry_error:
        _append(manager, session["sessionId"], changed)
    assert retry_error.value.code == "upload.idempotency_conflict"


@pytest.mark.parametrize(
    ("mutation", "expected_code"),
    [
        ({"chunk_index": 1}, "upload.chunk_out_of_order"),
        ({"offset_bytes": 1}, "upload.offset_mismatch"),
    ],
)
def test_chunk_order_and_offset_fail_closed(
    valid_csv: str, tmp_path, mutation: dict, expected_code: str
) -> None:
    content = valid_csv.encode()
    manager = CsvUploadSessionManager(root=tmp_path / expected_code)
    session = _create(manager, content)
    with pytest.raises(CsvImportError) as captured:
        _append(manager, session["sessionId"], content, **mutation)
    assert captured.value.code == expected_code


def test_hash_length_and_final_totals_fail_closed(valid_csv: str, tmp_path) -> None:
    content = valid_csv.encode()
    manager = CsvUploadSessionManager(root=tmp_path / "uploads")
    session = _create(manager, content)
    with pytest.raises(CsvImportError) as chunk_hash:
        manager.append_chunk(
            request_id="bad-hash",
            session_id=session["sessionId"],
            chunk_index=0,
            offset_bytes=0,
            byte_length=len(content),
            content_hash="sha256:" + "0" * 64,
            content=content,
        )
    assert chunk_hash.value.code == "upload.hash_mismatch"
    _append(manager, session["sessionId"], content)
    with pytest.raises(CsvImportError) as final_length:
        manager.finalize(
            request_id="final-bad-length",
            session_id=session["sessionId"],
            total_chunks=1,
            total_bytes=len(content) - 1,
            content_hash=_hash(content),
        )
    assert final_length.value.code == "upload.length_mismatch"
    with pytest.raises(CsvImportError) as final_hash:
        manager.finalize(
            request_id="final-bad-hash",
            session_id=session["sessionId"],
            total_chunks=1,
            total_bytes=len(content),
            content_hash="sha256:" + "f" * 64,
        )
    assert final_hash.value.code == "upload.hash_mismatch"


def test_expiry_removes_private_partial_file(valid_csv: str, tmp_path) -> None:
    now = datetime(2026, 8, 29, tzinfo=UTC)
    current = [now]
    root = tmp_path / "uploads"
    manager = CsvUploadSessionManager(
        root=root, clock=lambda: current[0], ttl_seconds=5
    )
    content = valid_csv.encode()
    session = _create(manager, content)
    assert list(root.glob("*.part"))
    current[0] += timedelta(seconds=6)
    assert manager.cleanup_expired() == 1
    assert not list(root.glob("*.part"))
    with pytest.raises(CsvImportError) as captured:
        _append(manager, session["sessionId"], content)
    assert captured.value.code == "upload.session_not_found"


def test_upload_session_limits_bound_active_and_retained_sessions(
    valid_csv: str, tmp_path
) -> None:
    content = valid_csv.encode()
    active_manager = CsvUploadSessionManager(
        root=tmp_path / "active", max_active_sessions=1
    )
    _create(active_manager, content)
    with pytest.raises(CsvImportError) as active_error:
        _create(active_manager, content, request_id="create-2")
    assert active_error.value.code == "upload.active_session_limit"

    retained_manager = CsvUploadSessionManager(
        root=tmp_path / "retained",
        max_active_sessions=2,
        max_retained_sessions=1,
    )
    session = _create(retained_manager, content)
    _append(retained_manager, session["sessionId"], content)
    retained_manager.finalize(
        request_id="finalize-1",
        session_id=session["sessionId"],
        total_chunks=1,
        total_bytes=len(content),
        content_hash=_hash(content),
    )
    with pytest.raises(CsvImportError) as retained_error:
        _create(retained_manager, content, request_id="create-2")
    assert retained_error.value.code == "upload.retained_session_limit"


def test_expiry_purges_session_and_idempotency_mappings(valid_csv: str, tmp_path) -> None:
    current = [datetime(2026, 8, 29, tzinfo=UTC)]
    manager = CsvUploadSessionManager(
        root=tmp_path / "uploads", clock=lambda: current[0], ttl_seconds=5
    )
    content = valid_csv.encode()
    session = _create(manager, content)
    _append(manager, session["sessionId"], content)
    manager.finalize(
        request_id="finalize-1",
        session_id=session["sessionId"],
        total_chunks=1,
        total_bytes=len(content),
        content_hash=_hash(content),
    )

    current[0] += timedelta(seconds=6)
    assert manager.cleanup_expired() == 1
    replacement = manager.create(
        request_id="create-1",
        filename="replacement.csv",
        declared_bytes=len(content),
        expected_content_hash=_hash(content),
    )
    _append(manager, replacement["sessionId"], content, request_id="chunk-1")
    receipt, _dataset = manager.finalize(
        request_id="finalize-1",
        session_id=replacement["sessionId"],
        total_chunks=1,
        total_bytes=len(content),
        content_hash=_hash(content),
    )
    assert receipt["replayed"] is False


def test_app_shutdown_closes_upload_resources(valid_csv: str, tmp_path) -> None:
    root = tmp_path / "uploads"
    manager = CsvUploadSessionManager(root=root)
    service = AnalyticsService(streaming_import_enabled=True, upload_manager=manager)
    content = valid_csv.encode()
    with TestClient(create_app(service), base_url="http://127.0.0.1") as client:
        response = client.post(
            "/api/v1/h2-sentinel/ingest/sessions",
            json={
                "schemaVersion": 1,
                "requestId": "create-shutdown",
                "filename": "train.csv",
                "declaredBytes": len(content),
                "expectedContentHash": _hash(content),
            },
        )
        assert response.status_code == 200
        assert root.exists()
        assert list(root.glob("*.part"))
    assert not root.exists()


def test_racing_first_chunks_cannot_corrupt_session(valid_csv: str, tmp_path) -> None:
    content = valid_csv.encode()
    changed = b"x" * len(content)
    manager = CsvUploadSessionManager(root=tmp_path / "uploads")
    session = _create(manager, content)

    def upload(request_id: str, body: bytes) -> str:
        try:
            _append(
                manager,
                session["sessionId"],
                body,
                request_id=request_id,
            )
        except CsvImportError as error:
            return error.code
        return "accepted"

    with ThreadPoolExecutor(max_workers=2) as executor:
        outcomes = set(
            executor.map(upload, ("race-a", "race-b"), (content, changed))
        )
    assert "accepted" in outcomes
    assert len(outcomes) == 2
    assert outcomes.intersection({"upload.retry_mismatch", "upload.length_mismatch"})


def test_streaming_path_rejects_label_columns_before_analysis(tmp_path) -> None:
    content = b"timestamp,event_id\n2026-01-05T10:20:00Z,E1\n"
    manager = CsvUploadSessionManager(root=tmp_path / "uploads")
    session = _create(manager, content)
    _append(manager, session["sessionId"], content)
    with pytest.raises(CsvImportError) as captured:
        manager.finalize(
            request_id="final-label",
            session_id=session["sessionId"],
            total_chunks=1,
            total_bytes=len(content),
            content_hash=_hash(content),
        )
    assert captured.value.code == "import.label_columns_forbidden"
