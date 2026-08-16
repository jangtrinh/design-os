"""``stateDiagram-v2`` and ``erDiagram`` parsing.

Vendored from cathrynlavery/diagram-design (MIT, (c) 2025 Cathryn Lavery).
Ported verbatim except for the module split the ~200-line rule (Art IX) requires;
every safety limit and parser body is unchanged.
"""

from __future__ import annotations

import re

from .mermaid_model import Diagram, Node, _fail, clean_label
from .mermaid_syntax import (
    _discard_nonsemantic,
    _parse_node_expression,
    _strip_class_suffix,
)


def _state_endpoint(
    diagram: Diagram,
    token: str,
    role: str,
    parent: str | None,
) -> str | None:
    value = _strip_class_suffix(token.strip())
    if value == "[*]":
        prefix = "start" if role == "source" else "end"
        count = sum(node.id.startswith("__" + prefix) for node in diagram.nodes)
        node_id = f"__{prefix}_{count + 1}"
        diagram.add_node(node_id, f"[{prefix}]", prefix, parent)
        return node_id
    parsed = _parse_node_expression(value)
    if parsed is None:
        return None
    node_id, label, shape = parsed
    diagram.add_node(node_id, label, "state" if shape == "rect" else shape, parent)
    return node_id


def _parse_state(
    diagram: Diagram, lines: list[tuple[int, str]], header_position: int
) -> None:
    containers: list[str] = []
    for line_number, raw in lines[header_position + 1 :]:
        text = raw.strip()
        if not text:
            continue
        if _discard_nonsemantic(diagram, text):
            continue
        if text == "}":
            if containers:
                containers.pop()
            continue
        parent = containers[-1] if containers else None
        direction_match = re.match(r"^direction\s+(TD|TB|LR|RL|BT)$", text, re.I)
        if direction_match and not containers:
            diagram.direction = direction_match.group(1).upper()
            continue
        composite = re.match(r"^state\s+([\w.:-]+)\s*\{$", text, re.I)
        if composite:
            node_id = composite.group(1)
            diagram.add_node(node_id, node_id, "container", parent, container=True)
            containers.append(node_id)
            continue
        alias = re.match(r'^state\s+"(.*?)"\s+as\s+([\w.:-]+)$', text, re.I)
        if alias:
            diagram.add_node(alias.group(2), clean_label(alias.group(1)), "state", parent)
            continue
        stereotype = re.match(
            r"^state\s+([\w.:-]+)\s+<<(fork|join|choice)>>$", text, re.I
        )
        if stereotype:
            diagram.add_node(
                stereotype.group(1), stereotype.group(1), stereotype.group(2).casefold(), parent
            )
            continue
        if "-->" in text:
            source_text, target_text = text.split("-->", 1)
            label = ""
            label_separator = re.search(r"(?<!:):(?!:)", target_text)
            if label_separator:
                label = target_text[label_separator.end() :]
                target_text = target_text[: label_separator.start()]
            source = _state_endpoint(diagram, source_text, "source", parent)
            target = _state_endpoint(diagram, target_text, "target", parent)
            if source is None or target is None:
                _fail(f"malformed edge at line {line_number}")
            diagram.add_edge(source, target, clean_label(label))
            continue
        description = re.match(r"^([A-Za-z_][\w.-]*)\s*:\s*(.+)$", text)
        if description:
            diagram.add_node(
                description.group(1), clean_label(description.group(2)), "state", parent
            )
            continue
        plain = re.match(r"^state\s+([\w.:-]+)$", text, re.I)
        if plain:
            diagram.add_node(plain.group(1), plain.group(1), "state", parent)


def _parse_er(
    diagram: Diagram, lines: list[tuple[int, str]], header_position: int
) -> None:
    current: Node | None = None
    relationship = re.compile(
        r"^([A-Za-z_][\w.-]*)\s+(\S*(?:--|\.\.)\S*)\s+"
        r"([A-Za-z_][\w.-]*)\s*(?::\s*(.*))?$"
    )
    for line_number, raw in lines[header_position + 1 :]:
        text = raw.strip()
        if not text:
            continue
        if _discard_nonsemantic(diagram, text):
            continue
        if text == "}":
            current = None
            continue
        direction_match = re.match(r"^direction\s+(TD|TB|LR|RL|BT)$", text, re.I)
        if direction_match and current is None:
            diagram.direction = direction_match.group(1).upper()
            continue
        entity = re.match(r"^([A-Za-z_][\w.-]*)\s*\{$", text)
        if entity:
            current = diagram.add_node(entity.group(1), entity.group(1), "table")
            continue
        if current is not None:
            current.fields.append(clean_label(text))
            continue
        edge = relationship.match(text)
        if edge:
            source, cardinality, target, relationship_label = edge.groups()
            diagram.add_node(source, source, "table")
            diagram.add_node(target, target, "table")
            left, separator, right = cardinality.partition("--")
            if not separator:
                left, separator, right = cardinality.partition("..")
            label_parts = [f"{left} {separator} {right}".strip()]
            if relationship_label:
                label_parts.append(clean_label(relationship_label))
            diagram.add_edge(
                source,
                target,
                " · ".join(label_parts),
                "dashed" if separator == ".." else "solid",
                "cardinality",
                undirected=True,
            )
            continue
        if "--" in text or ".." in text:
            _fail(f"malformed edge at line {line_number}")
