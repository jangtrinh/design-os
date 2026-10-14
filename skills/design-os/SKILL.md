---
name: design-os
description: "Use when working with DESIGN:OS CLI — Multi-runtime design operating system and CLI for Claude Code, OpenAI Codex, Gemini CLI, and Google Antigravity."
---

# DESIGN:OS CLI (`design-os`)

Install once to equip any AI coding agent with 12+ domain design skills, deterministic verification gates, 2:1 axonometric art direction, and live Figma / SVG / 3D / SwiftUI / packaging workflows.

## When to Use

Activate this skill when the user asks to:
- `"Initialize DESIGN:OS in this repo and wire our design tokens and verification gates for Claude Code and Codex."`
- `"Audit our current frontend components against DESIGN:OS typography, spacing, and WCAG 2.2 AA contrast gates."`
- `"Scaffold a new product landing page with 2:1 axonometric B&W technical illustrations and SEO/AEO/GEO metadata."`

## Progressive Disclosure Routing (`What loads when`)

1. **Always Loaded**: `skills/design-os/SKILL.md` (this router — keeps context lean).
2. **On Demand — Prompt Recipes**: Load `docs/cookbook.md` when selecting multi-step workflows or copy-paste prompt templates.
3. **On Demand — Diagnostics**: Load `commands/doctor.md` or run `python3 scripts/self_check.py` when verifying installation or troubleshooting.
4. **On Demand — Ecosystem Discovery**: Load `llms.txt` when cross-referencing companion `DESIGN:OS` engines.

## Core Execution Workflow

1. **Inspect Context**: Read the target repository or workspace constraints before mutating files.
2. **Execute Deterministically**: Run `npx @easestart/design-os init` or `npx @easestart/design-os doctor` rather than guessing outputs freehand.
3. **Verify Quality Gates**: Run `python3 scripts/self_check.py` and confirm zero errors before reporting completion.

## Quality Bar & Anti-Scope

### It's working if...
- `python3 scripts/self_check.py` exits `0`.
- Outputs match the `DESIGN:OS` 2:1 axonometric B&W art direction and deterministic verification gates.
- Execution remains 100% local with zero external telemetry (`PRIVACY.md`).

### When NOT to use
- Throwaway backend scripts with zero user-facing UI, CLI, or documentation surface.
- Teams looking for a hosted cloud SaaS design tool rather than a local-first, git-tracked engineering toolchain.
- Replacing human brand strategy — DESIGN:OS enforces and scales design systems, not customer discovery.
