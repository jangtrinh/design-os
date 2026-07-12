"""Tree-walk meta-tests: one loop that protects the whole command tree (es-typer §7).

Asserts the contract invariants structurally, so they keep holding as commands are added:
  1. every leaf command (except the EXEMPT ``ui`` passthrough) accepts ``--json``;
  2. no command declares a duplicate option flag (Typer won't catch this — §3 ⚠);
  3. the root ``--help`` screen matches its committed golden (CliRunner forces width 80 +
     color off → byte-stable).
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Iterator

import typer
from typer.testing import CliRunner

from design_os.cli import app

# The raw ui passthrough forwards the kernel's own output; it has no envelope of its own.
EXEMPT_FROM_JSON = {"ui"}

_GOLDEN = Path(__file__).parent / "goldens" / "root-help.txt"


def _command_tree() -> Any:
    return typer.main.get_command(app)


def _walk(group: Any, prefix: tuple[str, ...] = ()) -> Iterator[tuple[tuple[str, ...], Any]]:
    """Yield (path, command) for the group itself and every descendant command.

    Groups are detected by duck-typing on ``.commands`` (a dict) — no reliance on the
    vendored Click class identity.
    """
    yield prefix, group
    children = getattr(group, "commands", None)
    if isinstance(children, dict):
        for name, cmd in children.items():
            yield from _walk(cmd, (*prefix, name))


def _leaf_commands() -> list[tuple[str, Any]]:
    leaves: list[tuple[str, Any]] = []
    for path, cmd in _walk(_command_tree()):
        if not path:
            continue  # the root group is not a leaf
        if not isinstance(getattr(cmd, "commands", None), dict):
            leaves.append((path[-1], cmd))
    return leaves


def _option_flags(cmd: Any) -> list[str]:
    flags: list[str] = []
    for param in cmd.params:
        for opt in (*param.opts, *param.secondary_opts):
            if opt.startswith("-"):
                flags.append(opt)
    return flags


def test_every_leaf_has_json_except_exempt() -> None:
    leaves = _leaf_commands()
    assert leaves, "expected at least the doctor + ui leaves"
    for name, cmd in leaves:
        if name in EXEMPT_FROM_JSON:
            continue
        assert "--json" in _option_flags(cmd), f"command {name!r} is missing --json"


def test_doctor_and_ui_are_registered() -> None:
    names = {name for name, _ in _leaf_commands()}
    assert {"doctor", "ui"} <= names


def test_no_duplicate_option_flags_per_command() -> None:
    for path, cmd in _walk(_command_tree()):
        flags = _option_flags(cmd)
        dupes = {f for f in flags if flags.count(f) > 1}
        label = "/".join(path) or "<root>"
        assert not dupes, f"command {label!r} has duplicate flags: {dupes}"


def test_root_help_matches_golden(runner: CliRunner) -> None:
    res = runner.invoke(app, ["--help"])
    assert res.exit_code == 0
    assert _GOLDEN.exists(), "golden missing — regenerate tests/goldens/root-help.txt"
    assert res.stdout == _GOLDEN.read_text()
