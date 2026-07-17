"""`reflect_core` — pure, no model, no subprocess (spec 006 P5 Decision 5)."""

from __future__ import annotations

import json
from pathlib import Path

from design_os import reflect_core

_OK_LESSON = "x" * 60  # clears MIN_LESSON (40), clears MAX_LESSON (500)


def _write_ledger(project: Path, events: list[dict[str, object]]) -> None:
    (project / "design").mkdir(parents=True, exist_ok=True)
    path = project / "design" / "memory.events.jsonl"
    path.write_text("\n".join(json.dumps(e) for e in events) + "\n", encoding="utf-8")


# ─── job-event selection ────────────────────────────────────────────────────────────

def test_job_events_are_the_ids_since_the_cursor() -> None:
    corpus = [{"id": "e1"}, {"id": "e2"}, {"id": "e3"}, {"id": "e4"}]

    ids = reflect_core.select_job_events(corpus, cursor="e2")

    assert ids == ["e3", "e4"]


def test_job_events_with_no_cursor_returns_every_id() -> None:
    corpus = [{"id": "e1"}, {"id": "e2"}]

    ids = reflect_core.select_job_events(corpus, cursor=None)

    assert ids == ["e1", "e2"]


def test_fewer_than_min_events_yields_no_job() -> None:
    ids = ["e1", "e2", "e3"]

    assert reflect_core.has_enough_events(ids, min_events=5) is False
    assert reflect_core.has_enough_events(ids + ["e4", "e5"], min_events=5) is True


# ─── cursor advancement ─────────────────────────────────────────────────────────────

def test_cursor_advances_only_after_the_insight_is_recorded(tmp_path: Path) -> None:
    project = tmp_path
    (project / "design").mkdir()

    state = reflect_core.load_state(project)
    assert state["lastEventId"] is None

    job_ids = reflect_core.select_job_events([{"id": "e1"}, {"id": "e2"}, {"id": "e3"}], state["lastEventId"])
    reflect_core.gate_lesson(_OK_LESSON, None)  # selecting/gating alone must not touch state

    assert reflect_core.load_state(project)["lastEventId"] is None

    # Simulate: the runner recorded the insight, and only THEN advances + persists the cursor.
    new_state = reflect_core.advance_cursor(state, job_ids)
    reflect_core.save_state(project, new_state)

    assert reflect_core.load_state(project)["lastEventId"] == "e3"


def test_max_event_id_ignores_malformed_ids() -> None:
    assert reflect_core.max_event_id(["e1", "not-an-id", "e10", "e2"]) == "e10"
    assert reflect_core.max_event_id([]) is None


# ─── the one-lesson gate ────────────────────────────────────────────────────────────

def test_a_lesson_shorter_than_40_chars_is_dropped() -> None:
    accepted, reason = reflect_core.gate_lesson("too short", None)

    assert accepted is False
    assert reason == "lesson-length"


def test_a_lesson_longer_than_500_chars_is_dropped() -> None:
    accepted, reason = reflect_core.gate_lesson("x" * 501, None)

    assert accepted is False
    assert reason == "lesson-length"


def test_a_lesson_identical_to_the_latest_existing_insight_is_dropped() -> None:
    accepted, reason = reflect_core.gate_lesson(_OK_LESSON, latest_existing_insight=_OK_LESSON)

    assert accepted is False
    assert reason == "lesson-echoes-latest-insight"


def test_a_lesson_that_differs_from_the_latest_insight_is_accepted() -> None:
    accepted, reason = reflect_core.gate_lesson(_OK_LESSON, latest_existing_insight="y" * 60)

    assert accepted is True
    assert reason is None


def test_latest_insight_text_reads_the_most_recent_insight_event(tmp_path: Path) -> None:
    _write_ledger(tmp_path, [
        {"id": "e1", "type": "insight", "data": {"text": "first lesson"}},
        {"id": "e2", "type": "lint_run", "data": {"check": "a11y-lint"}},
        {"id": "e3", "type": "insight", "data": {"text": "latest lesson"}},
    ])

    assert reflect_core.latest_insight_text(tmp_path) == "latest lesson"


def test_latest_insight_text_is_none_when_the_ledger_has_no_insight(tmp_path: Path) -> None:
    _write_ledger(tmp_path, [{"id": "e1", "type": "lint_run", "data": {"check": "a11y-lint"}}])

    assert reflect_core.latest_insight_text(tmp_path) is None


def test_latest_insight_text_is_none_when_the_ledger_is_missing(tmp_path: Path) -> None:
    assert reflect_core.latest_insight_text(tmp_path) is None
