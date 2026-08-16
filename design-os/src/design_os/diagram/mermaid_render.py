"""Serialize the Mermaid IR: a Markdown digest or the full JSON IR.

Intermediate data only — no HTML, no SVG, no rendering. Every label is Markdown-escaped
on the way out because it is untrusted source text.

Vendored from cathrynlavery/diagram-design (MIT, (c) 2025 Cathryn Lavery).
Ported verbatim except for the module split the ~200-line rule (Art IX) requires;
every safety limit and parser body is unchanged.
"""

from __future__ import annotations

import html
import json
import re
from dataclasses import asdict
from pathlib import Path

from .mermaid_analyze import analyze
from .mermaid_model import Diagram


def _escape_markdown(text: str) -> str:
    encoded = html.escape(text, quote=False)
    return re.sub(r"([\\`*{}\[\]()#+\-.!_|>])", r"\\\1", encoded)


def _escape_table(text: str) -> str:
    return _escape_markdown(text.replace("\n", " ⏎ "))


def digest(
    path: Path,
    diagrams: list[Diagram],
    selected: list[Diagram],
    max_rows: int,
) -> str:
    output = [f"# Mermaid IR — {path.name}", ""]
    output.append(
        f"{len(diagrams)} diagram(s): "
        + ", ".join(
            f"[{diagram.index}] {diagram.kind} ({len(diagram.nodes)}n/{len(diagram.edges)}e)"
            for diagram in diagrams
        )
    )
    for diagram in selected:
        info = analyze(diagram)
        output.extend(
            [
                "",
                f"## Diagram {diagram.index} — {diagram.kind}",
                "",
                f"- source layout: none (Mermaid is layout-free); direction: {diagram.direction}",
                f"- nodes: {info['nodes_total']} total / {info['nodes_drawable']} drawable / "
                f"{info['containers']} containers, depth {info['max_depth']}",
                f"- edges: {info['edges_total']} ({info['edges_labeled']} labeled, "
                f"{info['edges_dangling']} dangling), cycle: {info['has_cycle']}",
                f"- shapes: {info['shapes']}",
                f"- type candidates: {', '.join(info['type_candidates'])}",
                f"- budget: nodes {'OVER' if info['over_node_budget'] else 'ok'} (max 9), "
                f"edges {'OVER' if info['over_edge_budget'] else 'ok'} (max 12)",
            ]
        )
        if diagram.discarded["style_directives"] or diagram.discarded["click_handlers"]:
            output.append(
                f"- discarded: {diagram.discarded['style_directives']} style directives, "
                f"{diagram.discarded['click_handlers']} click handlers"
            )
        if diagram.fragments:
            fragments = ", ".join(
                f"{item['kind']}({_escape_markdown(item['label'] or 'unlabeled')})"
                for item in diagram.fragments
            )
            output.append(f"- fragments: {fragments}")
        if diagram.notes:
            output.append(
                f"- notes: {'; '.join(_escape_markdown(note) for note in diagram.notes[:6])}"
            )
        if info["hubs"]:
            output.append(
                "- hubs (focal candidates): "
                + ", ".join(
                    f"{_escape_markdown(hub['label'])}({hub['degree']})"
                    for hub in info["hubs"]
                )
            )
        if info["entry_points"]:
            output.append(
                f"- entry points: {', '.join(_escape_markdown(label) for label in info['entry_points'])}"
            )
        if info["terminals"]:
            output.append(
                f"- terminals: {', '.join(_escape_markdown(label) for label in info['terminals'])}"
            )
        if info["orphans"]:
            output.append(
                f"- unconnected: {', '.join(_escape_markdown(label) for label in info['orphans'])}"
            )
        if info["collapsible_groups"]:
            output.append("- collapsible groups (simplify here first):")
            for group in info["collapsible_groups"]:
                output.append(
                    f"  - {_escape_markdown(group['label'])} — {group['children']} children: "
                    + ", ".join(_escape_markdown(label) for label in group["child_labels"])
                )

        output.extend(
            [
                "",
                "### Nodes",
                "",
                "| id | label | shape | depth | parent | deg | fields |",
                "|---|---|---|---|---|---|---|",
            ]
        )
        for node in diagram.nodes[:max_rows]:
            output.append(
                f"| {_escape_table(node.id)} | {_escape_table(node.label)} | {node.shape} | "
                f"{node.depth} | {node.parent or '-'} | {node.in_degree}/{node.out_degree} | "
                f"{_escape_table('; '.join(node.fields)) or '-'} |"
            )
        if len(diagram.nodes) > max_rows:
            output.append(
                f"| … | +{len(diagram.nodes) - max_rows} more (use --json) | | | | | |"
            )

        output.extend(
            [
                "",
                "### Edges",
                "",
                "| source | target | label | style |",
                "|---|---|---|---|",
            ]
        )
        names = {node.id: node.label.split("\n")[0] for node in diagram.nodes}
        for edge in diagram.edges[:max_rows]:
            marks = [edge.style, edge.arrowhead]
            if edge.bidirectional:
                marks.append("bidir")
            if edge.undirected:
                marks.append("undirected")
            output.append(
                f"| {_escape_table(names.get(edge.source, edge.source))} | "
                f"{_escape_table(names.get(edge.target, edge.target))} | "
                f"{_escape_table(edge.label) or '-'} | {' '.join(marks)} |"
            )
        if len(diagram.edges) > max_rows:
            output.append(
                f"| … | +{len(diagram.edges) - max_rows} more (use --json) | | |"
            )
    output.append("")
    return "\n".join(output)


def to_json(path: Path, diagrams: list[Diagram], selected: list[Diagram]) -> str:
    return json.dumps(
        {
            "source": str(path),
            "diagrams_total": len(diagrams),
            "diagrams": [
                {
                    "index": diagram.index,
                    "kind": diagram.kind,
                    "source_line": diagram.source_line,
                    "direction": diagram.direction,
                    "analysis": analyze(diagram),
                    "discarded": diagram.discarded,
                    "fragments": diagram.fragments,
                    "notes": diagram.notes,
                    "nodes": [asdict(node) for node in diagram.nodes],
                    "edges": [asdict(edge) for edge in diagram.edges],
                }
                for diagram in selected
            ],
        },
        indent=2,
        ensure_ascii=False,
    )
