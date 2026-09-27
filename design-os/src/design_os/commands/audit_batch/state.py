"""SQLite re-run state (Darwin) — TP-00B durability discipline, stdlib driver.

See evidence/w10b/tp-02-review.md §TP-00B: WAL journal mode, ``synchronous=FULL`` (ACID in
WAL mode per SQLite's own pragma contract), and a bounded busy-timeout so a second writer
backs off with SQLITE_BUSY instead of corrupting state. Python's built-in ``sqlite3`` module —
no new dependency (acceptance C1).
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

_BUSY_TIMEOUT_MS = 5000

_SCHEMA = """
CREATE TABLE IF NOT EXISTS page_runs (
    path TEXT PRIMARY KEY,
    content_hash TEXT NOT NULL,
    status TEXT NOT NULL,
    run_at TEXT NOT NULL,
    receipt_path TEXT NOT NULL
)
"""


class BatchState:
    """One SQLite connection over ``<out>/state.sqlite3``, opened with durable pragmas."""

    def __init__(self, db_path: Path) -> None:
        self.conn = sqlite3.connect(str(db_path), timeout=_BUSY_TIMEOUT_MS / 1000)
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA synchronous=FULL")
        self.conn.execute(f"PRAGMA busy_timeout={_BUSY_TIMEOUT_MS}")
        self.conn.execute(_SCHEMA)
        self.conn.commit()

    def unchanged(self, rel_path: str, content_hash: str) -> bool:
        """True iff a prior run recorded THIS exact content hash for ``rel_path``."""
        row = self.conn.execute(
            "SELECT content_hash FROM page_runs WHERE path = ?", (rel_path,)
        ).fetchone()
        return row is not None and row[0] == content_hash

    def record(self, rel_path: str, content_hash: str, status: str, run_at: str, receipt_path: str) -> None:
        self.conn.execute(
            """
            INSERT INTO page_runs (path, content_hash, status, run_at, receipt_path)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(path) DO UPDATE SET
                content_hash = excluded.content_hash,
                status = excluded.status,
                run_at = excluded.run_at,
                receipt_path = excluded.receipt_path
            """,
            (rel_path, content_hash, status, run_at, receipt_path),
        )
        self.conn.commit()

    def close(self) -> None:
        self.conn.close()
