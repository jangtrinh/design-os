# Devices — Family Patch (Phase A)

This guidance is additive to the committed knowledge core. Apply it only inside its context boundary. Select at most one register/band/device treatment per surface as its own boundary directs; never blend registers on one surface. Outside the boundary, or where the anti-context matches, this guidance is inactive and the knowledge core alone governs. Accessibility, tap reliability, and performance always outrank this guidance.

## Device one

**Contract**
- Two-digit markers (01, 02, 03) as secondary architecture on genuinely ordered content.
- Predictable positions — card corners, section gutters, timeline rails, beside headings.
- Quiet mono or narrow uppercase at low contrast.
- Consistent spacing and alignment across all marks.
- One numbering style per section.
- Markers never compete with headings or actions.

**Context**
Ordered narrative sections — processes, chapters, chronologies.

**Anti-context**
Unordered content, statements/appendices/logs (which keep their own identifiers), urgent flows, error and legal surfaces.

## Device two

**Contract**
- 1 px low-opacity vertical guides at the exact content-container edges.
- Small square marks (~6 px) at corners or section intersections.
- One consistent container width per page.
- Guides behind content, above background, pointer-transparent.
- Strong-opacity variant reserved for deliberate emphasis.

**Context**
Structured editorial/technical layouts needing quiet measurement tension.

**Anti-context**
Inside dense data tables, reading panes, forms; urgent flows.

## Device three

**Contract**
- A stepped blur band fixed at one viewport edge (top or bottom), built from layered backdrop blurs with graduated masks so blur strength ramps smoothly.
- Band height ~10–15% of viewport.
- Pointer-transparent.
- Above content, below modals.
- Requires real content behind it to blur.

**Context**
Long reading or narrative surfaces where edge softening aids focus.

**Anti-context**
Must never overlay focusable controls, forms, or the reading measure; not on urgent flows; drop the device entirely rather than compromise legibility.

## Device four

**Contract**
- The sequence is a semantic ordered list with real headings first — line, dots, and active states only enhance it.
- Quiet base line behind all points, one progress line scaled on the compositor (`scaleY`/`scaleX`, transform-origin at start).
- Measure from first to last step centers and normalize scroll between them.
- Recalc geometry after fonts, images, resize, orientation, mutation.
- Mark the active step (`aria-current="step"` only when meaningful; never announce every scroll tick).
- Alternate layout only with balanced width, left rail for long copy, horizontal only for short keyboard-safe sequences.
- Collapse to a left rail on small screens preserving reading order.

**Context**
Genuinely ordered multi-step content — guides, explainers, chaptered studies.

**Anti-context**
Short single-screen sections, FAQs, contact blocks, non-sequential content — no rail, no progress ornament.

## Placement rule

Devices are quiet secondary structure. Apply a device only where its context matches; at most the devices the surface genuinely earns; none on urgent flows, forms, or dense data tables.

---

These are contextual bands, never global defaults. Passing a deterministic check adds no taste credit.
