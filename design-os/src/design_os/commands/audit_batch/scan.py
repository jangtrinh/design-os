"""Deterministic HTML page walk for one project — respects SKIP_DIRS.

SKIP_DIRS mirrors ``src/core/project-scan.ts`` (the kernel's own scanner) exactly. The kernel
is unchanged-by-contract (acceptance §W10b: "NOT src/**") and TypeScript, so this cannot be a
shared import across languages — it is a deliberate, documented duplication of one constant
set. Keep in sync by hand if the kernel's SKIP_DIRS ever changes; a test in this package pins
the current values so drift is caught, not silent.
"""

from __future__ import annotations

import hashlib
import os
from pathlib import Path

# Mirrors src/core/project-scan.ts SKIP_DIRS verbatim (corpus-counted there; not re-derived here).
SKIP_DIRS = frozenset({
    "node_modules", "dist", "build", "out", "coverage", "vendor", ".git",
    ".next", ".turbo", ".cache", ".agent", ".claude", "design",
    ".venv", "venv", "__pycache__",
})


def find_html_pages(project: Path) -> list[Path]:
    """Every ``*.html`` file under ``project``, skipping SKIP_DIRS, sorted for determinism."""
    pages: list[Path] = []
    for cur, dirs, files in os.walk(project):
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)
        for f in files:
            if f.endswith(".html"):
                pages.append(Path(cur) / f)
    return sorted(pages)


def content_hash(path: Path) -> str:
    """``sha256:<hex>`` of the file's bytes — the re-run "unchanged" key (TP-00B state)."""
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    return f"sha256:{digest}"


def page_slug(rel_path: str) -> str:
    """Filesystem-safe slug for a receipt filename: ``/`` and other separators become ``_``."""
    return rel_path.replace("/", "_").replace(os.sep, "_")
