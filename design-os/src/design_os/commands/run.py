"""``design-os run <brief.json> --project <dir> --out <run-dir>`` — the run control plane.

Drives one feature through the six method steps by calling only the ``ui`` kernel (see
``run_conductor``). Exit: 0 clean · 1 findings (red gate, dirty candidates, method lint)
or tool error · 2 BLOCKED by the D4 intake receipt (the questions are printed).
"""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

import typer

from design_os.envelope import JsonFlag, emit, err_env, ok_env
from design_os.kernel import KernelNotFound
from design_os.run_conductor import conduct

_COMMAND = "run"


def _text(res, out: Path) -> str:  # noqa: ANN001 - RunResult, kept import-light
    d4 = res.d4
    receipt = f" (D4 B={d4.get('B')} R={d4.get('R')} L={d4.get('L')})" if d4 else ""
    lines = [f"design-os run: {res.status}{receipt}"]
    for q in res.questions:
        lines.append(f"  ? {q.get('question', q.get('field'))}")
    lines += [f"  ✗ {f}" for f in res.findings]
    lines.append(f"  wrote {out}/run.json, k1.json, timeline.json")
    return "\n".join(lines) + "\n"


def run_cmd(
    brief: Annotated[Path, typer.Argument(help="design-brief JSON for the feature")],
    project: Annotated[Path, typer.Option("--project", help="Project dir (trace, candidates, git head)")] = Path("."),
    out: Annotated[Path, typer.Option("--out", help="Run dir to write run.json, k1.json, timeline.json")] = Path("run"),
    screens: Annotated[Path | None, typer.Option("--screens", help="Dir of *.html screens to gate")] = None,
    candidates: Annotated[Path | None, typer.Option("--candidates", help="ruling-candidates.json (default: found under --project)")] = None,
    feature: Annotated[str | None, typer.Option("--feature", help="Feature name (default: brief rawRequest)")] = None,
    json_: JsonFlag = False,
) -> None:
    """Run the six-step method over the ui kernel; stops BLOCKED when intake says so."""
    if not brief.is_file():
        emit(err_env(_COMMAND, "FILE_NOT_FOUND", f"{brief} not found"), json_mode=json_,
             text=f"design-os run: {brief} not found\n", exit_code=2)
    try:
        res = conduct(brief_path=brief, project=project, out=out, screens_dir=screens,
                      candidates=candidates, feature=feature)
    except KernelNotFound as e:
        emit(err_env(_COMMAND, "KERNEL_NOT_FOUND", str(e)), json_mode=json_, text=f"design-os run: {e}\n", exit_code=1)
        return
    data = {"status": res.status, "questions": res.questions, "d4": res.d4, "findings": res.findings, "files": res.files}
    emit(ok_env(_COMMAND, data), json_mode=json_, text=_text(res, out), exit_code=res.exit_code)
