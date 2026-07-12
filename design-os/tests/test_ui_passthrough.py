"""`design-os ui -- <args>` passthrough — exit code + verbatim byte streaming.

The passthrough uses ``subprocess.run`` WITHOUT capture, so the child writes the REAL
stdout fd. CliRunner only swaps ``sys.stdout`` (Python-level), so it cannot see that byte
stream — pytest's ``capfd`` (fd-level) is used for the PASS line, CliRunner for exit code.
"""

from __future__ import annotations

from typer.testing import CliRunner

from design_os.cli import app, run


def test_passthrough_preserves_args_and_exit_code(
    runner: CliRunner, fake_bin, capfd
) -> None:
    fake_bin.make_stub("ui", 'echo "PASS $@"\nexit 7\n')
    res = runner.invoke(app, ["ui", "--", "foo", "--json", "x"])
    assert res.exit_code == 7  # kernel's exit code propagates verbatim
    out = capfd.readouterr().out
    assert "PASS foo --json x" in out  # `--` consumed; args forwarded untouched


def test_passthrough_without_double_dash(runner: CliRunner, fake_bin, capfd) -> None:
    # ignore_unknown_options → the `--` separator is optional; args still forward.
    fake_bin.make_stub("ui", 'echo "PASS $@"\nexit 0\n')
    res = runner.invoke(app, ["ui", "validate-layout", "in.html"])
    assert res.exit_code == 0
    assert "PASS validate-layout in.html" in capfd.readouterr().out


def test_passthrough_missing_ui_exits_1(runner: CliRunner, fake_bin) -> None:
    fake_bin.remove("ui")
    res = runner.invoke(app, ["ui", "--", "--version"])
    assert res.exit_code == 1
    assert "not found" in res.stderr


def test_passthrough_via_wrapper_returns_kernel_code(fake_bin, capfd) -> None:
    # Same path through the real run() wrapper (standalone_mode=False): a kernel exit code
    # is returned, not swallowed.
    fake_bin.make_stub("ui", 'echo "PASS $@"\nexit 3\n')
    code = run(["ui", "--", "a", "b"])
    assert code == 3
    assert "PASS a b" in capfd.readouterr().out
