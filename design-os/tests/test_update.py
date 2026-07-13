"""`design-os update` — repo discovery, the build sequence, --pull/--check, and NOT_EDITABLE.

Runs against the PATH-isolated `fake_bin` sandbox (conftest) plus `git`/`npm` STUBS that
record their argv to a log — mirroring test_audit's stub discipline. `fake_repo` builds a
tmp dir carrying the three repo markers and points DESIGN_OS_REPO at it, so discovery is
deterministic and the real ease-design checkout is never touched.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from typer.testing import CliRunner

from design_os.cli import app
from design_os.commands import update as update_mod

# The canonical section order for a clean default run (four builds + the version report).
_STEPS = ["ui", "figma-agent", "recall", "a11y", "ui --version"]


# ── A `git`/`npm` stub that appends the physical cwd then `$*` to a log, then exits. Lets a
# test prove WHICH subcommands ran, IN WHICH cwd, and IN WHAT ORDER (pwd+argv pair per call).
# `pwd -P` / `printf` are POSIX-sh builtins → resolvable inside the empty PATH sandbox. ──
def _recorder(log: Path, *, exit_code: int = 0, stdout: str = "done") -> str:
    body = f'pwd -P >> "{log}"\n' f'printf "%s\\n" "$*" >> "{log}"\n'
    if stdout:
        body += f'printf "%s\\n" "{stdout}"\n'
    return body + f"exit {exit_code}\n"


def _argv_lines(log: Path) -> list[str]:
    """The recorded `$*` lines (the log alternates pwd, argv, pwd, argv, …)."""
    return log.read_text().splitlines()[1::2] if log.exists() else []


def _cwd_lines(log: Path) -> list[str]:
    return log.read_text().splitlines()[0::2] if log.exists() else []


@pytest.fixture
def fake_repo(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """A tmp dir carrying the three repo-root markers, wired via the DESIGN_OS_REPO override."""
    repo = tmp_path / "repo"
    (repo / "design-os").mkdir(parents=True)
    (repo / "design-os" / "pyproject.toml").write_text("[project]\nname='design-os'\n")
    (repo / "package.json").write_text('{"name":"ease-design"}\n')
    (repo / "knowledge").mkdir()
    monkeypatch.setenv("DESIGN_OS_REPO", str(repo))
    return repo


# ── Case 1: discovery honours DESIGN_OS_REPO; every build runs IN that repo root. ──
def test_update_discovers_repo_via_env_override(
    runner: CliRunner, fake_bin, fake_repo: Path, tmp_path: Path
) -> None:
    npm_log = tmp_path / "npm.log"
    fake_bin.make_stub("npm", _recorder(npm_log))

    res = runner.invoke(app, ["update", "--json"])
    assert res.exit_code == 0
    env = json.loads(res.stdout)
    assert env["ok"] is True
    assert env["command"] == "update"
    data = env["data"]
    assert data["repo"] == str(fake_repo.resolve())
    assert data["pulled"] is False
    assert [s["step"] for s in data["sections"]] == _STEPS
    # The exact canonical build lines, in order.
    assert _argv_lines(npm_log) == [
        "run build",
        "run build --workspace=figma-agent",
        "run build --workspace=recall",
        "run build --workspace=a11y",
    ]
    # Every build executed with cwd == the discovered repo root.
    assert all(Path(c).resolve() == fake_repo.resolve() for c in _cwd_lines(npm_log))


# ── Case 2: default run — canonical order, exit 0, and NO git touched without --pull. ──
def test_update_default_run_no_pull(
    runner: CliRunner, fake_bin, fake_repo: Path, tmp_path: Path
) -> None:
    npm_log = tmp_path / "npm.log"
    git_log = tmp_path / "git.log"
    fake_bin.make_stub("npm", _recorder(npm_log))
    fake_bin.make_stub("git", _recorder(git_log))  # present, but must NOT be invoked

    res = runner.invoke(app, ["update", "--json"])
    assert res.exit_code == 0
    data = json.loads(res.stdout)["data"]
    assert [s["step"] for s in data["sections"]] == _STEPS
    assert all(s["ok"] for s in data["sections"])
    assert data["pulled"] is False
    # No --pull ⇒ git is never shelled out to at all.
    assert not git_log.exists()
    # The final report carries the freshly-linked kernel version (conftest ui stub → 0.9.9).
    ver = next(s for s in data["sections"] if s["step"] == "ui --version")
    assert ver["detail"] == "0.9.9"


# ── Case 3: --pull fails → PULL_FAILED, exit 1, and NO build runs after the failed pull. ──
def test_update_pull_failure_stops_before_build(
    runner: CliRunner, fake_bin, fake_repo: Path, tmp_path: Path
) -> None:
    npm_log = tmp_path / "npm.log"
    git_log = tmp_path / "git.log"
    fake_bin.make_stub("npm", _recorder(npm_log))
    git_body = (
        f'printf "%s\\n" "$*" >> "{git_log}"\n'
        'case "$*" in\n'
        '  "pull --ff-only") echo "fatal: not possible to fast-forward, aborting" >&2 ; exit 1 ;;\n'
        "  *) exit 0 ;;\n"
        "esac\n"
    )
    fake_bin.make_stub("git", git_body)

    res = runner.invoke(app, ["update", "--pull", "--json"])
    assert res.exit_code == 1
    env = json.loads(res.stdout)
    assert env["ok"] is False
    assert env["error"]["code"] == "PULL_FAILED"
    assert "fast-forward" in env["error"]["message"]
    # The pull was attempted…
    assert git_log.read_text().splitlines() == ["pull --ff-only"]
    # …and NOT a single npm build ran after it.
    assert not npm_log.exists()


# ── Case 4: a build fails mid-sequence → BUILD_FAILED, exit 1, later steps NOT run. ──
def test_update_build_failure_midsequence(
    runner: CliRunner, fake_bin, fake_repo: Path, tmp_path: Path
) -> None:
    npm_log = tmp_path / "npm.log"
    npm_body = (
        f'printf "%s\\n" "$*" >> "{npm_log}"\n'
        'case "$*" in\n'
        '  *--workspace=recall*) echo "TS2307 boom" >&2 ; exit 2 ;;\n'
        "  *) echo built ; exit 0 ;;\n"
        "esac\n"
    )
    fake_bin.make_stub("npm", npm_body)

    res = runner.invoke(app, ["update", "--json"])
    assert res.exit_code == 1
    env = json.loads(res.stdout)
    assert env["ok"] is False
    assert env["error"]["code"] == "BUILD_FAILED"
    assert "recall" in env["error"]["message"]
    assert "TS2307 boom" in env["error"]["message"]  # the failing step's stderr tail
    # ui + figma-agent + recall attempted; a11y (and the version report) NEVER ran.
    assert npm_log.read_text().splitlines() == [
        "run build",
        "run build --workspace=figma-agent",
        "run build --workspace=recall",
    ]
    assert "--workspace=a11y" not in npm_log.read_text()


# ── Case 5: --check — read-only report of the repo/commit/branch/dirty shape, exit 0. ──
def test_update_check_reports_git_state(
    runner: CliRunner, fake_bin, fake_repo: Path, tmp_path: Path
) -> None:
    npm_log = tmp_path / "npm.log"
    fake_bin.make_stub("npm", _recorder(npm_log))  # --check must NOT build
    git_body = (
        'case "$*" in\n'
        '  "rev-parse --short HEAD") echo "abc1234" ;;\n'
        '  "rev-parse --abbrev-ref HEAD") echo "main" ;;\n'
        '  "status --porcelain") : ;;\n'  # no output ⇒ clean worktree
        "  *) : ;;\n"
        "esac\n"
        "exit 0\n"
    )
    fake_bin.make_stub("git", git_body)

    res = runner.invoke(app, ["update", "--check", "--json"])
    assert res.exit_code == 0
    env = json.loads(res.stdout)
    assert env["ok"] is True
    assert env["command"] == "update"
    assert env["data"] == {
        "repo": str(fake_repo.resolve()),
        "commit": "abc1234",
        "branch": "main",
        "dirty": False,
        "editable": True,
    }
    assert not npm_log.exists()  # read-only: nothing was built


# ── Case 5b: a dirty worktree flips `dirty` true (porcelain non-empty). ──
def test_update_check_reports_dirty_worktree(runner: CliRunner, fake_bin, fake_repo: Path) -> None:
    git_body = (
        'case "$*" in\n'
        '  "rev-parse --short HEAD") echo "def5678" ;;\n'
        '  "rev-parse --abbrev-ref HEAD") echo "feature/x" ;;\n'
        '  "status --porcelain") echo " M src/x.ts" ;;\n'
        "  *) : ;;\n"
        "esac\n"
        "exit 0\n"
    )
    fake_bin.make_stub("git", git_body)

    res = runner.invoke(app, ["update", "--check", "--json"])
    assert res.exit_code == 0
    data = json.loads(res.stdout)["data"]
    assert data["dirty"] is True
    assert data["commit"] == "def5678"
    assert data["branch"] == "feature/x"


# ── Case 6: repo undiscoverable (non-editable snapshot) → NOT_EDITABLE with the reinstall hint. ──
def test_update_not_editable_when_repo_undiscoverable(
    runner: CliRunner, fake_bin, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("DESIGN_OS_REPO", raising=False)
    monkeypatch.setattr(update_mod, "_discover_repo", lambda: None)

    res = runner.invoke(app, ["update", "--json"])
    assert res.exit_code == 1
    env = json.loads(res.stdout)
    assert env["ok"] is False
    assert env["error"]["code"] == "NOT_EDITABLE"
    msg = env["error"]["message"]
    assert "uv tool install --force -e" in msg
    assert "--with-editable" in msg
    assert "plugins/figma" in msg

    # Text mode surfaces the same reinstall hint.
    res_text = runner.invoke(app, ["update"])
    assert res_text.exit_code == 1
    assert "uv tool install --force -e" in res_text.stdout


# ── Case 7: text mode renders each step line and the doctor hand-off footer. ──
def test_update_text_mode_renders_sections(
    runner: CliRunner, fake_bin, fake_repo: Path, tmp_path: Path
) -> None:
    fake_bin.make_stub("npm", _recorder(tmp_path / "npm.log"))

    res = runner.invoke(app, ["update"])
    assert res.exit_code == 0
    out = res.stdout
    for step in _STEPS:
        assert step in out
    assert "OK" in out  # each successful step line starts with the OK tag
    assert out.rstrip().endswith("run `design-os doctor` for the full hand check")
