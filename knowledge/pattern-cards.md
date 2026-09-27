---
id: pattern-cards
description: "Counted screen-pattern cards — what an archetype (pricing, checkout, login, settings…) looks like across observed product screens, and how to read them without confusing common practice with a decision."
when: [pattern-card, screen-archetype, common-practice, mobbin, pricing-page, checkout, login, onboarding, settings, data-table, home-feed, market-evidence]
---

# Pattern cards — what an archetype looks like across products

## Purpose

Give a design task a measured answer to "what do products usually put on this screen?" as counts over n,
so the answer is evidence, not the author's recollection.

## When to Use / When NOT

**Use** a card at the frame and explore steps, to see which components an archetype carries and how often,
before deciding what this product does. Cards live in `knowledge/patterns/<platform>/<archetype>.json`;
open only the archetype you are designing.

**NOT** a decision. A card says what is common, never what to choose: the project's rulings decide. It carries
no opinions, no pixel values, and no images.

## Reading a card

- Every share is a count over `n` (screens extracted), never a percentage typed by hand. Divide yourself.
- `core` holds distributions shared by every archetype (layout, navigation, primary action, states, density,
  colour mode, copy language). `components[]` holds the archetype's parts with `kind` and `position` breakdowns.
- `unreliable` lists attributes whose cross-check agreement was below 60%. Do not build on those.
- `status: draft` with `n_below_floor` means fewer than 8 screens: read it as an anecdote, not a pattern.
- `evidence` is `observed(mobbin:<id>)` only. `captured_at` is `unknown` unless a date was observed.

## Writing and checking

Cards are emitted from per-image extraction JSON by a script; never hand-edit a count. `ui pattern lint
<card.json|dir>` enforces the schema (`schemas/pattern-card.schema.json`), shares against n, unique evidence
ids, the n >= 8 floor, and that no image path or URL appears. A card that fails it does not ship.

## Failure Modes

- Quoting a share as "the standard" — it is a sample of screens the source happens to hold, biased to
  products worth capturing. NOT allowed: using a card to justify a choice without a project ruling.
- Reading a count from an `unreliable` attribute as fact. The second reader disagreed on it.
- Treating a draft card as a pattern. Below the floor the numbers move with one screen.
