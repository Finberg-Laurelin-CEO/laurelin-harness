"""SQLite checkpoint ledger for idempotent generated pipelines."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


@dataclass(frozen=True)
class LedgerEntry:
    source_namespace: str
    source_id: str
    source_revision: str
    content_hash: str
    status: str
    attempts: int
    last_error: str | None
    updated_at: str


class CheckpointLedger:
    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(path)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA journal_mode=WAL")
        self.connection.execute("PRAGMA foreign_keys=ON")
        self.connection.execute(
            """
            CREATE TABLE IF NOT EXISTS pipeline_ledger (
                source_namespace TEXT NOT NULL,
                source_id TEXT NOT NULL,
                source_revision TEXT NOT NULL,
                content_hash TEXT NOT NULL,
                status TEXT NOT NULL
                    CHECK (status IN ('pending', 'succeeded', 'failed', 'deleted')),
                attempts INTEGER NOT NULL DEFAULT 0,
                last_error TEXT,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (source_namespace, source_id, source_revision)
            )
            """
        )
        self.connection.commit()

    def close(self) -> None:
        self.connection.close()

    def __enter__(self) -> CheckpointLedger:
        return self

    def __exit__(self, exc_type: object, exc_value: object, traceback: object) -> None:
        self.close()

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()

    def begin(
        self,
        *,
        source_namespace: str,
        source_id: str,
        source_revision: str,
        content_hash: str,
    ) -> bool:
        existing = self.get(source_namespace, source_id, source_revision)
        if existing and existing.status in {"succeeded", "deleted"}:
            if existing.content_hash != content_hash:
                raise ValueError("source revision was reused with different content")
            return False
        self.connection.execute(
            """
            INSERT INTO pipeline_ledger (
                source_namespace, source_id, source_revision, content_hash,
                status, attempts, last_error, updated_at
            ) VALUES (?, ?, ?, ?, 'pending', 1, NULL, ?)
            ON CONFLICT (source_namespace, source_id, source_revision) DO UPDATE SET
                content_hash = excluded.content_hash,
                status = 'pending',
                attempts = pipeline_ledger.attempts + 1,
                last_error = NULL,
                updated_at = excluded.updated_at
            """,
            (source_namespace, source_id, source_revision, content_hash, self._now()),
        )
        self.connection.commit()
        return True

    def mark_succeeded(self, namespace: str, source_id: str, revision: str) -> None:
        self._set_status(namespace, source_id, revision, "succeeded", None)

    def mark_deleted(self, namespace: str, source_id: str, revision: str) -> None:
        self._set_status(namespace, source_id, revision, "deleted", None)

    def mark_failed(self, namespace: str, source_id: str, revision: str, error: str) -> None:
        cleaned = " ".join(error.split())[:1000]
        self._set_status(namespace, source_id, revision, "failed", cleaned)

    def _set_status(
        self,
        namespace: str,
        source_id: str,
        revision: str,
        status: str,
        error: str | None,
    ) -> None:
        cursor = self.connection.execute(
            """
            UPDATE pipeline_ledger
            SET status = ?, last_error = ?, updated_at = ?
            WHERE source_namespace = ? AND source_id = ? AND source_revision = ?
            """,
            (status, error, self._now(), namespace, source_id, revision),
        )
        if cursor.rowcount != 1:
            self.connection.rollback()
            raise KeyError("ledger entry does not exist")
        self.connection.commit()

    def get(self, namespace: str, source_id: str, revision: str) -> LedgerEntry | None:
        row = self.connection.execute(
            """
            SELECT source_namespace, source_id, source_revision, content_hash,
                   status, attempts, last_error, updated_at
            FROM pipeline_ledger
            WHERE source_namespace = ? AND source_id = ? AND source_revision = ?
            """,
            (namespace, source_id, revision),
        ).fetchone()
        return LedgerEntry(**dict(row)) if row else None

    def counts(self) -> dict[str, int]:
        rows = self.connection.execute(
            "SELECT status, COUNT(*) AS count FROM pipeline_ledger GROUP BY status"
        ).fetchall()
        values = {status: 0 for status in ("pending", "succeeded", "failed", "deleted")}
        values.update({row["status"]: row["count"] for row in rows})
        return values
