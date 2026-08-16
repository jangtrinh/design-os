"""``sequenceDiagram`` parsing: participants, messages, fragments, notes.

Vendored from cathrynlavery/diagram-design (MIT, (c) 2025 Cathryn Lavery).
Ported verbatim except for the module split the ~200-line rule (Art IX) requires;
every safety limit and parser body is unchanged.
"""

from __future__ import annotations

import re
from typing import Any

from .mermaid_model import Diagram, _fail, clean_label
from .mermaid_syntax import _discard_nonsemantic


def _parse_sequence(
    diagram: Diagram, lines: list[tuple[int, str]], header_position: int
) -> None:
    fragment_stack: list[dict[str, Any]] = []
    participant_re = re.compile(
        r"^(participant|actor)\s+([\w.:-]+)(?:\s+as\s+(.+))?$", re.I
    )
    message_re = re.compile(
        r"^([\w.:-]+?)(?:\(\))?\s*(--?>>|--?>|--?\)|--?x)"
        r"\s*[+-]?\s*(?:\(\))?([\w.:-]+)\s*:\s*(.*)$"
    )
    for line_number, raw in lines[header_position + 1 :]:
        text = raw.strip()
        if not text:
            continue
        lowered = text.casefold()
        if _discard_nonsemantic(diagram, text):
            continue
        participant = participant_re.match(text)
        if participant:
            node_id = participant.group(2)
            diagram.add_node(
                node_id,
                clean_label(participant.group(3) or node_id),
                "actor" if participant.group(1).casefold() == "actor" else "lifeline",
            )
            continue
        fragment = re.match(r"^(alt|opt|loop|par|critical|break)\b\s*(.*)$", text, re.I)
        if fragment:
            entry = {
                "kind": fragment.group(1).casefold(),
                "label": clean_label(fragment.group(2)),
                "line": line_number,
                "depth": len(fragment_stack),
                "regions": [],
            }
            diagram.fragments.append(entry)
            fragment_stack.append(entry)
            continue
        region = re.match(r"^(else|and|option)\b\s*(.*)$", text, re.I)
        if region and fragment_stack:
            fragment_stack[-1]["regions"].append(clean_label(region.group(2)))
            continue
        if lowered == "end":
            if fragment_stack:
                fragment_stack.pop()
            continue
        if lowered.startswith(("activate ", "deactivate ", "+", "-")):
            continue
        if lowered.startswith("note "):
            _, separator, note = text.partition(":")
            diagram.notes.append(clean_label(note if separator else text[5:]))
            continue
        message = message_re.match(text)
        if message:
            source, token, target, label = message.groups()
            diagram.add_node(source, source, "lifeline")
            diagram.add_node(target, target, "lifeline")
            diagram.add_edge(
                source,
                target,
                clean_label(label),
                "dashed" if token.startswith("--") else "solid",
                "cross" if token.endswith("x") else "async" if token.endswith(")") else "arrow",
            )
            continue
        if re.search(r"--?>>|--?>|--?\)|--?x", text):
            _fail(f"malformed edge at line {line_number}")
