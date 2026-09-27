"""``design-os audit batch`` — package re-exports (mirrors the ``reference/`` split-module
pattern: one flat import site, ``from design_os.commands.audit_batch import <name>``).
"""

from __future__ import annotations

from .caps import Caps, CapsError, load_caps
from .cli import audit_batch
from .receipt import build_manifest, build_receipt, write_json
from .runner import BatchResult, run_batch
from .scan import SKIP_DIRS, content_hash, find_html_pages, page_slug
from .state import BatchState
from .tools import run_tools_for_page

__all__ = [
    "Caps",
    "CapsError",
    "load_caps",
    "audit_batch",
    "build_manifest",
    "build_receipt",
    "write_json",
    "BatchResult",
    "run_batch",
    "SKIP_DIRS",
    "content_hash",
    "find_html_pages",
    "page_slug",
    "BatchState",
    "run_tools_for_page",
]
