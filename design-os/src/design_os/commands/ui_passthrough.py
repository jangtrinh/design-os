"""``design-os ui -- <args...>`` — raw passthrough to the deterministic ``ui`` kernel.

Contract escape hatch (proposal.md §2): stream the kernel's own bytes and exit code
through untouched, so any ``ui`` subcommand is reachable without the umbrella
re-namespacing each verb. This command is EXEMPT from the ``--json`` envelope rule — it
forwards ``ui``'s own output verbatim.

Registered in cli.py with Click ``context_settings`` (``allow_extra_args`` +
``ignore_unknown_options``) so every token after ``ui`` (the ``--`` separator is
consumed, verified by probe) reaches ``ctx.args`` untouched.
"""

from __future__ import annotations

import subprocess
import sys

import typer

from design_os.kernel import resolve_ui


def ui_cmd(ctx: typer.Context) -> None:
    """Raw passthrough to the deterministic `ui` kernel (bytes + exit code preserved)."""
    ui_bin = resolve_ui()
    if ui_bin is None:
        print(
            "design-os: `ui` kernel not found. Install/link it "
            "(e.g. `npm link` in the ease-design repo) or set DESIGN_OS_UI_BIN.",
            file=sys.stderr,
        )
        raise typer.Exit(1)
    # No capture — child inherits the real stdout/stderr fds so bytes stream verbatim.
    proc = subprocess.run([ui_bin, *ctx.args])  # noqa: S603 - trusted kernel, args passed through
    raise typer.Exit(proc.returncode)
