#!/usr/bin/env python3
"""self_check.py — Deterministic offline self-check for design-os."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

REQUIRED_JSON = (
    ".claude-plugin/plugin.json",
    ".claude-plugin/marketplace.json",
    ".codex-plugin/plugin.json",
    ".agents/plugins/marketplace.json",
    ".factory-plugin/plugin.json",
    ".factory-plugin/marketplace.json",
)

REQUIRED_FILES = (
    "README.md",
    "LICENSE",
    "PRIVACY.md",
    "SECURITY.md",
    "CONTRIBUTING.md",
    "CODE_OF_CONDUCT.md",
    "CHANGELOG.md",
    "llms.txt",
    "docs/cookbook.md",
    "commands/doctor.md",
    "prompts/doctor.md",
)


def _check_local_path(issues: list[str], manifest: str, field: str, raw: object) -> None:
    if not isinstance(raw, str) or not raw.strip():
        issues.append(f"{manifest}: missing local path in {field}")
        return
    resolved = (ROOT / raw).resolve()
    try:
        resolved.relative_to(ROOT.resolve())
    except ValueError:
        issues.append(f"{manifest}: {field} escapes repo root ({raw})")
        return
    if not resolved.exists():
        issues.append(f"{manifest}: {field} does not exist ({raw})")


def main() -> int:
    issues: list[str] = []
    parsed_manifests: dict[str, dict[str, object]] = {}
    for rel in REQUIRED_JSON:
        p = ROOT / rel
        if not p.is_file():
            issues.append(f"missing JSON manifest: {rel}")
            continue
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                issues.append(f"manifest is not a JSON object: {rel}")
            else:
                parsed_manifests[rel] = data
        except Exception as exc:
            issues.append(f"invalid JSON in {rel}: {exc}")

    codex = parsed_manifests.get(".codex-plugin/plugin.json")
    if codex is not None:
        _check_local_path(issues, ".codex-plugin/plugin.json", "skills", codex.get("skills"))
        iface = codex.get("interface")
        logo = iface.get("logo") if isinstance(iface, dict) else None
        _check_local_path(issues, ".codex-plugin/plugin.json", "interface.logo", logo)

    for mkt_rel in (
        ".claude-plugin/marketplace.json",
        ".factory-plugin/marketplace.json",
        ".agents/plugins/marketplace.json",
    ):
        mkt = parsed_manifests.get(mkt_rel)
        if mkt is None:
            continue
        plugins = mkt.get("plugins")
        if not isinstance(plugins, list) or not plugins:
            issues.append(f"{mkt_rel}: plugins must be a non-empty array")
            continue
        for idx, entry in enumerate(plugins):
            if not isinstance(entry, dict):
                issues.append(f"{mkt_rel}: plugins[{idx}] must be an object")
                continue
            src = entry.get("source")
            if isinstance(src, dict):
                if src.get("source") == "local":
                    _check_local_path(issues, mkt_rel, f"plugins[{idx}].source.path", src.get("path"))
                else:
                    issues.append(f"{mkt_rel}: plugins[{idx}].source must declare local path")
            else:
                _check_local_path(issues, mkt_rel, f"plugins[{idx}].source", src)

    for rel in REQUIRED_FILES:
        p = ROOT / rel
        if not p.is_file() or p.stat().st_size == 0:
            issues.append(f"missing or empty required file: {rel}")

    skills = list((ROOT / "skills").glob("*/SKILL.md")) if (ROOT / "skills").is_dir() else []
    if not skills:
        issues.append("missing skills/<slug>/SKILL.md")

    if issues:
        for item in issues:
            print(f"FAIL: {item}", file=sys.stderr)
        return 1

    print("ok: design-os self-check passed (design-os)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
