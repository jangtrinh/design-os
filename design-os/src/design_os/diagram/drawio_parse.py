"""mxGraphModel -> flattened :class:`~design_os.diagram.drawio_model.Page` objects.

Vendored from cathrynlavery/diagram-design (MIT, (c) 2025 Cathryn Lavery).
Ported verbatim except for the module split the ~200-line rule (Art IX) requires;
every safety limit and parser body is unchanged.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

from .drawio_load import _fail, _inflate, _reject_unsafe_xml, load_mxfile
from .drawio_model import (
    Edge,
    Node,
    Page,
    _num,
    classify_shape,
    clean_label,
    parse_style,
)


def parse_page(diagram: ET.Element, index: int) -> Page:
    name = diagram.get("name") or f"Page-{index + 1}"
    page = Page(id=diagram.get("id") or f"page-{index}", name=name, index=index)

    model = diagram.find(".//mxGraphModel")
    if model is None:
        text = (diagram.text or "").strip()
        inflated = _inflate(text) if text else None
        if not inflated:
            return page
        _reject_unsafe_xml(inflated, f"page {index}")
        model = ET.fromstring(inflated)
        if model.tag != "mxGraphModel":
            found = model.find(".//mxGraphModel")
            if found is None:
                return page
            model = found

    root = model.find("root")
    if root is None:
        return page

    # Pass 1: collect raw cells, unwrapping <object>/<UserObject> containers.
    raw: dict[str, dict[str, Any]] = {}
    order: list[str] = []
    for element in root:
        if element.tag in ("object", "UserObject"):
            cell = element.find("mxCell")
            if cell is None:
                continue
            attrs = {
                k: v
                for k, v in element.attrib.items()
                if k not in ("id", "label", "placeholders")
            }
            cid = element.get("id") or cell.get("id") or ""
            value = element.get("label", "")
        elif element.tag == "mxCell":
            cell = element
            attrs = {}
            cid = cell.get("id") or ""
            value = cell.get("value", "")
        else:
            continue
        if not cid:
            continue
        raw[cid] = {"cell": cell, "attrs": attrs, "value": value}
        order.append(cid)

    # Pass 2: vertices (absolute geometry resolved after the pass).
    edge_label_parts: dict[str, list[str]] = {}
    for cid in order:
        entry = raw[cid]
        cell = entry["cell"]
        style = parse_style(cell.get("style"))
        parent = cell.get("parent")
        if cell.get("edge") == "1":
            continue
        if cell.get("vertex") != "1":
            continue
        # An edge label is a vertex parented to an edge; fold it into the edge.
        parent_entry = raw.get(parent or "")
        parent_is_edge = bool(
            parent_entry and parent_entry["cell"].get("edge") == "1"
        )
        if parent_is_edge or "edgeLabel" in style:
            if parent:
                text = clean_label(entry["value"])
                if text:
                    edge_label_parts.setdefault(parent, []).append(text)
            continue

        geom = cell.find("mxGeometry")
        node = Node(
            id=cid,
            label=clean_label(entry["value"]),
            shape=classify_shape(style),
            parent=parent,
            x=_num(geom, "x"),
            y=_num(geom, "y"),
            w=_num(geom, "width"),
            h=_num(geom, "height"),
            fill=style.get("fillColor", ""),
            stroke=style.get("strokeColor", ""),
            font_color=style.get("fontColor", ""),
            dashed=style.get("dashed") == "1",
            rounded=style.get("rounded") == "1",
            container=style.get("container") == "1" or "swimlane" in style,
            link=entry["attrs"].get("link", ""),
            attrs={
                k: v
                for k, v in entry["attrs"].items()
                if k not in ("link", "tooltip")
            },
        )
        page.nodes.append(node)

    node_map = page.node_map

    # Resolve absolute geometry + depth by walking the parent chain.
    def resolve(node: Node, seen: set[str]) -> tuple[float, float, int]:
        if node.id in seen:
            return node.x, node.y, 0
        seen.add(node.id)
        parent = node_map.get(node.parent or "")
        if parent is None:
            return node.x, node.y, 0
        px, py, pdepth = resolve(parent, seen)
        return node.x + px, node.y + py, pdepth + 1

    for node in page.nodes:
        ax, ay, depth = resolve(node, set())
        node.x, node.y, node.depth = ax, ay, depth
        parent = node_map.get(node.parent or "")
        if parent is not None:
            parent.children.append(node.id)
            parent.container = True

    # Pass 3: edges.
    for cid in order:
        entry = raw[cid]
        cell = entry["cell"]
        if cell.get("edge") != "1":
            continue
        style = parse_style(cell.get("style"))
        geom = cell.find("mxGeometry")
        waypoints = 0
        if geom is not None:
            waypoints = len(
                [p for p in geom.findall(".//mxPoint") if p.get("as") is None]
            )
        label = clean_label(entry["value"])
        extra = edge_label_parts.get(cid, [])
        if extra:
            label = " / ".join([p for p in ([label] + extra) if p])
        source = cell.get("source")
        target = cell.get("target")
        page.edges.append(
            Edge(
                id=cid,
                source=source if source in node_map else None,
                target=target if target in node_map else None,
                label=label,
                dashed=style.get("dashed") == "1",
                bidirectional=style.get("startArrow", "none")
                not in ("none", "0", "")
                and style.get("endArrow", "classic") not in ("none", "0"),
                undirected=style.get("endArrow") in ("none", "0")
                and style.get("startArrow", "none") in ("none", "0", ""),
                style_name=style.get("shape", "")
                or ("orthogonal" if style.get("edgeStyle") else ""),
                waypoints=waypoints,
                stroke=style.get("strokeColor", ""),
            )
        )

    for edge in page.edges:
        if edge.source and edge.source in node_map:
            node_map[edge.source].out_degree += 1
        if edge.target and edge.target in node_map:
            node_map[edge.target].in_degree += 1

    return page


def parse_file(path: Path) -> list[Page]:
    xml = load_mxfile(path)
    _reject_unsafe_xml(xml, path.name)
    try:
        root = ET.fromstring(xml)
    except ET.ParseError as exc:
        _fail(f"{path.name}: malformed XML ({exc})")
    if root.tag == "mxGraphModel":
        wrapper = ET.Element("diagram", {"name": path.stem, "id": "single"})
        wrapper.append(root)
        return [parse_page(wrapper, 0)]
    diagrams = root.findall(".//diagram")
    if not diagrams:
        _fail(f"{path.name}: mxfile contains no <diagram> pages")
    return [parse_page(d, i) for i, d in enumerate(diagrams)]
