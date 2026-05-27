# Workflow — `/ui:from-url`

## Title

`/ui:from-url <url>` — **extract a portable design spec from a live URL**.
Point at any website, get back a single `./DESIGN.md` at project root that
conforms to the Google-Labs alpha spec (YAML front-matter + 8 ordered
Markdown sections).

This workflow is the **inverse of `/ui:extract`** at the format layer.
`/ui:extract` reads a local HTML file and writes the ease-design internal
SSOT (`design/*.json`, DTCG two-tier). `/ui:from-url` reads a live URL and
writes the open-spec `DESIGN.md` that any coding agent can consume —
including ones outside ease-design. The two outputs can coexist in the
same project; they describe the same brand in two different audiences'
languages.

Use `/ui:from-url` when:

- The user wants a portable, agent-readable brand spec they can hand to
  any tool that understands `DESIGN.md`.
- The source of truth is a **live URL**, not a local HTML file.
- The project has no design system yet and the user wants to capture
  one *as documentation* before deciding whether to compile it into
  `design/*.json` via `/ui:extract`.

This workflow does **not** mutate `design/*.json`. It writes one file at
`./DESIGN.md` and stops.

---

## Inputs

| Input | Source | Required | Notes |
|---|---|---|---|
| `<url>` | path argument | yes | A single URL the host CLI can resolve. Multi-page crawl is out of scope. |
| Rendered HTML body | host CLI fetch (WebFetch / `curl` / bb-browser MCP) | yes | The `ui` binary is **not** invoked here — same constraint as `from-ref.md`. |
| Viewport screenshot | host CLI fetch (≥ 1280×800) | yes | Cross-checks the HTML-derived tokens against the rendered pixels. |
| DESIGN.md format spec | `knowledge/designmd-format.md` | yes | The pinned on-disk reference for YAML schema + 8 sections + token formats + versioning. |
| Color science | `knowledge/color-science.md` | yes | OKLCH bucketing + WCAG contrast rules. Same as `/ui:extract`. |
| Token taxonomy | `knowledge/token-taxonomy.md` | yes | Typography / spacing / radius conventions, reused for the YAML token shapes. |
| Component catalog | `knowledge/component-catalog.md` | yes | Canonical category + variant naming, reused for the YAML `components:` keys (lowercased for DESIGN.md compatibility). |
| Persona index | `knowledge/persona-index.md`, `knowledge/personas/*.md` | yes | Used to synthesise the persona family that drives the Overview prose. |

---

## Steps

### 1. Resolve the URL

The host CLI fetches the URL with the strongest tool available — in
priority order:

1. **WebFetch** (Claude built-in) — preferred when running under Claude
   Code or any CLI that exposes a WebFetch primitive. Captures sanitised
   rendered HTML.
2. **`curl`** via Bash — fallback for runtimes that do not have WebFetch
   (Codex, generic shells). Captures raw response body.
3. **bb-browser MCP** — required for JS-heavy / SPA pages where steps 1
   and 2 return only an empty shell. Captures the rendered DOM after JS
   execution + a viewport screenshot ≥ 1280×800.

The `ui` binary is **not** invoked in this step. This mirrors the
host-CLI-fetches contract from `templates/workflows/from-ref.md` step 1
and preserves the deterministic-no-network guarantee from CLAUDE.md.

Also capture a viewport screenshot ≥ 1280×800. If the chosen fetch tool
cannot take a screenshot (plain `curl` cannot), promote the fetch one
rung up the chain — bb-browser MCP can.

### 2. Graceful degrade chain

If the fetch above is incomplete, walk the chain explicitly and tell
the user which rung succeeded so the choice is auditable:

- **HTML empty or JS-shell only** → escalate to bb-browser MCP for the
  rendered DOM + screenshot.
- **bb-browser MCP unavailable** → ask the user to paste saved HTML or
  provide a local screenshot path. Both are first-class inputs.
- **User supplies HTML only** (no screenshot) → run the rest of the
  workflow but skip the cross-check in step 5; flag that the
  HTML-only path was used in the summary at step 8.
- **User supplies screenshot only** (no HTML) → behave like
  `templates/workflows/from-ref.md` step 3: build a vision-derived
  brief, then synthesise the YAML from that brief instead of from raw
  HTML.

Record the exact fetch path used. It becomes part of the step-8 summary
and the dogfood log.

### 3. Read the knowledge core

Open these files once, in this order, and keep them in context for the
rest of the workflow:

- `knowledge/designmd-format.md` — the authoritative format contract.
- `knowledge/color-science.md` — OKLCH bucketing + WCAG targets.
- `knowledge/token-taxonomy.md` — typography / spacing / radius
  conventions.
- `knowledge/component-catalog.md` — canonical Category/Variant names.
- `knowledge/persona-index.md` — persona scoring routine for the
  Overview prose synthesis.

### 4. Token harvest from HTML

Walk the HTML once, **per-family**, and harvest observed values. Reuse
the deterministic recipe from `templates/workflows/extract.md` step 4 —
the only difference is that the values are emitted into the DESIGN.md
YAML shape, not DTCG.

For each family:

- **Colors.**
  - Collect every unique `#hex`, `rgb()`, `rgba()`, `hsl()`, and
    `oklch()` value from `style=`, `<style>` blocks, and Tailwind
    arbitrary classes like `bg-[#1a1a2e]`. Convert non-hex values to
    `"#RRGGBB"` — the spec accepts no other colour shape.
  - Cluster the colours into role buckets: brand primary, brand
    accent, neutral background, neutral foreground, neutral muted,
    plus success / warning / danger / info if present.
  - For each role, generate an 11-stop scale anchored at the chosen
    sample: `ui color scale <hex>`. Pick the working stop per role
    (typically `500` for brand primary) and emit it under
    `colors.<group>.<name>` in YAML.
  - Run `ui color contrast` on every foreground/background pair the
    YAML implies. Body text pairs must clear WCAG 4.5:1; large-text
    and non-text UI pairs must clear 3:1. Pairs that fail get
    flagged in the step-8 summary — do not silently ship a spec
    that violates its own contrast contract.
- **Typography.**
  - Collect every `font-family` value (inline, `<style>`, Tailwind
    `font-[...]` arbitrary classes). Cluster into display vs body.
  - Collect every distinct font-size used. Bucket into named slots
    (`display.lg`, `display.md`, `headline.lg`, `headline.md`,
    `body.lg`, `body.md`, `body.sm`, `caption.md`) by sorting the
    observed sizes and assigning each cluster a slot.
  - Collect every distinct font-weight. Normalise to integer
    (300 / 400 / 500 / 600 / 700 / 800).
  - Emit each slot as an *object* under `typography.<group>.<name>`:
    `fontFamily`, `fontSize` (e.g. `"72px"`), `fontWeight`,
    `lineHeight`, plus optional `letterSpacing` / `fontFeature` /
    `fontVariation` if observed.
- **Spacing.**
  - Collect every distinct padding, margin, and gap value. Find the
    smallest non-zero value; treat it as the candidate base unit.
  - Verify the other values are integer (or half-step) multiples of
    the base unit. If they are, ship that grid as the spacing scale
    (`spacing.0` … `spacing.16`) with `"<n>px"` strings. If they are
    noise, snap to the nearest multiple and note the snap in the
    step-8 summary.
- **Rounded.**
  - Collect every distinct `border-radius`. Cluster into named
    slots: `rounded.sm`, `rounded.md`, `rounded.lg`, `rounded.full`
    (for any value `≥ 9999px` or `50%`).
- **Elevation.**
  - Collect every distinct `box-shadow`. Capture whether shadows are
    brand-tinted (`rgba` of the brand hue) or neutral. Shadows are
    documented in the Markdown body (section 5), not the YAML — the
    alpha spec does not declare a shadow token shape.

### 5. Cross-check tokens against the screenshot

Use the host model's native vision on the screenshot from step 1.
Verify three signals against the YAML draft from step 4:

1. **Dominant brand colour.** If the screenshot shows a clearly
   dominant accent that is missing from the HTML-derived tokens
   (common when the brand colour is locked inside an `<img>`,
   `<svg>` background, or `--var(...)` indirection), the screenshot
   wins. Replace the HTML-derived value and add an inline YAML
   comment recording the disagreement.
2. **Overall density.** If the screenshot reads as more (or less)
   spacious than the harvested `spacing` scale suggests, recompute
   the scale's working unit.
3. **Type weight character.** If the screenshot's display headlines
   read heavier or lighter than the harvested weights suggest,
   adjust the relevant typography slot.

Every override gets a one-line YAML comment of the form
`# screenshot override: <reason>` so the decision is auditable.

### 6. Discover components

Walk the HTML again. Apply the same repetition + role detection from
`templates/workflows/extract.md` step 2:

- **Repetition signal.** Class strings or wrapper structures that
  appear two or more times.
- **Role signal.** Singletons whose role is unambiguous from
  structure (`<nav>`, `<header>`, `<footer>`, hero `<section>`,
  pricing block).
- **Granularity rule.** Capture both layout-level (hero, pricing
  grid, footer) and atom-level (primary button, secondary button,
  badge, input) patterns. De-duplicate by visual identity.

For each candidate, emit one entry under YAML `components:` with a
short lowercase-hyphenated key. Each value is an object using
`"{ref}"` strings against the tokens harvested above:

- `backgroundColor` — `"{colors.<group>.<name>}"`
- `textColor` — `"{colors.<group>.<name>}"`
- `typography` — `"{typography.<group>.<name>}"`
- `rounded` — `"{rounded.<name>}"`
- `padding` — `"{spacing.<n>}"` or `"{spacing.<n>} {spacing.<m>}"`

Aim for 5–15 components. Throw away one-off decorative blobs.

### 7. Compose the 8 Markdown sections in spec order

Invoke the **designmd-emit** skill (`templates/skills/designmd-emit.md`).
The skill carries the section-order checklist, format rules, and
self-check rules; this step provides the *content*.

1. **Overview** — one paragraph of persona-style prose. Synthesise a
   persona using `knowledge/persona-index.md` against keywords pulled
   from the brief (dominant colours, density, type character, depth
   character). Use the chosen persona family's prose voice. Name
   the brand only as the user wrote the URL (don't invent a brand
   line they didn't ask for).
2. **Colors** — table of the semantic colour roles and their hex
   values. Two columns: role, hex. Mirrors what is in the YAML
   `colors:` block but reads top-to-bottom for humans.
3. **Typography** — table of the type ramp. Columns: slot, family,
   size, weight, line-height.
4. **Layout** — observed grid, density, section pacing, max widths.
   3–5 bullets.
5. **Elevation & Depth** — shadow ladder + whether shadows are
   neutral or brand-tinted. 3–5 bullets. This is where the
   step-4 shadow harvest lands, since the YAML does not carry a
   shadow token shape in alpha.
6. **Shapes** — radius family observed. Sharp vs soft. Where each
   radius is applied (cards vs buttons vs inputs).
7. **Components** — one short note per registered component:
   what it looks like, where it appears. Match the keys used in
   YAML `components:`.
8. **Do's and Don'ts** — 3–5 bullets each. Draw from the
   cross-check in step 5 (e.g. *"Don't use accent text under 14px
   — the screenshot confirms low contrast there"*).

### 8. Write `./DESIGN.md`

The output goes to **the project root** as `./DESIGN.md`. Confirm with
the user before overwriting if a file is already there — offer to
write to `design/DESIGN.md` instead if the user wants to preserve the
existing one.

Emit the YAML front-matter first (delimited by `---` lines), then the
8 Markdown sections in order. Print a summary to the host model
surface:

- Counts: colour tokens, typography slots, components.
- Persona family that drove the Overview prose.
- Fallback rung used (WebFetch / curl / bb-browser MCP / user-paste).
- Any token overrides applied in step 5.
- Any contrast pairs flagged in step 4.

### 9. Closure self-check (no taste rubric)

The 6+1-axis critique gate in `templates/workflows/critique.md` scores
rendered HTML against a persona's craft targets — it has no input to
grade here, exactly as in `templates/workflows/extract.md` step 10.
State this explicitly to the user: *"this workflow produces a spec
document, so the 6+1-axis taste gate does not apply; the closure step
is the format self-check defined below."*

Walk each check. Any failure → surface the suggested fix and stop.

1. **YAML parses.** The front-matter must be a single valid YAML
   document.
2. **Section order is correct.** All 8 headings appear in the spec
   order from `knowledge/designmd-format.md`.
3. **No duplicate headings.** Each `##` heading appears exactly once.
4. **All references resolve.** Every `"{group.name}"` string in the
   YAML points at a token defined in the same YAML block. No
   dangling references.
5. **All colour values are six-digit hex.** `/^#[0-9a-fA-F]{6}$/`.
   No `rgb()`, `rgba()`, three-digit hex, or named colours.
6. **All dimension values are `<n>px|em|rem`.**
   `/^[0-9]*\.?[0-9]+(px|em|rem)$/`. No unitless numbers, no `%`,
   no `vw`/`vh`.
7. **`version` if present is `"alpha"`.** Never emit a speculative
   version string.

When all 7 checks pass, the workflow is complete. The file at
`./DESIGN.md` is the project's portable brand spec.

---

## Outputs

- `./DESIGN.md` — one file at project root, valid per the Google-Labs
  alpha spec: YAML front-matter + 8 ordered Markdown sections. The
  authoritative format contract lives in `knowledge/designmd-format.md`.
- A short summary printed to the host model surface: token counts,
  component count, persona family, fallback path used, any overrides
  or contrast flags surfaced during the run.
- **No changes to `design/*.json`.** This workflow does not touch the
  internal ease-design SSOT. Run `/ui:extract` on a later generated
  HTML page if you want the DTCG store populated too.

---

## Quality gate

This workflow produces a **spec document**, not rendered HTML. The
6+1-axis taste gate in `templates/workflows/critique.md` therefore
does not apply — exactly as in `templates/workflows/extract.md` step
10. The closure step is the **format self-check** defined in step 9:
YAML parses, section order is correct, no duplicate headings, all
references resolve, all colours are `"#RRGGBB"`, all dimensions are
`<n>px|em|rem`, and any `version` is `"alpha"`. The workflow is
complete only when all 7 checks pass. On persistent failure, surface
the failing check and the suggested fix; the typical fix is a one-line
YAML edit in step 7 before re-running step 9.

Subsequent HTML generated against the spec via `/ui:generate` *will*
be scored by `critique.md` per its own contract. That is the right
time for the taste gate, not now.
