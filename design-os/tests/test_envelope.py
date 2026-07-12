"""Envelope helpers: shape of ok_env/err_env and emit's json/text/exit behavior."""

from __future__ import annotations

import json

import pytest
import typer

from design_os.envelope import emit, err_env, ok_env


def test_ok_env_shape() -> None:
    assert ok_env("doctor", {"a": 1}) == {
        "ok": True,
        "command": "doctor",
        "data": {"a": 1},
    }


def test_err_env_shape() -> None:
    assert err_env("doctor", "USAGE", "bad") == {
        "ok": False,
        "command": "doctor",
        "error": {"code": "USAGE", "message": "bad"},
    }


def test_emit_json_mode_prints_parseable_envelope(capsys: pytest.CaptureFixture[str]) -> None:
    env = ok_env("doctor", {"n": 1})
    emit(env, json_mode=True, text="ignored")
    out = capsys.readouterr().out
    assert json.loads(out) == env  # single JSON line, machine-parseable


def test_emit_text_mode_prints_text_verbatim(capsys: pytest.CaptureFixture[str]) -> None:
    emit(ok_env("doctor", {}), json_mode=False, text="hello")
    # end="" → no trailing newline added by emit; caller owns newlines.
    assert capsys.readouterr().out == "hello"


def test_emit_json_preserves_unicode(capsys: pytest.CaptureFixture[str]) -> None:
    # ensure_ascii=False → real UTF-8 survives (es-typer §5: no silent mangling).
    env = ok_env("doctor", {"msg": "café — 日本語"})
    emit(env, json_mode=True, text="")
    assert json.loads(capsys.readouterr().out)["data"]["msg"] == "café — 日本語"


def test_emit_nonzero_exit_raises_typer_exit(capsys: pytest.CaptureFixture[str]) -> None:
    with pytest.raises(typer.Exit) as exc:
        emit(err_env("doctor", "X", "y"), json_mode=True, text="", exit_code=1)
    assert exc.value.exit_code == 1
    # Envelope is still printed before the exit is raised.
    assert json.loads(capsys.readouterr().out)["ok"] is False


def test_emit_zero_exit_does_not_raise() -> None:
    # exit_code=0 (default) must not raise — normal success path.
    emit(ok_env("doctor", {}), json_mode=True, text="")
