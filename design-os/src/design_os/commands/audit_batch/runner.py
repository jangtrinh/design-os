"""``audit.batch.v1`` orchestration: walk pages, enforce caps fail-closed, write receipts +
manifest, skip unchanged pages via SQLite state (TP-00B). Deterministic, no network, no model
calls — the kernel is shelled out to via ``run_ui`` and nothing else runs.
"""

from __future__ import annotations

import os
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from design_os.kernel import KernelNotFound, resolve_ui

from .caps import Caps
from .receipt import build_manifest, build_receipt, write_json
from .scan import content_hash, find_html_pages, page_slug
from .state import BatchState
from .tools import Clock, run_tools_for_page, utc_now


@dataclass
class BatchResult:
    manifest: dict[str, Any]
    abort: dict[str, str] | None = field(default=None)


def _caps_dict(caps: Caps) -> dict[str, float]:
    return {
        "maxPages": caps.max_pages,
        "maxSecondsPerPage": caps.max_seconds_per_page,
        "totalBudgetSeconds": caps.total_budget_seconds,
    }


def run_batch(*, project: Path, caps: Caps, out: Path, clock: Clock = utc_now) -> BatchResult:
    """Run ``audit.batch.v1`` over ``project`` into ``out``. Raises ``KernelNotFound`` up front."""
    if resolve_ui() is None:
        raise KernelNotFound(
            "The `ui` kernel binary was not found. Install/link it "
            "(e.g. `npm link` in the ease-design repo) or set DESIGN_OS_UI_BIN to its path."
        )

    out.mkdir(parents=True, exist_ok=True)
    receipts_dir = out / "receipts"
    state = BatchState(out / "state.sqlite3")

    started_at = clock().isoformat()
    pages = find_html_pages(project)

    if len(pages) > caps.max_pages:
        state.close()
        abort = {
            "cap": "maxPages",
            "message": f"found {len(pages)} page(s), cap is {caps.max_pages}",
        }
        manifest = build_manifest(
            project=str(project), started_at=started_at, ended_at=clock().isoformat(),
            caps=_caps_dict(caps), pages_found=len(pages), pages_run=0, pages_skipped=0,
            pages_errored=0, receipts=[], state_db="state.sqlite3", abort=abort,
        )
        write_json(out / "manifest.json", manifest)
        return BatchResult(manifest=manifest, abort=abort)

    receipts: list[str] = []
    pages_run = pages_skipped = pages_errored = 0
    budget_used = 0.0
    abort: dict[str, str] | None = None

    for i, page in enumerate(pages):
        if budget_used >= caps.total_budget_seconds:
            abort = {
                "cap": "totalBudgetSeconds",
                "message": f"budget {caps.total_budget_seconds}s exhausted after {i} of {len(pages)} page(s)",
            }
            break

        rel = os.path.relpath(page, project).replace(os.sep, "/")
        h = content_hash(page)
        page_start = clock()

        if state.unchanged(rel, h):
            receipt = build_receipt(
                page=rel, content_hash=h, status="skipped-unchanged",
                started_at=page_start.isoformat(), ended_at=page_start.isoformat(),
                duration_ms=0, tools=[], error=None, skipped_reason="unchanged since last run",
            )
            pages_skipped += 1
        else:
            try:
                tool_results, page_error = run_tools_for_page(
                    page, max_seconds=caps.max_seconds_per_page, clock=clock
                )
            except subprocess.TimeoutExpired:
                abort = {
                    "cap": "maxSecondsPerPage",
                    "message": f"page '{rel}' exceeded {caps.max_seconds_per_page}s",
                }
                break
            status = "error" if page_error else "ran"
            page_end = clock()
            receipt = build_receipt(
                page=rel, content_hash=h, status=status,
                started_at=page_start.isoformat(), ended_at=page_end.isoformat(),
                duration_ms=int((page_end - page_start).total_seconds() * 1000),
                tools=tool_results, error=page_error,
            )
            if page_error:
                pages_errored += 1
            else:
                pages_run += 1

        page_end = clock()
        budget_used += (page_end - page_start).total_seconds()
        receipt_path = receipts_dir / f"{i:04d}-{page_slug(rel)}.receipt.json"
        write_json(receipt_path, receipt)
        rel_receipt = str(receipt_path.relative_to(out)).replace(os.sep, "/")
        receipts.append(rel_receipt)
        state.record(rel, h, receipt["data"]["status"], page_end.isoformat(), rel_receipt)

    state.close()
    manifest = build_manifest(
        project=str(project), started_at=started_at, ended_at=clock().isoformat(),
        caps=_caps_dict(caps), pages_found=len(pages), pages_run=pages_run,
        pages_skipped=pages_skipped, pages_errored=pages_errored, receipts=receipts,
        state_db="state.sqlite3", abort=abort,
    )
    write_json(out / "manifest.json", manifest)
    return BatchResult(manifest=manifest, abort=abort)
