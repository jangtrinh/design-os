"""`design_os.plugins` — entry-point discovery, hardened mount, and the `plugins` diagnostic.

Discovery is faked by monkeypatching ``importlib.metadata.entry_points`` (the single seam both
``discover`` and ``mount`` go through) to return hand-built ``EntryPoint``s. A valid plugin's
target module is registered in ``sys.modules`` via ``types.ModuleType`` so ``ep.load()`` resolves
without a real installed distribution; a broken plugin points at an absent module (ImportError).

Scope note (mirrors the tree-walk meta-test): third-party plugins mount ONLY in ``cli.main()``
(and, per-invocation, on a throwaway app inside the diagnostic) — never on the module-level
``app`` that ``test_tree_contract`` walks. So the "every leaf has --json" invariant is asserted
over first-party surface only; a third-party plugin is intentionally NOT forced to carry --json.
"""

from __future__ import annotations

import importlib.metadata
import json
import sys
import types
from importlib.metadata import EntryPoint

import pytest
import typer
from typer.testing import CliRunner

from design_os.cli import app, run
from design_os.envelope import JsonFlag, emit, ok_env
from design_os.plugins import GROUP, PluginReport, mount


def _patch_entry_points(monkeypatch: pytest.MonkeyPatch, eps: list[EntryPoint]) -> None:
    """Force ``importlib.metadata.entry_points(group=...)`` to return ``eps`` for our group."""

    def fake(**kwargs: object) -> list[EntryPoint]:
        return list(eps) if kwargs.get("group") == GROUP else []

    monkeypatch.setattr(importlib.metadata, "entry_points", fake)


def _register_module(monkeypatch: pytest.MonkeyPatch, modname: str, payload: object) -> None:
    """Register a throwaway module exposing ``app = payload`` so ``<modname>:app`` load()s."""
    mod = types.ModuleType(modname)
    mod.app = payload  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, modname, mod)


def _make_greet_app() -> typer.Typer:
    """A minimal, well-formed plugin Typer app: a `greet` GROUP with one `hi` leaf (JsonFlag)."""
    plugin_app = typer.Typer(name="greet", no_args_is_help=True)

    @plugin_app.callback()
    def _root() -> None:
        """greet — a test plugin."""

    @plugin_app.command(name="hi")
    def _hi(json_: JsonFlag = False) -> None:
        emit(ok_env("greet hi", {"greeting": "hello"}), json_mode=json_, text="hello\n", exit_code=0)

    return plugin_app


@pytest.fixture
def restore_app():
    """Snapshot/restore the module-level app's registrations so a mounted test plugin can't leak
    into sibling tests (notably the tree-walk meta-test, which walks this very app)."""
    groups = list(app.registered_groups)
    commands = list(app.registered_commands)
    try:
        yield app
    finally:
        app.registered_groups[:] = groups
        app.registered_commands[:] = commands


# ── Case 1: a valid plugin mounts and is reachable end-to-end through run(). ──
def test_valid_plugin_mounts_and_runs(
    monkeypatch: pytest.MonkeyPatch, restore_app, capsys: pytest.CaptureFixture[str]
) -> None:
    _register_module(monkeypatch, "design_os_plugin_ok1", _make_greet_app())
    _patch_entry_points(
        monkeypatch, [EntryPoint(name="greet", value="design_os_plugin_ok1:app", group=GROUP)]
    )

    reports = mount(restore_app)
    assert reports == [PluginReport(name="greet", loaded=True, error=None)]

    capsys.readouterr()  # drop any mount output before exercising the mounted command
    code = run(["greet", "hi", "--json"])
    out = capsys.readouterr().out
    assert code == 0
    env = json.loads(out)
    assert env["ok"] is True
    assert env["command"] == "greet hi"
    assert env["data"]["greeting"] == "hello"


# ── Case 2: a plugin that fails to import degrades gracefully — CLI stays alive. ──
def test_broken_plugin_does_not_kill_cli(
    monkeypatch: pytest.MonkeyPatch, restore_app, capsys: pytest.CaptureFixture[str]
) -> None:
    _patch_entry_points(
        monkeypatch, [EntryPoint(name="brk", value="design_os_absent_mod:app", group=GROUP)]
    )

    reports = mount(restore_app)
    captured = capsys.readouterr()
    assert len(reports) == 1
    assert reports[0].name == "brk"
    assert reports[0].loaded is False
    assert reports[0].error  # one-line ImportError message, non-empty
    assert "\n" not in reports[0].error  # collapsed to a single line
    assert "brk" in captured.err and "not mounted" in captured.err  # one-line stderr warning

    # The umbrella's own commands still work — a broken plugin cannot wedge startup.
    assert run(["--help"]) == 0


# ── Case 3: ep.load() returns a non-Typer payload → "not a Typer app", nothing mounted. ──
def test_non_typer_payload_reports_not_a_typer_app(
    monkeypatch: pytest.MonkeyPatch, restore_app
) -> None:
    _register_module(monkeypatch, "design_os_plugin_bad3", object())  # `app` is not a Typer
    _patch_entry_points(
        monkeypatch, [EntryPoint(name="weird", value="design_os_plugin_bad3:app", group=GROUP)]
    )

    reports = mount(restore_app)
    assert reports == [PluginReport(name="weird", loaded=False, error="not a Typer app")]
    assert run(["--help"]) == 0  # nothing mounted → tree unchanged, CLI healthy


# ── Case 4: DESIGN_OS_NO_PLUGINS → safe mode: mount returns [] and touches nothing. ──
def test_disabled_env_mounts_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DESIGN_OS_NO_PLUGINS", "1")
    # Even a perfectly good, discoverable plugin is skipped under safe mode.
    _register_module(monkeypatch, "design_os_plugin_ok4", _make_greet_app())
    _patch_entry_points(
        monkeypatch, [EntryPoint(name="greet", value="design_os_plugin_ok4:app", group=GROUP)]
    )

    probe = typer.Typer()
    reports = mount(probe)
    assert reports == []
    assert probe.registered_groups == []  # add_typer was never called


# ── Case 5: `design-os plugins --json` — correct envelope shape over mixed load outcomes. ──
def test_plugins_command_json_shape(runner: CliRunner, monkeypatch: pytest.MonkeyPatch) -> None:
    _register_module(monkeypatch, "design_os_plugin_ok5", _make_greet_app())
    _patch_entry_points(
        monkeypatch,
        [
            # deliberately out of order → asserts discover() sorts by name.
            EntryPoint(name="zeta", value="design_os_absent_mod5:app", group=GROUP),
            EntryPoint(name="alpha", value="design_os_plugin_ok5:app", group=GROUP),
        ],
    )

    res = runner.invoke(app, ["plugins", "--json"])
    assert res.exit_code == 0
    env = json.loads(res.stdout)
    assert env["ok"] is True
    assert env["command"] == "plugins"
    data = env["data"]
    assert data["disabled"] is False

    plugins = data["plugins"]
    assert [p["name"] for p in plugins] == ["alpha", "zeta"]  # sorted, deterministic
    assert all(set(p) == {"name", "module", "loaded", "error"} for p in plugins)

    good, bad = plugins
    assert good["module"] == "design_os_plugin_ok5:app"
    assert good["loaded"] is True
    assert good["error"] is None
    assert bad["loaded"] is False
    assert bad["error"]  # one-line ImportError message
