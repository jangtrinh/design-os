# Family: Editorial Minimal

Personas that treat **restraint, precision, and whitespace as the design** — the
calculated rigor of technical documentation, the confident silence of luxury editorial,
the ink-density of print journalism, and the serif/mono voice of editorial-tech. Pick
this family when the content should feel curated, exact, and authored — high-end landing
pages, documentation, technical dashboards, and portfolios.

**Family typography note** — prose in this family is set in **sentence case, never Title
Case** (Title Case reads as a machine-default heading tell), and headings hold a **6:1 or
greater headline:body size contrast** on desktop so the hierarchy is unmistakable. Both are
DNA defaults for every persona below unless a block overrides them.

**Personas in this family:** Industrial Blueprint · Quiet Luxury Editorial · Newsprint
Editorial · Italic Serif × Mono-Label

See `persona-index.md` for the cross-family lookup table and auto-selection rules.

---

## Industrial Blueprint

- **Slug:** `industrial-blueprint`
- **Family:** editorial-minimal
- **UI types:** dashboard, admin, documentation, app
- **Density:** compact
- **Color mode:** dark
- **Keywords:** blueprint, technical, precision, engineering, grid, mono, data

**Philosophy** — Technical precision as beauty: engineering documentation elevated to
fine art.

### Aesthetic DNA

| Field | Direction |
|---|---|
| **Typography** | Mono/technical fonts (Space Mono, DM Mono) paired with geometric sans (Space Grotesk). Precise sizing. Small caps for labels. Tabular figures for numbers. |
| **Color philosophy** | Blueprint palette: deep navy (#0a192f) or slate (#1e293b) backgrounds. Cyan (#06b6d4) wireframe accents. White (#e2e8f0) text. Optional warm amber (#f59e0b) highlights. |
| **Spacing** | Measured, precise spacing with consistent rhythm. 16px base unit. Grid-aligned. Feels calculated and intentional. |
| **Depth** | Minimal. Thin outline-only containers (1px solid). Subtle glow effects on active elements (cyan box-shadow). No heavy shadows. |
| **Borders** | Thin, precise borders everywhere (1px solid). Dashed for secondary. Corner registration marks. Sharp 2–4px radius. |
| **Texture** | Faint grid-dot pattern backgrounds (4px dots at 10% opacity). Blueprint crosshatch for section backgrounds. Subtle scan-line effects. |

**Interactions** — Precise highlight on hover (border glow). Data-oriented
transitions. Annotation reveals. Measurement-style tooltips.

**Layout** — Dense, information-rich grids. Dashboard-like composure. Sidebar + main
patterns. Data tables and metric cards.

**Anti-patterns** — NO decorative elements. NO organic shapes. NO playful fonts. NO
bright saturated colors. NO large whitespace (density is valued).
**Avoid list:** decorative elements; organic shapes; playful fonts; bright saturated
colors; large whitespace.

---

## Quiet Luxury Editorial

- **Slug:** `quiet-luxury-editorial`
- **Family:** editorial-minimal
- **UI types:** landing, portfolio, ecommerce
- **Density:** spacious
- **Color mode:** light
- **Keywords:** luxury, editorial, serif, whitespace, quiet, refined, minimal

**Philosophy** — Vast negative space: the confidence of saying less. Chanel meets
white space.

### Aesthetic DNA

| Field | Direction |
|---|---|
| **Typography** | Transitional serifs (Playfair Display, Cormorant Garamond) for headings. Clean sans (Inter) for body at 15–16px. Extreme weight contrast: light body (300) vs semibold headings (600). Generous line-height (1.7–1.8 for body). |
| **Color philosophy** | Monochrome with ONE accent: ivory (#FAFAF5) background, charcoal (#1a1a1a) text, one muted accent (dusty rose #C4A882 or sage #8B9E82). NO bright colors. |
| **Spacing** | VAST. Sections separated by 120–160px. Internal padding 48–64px. Maximum breathing room. Whitespace IS the design. |
| **Depth** | Almost none. Occasional hairline shadow (0 1px 2px rgba(0,0,0,0.05)). Depth from typography hierarchy and whitespace, not effects. |
| **Borders** | Hairline only (1px #e5e5e0). NO visible borders on cards — separation via spacing. When used, extremely thin and muted. |
| **Texture** | None. Pure, clean surfaces. Occasional fine linen texture for full-bleed backgrounds. No noise, no grain. |

**Interactions** — Subtle opacity shifts (0.7 → 1.0). Underline animations on text
links. Minimal, restrained hover states. Nothing flashy.

**Layout** — Single-column editorial flow. Full-width imagery bleeding to edges.
Centered text blocks with narrow max-width (600–700px). Magazine-like pacing.

**Anti-patterns** — NO bright accent colors. NO rounded pill buttons. NO playful
fonts. NO dense layouts. NO shadows deeper than 2px. NO gradients. NO icons used for
decoration.
**Avoid list:** bright accent colors; rounded pill buttons; playful fonts; dense
layouts; decorative icons.

---

## Newsprint Editorial

- **Slug:** `newsprint-editorial`
- **Family:** editorial-minimal
- **UI types:** landing, documentation, portfolio
- **Density:** compact
- **Color mode:** light
- **Keywords:** newsprint, print, journalism, broadsheet, masthead, editorial, column

**Philosophy** — The printed broadsheet rendered on screen: dense columns, hairline rules,
ink on newsprint. Density is the point — the page earns trust by looking edited, not spaced
out.

### Aesthetic DNA

| Field | Direction |
|---|---|
| **Typography** | High-contrast serif masthead (Playfair Display, Cheltenham-style) over a condensed serif or grotesque body at 15–16px. Small-caps kicker labels; occasional drop-cap opening a lead. Prose in **sentence case**; headline:body contrast **6:1+** on desktop. Tabular figures for datelines and standings. |
| **Color philosophy** | Ink on paper: near-black (#111111) text on warm newsprint (#F7F4EC), one spot red (#C0392B) reserved for kickers and rules. NO tints, NO gradients, NO pastels. |
| **Spacing** | Tight and columnar. 4px base unit, dense line-packing, narrow gutters. Whitespace is rationed, not lavished. |
| **Depth** | Completely flat. Zero shadow. Depth comes from column structure and rule weight, never elevation. |
| **Borders** | Hairline rules everywhere (1px ink). Collapsed grid borders — cells share a single rule. A thick masthead rule (2–4px) under the header. |
| **Texture** | Optional faint paper grain (compose the grain-as-texture device at ~5–8%). No noise heavy enough to touch text contrast. |

**Interactions** — Restrained: underline-on-hover links, section rules that thicken on
focus. Nothing animated for its own sake.

**Layout** — Multi-column broadsheet grid with a masthead header and an above-the-fold lead
hierarchy. Content-dense; imagery cropped tight to columns, never full-bleed hero.

**Anti-patterns** — NO rounded corners. NO drop shadows. NO gradients. NO pastel palettes.
NO sparse whitespace-forward layouts (density is the voice).
**Avoid list:** rounded corners; drop shadows; gradients; pastel palettes; whitespace-forward
layouts.

---

## Italic Serif × Mono-Label

- **Slug:** `serif-italic-mono-label`
- **Family:** editorial-minimal
- **UI types:** landing, portfolio, documentation
- **Density:** comfortable
- **Color mode:** both
- **Keywords:** serif, italic, mono, label, editorial, technical, contrast

**Philosophy** — Editorial warmth meets technical precision: display serif italics carry the
voice, monospace micro-labels carry the system. The tension between the two *is* the identity
— neither a pure literary nor a pure engineering look.

### Aesthetic DNA

| Field | Direction |
|---|---|
| **Typography** | Display serif in **italic** for headings and pull quotes (Newsreader, Fraunces, PT Serif italic) paired with a monospace (IBM Plex Mono, Space Mono) for micro-labels, metadata, eyebrows, and captions in small caps. Body prose in **sentence case**; headline:body contrast **6:1+** on desktop. |
| **Color philosophy** | Restrained two-tone with one accent: warm off-white or deep charcoal base, ink text, a single saturated accent (oxblood #7B2D26 or ink-blue #1D3A5F) used only on mono labels. |
| **Spacing** | Comfortable editorial rhythm. 8px base; generous line-height on serif body (1.6–1.75); tight, letterspaced mono labels. |
| **Depth** | Near-flat. Hairline separators; at most a 1–2px shadow. Hierarchy from the serif/mono type contrast, not elevation. |
| **Borders** | Hairline rules and mono-labelled section dividers (a small caps mono tag sitting on a 1px rule). Sharp or minimal radius (0–4px). |
| **Texture** | None to faint. Let the two typefaces be the texture. |

**Interactions** — Underline and italic-to-roman shifts on hover; mono labels that reveal a
value on focus. Quiet, precise.

**Layout** — Single-column editorial flow with a mono-label margin rail (eyebrows, dates,
section tags). Serif carries the reading line; mono annotates the structure.

**Anti-patterns** — NO sans-serif headings (the serif italic is the voice). NO decorative
display fonts beyond the serif/mono pair. NO bright multi-color palettes. NO heavy shadows or
gradients.
**Avoid list:** sans-serif headings; extra display fonts; bright multi-color palettes; heavy
shadows; gradients.
