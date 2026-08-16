"""`design_os.diagram.mermaid_*` — the vendored Mermaid structural extractor.

The load-bearing contract is the *allowlist*: flowchart/graph, sequenceDiagram,
stateDiagram-v2, and erDiagram parse; everything else is refused outright rather than
half-parsed. Styling and click targets are counted and dropped, source is read under a
4 MiB cap, and the output is inert intermediate data — never markup.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from design_os.diagram import mermaid_model
from design_os.diagram.mermaid_extract import main
from design_os.diagram.mermaid_model import (
    MAX_EDGES,
    MAX_NODES,
    MAX_SOURCE_BYTES,
    UNSUPPORTED_KINDS,
)

_FLOWCHART = """flowchart TD
  A[Client] -->|POST| B{Auth?}
  B -- yes --> C([Session])
"""


def _write(tmp_path: Path, name: str, text: str) -> Path:
    path = tmp_path / name
    path.write_text(text, encoding="utf-8")
    return path


# ─── the IR ──────────────────────────────────────────────────────────────────────────

def test_a_minimal_flowchart_digests_to_the_expected_nodes_and_edges(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert main([str(_write(tmp_path, "min.mmd", _FLOWCHART))]) == 0

    out = capsys.readouterr().out
    assert "1 diagram(s): [0] flowchart (3n/2e)" in out
    assert "| A | Client | rect | 0 | - | 0/1 | - |" in out
    assert "| B | Auth? | rhombus | 0 | - | 1/1 | - |" in out
    assert "| C | Session | stadium | 0 | - | 1/0 | - |" in out
    assert "| Client | Auth? | POST | solid arrow |" in out
    assert "| Auth? | Session | yes | solid arrow |" in out


def test_the_json_ir_carries_every_node_and_edge(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert main([str(_write(tmp_path, "min.mmd", _FLOWCHART)), "--json"]) == 0

    diagram = json.loads(capsys.readouterr().out)["diagrams"][0]
    assert diagram["kind"] == "flowchart"
    assert [node["id"] for node in diagram["nodes"]] == ["A", "B", "C"]
    assert [(edge["source"], edge["target"]) for edge in diagram["edges"]] == [
        ("A", "B"),
        ("B", "C"),
    ]


def test_a_fenced_mermaid_block_in_markdown_is_extracted(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    document = f"# Notes\n\nprose above\n\n```mermaid\n{_FLOWCHART}```\n\nprose below\n"

    assert main([str(_write(tmp_path, "notes.md", document))]) == 0

    out = capsys.readouterr().out
    assert "1 diagram(s): [0] flowchart (3n/2e)" in out
    assert "prose above" not in out


@pytest.mark.parametrize(
    ("kind", "source"),
    [
        ("sequenceDiagram", "sequenceDiagram\n  U->>S: request\n"),
        ("stateDiagram-v2", "stateDiagram-v2\n  [*] --> Idle\n  Idle --> Done\n"),
        ("erDiagram", "erDiagram\n  CUSTOMER ||--o{ ORDER : places\n"),
    ],
)
def test_each_supported_grammar_parses(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], kind: str, source: str
) -> None:
    assert main([str(_write(tmp_path, "d.mmd", source)), "--json"]) == 0

    diagram = json.loads(capsys.readouterr().out)["diagrams"][0]
    assert diagram["kind"] == kind
    assert diagram["edges"], "the supported grammar must yield a real edge"


def test_the_extractor_emits_intermediate_data_and_never_markup(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    source = _write(tmp_path, "min.mmd", _FLOWCHART)
    main([str(source)])
    main([str(source), "--json"])

    emitted = capsys.readouterr().out.lower()
    for markup in ("<svg", "<html", "<script", "<div"):
        assert markup not in emitted


# ─── the allowlist and the trust boundary ────────────────────────────────────────────

@pytest.mark.parametrize(
    "source",
    [
        'pie title Votes\n  "A" : 42\n  "B" : 58\n',
        "mindmap\n  root((core))\n    a\n",
        "gantt\n  title Sched\n  section A\n  t1 :a1, 2024-01-01, 30d\n",
        "timeline\n  title History\n  2024 : shipped\n",
        "sankey-beta\n  A,B,10\n",
        "journey\n  title Day\n  section Go\n    Wake: 5: Me\n",
    ],
)
def test_an_unsupported_diagram_kind_is_refused_not_partially_parsed(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], source: str
) -> None:
    with pytest.raises(SystemExit) as exit_info:
        main([str(_write(tmp_path, "other.mmd", source))])

    assert exit_info.value.code == 2
    captured = capsys.readouterr()
    assert "unsupported diagram kind" in captured.err
    assert "flowchart, sequenceDiagram, stateDiagram-v2, erDiagram" in captured.err
    assert captured.out == ""  # no partial IR escapes for a refused grammar


def test_the_unsupported_kind_list_still_covers_the_vendored_grammars() -> None:
    assert {"pie", "mindmap", "gantt", "timeline", "sankey", "journey"} <= UNSUPPORTED_KINDS


def test_style_and_click_directives_are_counted_and_discarded(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    hostile = _FLOWCHART + 'style A fill:#f9f\nclick A "https://evil.example.com"\n'
    source = _write(tmp_path, "styled.mmd", hostile)

    main([str(source)])
    main([str(source), "--json"])

    emitted = capsys.readouterr().out
    assert "- discarded: 1 style directives, 1 click handlers" in emitted
    assert "evil.example.com" not in emitted  # the click target never crosses over


def test_a_source_over_the_cap_is_refused(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    padding = "%% pad\n" * ((MAX_SOURCE_BYTES // 7) + 1)

    with pytest.raises(SystemExit) as exit_info:
        main([str(_write(tmp_path, "huge.mmd", _FLOWCHART + padding))])

    assert exit_info.value.code == 2
    assert "source exceeds the 4 MiB limit" in capsys.readouterr().err


def test_the_node_limit_stops_an_unbounded_graph(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    # The real ceiling is 2000 nodes; shrink it so the guard runs cheaply, then assert
    # the shipped constants separately.
    monkeypatch.setattr(mermaid_model, "MAX_NODES", 2)

    with pytest.raises(SystemExit) as exit_info:
        main([str(_write(tmp_path, "wide.mmd", _FLOWCHART))])

    assert exit_info.value.code == 2
    assert "node limit exceeded" in capsys.readouterr().err


def test_the_shipped_limits_are_the_vendored_ones() -> None:
    assert MAX_SOURCE_BYTES == 4 * 1024 * 1024
    assert MAX_NODES == 2000
    assert MAX_EDGES == 5000
