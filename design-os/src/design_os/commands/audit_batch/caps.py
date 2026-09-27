"""Frozen caps for ``audit.batch.v1`` — TP-01 discipline (see evidence/w10b/tp-02-review.md
§TP-01 caps), rewritten for THIS runner's dimensions: pages, seconds-per-page, total seconds.

The caps file is checked into the repo (``design-os/caps/audit-batch.caps.json``), never
overridable by env var or a bypass flag — a cap the runner can silently raise is not a cap.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

REQUIRED_KEYS = ("maxPages", "maxSecondsPerPage", "totalBudgetSeconds")


class CapsError(ValueError):
    """Raised for any malformed/missing/extra-key caps file — always a named, specific reason."""


@dataclass(frozen=True)
class Caps:
    max_pages: int
    max_seconds_per_page: float
    total_budget_seconds: float


def _positive_number(raw: object, key: str, path: Path) -> float:
    if isinstance(raw, bool) or not isinstance(raw, (int, float)) or raw <= 0:
        raise CapsError(f"caps file '{path}': '{key}' must be a positive number, got {raw!r}")
    return float(raw)


def load_caps(path: Path) -> Caps:
    """Load+validate the caps file: exactly the three required keys, each a positive number."""
    if not path.is_file():
        raise CapsError(f"caps file not found: '{path}'")
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise CapsError(f"caps file '{path}' is not valid JSON: {e}") from e
    if not isinstance(raw, dict):
        raise CapsError(f"caps file '{path}' must be a JSON object")

    missing = [k for k in REQUIRED_KEYS if k not in raw]
    if missing:
        raise CapsError(f"caps file '{path}' missing required key(s): {', '.join(missing)}")
    unknown = sorted(set(raw) - set(REQUIRED_KEYS))
    if unknown:
        raise CapsError(f"caps file '{path}' has unknown key(s): {', '.join(unknown)}")

    max_pages = _positive_number(raw["maxPages"], "maxPages", path)
    if max_pages != int(max_pages):
        raise CapsError(f"caps file '{path}': 'maxPages' must be a whole number, got {raw['maxPages']!r}")
    max_seconds_per_page = _positive_number(raw["maxSecondsPerPage"], "maxSecondsPerPage", path)
    total_budget_seconds = _positive_number(raw["totalBudgetSeconds"], "totalBudgetSeconds", path)

    return Caps(
        max_pages=int(max_pages),
        max_seconds_per_page=max_seconds_per_page,
        total_budget_seconds=total_budget_seconds,
    )
