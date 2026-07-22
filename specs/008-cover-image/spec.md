# Spec 008 — Cover & OG image generation (`ui cover` emitter + `cover-lint`)

- **Status:** stage:spec (draft by Opus, 2026-07-22) — awaiting owner decisions before plan/tasks.
- **Slot:** 008 (the imagegen candidate; see memory `spec008-imagegen`, `codex-runtime-leverage`).
- **Grounding refs:** ledger gap `g-260722-1605-emitter-needs-linter`;
  `specs/015-world-class-learning-loop/research/higgsfield-reference-ledger.md` (§ Cover / OG skill);
  proven prototypes in `reference/compose_cover.py` and `reference/cover_lint.py`.

## Problem / user value

DESIGN:OS builds on-system UI but a shipped product still needs a **launch cover + OG/social image**
— and users currently have no path to one. Today they either hand-make it or pull generic AI slop.
This spec gives them a repeatable, on-brand cover from one command, with a hard quality gate so the
title never lands under the mask.

## What this session PROVED (real data, not hypothesis)

1. **Codex `image_gen` is zero-key and headless-drivable** (recipe in `codex-runtime-leverage` memory):
   `CMUX_CODEX_HOOKS_DISABLED=1 codex exec --dangerously-bypass-approvals-and-sandbox …`. It generated
   a 3:2 cover with **clean rendered title text** ("DESIGN:OS", "npm i -g ease-design"). Gotcha: force
   "copy the raw PNG, no recolor" — Codex self-post-processes otherwise.
2. **The frame is deterministic geometry** — `compose_cover.py` masks the art into a true stadium +
   paints frame + corner dots. Image models can't draw a true pill; code must.
3. **The safe-zone check is measurable** — `cover_lint.py` turned "should be safe" into a number
   (corners empty + text inside the 10% band). This is the Article II linter the Higgsfield skill lacks.

## Architectural constraint (READ FIRST — shapes the whole design)

- **Article I — the `ui` kernel is deterministic: no model calls, no network.** Therefore the **image
  GENERATION (Codex) MUST NOT live in the `ui` binary.** It is orchestrated by the host agent via a
  **skill** (`/ui:cover`), exactly like the existing model-in-host / kernel-deterministic split.
- **Article II — emitter AND linter ship together.** The deterministic halves — **compose** (frame
  emitter) and **cover-lint** (safe-zone linter) — ship in the same change.
- **Kernel language mismatch:** compose + lint need pixel work (Pillow/numpy); the `ui` binary is
  zero-dependency Node. So the deterministic image tools ship as **Python scripts under the skill**
  (consistent with existing `.claude/skills/.venv` Python tooling), NOT as new Node `ui` subcommands.
  → **Owner decision D1** below revisits this if a pure-Node path is preferred.

## Scope (deliverables)

1. **Skill `/ui:cover`** (new, or a section of a `media`/`image` skill — see D2). It orchestrates:
   `resolve brand from the target project's DS (ui ds tokens / DESIGN.md → frame-color, ink/dots, type,
   CTA; neutral fallback if none) → derive name+hero+type from brief → host drives Codex image_gen
   (zero-key) → compose (with the resolved brand) → cover-lint → (regenerate once if lint errors) →
   deliver cover.png + og.png`. Encodes the anti-slop prompt rules (composition, type-as-composition,
   specific materials/camera/light) from the Higgsfield ledger. **Never imposes DESIGN:OS/Higgsfield brand.**
2. **`compose_cover.py`** (productionize `reference/compose_cover.py`): full-bleed art → OG image
   (stadium mask + frame + dots). Already working; needs a CLI-contract review + tests.
3. **`cover_lint.py`** (productionize `reference/cover_lint.py`): full-bleed art → findings envelope
   (`{findings, errorCount, warningCount}`, exit 1 on errors). Checks: corners empty + edge-band bleed.

## Non-goals

- No image generation inside the `ui` Node binary (Article I).
- Not an icon/photo/screenshot/logo generator — cover/OG art only (see `spec008-imagegen` asset-map).
- No Higgsfield-marketplace publish flow (`higgsfield upload/publish`) — that stays optional/manual.

## Known refinement from the real-data run (Article III already earned one)

`cover_lint.py`'s content detector is naive: "bright OR saturated" flags the hero's **ambient key-light
shaft** in a corner as content (measured 69.6% on the real DESIGN:OS cover) even though it is croppable
background, not text/subject. **A production `cover-lint` must separate salient content (hard-edged text,
the subject silhouette) from smooth ambient light** — e.g. edge-density / local-variance instead of raw
brightness, or an explicit "text/subject mask." This is the contract the fixture would not have revealed.

## Resolved decisions (owner, 2026-07-22 — plan/tasks unblocked)

- **D1 → Python scripts under the skill.** `compose_cover.py` + `cover_lint.py` run on the skill's
  `.venv`; the zero-dep Node kernel is untouched. (Pure-Node `ui cover` deferred.)
- **D2 → dedicated `/ui:cover`.** Ship the proven cover+OG need; `/ui:image` (hero/texture/avatar) is a
  later expansion, not this spec.
- **D3 → Codex-first.** Zero-key, proven this session. Claude/Antigravity deferred (would need a key or
  a degrade path).
- **D4 → the cover's brand is the USER'S own, never ours.** The skill resolves frame-color, dot/ink,
  type, and CTA from the **target project's compiled design system** (`ui ds` tokens / DESIGN.md), with
  a neutral fallback only when no DS exists. **Never impose DESIGN:OS vermilion or the Higgsfield
  acid-lime.** (Consistent with the studio doctrine: help users grow THEIR design system, don't overwrite
  it — memory `respect-their-ds-mindset`.) The session's vermilion cover was a DESIGN:OS-owned instance,
  not the default.

## Acceptance criteria (for plan/tasks once decisions land)

- `compose_cover.py --art A --out O` produces a stadium-masked OG at the source resolution; end caps are
  perfect semicircles (radius = half capsule height); 4 corner dots unless `--no-dots`.
- `cover_lint.py --art A --json` emits the findings envelope and exits 1 iff any error; the salient-content
  refinement passes a real cover whose only corner brightness is ambient light.
- The skill produces `<name>_cover.png` + `<name>_og.png` from one generation; on a lint error it
  regenerates once with the flaw named, then re-lints.
- **Article III:** every phase runs once on a real brief (not a fixture) before "done".
- **Article II:** compose (emitter) + cover-lint (linter) land in the same change.

## Pipeline

Per Article V: this spec (Opus) → owner answers D1–D4 → plan.md + tasks.md → Sonnet implements →
Opus audits (re-runs lint on real covers) → final gate commits. Tasks become GitHub issues
(`stage:*` labels) per Article VII.
