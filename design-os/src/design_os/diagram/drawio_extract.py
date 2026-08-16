"""Extract a normalized intermediate representation (IR) from a draw.io file.

Vendored from cathrynlavery/diagram-design (MIT, (c) 2025 Cathryn Lavery).
Ported verbatim except for the module split the ~200-line rule (Art IX) requires;
every safety limit and parser body is unchanged.

Usage:
    python3 -m design_os.diagram.drawio_extract <file.drawio> [--page N|NAME] [--json]
                                                [--max-rows N] [--out PATH]

Default output is a compact Markdown digest meant to be read into context.
``--json`` emits the full IR instead (every node, every edge, every style).

Exit codes: 0 ok, 2 unreadable / unsupported input.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .drawio_load import _fail
from .drawio_model import Page
from .drawio_parse import parse_file
from .drawio_render import digest, to_json


def select_pages(pages: list[Page], selector: str | None) -> list[Page]:
    if selector is None:
        return pages if len(pages) == 1 else pages[:1]
    if selector == "all":
        return pages
    if selector.isdigit():
        index = int(selector)
        match = [p for p in pages if p.index == index]
        if not match:
            _fail(f"no page with index {index} (have 0..{len(pages) - 1})")
        return match
    match = [p for p in pages if p.name.lower() == selector.lower()]
    if not match:
        names = ", ".join(p.name for p in pages)
        _fail(f"no page named {selector!r} (have: {names})")
    return match


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("file", help=".drawio / .xml / .drawio.png / .drawio.svg")
    parser.add_argument(
        "--page",
        help="page index, page name, or 'all' (default: first page)",
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
        parser.error("--max-rows must be at least 1")

    path = Path(args.file)
    if not path.is_file():
        _fail(f"{path}: no such file")

    pages = parse_file(path)
    selected = select_pages(pages, args.page)
    text = (
        to_json(path, pages, selected)
        if args.json
        else digest(path, pages, selected, args.max_rows)
    )
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
        print(f"wrote {args.out} ({len(text)} bytes)")
    else:
        sys.stdout.write(text if text.endswith("\n") else text + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
