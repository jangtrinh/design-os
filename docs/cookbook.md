# `design-os` Prompt & CLI Cookbook

Copy-paste recipes for **DESIGN:OS CLI** (`skills/design-os/SKILL.md`).

---

## 1. Generate & Scaffold

> "Initialize DESIGN:OS in this repo and wire our design tokens and verification gates for Claude Code and Codex."

## 2. Audit & Verify

> "Audit our current frontend components against DESIGN:OS typography, spacing, and WCAG 2.2 AA contrast gates."

## 3. Export & Automate

> "Scaffold a new product landing page with 2:1 axonometric B&W technical illustrations and SEO/AEO/GEO metadata."

---

## 4. CLI & Diagnostic Commands

```bash
# Run deterministic offline self-check
python3 scripts/self_check.py

# Wire this project for your agent (or --all)
npx ease-design init --runtime <claude|codex|antigravity>

# Check the install (add --cwd <project> to check a project too)
npx ease-design doctor
```
