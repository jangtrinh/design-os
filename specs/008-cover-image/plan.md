# Plan 008 — Cover & OG image (`/ui:cover`)

Implements `spec.md` (decisions D1–D4 resolved). Tier: Sonnet implements → Opus audits → gate.
Prototypes in `reference/` are PROVEN this session and are the source of truth to productionize.

## Architecture (from resolved decisions)

- **Generation = host/skill, deterministic tools = Python** (D1). The `ui` Node kernel is NOT touched.
- **Surface = `/ui:cover` verb** (D2): a `templates/workflows/cover.md` + a `VERB_SKILL_REFS` entry;
  `ui init` regenerates the per-runtime adapter so every runtime gets the verb.
- **Runtime = Codex-first** (D3): the skill drives `codex exec` image_gen (zero-key).
- **Brand = the target project's DS** (D4): resolve frame/ink/type/CTA from `ui ds` tokens; never ours.

## Files

**Create**
- `templates/workflows/cover.md` — the `/ui:cover` workflow body: brief → resolve brand from DS →
  Codex gen (anti-slop prompt template) → compose → cover-lint → regenerate-once → deliver 2 files.
- `scripts/cover/compose_cover.py` — productionized from `reference/compose_cover.py` (unchanged logic).
- `scripts/cover/cover_lint.py` — productionized from `reference/cover_lint.py` PLUS the salient-content
  refinement (spec "Known refinement": distinguish hard-edged text/subject from smooth ambient light —
  use local-variance / edge-density, not raw brightness).
- `scripts/cover/README.md` — how the skill invokes the two scripts (venv, args, exit codes).
- `tests/cover-compose.test.ts` OR `scripts/cover/test_cover.py` — see Task 4 (harness choice).

**Modify**
- `src/adapters/skill-refs.ts` — add `cover: ["pick-persona", "color-decision", "token-model"]` to
  `VERB_SKILL_REFS` (persona for type treatment, color-decision + token-model for DS-brand resolution).
- `tests/adapters-skill-refs.test.ts` — assert the new `cover` verb maps to those skills.

**Blocking unknown (Task 0):** confirm the committed ship-home for the `.py` scripts. Candidates:
`scripts/cover/` (repo root, committed) vs `templates/`. `.claude/skills/` is gitignored (Article VII.5)
→ NOT a home. Resolve before Task 3.

## Contracts

- `compose_cover.py --art A.png --out O.png --frame-color HEX --dot-color HEX [--no-dots ...]` →
  stadium-masked OG at source resolution; exit 0.
- `cover_lint.py --art A.png --json` → `{findings, errorCount, warningCount}`; exit 1 iff errorCount>0.
  finding shape `{checkId, severity, message}` (Article II). Checks: `cover-corner-not-empty` (error),
  `cover-edge-content-heavy` (warning), and the refined salient-content variant.
- `/ui:cover "<brief>"` (host) → `<name>_cover.png` + `<name>_og.png`; on lint error, regenerate once
  with the failing region named, then re-lint; deliver both files + the lint verdict.

## Acceptance (Article III — real data, not fixtures)

1. Run `/ui:cover` on a REAL project that has a DS (e.g. a VSF/dana clone) → the cover's frame/ink/CTA
   come from THAT project's tokens, not DESIGN:OS vermilion.
2. `cover_lint.py` passes the session's real DESIGN:OS cover once the salient-content refinement lands
   (the key-light corner no longer errors; a title in the corner still does).
3. `compose_cover.py` round-trips a real 3:2 art → OG with perfect semicircle caps.
4. Four gates green (`typecheck`, `lint`, `build`, `test`); the new verb's adapter test passes.

## Out of scope (deferred)

Pure-Node `ui cover`; `/ui:image` (hero/texture/avatar); multi-runtime gen; Higgsfield publish flow.
