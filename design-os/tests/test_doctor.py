"""`design-os doctor` — health envelope, exit codes, and text rendering.

Uses the PATH-isolated ``fake_bin`` sandbox so resolution is deterministic: the required
``ui``/``node`` are the stubs, and the optional hands are always absent.
"""

from __future__ import annotations

import json

from typer.testing import CliRunner

from design_os.cli import app


def test_doctor_healthy_json(runner: CliRunner, fake_bin) -> None:
    res = runner.invoke(app, ["doctor", "--json"])
    assert res.exit_code == 0
    env = json.loads(res.stdout)
    assert env["ok"] is True
    assert env["command"] == "doctor"
    checks = env["data"]["checks"]
    assert checks[0]["name"] == "ui"
    assert checks[0]["found"] is True
    assert checks[0]["version"] == "0.9.9"  # from the stub `ui --version`
    # Optional hands (figma-agent/recall/pixelshot/a11y-audit/page-shot) and the
    # scroll-cinema asset toolchain (gflow/ffmpeg/cwebp) are absent but must not fail health.
    assert env["data"]["ok"] is True
    assert {c["name"] for c in checks} == {
        "ui", "node", "figma-agent", "recall", "pixelshot", "a11y-audit", "page-shot",
        "gflow", "ffmpeg", "cwebp",
    }


def test_doctor_missing_required_node_exits_1(runner: CliRunner, fake_bin) -> None:
    fake_bin.remove("node")
    res = runner.invoke(app, ["doctor", "--json"])
    assert res.exit_code == 1
    env = json.loads(res.stdout)
    # Envelope ok stays True (the command ran); health = data.ok + exit code, mirroring
    # the ui kernel's okJsonWithExit gating semantics. Envelope ok:false is reserved for
    # the command itself failing.
    assert env["ok"] is True
    assert env["data"]["ok"] is False
    node = next(c for c in env["data"]["checks"] if c["name"] == "node")
    assert node["found"] is False
    assert node["required"] is True


def test_doctor_missing_ui_exits_1(runner: CliRunner, fake_bin) -> None:
    fake_bin.remove("ui")
    res = runner.invoke(app, ["doctor", "--json"])
    assert res.exit_code == 1
    env = json.loads(res.stdout)
    assert env["ok"] is True
    assert env["data"]["ok"] is False
    ui = next(c for c in env["data"]["checks"] if c["name"] == "ui")
    assert ui["found"] is False


def test_doctor_text_mode_mentions_ui(runner: CliRunner, fake_bin) -> None:
    # Phase 2 (spec 019): _render_text now goes through report_style's rule_header +
    # check_item — the literal "OK" token is replaced by the house-style "[✓]" bracket
    # glyph (parity with `ui doctor`/`ui onboard`'s checklist convention).
    res = runner.invoke(app, ["doctor"])
    assert res.exit_code == 0
    assert "ui" in res.stdout
    assert "[✓]" in res.stdout


def test_doctor_optional_hand_reports_present(runner: CliRunner, fake_bin) -> None:
    # An optional hand on PATH is reported found=True but health stays keyed on required.
    fake_bin.make_stub("figma-agent", 'echo "irrelevant"\nexit 0\n')
    res = runner.invoke(app, ["doctor", "--json"])
    assert res.exit_code == 0
    fa = next(c for c in json.loads(res.stdout)["data"]["checks"] if c["name"] == "figma-agent")
    assert fa["found"] is True
    assert fa["required"] is False
    assert fa["version"] is None  # T0: optional versions stay null


# Stub that answers `--version` like a real optional hand would; anything else is irrelevant.
_VERSIONED_STUB_BODY = 'if [ "$1" = "--version" ]; then\n  echo "1.2.3"\n  exit 0\nfi\necho "irrelevant"\nexit 0\n'


def test_doctor_versions_flag_probes_optional_hand_version(runner: CliRunner, fake_bin) -> None:
    # T1: `--versions` opts into probing each FOUND optional hand's `--version`.
    fake_bin.make_stub("figma-agent", _VERSIONED_STUB_BODY)
    res = runner.invoke(app, ["doctor", "--versions", "--json"])
    assert res.exit_code == 0
    fa = next(c for c in json.loads(res.stdout)["data"]["checks"] if c["name"] == "figma-agent")
    assert fa["found"] is True
    assert fa["version"] == "1.2.3"


def test_doctor_without_versions_flag_stays_null(runner: CliRunner, fake_bin) -> None:
    # Same stub, but WITHOUT --versions → behavior stays byte-identical to today: null.
    fake_bin.make_stub("figma-agent", _VERSIONED_STUB_BODY)
    res = runner.invoke(app, ["doctor", "--json"])
    assert res.exit_code == 0
    fa = next(c for c in json.loads(res.stdout)["data"]["checks"] if c["name"] == "figma-agent")
    assert fa["found"] is True
    assert fa["version"] is None


# --- scroll-cinema asset toolchain (spec 021, issue #97) --------------------------------
# The 021 asset path (gflow → ffmpeg → cwebp) was reproducible only on the machine that ran
# the pilot; absence surfaced mid-generation, after video credits were spent. These pin that
# absence is REPORTED (health-neutral, like any optional hand) and that a found toolchain
# reports its real version.


def test_doctor_asset_toolchain_absent_is_health_neutral(runner: CliRunner, fake_bin) -> None:
    res = runner.invoke(app, ["doctor", "--json"])
    assert res.exit_code == 0
    env = json.loads(res.stdout)
    assert env["data"]["ok"] is True  # missing asset toolchain never fails the studio
    tools = {c["name"]: c for c in env["data"]["checks"] if c["name"] in {"gflow", "ffmpeg", "cwebp"}}
    assert set(tools) == {"gflow", "ffmpeg", "cwebp"}
    assert all(t["found"] is False and t["required"] is False for t in tools.values())

    text_res = runner.invoke(app, ["doctor"])
    # `pending` glyph + the "optional" tag — discovered up front, not mid-run.
    assert "gflow — optional" in text_res.stdout


def test_doctor_gflow_present_reports_version(runner: CliRunner, fake_bin) -> None:
    fake_bin.make_stub(
        "gflow", 'if [ "$1" = "--version" ]; then\n  echo "gflow, version 0.42.0"\n  exit 0\nfi\nexit 0\n'
    )
    res = runner.invoke(app, ["doctor", "--versions", "--json"])
    assert res.exit_code == 0
    gf = next(c for c in json.loads(res.stdout)["data"]["checks"] if c["name"] == "gflow")
    assert gf["found"] is True
    assert gf["version"] == "gflow, version 0.42.0"


def test_doctor_multiline_version_banner_keeps_first_line_only(runner: CliRunner, fake_bin) -> None:
    # Real `ffmpeg --version` prints a build banner: version line + compiler + configure
    # flags. Only the first line may reach the envelope or the one-line-per-check render.
    fake_bin.make_stub(
        "ffmpeg",
        'if [ "$1" = "--version" ]; then\n'
        '  echo "ffmpeg version 8.0.1 Copyright (c) 2000-2025"\n'
        '  echo "  built with Apple clang version 17.0.0"\n'
        '  echo "  configuration: --prefix=/opt/homebrew"\n'
        "  exit 0\nfi\nexit 0\n",
    )
    res = runner.invoke(app, ["doctor", "--versions", "--json"])
    ff = next(c for c in json.loads(res.stdout)["data"]["checks"] if c["name"] == "ffmpeg")
    assert ff["version"] == "ffmpeg version 8.0.1 Copyright (c) 2000-2025"
    assert "\n" not in ff["version"]
    assert "configuration" not in runner.invoke(app, ["doctor", "--versions"]).stdout


def test_doctor_cwebp_without_version_flag_still_reports_found(runner: CliRunner, fake_bin) -> None:
    # `cwebp --version` is an invalid option (exit 1; the real form is `-version`), so the
    # probe degrades to version=None. Presence is what the preflight needs.
    fake_bin.make_stub("cwebp", 'echo "Error! Unknown option \'--version\'" >&2\nexit 1\n')
    res = runner.invoke(app, ["doctor", "--versions", "--json"])
    assert res.exit_code == 0
    cw = next(c for c in json.loads(res.stdout)["data"]["checks"] if c["name"] == "cwebp")
    assert cw["found"] is True
    assert cw["version"] is None


# --- ui version-gate (spec 019 phase 3) ------------------------------------------------
# MIN_UI_VERSION is "0.1.0"; the default fake_bin `ui --version` stub answers "0.9.9", so
# the happy-path tests above already exercise the at/above-floor branch implicitly. These
# tests pin both branches explicitly and assert the soft-gate contract: version-gate never
# changes `data.ok` or the exit code, only the rendered glyph/hint.

_UI_STUB_TEMPLATE = (
    'if [ "$1" = "--version" ]; then\n  echo "{version}"\n  exit 0\nfi\necho "stub ui $@"\nexit 0\n'
)


def test_doctor_ui_below_floor_warns_but_stays_healthy(runner: CliRunner, fake_bin) -> None:
    fake_bin.make_stub("ui", _UI_STUB_TEMPLATE.format(version="0.0.9"))
    res = runner.invoke(app, ["doctor", "--json"])
    assert res.exit_code == 0  # soft gate: below-floor `ui` never flips exit code
    env = json.loads(res.stdout)
    assert env["data"]["ok"] is True
    ui = next(c for c in env["data"]["checks"] if c["name"] == "ui")
    assert ui["version"] == "0.0.9"
    assert ui["meets_min_version"] is False

    text_res = runner.invoke(app, ["doctor"])
    assert text_res.exit_code == 0
    assert "[!] ui 0.0.9" in text_res.stdout
    assert "below floor 0.1.0" in text_res.stdout
    assert "design-os update" in text_res.stdout


def test_doctor_ui_at_floor_reports_ok(runner: CliRunner, fake_bin) -> None:
    fake_bin.make_stub("ui", _UI_STUB_TEMPLATE.format(version="0.1.0"))
    res = runner.invoke(app, ["doctor", "--json"])
    assert res.exit_code == 0
    ui = next(c for c in json.loads(res.stdout)["data"]["checks"] if c["name"] == "ui")
    assert ui["meets_min_version"] is True

    text_res = runner.invoke(app, ["doctor"])
    assert "[✓] ui 0.1.0" in text_res.stdout
    assert "below floor" not in text_res.stdout


def test_doctor_ui_unparseable_version_does_not_warn(runner: CliRunner, fake_bin) -> None:
    # A non-semver version string (e.g. a future `ui` printing "unknown") is NOT
    # actionably "old" — it must render as a plain `done`, never a false below-floor warn.
    fake_bin.make_stub("ui", _UI_STUB_TEMPLATE.format(version="unknown"))
    text_res = runner.invoke(app, ["doctor"])
    assert text_res.exit_code == 0
    assert "[✓] ui unknown" in text_res.stdout
    assert "below floor" not in text_res.stdout
