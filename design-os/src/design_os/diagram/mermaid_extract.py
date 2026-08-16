"""Extract a normalized intermediate representation (IR) from Mermaid text.

Vendored from cathrynlavery/diagram-design (MIT, (c) 2025 Cathryn Lavery).
Ported verbatim except for the module split the ~200-line rule (Art IX) requires;
every safety limit and parser body is unchanged.

Supported grammars are flowchart/graph, sequenceDiagram, stateDiagram-v2, and
erDiagram. Inputs may be .mmd, .mermaid, or Markdown files containing fenced
``mermaid`` blocks.

Usage:
    python3 -m design_os.diagram.mermaid_extract <file> [--diagram N|all] [--json]
                                                 [--max-rows N] [--out PATH]

Exit codes: 0 success, 2 unreadable, unsupported, malformed, or over limits.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .mermaid_analyze import parse_block
from .mermaid_model import Diagram, _fail
from .mermaid_render import digest, to_json
from .mermaid_source import load_blocks


def select_diagrams(diagrams: list[Diagram], selector: str | None) -> list[Diagram]:
    if selector is None:
        return diagrams[:1]
    if selector == "all":
        return diagrams
    if selector.isdigit():
        index = int(selector)
        selected = [diagram for diagram in diagrams if diagram.index == index]
        if not selected:
            _fail(f"no diagram with index {index} (have 0..{len(diagrams) - 1})")
        return selected
    _fail("--diagram must be an index or 'all'")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("file", help=".mmd, .mermaid, or Markdown with mermaid fences")
    parser.add_argument(
        "--diagram", help="diagram index or 'all' (default: first diagram)"
    )
    parser.add_argument("--json", action="store_true", help="emit the full IR as JSON")
    parser.add_argument(
        "--max-rows",
        type=int,
        default=40,
        help="rows per table in the Markdown digest (default 40)",
    )
    parser.add_argument("--out", help="write to this path instead of stdout")
    args = parser.parse_args(argv)
    if args.max_rows < 1:
        _fail("--max-rows must be at least 1")

    path = Path(args.file)
    if not path.is_file():
        _fail(f"{path}: no such file")
    blocks = load_blocks(path)
    diagrams = [parse_block(block) for block in blocks]
    selected = select_diagrams(diagrams, args.diagram)
    output = (
        to_json(path, diagrams, selected)
        if args.json
        else digest(path, diagrams, selected, args.max_rows)
    )
    if args.out:
        try:
            Path(args.out).write_text(output, encoding="utf-8")
        except OSError as error:
            _fail(f"cannot write {args.out}: {error}")
        print(f"wrote {args.out} ({len(output)} bytes)")
    else:
        sys.stdout.write(output if output.endswith("\n") else output + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
