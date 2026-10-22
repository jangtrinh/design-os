---
id: design-reuse-ladder
description: "The design reuse ladder and the reuse plan — pick from what the design system already declares before inventing, and let `ui reuse-plan check` verify every name."
when: [reuse, reuse-plan, reuse-ladder, existing-components, registry-lookup, ds-new, pattern-template, invent, consistency, build-from-design-system]
---

# Design Reuse Ladder — choose from the inventory before you invent

## Purpose

Give an agent that builds UI on an existing design system a fixed order of questions to ask per
slot, and a checked Markdown file (the reuse plan) that records the answers before any markup is
written.

## Mental Model

The failure this file exists for is not a missing component. The inventory was there; nothing made
the agent choose from it. Three things went wrong together: the brief said "use DS components" in one
sentence and named no pattern per screen, a gate measured zero of the affected screens and passed, and the
builder copied the nearest existing code — which was itself off the design system.

So the ladder ranks **what the design system declares** above **what happens to sit nearby in product
code**. Nearby code is evidence of what shipped, not authority for what is right. Reading the ladder as
"reuse anything you find" reproduces the failure it was written to stop.

## When to Use / When NOT

**Use** it whenever a task builds or changes UI on a project that has a design system with a component
registry: a new screen, a redesign, a rebuild from a reference. Write the plan after the DS inventory is
loaded and before any markup.

**Do NOT** use it for a project with no registry (greenfield with no design system yet — initialise one
first), for a copy or token-only tweak that adds no slot, or as a quality score. The checker proves that
names exist; it does not prove that the chosen component is the right one.

## The ladder

Stop at the first rung that holds. A lower rung is only allowed when every rung above it was asked and
answered no for that slot.

| Rung | Question | What the plan records |
|---|---|---|
| 1 | Does this UI need to exist? | `skip` + the reason it is dropped |
| 2 | Does a DS screen or pattern template cover it? | a `design/patterns/*.md` file stem, or a registry template (`Pattern/*` or a page/template-category record) |
| 3 | Is there a registered component by exact name? | the exact name (`ui registry lookup '<name>'`) |
| 4 | Is it a variant or state of a registered component? | `Name (Axis=Value)` |
| 5 | Is it a composition of registered components? | each name, joined by `+` |
| 6 | Are tokens on an existing primitive enough? | token paths, comma-separated |
| 7 | Nothing above holds | `ds-new: <Name>` plus a reason |

ALLOWED: reusing nearby product code when it passes the project's gates and no rung 2-6 answer exists.
NOT ALLOWED: ranking nearby code above rungs 2-6, because the nearest code is the likeliest to be off the
design system, and copying it spreads the drift instead of fixing it.

## The reuse plan

The plan is `reuse-plan.md` in the task's plan folder: one `## Screen: <name>` section per screen, a
`Pattern:` line, and a four-column table.

```markdown
## Screen: Orders list
Pattern: Pattern/ListPage

| Slot | Rung | Use | Reason |
|---|---|---|---|
| header | 3 | Page header/Default | — |
| list | 5 | Filter bar/Default + Table/Basic | — |
| status | 4 | Chip/Status (Tone=Info) | — |
| gutter | 6 | spacing.4, colors.surface | — |
| owner chip | 7 | ds-new: Owner chip | no email chip in registry |
```

Check it before building:

```sh
ui reuse-plan check reuse-plan.md --dir <project> [--file <registry>] [--tokens <file>] [--json]
```

`--file` points at the same registry `ui registry list` and `ui registry lookup --file` read, so the check and
the lookups never disagree. Rung 6 reads `design/design.tokens.json` unless `--tokens` names another file; the
output header names the registry and the token file it checked. Exit 0 means no findings, 1 means findings,
2 means the check could not run (no registry, unreadable plan). Fix every finding and re-run; do not start
markup on exit 1 or 2.

Headings: every screen is `## Screen: <name>`. A heading that starts with "Screen" in any other form
(`### Screen B`, `## **Screen — Orders**`) is `SCREEN_HEADING_MALFORMED`, because it opens no screen and its rows
would go unmeasured. A heading that merely mentions a screen later in its text is prose and is left alone. Slots are a Markdown table — an HTML `<table>` is `UNSUPPORTED_TABLE`, never
skipped. A second `Pattern:` line in one screen is `DUPLICATE_PATTERN`; a screen with no name is
`SCREEN_NAME_EMPTY`; two screens with one name are `DUPLICATE_SCREEN`. A code fence (indented at most three
spaces) that is never closed swallows the rest of the file, so it is `FENCE_UNCLOSED`, naming its opening line.

### The Pattern line and rung 2

Every screen names the template it follows, or says why none fits: `Pattern: none — <reason>`. A bare `none`,
or a placeholder reason (below), is a finding, because "no template" with no reason is the same silence as no line.

One template set serves both the Pattern line and a rung-2 `Use`. A name is a template when it is:

- a `design/patterns/*.md` file stem (`list-page`; `README.md` is the index, not a pattern), or
- a registry name under `Pattern/`, or
- a registry record whose `category` matches `page|template|pattern|layout|screen` (case-insensitive) — a registry
  mirrored from a design file usually files its page masters under a category like "Page content".

The output names which source matched (`design/patterns` or `registry`).

When the set is non-empty, a registered name that is not in it is `PATTERN_NOT_TEMPLATE` on the Pattern line and
`RUNG2_NOT_TEMPLATE` at rung 2: allowing any component there would let a button stand in for a page template,
and a plain component belongs at rung 3. The did-you-mean offers templates only.

When the set is empty the check cannot tell a master from a component, so it accepts any registered name on both —
and says so with the counted warning `NO_TEMPLATES_DECLARED`, once per run, whenever a plan relied on that.
The fix is to declare a template (a pattern file, a `Pattern/*` entry, or the right category), not to ignore the
warning. A plan that names no template (`Pattern: none — …` everywhere) never triggers it.

### Retired and unreviewed names

A registered record with `deprecated: true` (written when a component is deleted in the design file), a name marked
`[ARCHIVED]`, `[DEPRECATED]` or `❌`, or a name matching the repo's deprecation vocabulary (`deprecated`, `legacy`,
`do not use`, `old`), is `LIFECYCLE_NAME` wherever it is used, including the Pattern line and rung 2. A
`design/patterns` file whose stem matches the vocabulary (`legacy-table`) is held to the same rule. The registry
still lists these names, but building on one ships the thing the design file retired. A `[REVIEW]` name
is a counted warning, not a finding — usable, but confirm it is approved.

### Rung 4 — variants

`Name (Axis=Value)` is checked against the record's `variants` when the record declares any
(`BAD_VARIANT_VALUE`, listing the registered values). A record with no variants keeps syntax-only checking,
because there is nothing to compare with.

### Rung 7 — a new component

A new component is allowed, never blocking, and never silent. `ds-new:` belongs at rung 7 only — written at any
other rung (rung 1 included) it is `NEW_AT_WRONG_RUNG`, so no new component can hide from the owner's list. It
needs the `ds-new:` prefix, a real reason,
and a name that is not already registered. The check folds the usual dodges before it decides: separators and
case (`Button / Primary`), a variant suffix (`Button/Primary (State=Hover)`), and a composition whose every
member is registered (`A + B`) are all `NOT_NEW` — that was rung 3 or 5. A name within a couple of edits of a
registered one gets a `hint:` line on its item, never a finding, so the owner sees the near match.

A reason is not real when it is empty, a dash, `n/a`, `none`, `tbd`, `todo`, `x`, a lone punctuation mark, or
just the slot's own name; the same list applies to rung 1 and to `Pattern: none — …`. The checker prints every
well-formed `ds-new:` item at the end so the report to the owner is a copy of that list. Register the
component through the DS's own registration command once the owner has seen it.

## What the checker proves, and what it does not

PROVES: every `Use` at rungs 2-5 is an exact name in the project registry and is not retired; a rung-2 `Use` is a
template; a rung-4 variant is one the record declares (when it declares any); rung 6 paths exist in the token
file named in the header; every screen has a Pattern decision and at least one slot; rung 7 items are marked,
reasoned and not already registered. It prints `reuse: <rung 2-6 slots>/<all slots except rung 1>` per screen,
with rung 1 slots printed as skipped. A rung 2-6 slot that has any finding does not count as reuse.

DOES NOT PROVE: that the component is the right one for the slot, that a record without variants has the
variant you wrote, that the built markup follows the plan, or that a name without a lifecycle marker is current.
It reads names only — a registry with hundreds of components and no markup is a normal input. Treat the reuse
ratio as a record of intent, not as a measurement of the built screen.

## Failure Modes

- **Plan written after the markup.** The plan then describes what was built instead of constraining it. Order
  matters: inventory, plan, check, build.
- **`none` as a habit.** A Pattern line of `none — new screen` on every screen keeps the checker green and
  recreates the original silence. A reviewer reads the reasons, not the exit code.
- **Rung 7 used to skip a lookup.** A `ds-new:` item whose reason is "could not find it" without a
  `ui registry lookup` behind it is rung 3 in disguise; the exact-name lookup is the test.
- **Zero slots read as success.** An empty screen or empty file is a finding on purpose: a check that measured
  nothing must not pass.
- **Ratio chasing.** Padding a plan with trivial rung 3 slots to raise the ratio. The ratio is only
  informative next to the slot list.
