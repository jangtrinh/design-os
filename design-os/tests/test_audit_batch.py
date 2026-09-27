"""``design-os audit batch <project> --caps <caps.json> --out <dir>`` — CLI + A4 red-first tests.

Runs against a PATH-isolated stub ``ui`` (deterministic, no real kernel) — same sandbox
discipline as ``test_audit.py``. Exit contract under test (acceptance §W10b A3): 0 unless the
RUNNER itself failed (bad project/caps/kernel, or a cap exceeded fail-closed); a page finding
or a page crash never flips the exit code.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from typer.testing import CliRunner

from design_os.cli import app

# Stub `ui`: `gate` on a path containing "bad" returns a CRASH envelope (ok:false); every
# other tool call returns a clean ok:true envelope. Mirrors test_audit.py's branching style.
_STUB_UI = r"""
case "$1" in
  gate)
    case "$2" in
      *bad*) printf '%s\n' '{"ok":false,"command":"gate","error":{"code":"READ_ERROR","message":"boom"}}'
             exit 1 ;;
      *) printf '%s\n' '{"ok":true,"command":"gate","data":{"errorCount":0}}'
         exit 0 ;;
    esac ;;
  token-coverage)
    printf '%s\n' '{"ok":true,"command":"token-coverage","data":{}}'
    exit 0 ;;
  build-evidence)
    printf '%s\n' '{"ok":true,"command":"build-evidence lint","data":{}}'
    exit 0 ;;
  --version) echo "0.9.9" ; exit 0 ;;
  *) printf '%s\n' '{"ok":true,"command":"stub","data":{}}' ; exit 0 ;;
esac
"""

_CAPS = {"maxPages": 200, "maxSecondsPerPage": 30, "totalBudgetSeconds": 600}


def _caps_file(tmp_path: Path, overrides: dict | None = None) -> Path:
    doc = {**_CAPS, **(overrides or {})}
    p = tmp_path / "caps.json"
    p.write_text(json.dumps(doc), encoding="utf-8")
    return p


def _project(tmp_path: Path, pages: dict[str, str]) -> Path:
    proj = tmp_path / "project"
    proj.mkdir()
    for rel, content in pages.items():
        f = proj / rel
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(content)
    return proj


def test_project_not_found(runner: CliRunner, fake_bin, tmp_path: Path) -> None:
    fake_bin.make_stub("ui", _STUB_UI)
    res = runner.invoke(app, ["audit", "batch", str(tmp_path / "nope"), "--caps", str(_caps_file(tmp_path)), "--out", str(tmp_path / "out"), "--json"])
    env = json.loads(res.output)
    assert env["ok"] is False
    assert env["error"]["code"] == "PROJECT_NOT_FOUND"
    assert res.exit_code == 1


def test_caps_invalid_reported_at_cli(runner: CliRunner, fake_bin, tmp_path: Path) -> None:
    fake_bin.make_stub("ui", _STUB_UI)
    proj = _project(tmp_path, {"a.html": "<html></html>"})
    bad_caps = tmp_path / "caps.json"
    bad_caps.write_text(json.dumps({"maxPages": 1}), encoding="utf-8")
    res = runner.invoke(app, ["audit", "batch", str(proj), "--caps", str(bad_caps), "--out", str(tmp_path / "out"), "--json"])
    env = json.loads(res.output)
    assert env["error"]["code"] == "CAPS_INVALID"
    assert res.exit_code == 1


def test_kernel_not_found(runner: CliRunner, fake_bin, tmp_path: Path) -> None:
    fake_bin.remove("ui")
    proj = _project(tmp_path, {"a.html": "<html></html>"})
    res = runner.invoke(app, ["audit", "batch", str(proj), "--caps", str(_caps_file(tmp_path)), "--out", str(tmp_path / "out"), "--json"])
    env = json.loads(res.output)
    assert env["error"]["code"] == "KERNEL_NOT_FOUND"
    assert res.exit_code == 1


def test_runs_pages_and_writes_manifest_and_receipts(runner: CliRunner, fake_bin, tmp_path: Path) -> None:
    fake_bin.make_stub("ui", _STUB_UI)
    proj = _project(tmp_path, {"a.html": "<html>a</html>", "sub/b.html": "<html>b</html>"})
    out = tmp_path / "out"
    res = runner.invoke(app, ["audit", "batch", str(proj), "--caps", str(_caps_file(tmp_path)), "--out", str(out), "--json"])
    env = json.loads(res.output)
    assert res.exit_code == 0, res.output
    assert env["ok"] is True
    data = env["data"]
    assert data["pagesFound"] == 2
    assert data["pagesRun"] == 2
    assert data["pagesSkipped"] == 0
    assert data["pagesErrored"] == 0
    assert data["abort"] is None
    assert (out / "manifest.json").is_file()
    assert (out / "state.sqlite3").is_file()
    for rel in data["receipts"]:
        assert (out / rel).is_file()


# ── A4 red-first: caps exceeded → fail-closed, the cap named ────────────────────────────────

def test_max_pages_exceeded_fails_closed_with_cap_named(runner: CliRunner, fake_bin, tmp_path: Path) -> None:
    fake_bin.make_stub("ui", _STUB_UI)
    proj = _project(tmp_path, {"a.html": "<html></html>", "b.html": "<html></html>"})
    out = tmp_path / "out"
    res = runner.invoke(app, ["audit", "batch", str(proj), "--caps", str(_caps_file(tmp_path, {"maxPages": 1})), "--out", str(out), "--json"])
    env = json.loads(res.output)
    assert res.exit_code == 1
    assert env["ok"] is False
    assert env["error"]["code"] == "CAP_EXCEEDED"
    assert "maxPages" in env["error"]["message"]
    # fail-closed BEFORE any work: no receipts written for a pre-flight page-count refusal.
    assert not (out / "receipts").exists()


def test_max_seconds_per_page_exceeded_fails_closed_with_cap_named(runner: CliRunner, fake_bin, tmp_path: Path) -> None:
    fake_bin.make_stub("ui", _STUB_UI)
    proj = _project(tmp_path, {"a.html": "<html></html>"})
    out = tmp_path / "out"
    # A cap of a fraction of a millisecond guarantees the deadline is exhausted before any
    # tool call can complete — deterministic without a real sleep or a fake clock.
    tiny_caps = _caps_file(tmp_path, {"maxSecondsPerPage": 1e-9})
    res = runner.invoke(app, ["audit", "batch", str(proj), "--caps", str(tiny_caps), "--out", str(out), "--json"])
    env = json.loads(res.output)
    assert res.exit_code == 1
    assert env["error"]["code"] == "CAP_EXCEEDED"
    assert "maxSecondsPerPage" in env["error"]["message"]


def test_total_budget_exceeded_fails_closed_with_cap_named(runner: CliRunner, fake_bin, tmp_path: Path) -> None:
    fake_bin.make_stub("ui", _STUB_UI)
    proj = _project(tmp_path, {"a.html": "<html></html>", "b.html": "<html></html>", "c.html": "<html></html>"})
    out = tmp_path / "out"
    # totalBudgetSeconds so tiny that page 0's own (non-zero) elapsed time already exhausts
    # it — page 0 is processed and its receipt kept, page 1/2 never start.
    tiny_caps = _caps_file(tmp_path, {"totalBudgetSeconds": 1e-9})
    res = runner.invoke(app, ["audit", "batch", str(proj), "--caps", str(tiny_caps), "--out", str(out), "--json"])
    env = json.loads(res.output)
    assert res.exit_code == 1
    assert env["error"]["code"] == "CAP_EXCEEDED"
    assert "totalBudgetSeconds" in env["error"]["message"]
    manifest = json.loads((out / "manifest.json").read_text())
    # partial progress is KEPT (unlike the maxPages pre-flight refusal above) — real completed
    # work is never discarded by a mid-run abort.
    assert manifest["data"]["pagesRun"] + manifest["data"]["pagesSkipped"] == 1
    assert len(manifest["data"]["receipts"]) == 1


# ── A4 red-first: unchanged page → skipped on re-run with its hash ─────────────────────────

def test_unchanged_page_skipped_on_rerun_with_hash(runner: CliRunner, fake_bin, tmp_path: Path) -> None:
    fake_bin.make_stub("ui", _STUB_UI)
    proj = _project(tmp_path, {"a.html": "<html>v1</html>"})
    out = tmp_path / "out"
    caps = _caps_file(tmp_path)
    args = ["audit", "batch", str(proj), "--caps", str(caps), "--out", str(out), "--json"]

    first = json.loads(runner.invoke(app, args).output)
    assert first["data"]["pagesRun"] == 1
    assert first["data"]["pagesSkipped"] == 0

    second = json.loads(runner.invoke(app, args).output)
    assert second["data"]["pagesRun"] == 0
    assert second["data"]["pagesSkipped"] == 1
    receipt = json.loads((out / second["data"]["receipts"][0]).read_text())
    assert receipt["data"]["status"] == "skipped-unchanged"
    assert receipt["data"]["contentHash"] == first_receipt_hash(out, first)


def first_receipt_hash(out: Path, first_env: dict) -> str:
    receipt = json.loads((out / first_env["data"]["receipts"][0]).read_text())
    return receipt["data"]["contentHash"]


def test_modified_page_reruns_after_hash_change(runner: CliRunner, fake_bin, tmp_path: Path) -> None:
    fake_bin.make_stub("ui", _STUB_UI)
    proj = _project(tmp_path, {"a.html": "<html>v1</html>"})
    out = tmp_path / "out"
    caps = _caps_file(tmp_path)
    args = ["audit", "batch", str(proj), "--caps", str(caps), "--out", str(out), "--json"]

    runner.invoke(app, args)
    (proj / "a.html").write_text("<html>v2</html>")
    second = json.loads(runner.invoke(app, args).output)
    assert second["data"]["pagesRun"] == 1
    assert second["data"]["pagesSkipped"] == 0


# ── A4 red-first: a page whose gate crashes → receipt with error, run continues ────────────

def test_page_crash_receipt_records_error_run_continues(runner: CliRunner, fake_bin, tmp_path: Path) -> None:
    fake_bin.make_stub("ui", _STUB_UI)
    proj = _project(tmp_path, {"bad.html": "<html>crashes gate</html>", "good.html": "<html>fine</html>"})
    out = tmp_path / "out"
    res = runner.invoke(app, ["audit", "batch", str(proj), "--caps", str(_caps_file(tmp_path)), "--out", str(out), "--json"])
    env = json.loads(res.output)
    # a page crash is NOT a runner error (§W10b A3) — exit stays 0.
    assert res.exit_code == 0, res.output
    assert env["ok"] is True
    assert env["data"]["pagesErrored"] == 1
    assert env["data"]["pagesRun"] == 1

    bad_receipt = next(json.loads((out / r).read_text()) for r in env["data"]["receipts"] if "bad" in r)
    assert bad_receipt["data"]["status"] == "error"
    assert bad_receipt["data"]["error"]["code"] == "READ_ERROR"
    good_receipt = next(json.loads((out / r).read_text()) for r in env["data"]["receipts"] if "good" in r)
    assert good_receipt["data"]["status"] == "ran"


# ── build-evidence lint: gated on a sibling evidence/ dir ───────────────────────────────────

def test_build_evidence_lint_runs_only_when_evidence_dir_present(runner: CliRunner, fake_bin, tmp_path: Path) -> None:
    fake_bin.make_stub("ui", _STUB_UI)
    proj = _project(tmp_path, {"no-evidence.html": "<html></html>", "with-evidence/page.html": "<html></html>"})
    (proj / "with-evidence" / "evidence").mkdir()
    out = tmp_path / "out"
    res = runner.invoke(app, ["audit", "batch", str(proj), "--caps", str(_caps_file(tmp_path)), "--out", str(out), "--json"])
    env = json.loads(res.output)
    assert res.exit_code == 0

    no_ev = next(json.loads((out / r).read_text()) for r in env["data"]["receipts"] if "no-evidence" in r)
    tool = next(t for t in no_ev["data"]["tools"] if t["tool"] == "build-evidence lint")
    assert tool.get("skipped") is True

    with_ev = next(json.loads((out / r).read_text()) for r in env["data"]["receipts"] if "with-evidence" in r)
    tool = next(t for t in with_ev["data"]["tools"] if t["tool"] == "build-evidence lint")
    assert tool.get("skipped") is not True
    assert tool["exitCode"] == 0


def test_text_output_mode(runner: CliRunner, fake_bin, tmp_path: Path) -> None:
    fake_bin.make_stub("ui", _STUB_UI)
    proj = _project(tmp_path, {"a.html": "<html></html>"})
    res = runner.invoke(app, ["audit", "batch", str(proj), "--caps", str(_caps_file(tmp_path)), "--out", str(tmp_path / "out")])
    assert res.exit_code == 0
    assert "audit batch" in res.output
    assert "1 page(s) found" in res.output
