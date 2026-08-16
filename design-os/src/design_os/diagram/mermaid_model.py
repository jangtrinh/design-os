"""Mermaid IR dataclasses, the supported-grammar allowlist, and label flattening.

Vendored from cathrynlavery/diagram-design (MIT, (c) 2025 Cathryn Lavery).
Ported verbatim except for the module split the ~200-line rule (Art IX) requires;
every safety limit and parser body is unchanged.

Trust boundary: labels are untrusted data. They are flattened to inert text and never
evaluated, rendered, fetched, or executed. Unsupported grammars (pie, mindmap, gantt,
timeline, sankey, ...) are refused outright rather than partially parsed.
"""

from __future__ import annotations

import html
import re
import sys
from dataclasses import dataclass, field
from typing import Any, NoReturn


MAX_SOURCE_BYTES = 4 * 1024 * 1024
MAX_NODES = 2000
MAX_EDGES = 5000
SUPPORTED_KINDS = "flowchart, sequenceDiagram, stateDiagram-v2, erDiagram"
UNSUPPORTED_KINDS = {
    "pie",
    "mindmap",
    "gitgraph",
    "quadrantchart",
    "timeline",
    "c4context",
    "sankey",
    "sankey-beta",
    "gantt",
    "journey",
    "classdiagram",
    "statediagram",
}
MARKDOWN_SUFFIXES = {".md", ".markdown", ".mdown", ".mkd"}
MERMAID_SUFFIXES = {".mmd", ".mermaid"}


def _fail(message: str) -> NoReturn:
    print(f"mermaid_extract: {message}", file=sys.stderr)
    raise SystemExit(2)


@dataclass
class Node:
    id: str
    label: str = ""
    shape: str = "rect"
    parent: str | None = None
    depth: int = 0
    container: bool = False
    children: list[str] = field(default_factory=list)
    fields: list[str] = field(default_factory=list)
    in_degree: int = 0
    out_degree: int = 0


@dataclass
class Edge:
    id: str
    source: str
    target: str
    label: str = ""
    style: str = "solid"
    arrowhead: str = "arrow"
    bidirectional: bool = False
    undirected: bool = False
    order: int = 0


@dataclass
class Diagram:
    index: int
    kind: str
    source_line: int
    direction: str = "TD"
    nodes: list[Node] = field(default_factory=list)
    edges: list[Edge] = field(default_factory=list)
    fragments: list[dict[str, Any]] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    discarded: dict[str, int] = field(
        default_factory=lambda: {"style_directives": 0, "click_handlers": 0}
    )
    _nodes_by_id: dict[str, Node] = field(default_factory=dict, init=False, repr=False)

    @property
    def node_map(self) -> dict[str, Node]:
        return self._nodes_by_id

    def add_node(
        self,
        node_id: str,
        label: str = "",
        shape: str = "rect",
        parent: str | None = None,
        container: bool = False,
    ) -> Node:
        existing = self._nodes_by_id.get(node_id)
        if existing is not None:
            if label and (label != node_id or existing.label == existing.id):
                existing.label = label
            if shape != "rect" or not existing.shape:
                existing.shape = shape
            if parent is not None and existing.parent is None:
                existing.parent = parent
                existing.depth = self._depth_for(parent)
                self._attach(parent, node_id)
            existing.container = existing.container or container
            return existing
        if len(self.nodes) >= MAX_NODES:
            _fail(f"node limit exceeded (max {MAX_NODES})")
        node = Node(
            id=node_id,
            label=label or node_id,
            shape=shape,
            parent=parent,
            depth=self._depth_for(parent),
            container=container,
        )
        self.nodes.append(node)
        self._nodes_by_id[node_id] = node
        if parent is not None:
            self._attach(parent, node_id)
        return node

    def _depth_for(self, parent: str | None) -> int:
        if parent is None:
            return 0
        parent_node = self._nodes_by_id.get(parent)
        return (parent_node.depth + 1) if parent_node is not None else 1

    def _attach(self, parent: str, child: str) -> None:
        parent_node = self._nodes_by_id.get(parent)
        if parent_node is not None and child not in parent_node.children:
            parent_node.children.append(child)
            parent_node.container = True

    def add_edge(
        self,
        source: str,
        target: str,
        label: str = "",
        style: str = "solid",
        arrowhead: str = "arrow",
        bidirectional: bool = False,
        undirected: bool = False,
    ) -> Edge:
        if len(self.edges) >= MAX_EDGES:
            _fail(f"edge limit exceeded (max {MAX_EDGES})")
        edge = Edge(
            id=f"e{len(self.edges) + 1}",
            source=source,
            target=target,
            label=label,
            style=style,
            arrowhead=arrowhead,
            bidirectional=bidirectional,
            undirected=undirected,
            order=len(self.edges) + 1,
        )
        self.edges.append(edge)
        return edge


@dataclass
class SourceBlock:
    index: int
    text: str
    source_line: int


def clean_label(value: str) -> str:
    """Flatten Mermaid label markup without interpreting it."""
    text = value.strip()
    if len(text) >= 2 and text[0] == text[-1] and text[0] in "\"'`":
        text = text[1:-1]
    if text.startswith("`") and text.endswith("`"):
        text = text[1:-1]
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"(?<!&)#(quot|apos|amp|lt|gt);", r"&\1;", text)
    text = html.unescape(text)
    text = re.sub(r"\*\*(.*?)\*\*", r"\1", text)
    text = re.sub(r"__(.*?)__", r"\1", text)
    text = re.sub(r"(?<!\w)[*_](.*?)[*_](?!\w)", r"\1", text)
    text = text.replace("\\\"", '"').replace("\\'", "'")
    return "\n".join(part.strip() for part in text.splitlines()).strip()
