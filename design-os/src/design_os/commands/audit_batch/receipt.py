"""Per-page receipt + run-manifest shape — "W3 shape" per evidence/w10b/tp-02-review.md: the
kernel's own JSON envelope carried VERBATIM inside a small, stable, lowerCamelCase envelope of
our own (one entry per page, one entry per tool — never open-ended).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from design_os.envelope import ok_env

COMMAND = "audit.batch.v1"


def write_json(path: Path, doc: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def build_receipt(
    *,
    page: str,
    content_hash: str,
    status: str,
    started_at: str,
    ended_at: str,
    duration_ms: int,
    tools: list[dict[str, Any]],
    error: dict[str, str] | None,
    skipped_reason: str | None = None,
) -> dict[str, Any]:
    """One page's receipt envelope. ``status``: ``ran`` | ``skipped-unchanged`` | ``error``."""
    data = {
        "page": page,
        "contentHash": content_hash,
        "startedAt": started_at,
        "endedAt": ended_at,
        "durationMs": duration_ms,
        "status": status,
        "skippedReason": skipped_reason,
        "tools": tools,
        "error": error,
    }
    return ok_env(COMMAND, data)


def build_manifest(
    *,
    project: str,
    started_at: str,
    ended_at: str,
    caps: dict[str, float],
    pages_found: int,
    pages_run: int,
    pages_skipped: int,
    pages_errored: int,
    receipts: list[str],
    state_db: str,
    abort: dict[str, str] | None,
) -> dict[str, Any]:
    data = {
        "project": project,
        "startedAt": started_at,
        "endedAt": ended_at,
        "caps": caps,
        "pagesFound": pages_found,
        "pagesRun": pages_run,
        "pagesSkipped": pages_skipped,
        "pagesErrored": pages_errored,
        "receipts": receipts,
        "stateDb": state_db,
        "abort": abort,
    }
    return ok_env(COMMAND, data)
