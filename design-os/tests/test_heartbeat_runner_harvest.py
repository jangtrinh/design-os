"""`heartbeat_runners_learning._run_harvest` — the heartbeat runner contract (spec 006 P5):
never raises, `summary` carries ONLY `failures` (Key Insight 1 — a bigger harvest must never
render as "worsened"), and every write lands in the PROJECT's ledger regardless of this
process's own cwd (Key Insight 5). `_run_reflect` behavior is covered by `reflect_core`'s
own pure-function tests plus this module's ledger-write path; this file focuses on harvest
since it is the runner exercised end-to-end against a fake `ui` + fake model.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import pytest

from design_os import heartbeat_core
from design_os.commands.heartbeat_runners_learning import _run_harvest

_REPORT_TEXT = (
    "# Report\n\nRan the checks, all green.\n\n"
    "Finding: widgets misalign under RTL layouts because negative padding does not "
    "mirror, a durable cross-project lesson worth remembering for every future RTL "
    "audit pass.\n"
)
_EVIDENCE = "widgets misalign under RTL layouts because negative padding does not mirror"
_INSIGHT_TEXT = (
    "Widgets misalign under RTL layouts because negative padding never mirrors "
    "automatically, so RTL audits must check padding direction explicitly."
)

# Shell builtins only — `fake_bin` isolates PATH, so `memory record` is the only call this
# stub needs to answer (mirrors tests/test_command_harvest.py's `_UI_STUB`).
_UI_STUB = """\
if [ "$1" = "memory" ] && [ "$2" = "record" ]; then
  echo "$@" >> "$UI_LOG"
  n=0
  [ -f "$UI_COUNTER" ] && read -r n < "$UI_COUNTER"
  n=$((n + 1))
  printf '%s' "$n" > "$UI_COUNTER"
  echo "{\\"ok\\": true, \\"command\\": \\"memory record\\", \\"data\\": {\\"id\\": \\"e$n\\", \\"eventCount\\": $n}}"
  exit 0
fi
echo '{"ok": true, "command": "stub", "data": {"stub": true}}'
exit 0
"""


def _project(tmp_path: Path, *, with_report: bool = True, report_name: str = "r.md", text: str = _REPORT_TEXT) -> Path:
    project = tmp_path / "project"
    (project / "design").mkdir(parents=True, exist_ok=True)
    if with_report:
        reports = project / "plans" / "p" / "reports"
        reports.mkdir(parents=True, exist_ok=True)
        (reports / report_name).write_text(text)
    return project


def _install_ui(fake_bin: Any, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("UI_LOG", str(tmp_path / "ui.log"))
    monkeypatch.setenv("UI_COUNTER", str(tmp_path / "ui.counter"))
    fake_bin.make_stub("ui", _UI_STUB)


def _install_model(fake_bin: Any, monkeypatch: pytest.MonkeyPatch, candidates: list[dict[str, Any]]) -> None:
    payload = json.dumps({"v": 1, "candidates": candidates})
    fake_bin.make_stub("modelcmd", f"echo '{payload}'\n")
    monkeypatch.setenv("DESIGN_OS_MODEL_CMD", "modelcmd")


def _insight_candidate(*, source: str = "plans/p/reports/r.md", text: str = _INSIGHT_TEXT, evidence: str = _EVIDENCE) -> dict[str, Any]:
    return {"kind": "insight", "text": text, "evidence": evidence, "source": source,
            "durable": True, "actionable": True, "confidence": 0.9}


def test_missing_design_dir_skips_with_no_project(tmp_path: Path) -> None:
    project = tmp_path / "no-design-here"
    project.mkdir()

    res = _run_harvest(project, {})

    assert res == {"status": "skipped", "summary": {}, "detail": "", "skipReason": "no-project"}


def test_runner_never_raises_when_the_project_dir_does_not_exist(tmp_path: Path) -> None:
    res = _run_harvest(tmp_path / "does" / "not" / "exist", {})

    assert res["status"] == "skipped"
    assert res["skipReason"] == "no-project"


def test_no_new_reports_skips_with_no_new_reports(tmp_path: Path) -> None:
    project = _project(tmp_path, with_report=False)

    res = _run_harvest(project, {})

    assert res == {"status": "skipped", "summary": {}, "detail": "", "skipReason": "no-new-reports"}


def test_no_model_adapter_skips_with_no_model_adapter(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    project = _project(tmp_path)
    monkeypatch.delenv("DESIGN_OS_MODEL_CMD", raising=False)

    res = _run_harvest(project, {})

    assert res["status"] == "skipped"
    assert res["skipReason"] == "no-model-adapter"
    assert list((project / "design" / "harvest-inbox").glob("*.md"))  # packet saved


def test_a_model_failure_reports_error_and_one_failure(
    tmp_path: Path, fake_bin: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = _project(tmp_path)
    fake_bin.make_stub("modelcmd", "echo 'boom' 1>&2\nexit 1\n")
    monkeypatch.setenv("DESIGN_OS_MODEL_CMD", "modelcmd")

    res = _run_harvest(project, {})

    assert res["status"] == "error"
    assert res["summary"] == {"failures": 1}


def test_harvest_runner_summary_carries_only_failures(
    tmp_path: Path, fake_bin: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = _project(tmp_path)
    _install_ui(fake_bin, monkeypatch, tmp_path)
    _install_model(fake_bin, monkeypatch, [_insight_candidate()])

    res = _run_harvest(project, {})

    assert res["status"] == "ok"
    assert set(res["summary"]) == {"failures"}
    assert res["summary"]["failures"] == 0


def test_a_bigger_harvest_is_not_reported_as_worsened(
    tmp_path: Path, fake_bin: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Pins Key Insight 1: a harvest that recorded MORE candidates must never drive
    `compare_summary` to "worsened" — the exact anti-regression trap the summary-only-
    carries-`failures` contract (Decision 2) exists to prevent."""
    project = _project(tmp_path, report_name="r1.md")
    _install_ui(fake_bin, monkeypatch, tmp_path)
    _install_model(fake_bin, monkeypatch, [_insight_candidate(source="plans/p/reports/r1.md")])

    first = _run_harvest(project, {})
    assert first["status"] == "ok"

    # A second, bigger report lands — more candidates recorded this run than last.
    (project / "plans" / "p" / "reports" / "r2.md").write_text(_REPORT_TEXT.replace("mirror,", "mirror twice,"))
    _install_model(fake_bin, monkeypatch, [
        _insight_candidate(source="plans/p/reports/r2.md"),
        _insight_candidate(source="plans/p/reports/r2.md", text=_INSIGHT_TEXT.replace("explicitly.", "explicitly, always.")),
    ])
    second = _run_harvest(project, {})
    assert second["status"] == "ok"

    assert heartbeat_core.compare_summary(first["summary"], second["summary"]) == "ok"


def test_harvest_runner_passes_the_project_dir_and_never_relies_on_cwd(
    tmp_path: Path, fake_bin: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = _project(tmp_path)
    log = tmp_path / "ui.log"
    _install_ui(fake_bin, monkeypatch, tmp_path)
    _install_model(fake_bin, monkeypatch, [_insight_candidate()])
    other_cwd = tmp_path / "elsewhere"
    other_cwd.mkdir()
    prev = os.getcwd()
    try:
        os.chdir(other_cwd)
        res = _run_harvest(project, {})
    finally:
        os.chdir(prev)

    assert res["status"] == "ok"
    # harvest_core.save_state is a direct Python write, keyed on project_dir explicitly —
    # it landing under `project/design/`, never `other_cwd/design/`, pins Decision 3.
    assert (project / "design" / "harvest-state.json").is_file()
    assert not (other_cwd / "design").exists()
    # Every `ui memory record` shell-out named `project` explicitly via `--dir`, regardless
    # of this process's cwd (Key Insight 5) — the fake `ui`'s logged argv proves it.
    log_text = log.read_text()
    assert f"--dir {project}" in log_text
    assert str(other_cwd) not in log_text
