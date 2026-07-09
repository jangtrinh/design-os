# workflow-experience — the felt experience & cost contract every Figma job follows

The operating experience that sits **above** the individual Figma verbs. Read this FIRST
when a designer describes a Figma job in plain language — it routes the intent to the right
verb, then every verb (`/ui:to-figma`, `/ui:from-url`, `/ui:audit`, …) runs the SAME
lifecycle and honors the SAME cost contract encoded here. `figma-craft.md` is the
*construction* brain (what to build); this file is the *interaction + cost* brain (how the
whole job feels and what it may spend).

**North star:** a designer runs their whole Figma job through a terminal agent and it feels
like **one tool** — describe the job → see the result → iterate → land — without memorizing
verbs or burning tokens.

**Runtime-neutral floor (never violate):** text in · text + file paths (PNG) out ·
slash-verbs. Rich affordances (auto-opening a PNG, a selectable menu) are *progressive
enhancements* that must degrade cleanly to plain text + a file path. Designed for the lowest
common denominator across host CLIs.

---

## Part A — the interaction model

### 1. Intent router (kills "which verb?")

One natural entry — a plain description or `/ui`. Map intent → job → verb from THIS table;
the designer never needs the verb name. The router is a knowledge table, not model
guesswork. Ambiguous → **one** cheap clarifying question, not a wall.

| Designer says / drops | Job | Routed verb |
|---|---|---|
| "rebuild this screen" + a Figma frame URL · "apply our DS" | rebuild a screen | `/ui:to-figma` (real-instance mode) |
| "show every state / variant of X" | component-state board | state-board recipe (`intent-recipes.md`) |
| "lay out the flow / all these screens" | journey / flow | flow layout (`intent-recipes.md`) |
| "audit / fix violations / normalize to the DS" | DS-violation audit | `/ui:audit` |
| "build / migrate the design system" | DS build | DS build (tokens → Variables → Styles → components) |
| "did the file drift / I edited it in Figma" | registry reconcile | registry reconcile against live read |
| a single live **website** URL | capture a spec | `/ui:from-url` |
| **several URLs and/or images** dropped as inspiration ("build … like these") | REFERENCE + a build job | **reference intake (§2b) first → then the build verb** |

Reference-drops are detected by **shape** — multiple URLs/images accompanying a build intent
— and route through the REFERENCE step (§2b) before any build verb runs.

### 2. Uniform job lifecycle (learn once, applies to all)

Every job is a parameterization of the SAME felt shape:

**REFERENCE** (optional, front — ingest inspiration, §2b) → **SCOPE** (confirm what + where,
cheapest reads only) → **PLAN** (mapping table / diff, NO writes) → **BUILD** (via the
seat-adaptive bridge, batched) → **SEE** (export minimal PNG → Read → honest critique) →
**ITERATE** (targeted fixes, capped rounds) → **LAND** (tag, update registry, one-line
summary).

The designer feels the same rhythm whether rebuilding a screen or auditing a DS. Each verb's
template spells out how it parameterizes these steps (see `/ui:audit` for the fully worked
example).

### 2b. Reference intake (the REFERENCE step)

A designer often supplies **multiple URLs and/or images as reference before design starts**
("build me a dashboard like these 3 sites + these 2 screenshots"). This is a first-class
front step **and a cost hotspot** — handle it disciplined:

- **Two extraction paths, both isolated in subagents** (return DNA, not raw dumps — the main
  context stays small; main-context length is the recurring cost):
  - **URL** → the `/ui:from-url` / `figma-agent capture` pipeline (headed browser → tokens +
    layout DNA + a screenshot). Real, precise.
  - **Image** → one vision `Read` → a compact DNA description (palette, type feel,
    spacing/density, notable components, mood). Less precise, captures inspiration.
- **Extract ONCE → cache.** Each reference becomes a small `reference-DNA.json` (colors, type
  ramp, spacing, mood tags, source) at `<project>/references/<slug-or-imgN>/`. Never re-read
  the raw asset again.
- **Synthesize deterministically where possible.** Cluster colors / rank tokens / merge type
  ramps across references via the zero-token `ui` binary, producing ONE **reference brief /
  moodboard DNA** — the design prior.
- **Capture the strategy** (`prompt-modes.md`): replicate ("like THIS one"), enhance, or
  adapt/blend across many. Ask once if ambiguous.
- **Cap + prioritize.** Many references → sample or ask which are primary vs secondary;
  **state what was sampled** (no silent truncation). One subagent per reference fans out;
  results merge.
- The reference brief feeds SCOPE/PLAN as a prior. Precedence stays: **explicit brief >
  references > project memory (`ui memory`) > knowledge floors.**

### 3. Session context (set once, never re-ask)

Project · Figma file key · design-system / registry · **seat** — captured once into a project
config + `ui memory`, carried across turns. The tool never re-asks "which file?" or re-probes
the seat mid-session (seat probe: `figma-agent-hand.md` → "Bridge selection").

### 4. The "eyes" — feedback contract (make-or-break)

After **every** mutation the agent OWES the designer a visual confirmation:
export-png (minimal scale / cropped to the changed region) → `Read` → **2–3 honest lines**:
*what changed* + *does it meet the intent* (+ what's off) + the **PNG path** (auto-open where
the runtime allows, else just the path). Critique is honest — never "looks great" by default.
The designer always knows the current visual state without opening Figma. The scoring form of
this step is the critique gate (`taste-rubric.md` axes via `templates/workflows/critique.md`).

### 5. Trust & safety (it's their live file)

Live writes follow: **preview intent → confirm → write to a clone / new page by default →
idempotent tag → easy undo.** Never mutate team-owned frames in place without asking;
destructive/ambiguous → confirm first. This generalizes `canvas-operations.md` R4 (run-tagged
idempotency) + R5 (clone-to-page + await-user-swap).

### 6. Progressive disclosure

Simple job = one line in, done. A lightweight `/ui` menu lists what's possible; the agent
**proactively suggests the next verb** ("built the screen — want the state board or the
flow?"). Power is hidden, not absent.

---

## Part B — the cost contract (invariant across every job)

**Principle: the model judges; the `ui` binary computes; heavy reads are cheapest-first and
isolated.** Each verb's template must state which sub-steps are `ui`-binary (zero-token), its
read-ladder budget, and its max rounds — so "how many tokens does this job cost?" has a
bounded, stated answer.

1. **Determinism-first → zero-token `ui` binary.** Everything computable runs in Bash, not in
   model context: color math, contrast, token compile, layout validation, **violation
   detection**, remap tables, registry diff, slug/path resolution. The model orchestrates +
   judges taste/intent only. *(Biggest single lever — and reproducible.)*
2. **Cheapest-first read ladder.** `get_metadata` (names/structure) → low-res `get_screenshot`
   → full `get_design_context` ONLY on demand. Never blind-fetch a 25K-token context.
3. **Minimal vision.** Export the smallest scale that answers the question; crop to the changed
   region; don't re-Read unchanged areas; cap critique rounds (≤ 3–5). Vision tokens are the
   loop's hidden cost.
4. **Cache + reconcile, don't re-read.** The registry is a cheap fact cache; reconcile by
   **NAME** (ids drift — `canvas-operations.md` R2) with a diff, not a whole-file re-read.
5. **Isolate heavy work in subagents/forks.** File/image dumps happen in a subagent that
   returns only the *conclusion* — the main context (re-sent every turn) stays small.
6. **Batch canvas ops.** Many ops per round-trip (`figma-agent batch`), not N chatty calls.
7. **Resume, don't rebuild.** Idempotent tags let a re-run skip done work.
8. **Budget awareness.** Surface an estimate ("this screen ≈ N calls / ~X tokens"); honor a
   user-set depth/budget; the router picks the **cheapest path that satisfies the intent**.
9. **Lean knowledge loading.** Route to the ONE minimal knowledge file a step needs; read a
   compact index tier first, deep files only when the task requires them.

---

## Success criteria (how we know the experience is right)

- A designer completes **rebuild-a-screen without knowing any verb** — the router got them there.
- **Every mutation is followed by a visual confirmation** the designer can trust (honest critique + PNG).
- **No job blind-reads a 25K context** or re-computes what `ui` can compute.
- **Cost per screen is bounded and surfaced**; a budget can be set and is honored.
- The same **seven-step rhythm** is recognizable across every job.

## Companions

`figma-craft.md` (construction brain) · `canvas-operations.md` (R1–R8 operating disciplines
for live/team-owned files) · `prompt-modes.md` (replicate/enhance/adapt for the reference
brief) · `figma-agent-hand.md` (the hand + seat/bridge selection) · `taste-rubric.md` (the
critique gate the "eyes" contract scores against).
