"""The frozen gate set for one page: ``gate``, ``token-coverage``, ``build-evidence lint``
(when a sibling ``evidence/`` dir exists) — run through the UNCHANGED kernel via ``run_ui``.

A tool's own non-zero exit WITH a valid ``ok:true`` envelope is a page FINDING (the kernel's
own contract: ``ok`` stays true when the check ran and simply found something — see
``design_os/commands/audit.py`` §1). Only ``ok:false`` or a non-JSON stdout is a page ERROR —
the kernel is telling us (or failing to tell us) that the tool itself did not complete
normally. This distinction, not a heuristic, is what separates "receipt records an error, run
continues" (a crash) from "maxSecondsPerPage exceeded" (a cap, raised to the caller — see
``runner.py``): a timeout is NOT swallowed here as a page error, it propagates as
``subprocess.TimeoutExpired`` so the caller can fail-closed the whole run per TP-01 discipline.
"""

from __future__ import annotations

import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

from design_os.kernel import run_ui

Clock = Callable[[], datetime]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _evidence_dir_argv(page: Path) -> list[str] | None:
    evidence_dir = page.parent / "evidence"
    if not evidence_dir.is_dir():
        return None
    return ["build-evidence", "lint", str(evidence_dir)]


# (tool label, argv builder — None return means "not applicable, skip with a reason")
_PAGE_TOOLS: list[tuple[str, Callable[[Path], list[str] | None]]] = [
    ("gate", lambda page: ["gate", str(page)]),
    ("token-coverage", lambda page: ["token-coverage", str(page)]),
    ("build-evidence lint", _evidence_dir_argv),
]


def run_tools_for_page(
    page: Path, *, max_seconds: float, clock: Clock = utc_now
) -> tuple[list[dict[str, Any]], dict[str, str] | None]:
    """Run the frozen gate set for one page within ``max_seconds`` total.

    Returns ``(tool_results, page_error)``. Raises ``subprocess.TimeoutExpired`` (NOT caught
    here) the instant the per-page deadline is exhausted — a cap violation, not a page error.
    """
    deadline = clock() + timedelta(seconds=max_seconds)
    results: list[dict[str, Any]] = []
    page_error: dict[str, str] | None = None

    for tool, argv_fn in _PAGE_TOOLS:
        remaining = (deadline - clock()).total_seconds()
        if remaining <= 0:
            raise subprocess.TimeoutExpired(cmd=tool, timeout=max_seconds)

        argv = argv_fn(page)
        if argv is None:
            results.append({"tool": tool, "skipped": True, "skippedReason": "no evidence folder found"})
            continue

        result = run_ui([*argv, "--json"], timeout=remaining)
        entry: dict[str, Any] = {"tool": tool, "exitCode": result.returncode, "envelope": result.envelope}
        results.append(entry)

        if result.envelope is None:
            page_error = page_error or {
                "code": "BAD_ENVELOPE",
                "message": f"{tool} did not return a JSON envelope (exit {result.returncode})",
            }
        elif result.envelope.get("ok") is False:
            err = result.envelope.get("error") or {}
            page_error = page_error or {
                "code": str(err.get("code", "TOOL_ERROR")),
                "message": f"{tool}: {err.get('message', 'unknown error')}",
            }

    return results, page_error
