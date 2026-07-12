"""Import-regression guard (es-typer §6): importing the CLI entry must stay light.

Asserts heavy third-party modules are ABSENT from ``sys.modules`` after importing
``design_os.cli`` — an architectural assertion, not a fragile millisecond threshold. Run
in a fresh subprocess because pytest collection may already have imported these.
"""

from __future__ import annotations

import json
import subprocess
import sys

# Deps that must never be eagerly pulled by the top-level CLI import (none are dependencies
# today; this locks that in as the tree grows and body-local imports are introduced).
_HEAVY = ["numpy", "torch", "PIL", "requests", "httpx", "pandas", "cv2"]


def test_cli_import_does_not_pull_heavy_modules() -> None:
    code = (
        "import design_os.cli, sys, json;"
        f"print(json.dumps([m for m in {_HEAVY!r} if m in sys.modules]))"
    )
    proc = subprocess.run(
        [sys.executable, "-c", code],
        capture_output=True,
        text=True,
    )
    assert proc.returncode == 0, proc.stderr
    leaked = json.loads(proc.stdout.strip())
    assert leaked == [], f"heavy modules eagerly imported by design_os.cli: {leaked}"


def test_cli_entry_exposes_main_and_app() -> None:
    # Cheap smoke: the console-script target and the app object both import cleanly.
    code = "import design_os.cli as c; assert callable(c.main); assert c.app is not None"
    proc = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
    assert proc.returncode == 0, proc.stderr
