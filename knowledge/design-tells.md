# Design tells

A **tell** is an involuntary, machine-detectable sign that a surface was produced
without design judgment — the poker sense: the artifact gives itself away. An edge
bar on a rounded card. The stock purple gradient. Three identical paddings. Mixed
icon families.

AI-generation fingerprints are the salient subclass, not the definition. The rules
below fire on human defaults too, because the underlying failure is the same one:
reaching for the nearest template instead of deciding.

A tell is **evidence of inattention, not a defect in itself**. That is why the
family defaults to advisory: it prints, it never fails a build. Only the tells
whose reading is unambiguous carry `error`.

**Where a rule belongs.** A broken rubric law goes to `taste`
([taste-rubric.md](taste-rubric.md)). A sign or fingerprint goes to `tell`. The
difference is not severity — it is whether a stated rule was violated or a habit
was revealed.

Each section names the fact kinds the rule reads. A rule whose kinds an extractor
cannot supply is reported NOT-EVALUATED, never passed.

---

## Surface and card

*Facts: `border`, `radius`, `spacing`, `structure`.*

**side-tab** — a thick accent border on ONE side of a card. The single most
recognisable tell of generated UI: it signals "category" without any category
system behind it. Use a subtler accent, or none. *(error)*

**border-accent-on-rounded** — a thick accent border meeting a rounded corner.
The border fights the radius; one of the two is not wanted.

**icon-tile-stack** — a rounded-square tile holding an icon, repeated above every
heading. It is decoration standing in for hierarchy.

**hero-eyebrow-chip** — a pill-shaped label floating above a hero headline.
Borrowed from launch-announcement templates, kept when there is nothing to announce.

**kicker-above-heading** — a small all-caps line above every heading. One kicker is
an editorial choice; a kicker on every section is a template.

**numbered-section-labels** — `01 / 02 / 03` before section titles where nothing is
ordinal. Sequence implies steps; sections are rarely steps.

**nested-cards** — a card inside a card. Requires the `structure` fact: two radii in
one file is not nesting, and a rule that treats it as such reports "radius 16 inside
12" — inner larger than outer, no nesting proven.

**edge-flush-cards** — cards touching the viewport edge with no gutter. Reads as a
layout that was never given a container.

**cramped-padding** — padding under 8px on a surface large enough to need breathing
room. Density is a decision; 4px everywhere is its absence.

**monotonous-spacing** — one spacing value used everywhere. No rhythm: related items
and unrelated sections get the same gap, so grouping carries no meaning.

**repeated-container-text** — the same copy repeated across sibling containers.
Placeholder content that shipped.

## Colour and light

*Facts: `color`, `gradient`, `shadow`.*

**ai-color-palette** — purple/violet accents and cyan-on-dark. The most recognisable
palette tell. Supersedes the older `ai-cliche-gradient`.

**cream-palette** — a warm cream or beige page background, reached for by reflex as
the "tasteful" default. A background should come from a palette, not from the safe
warm off-white.

**gradient-text** — a gradient clipped to text. Decorative rather than meaningful,
and it costs legibility at every size. *(error)*

**dark-glow** — a saturated glow behind an element on a dark surface. Simulates
light with no light source.

**radial-halo** / **radial-spotlight-glow** — a radial gradient behind a hero or a
section, standing in for depth.

**repeating-stripes-gradient** — a repeating-linear-gradient used as texture.

**gray-on-color** — grey text on a saturated background. It may pass 4.5:1 and still
read washed out; that is why this is a tell and `low-contrast` is an a11y check.

**gpt-thin-border-wide-shadow** — a 1px border paired with a wide soft shadow. A
model-specific surface habit: two competing edge treatments on one element.

**codex-grid-background** — a faint square-grid background image behind a page.

## Type

*Facts: `typography`, `text`.*

**overused-font** — Inter, Roboto, Geist, Plus Jakarta Sans, Space Grotesk,
Fraunces. Used on so many surfaces they no longer carry personality. Platform
defaults count: Flutter's default IS Roboto, so an app that declares no family
still trips this, correctly. SF on Apple platforms does not — a system face is
not a choice made badly.

**flat-type-hierarchy** — sizes too close together to establish rank. Aim for at
least a 1.25 ratio between steps.

**oversized-h1** — a headline far larger than the scale's next step, with nothing
between them.

**heading-rhythm** — heading sizes that do not descend monotonically through the
document.

**tight-leading** — line-height below ~1.2 on body copy.

**wide-tracking** / **extreme-negative-tracking** — letter-spacing pushed past
legibility in either direction.

**line-length** — measure beyond ~90 characters. Reading breaks down well before
the container does.

**justified-text** — justified body copy on the web, where there is no hyphenation
engine to make it work. *(error)*

**undersized-ui-text** — interface text below the readable floor, distinct from
body copy which `taste`'s `tiny-body-text` already owns.

## Motion and decoration

*Facts: `motion`, `structure`.*

**pulsing-dot** — a pulsing status dot that is not tied to live, changing data.
Simulated liveness.

**blinking-cursor** — a blinking caret animated into a hero. Borrows the dev-tool
aesthetic as decoration where no input exists.

**marquee** — auto-scrolling content the reader cannot pause.

**image-hover-transform** — a scale or rotate on image hover, applied uniformly.

**shape-assembled-illustration** — an "illustration" built from stacked primitive
shapes, standing in for a drawing.
