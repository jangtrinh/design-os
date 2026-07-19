# Plan — Spec 013: The code surface

**Spec**: `spec.md` · **Domain**: COMPLEX
**Grounded**: 4 real products (sodeal 145 tsx, hvs 295, gravityhive 77, VSF-PCP 21) + 12 generated
pages + a 159-file community corpus.

## The split that organizes this plan

Two kinds of work, and conflating them is what broke the first draft.

| | Goes direct | Goes through the librarian chain |
|---|---|---|
| **What** | our own structural holes | rules harvested from other people's skills |
| **Why** | a hole in our code is a bug, not a claim | a gap is evidence, never an instruction |
| **Authority** | this plan | `collect → assess → recurrence gate → draft → judge → human merge` |

Phases A–C are ours to build. Phase D is the intake that hands everything else to the chain — and
it is the phase that serves the stated goal, an agent that matures, because it keeps working after
this spec is closed.

---

# Direct build — our own holes

## A — Close the shared-layer hole (measured, cheapest)

`LAYOUT_PROP_RE` (`src/core/taste-checks-motion.ts:82`) already names the layout-property set but
is applied only inside `@keyframes`. The file's own comment states the hole at `:53` — *"a plain
`transition:` alone never triggers"*. So `transition: width 0.3s` escapes all three motion rules
(`transition-all` catches only the `all` shorthand).

This is **not** an adoption. The corpus merely pointed a light at a hole in code we already own.

- New check `transition-layout-props`, axis Motion. Reuse the existing regex — its `[{;]` anchoring
  already rejects what an ad-hoc grep cannot (`transition-colors text-left`, a Tailwind class;
  minified `transition-property:none}}@media…min-width:64rem`). Do not write a second regex.
- Measured: **22 files across 4 real products.**

### Tests (verbatim from real products)
- `transition: width 0.4s var(--dash-ease)` → flagged
- `transition: width 0.2s ease, left 0.2s ease` → flagged, both properties named
- `transition: transform 0.2s ease, opacity 0.2s` → clean
- `transition-colors text-left` (class-attribute text) → clean
- `max-width`, `line-height`, `border-right` → clean (assert the anchor holds)
- existing `keyframes-layout-props` / `transition-all` cases → unchanged

**Done when** the 22 measured files flag and the suite stays green.

## B — The code intake (`ui code-lint`)

The structural gap behind the Design-Engineer direction: all four linters accept `<file.html>`
only. No `.tsx`/`.jsx`/`.vue`/`.css` intake exists. Design:os can lint the HTML it wrote; it cannot
lint the codebase it exists to help.

Evidence this is a hole and not a decision: every real-code measurement in this study had to be
done with `grep`, because the kernel cannot do it.

`ui code-lint <file> [--json]` — deterministic, no model, same result envelope (Art I.3). Scope v1
narrow: extract style-bearing text (CSS blocks, `style` attributes, class-attribute strings) and
run what is decidable on it. No type resolution, no bundler, no framework awareness.

This phase ships the **intake**, not a rule set. Which rules ride it is the chain's call (Phase D).

**Done when** `ui code-lint` reproduces, on the four real products, the counts recorded in the
spec. A count that does not reproduce means the rule or the measurement was wrong — fix it; do not
adjust the number to match.

## C — Investigate the focus ring (an investigation, not a rule)

**Observation**: 11/12 generated pages contain `<button>`; **0/12** define any focus style — no
`outline`, no `focus-visible`. Meanwhile taste-lint ships `focus-ring-animates-in`, a rule that
presumes a ring exists.

Determine which it is before adding anything:
- a `component-kit` emitter bug (buttons ship with no focus style), or
- a specimen-corpus artifact (the 12 pages total 2002 lines and contain no `@keyframes`, no
  `position:absolute`, no `outline` at all — the corpus may simply be too thin to show it), or
- a real knowledge gap.

The corpus cannot discriminate. Reproduce on a freshly generated page first. Per the recorded scar
— *if it looks like a hole, first assume it is a decision, then go find the sentence that made it.*

---

# Through the chain — the harvested rules

## D — File the corpus as studio gaps

Record each candidate as a `gap` event in the studio ledger (`<repo>/brand`), carrying its
evidence, then let `design-os librarian collect` and the veto chain do the rest.

**This plan does not assign severities.** Doing so pre-empts the judge, which is what the first
draft got wrong.

### Candidates, with the evidence each gap carries

| Candidate | Corpus authors | Measured on our products |
|---|---|---|
| `transition` on a layout property | 4 | 22 files / 4 products *(→ Phase A, ours)* |
| `tabular-nums` on changing digits | 7 | 6 use / ~100 candidates (sodeal) |
| `text-wrap: balance` / `pretty` | 4 | 0 / 37 files with display headings (sodeal) |
| gate hover by input capability | 2 | 0 / 75 files using hover (sodeal) |
| skip-to-content link | 3 | 0 everywhere |
| metadata: description / canonical / og / favicon | 1 | 12/12 generated pages missing |
| raw `scroll` listener driving animation | 2 | 3 files |
| `requestAnimationFrame` with no stop condition | 1 | 4 files |
| **AI-tell: glassmorphism** | 1 | 15 / 48 / 8 |
| **AI-tell: gratuitous gradient (any hue)** | 2 | 26 / 53 / 12 |
| **AI-tell: warm cream/sand body bg** (OKLCH L .84–.97, C<.06, hue 40–100) | 1 | not yet measured |
| **AI-tell: unmotivated default dark theme** | owner | not yet measured |
| **AI-tell: generic default typeface** | 4 | 109 / 148 / 50 — see caution |
| **AI-tell: em-dash as prose connector** | 1 (+owner) | see caution |

Counter-evidence that must ride along with the gaps that claim them — these fire **zero** on our
corpus: animated blur, `will-change` abuse, `scale(0)` entrance, `outline:none` without
replacement, `div` with `onclick`, dead `href="#"`, English AI-cliché phrase lists (our portfolio
is substantially Vietnamese), fake round statistics.

### Two cautions the gaps must carry, or the chain will judge on bad evidence

**Em-dash.** Raw count on sodeal: 51 files. Inspection shows the overwhelming majority are
legitimate and must never fire — all four verbatim from sodeal:
1. `"SổDeal – Phần mềm quản lý…"` — en-dash separating brand from description in `title`/`alt`
2. `"Team (2–5 người)"` — en-dash as a numeric range; *correct* typography, a hyphen would be wrong
3. `String(x ?? "—")` — em-dash as the empty-cell placeholder, a standard convention
4. `{/* 3 columns — … */}` — a code comment, not user-facing

The tell is specifically an em-dash joining two clauses in running prose. A grep-grade rule fires
~51 times on sodeal with ~0 true positives, and the predictable outcome is the owner disabling the
linter. If this graduates, it graduates with those exclusions, over user-facing string literals
only — and its acceptance test is that it fires **≤2 times on sodeal**. A rule reproducing the
naive count has failed, not succeeded.

**Typeface.** Inter/Roboto/system-ui appear in 109/148/50 files. Inter is the Tailwind default, so
most hits are *inherited*, not *chosen* — and enforcing this would declare war on three shipping
products. The judgement "was this typeface chosen or defaulted into?" is not statically decidable.

### The AI-tell family (owner directive)

> *"Mục tiêu là không design ra những thứ mà nhìn vào mang đậm dấu ấn của AI."*

`ai-cliche-gradient` is currently a lone rule; it is the first member of a family. If the chain
graduates further members, they belong **in that family's shared shape** — a tell has a detector, a
severity, and a stated reason the mark reads as machine-made — not scattered across unrelated
files.

Standing requirement for any member: its message must state *why* the mark reads as machine-made.
A tell the model cannot explain is a taste opinion wearing a rule's clothes, and belongs in
`knowledge/`.

Because what reads as machine-made drifts year over year, this family must stay reachable by the
chain after this spec closes. That is the point of Phase D.

## E — The audit method (zero code)

Into `knowledge/design-review.md`: the 3-proof gate (contract / runtime / correction), the
falsification pass (`ibelick/ui-skills` improve-ui, MIT), and two-isolated-passes — the visual and
mechanical passes must not see each other's output (`pbakaus/impeccable`).

These answer scars already recorded in `CLAUDE.md` — *"a field report is a symptom, not a
diagnosis"*, *"a report is not evidence"*. Cross-link both ways so the connection is not lost.

## F — The offline router

Route a task to the smallest useful knowledge context: the intent of `ui-skills-root`, none of its
mechanism — no network fetch (Art I). Reads the local `knowledge/` index.

Carries the baseline contract the owner resolved: **a project with a design system uses its own; a
project without one gets the baseline.** The baseline is a floor when nothing is there, never an
override — the respect-their-DS decree (2026-07-17) governs every project that has a DS.

---

## Sequencing

A → B (independent of each other in principle; A is nearly free). C, E, F independent. **D should
not queue behind the plumbing** — it carries the owner's stated intent and it is the phase that
keeps working after this spec closes.

## Gate (Art II + Art III)

- `npm run typecheck && npm run lint && npm run build && npm test` green.
- Every phase runs once on real project data before it is called done — not on a fresh fixture.
- Re-run the gate **inside the worktree it ran in**, per the recorded scar about a `git checkout`
  refused by a worktree silently gating the wrong tree.

## Still open

- **Scope of the SEO surface**: are the generated pages production artifacts (→ enforce) or
  specimens (→ knowledge only)? Blocks how that gap is filed.
- **Licensing**: only 30/159 corpus skills declare a license in-file. Deriving rules is
  unrestricted; copying prose into `knowledge/` needs a per-repo check.
