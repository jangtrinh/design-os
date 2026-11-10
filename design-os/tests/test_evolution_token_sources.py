"""`design-os evolution` says which token file it read, and whether a second one disagrees
(spec 033 FR-018). The verdict rule never reads tokens, so these fields are reporting only.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from typer.testing import CliRunner

from design_os import evolution_core
from design_os.cli import app
from design_os.commands.evolution import _render_text

NOW = datetime(2026, 11, 10, tzinfo=timezone.utc)


def _tokens(n: int) -> dict[str, Any]:
    return {"color": {f"c{i}": {"$type": "color", "$value": "#000000"} for i in range(n)}}


def _write(project: Path, rel: str, doc: Any) -> None:
    path = project / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc), encoding="utf-8")


def test_tokens_path_names_the_file_read(tmp_path: Path) -> None:
    _write(tmp_path, "design/design.tokens.json", _tokens(3))

    signals = evolution_core.gather_signals(tmp_path, NOW)

    assert signals["tokens_path"] == "design/design.tokens.json"
    assert "token_sources_differ" not in signals


def test_tokens_path_is_none_when_no_sealed_store(tmp_path: Path) -> None:
    signals = evolution_core.gather_signals(tmp_path, NOW)

    assert signals["tokens_path"] is None
    assert "token_sources_differ" not in signals


def test_differing_counts_report_both_numbers(tmp_path: Path) -> None:
    _write(tmp_path, "design/design.tokens.json", _tokens(12))
    _write(tmp_path, "design/tokens.json", _tokens(7))

    signals = evolution_core.gather_signals(tmp_path, NOW)

    assert signals["token_sources_differ"] == {"sealed": 12, "design_dir": 7}


def test_equal_counts_are_silent(tmp_path: Path) -> None:
    _write(tmp_path, "design/design.tokens.json", _tokens(5))
    _write(tmp_path, "design/tokens.json", _tokens(5))

    assert "token_sources_differ" not in evolution_core.gather_signals(tmp_path, NOW)


def test_nested_groups_are_counted_at_any_depth(tmp_path: Path) -> None:
    sealed = {"color": {"brand": {"500": {"$value": "#111"}, "600": {"$value": "#222"}}}, "$description": "x"}
    _write(tmp_path, "design/design.tokens.json", sealed)
    _write(tmp_path, "design/tokens.json", _tokens(1))

    assert evolution_core.gather_signals(tmp_path, NOW)["token_sources_differ"] == {"sealed": 2, "design_dir": 1}


def test_verdict_does_not_depend_on_the_token_files(tmp_path: Path) -> None:
    before = evolution_core.gather_signals(tmp_path, NOW)["verdict"]
    _write(tmp_path, "design/design.tokens.json", _tokens(12))
    _write(tmp_path, "design/tokens.json", _tokens(7))

    assert evolution_core.gather_signals(tmp_path, NOW)["verdict"] == before


def test_text_prints_one_line_for_the_difference(tmp_path: Path) -> None:
    _write(tmp_path, "design/design.tokens.json", _tokens(12))
    _write(tmp_path, "design/tokens.json", _tokens(7))

    text = _render_text(evolution_core.gather_signals(tmp_path, NOW))

    assert "token file read: design/design.tokens.json" in text
    assert text.count("token sources differ") == 1
    assert "design/tokens.json has 7 tokens; role coverage above reads design/design.tokens.json" in text


def test_text_does_not_claim_a_count_for_the_file_the_role_line_reads(tmp_path: Path) -> None:
    """The role line counts only group -> token (two levels); a nested store would show
    `0/1` there, so the differ line must not state a different count for the same file."""
    nested = {"color": {"brand": {"500": {"$value": "#111"}, "600": {"$value": "#222"}, "700": {"$value": "#333"}}}}
    _write(tmp_path, "design/design.tokens.json", nested)
    _write(tmp_path, "design/tokens.json", _tokens(1))

    text = _render_text(evolution_core.gather_signals(tmp_path, NOW))

    assert "has 3 tokens" not in text
    assert "role coverage above reads design/design.tokens.json" in text


def test_a_sealed_store_that_is_not_an_object_is_unreadable(tmp_path: Path) -> None:
    _write(tmp_path, "design/design.tokens.json", [1, 2, 3])
    _write(tmp_path, "design/tokens.json", _tokens(1))

    signals = evolution_core.gather_signals(tmp_path, NOW)

    assert signals["tokens_path"] is None
    assert "token_sources_differ" not in signals


def test_a_second_store_that_is_not_an_object_is_not_counted(tmp_path: Path) -> None:
    _write(tmp_path, "design/design.tokens.json", _tokens(2))
    _write(tmp_path, "design/tokens.json", "just a string")

    assert "token_sources_differ" not in evolution_core.gather_signals(tmp_path, NOW)


def test_json_output_contains_both_fields(runner: CliRunner, tmp_path: Path) -> None:
    _write(tmp_path, "design/design.tokens.json", _tokens(12))
    _write(tmp_path, "design/tokens.json", _tokens(7))

    res = runner.invoke(app, ["evolution", "--dir", str(tmp_path), "--json"])

    data = json.loads(res.stdout)["data"]
    assert res.exit_code == 0
    assert data["tokens_path"] == "design/design.tokens.json"
    assert data["token_sources_differ"] == {"sealed": 12, "design_dir": 7}
