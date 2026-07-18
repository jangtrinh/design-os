# Report — Spec 011 Phase 1: the role-recognition core

**Date**: 2026-07-18 · **Branch**: `feat/role-recognition` · **Files**: `src/core/role-recognition.ts`
(199 lines), `tests/role-recognition.test.ts` (24 tests, incl. 2 LIVE-on-dana)

This is the third pass. The coordinator sent three rounds of correction after reading each pass's
real-data findings; all are landed and re-verified below. **This should be the last correction —
the numbers below are the honest, final Phase 1 numbers.**

## Four gates (final)

`typecheck` / `lint` / `build` / `test` — all green. `ui knowledge check` — 0 findings. Full suite:
139 files, 2122 tests passed, 4 skipped (unrelated).

## The three rounds, in order

**Pass 1 (original design)**: primitive (`!isAlias`) → no role; alias → classify by name.
Result: dana 154 recognized, `surface-content`/`surface-chrome` flagged as unresolved.

**Pass 2 fixes** (fix 1 + fix 2): deleted the `isAlias` skip (role is about NAME/intent, not
value shape — dana's `surface-content: '#FFFFFF'` is a literal but still the background role);
added leading-prefix priority (`surface-`/`bg-` → background, `text-`/`fg-`/`on-` → foreground,
decisive, grounded in Material's `on-surface` + shadcn's `-foreground`) and a new `ambiguous`
bucket for genuine weight-ties. Result: dana jumped to 232 recognized — but this exposed a NEW
over-recognition, described next.

**Pass 3 fixes** (fix 3 + fix 3b, this pass): the isAlias fix meant every primitive is now
classified by name too — including numbered SCALE STEPS whose word happens to match a role
synonym (`color-brand-500`, `brand-25`…`-950`, `accent-300`…`-600`). Measured **174 such tokens
across 4 projects** getting wrongly tagged. Fix 3 adds a scale-step skip: `{word}-{N}` is a
palette step, not a role, when N is a lightness value (`{25,50,75,100,150,200,300,400,500,600,
700,800,900,950}`) — disjoint from Carbon/Primer's 2-digit tiers (`layer-01`) and Radix's 1-12
scale (`accent-9`), which still recognize (pinned by tests: `layer-01`→card, `field-01`→input,
`accent-9`→accent). Fix 3b scopes recognition to `$type: "color"` tokens only — dimension/font/
number tokens are now completely out of scope (not even counted in `unrecognized`), cleaning the
noise flagged in pass 1. Fix 3c: left the SCRIM TRAP ordering unchanged (`surface-overlay` stays
`unrecognized`, not `background`) — a deliberate, conservative choice, not a gap.

## LIVE numbers (Art III, final re-run, color tokens only)

| Project | Color tokens | Recognized | Ambiguous | Unrecognized | Gaps (of 16) |
|---|---|---|---|---|---|
| **dana-desktop** | 362 | **100** | **10** | 252 | 2: `popover`, `input` |
| **traicaybentre** | 32 | **22** | 0 | 10 | 9: card, popover, input, ring, destructive, success, warning, info, neutral |
| **sodeal** | 26 | **13** | 0 | 13 | 11: popover, **primary**, secondary, muted, input, ring, destructive, success, warning, info, neutral |
| **spaflow** | 28 | **4** | 0 | 24 | 12: background, foreground, card, popover, primary, secondary, muted, accent, border, input, ring, neutral |

Sum check on every project: recognized + ambiguous + unrecognized = total color tokens (no token
lost or double-counted). **Not predicting or tuning to a number — this is what it actually is.**

### dana: 100, not the coordinator's estimated ~112, not pass 2's 232

232 (pass 2) → **100** (pass 3). The 132-token drop is exactly the scale-step + non-color
cleanup: dana's `brand-25`…`-950` (12), `color-brand-*` (12), `color-blue-*`/`color-cyan-*`/
`color-error-*`/`color-gray-*`/`color-info-*`/`color-pink-*`/`color-purple-*`/`color-success-*`/
`color-warning-*` (12 each, several of which pass 2 wrongly tagged via the `error`/`success`/
`warning`/`info`/`brand` synonym matching the numbered scale) are now correctly unrecognized as
scale steps, not roles. Gaps stayed at 2 (`popover`, `input`) — unaffected, because dana's
un-numbered `color-primary`, `color-accent`, etc. still carry the real role signal independent of
the scale.

### sodeal: primary is now a real, honest GAP

Before fix 3, sodeal's `color-brand-100`…`-950` scale supplied `primary` (via the `brand` synonym)
— 40 recognized, 0 gaps beyond a few structural ones. After fix 3, the whole `color-brand-*` scale
is correctly skipped as steps, and sodeal has **no un-numbered `brand`/`primary` token at all** —
so `primary` is now a genuine gap. This is exactly the coordinator's predicted, correct outcome:
sodeal's primary IS a scale step with no named role token — the usage-inference case (deferred to
a later spec), surfaced honestly instead of masked by a false per-step recognition. `secondary`,
`muted`, `destructive`, `success`, `warning`, `info` are also gaps — sodeal is a small, mostly-
primitive DS with only `accent`, `bg-*`, `border`, and a status handful actually role-named.

### spaflow: recognition collapses to 4/28 — the sharpest primitive-only signal yet

spaflow's `color-primary-*` (10 steps), `color-surface-*` (10 steps), and `color-accent-*` (4
steps) are ALL scale steps now, correctly unrecognized — and spaflow has no un-numbered `primary`/
`surface`/`bg-base`/`accent` token at all (unlike sodeal, which does have bare `accent`/`bg-base`/
`border`). Only `color-danger`/`color-info` (bare, no number) recognize. 12 of 16 canonical roles
are gaps, including `background` and `foreground` — the two most basic roles. This is the clearest
confirmation in the fixture set that usage-inference (deferred, MoSCoW "Could/later spec") is not
an enhancement for stock-primitive-scale projects — it's the only mechanism that could recognize
anything more here.

### The 10 ambiguous tokens (dana) — unchanged by this pass

`badge-neutral-border`, `border-success`, `color-accent-border`, `color-info-border`,
`color-success-border`, `color-warning-border`, `semantic-error-bg-subtle`,
`semantic-info-border`, `semantic-success-border`, `semantic-warning-border` — genuine weight-ties
(e.g. `accent` vs `border`, both weight-2 self-names), flagged for `ds set-role` (Phase 2), not
guessed.

### `surface-content` / `surface-chrome` — still resolved cleanly

Both still recognize as `background` on dana's real file (fix 1 recovers `surface-content`'s
literal value, fix 2's leading `surface-` prefix rule decides both). Pinned by a LIVE test.
Unaffected by this pass's fixes (neither is a numbered scale step).

## Unresolved questions (carried + updated)

1. The SCRIM TRAP negative check still runs ahead of the leading-prefix rule (`surface-overlay`
   stays unrecognized) — confirmed correct and intentional per coordinator fix 3c. No longer open.
2. `border-success`-style ties (10 on dana, unchanged across all three passes) will recur on any
   DS pairing a component-state word with a family self-name — Phase 2's `ds set-role` is the
   intended resolution path.
3. sodeal/spaflow's low recognition (13/26, 4/28) is not a bug to fix in Phase 1 — it's the honest
   measurement that motivates usage-inference as the next spec, per the brainstorm's own MoSCoW.
4. New, small: `LIGHTNESS_STEPS` is itself a counted-ish list (25/50/75/100/150/200/300/400/500/
   600/700/800/900/950) but wasn't independently cited from the dictionary the way the family
   keywords were — it's the standard Tailwind/Radix-adjacent lightness scale observed across the
   fixture set (dana, sodeal, spaflow all use a subset of it). Flagging in case a future phase
   wants it formally sourced the way role-synonym-dictionary.md sourced the family table.
