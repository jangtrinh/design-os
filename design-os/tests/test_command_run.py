"""`design-os run` — control tests against a stand-in `ui` (tests/fixtures/run/stub_ui.py).

The stub only fakes the kernel's answers; the conductor's own logic (step mapping, stop on
BLOCKED, gate proxy, exit codes, file set) is what is under test.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest
from typer.testing import CliRunner

from design_os.cli import app

_STUB = Path(__file__).parent / "fixtures" / "run" / "stub_ui.py"
_STEPS = ["frame", "define", "explore", "decide", "build", "verify"]


@pytest.fixture(autouse=True)
def stub_ui(fake_bin) -> None:
    fake_bin.make_stub("ui", f'exec "{sys.executable}" "{_STUB}" "$@"\n')


def _brief(tmp: Path, **extra: object) -> Path:
    doc = {"rawRequest": "usage screen", "audience": "admins", **extra}
    path = tmp / "brief.json"
    path.write_text(json.dumps(doc))
    return path


def _screens(tmp: Path, **pages: str) -> Path:
    d = tmp / "screens"
    d.mkdir()
    for name, body in pages.items():
        (d / f"{name}.html").write_text(f"<html>{body}</html>")
    return d


def _run(runner: CliRunner, tmp: Path, brief: Path, screens: Path | None = None, *extra: str):
    args = ["run", str(brief), "--project", str(tmp), "--out", str(tmp / "out"), "--json", *extra]
    if screens:
        args += ["--screens", str(screens)]
    res = runner.invoke(app, args)
    return res, tmp / "out"


def test_blocked_brief_stops_after_define(runner: CliRunner, tmp_path: Path) -> None:
    res, out = _run(runner, tmp_path, _brief(tmp_path, blocked=True), _screens(tmp_path, a="ok"))
    assert res.exit_code == 2
    assert json.loads(res.stdout)["data"]["status"] == "BLOCKED"
    steps = json.loads((out / "run.json").read_text())["steps"]
    assert steps["define"]["status"] == "done"
    for name in ("explore", "decide", "build", "verify"):
        assert steps[name]["status"] == "skipped"
        assert steps[name]["skip_reason"]["detail"].startswith("blocked-intake")
    assert not (out / "gates.json").exists()  # no screen was gated after intake said stop
    assert json.loads((out / "k1.json").read_text())["d4"]["result"] == "BLOCKED"


def test_blocked_text_prints_the_questions(runner: CliRunner, tmp_path: Path) -> None:
    res = runner.invoke(app, ["run", str(_brief(tmp_path, blocked=True)), "--project", str(tmp_path), "--out", str(tmp_path / "o")])
    assert res.exit_code == 2
    assert "BLOCKED" in res.stdout and "Which surface is this?" in res.stdout


def test_red_gate_drops_the_proxy_below_one(runner: CliRunner, tmp_path: Path) -> None:
    screens = _screens(tmp_path, full="ok", empty="ok", loading="RED-GATE")
    res, out = _run(runner, tmp_path, _brief(tmp_path), screens)
    assert res.exit_code == 1
    k1 = json.loads((out / "k1.json").read_text())
    assert k1["screens_delivered"] == 3 and k1["screens_passing_all_gates_final"] == 2
    assert k1["gate_only_proxy"]["value"] < 1
    assert "gate red: loading" in json.loads(res.stdout)["data"]["findings"]


def test_clean_run_writes_the_full_file_set_in_step_order(runner: CliRunner, tmp_path: Path) -> None:
    res, out = _run(runner, tmp_path, _brief(tmp_path), _screens(tmp_path, a="ok", b="ok"))
    assert res.exit_code == 0, res.stdout
    assert {p.name for p in out.iterdir()} >= {"run.json", "k1.json", "timeline.json", "questions.json", "gates.json", "brief.json"}
    run = json.loads((out / "run.json").read_text())
    assert list(run["steps"]) == _STEPS and run["steps"]["build"]["status"] == "done"
    timeline = json.loads((out / "timeline.json").read_text())
    assert [s["step"] for s in timeline["steps"]] == _STEPS
    verify = next(s for s in timeline["steps"] if s["step"] == "verify")
    assert [c["call"] for c in verify["calls"]] == ["gate", "gate", "method lint"]
    assert all(c["start"] <= c["end"] for c in verify["calls"])
    assert json.loads((out / "k1.json").read_text())["gate_only_proxy"]["value"] == 1.0


def test_candidates_with_a_dead_anchor_fail_the_run(runner: CliRunner, tmp_path: Path) -> None:
    cand = tmp_path / "ruling-candidates.json"
    cand.write_text('{"note": "DEAD-ANCHOR"}')
    res, _ = _run(runner, tmp_path, _brief(tmp_path), None, "--candidates", str(cand))
    assert res.exit_code == 1
    assert any("dead anchor" in f for f in json.loads(res.stdout)["data"]["findings"])


def test_trace_feeds_k1_only_when_present(runner: CliRunner, tmp_path: Path) -> None:
    res, out = _run(runner, tmp_path, _brief(tmp_path))
    assert json.loads((out / "k1.json").read_text())["bytes_read_before_first_mutation"]["trace_valid"] is False
    trace = tmp_path / ".design-os" / "trace"
    trace.mkdir(parents=True)
    (trace / "reads.jsonl").write_text("{}\n")
    res, out = _run(runner, tmp_path, _brief(tmp_path))
    bytes_ = json.loads((out / "k1.json").read_text())["bytes_read_before_first_mutation"]
    assert bytes_["trace_value"] == 100 and bytes_["trace_valid"] is True


def test_missing_brief_is_a_usage_error(runner: CliRunner, tmp_path: Path) -> None:
    res = runner.invoke(app, ["run", str(tmp_path / "nope.json"), "--out", str(tmp_path / "o"), "--json"])
    assert res.exit_code == 2
    assert json.loads(res.stdout)["error"]["code"] == "FILE_NOT_FOUND"


def test_missing_kernel_exits_1(runner: CliRunner, fake_bin, tmp_path: Path) -> None:
    fake_bin.remove("ui")
    res = runner.invoke(app, ["run", str(_brief(tmp_path)), "--out", str(tmp_path / "o"), "--json"])
    assert res.exit_code == 1
    assert json.loads(res.stdout)["error"]["code"] == "KERNEL_NOT_FOUND"
