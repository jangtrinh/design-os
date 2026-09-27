"""`compute_verdict(signals, now)` — the throughput clock. A loop is ALIVE only while it
graduates gaps, keeps its open gaps young and is still receiving gap/retro events; a ledger
that merely EVER held an insight or gap is a museum, not a loop. Every window is asserted in
both directions (removing the cause flips the verdict back)."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from design_os import evolution_core

NOW = datetime(2026, 9, 26, 12, 0, tzinfo=timezone.utc)


def _t(days_ago: float) -> str:
    return (NOW - timedelta(days=days_ago)).strftime("%Y-%m-%dT%H:%M:%SZ")


def _write(project: Path, events: list[dict[str, object]]) -> None:
    (project / "design").mkdir(parents=True, exist_ok=True)
    (project / "design" / "memory.events.jsonl").write_text(
        "\n".join(json.dumps(e) for e in events) + "\n", encoding="utf-8",
    )


def _gap(n: int, days_ago: float) -> dict[str, object]:
    return {"v": 1, "id": f"g{n}", "t": _t(days_ago), "type": "gap",
            "data": {"text": f"gap {n}", "target": "taste-rubric.md#motion"}}


def _graduation(n: int, gap_id: str, days_ago: float) -> dict[str, object]:
    return {"v": 1, "id": f"i{n}", "t": _t(days_ago), "type": "insight", "refs": [gap_id],
            "data": {"text": f"graduated {gap_id}"}}


def _vsf_shaped() -> list[dict[str, object]]:
    """30 open gaps aged 20-80 days (last gap filed 09-26), 4 insights that resolve no gap."""
    events: list[dict[str, object]] = [
        {"v": 1, "id": "h1", "t": _t(70), "type": "harvested", "data": {"source": "figma"}},
        {"v": 1, "id": "h2", "t": _t(70), "type": "harvested", "data": {"source": "figma"}},
    ]
    events += [
        {"v": 1, "id": f"n{i}", "t": _t(70), "type": "insight", "refs": ["h1"],
         "data": {"text": f"insight {i}"}}
        for i in range(4)
    ]
    events += [_gap(i, 80 - i * 2) for i in range(29)]
    events.append(_gap(29, 0))
    return events


def _young_gaps_with_graduation() -> list[dict[str, object]]:
    return [_gap(1, 9), _gap(2, 4), _gap(3, 2), _graduation(1, "g1", 5)]


def test_vsf_shaped_ledger_is_dead_loop_with_the_three_numbers(tmp_path: Path) -> None:
    _write(tmp_path, _vsf_shaped())

    signals = evolution_core.gather_signals(tmp_path, NOW)

    assert signals["verdict"] == "DEAD-LOOP"
    clock = signals["clock"]
    assert clock["graduated_30d"] == 0
    assert clock["open_gap_count"] == 30
    assert clock["median_open_gap_age_days"] > 30
    assert 0 <= clock["days_since_last_gap_or_retro"] < 1


def test_recent_graduation_with_young_gaps_is_alive(tmp_path: Path) -> None:
    _write(tmp_path, _young_gaps_with_graduation())

    signals = evolution_core.gather_signals(tmp_path, NOW)

    assert signals["verdict"] == "ALIVE"
    assert signals["clock"]["graduated_30d"] == 1
    assert signals["clock"]["open_gap_count"] == 2  # g1 was graduated; g2/g3 are open
    assert signals["clock"]["median_open_gap_age_days"] < 30


def test_removing_the_graduation_flips_alive_back_to_dead_loop(tmp_path: Path) -> None:
    events = _young_gaps_with_graduation()
    _write(tmp_path, events)
    assert evolution_core.gather_signals(tmp_path, NOW)["verdict"] == "ALIVE"

    _write(tmp_path, [e for e in events if e["type"] != "insight"])

    assert evolution_core.gather_signals(tmp_path, NOW)["verdict"] == "DEAD-LOOP"


def test_adding_a_fresh_graduation_flips_dead_loop_to_alive(tmp_path: Path) -> None:
    """The mirror direction, on the VSF-shaped ledger: age-stale gaps also flip once the
    stale ones are graduated away, not merely because a graduation exists."""
    events = _vsf_shaped()
    _write(tmp_path, events)
    assert evolution_core.gather_signals(tmp_path, NOW)["verdict"] == "DEAD-LOOP"

    graduated = [_graduation(n, f"g{n}", 3) for n in range(29)]  # resolves every stale gap
    _write(tmp_path, [*events, *graduated])

    signals = evolution_core.gather_signals(tmp_path, NOW)
    assert signals["clock"]["open_gap_count"] == 1
    assert signals["verdict"] == "ALIVE"


def test_an_insight_that_resolves_no_gap_is_not_a_graduation(tmp_path: Path) -> None:
    events = [_gap(1, 3), {"v": 1, "id": "i9", "t": _t(1), "type": "insight", "refs": ["e-other"],
                            "data": {"text": "a lesson, not a graduation"}}]
    _write(tmp_path, events)

    signals = evolution_core.gather_signals(tmp_path, NOW)

    assert signals["clock"]["graduated_30d"] == 0
    assert signals["verdict"] == "DEAD-LOOP"


def test_graduation_older_than_thirty_days_does_not_count(tmp_path: Path) -> None:
    _write(tmp_path, [_gap(1, 40), _gap(2, 2), _graduation(1, "g1", 31)])
    assert evolution_core.gather_signals(tmp_path, NOW)["verdict"] == "DEAD-LOOP"

    _write(tmp_path, [_gap(1, 40), _gap(2, 2), _graduation(1, "g1", 29)])
    assert evolution_core.gather_signals(tmp_path, NOW)["verdict"] == "ALIVE"


def test_median_open_gap_age_of_thirty_days_or_more_is_dead(tmp_path: Path) -> None:
    fresh = [_gap(1, 1), _graduation(1, "g1", 2)]
    # three open gaps, median 45 days: one young, two old -> median is the old one
    _write(tmp_path, [*fresh, _gap(2, 45), _gap(3, 50), _gap(4, 3)])
    signals = evolution_core.gather_signals(tmp_path, NOW)
    assert signals["clock"]["median_open_gap_age_days"] == 45
    assert signals["verdict"] == "DEAD-LOOP"

    _write(tmp_path, [*fresh, _gap(2, 45), _gap(3, 5), _gap(4, 3)])  # median 5
    assert evolution_core.gather_signals(tmp_path, NOW)["verdict"] == "ALIVE"


def test_no_gap_or_retro_event_in_seven_days_is_dead(tmp_path: Path) -> None:
    _write(tmp_path, [_gap(1, 9), _graduation(1, "g1", 5), _gap(2, 8)])
    signals = evolution_core.gather_signals(tmp_path, NOW)
    assert signals["clock"]["days_since_last_gap_or_retro"] == 8
    assert signals["verdict"] == "DEAD-LOOP"

    retro = {"v": 1, "id": "r1", "t": _t(1), "type": "retro", "data": {"text": "session retro"}}
    _write(tmp_path, [_gap(1, 9), _graduation(1, "g1", 5), _gap(2, 8), retro])
    assert evolution_core.gather_signals(tmp_path, NOW)["verdict"] == "ALIVE"


def test_wired_and_no_loop_semantics_are_unchanged(tmp_path: Path) -> None:
    empty: dict[str, object] = {
        "ledger": {"exists": False, "insight_events": 0, "gap_events": 0,
                   "graduation_times": [], "open_gap_times": [], "learning_event_times": []},
        "soul": {"ratified": False},
        "heartbeat": {"wired": False, "fired": False},
    }
    assert evolution_core.compute_verdict(empty, NOW) == "NO-LOOP"

    wired = {**empty, "heartbeat": {"wired": True, "fired": False}}
    assert evolution_core.compute_verdict(wired, NOW) == "WIRED"

    fired = {**empty, "heartbeat": {"wired": True, "fired": True}}
    assert evolution_core.compute_verdict(fired, NOW) == "DEAD-LOOP"


def test_undated_open_gap_is_counted_not_silently_dropped(tmp_path: Path) -> None:
    undated = {"v": 1, "id": "gx", "type": "gap", "data": {"text": "no t", "target": "x.md"}}
    _write(tmp_path, [*_young_gaps_with_graduation(), undated])

    clock = evolution_core.gather_signals(tmp_path, NOW)["clock"]

    assert clock["open_gaps_undated"] == 1
    assert clock["open_gap_count"] == 3


def test_text_output_prints_the_three_numbers(tmp_path: Path) -> None:
    from design_os.commands.evolution import _render_text

    _write(tmp_path, _vsf_shaped())

    text = _render_text(evolution_core.gather_signals(tmp_path, NOW))

    assert "graduated in 30d: 0" in text
    assert "median open-gap age:" in text
    assert "last gap/retro:" in text
