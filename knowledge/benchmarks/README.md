# Benchmark DNA — measured traits of ship-grade products

Eight `*.dna.json` files, one per benchmark marketing site (Arc, Figma, Framer,
Linear, Notion, Raycast, Stripe, Vercel). Each is a **SOURCE-grade** capture —
computed styles measured from the live page in a real browser, not guessed from
memory — of the traits that make those products read as "senior+":

| Key | What it holds |
|---|---|
| `slug`, `url`, `capturedAt`, `viewport`, `title` | Provenance: what was measured, where, when (`--YYYYMM` in the filename is the capture month). |
| `evidence` | Always `"SOURCE"` — measured, not recalled. Anything a model *remembers* about these sites is GUESS-grade; this file is the upgrade. |
| `fonts`, `weights` | Font families and weights by usage count (e.g. Linear: Inter Variable ×1903, weight 510 — not 500). |
| `typeScale`, `lineHeights` | The real type ramp by frequency — note how body sizes cluster at 13–15px on dense products. |
| `textColors`, `surfaces` | Measured text + surface colors (note the low-alpha overlays that produce "expensive" dark surfaces). |
| `radii`, `shadows`, `gaps` | Radius ramp, shadow recipes (real rgba + offsets), and spacing gaps by usage. |
| `elementsSampled` | Sample size behind the counts. |

## How to use — the reference duel

When a brief demands ship-grade output (see `knowledge/taste-rubric.md`
§ "The Excellence Tier"), pick the 1–2 benchmarks nearest the brief's genre and
**duel the variant against the DNA on measurable traits**: is the type ramp as
disciplined? Do surfaces layer with low-alpha overlays or flat hexes? Are
shadows tinted multi-stop recipes or single black blurs? Is the gap scale as
tight? The duel verdict is evidence-anchored — cite the DNA values, not vibes.

These files are *calibration*, not templates: the goal is matching the **level
of discipline**, never copying Linear's palette into an unrelated brand.

## Regenerating / extending

Captures were produced by browser probing of the live sites (viewport
1440×900@1): collect computed styles across sampled elements, rank each trait
by usage count. Full-page PNG screenshots exist alongside these captures but
are deliberately **not** checked in (≈13 MB — too heavy for the npm package;
the DNA carries the machine-readable part the duel needs). Re-capture with any
browser-automation setup using the same method when a benchmark redesigns —
bump the `--YYYYMM` suffix and `capturedAt`.
