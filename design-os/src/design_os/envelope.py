"""The machine contract: JSON envelope helpers + the shared ``--json`` flag.

Envelope shape mirrors the ``ui`` kernel exactly (proposal.md §3):

    success: {"ok": true,  "command": <str>, "data": <obj>}
    failure: {"ok": false, "command": <str>, "error": {"code": <str>, "message": <str>}}

Machine output is plain ``print`` only — never Rich (es-typer §5). stdout has no color
layer to fight, so nothing can corrupt the envelope; there is no ``NO_COLOR`` handling
to add here because there is no Rich console on this path.
"""

from __future__ import annotations

import json
from typing import Annotated, Any

import typer


def ok_env(command: str, data: dict[str, Any]) -> dict[str, Any]:
    """Build a success envelope carrying ``data``."""
    return {"ok": True, "command": command, "data": data}


def err_env(command: str, code: str, message: str) -> dict[str, Any]:
    """Build a failure envelope carrying a ``{code, message}`` error."""
    return {"ok": False, "command": command, "error": {"code": code, "message": message}}


def emit(env: dict[str, Any], *, json_mode: bool, text: str, exit_code: int = 0) -> None:
    """Print an envelope (JSON) or human ``text``, then exit non-zero via ``typer.Exit``.

    - ``json_mode`` → ``print(json.dumps(env))`` with ``ensure_ascii=False`` so real UTF-8
      survives (a long token id must not come back mangled — es-typer §5).
    - else → ``print(text, end="")``; the caller owns trailing newlines.
    - ``exit_code != 0`` → raise ``typer.Exit(exit_code)`` AFTER printing, so the entry
      wrapper (cli.run) maps it to the process exit code.

    Plain ``print`` only — no Rich in this output path.
    """
    if json_mode:
        print(json.dumps(env, ensure_ascii=False))
    else:
        print(text, end="")
    if exit_code != 0:
        raise typer.Exit(exit_code)


JsonFlag = Annotated[
    bool,
    typer.Option("--json", help="Emit JSON envelope instead of human-readable text"),
]
