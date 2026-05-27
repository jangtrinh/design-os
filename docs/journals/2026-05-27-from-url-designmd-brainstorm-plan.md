# 2026-05-27 — `/ui:from-url` → DESIGN.md (brainstorm + plan)

## Context

Post-v1 (15 commits local, unpushed). User asked for "fetch any website and
turn it into design.md." Initial scout exposed the terminology gap: this repo
has no `design.md` artifact — the SSOT is `design/*.json` (DTCG tokens +
component registry + sealed manifest). One web-search round clarified that
`DESIGN.md` is an actual open spec from **Google Labs / Stitch** (alpha) —
YAML front-matter + 8 ordered Markdown sections — already used by an
ecosystem of extractor tools (Dembrandt, Design Extractor, DesignMD.cc, the
VoltAgent awesome-design-md collection). Anthropic's `frontend-design` skill
has an open issue (`anthropics/skills#1008`) tracking consume/produce
support. So the feature isn't novel — but no extractor I found is
**runtime-neutral** the way ease-design is, and none ships an enforceable
spec gate downstream.

## What was decided

Three concrete decisions in the brainstorm:

1. **`design.md` = Google-Labs DESIGN.md alpha spec.** Pinned via a new
   `knowledge/designmd-format.md` so future spec drift becomes a knowledge-
   file diff, not a code diff.
2. **Workflow-only approach.** Host CLI fetches the URL (WebFetch →
   bb-browser MCP → user-paste fallback chain); host model composes the YAML
   + 8 sections; binary stays deterministic and no-network per CLAUDE.md.
   Mirrors the existing `/ui:from-ref` architecture verbatim. The
   alternatives — DTCG bridge subcommand, or DESIGN.md as first-class peer
   SSOT — were rejected as YAGNI for v1.x.
3. **Output at `./DESIGN.md` (project root).** Matches Google convention,
   coding-agent discoverable, one per project.

## Plan shape

Three phases, ~9h end-to-end, sequential:

| # | Phase | Effort | Surface |
|---|---|---|---|
| 1 | Workflow + knowledge core | 4h | 3 new content files; zero code |
| 2 | Adapter wiring | 3h | Edit `templates.ts`, `skill-refs.ts`, update 5 adapter tests |
| 3 | Dogfood + docs | 2h | 3 URL runs, README, journal |

No code is added to `src/commands/*.ts` — no new `ui` subcommand. The
existing adapter machinery already iterates `WORKFLOW_VERBS` and
`SKILL_NAMES` dynamically, so adding `from-url` and `designmd-emit` to those
arrays propagates to all three runtimes without bespoke code per adapter.

## Risks accepted into v1.x

- **No deterministic `ui designmd validate`.** YAML validity rides on the
  workflow's step-9 self-check. If drift becomes a real problem in
  dogfood, fast-follow with a real linter in v1.y.
- **No DTCG bridge.** DESIGN.md doesn't feed back into `design/*.json`, so
  `/ui:generate` can't consume it indirectly. Users who want both worlds
  run `/ui:extract` on a later generated HTML to populate the JSON SSOT.
- **SPA fetch fragility.** WebFetch returns thin HTML for JS-heavy sites;
  fallback chain is the answer (bb-browser MCP → user-paste). Phase 3
  dogfood explicitly tests this rung.

## Why not `--tdd` or `--hard` mode

- No existing behaviour being refactored — pure additive surface.
- No security/auth/payments/infra blast radius.
- Brainstorm round already exercised the design space (4 questions on
  scope, 3 follow-ups on integration depth / fallback / output path).
- Default mode + Phase 2's test updates as the regression net are
  sufficient.

## Artifacts

- Brainstorm: `plans/260527-from-url-designmd/brainstorm-from-url-to-designmd.md`
- Plan: `plans/260527-from-url-designmd/plan.md`
- Phases: `phase-01-workflow-knowledge-core.md`, `phase-02-adapter-wiring.md`,
  `phase-03-dogfood-docs.md`
- Tasks hydrated: #1, #2, #3 (sequential blockedBy chain)

## Next

`/ck:cook plans/260527-from-url-designmd/plan.md` when ready to implement.
Or continue with whatever the user picks up first — plan persists across
sessions.
