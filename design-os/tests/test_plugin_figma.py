"""`design-os-figma` — the first REAL plugin, discovered via a genuinely installed distribution.

Tests 1 and 6 use **no monkeypatch**: they exercise real ``design_os.plugins`` entry-point
discovery, which works because ``design-os-figma`` is a uv-workspace dev dependency installed by
``uv sync`` (Phase 05's whole point). The command tests run against a PATH-isolated stub
``figma-agent`` from the shared ``fake_bin`` sandbox — the real hand on the host can never leak
in — asserting the plugin re-emits the hand's single-JSON-object output verbatim inside the
umbrella envelope, and surfaces the hand's own error codes.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
import typer
from typer.testing import CliRunner

from design_os.cli import run
from design_os.plugins import PluginReport, discover, mount
from design_os_figma import app as figma_app

# figma-agent status stub: prints the single JSON object the broker returns, exit 0.
_STATUS_OK_STUB = 'echo \'{"broker": "up", "plugin": "connected"}\'\nexit 0\n'


@pytest.fixture
def figma_env(fake_bin, monkeypatch: pytest.MonkeyPatch):
    """`fake_bin` PATH sandbox + guarantee the figma-agent env override can't leak in.

    `fake_bin` already points PATH at a stub-only sandbox (so no host `figma-agent` leaks in) and
    unsets DESIGN_OS_UI_BIN; the figma-agent override is unrelated, so unset it here too —
    otherwise a dev shell (or the orchestrator review) exporting DESIGN_OS_FIGMA_AGENT_BIN would
    shadow the sandbox stub.
    """
    monkeypatch.delenv("DESIGN_OS_FIGMA_AGENT_BIN", raising=False)
    return fake_bin


# ── Case 1: REAL entry-point discovery — the end-to-end proof of the plugin chain. ──
def test_figma_entry_point_is_really_discovered() -> None:
    """No monkeypatch: the installed design-os-figma dev-dep registers a `figma` entry point in
    the `design_os.plugins` group, so `discover()` finds it for real."""
    eps = {ep.name: ep.value for ep in discover()}
    assert "figma" in eps, f"figma entry point not discovered; found: {sorted(eps)}"
    assert eps["figma"] == "design_os_figma:app"


# ── Case 2: mount() (real discovery) onto a throwaway app → figma status runs verbatim. ──
def test_mount_onto_throwaway_then_status_ok(runner: CliRunner, figma_env) -> None:
    """mount() loads the real figma plugin onto a THROWAWAY Typer app (never the static one); the
    mounted `figma status` runs the stub hand and re-emits its JSON verbatim in the envelope."""
    figma_env.make_stub("figma-agent", _STATUS_OK_STUB)

    throwaway = typer.Typer()
    reports = mount(throwaway)
    assert PluginReport(name="figma", loaded=True, error=None) in reports

    res = runner.invoke(throwaway, ["figma", "status", "--json"])
    assert res.exit_code == 0, res.stdout
    env = json.loads(res.stdout)
    assert env["ok"] is True
    assert env["command"] == "figma status"
    assert env["data"]["result"]["broker"] == "up"
    assert env["data"]["result"]["plugin"] == "connected"


# ── Case 3: no figma-agent on PATH (+ no env override) → HAND_NOT_FOUND, exit 1. ──
def test_status_hand_not_found(runner: CliRunner, figma_env) -> None:
    """figma_env installs NO figma-agent stub → resolve_bin() is None → HAND_NOT_FOUND, exit 1."""
    res = runner.invoke(figma_app, ["status", "--json"])
    assert res.exit_code == 1
    env = json.loads(res.stdout)
    assert env["ok"] is False
    assert env["command"] == "figma status"
    assert env["error"]["code"] == "HAND_NOT_FOUND"


# ── Case 4: hand exits 1 with its own {error:{code,message}} → that code is surfaced verbatim. ──
def test_status_hand_error_propagates_code(runner: CliRunner, figma_env) -> None:
    figma_env.make_stub(
        "figma-agent",
        'echo \'{"error": {"code": "NO_BROKER", "message": "broker not reachable"}}\'\nexit 1\n',
    )
    res = runner.invoke(figma_app, ["status", "--json"])
    assert res.exit_code == 1
    env = json.loads(res.stdout)
    assert env["ok"] is False
    assert env["command"] == "figma status"
    assert env["error"]["code"] == "NO_BROKER"
    assert env["error"]["message"] == "broker not reachable"


# ── Case 5: hand prints something that is not one JSON object → BAD_HAND_OUTPUT, exit 1. ──
def test_status_bad_hand_output(runner: CliRunner, figma_env) -> None:
    figma_env.make_stub("figma-agent", 'echo "not json at all"\nexit 0\n')
    res = runner.invoke(figma_app, ["status", "--json"])
    assert res.exit_code == 1
    env = json.loads(res.stdout)
    assert env["ok"] is False
    assert env["error"]["code"] == "BAD_HAND_OUTPUT"


# ── Case 6: `design-os plugins --json` through REAL run() + real discovery → figma loaded. ──
def test_plugins_diagnostic_lists_figma_loaded(capsys: pytest.CaptureFixture[str]) -> None:
    """The built-in `plugins` diagnostic (no monkeypatch) loads the figma plugin and reports it
    mounted — proof the umbrella really sees the installed entry point."""
    code = run(["plugins", "--json"])
    out = capsys.readouterr().out
    assert code == 0
    env = json.loads(out)
    assert env["ok"] is True
    assert env["command"] == "plugins"
    figma = next((p for p in env["data"]["plugins"] if p["name"] == "figma"), None)
    assert figma is not None, f"figma not listed: {env['data']['plugins']}"
    assert figma["loaded"] is True
    assert figma["module"] == "design_os_figma:app"
    assert figma["error"] is None


# ── Case 7: scan forwards the right argv, writes --out, and returns the verbatim result + hint. ──
def test_scan_writes_out_and_emits_next_hint(runner: CliRunner, figma_env, tmp_path: Path) -> None:
    argv_log = tmp_path / "argv.txt"
    out_file = tmp_path / "ds.json"
    counts = '{"components": 3, "tokens": 42}'
    # Stub: record argv → write the counts JSON to the --out path ($3) → print the same counts.
    body = (
        'echo "$@" > "' + str(argv_log) + '"\n'
        "echo '" + counts + "' > \"$3\"\n"
        "echo '" + counts + "'\n"
        "exit 0\n"
    )
    figma_env.make_stub("figma-agent", body)

    res = runner.invoke(figma_app, ["scan", "--out", str(out_file), "--json"])
    assert res.exit_code == 0, res.stdout
    env = json.loads(res.stdout)
    assert env["ok"] is True
    assert env["command"] == "figma scan"
    data = env["data"]
    assert data["out"] == str(out_file)
    assert data["result"] == {"components": 3, "tokens": 42}
    assert data["next"] == "ui ingest-figma-ds <out> --name <slug>"
    # The stub received EXACTLY the argv the plugin promises to forward.
    assert argv_log.read_text().strip() == f"scan-design-system --out {out_file}"
    # …and the hand actually wrote the counts file at --out.
    assert json.loads(out_file.read_text()) == {"components": 3, "tokens": 42}
