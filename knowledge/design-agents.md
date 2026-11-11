---
id: design-agents
description: "Soul-bound, task-scoped project agents — roles, boundaries, naming, and the opt-in roster."
when: [agent, roster, designer-agent, curator-agent, figma-hand, agent-identity]
---

# Design Agents — soul-bound, task-scoped identities

A design agent is a **soul-bound identity with a task scope**, generated as a real
subagent of the host runtime (Claude Code: `.claude/agents/<name>.md`). Soul-bound:
its identity descends from the genealogy of souls — the studio soul
(`$EASE_DESIGN_HOME/studio-soul.md`) above the project soul (`design/soul.md`).
Task-scoped: each role owns one kind of work and explicitly hands the rest to its
siblings. `ui agents init|list|check` is the toolchain.

## §1 Naming — the genealogy

`studio × project × role`. The studio soul's frontmatter `name:` (e.g. `name: MERIDIAN`)
crossed with the project's manifest name (e.g. `meridian-store`):

- **designer** → `designer-meridian-meridian-store` — generic role prefix, genealogy suffix.
- **curator** → `curator-meridian-meridian-store`; **figma-hand** → `figma-meridian-meridian-store`.
- No studio soul → `designer-<project>` etc.; the role prefix is what you delegate to.
- No studio soul → `meridian-store-designer` / `meridian-store-curator` / `meridian-store-figma`, and
  `init` hints at `ui ds soul init --studio`.

Names are sanitized to `^[a-z][a-z0-9-]*$`, capped at 64 chars.

## §2 The first three roles — and their boundaries

- **designer** — generation, iteration, refinement on the project DS; runs the four
  machine gates before every handback. The designer **never scores its own output**, and
  never edits `knowledge/` or `schemas/` — a knowledge gap is recorded as a `gap` event
  (`ui memory record gap`), for the librarian to graduate.
- **curator** — critique, scoring, audits (taste rubric + curator facets +
  `design-os audit` / `ui ds a11y`); verdict + punch list, report-only. The curator
  **never edits or generates an artifact**, and never edits `knowledge/` or `schemas/` —
  a knowledge gap is recorded as a `gap` event (`ui memory record gap`), for the librarian
  to graduate.
- **figma-hand** — canvas operations through the `figma-agent` CLI, verify-by-export
  after every write. The figma hand **never simulates** — plugin down means BLOCKED,
  not pretend-results — and never edits `knowledge/` or `schemas/`: a knowledge gap is
  recorded as a `gap` event (`ui memory record gap`), for the librarian to graduate.

The boundaries are the point: maker and judge stay separate hands, canvas truth comes only
from the canvas, and none of the three touches `knowledge/` — they *feed* it gap events for
the librarian (§7) to graduate. The per-project roster closes at these three; it grows only
after they live in real projects. The librarian is not a fourth roster slot — it is
**studio-level**, above every project's roster (see §7).

## §3 Identity is runtime-read, never baked

A generated agent body does NOT contain soul text. Its standing first action is
`ui ds context`, which already carries the project soul and the studio soul beneath
it — so editing a soul updates every agent's behaviour instantly, with zero drift
and nothing to regenerate. Only the **name** is baked at generate time; renaming the
studio or project means `ui agents init --force`.

## §4 Roster is opt-in

`ui init` never generates agents on its own — it prints a hint, and only the
explicit `ui init --with-agents` flag exercises the opt-in in the same run
(claude runtime + existing project DS required). A user otherwise runs
`ui agents init` (optionally `--roster designer,curator`) to get one or as many
agents as they want; a project with zero agents is a fully supported state
(`agents check` reports it as a warning, never an error).

In an adopted kit project (`ui ds kit adopt`), generate agents straight into it and
leave them out of `kit.json` artifacts. Kit integrity admits an undeclared
`.claude/agents/*.md` only when it carries the design-os stamp (the same mark §6
reads), so a hand-written agent there still fails `ui ds kit verify`. Declaring a
generated agent binds its bytes, and the next `agents init --force` then reads as
tampering. See `ds-kit-onboarding.md` §5 for the full host-file rule.

## §5 Runtime scope

`ui agents init` renders one roster (`templates/agents/<role>.md`) to the three runtimes `ui init` supports. The default
of `--runtimes` is the `RUNTIMES` constant, not what is installed:

| Runtime | Target |
|---|---|
| Claude Code | `.claude/agents/<name>.md` (the bytes outside the area block are the render, unchanged) |
| Antigravity | `.agent/skills/design-os-agent-<name>/SKILL.md` |
| Codex | the design-os agents section of `AGENTS.md`, written through the upsert-section artifact between its own sentinels (the text around it, and the ease-design block `ui init` writes, are never rewritten) |

`ui init --with-agents` stays the Claude Code opt-in. This is NOT the same as runtime support: `ui init` emits design:os
skills and workflows for antigravity and codex through a separate mechanism, see the adapters under `src/adapters/`.

Each rendered agent carries one generated block between `<!-- design-os:ontology-areas:start -->` and
`<!-- design-os:ontology-areas:end -->`: the command `ui ontology query "<your task>" --area "<area key>"` once, then one line per
area of `design/knowledge/ontology.json` with its key and node count (the Codex section carries one block, under its
heading, not one per role), and how to ask the owner an open ruling question (Claude
Code: `AskUserQuestion` with the options `ui onboard questions --format claude` prints; the other runtimes: print the
numbered questions `ui onboard questions` prints and wait). With no ontology the block says so and names
`ui ontology build`. It is the one deliberate exception to §3: it sits between markers, `ui agents init --force`
regenerates it, and `ui agents check` re-renders it from the ontology file and compares (`ONTOLOGY_STALE`).

## §6 Drift check — the emitter/linter pair

`templates/agents/<role>.md` is the source of truth. Every generated file carries a
stamp comment (`design-os agents · roster-role: <role> · template-hash: <fnv1a-8>`),
and `ui agents check` re-renders the live templates against the project + studio
names: any file that no longer matches — template updated, file hand-edited, or a
name moved — is `agent-stale` (error, exit 1; fix: `ui agents init --force`). A
stamped role no longer in the roster is `agent-unknown-role` (warning).

## §7 Librarian — the studio knowledge keeper

The three roles above serve **one project** and never edit `knowledge/`; they feed it `gap`
events. The **librarian** is the one hand that reads those gaps and evolves the shared
knowledge core — and it lives a tier up, at **studio level**, above every project's roster.

- **One door to `knowledge/`.** The knowledge core changes through the librarian and a PR,
  never through a project role editing it directly. A `gap` event is the raw material; the
  librarian graduates a durable, cross-project gap into shared knowledge on a branch a human
  merges. It **never generates** an artifact (that is the designer), **never scores** one
  (that is the curator), **never edits `schemas/`** (machine contract — proposed in the PR
  body, not authored), and **never merges its own PR** (the human gate is invariant).
- **Studio-level, outside the roster.** It is not generated by `ui agents init` and is not a
  fourth `ROSTER` slot — a per-project roster of makers/judges is the wrong home for a keeper
  of studio-wide taste. It is a committed static file at `.claude/agents/librarian.md`; its
  identity is soul-bound like the others but its scope is the whole studio, not one project.
- **The loop.** Its procedure is `knowledge/librarian-loop.md` (a veto-chained
  collect → assess → recurrence-gate → draft → self-check → judge → PR → human-merge run),
  fed by `design-os librarian collect`. Both ship in a later phase; until then the librarian
  reads open gaps directly with `ui memory query --type gap`.
