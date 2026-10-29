---
id: existing-surface-upgrade-audit
description: "The diagnostic catalogue and fix order for upgrading an existing web surface in place, inside its own stack and design system."
when: [upgrade, polish, improve-existing, looks-generic, looks-cheap, ai-made, redesign-existing, existing-site, audit-existing-ui, cleanup]
---

# Existing-surface upgrade audit

<!-- ease:source ref="knowledge/sources/elayadesign-skills--202610.md" captured="202610" url="https://github.com/elayadesign/redesign-skill" -->

## Purpose

Find what makes an existing page or app read as generic, unfinished or machine-made, report it,
and fix it in place without breaking what works.

## Mental model

This is a **diagnostic**, and it changes values, not direction. The audit says *what to look
for*; the replacement value always comes from one source of truth, in this order: the project's
design system → the project's soul and brief → the `conversion-monochrome` persona when the
project has no system and the owner picks it → never a value invented on the spot. A finding
without a sourced replacement is reported, not fixed. Snapping stray values to the project's own
system keeps its identity; adopting the persona replaces it, so the report names that as a
direction change, the user says yes, and the work moves to `redesign` before any value moves.

## When to use / when NOT

- **Use** when the user wants an EXISTING site, page, app or component improved, polished,
  cleaned up, made to look less generic or less "AI made", while keeping its direction. In
  `knowledge/need-routing.md` G4 that is `refine`; this file is its catalogue.
- **Use** with `landing-conversion-craft.md` when the surface is a landing page.
- **Do NOT** use when the user rejects the direction — that is `redesign` (a contra-persona
  change), which this file does not perform. Do NOT use on the Figma canvas — that is `audit`.
- **Do NOT** migrate frameworks or styling libraries, because the user asked for a better page,
  not a different codebase.

## The procedure

1. **Scan.** Identify the framework, the styling method (Tailwind and its major version before
   touching config, vanilla CSS, CSS modules, styled components), the design system if any, and
   the dependency file.
2. **Diagnose.** Run `ui gate` on the rendered HTML, then walk the catalogue below. List every
   finding with its location and its sourced replacement.
3. **Report before fixing.** Hand the list to the user and let them veto items; a fix the user
   did not want is a regression to them.
4. **Fix in the order below**, one small reviewable change at a time, and re-run the gate and the
   look after each group. Never import a library the dependency file does not declare.

### Fix order

Constitution Article X decides collisions: accessibility → tap reliability → performance →
layout → type and colour → motion → decoration. So the order is:

1. **Floor failures** — every gate error, missing focus ring, contrast failure and undersized
   target, first, whatever its visual cost.
2. **Type face** — the largest visible improvement at the lowest risk.
3. **Colour and surfaces** — snap to the system's palette, remove stray background effects.
4. **Hover, active and focus states.**
5. **Layout and spacing** — grid, max width, the spacing scale, concentric radii.
6. **Motion** — easing, scroll reveals, navigation and the mobile menu.
7. **Generic components** — swap the patterns named below.
8. **Loading, empty and error states.**
9. **Copy** — clichés out, specifics in, CTAs fixed.
10. **Type scale polish.**

## The catalogue

Each line is a finding and its cure. Most generic tells are already machine-checked in
`design-tells.md` and the `ui gate` families; spend judgment on the lines below, which are not.

### Type

- Only regular and bold in use → add medium and semibold for finer rank.
- Headlines without presence → a larger display step and tighter tracking, inside the line
  height the step provides.
- Body measure past ~65 characters → cap it; tracking negative on large heads, positive on small
  labels and caps.
- All-caps subheaders everywhere → sentence case or small caps, never italics as a substitute.

### Colour and surfaces

- One accent, saturation under 80 %, one grey family (warm or cool, not both).
- Shadows tinted toward the background hue, all implying one light source.
- A flat surface that needs depth → a subtle noise or grain texture, not a gradient.
- A random dark band inside a light page, or the reverse → one tone, or a neighbouring shade of it.
- An empty section that needs depth → imagery from the asset ladder in
  `generation-craft-defaults.md` (project asset → approved source → generated → intentional
  none). **NOT ALLOWED:** a remote placeholder image service, because rule 5 of the designer
  skill requires bundled assets and a remote image breaks the offline evidence folder and the
  page the day the service changes.

### Layout

- `height: 100vh` on a full-screen section → `min-height: 100dvh`, which does not jump under the
  iOS Safari toolbar.
- Percentage flexbox arithmetic → CSS Grid.
- No max-width container → about 1200–1440 px with auto margins.
- Cards forced to one height → variable heights or masonry when content length varies.
- Flat, side-by-side elements → layering with negative margins, only where the overlap expresses
  hierarchy (`generation-craft-defaults.md` § Composition).
- Symmetric vertical padding that looks bottom-heavy or top-heavy → adjust optically.
- A dashboard that always has a left sidebar → consider top navigation, a command menu or a
  collapsible panel.
- In card groups, CTAs pinned to one baseline; in pricing and comparison columns, feature lists
  start at one height; titles, prices and buttons align across siblings.
- Icons beside text, play glyphs in circles, text in buttons → one or two pixels of optical
  correction where the mathematical centre looks wrong.
- Anchor navigation jumps → `scroll-behavior: smooth`, off under `prefers-reduced-motion`.

### Components

- Always one filled plus one ghost button → introduce text links or a tertiary style.
- Pill "New"/"Beta" badges → square badges, flags or plain labels.
- An accordion FAQ stack → a side-by-side list, searchable help or inline disclosure; keep six to
  twelve questions.
- A three-card testimonial carousel with dots → a masonry wall, embedded posts or one rotating
  quote.
- Three pricing towers → emphasise the recommended tier with colour and weight, not height.
- Modals for simple actions → inline editing, slide-over panels or expandable sections.
- Circle avatars only → squircles or rounded squares where the system allows.
- A sun-and-moon theme switch → a menu, system preference detection or a settings entry.

### Icons and imagery

- Clichéd metaphors (rocket for launch, shield for security) → a less literal glyph from the
  same family.
- Stock "diverse team" photography → real photographs, candid shots or one consistent
  illustration style.

### Code

- Inline styles mixed with classes → move them into the project's styling system.
- Hard-coded pixel widths → `%`, `rem`, `em` and `max-width`.
- `alt="image"` on a meaningful image → describe the content.
- Commented-out dead code and debug artifacts → remove.
- An import the dependency file does not declare → remove or declare it; never guess a package.

## Failure modes

- **fix-without-report** — values changed before the user saw the diagnosis. Cure: report, take
  vetoes, then fix.
- **invented-value** — a replacement hex, font or spacing value that no system, soul or persona
  supplied. Cure: report the finding with "no sourced value" and ask.
- **pretty-before-safe** — a font swap shipped while a focus ring or contrast failure remains.
  Cure: floor failures first, always.
- **stack-migration** — a framework or styling library replaced during an upgrade. Cure: work
  inside the declared stack.
- **broke-behaviour** — a fix that changed what a control does. Cure: test after each group and
  keep the behaviour diff empty.
