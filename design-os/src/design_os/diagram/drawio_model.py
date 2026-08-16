"""draw.io IR dataclasses plus the style/label helpers that populate them.

Vendored from cathrynlavery/diagram-design (MIT, (c) 2025 Cathryn Lavery).
Ported verbatim except for the module split the ~200-line rule (Art IX) requires;
every safety limit and parser body is unchanged.
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass, field
from xml.etree import ElementTree as ET


BR_RE = re.compile(r"<br\s*/?>|</p\s*>|</div\s*>", re.IGNORECASE)
TAG_RE = re.compile(r"<[^>]+>")


def parse_style(style: str | None) -> dict[str, str]:
    out: dict[str, str] = {}
    if not style:
        return out
    for part in style.split(";"):
        part = part.strip()
        if not part:
            continue
        key, sep, value = part.partition("=")
        out[key.strip()] = value.strip() if sep else "1"
    return out


def clean_label(value: str | None) -> str:
    """draw.io labels are often HTML fragments; flatten to plain text lines."""
    if not value:
        return ""
    text = BR_RE.sub("\n", value)
    text = TAG_RE.sub("", text)
    text = html.unescape(text)
    text = text.replace("\xa0", " ")
    lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in text.split("\n")]
    return "\n".join(ln for ln in lines if ln).strip()


SHAPE_FAMILIES = (
    ("mxgraph.aws", "aws"),
    ("mxgraph.azure", "azure"),
    ("mxgraph.gcp", "gcp"),
    ("mxgraph.kubernetes", "kubernetes"),
    ("mxgraph.cisco", "network"),
    ("mxgraph.veeam", "infra"),
    ("mxgraph.flowchart", "flowchart"),
    ("mxgraph.bpmn", "bpmn"),
    ("mxgraph.er", "er"),
    ("mxgraph.sysml", "uml"),
    ("mxgraph.archimate", "archimate"),
)

# style key -> canonical shape name, checked in order
SHAPE_KEYS = (
    ("swimlane", "swimlane"),
    ("ellipse", "ellipse"),
    ("rhombus", "rhombus"),
    ("triangle", "triangle"),
    ("cylinder", "cylinder"),
    ("cylinder3", "cylinder"),
    ("hexagon", "hexagon"),
    ("cloud", "cloud"),
    ("actor", "actor"),
    ("umlActor", "actor"),
    ("note", "note"),
    ("card", "card"),
    ("step", "step"),
    ("process", "process"),
    ("parallelogram", "parallelogram"),
    ("document", "document"),
    ("datastore", "cylinder"),
    ("umlLifeline", "lifeline"),
    ("umlFrame", "frame"),
    ("table", "table"),
    ("tableRow", "table-row"),
    ("partialRectangle", "table-row"),
    ("image", "image"),
    ("text", "text"),
    ("group", "group"),
)


def classify_shape(style: dict[str, str]) -> str:
    raw = style.get("shape", "")
    if raw:
        for key, name in SHAPE_KEYS:
            if raw == key or raw.startswith(key):
                return name
        for prefix, family in SHAPE_FAMILIES:
            if raw.startswith(prefix):
                return f"icon:{family}"
        return f"shape:{raw}"
    for key, name in SHAPE_KEYS:
        if key in style:
            return name
    if style.get("ellipse") == "1":
        return "ellipse"
    return "rect"


def shape_family(shape: str) -> str:
    if shape.startswith("icon:"):
        return shape.split(":", 1)[1]
    if shape.startswith("shape:"):
        return "custom"
    return shape


@dataclass
class Node:
    id: str
    label: str = ""
    shape: str = "rect"
    parent: str | None = None
    depth: int = 0
    x: float = 0.0
    y: float = 0.0
    w: float = 0.0
    h: float = 0.0
    fill: str = ""
    stroke: str = ""
    font_color: str = ""
    dashed: bool = False
    rounded: bool = False
    container: bool = False
    children: list[str] = field(default_factory=list)
    link: str = ""
    attrs: dict[str, str] = field(default_factory=dict)
    in_degree: int = 0
    out_degree: int = 0


@dataclass
class Edge:
    id: str
    source: str | None
    target: str | None
    label: str = ""
    dashed: bool = False
    bidirectional: bool = False
    undirected: bool = False
    style_name: str = ""
    waypoints: int = 0
    stroke: str = ""


@dataclass
class Page:
    id: str
    name: str
    index: int
    nodes: list[Node] = field(default_factory=list)
    edges: list[Edge] = field(default_factory=list)

    @property
    def node_map(self) -> dict[str, Node]:
        return {n.id: n for n in self.nodes}


def _num(geom: ET.Element | None, key: str) -> float:
    if geom is None:
        return 0.0
    try:
        return float(geom.get(key, "0") or 0)
    except ValueError:
        return 0.0
