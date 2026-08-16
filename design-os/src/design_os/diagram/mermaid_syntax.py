"""Mermaid statement lexing: top-level masking, statement joining, node expressions.

Vendored from cathrynlavery/diagram-design (MIT, (c) 2025 Cathryn Lavery).
Ported verbatim except for the module split the ~200-line rule (Art IX) requires;
every safety limit and parser body is unchanged.

Styling is counted and discarded here (``style``/``classDef``/``class``/``linkStyle`` and
``click``); only label and shape data crosses into the IR.
"""

from __future__ import annotations

import re

from .mermaid_model import Diagram, _fail, clean_label
from .mermaid_shapes import EXPANDED_SHAPE_FAMILIES, SHAPE_FOR_DELIMITERS


def _top_level_mask(text: str) -> str:
    """Keep top-level syntax positions and blank quoted/bracketed content."""
    output = list(text)
    stack: list[str] = []
    quote: str | None = None
    escaped = False
    pairs = {"]": "[", ")": "(", "}": "{"}
    for index, character in enumerate(text):
        if quote is not None:
            output[index] = " "
            if escaped:
                escaped = False
            elif character == "\\":
                escaped = True
            elif character == quote:
                quote = None
            continue
        if character in "\"'`":
            quote = character
            output[index] = " "
            continue
        if character in "[({":
            stack.append(character)
            output[index] = " "
            continue
        if character in "])}":
            if stack and stack[-1] == pairs[character]:
                stack.pop()
            output[index] = " "
            continue
        if stack:
            output[index] = " "
    return "".join(output)


def _split_top_level(text: str, delimiter: str) -> list[str]:
    mask = _top_level_mask(text)
    parts: list[str] = []
    start = 0
    for index, character in enumerate(mask):
        if character == delimiter:
            parts.append(text[start:index])
            start = index + 1
    parts.append(text[start:])
    return parts


def _statement_complete(text: str) -> bool:
    """Return whether quotes and node delimiters close within a statement."""
    stack: list[str] = []
    quote: str | None = None
    escaped = False
    pairs = {"]": "[", ")": "(", "}": "{"}
    for character in text:
        if quote is not None:
            if escaped:
                escaped = False
            elif character == "\\":
                escaped = True
            elif character == quote:
                quote = None
            continue
        if character in "\"'`":
            quote = character
        elif character in "[({":
            stack.append(character)
        elif character in "])}":
            if stack and stack[-1] == pairs[character]:
                stack.pop()
    return quote is None and not stack


def _logical_statements(
    lines: list[tuple[int, str]],
) -> list[tuple[int, str]]:
    """Join multiline Mermaid strings before parsing semicolon statements."""
    logical: list[tuple[int, str]] = []
    pending: list[str] = []
    start_line = 0
    for line_number, raw in lines:
        if not pending and not raw.strip():
            continue
        if not pending:
            start_line = line_number
        pending.append(raw)
        combined = "\n".join(pending)
        if not _statement_complete(combined):
            continue
        logical.extend(
            (start_line, statement)
            for statement in _split_top_level(combined, ";")
        )
        pending = []
    if pending:
        _fail(f"unterminated statement at line {start_line}")
    return logical


def classify_shape(expression: str) -> str:
    """Return the normalized Mermaid shape family for a node suffix."""
    for opening, closing, shape in SHAPE_FOR_DELIMITERS:
        if expression.startswith(opening) and expression.endswith(closing):
            return shape
    return "rect"


def _strip_class_suffix(text: str) -> str:
    """Drop Mermaid's `:::class` attachment; source styling is discarded."""
    mask = _top_level_mask(text)
    index = mask.find(":::")
    if index == -1:
        return text
    end = index + 3
    while end < len(text) and (text[end].isalnum() or text[end] in "_-"):
        end += 1
    return (text[:index] + text[end:]).strip()


def _parse_expanded_attributes(text: str) -> tuple[str, str] | None:
    """Normalize Mermaid v11.3+ ``@{ ... }`` node attributes.

    Only semantic label/shape data crosses the trust boundary. Image URLs,
    registered icon names, dimensions, and renderer configuration are dropped.
    """
    if not text.startswith("@{") or not text.endswith("}"):
        return None
    values: dict[str, str] = {}
    for raw_attribute in _split_top_level(text[2:-1], ","):
        key, separator, raw_value = raw_attribute.partition(":")
        if not separator:
            continue
        key = key.strip().casefold()
        if not re.fullmatch(r"[a-z][a-z0-9_-]*", key):
            continue
        values[key] = clean_label(raw_value)
    shape_name = values.get("shape", "").casefold()
    if not shape_name:
        if "img" in values:
            shape_name = "image"
        elif "icon" in values:
            shape_name = "icon"
        else:
            shape_name = "rect"
    if not re.fullmatch(r"[a-z][a-z0-9-]*", shape_name):
        shape_name = "rect"
    shape = EXPANDED_SHAPE_FAMILIES.get(shape_name, shape_name)
    return values.get("label", ""), shape


def _parse_node_expression(expression: str) -> tuple[str, str, str] | None:
    text = _strip_class_suffix(expression.strip().rstrip(";").strip())
    if not text:
        return None
    match = re.match(r"^([\w.:-]+)", text, re.UNICODE)
    if match is None:
        return None
    node_id = match.group(1)
    rest = text[match.end() :].strip()
    if not rest:
        return node_id, node_id, "rect"
    expanded = _parse_expanded_attributes(rest)
    if expanded is not None:
        label, shape = expanded
        return node_id, label or node_id, shape
    for opening, closing, _shape in SHAPE_FOR_DELIMITERS:
        if rest.startswith(opening) and rest.endswith(closing):
            label = rest[len(opening) : len(rest) - len(closing)]
            return node_id, clean_label(label), classify_shape(rest)
    return None


STYLE_DIRECTIVES = ("style ", "classDef ", "class ", "linkStyle ")


def _discard_nonsemantic(diagram: Diagram, text: str) -> bool:
    lowered = text.casefold()
    if any(lowered.startswith(prefix.casefold()) for prefix in STYLE_DIRECTIVES):
        diagram.discarded["style_directives"] += 1
        return True
    if lowered.startswith("click "):
        diagram.discarded["click_handlers"] += 1
        return True
    return False
