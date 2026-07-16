# Family: Graphic Modernist

Personas rooted in **graphic design tradition** — Swiss typography, grid systems,
poster-scale type, primary colors, flat composition, and hard-edged brutalism.
Typography and grid carry the entire design; decoration is rejected. Pick this family for
bold landing pages, portfolios, and brand-forward sites where the layout itself is the
statement.

**Family typography note** — prose in this family is set in **sentence case, never Title
Case** (Title Case reads as a machine-default heading tell), and headings hold a **6:1 or
greater headline:body size contrast** on desktop. Both are DNA defaults for every persona
below unless a block overrides them.

**Personas in this family:** Kinetic Swiss-Punk · Kinetic Type Studio · Neo-Brutalist
Hard-Shadow

See `persona-index.md` for the cross-family lookup table and auto-selection rules.

---

## Kinetic Swiss-Punk

- **Slug:** `kinetic-swiss-punk`
- **Family:** graphic-modernist
- **UI types:** landing, portfolio
- **Density:** comfortable
- **Color mode:** both
- **Keywords:** swiss, typography, grid, punk, bold, primary, modernist

**Philosophy** — The International Typographic Style meets punk energy: rigid grids
with anarchic content.

### Aesthetic DNA

| Field | Direction |
|---|---|
| **Typography** | Grotesque sans-serifs (Helvetica Neue, Akzidenz-Grotesk via Inter). Extreme size contrasts: 96px headings next to 11px captions. Ultra-bold weights mixed with ultra-light. |
| **Color philosophy** | Primary colors ONLY: pure red (#ff0000), blue (#0000ff), yellow (#ffff00) on white or black. No tertiary colors, no tints. |
| **Spacing** | Strict 8-point baseline grid. Mathematical precision in margins. Large section gaps (80–120px). Tight internal component spacing. |
| **Depth** | Completely flat. No shadows whatsoever. Depth from overlapping colored blocks and text layering. |
| **Borders** | Hairline rules (1px black) for grid structure. No rounded corners. Occasional thick dividers (4–8px) as brutalist accents. |
| **Texture** | None. Pure flat color fields. Occasional halftone dot patterns for decorative fills. |

**Interactions** — Typography that scales on hover (font-size transitions). Elements
that slide along grid lines. Content that reveals on scroll.

**Layout** — Strict column grids (4, 6, or 12 columns). Asymmetric content placement
within symmetric structures. Full-bleed color blocks.

**Anti-patterns** — NO decorative elements. NO icons used for decoration. NO rounded
corners. NO subtle colors. NO gradients.
**Avoid list:** decorative elements; rounded corners; soft subtle colors; gradients;
icon decorations.

---

## Kinetic Type Studio

- **Slug:** `kinetic-type-studio`
- **Family:** graphic-modernist
- **UI types:** landing, portfolio
- **Density:** spacious
- **Color mode:** both
- **Trending:** yes
- **Keywords:** typography, type, bold, minimal, editorial, poster, display, variable

**Philosophy** — Typography IS the design. Variable fonts at massive scale, animated
reveals, and geometric composition where every letter is a visual element.

### Aesthetic DNA

| Field | Direction |
|---|---|
| **Typography** | Variable display fonts (Clash Display, Space Grotesk, Syne). Massive headings 72–144px. Extreme weight variation (100 to 900 within one heading). Body 16–18px clean sans. |
| **Color philosophy** | Limited palette: 2–3 colors maximum. High contrast: near-black (#0a0a0a) + white (#ffffff) + one accent (red, yellow, or blue). Typography provides all visual interest. |
| **Spacing** | Tight headline spacing (letter-spacing -0.05em). Generous section gaps (80–120px). Negative margins for overlapping type. Mathematical grid alignment. |
| **Depth** | Flat. Typography creates visual hierarchy through scale alone. No shadows on text. Occasional text-stroke for outline effect. Layered text with overlap. |
| **Borders** | Minimal. Hairline rules (1px) as compositional elements. No border-radius — sharp geometric lines. Dividers as typographic rhythm markers. |
| **Texture** | None. Pure type and color. Occasional halftone or grain as subtle background. Let the letterforms be the texture. |

**Interactions** — Text stagger animations (letter-by-letter reveal). Font-weight
morphing on hover. Horizontal scroll for oversized headlines. Split-text effects.

**Layout** — Type-dominant: 70%+ of visual area is typography. Asymmetric placement.
Text breaking out of containers. Full-bleed headlines. Minimal imagery.

**Anti-patterns** — NO small headings (<48px display). NO image-heavy layouts. NO
decorative elements competing with type. NO more than 3 accent colors. NO rounded UI
components.
**Avoid list:** image-heavy layouts; small typography; decorative UI; rounded
containers; complex navigation.

---

## Neo-Brutalist Hard-Shadow

- **Slug:** `neo-brutalist-hard-shadow`
- **Family:** graphic-modernist
- **UI types:** landing, portfolio, app
- **Density:** comfortable
- **Color mode:** light
- **Keywords:** brutalist, hard-shadow, offset, border, bold, raw, block

**Philosophy** — Structure worn on the outside: 2px black borders, blur-less offset shadows,
and controls that *move into their own shadow* on press. Adjacent to dopamine-maximalism but
harder, rawer, unapologetically constructed. The interface admits it is a machine.

### Aesthetic DNA

| Field | Direction |
|---|---|
| **Typography** | Heavy grotesque sans (Archivo, Space Grotesk, Inter Black). Big, blunt weights (700–900). Sentence-case prose; headline:body contrast 6:1+ on desktop. Occasional monospace for labels and buttons. |
| **Color philosophy** | High-saturation blocks on off-white (#FDFCF7): a primary (electric blue #2547FF or acid yellow #FFDD00), pure black (#000000) borders and shadows, one or two secondary blocks. Flat fills only, NO gradients. |
| **Spacing** | Comfortable but blocky. 8px base. Elements sit in clearly bordered cards with real gaps between them — the grid is visible, not implied. |
| **Depth** | Hard-shadow only: solid offset shadows (e.g. `4px 4px 0 #000`), zero blur. On press, the element translates by the shadow offset so it "fills its own shadow" — the only depth cue, and it is mechanical, not soft. |
| **Borders** | Thick (2–3px) solid black borders on every surface — cards, buttons, inputs, images. Sharp corners (0–2px radius). Borders are load-bearing identity, not trim. |
| **Texture** | Flat color fields. Optional halftone or a rotated "sticker" accent (compose the sticker-tilt device) for raw energy. |

**Interactions** — Press = translate-into-shadow (offset collapses to 0,0). Hover = shadow
grows or color inverts. Blunt, physical, immediate — no easing that reads as soft.

**Layout** — Visible block grid: bordered cards with generous gaps, asymmetric placement,
oversized bordered buttons. The construction is the aesthetic.

**Anti-patterns** — NO soft/blurred shadows. NO gradients. NO rounded pill shapes. NO
low-contrast pastel fills. NO subtle hairline borders (borders must be thick and black).
**Avoid list:** soft blurred shadows; gradients; rounded pill shapes; pastel fills; hairline
borders.
