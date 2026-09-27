"""``audit_batch.state`` — SQLite re-run state, TP-00B pragmas (WAL/FULL/busy_timeout)."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from design_os.commands.audit_batch import BatchState


def test_unknown_page_is_not_unchanged(tmp_path: Path) -> None:
    state = BatchState(tmp_path / "state.sqlite3")
    assert state.unchanged("a.html", "sha256:aaa") is False
    state.close()


def test_record_then_unchanged_roundtrip(tmp_path: Path) -> None:
    state = BatchState(tmp_path / "state.sqlite3")
    state.record("a.html", "sha256:aaa", "ran", "2026-01-01T00:00:00+00:00", "receipts/a.json")
    assert state.unchanged("a.html", "sha256:aaa") is True
    assert state.unchanged("a.html", "sha256:bbb") is False  # content changed
    state.close()


def test_record_upserts_on_conflict(tmp_path: Path) -> None:
    db_path = tmp_path / "state.sqlite3"
    state = BatchState(db_path)
    state.record("a.html", "sha256:aaa", "ran", "T0", "receipts/a-0.json")
    state.record("a.html", "sha256:bbb", "ran", "T1", "receipts/a-1.json")
    state.close()

    conn = sqlite3.connect(str(db_path))
    rows = conn.execute("SELECT content_hash, receipt_path FROM page_runs WHERE path = ?", ("a.html",)).fetchall()
    conn.close()
    assert rows == [("sha256:bbb", "receipts/a-1.json")]


def test_durable_pragmas_applied(tmp_path: Path) -> None:
    db_path = tmp_path / "state.sqlite3"
    state = BatchState(db_path)
    journal_mode = state.conn.execute("PRAGMA journal_mode").fetchone()[0]
    synchronous = state.conn.execute("PRAGMA synchronous").fetchone()[0]
    state.close()
    assert journal_mode.lower() == "wal"
    assert synchronous == 2  # FULL == 2 per SQLite's own pragma encoding (OFF=0, NORMAL=1, FULL=2)


def test_state_persists_across_reopen(tmp_path: Path) -> None:
    db_path = tmp_path / "state.sqlite3"
    s1 = BatchState(db_path)
    s1.record("a.html", "sha256:aaa", "ran", "T0", "receipts/a.json")
    s1.close()

    s2 = BatchState(db_path)
    assert s2.unchanged("a.html", "sha256:aaa") is True
    s2.close()
