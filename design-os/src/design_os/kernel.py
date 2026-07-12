"""Kernel bridge: locate and shell out to the deterministic ``ui`` TS binary.

Contract §1 (proposal.md): the umbrella NEVER reimplements a ``ui`` check — it only
shells out to ``ui … --json`` and parses the envelope. This module is that single seam.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from dataclasses import dataclass
from typing import Any


class KernelNotFound(RuntimeError):
    """Raised when the ``ui`` kernel binary cannot be located on PATH or via env override."""


@dataclass
class KernelResult:
    """Outcome of a ``ui`` shell-out: raw streams + a parsed envelope when stdout is JSON."""

    returncode: int
    envelope: dict[str, Any] | None
    stdout: str
    stderr: str


def resolve_bin(name: str, env_var: str) -> str | None:
    """Locate a binary by name.

    Order: explicit ``env_var`` override (used verbatim) → ``PATH`` lookup via
    ``shutil.which(name)`` → ``None`` when nothing is found. This is the single resolution
    policy shared by every hand the umbrella shells out to.
    """
    override = os.environ.get(env_var)
    if override:
        return override
    return shutil.which(name)


def resolve_ui() -> str | None:
    """Locate the ``ui`` kernel binary.

    Order: explicit ``DESIGN_OS_UI_BIN`` env override (used verbatim) → ``PATH`` lookup →
    ``None`` when nothing is found.
    """
    return resolve_bin("ui", "DESIGN_OS_UI_BIN")


def resolve_pixelshot() -> str | None:
    """Locate the ``pixelshot`` capture hand.

    Order: explicit ``DESIGN_OS_PIXELSHOT_BIN`` env override (used verbatim) → ``PATH``
    lookup → ``None`` when nothing is found.
    """
    return resolve_bin("pixelshot", "DESIGN_OS_PIXELSHOT_BIN")


def run_ui(args: list[str], *, timeout: float = 120.0) -> KernelResult:
    """Shell out to ``ui <args>``, capturing output and parsing a JSON envelope if present.

    Raises :class:`KernelNotFound` when ``ui`` is not resolvable. A non-JSON stdout yields
    ``envelope=None`` (e.g. ``ui --version`` prints a bare version string, not an envelope).
    """
    ui_bin = resolve_ui()
    if ui_bin is None:
        raise KernelNotFound(
            "The `ui` kernel binary was not found. Install/link it "
            "(e.g. `npm link` in the ease-design repo) or set DESIGN_OS_UI_BIN to its path."
        )
    proc = subprocess.run(  # noqa: S603 - args are caller-controlled, ui is trusted
        [ui_bin, *args],
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    try:
        parsed: Any = json.loads(proc.stdout)
    except json.JSONDecodeError:
        parsed = None
    envelope = parsed if isinstance(parsed, dict) else None
    return KernelResult(
        returncode=proc.returncode,
        envelope=envelope,
        stdout=proc.stdout,
        stderr=proc.stderr,
    )
