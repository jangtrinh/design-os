"""``design-os audit batch <project> --caps <caps.json> --out <dir> [--json]`` — the CLI leaf.

Exit contract (acceptance §W10b A3: "fails only on a runner error, never on a page finding"):
  0  the run completed — even if individual pages recorded findings or per-page errors
  1  a runner-level failure: bad project/caps/kernel, or a cap exceeded fail-closed (aborted)
"""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

import typer

from design_os.envelope import JsonFlag, emit, err_env, ok_env
from design_os.kernel import KernelNotFound

from .caps import CapsError, load_caps
from .runner import run_batch

_COMMAND = "audit.batch.v1"


def _render_text(manifest: dict) -> str:
    d = manifest["data"]
    lines = [
        f"audit batch: {d['project']} — {d['pagesFound']} page(s) found, "
        f"{d['pagesRun']} run, {d['pagesSkipped']} skipped (unchanged), {d['pagesErrored']} errored",
    ]
    if d.get("abort"):
        lines.append(f"ABORTED: {d['abort']['cap']} — {d['abort']['message']}")
    return "\n".join(lines) + "\n"


def audit_batch(
    project: Annotated[Path, typer.Argument(help="Project directory to walk for HTML pages")],
    caps_path: Annotated[Path, typer.Option("--caps", help="Frozen caps JSON file")],
    out: Annotated[Path, typer.Option("--out", help="Output dir for receipts/manifest/state")],
    json_: JsonFlag = False,
) -> None:
    """Batch-audit every HTML page under a project through the frozen gate set."""
    if not project.is_dir():
        msg = f"no such directory: '{project}'"
        emit(err_env(_COMMAND, "PROJECT_NOT_FOUND", msg), json_mode=json_, text=f"audit batch: {msg}\n", exit_code=1)
        return

    try:
        caps = load_caps(caps_path)
    except CapsError as e:
        emit(err_env(_COMMAND, "CAPS_INVALID", str(e)), json_mode=json_, text=f"audit batch: {e}\n", exit_code=1)
        return

    try:
        result = run_batch(project=project, caps=caps, out=out)
    except KernelNotFound as e:
        emit(err_env(_COMMAND, "KERNEL_NOT_FOUND", str(e)), json_mode=json_, text=f"audit batch: {e}\n", exit_code=1)
        return

    if result.abort is not None:
        msg = f"{result.abort['cap']}: {result.abort['message']}"
        emit(err_env(_COMMAND, "CAP_EXCEEDED", msg), json_mode=json_, text=f"audit batch: CAP_EXCEEDED — {msg}\n", exit_code=1)
        return

    emit(ok_env(_COMMAND, result.manifest["data"]), json_mode=json_, text=_render_text(result.manifest), exit_code=0)
