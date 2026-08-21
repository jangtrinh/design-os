---
id: web-technique-craft
description: "The brief-to-technique router for selecting one or two purposeful web craft mechanisms and their safe implementation contract."
when: [web-design, visual-direction, interaction-concept, landing-page, immersive-interface, design-technique]
---

# Web Technique Craft — choose a mechanism that earns its place

## Purpose

Turn a design brief into one explicit web craft technique per direction when it strengthens the
idea without turning the page into an effects sampler.

## Mental Model

A technique is a design decision with a trigger, cost, fallback, and proof—not a style label.
The catalog is the compact routing surface; family cards hold the implementation judgment.
Select from the catalog first, then open only the card named by the selected row.

## When to Use / When NOT

**Use** this router while proposing visual directions, shaping a distinctive web surface,
or deciding whether interaction, scroll, canvas, or 3D can carry part of the story.

**Do NOT** use it to replace the existing owners for page structure, persona, motion tier,
accessibility, signature devices, or design-system rules. Those decide the design's shape and
floors; a selected technique is subordinate to them.

## Selection procedure

1. Read `knowledge/web-techniques/catalog.json`. Match the brief to each row's `when` signals
   and reject any row whose `requires` conditions are unavailable.
2. Preserve exactly three directions. For each, propose at most one primary imported technique per
   direction, formatted `<ID> — <brief-specific adaptation>` so the choice is reviewable rather
   than implied. Prefer an original free-string technique when no catalog row earns a fit; novelty
   alone is never a fit.
3. Make directions structurally different: rewording one ID does not create a new direction.
   Do not ask a technique-preference question; taste ambiguity earns variants, not interrogation.
4. After direction choice, open only the selected family card declared by the chosen row. Apply its anti-use, fallback,
   responsive/input, lifecycle/performance, verification, and failure-mode clauses.
5. If `handoffSkill` is non-null, suggest that specialist only when it is registered and reachable
   for the current workflow, and suitability, tier, and anti-use gates all pass. A null or
   unavailable handoff means no handoff; never invent a replacement specialist.

## Direction proposal contract

For each proposed direction, tell the user:

- the selected canonical ID and what it does for this brief;
- the visible change in composition or behavior;
- the static/reduced-capability fallback;
- the main performance or lifecycle cost;
- the specialist handoff, when the catalog explicitly permits one.

ALLOWED: zero or one primary imported technique per direction, with an original free-string
technique when no catalog row earns the job. NOT ALLOWED: stacking techniques that compete for the
same focal moment, because simultaneous signatures erase hierarchy and make graceful downgrade impossible.

## Quality boundary

- Keep semantic content and primary actions usable before enhancement initializes.
- Bind colors, type, spacing, radii, and surfaces to the active design system; a technique may
  express tokens but MUST NOT introduce a parallel visual system.
- Preserve keyboard, touch, reduced-motion, mobile, and no-canvas paths named by the card.
- Load heavy capability only after the light gate proves the device and context can use it.
- Demand runtime evidence for motion, canvas, and 3D. Source code presence is not proof that a
  frame rendered, a scrub stayed continuous, or cleanup released resources.

## Failure Modes

- **Catalog browsing becomes style roulette.** The proposed ID has no brief-specific job or is
  selected only because its demo sounds impressive.
- **Three directions share one mechanism.** Different suffix prose hides the same canonical ID,
  so the user is not choosing between genuinely different structures.
- **Fallback is postponed.** Essential text or action exists only inside an effect; a failed load,
  reduced-motion request, or small viewport removes the product rather than the enhancement.
- **Specialist is inferred.** A handoff not named for that row and workflow bypasses the frozen
  routing contract and may load an owner that cannot perform the requested work.
- **Technique becomes the design system.** Copied colors, assets, or component styling override
  project tokens, producing a memorable demo that does not belong to the product.
