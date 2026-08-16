"""``flowchart`` / ``graph`` parsing: edge operators, endpoint groups, subgraphs.

Vendored from cathrynlavery/diagram-design (MIT, (c) 2025 Cathryn Lavery).
Ported verbatim except for the module split the ~200-line rule (Art IX) requires;
every safety limit and parser body is unchanged.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from .mermaid_model import Diagram, _fail, clean_label
from .mermaid_syntax import (
    _discard_nonsemantic,
    _logical_statements,
    _parse_node_expression,
    _split_top_level,
    _top_level_mask,
)


@dataclass
class _Operator:
    start: int
    end: int
    label: str
    style: str
    arrowhead: str
    bidirectional: bool = False
    undirected: bool = False


def _operator_style(token: str) -> tuple[str, str, bool, bool]:
    style = "dashed" if "." in token else "thick" if "=" in token else "solid"
    arrowhead = "cross" if token.endswith("x") else "circle" if token.endswith("o") else "arrow"
    undirected = ">" not in token and not token.endswith(("x", "o"))
    bidirectional = (
        token.startswith("<") and token.endswith(">")
    ) or (token.startswith(("x", "o")) and token.endswith(("x", "o")))
    return style, arrowhead, bidirectional, undirected


def _edge_operators(text: str) -> list[_Operator]:
    mask = _top_level_mask(text)
    operators: list[_Operator] = []
    occupied: list[tuple[int, int]] = []

    # Labeled links carry the label between the opening and closing operator:
    # `A-- text -->B`, `A-. retry .-> B`, `A== critical ==> B`, and the
    # undirected forms of each.
    text_edge = re.compile(
        r"(?:--|-\.|==)\s+(.+?)\s+(\.-+[>xo]|\.-+|-{2,}>|--[xo]|=+>|={2,}|-{3,})"
    )
    for match in text_edge.finditer(mask):
        token = match.group(2)
        style, arrowhead, bidirectional, undirected = _operator_style(token)
        operators.append(
            _Operator(
                match.start(),
                match.end(),
                clean_label(text[match.start(1) : match.end(1)]),
                style,
                arrowhead,
                bidirectional,
                undirected,
            )
        )
        occupied.append((match.start(), match.end()))

    pattern = re.compile(
        r"[xo][-=.]+[xo]|<[-=.]+>|-+\.-+>|=+>|-+(?:>|x|o)|-+\.-+|={3,}|-{3,}"
    )
    for match in pattern.finditer(mask):
        if any(start <= match.start() < end for start, end in occupied):
            continue
        token = match.group()
        end = match.end()
        label = ""
        if end < len(text) and text[end] == "|":
            close = text.find("|", end + 1)
            if close != -1:
                label = clean_label(text[end + 1 : close])
                end = close + 1
        style, arrowhead, bidirectional, undirected = _operator_style(token)
        operators.append(
            _Operator(
                match.start(), end, label, style, arrowhead, bidirectional, undirected
            )
        )
        occupied.append((match.start(), end))
    return sorted(operators, key=lambda operator: operator.start)


def _endpoint_group(
    diagram: Diagram, text: str, parent: str | None
) -> list[str] | None:
    identifiers: list[str] = []
    for raw in _split_top_level(text.strip(), "&"):
        parsed = _parse_node_expression(raw)
        if parsed is None:
            return None
        node_id, label, shape = parsed
        diagram.add_node(node_id, label, shape, parent)
        identifiers.append(node_id)
    return identifiers or None


def _parse_flowchart(
    diagram: Diagram, lines: list[tuple[int, str]], header_position: int
) -> None:
    containers: list[str] = []
    for line_number, raw in _logical_statements(lines[header_position + 1 :]):
        text = raw.strip()
        if not text:
            continue
        lowered = text.casefold()
        if _discard_nonsemantic(diagram, text):
            continue
        if lowered.startswith("direction "):
            if not containers:
                direction = text.split(maxsplit=1)[1].upper()
                if direction in {"TD", "TB", "LR", "RL", "BT"}:
                    diagram.direction = direction
            continue
        if lowered.startswith("subgraph "):
            spec = text.split(maxsplit=1)[1].strip()
            parsed = _parse_node_expression(spec)
            if parsed is None:
                generated = f"subgraph-{len([node for node in diagram.nodes if node.container]) + 1}"
                node_id, label = generated, clean_label(spec)
            else:
                node_id, label, _shape = parsed
            parent = containers[-1] if containers else None
            diagram.add_node(node_id, label, "container", parent, container=True)
            containers.append(node_id)
            continue
        if lowered == "end":
            if containers:
                containers.pop()
            continue

        operators = _edge_operators(text)
        parent = containers[-1] if containers else None
        if operators:
            segments: list[str] = []
            cursor = 0
            for operator in operators:
                segments.append(text[cursor : operator.start])
                cursor = operator.end
            segments.append(text[cursor:])
            if len(segments) != len(operators) + 1:
                _fail(f"malformed edge at line {line_number}")
            groups = [_endpoint_group(diagram, segment, parent) for segment in segments]
            if any(group is None for group in groups):
                _fail(f"malformed edge at line {line_number}")
            valid_groups = [group for group in groups if group is not None]
            for index, operator in enumerate(operators):
                for source in valid_groups[index]:
                    for target in valid_groups[index + 1]:
                        diagram.add_edge(
                            source,
                            target,
                            operator.label,
                            operator.style,
                            operator.arrowhead,
                            operator.bidirectional,
                            operator.undirected,
                        )
            continue
        if re.search(r"(?:--|==|-.).*?(?:>|x|o|-)", _top_level_mask(text)):
            _fail(f"malformed edge at line {line_number}")
        parsed = _parse_node_expression(text)
        if parsed is not None:
            node_id, label, shape = parsed
            diagram.add_node(node_id, label, shape, parent)
