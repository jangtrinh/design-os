"""`design-os reference add <url...>` — capture reconciliation, manifest, and error paths.

Unit cases run against a PATH-isolated STUB ``pixelshot`` (a tiny Python script wrapped by a
``#!/bin/sh`` exec — invoked through the venv interpreter by ABSOLUTE path because the
``fake_bin`` PATH sandbox holds only the stubs, so a bare ``python3`` would be unresolved,
mirroring the ``/bin/sleep`` reasoning in test_audit.py). The stub, per positional url,
creates ``<out>/<sanitized>.png.tiles/`` with one ``tile_0000.jpg`` and records its argv to
``<out>/args.txt`` so a test can prove the capture flags. One INTEGRATION case at the bottom
drives the REAL pixelshot on the committed fixture file (skipped when the bin is absent).
"""

from __future__ import annotations

import json
import shlex
import sys
from datetime import datetime
from pathlib import Path

import pytest
from typer.testing import CliRunner

from design_os.cli import app
from design_os.kernel import resolve_pixelshot

# Stub capture logic: parse argv, mkdir one `*.png.tiles` per positional url (+ 1 tile each),
# and dump argv to args.txt. Sanitize matches the spec's simple rule (`://`→`_`, `/`→`_`).
_PIXELSHOT_IMPL = r'''
import sys
import pathlib

argv = sys.argv[1:]
out = None
urls = []
i = 0
while i < len(argv):
    a = argv[i]
    if a == "--output":
        out = argv[i + 1]
        i += 2
    elif a in ("--tile-height", "--workers"):
        i += 2
    elif a.startswith("--"):
        i += 1
    else:
        urls.append(a)
        i += 1

outdir = pathlib.Path(out)
outdir.mkdir(parents=True, exist_ok=True)
(outdir / "args.txt").write_text(" ".join(argv))
for u in urls:
    name = u.replace("://", "_").replace("/", "_")
    tiles = outdir / (name + ".png.tiles")
    tiles.mkdir(parents=True, exist_ok=True)
    (tiles / "tile_0000.jpg").write_bytes(b"x")
    (tiles / "tiles.json").write_text("{}")
sys.exit(0)
'''


def _install_pixelshot_stub(fake_bin) -> None:
    """Drop a working ``pixelshot`` stub into the sandbox (Python impl + sh exec wrapper)."""
    impl = fake_bin.dir / "_pixelshot_impl.py"
    impl.write_text(_PIXELSHOT_IMPL)
    # sys.executable + impl are ABSOLUTE, so python resolves despite the PATH-only sandbox.
    fake_bin.make_stub(
        "pixelshot",
        f'exec {shlex.quote(sys.executable)} {shlex.quote(str(impl))} "$@"\n',
    )


@pytest.fixture
def refs_env(fake_bin, monkeypatch: pytest.MonkeyPatch):
    """``fake_bin`` PATH sandbox + guarantee the pixelshot env override can't leak in.

    ``fake_bin`` already unsets ``DESIGN_OS_UI_BIN``; the pixelshot override is unrelated, so
    unset it here too — otherwise a dev shell exporting it would shadow the sandbox stub.
    """
    monkeypatch.delenv("DESIGN_OS_PIXELSHOT_BIN", raising=False)
    return fake_bin


def _png_tiles_dirs(refs_dir: Path) -> list[Path]:
    return sorted(p for p in refs_dir.iterdir() if p.is_dir() and p.name.endswith(".png.tiles"))


# ── Case 1: one url → exit 0, total 1, one tile, one index entry, dir on disk. ──
def test_add_single_url_json(runner: CliRunner, refs_env, tmp_path: Path) -> None:
    _install_pixelshot_stub(refs_env)
    res = runner.invoke(app, ["reference", "add", "https://example.com", "--project", str(tmp_path), "--json"])
    assert res.exit_code == 0, res.stdout
    env = json.loads(res.stdout)
    assert env["ok"] is True
    assert env["command"] == "reference add"
    data = env["data"]
    assert data["total"] == 1
    assert len(data["captured"]) == 1
    entry = data["captured"][0]
    assert entry["tiles"] == 1
    # capturedAt: key present + ISO-8601 parseable (value itself is not asserted).
    assert datetime.fromisoformat(entry["capturedAt"])

    refs_dir = tmp_path / "references"
    index = json.loads((refs_dir / "index.json").read_text())
    assert len(index) == 1
    assert index[0]["dir"] == entry["dir"]
    # The capture dir really exists under <project>/references/.
    assert (refs_dir / entry["dir"]).is_dir()
    assert _png_tiles_dirs(refs_dir) == [refs_dir / entry["dir"]]


# ── Case 2: two urls → total 2, two index entries, and the capture flags reached pixelshot. ──
def test_add_two_urls_and_capture_flags(runner: CliRunner, refs_env, tmp_path: Path) -> None:
    _install_pixelshot_stub(refs_env)
    res = runner.invoke(
        app,
        ["reference", "add", "https://a.example", "https://b.example", "--project", str(tmp_path), "--json"],
    )
    assert res.exit_code == 0, res.stdout
    data = json.loads(res.stdout)["data"]
    assert data["total"] == 2
    refs_dir = tmp_path / "references"
    assert len(json.loads((refs_dir / "index.json").read_text())) == 2
    # The stub recorded its argv → prove the fixed capture discipline was forwarded verbatim.
    args = (refs_dir / "args.txt").read_text()
    assert "--tile-height 1568" in args
    assert "--wait-network-idle" in args


# ── Case 3: re-running the same url makes no NEW dir → total 0, exit 0, index does not grow. ──
def test_add_idempotent_no_duplicate_entries(runner: CliRunner, refs_env, tmp_path: Path) -> None:
    _install_pixelshot_stub(refs_env)
    argv = ["reference", "add", "https://example.com", "--project", str(tmp_path), "--json"]
    first = runner.invoke(app, argv)
    assert json.loads(first.stdout)["data"]["total"] == 1

    second = runner.invoke(app, argv)
    assert second.exit_code == 0
    data = json.loads(second.stdout)["data"]
    assert data["total"] == 0
    assert data["captured"] == []
    # index.json still holds exactly the one entry from the first run.
    index = json.loads((tmp_path / "references" / "index.json").read_text())
    assert len(index) == 1


# ── Case 4: pixelshot absent (sandbox has none + env unset) → HAND_NOT_FOUND, exit 1. ──
def test_add_pixelshot_missing_hand_not_found(runner: CliRunner, refs_env, tmp_path: Path) -> None:
    # refs_env installs NO pixelshot stub → resolve_pixelshot() is None.
    res = runner.invoke(app, ["reference", "add", "https://example.com", "--project", str(tmp_path), "--json"])
    assert res.exit_code == 1
    env = json.loads(res.stdout)
    assert env["ok"] is False
    assert env["error"]["code"] == "HAND_NOT_FOUND"


# ── Case 5: pixelshot exits non-zero → CAPTURE_FAILED carrying the stderr tail, exit 1. ──
def test_add_capture_failed_carries_stderr_tail(runner: CliRunner, refs_env, tmp_path: Path) -> None:
    refs_env.make_stub("pixelshot", "echo 'boom: chrome crashed' >&2\nexit 2\n")
    res = runner.invoke(app, ["reference", "add", "https://example.com", "--project", str(tmp_path), "--json"])
    assert res.exit_code == 1
    env = json.loads(res.stdout)
    assert env["ok"] is False
    assert env["error"]["code"] == "CAPTURE_FAILED"
    assert "boom: chrome crashed" in env["error"]["message"]


# ── Case 6: --project is honoured — captures land under <project>/references/, not cwd. ──
def test_add_respects_project_option(runner: CliRunner, refs_env, tmp_path: Path) -> None:
    _install_pixelshot_stub(refs_env)
    project = tmp_path / "my-proj"
    res = runner.invoke(app, ["reference", "add", "https://example.com", "--project", str(project), "--json"])
    assert res.exit_code == 0
    data = json.loads(res.stdout)["data"]
    assert data["refsDir"] == str(project / "references")
    assert (project / "references").is_dir()
    assert _png_tiles_dirs(project / "references")  # at least one capture dir under the chosen project


# ── Case 7: INTEGRATION — the REAL pixelshot capturing a local fixture file (no network). ──
_FIXTURE_FILE = Path(__file__).parent / "fixtures" / "audit-site" / "clean.html"


@pytest.mark.integration
@pytest.mark.skipif(resolve_pixelshot() is None, reason="requires the real `pixelshot` hand (set DESIGN_OS_PIXELSHOT_BIN)")
def test_add_real_pixelshot_on_local_file(runner: CliRunner, tmp_path: Path) -> None:
    res = runner.invoke(app, ["reference", "add", str(_FIXTURE_FILE), "--project", str(tmp_path), "--json"])
    assert res.exit_code == 0, res.stdout
    data = json.loads(res.stdout)["data"]
    assert data["total"] >= 1
    assert data["captured"][0]["tiles"] >= 1
