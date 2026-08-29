from __future__ import annotations

import hashlib
import os
import shutil
import tempfile
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from threading import RLock
from typing import Any, Callable
from uuid import uuid4

from h2_analytics.ingestion.csv_loader import CsvImportError, DatasetLoader, _validate_filename
from h2_analytics.models import ImportedDataset
from h2_analytics.settings import (
    MAX_ACTIVE_STREAMING_CSV_SESSIONS,
    MAX_RETAINED_STREAMING_CSV_SESSIONS,
    MAX_STREAMING_CSV_BYTES,
    STREAMING_CSV_CHUNK_BYTES,
    STREAMING_CSV_SESSION_TTL_SECONDS,
)

_SHA256_PREFIX = "sha256:"


@dataclass(slots=True)
class _UploadSession:
    session_id: str
    filename: str
    declared_bytes: int
    expected_hash: str | None
    path: Path
    created_at: datetime
    expires_at: datetime
    status: str = "open"
    received_bytes: int = 0
    next_chunk_index: int = 0
    chunks: dict[int, tuple[int, int, str]] = field(default_factory=dict)
    finalize_request: tuple[Any, ...] | None = None
    finalize_receipt: dict[str, Any] | None = None
    finalized_dataset: ImportedDataset | None = None


class CsvUploadSessionManager:
    """Own ordered local uploads and make every mutation idempotent and bounded."""

    def __init__(
        self,
        *,
        loader: DatasetLoader | None = None,
        clock: Callable[[], datetime] | None = None,
        root: Path | None = None,
        ttl_seconds: int = STREAMING_CSV_SESSION_TTL_SECONDS,
        max_active_sessions: int = MAX_ACTIVE_STREAMING_CSV_SESSIONS,
        max_retained_sessions: int = MAX_RETAINED_STREAMING_CSV_SESSIONS,
    ) -> None:
        self._loader = loader or DatasetLoader()
        self._clock = clock or (lambda: datetime.now(UTC))
        self._ttl = timedelta(seconds=ttl_seconds)
        self._max_active_sessions = max_active_sessions
        self._max_retained_sessions = max_retained_sessions
        self._root = root or Path(tempfile.mkdtemp(prefix="h2-sentinel-upload-"))
        self._root.mkdir(mode=0o700, parents=True, exist_ok=True)
        try:
            os.chmod(self._root, 0o700)
        except OSError:
            pass
        self._sessions: dict[str, _UploadSession] = {}
        self._create_requests: dict[str, tuple[tuple[Any, ...], str]] = {}
        self._chunk_requests: dict[str, tuple[tuple[Any, ...], dict[str, Any]]] = {}
        self._finalize_requests: dict[str, tuple[Any, ...]] = {}
        self._lock = RLock()

    def create(
        self,
        *,
        request_id: str,
        filename: str,
        declared_bytes: int,
        expected_content_hash: str | None,
    ) -> dict[str, Any]:
        safe_filename = _validate_filename(filename)
        _validate_request_id(request_id)
        if declared_bytes < 1 or declared_bytes > MAX_STREAMING_CSV_BYTES:
            raise CsvImportError(
                "upload.invalid_size",
                f"Declared size must be between 1 and {MAX_STREAMING_CSV_BYTES} bytes.",
            )
        expected_hash = (
            _normalize_hash(expected_content_hash)
            if expected_content_hash is not None
            else None
        )
        canonical = (safe_filename, declared_bytes, expected_hash)
        with self._lock:
            self.cleanup_expired()
            prior = self._create_requests.get(request_id)
            if prior is not None:
                prior_request, session_id = prior
                if prior_request != canonical:
                    raise CsvImportError(
                        "upload.idempotency_conflict",
                        "The requestId is already bound to a different upload request.",
                    )
                return self._public_session(self._sessions[session_id])

            active_sessions = sum(
                session.status == "open" for session in self._sessions.values()
            )
            if active_sessions >= self._max_active_sessions:
                raise CsvImportError(
                    "upload.active_session_limit",
                    "The active upload session limit has been reached.",
                )
            if len(self._sessions) >= self._max_retained_sessions:
                raise CsvImportError(
                    "upload.retained_session_limit",
                    "The retained upload session limit has been reached.",
                )

            now = _utc(self._clock())
            session_id = f"upload-{uuid4().hex}"
            path = self._root / f"{session_id}.part"
            with path.open("xb"):
                pass
            try:
                os.chmod(path, 0o600)
            except OSError:
                pass
            session = _UploadSession(
                session_id=session_id,
                filename=safe_filename,
                declared_bytes=declared_bytes,
                expected_hash=expected_hash,
                path=path,
                created_at=now,
                expires_at=now + self._ttl,
            )
            self._sessions[session_id] = session
            self._create_requests[request_id] = (canonical, session_id)
            return self._public_session(session)

    def append_chunk(
        self,
        *,
        request_id: str,
        session_id: str,
        chunk_index: int,
        offset_bytes: int,
        byte_length: int,
        content_hash: str,
        content: bytes,
    ) -> dict[str, Any]:
        _validate_request_id(request_id)
        normalized_hash = _normalize_hash(content_hash)
        actual_hash = f"sha256:{hashlib.sha256(content).hexdigest()}"
        canonical = (
            session_id,
            chunk_index,
            offset_bytes,
            byte_length,
            normalized_hash,
        )
        with self._lock:
            self.cleanup_expired()
            session = self._open_session(session_id)
            prior_request = self._chunk_requests.get(request_id)
            if prior_request is not None:
                prior_canonical, prior_receipt = prior_request
                if prior_canonical != canonical or actual_hash != normalized_hash:
                    raise CsvImportError(
                        "upload.idempotency_conflict",
                        "The requestId is already bound to different chunk bytes or metadata.",
                    )
                replay = deepcopy(prior_receipt)
                replay["replayed"] = True
                return replay

            if byte_length != len(content) or byte_length < 1:
                raise CsvImportError(
                    "upload.length_mismatch", "Chunk byteLength does not match its body."
                )
            if byte_length > STREAMING_CSV_CHUNK_BYTES:
                raise CsvImportError(
                    "upload.chunk_too_large",
                    f"Chunk exceeds the {STREAMING_CSV_CHUNK_BYTES}-byte limit.",
                )
            if actual_hash != normalized_hash:
                raise CsvImportError(
                    "upload.hash_mismatch", "Chunk SHA-256 does not match its body."
                )
            if chunk_index < session.next_chunk_index:
                accepted = session.chunks.get(chunk_index)
                if accepted != (offset_bytes, byte_length, normalized_hash):
                    raise CsvImportError(
                        "upload.retry_mismatch",
                        "A prior chunk may only be retried with byte-identical content and metadata.",
                    )
                receipt = self._chunk_receipt(session, chunk_index, replayed=True)
                self._chunk_requests[request_id] = (canonical, deepcopy(receipt))
                return receipt
            if chunk_index != session.next_chunk_index:
                raise CsvImportError(
                    "upload.chunk_out_of_order", "Only the next ordered chunk is accepted."
                )
            if offset_bytes != session.received_bytes:
                raise CsvImportError(
                    "upload.offset_mismatch", "Chunk offset must equal receivedBytes."
                )
            if session.received_bytes + byte_length > session.declared_bytes:
                raise CsvImportError(
                    "upload.length_mismatch", "Chunk exceeds the declared upload size."
                )

            with session.path.open("ab") as stream:
                stream.write(content)
                stream.flush()
            session.chunks[chunk_index] = (
                offset_bytes,
                byte_length,
                normalized_hash,
            )
            session.received_bytes += byte_length
            session.next_chunk_index += 1
            receipt = self._chunk_receipt(session, chunk_index, replayed=False)
            self._chunk_requests[request_id] = (canonical, deepcopy(receipt))
            return receipt

    def finalize(
        self,
        *,
        request_id: str,
        session_id: str,
        total_chunks: int,
        total_bytes: int,
        content_hash: str,
    ) -> tuple[dict[str, Any], ImportedDataset]:
        _validate_request_id(request_id)
        normalized_hash = _normalize_hash(content_hash)
        canonical = (session_id, total_chunks, total_bytes, normalized_hash)
        with self._lock:
            self.cleanup_expired()
            prior_finalize = self._finalize_requests.get(request_id)
            if prior_finalize is not None and prior_finalize != canonical:
                raise CsvImportError(
                    "upload.idempotency_conflict",
                    "The requestId is already bound to a different finalize request.",
                )
            session = self._session(session_id)
            if session.status == "finalized":
                if session.finalize_request != canonical or session.finalize_receipt is None:
                    raise CsvImportError(
                        "upload.finalize_conflict",
                        "A finalized session cannot accept a different finalize request.",
                    )
                receipt = deepcopy(session.finalize_receipt)
                receipt["replayed"] = True
                assert session.finalized_dataset is not None
                return receipt, session.finalized_dataset
            self._ensure_not_expired(session)
            if total_bytes != session.declared_bytes or total_bytes != session.received_bytes:
                raise CsvImportError(
                    "upload.length_mismatch", "Final byte totals do not agree."
                )
            if total_chunks != session.next_chunk_index or total_chunks < 1:
                raise CsvImportError(
                    "upload.chunk_count_mismatch", "Final chunk totals do not agree."
                )
            actual_hash = _file_hash(session.path)
            if normalized_hash != actual_hash or (
                session.expected_hash is not None
                and session.expected_hash != actual_hash
            ):
                raise CsvImportError(
                    "upload.hash_mismatch", "Final SHA-256 values do not agree."
                )

            imported = self._loader.import_csv_file(
                filename=session.filename, path=session.path
            )
            session.status = "finalized"
            session.expires_at = _utc(self._clock()) + self._ttl
            session.finalize_request = canonical
            finalized_receipt: dict[str, Any] = {
                "schemaVersion": 1,
                "sessionId": session.session_id,
                "status": "finalized",
                "totalChunks": total_chunks,
                "totalBytes": total_bytes,
                "contentHash": actual_hash,
                "replayed": False,
            }
            session.finalize_receipt = deepcopy(finalized_receipt)
            session.finalized_dataset = imported
            self._finalize_requests[request_id] = canonical
            session.path.unlink(missing_ok=True)
            return deepcopy(finalized_receipt), imported

    def cleanup_expired(self) -> int:
        now = _utc(self._clock())
        with self._lock:
            expired_ids = {
                session_id
                for session_id, session in self._sessions.items()
                if now >= session.expires_at
            }
            for session_id in expired_ids:
                self._sessions.pop(session_id).path.unlink(missing_ok=True)
            self._create_requests = {
                request_id: binding
                for request_id, binding in self._create_requests.items()
                if binding[1] not in expired_ids
            }
            self._chunk_requests = {
                request_id: binding
                for request_id, binding in self._chunk_requests.items()
                if binding[0][0] not in expired_ids
            }
            self._finalize_requests = {
                request_id: request
                for request_id, request in self._finalize_requests.items()
                if request[0] not in expired_ids
            }
            return len(expired_ids)

    def close(self) -> None:
        with self._lock:
            shutil.rmtree(self._root, ignore_errors=True)
            self._sessions.clear()
            self._create_requests.clear()
            self._chunk_requests.clear()
            self._finalize_requests.clear()

    def _session(self, session_id: str) -> _UploadSession:
        try:
            return self._sessions[session_id]
        except KeyError as error:
            raise CsvImportError(
                "upload.session_not_found", "Upload session was not found."
            ) from error

    def _open_session(self, session_id: str) -> _UploadSession:
        session = self._session(session_id)
        self._ensure_not_expired(session)
        if session.status != "open":
            raise CsvImportError(
                "upload.session_finalized", "Upload session is already finalized."
            )
        return session

    def _ensure_not_expired(self, session: _UploadSession) -> None:
        if session.status == "expired" or _utc(self._clock()) >= session.expires_at:
            session.status = "expired"
            session.path.unlink(missing_ok=True)
            raise CsvImportError("upload.session_expired", "Upload session has expired.")

    @staticmethod
    def _public_session(session: _UploadSession) -> dict[str, Any]:
        return {
            "schemaVersion": 1,
            "sessionId": session.session_id,
            "filename": session.filename,
            "status": session.status,
            "declaredBytes": session.declared_bytes,
            "receivedBytes": session.received_bytes,
            "nextChunkIndex": session.next_chunk_index,
            "expiresAt": _timestamp(session.expires_at),
        }

    @staticmethod
    def _chunk_receipt(
        session: _UploadSession, chunk_index: int, *, replayed: bool
    ) -> dict[str, Any]:
        return {
            "schemaVersion": 1,
            "sessionId": session.session_id,
            "acceptedChunkIndex": chunk_index,
            "receivedBytes": session.received_bytes,
            "nextChunkIndex": session.next_chunk_index,
            "replayed": replayed,
        }


def _validate_request_id(request_id: str) -> None:
    if not request_id or len(request_id) > 128:
        raise CsvImportError(
            "upload.invalid_request_id", "requestId must contain 1 to 128 characters."
        )


def _normalize_hash(value: str) -> str:
    normalized = value.casefold()
    digest = normalized.removeprefix(_SHA256_PREFIX)
    if len(digest) != 64 or any(character not in "0123456789abcdef" for character in digest):
        raise CsvImportError(
            "upload.invalid_hash", "contentHash must be a SHA-256 value."
        )
    return f"sha256:{digest}"


def _file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return f"sha256:{digest.hexdigest()}"


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _timestamp(value: datetime) -> str:
    return _utc(value).isoformat(timespec="seconds").replace("+00:00", "Z")
