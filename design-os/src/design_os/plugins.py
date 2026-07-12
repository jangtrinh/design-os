"""Third-party subcommand plugins via the ``design_os.plugins`` entry-point group.

Design (es-typer §8 — click-plugins minimal + Prefect ``cli/plugins.py`` hardened): a broken
or hostile third-party plugin must NEVER wedge the umbrella's startup. Every load is isolated —
any exception, or a payload that is not a ``typer.Typer``, degrades to a one-line
:class:`PluginReport` (+ a one-line stderr warning from :func:`mount`) and the CLI keeps going.
``DESIGN_OS_NO_PLUGINS`` is the safe-mode escape hatch: set it and nothing is discovered-loaded.

Mounting is deliberately kept OUT of the static ``app`` in cli.py — the module-level app that
the tests and the ``--help`` golden pin stays free of third-party surface. ``cli.main()`` calls
:func:`mount` on the real ``app`` right before dispatch; the built-in ``plugins`` command only
*probes* (never mounts, never gates), so it is a pure diagnostic.
"""

from __future__ import annotations

import importlib.metadata
import os
import sys
from dataclasses import dataclass
from typing import Any

import typer

from design_os.envelope import JsonFlag, emit, ok_env

GROUP = "design_os.plugins"
_COMMAND = "plugins"

# Safe mode: set to anything non-empty to skip discovery + mount entirely (Prefect safe-mode).
_DISABLE_ENV = "DESIGN_OS_NO_PLUGINS"

_NOT_TYPER = "not a Typer app"


@dataclass
class PluginReport:
    """Outcome of one plugin mount attempt: entry-point name + load status + one-line error."""

    name: str
    loaded: bool
    error: str | None


def _one_line(text: str) -> str:
    """Collapse a (possibly multi-line) message to a single whitespace-normalized line."""
    return " ".join(text.split())


def discover() -> list[importlib.metadata.EntryPoint]:
    """Return the ``design_os.plugins`` entry points, sorted by name (deterministic).

    Discovery does NOT consult ``DESIGN_OS_NO_PLUGINS`` — that gate lives in :func:`mount` only,
    so the diagnostic can still list what WOULD load. Empty on a clean install (design-os ships
    no first-party plugins of its own).
    """
    eps = importlib.metadata.entry_points(group=GROUP)
    return sorted(eps, key=lambda ep: ep.name)


def _probe(ep: importlib.metadata.EntryPoint) -> tuple[PluginReport, typer.Typer | None]:
    """Load + type-check ONE entry point. Never prints, never mutates any app.

    The single load seam shared by :func:`mount` (which acts on the result + warns) and the
    ``plugins`` diagnostic (which only reports). Returns ``(report, typer_app_or_None)``; the
    app is non-``None`` iff the payload loaded and is a ``typer.Typer``.
    """
    try:
        obj = ep.load()
    except Exception as exc:  # noqa: BLE001 - a third-party plugin must NEVER wedge the CLI
        return PluginReport(ep.name, False, _one_line(str(exc)) or exc.__class__.__name__), None
    if not isinstance(obj, typer.Typer):
        return PluginReport(ep.name, False, _NOT_TYPER), None
    return PluginReport(ep.name, True, None), obj


def mount(app: typer.Typer) -> list[PluginReport]:
    """Load every discovered plugin onto ``app``; one bad plugin can't crash the CLI.

    - ``DESIGN_OS_NO_PLUGINS`` set → return ``[]`` (safe mode: nothing loaded, no imports).
    - each entry point: a ``typer.Typer`` payload → ``app.add_typer(obj, name=ep.name)`` and
      report ``loaded=True``; ANY load exception or a non-Typer payload → ``loaded=False`` with a
      one-line error + a one-line stderr warning, then CONTINUE to the next plugin.
    """
    if os.environ.get(_DISABLE_ENV):
        return []
    reports: list[PluginReport] = []
    for ep in discover():
        report, obj = _probe(ep)
        if obj is not None:
            app.add_typer(obj, name=ep.name)
        else:
            print(f"design-os: plugin {ep.name!r} not mounted — {report.error}", file=sys.stderr)
        reports.append(report)
    return reports


def _render_text(plugins: list[dict[str, Any]], disabled: bool) -> str:
    suffix = " (plugins disabled)" if disabled else ""
    if not plugins:
        return f"plugins: none discovered{suffix}\n"
    lines: list[str] = []
    for p in plugins:
        if p["loaded"]:
            lines.append(f"OK   {p['name']} ({p['module']})")
        else:
            detail = f" — {p['error']}" if p["error"] else ""
            lines.append(f"FAIL {p['name']} ({p['module']}){detail}")
    mounted = sum(1 for p in plugins if p["loaded"])
    lines.append(f"plugins: {len(plugins)} discovered, {mounted} mounted{suffix}")
    return "\n".join(lines) + "\n"


def plugins_command(json_: JsonFlag = False) -> None:
    """List discovered third-party plugins and whether each one mounts."""
    disabled = bool(os.environ.get(_DISABLE_ENV))
    plugins: list[dict[str, Any]] = []
    for ep in discover():
        # Safe mode: report as un-loaded WITHOUT probing (probing would import the plugin).
        report = PluginReport(ep.name, False, None) if disabled else _probe(ep)[0]
        plugins.append(
            {"name": ep.name, "module": ep.value, "loaded": report.loaded, "error": report.error}
        )
    data = {"plugins": plugins, "disabled": disabled}
    # Diagnostic only: always exit 0 — a missing/broken plugin is not a CLI failure (no gate).
    emit(ok_env(_COMMAND, data), json_mode=json_, text=_render_text(plugins, disabled), exit_code=0)
