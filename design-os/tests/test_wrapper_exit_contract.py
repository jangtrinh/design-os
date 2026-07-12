"""The exit/envelope contract lives in the ``run()`` wrapper — exercise it directly.

Every assertion here was PROBED against typer 0.26.8 before being locked (es-typer ⚠
"no hallucinated confidence"); the probe outcomes are documented per-test.
"""

from __future__ import annotations

import json

import pytest

from design_os.cli import run


def test_unknown_option_without_json_exits_2_and_writes_stderr(capsys: pytest.CaptureFixture[str]) -> None:
    # PROBE: `doctor --bogus` under standalone_mode=False raises NoSuchOption(⊂ UsageError),
    # exit_code=2, message "No such option: --bogus". No --json → human text on stderr.
    code = run(["doctor", "--bogus"])
    captured = capsys.readouterr()
    assert code == 2
    assert "No such option" in captured.err
    assert captured.out == ""


def test_unknown_option_with_json_emits_usage_envelope(capsys: pytest.CaptureFixture[str]) -> None:
    # Same UsageError, but --json present → JSON error envelope on stdout, code "USAGE".
    code = run(["doctor", "--bogus", "--json"])
    captured = capsys.readouterr()
    assert code == 2
    env = json.loads(captured.out)
    assert env["ok"] is False
    assert env["command"] == "design-os"
    assert env["error"]["code"] == "USAGE"


def test_unknown_command_exits_2() -> None:
    # PROBE: `nope` raises a plain UsageError ("No such command 'nope'."), exit_code=2.
    assert run(["nope"]) == 2


def test_unknown_command_with_json_emits_usage_envelope(capsys: pytest.CaptureFixture[str]) -> None:
    code = run(["nope", "--json"])
    env = json.loads(capsys.readouterr().out)
    assert code == 2
    assert env["ok"] is False
    assert env["error"]["code"] == "USAGE"


def test_no_args_prints_help_and_exits_0(capsys: pytest.CaptureFixture[str]) -> None:
    # PROBE (locked): no_args_is_help + standalone_mode=False RAISES NoArgsIsHelpError with
    # exit_code=2 and the help text carried in str(e) (NOT auto-printed). The wrapper maps
    # this to: print help → return 0. So no-args behaves as "show help, clean exit".
    code = run([])
    captured = capsys.readouterr()
    assert code == 0
    assert "Usage:" in captured.out
    assert "doctor" in captured.out


def test_explicit_help_exits_0(capsys: pytest.CaptureFixture[str]) -> None:
    # PROBE: `--help` triggers Click's help option → Exit(0), which standalone_mode=False
    # converts to a returned 0 (help already printed to stdout by Click).
    code = run(["--help"])
    captured = capsys.readouterr()
    assert code == 0
    assert "Usage:" in captured.out
