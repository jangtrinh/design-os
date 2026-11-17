---
id: designmd-format
description: "The DESIGN.md contract — the YAML token front-matter plus the eight fixed sections."
when: [designmd, design-md, token-frontmatter, google-labs]
---

# DESIGN.md format (Google Labs alpha & Stitch v1.0)

Pinned on-disk reference for the open-source DESIGN.md spec authored by
Google Labs and the Stitch `DESIGN.md` v1.0 dialect. Read this instead of
refetching the upstream repo each run — the file the host model writes at
project root (or `.stitch/DESIGN.md`) must conform to the selected dialect
contract described here.

- **Upstream:** <https://github.com/google-labs-code/design.md>
- **Full schema:** <https://github.com/google-labs-code/design.md/blob/main/docs/spec.md>
- **Spec snapshot:** alpha (captured 2026-05-27) + `stitch` v1.0. If the
  upstream repo moves to `beta`, this file is the contract — bump it
  explicitly rather than letting the workflow drift.

A `DESIGN.md` file is **one document with two halves**:

1. A YAML front-matter block delimited by `---` on its own line, holding
   the structured token data.
2. A Markdown body with ordered `##` sections matching the chosen dialect,
   holding the prose rationale a human (or another agent) reads.

Both halves are required. Either half alone is not a valid DESIGN.md.

---

## Supported dialects (`alpha` vs `stitch`)

| Property | `alpha` dialect (default) | `stitch` v1.0 dialect (`.stitch/DESIGN.md` / `--dialect stitch`) |
|---|---|---|
| Output location | `./DESIGN.md` or `./<slug>/DESIGN.md` | `.stitch/DESIGN.md` (or `--dialect stitch`) |
| `version` field | Optional; `"alpha"` | Optional; `"1.0"` or `"stitch"` |
| `colors:` shape | 2-level nested `colors.<group>.<name>` | 1-level flat Material 3–style semantic roles (`surface`, `on-surface`, `primary`, `on-primary`, …) |
| `typography:` shape | 2-level nested `typography.<group>.<name>` | 1-level flat slot objects (`display-lg`, `headline-md`, `body-base`, `label-caps`) |
| `rounded:` / `spacing:` | Named radius (`sm`/`md`/`lg`/`full`) + numeric spacing scale | Includes `rounded.DEFAULT` and `spacing.unit` / `spacing.gutter` |
| `components:` | Optional object of `"{ref}"` token references | Optional (often omitted in Stitch v1.0) |
| Markdown body | **8 fixed `##` sections** | **6 ordered `##` sections** (numbered `## 1. ...` or unnumbered; 7-section `examples/DESIGN.md` layout also parses) |
| Contrast audit | Component `textColor` / `backgroundColor` pairs | Also pairs `<role>` / `on-<role>` colour tokens when `components:` is omitted |

---

## YAML front-matter schema (`alpha` dialect)

```yaml
---
name: "<brand or product name>"        # required
description: "<one-line brand line>"   # optional
version: "alpha"                       # optional; if present must be "alpha" in alpha dialect

colors:                                # object of color tokens (group → name → value)
  brand:
    primary:   "#0F172A"
    accent:    "#22D3EE"
  neutral:
    bg:        "#FFFFFF"
    fg:        "#0F172A"
    muted:     "#64748B"

typography:                            # object of typography tokens (group → name → object)
  display:
    lg:
      fontFamily:    "Inter, sans-serif"
      fontSize:      "72px"
      fontWeight:    700
      lineHeight:    "1.1"
      letterSpacing: "-0.02em"
  body:
    md:
      fontFamily:    "Inter, sans-serif"
      fontSize:      "16px"
      fontWeight:    400
      lineHeight:    "1.55"

rounded:                               # object of radius tokens (name → dimension)
  sm:   "4px"
  md:   "8px"
  lg:   "16px"
  full: "9999px"

spacing:                               # object of spacing tokens (name → dimension)
  "0":  "0px"
  "1":  "4px"
  "2":  "8px"
  "4":  "16px"
  "8":  "32px"
  "16": "64px"

components:                            # object of component definitions (optional)
  button-primary:
    backgroundColor: "{colors.brand.primary}"
    textColor:       "{colors.neutral.bg}"
    typography:      "{typography.body.md}"
    rounded:         "{rounded.md}"
    padding:         "{spacing.2} {spacing.4}"
  card:
    backgroundColor: "{colors.neutral.bg}"
    textColor:       "{colors.neutral.fg}"
    rounded:         "{rounded.lg}"
    padding:         "{spacing.4}"
---
```

### Required fields (`alpha`)

| Field | Required | Notes |
|---|---|---|
| `name` | yes | A short brand or product name. Free-form string. |
| `description` | no | A single line describing the brand voice or product. |
| `version` | no | In `alpha` dialect, must be `"alpha"` if present. |
| `colors` | as observed | Group → name → hex string. Omit if the source has no colour signal at all (rare). |
| `typography` | as observed | Group → name → object of typography properties. |
| `rounded` | as observed | Name → dimension. |
| `spacing` | as observed | Name → dimension. |
| `components` | as observed | Optional. Name → object using `"{ref}"` strings against the tokens above. |

---

## YAML front-matter schema (`stitch` v1.0 dialect)

Use this dialect for `.stitch/DESIGN.md` or when `--dialect stitch` is passed to
`ui designmd audit`:

```yaml
---
name: "<brand or product name>"        # required
description: "<one-line brand line>"   # optional
version: "1.0"                         # optional; "1.0" or "stitch" in stitch dialect

colors:                                # 1-level flat Material 3–style semantic roles
  surface:               "#F9FAFB"
  on-surface:            "#0F172A"
  surface-container-low: "#F1F5F9"
  surface-container:     "#E2E8F0"
  primary:               "#0F172A"
  on-primary:            "#FFFFFF"
  primary-container:     "#DBEAFE"
  on-primary-container:  "#1E3A8A"
  secondary:             "#334155"
  on-secondary:          "#FFFFFF"
  tertiary:              "#0D9488"
  on-tertiary:           "#FFFFFF"
  error:                 "#DC2626"
  on-error:              "#FFFFFF"
  outline:               "#94A3B8"
  outline-variant:       "#CBD5E1"

typography:                            # 1-level flat slots
  display-lg:
    fontFamily:    "Inter, sans-serif"
    fontSize:      "56px"
    fontWeight:    700
    lineHeight:    "1.1"
    letterSpacing: "-0.02em"
  headline-md:
    fontFamily:    "Inter, sans-serif"
    fontSize:      "28px"
    fontWeight:    600
    lineHeight:    "1.25"
  body-base:
    fontFamily:    "Inter, sans-serif"
    fontSize:      "16px"
    fontWeight:    400
    lineHeight:    "1.55"
  label-caps:
    fontFamily:    "Inter, sans-serif"
    fontSize:      "12px"
    fontWeight:    600
    lineHeight:    "1.3"
    letterSpacing: "0.06em"

rounded:
  DEFAULT: "8px"
  sm:      "4px"
  lg:      "16px"
  full:    "9999px"

spacing:
  unit:   "4px"
  gutter: "24px"
  "4":    "16px"
  "8":    "32px"
---
```

When `components:` is omitted under the `stitch` dialect, `ui designmd audit`
checks WCAG contrast across `<role>` / `on-<role>` colour pairs (such as
`surface` / `on-surface`, `primary` / `on-primary`, `primary-container` /
`on-primary-container`, `secondary` / `on-secondary`, `tertiary` /
`on-tertiary`, `error` / `on-error`).

---

## Token value formats

These are the only legal value shapes. Drift from them invalidates the file.

- **Color value.** A six-digit hex string: `"#RRGGBB"`. Uppercase or
  lowercase hex digits both parse; prefer lowercase for consistency. No
  three-digit shorthand. No `rgb()`, `rgba()`, `hsl()`, or `oklch()`
  values in the YAML — convert to hex first.
- **Dimension value.** A number followed by a unit, written as a single
  string: `"<n>px"`, `"<n>em"`, or `"<n>rem"`. Numbers may be integer or
  decimal. Examples: `"16px"`, `"1.5rem"`, `"0.5em"`.
- **Typography value.** An object, not a string. Properties:
  - `fontFamily` (string, CSS font-family list)
  - `fontSize` (dimension string)
  - `fontWeight` (integer 100–900, or named-weight string like `"semibold"`)
  - `lineHeight` (unitless number as string, or dimension string)
  - `letterSpacing` (dimension string; optional)
  - `fontFeature` (string of OpenType feature settings; optional)
  - `fontVariation` (string of variable-font axis settings; optional)
- **Reference value.** A string of the form `"{group.name}"` (or `"{colors.primary}"`
  for flat `stitch` roles) that points at another token defined above. Example:
  `"{colors.brand.primary}"`, `"{typography.body.md}"`. References resolve at
  read time; circular references are rejected.

---

## Markdown body — `alpha` dialect (8 sections, fixed order)

Section headings must be `##` level and must appear in this exact order.
Synonyms allowed by upstream are listed in parentheses; pick one per
document and use it consistently.

1. **Overview** (also accepted: *Brand & Style*) — one short paragraph of
   persona-style prose. Describes the brand voice and visual direction.
2. **Colors** — table or bulleted list of the semantic colour roles and
   the hex values they map to.
3. **Typography** — table of the type ramp: each named slot with its
   family, size, weight, and line height.
4. **Layout** (also accepted: *Layout & Spacing*) — observed grid,
   density, section pacing, max widths.
5. **Elevation & Depth** (also accepted: *Elevation*) — shadow ladder,
   blur usage, whether shadows are neutral or brand-tinted.
6. **Shapes** — radius family. Sharp vs soft, where each radius applies.
7. **Components** — one short note per registered component: what it
   looks like, where it is used.
8. **Do's and Don'ts** — 3–5 bullets each, drawn from the cross-check
   between observed HTML and the screenshot.

## Markdown body — `stitch` v1.0 dialect (6 ordered sections)

For `.stitch/DESIGN.md` (or `--dialect stitch`), emit these **6 ordered `##`
sections** (numbered `## 1. Visual Theme & Atmosphere` or unnumbered
`## Visual Theme & Atmosphere`):

1. **Visual Theme & Atmosphere** — visual mood, aesthetic temperature,
   density, and surface personality.
2. **Color Palette & Roles** — semantic Material 3–style role table
   (`surface`, `on-surface`, `surface-container-*`, `primary`, `on-primary`,
   `secondary`, `tertiary`, `error`, `outline`, `outline-variant`) with hex
   values and usage rules.
3. **Typography Rules** — slot table (`display-lg`, `headline-md`,
   `body-base`, `label-caps`) with family, size, weight, line height, and
   letter-spacing rules.
4. **Component Stylings** — surface treatments, corner radii (`rounded.DEFAULT`,
   pills, sharp containers), border/elevation rules, and interactive states.
5. **Layout Principles** — `spacing.unit` / `spacing.gutter` rhythm,
   container widths, responsive breakpoints, and whitespace proportions.
6. **Design System Notes for Stitch Generation** — concrete prompting rules,
   anti-patterns to avoid, and invariant token bindings for generation.

> Note: The 7-section `Brand & Style` → `Colors` → `Typography` → `Layout & Spacing`
> → `Elevation` → `Shapes` → `Components` layout from upstream
> `examples/DESIGN.md` also parses under the `stitch` dialect.

### Section-ordering rules

- All sections required by the active dialect (8 for `alpha`, 6 for `stitch`)
  must be present. An emitted DESIGN.md with a missing section is invalid.
- Duplicate headings reject the whole file. Each `##` heading must be
  unique.
- Unknown `##` headings inserted between the spec sections are preserved
  (the spec is extensible) but disrupt the canonical reading order — do
  not emit them from this workflow.
- In `alpha`, heading text matches the spec exactly. Capitalisation and
  apostrophes matter: `Do's and Don'ts`, not `Dos and Donts`.

---

## Versioning and extension rules

- In `alpha` dialect, `version: "alpha"` is optional in the YAML; if present
  it must be `"alpha"`. In `stitch` dialect, `version` if present must be
  `"1.0"` or `"stitch"`. Do not emit speculative version strings like
  `"beta"` or `"latest"`.
- Unknown YAML keys at the top level are preserved by lenient readers
  but cannot be referenced. Do not invent new top-level keys from this
  workflow.
- Unknown properties **inside** a component object are accepted with a
  warning by lenient readers. Stay within the declared property set
  (`backgroundColor`, `textColor`, `typography`, `rounded`, `padding`,
  plus equivalents the upstream spec adds in this snapshot).

---

## How this differs from our internal `design/*.json` SSOT

ease-design ships a separate, deterministic design-system store at
`design/design.tokens.json`, `design/component-registry.json`, and
`design/ds.manifest.json`. That store follows the **DTCG** model
(`knowledge/token-taxonomy.md`) and is mutated through `ui ds change-token`
and `ui registry register`. It is the source of truth for `/ui:generate`,
`/ui:extract`, and every other workflow that produces HTML.

`DESIGN.md` is **not** that store. The two formats differ on purpose:

| Property | `DESIGN.md` (this file) | `design/*.json` (DTCG SSOT) |
|---|---|---|
| Audience | Any coding agent, including ones outside ease-design | The `ui` binary + ease-design workflows |
| Mutation | Hand-edit or re-run `/ui:from-url` | `ui ds change-token`, `ui registry register` |
| Validation | Self-check at emit time (workflow step 9) | Schema-enforced by the binary at every mutation |
| Composite tokens | Inline objects (typography) + flat refs | Two-tier primitive/semantic alias graph |
| Manifest hash | None | Sealed `ds.manifest.json` with hash + changelog |

The two can coexist in the same project. `/ui:from-url` writes a
per-project folder `./<slug>/DESIGN.md` and leaves `design/*.json`
alone. Future bridge work (`v1.y`) may add a `ui designmd export
--target dtcg` to convert one into the other; this snapshot does not.

---

## Token precision — what counts as source-of-truth

When the `/ui:from-url` workflow harvests tokens for a DESIGN.md, the
**raw HTML and the linked CSS bytes are canonical**. Anything else is
inference and must defer to those bytes.

The hierarchy, top to bottom:

1. **Extraction grade** — values pulled by `ui designmd extract-tokens`
   from raw HTML + linked CSS. Hex values with frequency counts. Font
   families with provenance. Custom-property declarations with
   resolved hex. This is the source the audit gate enforces.
2. **Vision grade** — values pulled from a viewport screenshot via the
   host model's native vision. Used to *correct* extraction-grade
   tokens when a brand colour lives in an image, SVG, or unresolved
   CSS variable. Recorded as inline YAML comments
   (`# screenshot override: <reason>`). Subject to the audit; if a
   vision-derived value isn't in the source CSS at all, the audit's
   source-fidelity row FAILs and the workflow must reconcile.
3. **Summary grade** — values inferred from an LLM-summarised view of
   the page (e.g. a WebFetch prose summary that says "warm amber"
   when the CSS actually used `#f97316` orange). **Never canonical
   for hex values, font names, or dimension values.** Useful only
   for persona prose, component naming, and Overview rationale —
   things vision and extraction cannot decide.

The audit gate enforces this hierarchy. The `source-fidelity` family
FAILs any emitted hex with `count = 0` in `tokens.json` (an invented
value, regardless of how plausible) and any emitted `fontFamily`
first-name absent from `tokens.json` `fonts[]`.

When the host CLI cannot reach the linked CSS (CORS, auth wall,
edge-cache miss), the audit emits a WARN row "token confidence is
summary-grade only" instead of FAIL. The user is told explicitly
which fetch tier resolved the run, so any accepted summary-grade
output is a deliberate choice.

The reason this matters: WebFetch sanitises HTML through an LLM that
rewrites colour mentions as natural-language descriptions ("warm
amber", "tangerine accent"). Those descriptions are real signal for
persona prose but they are not bit-exact for token emission. Always
re-ground hex/font values in the bytes before emitting.
