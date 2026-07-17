"""Pure decision core for `design-os heartbeat`'s `reflect` task (spec 006 P5 Decision 5):
the export-corpus cursor, job-event selection, the echo-guard baseline, and the one-lesson
gate. No subprocess, no model call, no wall-clock read — the runner
(commands/heartbeat_runners_learning.py) owns the `ui`/`recall` shell-outs and calls these
in order: select → gate → record (its own job) → :func:`advance_cursor` LAST, only once the
record has actually landed (Decision 5 step 6).

`recall reflect` itself has no kernel seam of its own to source job events from, so the
cursor rides `memory export-corpus --since` (Decision 5) — the same content-addressed-id
style as harvest_core's sha256 cursor, just keyed on the ledger's own monotonic event ids
instead.
"""

from __future__ import annotations

import json
import re
from collections.abc import Sequence
from pathlib import Path
from typing import Any

MIN_LESSON, MAX_LESSON = 40, 500

_STATE_REL = Path("design") / "reflect-state.json"
_LEDGER_REL = Path("design") / "memory.events.jsonl"
_EVENT_ID_RE = re.compile(r"^e(\d+)$")


def _event_id_number(id_: str) -> int | None:
    """`"e12"` → `12`; `None` for anything not a well-formed monotonic ledger id."""
    m = _EVENT_ID_RE.match(id_)
    return int(m.group(1)) if m else None


def load_state(project_dir: Path) -> dict[str, Any]:
    """Read `design/reflect-state.json`; a missing/corrupt file reads as a fresh cursor
    (`lastEventId: None` — nothing harvested yet)."""
    default: dict[str, Any] = {"version": 1, "lastEventId": None}
    path = project_dir / _STATE_REL
    try:
        data = json.loads(path.read_text()) if path.is_file() else None
    except json.JSONDecodeError:
        data = None
    if not isinstance(data, dict):
        return default
    data.setdefault("version", 1)
    data.setdefault("lastEventId", None)
    return data


def save_state(project_dir: Path, state: dict[str, Any]) -> None:
    """Write the cursor: sorted keys, 2-space indent, trailing newline — byte-stable."""
    path = project_dir / _STATE_REL
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def select_job_events(corpus_items: Sequence[dict[str, Any]], cursor: str | None) -> list[str]:
    """The ids (in the corpus's own order) whose event-id number is strictly greater than
    `cursor`'s. Mirrors `memory-corpus.ts`'s `exportCorpus` `sinceId` cut — defense-in-depth
    against a caller that forgot `--since` on the `export-corpus` shell-out, since the
    runner is expected to pass it (Decision 5 step 1)."""
    floor = (_event_id_number(cursor) or 0) if cursor else 0
    ids: list[str] = []
    for item in corpus_items:
        id_ = item.get("id") if isinstance(item, dict) else None
        if not isinstance(id_, str):
            continue
        n = _event_id_number(id_)
        if n is not None and n > floor:
            ids.append(id_)
    return ids


def has_enough_events(ids: Sequence[str], min_events: int) -> bool:
    return len(ids) >= min_events


def max_event_id(ids: Sequence[str]) -> str | None:
    """The id with the largest event-id number — the value the cursor should advance to."""
    numbered = [(_event_id_number(i), i) for i in ids]
    numbered = [(n, i) for n, i in numbered if n is not None]
    if not numbered:
        return None
    return max(numbered, key=lambda pair: pair[0])[1]


def advance_cursor(state: dict[str, Any], job_ids: Sequence[str]) -> dict[str, Any]:
    """A NEW state dict with `lastEventId` bumped to `max_event_id(job_ids)`. Pure — does
    not persist anything. The caller MUST only call this (and then :func:`save_state`)
    after the reflect insight has actually landed in the ledger; a run that fails between
    recording and advancing simply re-selects the same job events next time, which is safe
    (the echo guard + the model itself decide whether that yields the same lesson again)."""
    new_last = max_event_id(job_ids)
    if new_last is None:
        return dict(state)
    return {**state, "lastEventId": new_last}


def latest_insight_text(project_dir: Path) -> str | None:
    """The `data.text` of the most recent `insight` event in the project's ledger, or
    `None` if there isn't one yet — the echo-guard baseline (Decision 5 step 5)."""
    path = project_dir / _LEDGER_REL
    if not path.is_file():
        return None
    latest: str | None = None
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(event, dict) or event.get("type") != "insight":
            continue
        data = event.get("data")
        text = data.get("text") if isinstance(data, dict) else None
        if isinstance(text, str):
            latest = text
    return latest


_REFLECT_RESPONSE_RULE = (
    "Respond with ONLY the one lesson's text — no preamble, no markdown, no write-back command."
)


def build_reflect_prompt(packet: dict[str, Any]) -> str:
    """Assemble a plain-text model prompt from `recall reflect --json`'s packet: the
    instruction, this job's events, and its semantic neighbours (Decision 5 step 4)."""
    lines = [str(packet.get("instruction") or ""), "", "This job's events:"]
    for item in packet.get("jobItems") or []:
        lines.append(f"- [{item.get('id')}] ({item.get('tier')}) {item.get('text')}")
    lines += ["", "What memory already knows that is relevant:"]
    for n in packet.get("neighbors") or []:
        lines.append(f"- [{n.get('id')}] ({n.get('source')}/{n.get('tier')}) {n.get('text')}")
    lines += ["", _REFLECT_RESPONSE_RULE]
    return "\n".join(lines) + "\n"


def gate_lesson(text: str, latest_existing_insight: str | None) -> tuple[bool, str | None]:
    """`(accepted, reason)` — the one-lesson gate (Decision 5 step 5): length in
    `[MIN_LESSON, MAX_LESSON]`, and not byte-identical to the project's most recent existing
    insight (a cheap "did the model just echo a neighbour" guard)."""
    stripped = text.strip()
    if not (MIN_LESSON <= len(stripped) <= MAX_LESSON):
        return False, "lesson-length"
    if latest_existing_insight is not None and stripped == latest_existing_insight.strip():
        return False, "lesson-echoes-latest-insight"
    return True, None
