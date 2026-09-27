"""``audit_batch.scan`` — deterministic HTML walk + content hash."""

from __future__ import annotations

from pathlib import Path

from design_os.commands.audit_batch import SKIP_DIRS, content_hash, find_html_pages, page_slug


def test_finds_html_files_sorted(tmp_path: Path) -> None:
    (tmp_path / "b.html").write_text("<html>b</html>")
    (tmp_path / "a.html").write_text("<html>a</html>")
    sub = tmp_path / "sub"
    sub.mkdir()
    (sub / "c.html").write_text("<html>c</html>")
    (tmp_path / "ignore.txt").write_text("nope")

    pages = find_html_pages(tmp_path)
    assert [p.name for p in pages] == ["a.html", "b.html", "c.html"]
    assert pages == sorted(pages)


def test_skip_dirs_excluded(tmp_path: Path) -> None:
    for d in ("node_modules", ".git", "dist", "design", ".venv"):
        skipped = tmp_path / d
        skipped.mkdir()
        (skipped / "skip-me.html").write_text("<html></html>")
    (tmp_path / "keep.html").write_text("<html></html>")

    pages = find_html_pages(tmp_path)
    assert [p.name for p in pages] == ["keep.html"]


def test_skip_dirs_pinned_to_kernel_scanner() -> None:
    """Mirrors src/core/project-scan.ts SKIP_DIRS verbatim — pinned so drift is caught, not silent."""
    assert SKIP_DIRS == frozenset({
        "node_modules", "dist", "build", "out", "coverage", "vendor", ".git",
        ".next", ".turbo", ".cache", ".agent", ".claude", "design",
        ".venv", "venv", "__pycache__",
    })


def test_content_hash_stable_and_sensitive(tmp_path: Path) -> None:
    f = tmp_path / "page.html"
    f.write_text("<html>v1</html>")
    h1 = content_hash(f)
    h2 = content_hash(f)
    assert h1 == h2
    assert h1.startswith("sha256:")

    f.write_text("<html>v2</html>")
    h3 = content_hash(f)
    assert h3 != h1


def test_page_slug_is_filesystem_safe() -> None:
    assert page_slug("a/b/c.html") == "a_b_c.html"
