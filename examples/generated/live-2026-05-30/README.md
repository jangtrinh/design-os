# Live Dogfood — 2026-05-30 (post token→HTML fix)

A real end-to-end run of the **fixed** `/ui:generate` flow, executed by the host model
(a Claude Code session — the model the workflow targets) against the v1 binary. Unlike the
2026-05-24 pass (which predated the token-loop fix and styled with arbitrary `bg-[#hex]`),
this output consumes the design system **mechanically** via Tailwind `@theme` token utilities.

**Intent:** _"pricing page for a project management SaaS — three tiers, monthly/annual toggle,
feature comparison, FAQ"_
**Persona:** `saas-aurora-minimal` (family `functional-saas`) — SaaS-signal match.

## What ran (real binary calls)

| Step | Command | Result |
|---|---|---|
| Compile DS | `ui ds init pmflow-pricing --persona saas-aurora-minimal --intent "…"` | DS at gen 1, indigo `#6366F1` primary |
| Load context | `ui ds context --strict` | semantic tokens + enforcement preamble |
| Compile theme | `ui tokens compile design/design.tokens.json --target tailwind` | 159-line `@theme` block, 12 color tokens |
| Generate | host model authored `variant-1-saas-aurora-minimal.html` | styled via `@theme` utilities |
| Gate (autofix) | `ui autofix … --json` | **0 findings** |
| Gate (layout) | `ui validate-layout … --json` | **0 errors, 0 warnings** |
| Gate (taste) | `ui taste-lint … --tokens design/design.tokens.json` | **1 violation → refined → 0** |

## The critique→refine loop actually fired

First taste-lint pass flagged **1 Typography violation** (a 13px badge, below the 16px
body floor). One refine round (13px → 14px label) cleared it. Re-run: **0 violations.** This
is the deterministic floor doing its job — not a pass-by-default.

## Token-binding proof (the thing the fix delivers)

- **64** token-bound utilities (`bg-primary`, `text-text-body`, `border-border`, …).
- **0** arbitrary-hex utilities (`bg-[#hex]`). Contrast: the 2026-05-24 variant-1 had **135**.

The compiled `@theme` block is inlined in `<head>`; every color/spacing value resolves to a
DS token. A developer can open this project's `design/` in their CLI and get the identical DS —
one source of truth, designer and dev.

## Full flow proven: generate → iterate → redesign

This dogfood now exercises the three core workflows end-to-end on the same project — each
real (driven by the actual binary), each token-bound, each gate-clean:

| Workflow | What ran | Result |
|---|---|---|
| `/ui:generate` | host model authored variant-1 from the `@theme` tokens | 64 token utils / 0 hex; gates: autofix 0, layout 0, taste 1→**refined→0** |
| `/ui:iterate` | `edit-strategy select` → "make the hero headline bigger" → classified `ln_diff` → authored a line-diff → `edit-strategy apply --write` (the bug-fixed `applyLnDiff`) | headline 56→64px, **1 chunk applied, neighbors intact** (subhead + badge survived — the old over-delete bug would have nuked them); gates: 0/0/0 |
| `/ui:redesign` | contra-persona swap saas-aurora-minimal → **liquid-glass** (material-surface): same content + same DS tokens, visual axes flipped | 58 token utils / 0 hex; **IA preserved** (all content anchors present); **12 glass/blur layers** replace flat surfaces; gates: 0/0/0 on first pass |

**The discipline result:** the redesign is a radically different look (translucent glass over a
rich gradient vs flat aurora-minimal) **while binding to the identical DS token set** — exactly
what the Consistency axis exists to guarantee, demonstrated rather than asserted.

## Breadth: the opposite taste extreme also passes

`dashboard/variant-1-data-dense-observatory.html` is a second, independent project at the far
end of the taste spectrum from the pricing page — proving the engine + gates aren't tuned to one
happy path:

| Dimension | Pricing page | Dashboard |
|---|---|---|
| UI type | landing / marketing | analytics dashboard |
| Persona | saas-aurora-minimal | data-dense-observatory |
| Color mode | light | **dark** (`#0B0D13`) |
| Density | airy (48–64px gaps) | **compact** (8–12px) |
| Depth | subtle elevation | **flat** (1px borders, no shadow) |
| Result | gates 0/0/0 | **gates 0/0/0** |

25 token utilities / 0 hex; a live Chart.js graph, a fleet data table, dense KPI grid — all
token-bound, all clean on the same deterministic floor. The taste-lint floor even held the body
text to ≥14px despite the persona's 12–14px note (the deterministic floor wins). Same engine,
same quality bar, opposite aesthetic.

## The extraction direction also proven (`extract/`)

The reverse flow — `/ui:extract` and the binary half of `/ui:from-url` — runs the `designmd`
family on real HTML (the generated pricing page):

| Step | Command | Result |
|---|---|---|
| Tokens | `ui designmd extract-tokens source.html --out tokens.json` | 14 colors + 12 custom-props recovered, **each with line-number provenance** (e.g. `#6366f1` at L18/L29/L46) |
| Snapshot | `ui designmd snapshot … --out DESIGN.preview.html` | 9.5KB self-contained render (CSS inlined, scripts stripped) |
| Audit gate | `ui designmd audit .` | 5 families, exit-code enforced |

**The audit gate caught real issues — then we fixed them.** First pass: a format **FAIL** (the
DESIGN.md had front-matter but was missing the 8 required prose sections → exit 1, workflow must
stop). After completing the sections: **15 PASS / 0 FAIL / 1 WARN** — and the WARN is a genuine
accessibility finding (indigo `#6366F1` body text clears large-text 3:1 but not body 4.5:1 WCAG).
This is the production-grade gate doing exactly its job on real input: deterministic, honest,
exit-code-driven — not a rubber stamp.

## Coverage map — every advertised workflow now has a real, gate-checked artifact

| Workflow | Demonstrated |
|---|---|
| generate · iterate · redesign | the three variants above |
| from-url / extract (`designmd` family) | the `extract/` folder |
| breadth (UI type · color mode · density) | pricing page ↔ dashboard |

## Files
- `variant-1-saas-aurora-minimal.html` — generated, gate-clean.
- `variant-1-iterated.html` — after `/ui:iterate` (hero headline enlarged via real ln-diff apply).
- `variant-2-redesign-liquid-glass.html` — `/ui:redesign` into a contra-persona, same DS.
- `design/` — the compiled project DS (tokens + manifest + registry), shared across all three.

## Honest scope
- One variant shown (the flow generates three from diverse personas; one is enough to prove
  the token loop + gates). A fuller multi-variant + multi-workflow dogfood remains worthwhile.
- Gates score code correctness + the machine-checkable taste floor. The subjective critique
  axes (is the composition *authored*?) are the model's judgment, not asserted here.
- Visual browser review not included — the artifact is open-in-browser ready.
