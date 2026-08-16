"""Serialize the draw.io IR: a Markdown digest or the full JSON IR.

Intermediate data only — no HTML, no SVG, no rendering.

Vendored from cathrynlavery/diagram-design (MIT, (c) 2025 Cathryn Lavery).
Ported verbatim except for the module split the ~200-line rule (Art IX) requires;
every safety limit and parser body is unchanged.
"""

from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path

from .drawio_analyze import analyze
from .drawio_model import Page


def page_bounds(page: Page) -> tuple[float, float, float, float]:
    boxes = [(n.x, n.y, n.x + n.w, n.y + n.h) for n in page.nodes if n.w and n.h]
    if not boxes:
        return (0.0, 0.0, 0.0, 0.0)
    return (
        min(b[0] for b in boxes),
        min(b[1] for b in boxes),
        max(b[2] for b in boxes),
        max(b[3] for b in boxes),
    )


def digest(path: Path, pages: list[Page], selected: list[Page], max_rows: int) -> str:
    out: list[str] = []
    out.append(f"# draw.io IR — {path.name}")
    out.append("")
    out.append(
        f"{len(pages)} page(s): "
        + ", ".join(f"[{p.index}] {p.name} ({len(p.nodes)}n/{len(p.edges)}e)" for p in pages)
    )
    for page in selected:
        info = analyze(page)
        x0, y0, x1, y1 = page_bounds(page)
        out.append("")
        out.append(f"## Page {page.index} — {page.name}")
        out.append("")
        out.append(
            f"- source canvas: {int(x1 - x0)}×{int(y1 - y0)} px "
            f"(aspect {((x1 - x0) / (y1 - y0)):.2f})"
            if y1 > y0
            else "- source canvas: empty"
        )
        out.append(
            f"- nodes: {info['nodes_total']} total / {info['nodes_drawable']} drawable "
            f"/ {info['containers']} containers, depth {info['max_depth']}"
        )
        out.append(
            f"- edges: {info['edges_total']} ({info['edges_labeled']} labeled, "
            f"{info['edges_dangling']} dangling), cycle: {info['has_cycle']}"
        )
        out.append(f"- shapes: {info['shapes']}")
        out.append(f"- type candidates: {', '.join(info['type_candidates'])}")
        out.append(
            f"- budget: nodes {'OVER' if info['over_node_budget'] else 'ok'} (max 9), "
            f"edges {'OVER' if info['over_edge_budget'] else 'ok'} (max 12)"
        )
        if info["hubs"]:
            hubs = ", ".join(f"{h['label'] or h['id']}({h['degree']})" for h in info["hubs"])
            out.append(f"- hubs (focal candidates): {hubs}")
        if info["entry_points"]:
            out.append(f"- entry points: {', '.join(info['entry_points'])}")
        if info["terminals"]:
            out.append(f"- terminals: {', '.join(info['terminals'])}")
        if info["orphans"]:
            out.append(f"- unconnected: {', '.join(info['orphans'])}")
        if info["collapsible_groups"]:
            out.append("- collapsible groups (simplify here first):")
            for group in info["collapsible_groups"]:
                kids = ", ".join(group["child_labels"])
                out.append(f"  - {group['label']} — {group['children']} children: {kids}")

        out.append("")
        out.append("### Nodes")
        out.append("")
        out.append("| id | label | shape | depth | parent | deg | box |")
        out.append("|---|---|---|---|---|---|---|")
        listed = [n for n in page.nodes if n.label or n.children]
        for node in listed[:max_rows]:
            label = node.label.replace("\n", " ⏎ ").replace("|", "\\|")
            out.append(
                f"| {node.id} | {label} | {node.shape} | {node.depth} | "
                f"{node.parent or '-'} | {node.in_degree}/{node.out_degree} | "
                f"{int(node.x)},{int(node.y)} {int(node.w)}×{int(node.h)} |"
            )
        if len(listed) > max_rows:
            out.append(f"| … | +{len(listed) - max_rows} more (use --json) | | | | | |")

        out.append("")
        out.append("### Edges")
        out.append("")
        out.append("| source | target | label | style |")
        out.append("|---|---|---|---|")
        names = {n.id: (n.label.split("\n")[0] or n.id) for n in page.nodes}
        for edge in page.edges[:max_rows]:
            marks = []
            if edge.dashed:
                marks.append("dashed")
            if edge.bidirectional:
                marks.append("bidir")
            if edge.undirected:
                marks.append("undirected")
            out.append(
                f"| {names.get(edge.source or '', '?')} | {names.get(edge.target or '', '?')} "
                f"| {edge.label.replace('|', chr(92) + '|') or '-'} | {' '.join(marks) or '-'} |"
            )
        if len(page.edges) > max_rows:
            out.append(f"| … | +{len(page.edges) - max_rows} more (use --json) | | |")
    out.append("")
    return "\n".join(out)


def to_json(path: Path, pages: list[Page], selected: list[Page]) -> str:
    payload = {
        "source": str(path),
        "pages_total": len(pages),
        "pages": [
            {
                "id": p.id,
                "name": p.name,
                "index": p.index,
                "bounds": dict(zip(("x0", "y0", "x1", "y1"), page_bounds(p))),
                "analysis": analyze(p),
                "nodes": [asdict(n) for n in p.nodes],
                "edges": [asdict(e) for e in p.edges],
            }
            for p in selected
        ],
    }
    return json.dumps(payload, indent=2, ensure_ascii=False)
