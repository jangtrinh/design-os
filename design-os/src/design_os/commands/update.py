"""``design-os update [--pull] [--check] [--json]`` — refresh the dev-linked toolchain.

The toolchain is dev-repo-linked: ``ui`` (the repo-root ``dist/cli.js``) plus the
``figma-agent`` / ``recall`` / ``a11y-audit`` / ``page-shot`` hands are npm-linked global
bins that serve the repo's compiled TS output, and ``design-os`` itself is an EDITABLE
uv-tool install (its Python tracks source live). So one refresh = recompile the TS the
linked bins serve; nothing on the Python side to reinstall.

``update`` recompiles them with the SAME lines CI runs — grounded in the repo-root
``package.json`` workspaces + ``.github/workflows/ci.yml`` (the root build for ``ui`` then
each workspace build), never invented — so a project pulls one lever to serve fresh
kernel + hands.

Envelope/exit discipline mirrors the siblings (proposal.md §3): success → ``ok_env`` with
``{repo, sections, pulled}`` (exit 0); a step failure → an ``err_env`` carrying the failing
step's stderr tail (exit 1); a non-editable snapshot install → ``NOT_EDITABLE`` (exit 1).
No model calls; the only git-remote touch is ``--pull``, and only when asked.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path
from typing import Annotated, Any

import typer

import design_os
from design_os.envelope import JsonFlag, emit, err_env, ok_env
from design_os.kernel import KernelNotFound, run_ui

_COMMAND = "update"

# Per-step shell-out budget (seconds). Generous: a cold ``tsup`` compile of the root plus the
# three workspaces can take a while. Module-level so a test can monkeypatch it down.
STEP_TIMEOUT = 300.0

# The canonical dist-build lines — GROUNDED, not invented:
#   • root ``npm run build`` (→ dist/cli.js = the ``ui`` bin) — ci.yml ``check`` + ``design-os``.
#   • ``npm run build --workspace=<w>`` per workspace — ci.yml ``figma-agent``/``recall``/``a11y``
#     jobs; the a11y workspace bin-emits BOTH ``a11y-audit`` and ``page-shot`` (a11y/package.json),
#     and vr_matrix._HAND_MISSING_MSG names the same a11y line.
# Order follows the linked-bin enumeration (ui → figma-agent → recall → a11y; a11y last as it
# serves two hands). Each entry is (step-label, npm-args); run sequentially in the repo root.
_BUILD_STEPS: list[tuple[str, list[str]]] = [
    ("ui", ["run", "build"]),
    ("figma-agent", ["run", "build", "--workspace=figma-agent"]),
    ("recall", ["run", "build", "--workspace=recall"]),
    ("a11y", ["run", "build", "--workspace=a11y"]),
]

# Reinstall hint for a non-editable snapshot install (repo not discoverable). ``<repo>`` is a
# LITERAL placeholder — there is no local repo to interpolate in this branch.
_NOT_EDITABLE_HINT = (
    "design-os is not an editable dev install (its repo could not be located), so there is "
    "nothing local to rebuild. Reinstall it editable from your ease-design clone:\n"
    "  uv tool install --force -e <repo>/design-os --with-editable <repo>/design-os/plugins/figma\n"
    "or set DESIGN_OS_REPO to the repo root."
)


def _is_repo_root(d: Path) -> bool:
    """True when ``d`` is the ease-design repo root — carries all three markers together."""
    return (
        (d / "design-os" / "pyproject.toml").is_file()
        and (d / "package.json").is_file()
        and (d / "knowledge").is_dir()
    )


def _discover_repo() -> Path | None:
    """Locate the ease-design repo root, or ``None`` on a non-editable snapshot install.

    Order: explicit ``DESIGN_OS_REPO`` override (wins; still marker-validated so a bogus value
    degrades to NOT_EDITABLE rather than a broken build) → walk UP from the installed
    ``design_os`` package to the first ancestor carrying all three markers.
    """
    override = os.environ.get("DESIGN_OS_REPO")
    if override:
        cand = Path(override).expanduser().resolve()
        return cand if _is_repo_root(cand) else None
    anchor = Path(design_os.__file__).resolve()
    for d in anchor.parents:
        if _is_repo_root(d):
            return d
    return None


def _tail(text: str, *, lines: int = 20) -> str:
    """Last ``lines`` trimmed lines of ``text`` — the stderr tail carried in an err envelope."""
    parts = text.strip().splitlines()
    return "\n".join(parts[-lines:])


def _git_capture(repo: Path, args: list[str]) -> str | None:
    """Run ``git <args>`` in ``repo``; stdout on success, ``None`` on any failure.

    Read-only probe for ``--check``: a missing git, non-zero exit, or timeout all degrade to
    ``None`` (the report still emits, exit 0) rather than crashing.
    """
    git = shutil.which("git")
    if git is None:
        return None
    try:
        proc = subprocess.run(  # noqa: S603 - git is a resolved path; args are literals
            [git, *args], cwd=str(repo), capture_output=True, text=True, timeout=STEP_TIMEOUT
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return proc.stdout if proc.returncode == 0 else None


def _check_report(repo: Path) -> dict[str, Any]:
    """Read-only ``--check`` data: repo/commit/branch/dirty/editable. No fetch (no network)."""
    commit = (_git_capture(repo, ["rev-parse", "--short", "HEAD"]) or "").strip() or None
    branch = (_git_capture(repo, ["rev-parse", "--abbrev-ref", "HEAD"]) or "").strip() or None
    porcelain = _git_capture(repo, ["status", "--porcelain"])
    dirty = bool(porcelain.strip()) if porcelain is not None else False
    return {"repo": str(repo), "commit": commit, "branch": branch, "dirty": dirty, "editable": True}


def _render_check(data: dict[str, Any]) -> str:
    loc = data["commit"] or "?"
    if data["branch"]:
        loc += f" ({data['branch']})"
    lines = [
        f"repo      {data['repo']}",
        f"commit    {loc}",
        f"status    {'dirty' if data['dirty'] else 'clean'}",
        "install   editable (uv tool -e)",
        "note      no fetch performed — run `git fetch` to compare behind/ahead with the remote",
    ]
    return "\n".join(lines) + "\n"


def _run_step(repo: Path, label: str, args: list[str]) -> dict[str, Any]:
    """Run one ``npm <args>`` build in ``repo``; return a ``{step, ok, detail}`` section.

    Success detail = the one-line command that ran; failure detail = the stderr (or stdout)
    tail. A missing npm or a timeout both surface as ``ok:false`` with a clear detail so the
    caller stops on the first failure.
    """
    npm = shutil.which("npm")
    cmd_line = "npm " + " ".join(args)
    if npm is None:
        return {"step": label, "ok": False, "detail": "npm not found on PATH"}
    try:
        proc = subprocess.run(  # noqa: S603 - npm is a resolved path; args are literals
            [npm, *args], cwd=str(repo), capture_output=True, text=True, timeout=STEP_TIMEOUT
        )
    except subprocess.TimeoutExpired:
        return {"step": label, "ok": False, "detail": f"timed out after {STEP_TIMEOUT:.0f}s"}
    if proc.returncode == 0:
        return {"step": label, "ok": True, "detail": cmd_line}
    detail = _tail(proc.stderr) or _tail(proc.stdout) or f"exit {proc.returncode}"
    return {"step": label, "ok": False, "detail": detail}


def _run_pull(repo: Path) -> dict[str, Any]:
    """``git pull --ff-only`` in ``repo`` → a ``{step, ok, detail}`` section (never merges)."""
    git = shutil.which("git")
    if git is None:
        return {"step": "pull", "ok": False, "detail": "git not found on PATH"}
    try:
        proc = subprocess.run(  # noqa: S603 - git is a resolved path; args are literals
            [git, "pull", "--ff-only"],
            cwd=str(repo),
            capture_output=True,
            text=True,
            timeout=STEP_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        return {"step": "pull", "ok": False, "detail": f"timed out after {STEP_TIMEOUT:.0f}s"}
    if proc.returncode == 0:
        return {"step": "pull", "ok": True, "detail": _tail(proc.stdout, lines=1) or "up to date"}
    detail = _tail(proc.stderr) or _tail(proc.stdout) or f"exit {proc.returncode}"
    return {"step": "pull", "ok": False, "detail": detail}


def _ui_version_section() -> dict[str, Any]:
    """Final report step: the freshly-linked ``ui --version`` (informational, non-gating)."""
    try:
        res = run_ui(["--version"], timeout=STEP_TIMEOUT)
    except KernelNotFound:
        return {"step": "ui --version", "ok": False, "detail": "ui kernel not resolvable after rebuild"}
    except subprocess.SubprocessError:  # pragma: no cover - defensive
        return {"step": "ui --version", "ok": False, "detail": "version probe failed"}
    ver = res.stdout.strip() or None
    return {
        "step": "ui --version",
        "ok": res.returncode == 0 and ver is not None,
        "detail": ver or "no version output",
    }


def _render_sections(sections: list[dict[str, Any]]) -> str:
    lines = [f"{'OK  ' if s['ok'] else 'FAIL'} {s['step']} — {s['detail']}" for s in sections]
    return "\n".join(lines) + "\n" if lines else ""


_FOOTER = "run `design-os doctor` for the full hand check\n"


def update(
    pull: Annotated[
        bool, typer.Option("--pull", help="`git pull --ff-only` the repo before rebuilding")
    ] = False,
    check: Annotated[
        bool, typer.Option("--check", help="Read-only: report repo/commit/branch/dirty, no rebuild")
    ] = False,
    json_: JsonFlag = False,
) -> None:
    """Refresh the dev-linked toolchain so the global bins serve the repo's latest code.

    Recompiles the TS the npm-linked bins serve (ui + the figma-agent/recall/a11y hands) with
    the same lines CI runs; design-os itself is an editable install and needs no rebuild.
    """
    repo = _discover_repo()
    if repo is None:
        emit(
            err_env(_COMMAND, "NOT_EDITABLE", _NOT_EDITABLE_HINT),
            json_mode=json_,
            text=f"update: {_NOT_EDITABLE_HINT}\n",
            exit_code=1,
        )
        return

    if check:
        data = _check_report(repo)
        emit(ok_env(_COMMAND, data), json_mode=json_, text=_render_check(data), exit_code=0)
        return

    sections: list[dict[str, Any]] = []

    # 1. Optional fast-forward pull (skipped by default — the owner may be holding WIP).
    if pull:
        sec = _run_pull(repo)
        sections.append(sec)
        if not sec["ok"]:
            emit(
                err_env(_COMMAND, "PULL_FAILED", f"git pull --ff-only failed: {sec['detail']}"),
                json_mode=json_,
                text=_render_sections(sections) + "update: pull failed\n",
                exit_code=1,
            )
            return

    # 2. Recompile the dists the linked bins serve — root then each workspace, stop on first fail.
    for label, args in _BUILD_STEPS:
        sec = _run_step(repo, label, args)
        sections.append(sec)
        if not sec["ok"]:
            emit(
                err_env(_COMMAND, "BUILD_FAILED", f"{label} build failed: {sec['detail']}"),
                json_mode=json_,
                text=_render_sections(sections) + f"update: {label} build failed\n",
                exit_code=1,
            )
            return

    # 3. Final report: the freshly-linked ui version (non-gating — builds are the gates).
    sections.append(_ui_version_section())

    data = {"repo": str(repo), "sections": sections, "pulled": pull}
    emit(
        ok_env(_COMMAND, data),
        json_mode=json_,
        text=_render_sections(sections) + _FOOTER,
        exit_code=0,
    )
