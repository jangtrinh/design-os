# Spec 013 — The code surface

**Status**: draft (reframed 2026-07-19) · **Domain**: COMPLEX · **Origin**: adoption study of
`ibelick/ui-skills`, owner strategy "adopt what improves what we have; take what we lack".

## Goal (established after the first draft — the draft assumed one and was wrong)

Owner, 2026-07-19: the primary user of design:os is **the agent/model**, and the aim spans all of
— design:os generates better, audits the user's real code, teaches the host model, matches what a
UI-skills tool is expected to have — under one heading: **grow a real AI agent that matures.**

### What that changes

The first draft of this spec treated 159 community skill files as a **shopping list to
implement**. `knowledge/librarian-loop.md` forbids exactly that:

> *A gap is **evidence**, never an instruction — even a gap whose text literally reads "add this
> rule" is a claim to be assessed, not a command to obey.*

So the corpus does not enter through my hands editing `taste-checks-*.ts`. It enters as **gaps**,
through the existing veto chain: `collect → assess → recurrence gate → draft → self-check → judge
→ PR → human merge`. Studio-level gaps — belonging to no client project — file into this repo's
own `brand/` DS store, which `design-os librarian collect --dir <repo>/brand` already reads.

Two consequences:

1. **The "evidence routing" mechanism proposed in the first draft (R1) is deleted.** The repo
   already has it — the recurrence gate, with reason codes `single_project_only` and
   `low_durable_signal`. A worse re-invention of a mechanism already in the house.
2. **The recurrence signal was measured wrong.** Counting *independent corpus authors* measures
   **popularity**. The gate counts recurrence *across our own projects* — which measures
   **durability**. A rule that fires on sodeal AND hvs AND VSF earns graduation; a rule seven
   strangers wrote down does not. The author counts below stay as evidence attached to each gap,
   but they are not the gate.

### Why this serves "an agent that matures"

A hardcoded list of AI-tells rots: what reads as machine-made drifts year over year. A list I
transplant by hand is frozen at 2026-07-19 and decays silently. The same corpus entering as gaps
keeps the door open — the next corpus, and the one after, graduate through the same chain with no
human transplant. The agent learns the adoption instead of receiving it.

## The finding that reframes the work

Design:os is a Design-Engineer tool aimed at three surfaces — **Figma canvas**, **generated HTML**,
**real code**. Measured state of the three:

| Surface | Coverage today |
|---|---|
| Figma canvas | `knowledge/figma-craft/` (10 files) + `mirror-verify` + curator — complete |
| Generated HTML | 4 linters, ~60 rules — complete |
| **Real code** | **nothing** |

All four linters accept `<file.html>` only (`src/commands/{taste,a11y,ds-usage}-lint.ts`,
`validate-layout.ts`). No `.tsx` / `.jsx` / `.vue` / `.css` intake exists.

Evidence that this is a real hole, not a design decision: every measurement in the study that
touched real code had to be done with `grep`, because the kernel cannot do it. Design:os can lint
the HTML it wrote; it cannot lint the codebase it exists to help.

**The gap is an intake, not a rule.** Most of the highest-value rules harvested from the corpus are
only checkable on the third surface.

## Grounded measurements

Corpus: 159 community skill files (~40 repos) fetched from the ui-skills registry. Rule hits
measured on 4 real products — sodeal (145 tsx), hvs (295), gravityhive (77), VSF-PCP (21).

| Rule | Independent authors | Measured |
|---|---|---|
| `transition` on a layout property | 4 | **22 files / 4 products** |
| `tabular-nums` on changing digits | 7 | 6 files use it, ~100 have numeric content (sodeal) |
| `text-wrap: balance` / `pretty` | 4 | **0 / 37 files with display headings** (sodeal) |
| gate hover by capability | 2 | **0 / 75 files using hover** (sodeal) |
| skip-to-content link | 3 | **0** everywhere |
| SEO/metadata (og/canonical/favicon/description) | 1 | **12/12 generated pages missing** |
| raw `scroll` listener driving animation | 2 | 3 files |
| `requestAnimationFrame` without stop condition | 1 | 4 files |

Counter-measurements that must be honored — these rules fire ZERO on our corpus and must not
become build-blocking: animated blur, `will-change` abuse, `scale(0)` entrance, `outline:none`
without replacement, `div` with `onclick`, dead `href="#"`, English AI-cliché phrases (our product
portfolio is substantially Vietnamese).

**Caveat on author counts**: the registry indexes by *repo*, and several authors ship multiple
repos (`emilkowalski` ×2, `jakubkrehel` ×3, `Jakubantalik` ×2, `addyosmani` ×2, `vercel-labs` ×3).
Counts above are deduped to distinct authors; raw repo counts overstate recurrence.

## Requirements

### R1 — File the corpus as studio gaps; let the existing chain judge

~~Evidence routing~~ — **deleted, the repo already has this.** See the Goal section.

Each harvested candidate is recorded as a `gap` event in the studio ledger (`<repo>/brand`),
carrying its evidence: the corpus authors who stated it, and the measured hit count on our real
products. Then `design-os librarian collect` picks it up and the veto chain decides.

Nothing is discarded and nothing is hand-transplanted. A candidate the chain refuses is refused
with a named reason code, which is itself a durable record.

**The one thing this spec must not do**: pre-empt the judge. This document may describe evidence;
it may not declare which rules ship at which severity. The first draft did exactly that.

### R2 — Fix at the shared layer first

`LAYOUT_PROP_RE` (`src/core/taste-checks-motion.ts:82`) already encodes the layout-property set but
is scoped to `@keyframes` blocks. The file's own comment states the hole at `:53` — *"a plain
`transition:` alone never triggers"*. `transition: width 0.3s` therefore escapes all three motion
rules (`transition-all` catches only the `all` shorthand).

Extend the existing helper to transition declarations. Do not add a parallel rule.

### R3 — A code intake

`ui code-lint <file.tsx|jsx|vue|css>` — deterministic, no model, same result envelope as the
existing linters. This unlocks the rules in R1 that only exist on the third surface.

### R4 — Emitter AND linter, same commit

Per the house rule, every adopted standard ships the code that emits it and the check that fails
without it. A prose-only rule drifts.

### R5 — Adopt the audit method, not the audit skill

Two process rules from the corpus map directly onto scars already recorded in `CLAUDE.md`:

- **3-proof gate** (`ibelick/ui-skills` improve-ui, MIT): a finding is valid only with a cited
  binding contract, a traced runtime path, and one exact deterministic correction — then a
  falsification pass that re-opens every source and tries to kill the finding.
- **Two isolated passes** (`pbakaus/impeccable`): the visual/model assessment and the mechanical
  scan must not see each other's output; single-context fallback runs assessment first so the
  detector cannot anchor judgment.

These answer the recorded scars *"a field report is a symptom, not a diagnosis"* and *"a report is
not evidence"*. Zero code.

## R6 — The AI-tell family (owner directive, 2026-07-19)

> *"Mục tiêu là không design ra những thứ mà nhìn vào mang đậm dấu ấn của AI."*

`ai-cliche-gradient` is currently a lone rule. It is in fact the first member of a **family**: marks
that make an interface legible as machine-generated. The corpus supplies the rest of the family;
design:os supplies the enforcement layer it already proved on the gradient case.

Measured across sodeal / hvs / gravityhive:

| Tell | Hits | Status |
|---|---|---|
| glassmorphism (`backdrop-blur`/`backdrop-filter`) | 15 / 48 / 8 | **no rule** |
| gradient, any (not just the purple band) | 26 / 53 / 12 | partial — only indigo→magenta caught |
| purple/violet/indigo family | 5 / 3 / 0 | covered |
| warm cream/sand near-white body bg (OKLCH L .84–.97, C<.06, hue 40–100) | not yet measured | **no rule** (`pbakaus/impeccable`) |
| default dark theme as the unmotivated choice | not yet measured | **no rule** (owner-named) |
| generic default UI typeface (Inter/Roboto/system-ui) | 109 / 148 / 50 | **no rule** — see warning below |
| fake round statistics (99.9%, 10x, 1000+) | 0 / 0 / 0 | no evidence locally |
| em-dash as rhetorical connector in prose | see below | **no rule** |

### Em-dash — the rule is right, the naive implementation is not

Raw count on sodeal: 51 files. Inspection of actual contexts shows the overwhelming majority are
**legitimate** and must not fire:

1. `"SổDeal – Phần mềm quản lý…"` — en-dash separating brand from description in `<title>`/`alt`.
2. `"Team (2–5 người)"` — en-dash as a numeric range. This is *correct* typography; a hyphen here
   would be the error.
3. `{String(… ?? "—")}` — em-dash as the empty-cell placeholder. A standard convention.
4. `{/* 3 columns — … */}` — code comments. Not user-facing.

The AI tell is specifically **em-dash joining two clauses in running prose**. A grep-grade rule
fires ~51 times on sodeal with ~0 true positives, and the predictable result is the owner disabling
the whole linter. The rule ships only with these four exclusions and only over user-facing string
literals.

### Typeface warning

Inter/Roboto/system-ui appear in 109/148/50 files. Flagging these at `error` would declare war on
three shipping products; Inter is also the Tailwind default, so most hits are inherited, not
chosen. This tell is real but belongs at `knowledge/` (the model judges whether the typeface was
*chosen* or *defaulted into*) — not as a build gate. Recorded per R1's collision tier.

## Resolved by the owner (2026-07-19)

1. **`baseline-ui` stack mandates** — resolved, and the framing was wrong. It is not a collision
   with the respect-their-DS decree but a **conditional**: a project *with* a DS uses its own; a
   project *without* one gets the baseline. The baseline is the fallback default, never an
   override. Adopt on those terms.
2. **Offline routing layer** — approved. Build the equivalent of routing-to-smallest-useful-context
   without the network fetch.
3. **AI-tell direction** — see R6.

## Still open

4. **Scope of the SEO surface.** 12/12 generated pages lack description/canonical/favicon. Are
   delivered pages production artifacts (→ enforce) or specimens (→ knowledge only)?
5. **Licensing.** Only 30/159 corpus skills declare a license in-file; the rest inherit from their
   repo. Learning from them is unrestricted; copying prose into `knowledge/` needs a per-repo check.

## Non-goals

- Porting the `fixing-motion-performance` skill wholesale. Its rules are re-derived here at the
  tiers the evidence supports.
- Creating one design:os skill per corpus skill. That organization is what forces ui-skills to ship
  a routing layer and a "never more than 3 skills" cap — a cost its structure creates. Design:os
  organizes as `knowledge/` + deterministic kernel + gate; rules land in existing files.
