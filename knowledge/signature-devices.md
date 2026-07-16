# Signature Devices

## Purpose

A library of composable *signature moves* — the single memorable gesture a persona
reaches for so its output has a fingerprint, not just a color palette. Personas describe
DNA *dimensions* (type, color, depth); a device is the one *act* layered on top that makes
a page recognisable at a glance.

## Mental Model

A persona is a **taste**, a device is a **verb**. The persona says "restrained editorial,
ink-on-paper"; the device says "and the masthead word echoes twice behind itself." A page
built from DNA alone tends to read as competent-but-anonymous — every axis correct, nothing
that stops the eye. The device is what a reader remembers and screenshots. This file is a
**menu, not a mandate**: a persona composes *one or two* devices, never a pile. Stacking
five signature moves is louder than zero — the fingerprint smears into noise, and each
device fights the next for the one moment of attention a screen affords.

Devices are **orthogonal to persona DNA** — they do not change what the persona *is*, they
change how its one loud moment is spent. The persona library composes from this menu; a
device with no persona to host it is decoration, and decoration is the thing every persona
avoid-list forbids.

## When to Use / When NOT

**Use** this file when a design is technically on-brief but forgettable — the persona is
applied, the axes score, and yet nothing anchors the eye. Reach for exactly one hero device
(and at most one supporting one) and wire it to the persona already chosen.

**Do NOT** use it as a style in its own right ("make it a grain-texture site"), do NOT stack
more than two devices on one surface, and do NOT let any device override the accessibility
floor. Every device below stays subordinate to the a11y contract: a move that costs a reader
legibility, a keyboard user focus, or a motion-sensitive user comfort is NOT allowed to ship,
no matter how strong the fingerprint (constitution Art X — a11y never loses to aesthetics).

## The devices

Each device names its **Principle** (what it is + why it reads as authored), **When**
(which persona voices host it, and when to skip it), and **Mechanism** (how it is built,
and the floor it must respect).

### Echo / ghost-layer type

- **Principle** — a hero word repeated in two or three fading, offset copies behind the solid
  one. Reads as depth *without* a shadow — the persona keeps its flat DNA and still gets a
  third dimension. Memorable because the eye resolves the stack into motion that isn't there.
- **When** — display-forward voices (graphic-modernist, kinetic type, editorial mastheads).
  Skip it on dense data UI, where the ghost copies compete with real content for the same
  pixels. NEVER echo body text — only a single hero token.
- **Mechanism** — duplicate the heading node; the ghost copies get lowered opacity
  (~8–20%) and a small translate offset, marked `aria-hidden="true"` so a screen reader
  hears the word once. ALLOWED: decorative duplicates behind live text. NOT ALLOWED: real
  content in the ghost layer — a reader who can't perceive opacity loses it entirely.

### Grain-as-texture

- **Principle** — a fine 4–15% monochrome noise overlay that warms a flat surface. Warmth
  from *texture*, not from a gradient — the loudest AI-default tell (the indigo/violet glow)
  is exactly the gradient this replaces.
- **When** — any persona wanting analog warmth (newsprint, editorial, warm-dark cinematic).
  It composes under almost anything because it is subtractive. Skip it on data-dense or
  clinical-clarity voices where texture reads as dirt on the lens.
- **Mechanism** — a tiled SVG `feTurbulence` or a small PNG at low opacity over the base
  surface, `pointer-events:none`. Keep it under ~15% or it eats text contrast — the overlay
  is decorative and MUST NOT drag any foreground/background pair below its WCAG target.

### Light-leak background

- **Principle** — large, heavily-blurred color leaks bleeding behind dark type. Distinct from
  `organic-mesh-gradients`: darker, cinematic, fewer and larger blooms, more negative space
  between them. Reads as a lit stage, not a candy wrapper.
- **When** — dark immersive/cinematic voices, product heroes that want atmosphere without
  particles. Skip it in light mode (the leaks turn muddy) and on text-dense screens.
- **Mechanism** — one or two large radial blooms, high blur-radius, low-to-mid opacity, on a
  near-black base. WHY it must stay behind: any type over a leak has to clear contrast on the
  *brightest* point of the bloom it crosses, not the average — verify the worst pixel, or the
  headline fails exactly where the light is strongest.

### Simulated browser / OS chrome

- **Principle** — the whole page (or a hero panel) framed inside a fake window: title bar,
  traffic-light dots, a URL field, sometimes a devtools rail. The frame *is* the concept — it
  says "this is software" before a word is read.
- **When** — developer-tool, devtools, and product-demo personas; a landing hero showing the
  product-in-context. Skip it on brand/editorial surfaces where the chrome reads as a mockup,
  not a statement.
- **Mechanism** — a rounded outer container with a stacked fake toolbar row; the real content
  lives inside. The dots and URL are decorative — mark them `aria-hidden` and never make the
  fake controls look focusable, or a keyboard user tabs into dead ornaments.

### `mix-blend-mode: difference` nav / cursor

- **Principle** — a fixed nav bar or custom cursor that *inverts* against whatever scrolls
  beneath it, so it stays legible over both light and dark sections without changing color.
  The inversion itself is the signature.
- **When** — graphic-modernist, kinetic, and bold editorial voices with strong light/dark
  section swings. Skip it on multi-column data UI and anywhere the underlying palette is
  mid-tone (difference over grey is muddy, not crisp).
- **Mechanism** — `mix-blend-mode: difference` on the fixed element. WHY it needs a guard:
  over a *mid-tone* background the inverted result can land near 50% grey and fail contrast —
  so pin section backgrounds to clear light/dark extremes, or fall back to a solid nav. The
  blend is ALLOWED only where the computed result stays legible; it is NOT a substitute for
  meeting the contrast floor.

### Viewport-scaled display type

- **Principle** — a headline sized in viewport units (~12–23vw) so the type *is* the layout —
  it spans edge to edge and rescales with the window. The single loudest way to make
  typography the hero.
- **When** — graphic-modernist and kinetic-type voices, single-statement heroes. Skip it on
  anything with a lot to say above the fold; one viewport-scaled line owns the screen.
- **Mechanism** — `font-size: clamp(<min>, <vw>, <max>)` — always clamp, never a bare `vw`.
  WHY the clamp is mandatory: an unclamped `23vw` becomes unreadable on a phone and absurd on
  an ultrawide; the `min`/`max` keep it legible at both ends. Pair with a tight negative
  letter-spacing so the oversized line still holds as one shape.

### Marquee / infinite ticker

- **Principle** — a horizontal band of text or logos scrolling continuously, a persistent
  motion signature that gives a static page a heartbeat.
- **When** — brand landings, logo walls, kinetic and retro voices. Skip it when the content in
  the band is information the user must actually read — a moving target is a reading tax.
- **Mechanism** — a duplicated track translated on a loop (CSS keyframes or transform). The
  floor is non-negotiable: it MUST stop under `prefers-reduced-motion: reduce` — a
  continuous marquee is a top vestibular trigger, and an always-moving element that ignores
  the reduced-motion setting is exactly the failure the motion floor exists to catch.

### Rotated "sticker" + vertical type

- **Principle** — a small element tilted a few degrees like a slapped-on sticker, often with a
  line of vertical (rotated) type down an edge. An industrial/brutalist device that breaks the
  grid *on purpose* to signal hand-made energy.
- **When** — neo-brutalist, graphic-modernist, and streetwear/retro voices. Skip it on
  trust-first contexts (finance, healthcare) where a crooked element reads as broken, not bold.
- **Mechanism** — a small `rotate()` (a few degrees) on the sticker; vertical type via
  `writing-mode: vertical-rl` or a `rotate(90deg)`. Keep vertical type to short labels — a
  full sentence turned on its side is a legibility failure, not a flourish. The tilt is
  decorative; it must never rotate an interactive control's hit area out from under its label.

### Hand-drawn SVG annotation + cursive accent

- **Principle** — a hand-drawn circle, underline, or arrow scribbled over a word, plus a
  single cursive accent font on one phrase. Injects organic-editorial warmth into an otherwise
  geometric layout — the human hand marking up the machine's grid.
- **When** — editorial, personal-portfolio, and warm-marketing voices that want a human touch.
  Skip it on system/enterprise UI where a scribble reads as unfinished.
- **Mechanism** — an inline SVG stroke path positioned over the target word; the cursive accent
  is *one* font on *one* phrase. WHY the restraint: a second decorative font or a scribble on
  every heading turns the device from "authored accent" into visual clutter. The annotation is
  `aria-hidden` decoration — the word it marks must stand on its own for a non-visual reader.

## Failure Modes

The ways this file goes wrong:

- **Device pile-up.** Three or more devices on one surface. Each is engineered to be *the* loud
  moment; two competing already dilutes, and a pile reads as noise an author would never ship.
  A reviewer can point at the screen and count them — if it's over two, it fails.
- **Device without a host persona.** A device applied as the whole style ("a grain site"),
  with no persona DNA underneath. The result is a gimmick with no taste behind it — every
  persona avoid-list forbids exactly this untethered decoration.
- **A11y floor traded for fingerprint.** A blend-difference nav that lands on mid-grey, a
  marquee that ignores reduced-motion, a grain overlay that drags text under contrast, an echo
  layer holding real content. Each is observable and each is a hard fail — the device loses to
  the floor every time (Art X), never the reverse.
- **Ghost/decoration read by a screen reader.** Echo copies, sticker labels, fake chrome dots,
  or scribbles that aren't `aria-hidden`, so a non-visual reader hears the hero word three
  times or tabs into dead ornaments. Observable in the accessibility tree.
