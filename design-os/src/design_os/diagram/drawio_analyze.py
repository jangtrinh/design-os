"""Structural analysis of a draw.io page — signals, not decisions.

Vendored from cathrynlavery/diagram-design (MIT, (c) 2025 Cathryn Lavery).
Ported verbatim except for the module split the ~200-line rule (Art IX) requires;
every safety limit and parser body is unchanged.
"""

from __future__ import annotations

from typing import Any

from .drawio_model import Edge, Node, Page, shape_family


def _has_cycle(nodes: list[Node], edges: list[Edge]) -> bool:
    adjacency: dict[str, list[str]] = {n.id: [] for n in nodes}
    for edge in edges:
        if edge.source and edge.target and edge.source in adjacency:
            adjacency[edge.source].append(edge.target)
    WHITE, GREY, BLACK = 0, 1, 2
    color = {n.id: WHITE for n in nodes}

    def visit(start: str) -> bool:
        stack = [(start, iter(adjacency.get(start, [])))]
        color[start] = GREY
        while stack:
            nid, it = stack[-1]
            advanced = False
            for nxt in it:
                state = color.get(nxt, BLACK)
                if state == GREY:
                    return True
                if state == WHITE:
                    color[nxt] = GREY
                    stack.append((nxt, iter(adjacency.get(nxt, []))))
                    advanced = True
                    break
            if not advanced:
                color[nid] = BLACK
                stack.pop()
        return False

    return any(color[n.id] == WHITE and visit(n.id) for n in nodes)


def _aligned(boxes: list[Node], tolerance: float = 8.0) -> bool:
    """True when the boxes stack as lanes — shared left edge or shared top edge."""
    if len(boxes) < 2:
        return False
    same_x = max(n.x for n in boxes) - min(n.x for n in boxes) <= tolerance
    same_w = max(n.w for n in boxes) - min(n.w for n in boxes) <= tolerance
    same_y = max(n.y for n in boxes) - min(n.y for n in boxes) <= tolerance
    same_h = max(n.h for n in boxes) - min(n.h for n in boxes) <= tolerance
    return (same_x and same_w) or (same_y and same_h)


def analyze(page: Page) -> dict[str, Any]:
    nodes = page.nodes
    edges = page.edges
    drawable = [n for n in nodes if n.shape not in ("text",) and (n.label or n.children)]
    containers = [n for n in nodes if n.children]
    leaves = [n for n in nodes if not n.children]
    shapes: dict[str, int] = {}
    for node in nodes:
        shapes[shape_family(node.shape)] = shapes.get(shape_family(node.shape), 0) + 1

    def name_of(node: Node) -> str:
        return (node.label.replace("\n", " · ") or node.id)

    ranked = sorted(
        leaves, key=lambda n: (n.in_degree + n.out_degree), reverse=True
    )
    hubs = [
        {"id": n.id, "label": name_of(n), "degree": n.in_degree + n.out_degree}
        for n in ranked[:5]
        if (n.in_degree + n.out_degree) > 0
    ]
    sources = [name_of(n) for n in leaves if n.out_degree and not n.in_degree]
    sinks = [name_of(n) for n in leaves if n.in_degree and not n.out_degree]
    orphans = [name_of(n) for n in leaves if not n.in_degree and not n.out_degree]

    # Type candidates, strongest signal first. Advisory only.
    candidates: list[str] = []
    if shapes.get("lifeline"):
        candidates.append("sequence")
    if shapes.get("table") or shapes.get("er"):
        candidates.append("er")
    lanes = [n for n in nodes if n.shape == "swimlane" and n.children]
    if len(lanes) >= 2 and _aligned(lanes):
        candidates.append("swimlane")
    if shapes.get("rhombus"):
        candidates.append("flowchart")
    if shapes.get("ellipse", 0) >= max(2, len(leaves) // 3) and edges:
        candidates.append("state")
    if any(f in shapes for f in ("aws", "azure", "gcp", "kubernetes", "network")):
        candidates.append("architecture")
    if containers and not shapes.get("swimlane"):
        candidates.append("nested")
    if edges and not _has_cycle(nodes, edges) and len(sources) == 1:
        candidates.append("tree")
    if edges:
        candidates.append("architecture")
    if not candidates:
        candidates.append("architecture")

    seen: set[str] = set()
    candidates = [c for c in candidates if not (c in seen or seen.add(c))]

    # Collapse candidates: containers whose children are all leaves, and
    # fan-out clusters — the first things to merge when simplifying.
    collapsible = [
        {
            "id": c.id,
            "label": name_of(c),
            "children": len(c.children),
            "child_labels": [
                name_of(page.node_map[cid])
                for cid in c.children
                if page.node_map.get(cid) and page.node_map[cid].label
            ][:8],
        }
        for c in containers
        if c.children and all(not page.node_map[cid].children for cid in c.children)
    ]
    collapsible.sort(key=lambda c: c["children"], reverse=True)

    return {
        "nodes_total": len(nodes),
        "nodes_drawable": len(drawable),
        "containers": len(containers),
        "leaves": len(leaves),
        "edges_total": len(edges),
        "edges_labeled": sum(1 for e in edges if e.label),
        "edges_dangling": sum(1 for e in edges if not (e.source and e.target)),
        "max_depth": max((n.depth for n in nodes), default=0),
        "shapes": dict(sorted(shapes.items(), key=lambda kv: -kv[1])),
        "has_cycle": _has_cycle(nodes, edges),
        "hubs": hubs,
        "entry_points": sources[:6],
        "terminals": sinks[:6],
        "orphans": orphans[:6],
        "type_candidates": candidates[:3],
        "collapsible_groups": collapsible[:8],
        "over_node_budget": len(drawable) > 9,
        "over_edge_budget": len(edges) > 12,
    }
