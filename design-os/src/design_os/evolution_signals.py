"""Heartbeat/registry/roles/taste-votes signal readers for `design-os evolution` (spec 012
P1) — split out of `evolution_core.py` to keep both modules under the ~200-line guideline
(Art IX). Same contract as that module: no subprocess, no model call, no wall-clock read;
a missing/corrupt file degrades to its empty shape, never raises.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

_DESIGN = "design"
_HEARTBEAT_CONFIG_REL = Path(_DESIGN) / "heartbeat.json"
_HEARTBEAT_STATE_REL = Path(_DESIGN) / "heartbeat-state.json"
_REGISTRY_REL = Path(_DESIGN) / "component-registry.json"
_TOKENS_REL = Path(_DESIGN) / "design.tokens.json"
# Taste-hub votes root defaults to <project>/taste (taste-store.ts resolveTasteRoot);
# design/votes.jsonl is also checked in case a project keeps it alongside the ledger.
_VOTES_RELS = (Path(_DESIGN) / "votes.jsonl", Path("taste") / "votes.jsonl")


def _read_json(path: Path) -> Any | None:
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def _count_jsonl_lines(path: Path) -> int:
    return sum(1 for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip())


def read_heartbeat_signal(project_dir: Path) -> dict[str, Any]:
    """Signal 6: heartbeat.json wiring + heartbeat-state.json firing. "Firing" = any task
    has a non-empty `history` (heartbeat_core.record_run unshifts newest-first at index 0);
    `last_run_at` is that entry's own `at`, never a wall-clock comparison."""
    config = _read_json(project_dir / _HEARTBEAT_CONFIG_REL)
    raw_tasks = config.get("tasks") if isinstance(config, dict) else None
    tasks_cfg = raw_tasks if isinstance(raw_tasks, list) else []
    wired = isinstance(config, dict) and len(tasks_cfg) > 0

    state = _read_json(project_dir / _HEARTBEAT_STATE_REL)
    raw_state_tasks = state.get("tasks") if isinstance(state, dict) else None
    state_tasks = raw_state_tasks if isinstance(raw_state_tasks, dict) else {}

    fired = False
    last_run_at: str | None = None
    for task_state in state_tasks.values():
        if not isinstance(task_state, dict):
            continue
        history = task_state.get("history")
        if isinstance(history, list) and history:
            fired = True
            entry = history[0]
            at = entry.get("at") if isinstance(entry, dict) else None
            if isinstance(at, str) and (last_run_at is None or at > last_run_at):
                last_run_at = at

    return {"wired": wired, "task_count": len(tasks_cfg), "fired": fired, "last_run_at": last_run_at}


def read_registry_signal(project_dir: Path, ledger: dict[str, Any]) -> dict[str, Any]:
    """Signal 8 (registry half): component-registry.json's own count vs the ledger's
    `component_registered` event count — reported as two independent numbers (Art VIII);
    they may legitimately diverge (a registry rebuilt/reset without replaying the ledger)."""
    registry = _read_json(project_dir / _REGISTRY_REL)
    components = registry.get("components") if isinstance(registry, dict) else None
    component_count = len(components) if isinstance(components, list) else 0
    return {
        "component_count": component_count,
        "component_registered_events": ledger["types"].get("component_registered", 0),
    }


def read_roles_signal(project_dir: Path) -> dict[str, Any]:
    """Signal 8 (DS role half, spec 011): tokens carrying a baked `$extensions
    ["design-os.role"]` vs the total token count (ds-context-roles.ts's baked-annotation
    read — never recomputes recognition)."""
    tokens = _read_json(project_dir / _TOKENS_REL)
    total = 0
    roled = 0
    if isinstance(tokens, dict):
        for group in tokens.values():
            if not isinstance(group, dict):
                continue
            for tok in group.values():
                if not isinstance(tok, dict):
                    continue
                total += 1
                ext = tok.get("$extensions")
                if isinstance(ext, dict) and isinstance(ext.get("design-os.role"), str):
                    roled += 1
    return {"total_tokens": total, "roled_tokens": roled}


def read_taste_votes_signal(project_dir: Path) -> dict[str, Any]:
    """Signal 7: taste-hub votes.jsonl line count, if the ledger exists anywhere it's
    known to live (taste-store.ts's default root, or alongside design/)."""
    for rel in _VOTES_RELS:
        path = project_dir / rel
        if path.is_file():
            return {"exists": True, "count": _count_jsonl_lines(path)}
    return {"exists": False, "count": 0}
