# Phase 01 — panel skin: dark settings-modal language

Venue: `/Users/jang/orca/workspaces/ease-design/opah/figma-agent`, branch `jangtrinh/opah`, HEAD
`42fd3a9`. Anchors below were read there. One file changes in the plugin
(`plugin/src/ui/panel.html`) plus the gate test at the **repo root**
(`/Users/jang/orca/workspaces/ease-design/opah/tests/figma-plugin-panel.test.ts`).
Estimated 5h incl. screenshots. Gate: repo-root `npx vitest run tests/figma-plugin-panel.test.ts`
**and** `cd figma-agent && npm run typecheck && npm run build && npm test`.

**Files in the commit — three, not two:** `figma-agent/plugin/src/ui/panel.html` (the source),
`tests/figma-plugin-panel.test.ts` (the paired gate), **and the regenerated
`figma-agent/plugin/ui.html`** — it is a *tracked* artifact (`git ls-files plugin/ui.html` → 1) and
it is what `plugin/manifest.json:6` actually loads. Committing the source without rebuilding and
committing `ui.html` ships the OLD panel to anyone with a clean checkout.

## Context — what the file is, and what may not move

- `panel.html` is 704 lines: a compiled DS `:root` (`:21-214`), a panel font-override `:root`
  (`:227-234`), the chrome CSS (`:236-620`), the body (`:623-699`), and the bundle marker
  `/*__FIGMA_AGENT_UI_BUNDLE__*/` (`:701`) that `scripts/build.mjs:88-97` replaces with the compiled
  relay+panel bundle. The linted artifact is **this source file**, not `ui.html`
  (gate header, `tests/figma-plugin-panel.test.ts:7-10`).
- `panel-ui.ts` resolves **23** element ids at load (`:32-54`) and throws on the first missing one
  (`fga-docs` is a 24th id that only the gate reads). The skin may re-parent and restyle them; it may
  not delete one, and it may not change a tag in a way that makes the markup invalid (§1).
- Geometry is owned by the model: `PANEL_WIDTH = 300`, `PANEL_HEIGHT = {compact:170, expanded:460}`
  (`panel-model.ts:87-88`). Compact must fit 170px with no scroll.
- The current visual language is Swiss-Monolith brutalism: 2px ink rules between bands, radius 0,
  uppercase + tracking, hover inversion. That is what this phase replaces — see §6 for the exact
  delete/keep list, and `spec.md` "Unresolved questions" #1 for the direction↔gate conflict this
  raises (resolved here as a **layered** skin: the compiled DS block and its provenance comment stay;
  the skin layer overrides values after it, exactly as the font override already does at `:216-234`).

## §1 — the id inventory that must survive (copied from `panel-ui.ts:30-54`)

`fga-panel`, `fga-version`, `fga-dot`, `fga-pill`, `fga-sentence`, `fga-meta`, `fga-onboarding`,
`fga-hint`, `fga-activity`, `fga-expanded`, `fga-toggle`, `fga-toggle-label`, `fga-d-port`,
`fga-d-proto`, `fga-d-heartbeat`, `fga-d-attempts`, `fga-d-file`, `fga-d-page`, `fga-copy`,
`fga-sync`, `fga-sync-msg`, `fga-sync-now`, `fga-sync-later` — plus `fga-docs` (`panel.html:689`,
not read by JS but asserted by the gate's `target="_blank"` check).

Attributes written by JS that CSS must key off (do not rename): `#fga-dot[data-tone]` +
`.is-pulsing` (`panel-ui.ts:153-154`), `#fga-pill[data-tone]` (`:156`), `#fga-panel[data-mode]`
(`:298`), `#fga-expanded[hidden]` (`:299`), `#fga-toggle[aria-expanded]` (`:301`),
`.activity-row.is-stale` (`:110`), `.log-dot[data-ok][data-pending]` (`:114-115`),
`.log-meta[data-ok]` (`:129`), `#fga-sync[hidden]` (`:200`, `:232`, `:254`).

## §2 — the token block (OBSERVED — pixel-sampled from the reference)

Insert a THIRD `:root` block immediately after the font-override block (`panel.html:234`), before
the chrome comment at `:236`. It must come after the compiled block so it wins the cascade — the
same mechanism the gate already asserts for fonts (`tests/figma-plugin-panel.test.ts:68-72`).

```css
/* ── Panel skin (owner reference: dark settings modal) ────────────────────────
   The compiled Swiss-Monolith block above stays the DS of record (and the panel's
   provenance); this layer re-points only what the chrome paints with, the same way the
   font override above re-points the families the iframe cannot fetch. Owner decision
   2026-07-29: for THIS surface the reference wins over the brand accent.

   Provenance: pixel-sampled from references/Reference.png (1168×992, 2026-07-29) — the value next
   to each token is the coordinate it was read at. Every one is a var() the chrome reads; no hex
   below this block.
   ──────────────────────────────────────────────────────────────────────────── */
:root {
  --fga-body: #171717;            /* content pane  (1000,150) — the panel's own field */
  --fga-surface: #262626;         /* raised tier   (160,660) — nav rows, footer, buttons */
  --fga-row-active: #333333;      /* active row    (200,393) */
  --fga-border: #2A2A2E;          /* hairline around surfaces (276-row of the divider scan) */
  --fga-border-control: #474747;  /* input/button outline (600,341) + (379,368) — 1.93:1 on the
                                     body: decorative delineation only (WCAG 1.4.11 exempt) */
  --fga-border-strong: #646464;   /* the SAME outline where it is an interactive control's only
                                     boundary (Sync now / Later / Copy) — 3.03:1, the minimum
                                     non-text contrast. Δ from the sample: +29 steps, taken because
                                     correctness is a gate, not a score (DECISIONS.md) */
  --fga-divider: #454545;         /* the dotted rule  (500,274-275) */
  --fga-text: #FFFFFF;            /* primary        (52,59) */
  --fga-label: #D6D6D6;           /* label above a value — bright in the reference, kept under #FFF */
  --fga-text-muted: #9B9B9B;      /* helper/subtitle — observed #9A9A9A, +1 step (Δ 1/255) so it
                                     clears 4.5:1 ON THE ACTIVE ROW too (4.49 → 4.55) */
  --fga-text-dim: #909090;        /* section label (44-92,106-126 max) — 5.62 on body, 4.74 on
                                     surface, but only 3.96 on --fga-row-active: never use it there */
  --fga-accent: #9BA4AF;          /* active-row left bar (22,393) — cool grey-blue, 1-2px */
  --fga-tone-success: #52AC6D;    /* OBSERVED — the identity dot's green (72,953) */
  --fga-tone-warning: #E3B341;    /* PROPOSED — the reference has no connection state to sample;
                                     AA-verified: 9.21 body / 7.78 surface / 6.49 active */
  --fga-tone-info: #79C0FF;       /* PROPOSED — 9.22 / 7.78 / 6.50 */
  --fga-tone-danger: #F2777A;     /* PROPOSED — 6.57 / 5.55 / 4.63 (failed feed rows) */
  --fga-tone-muted: #9B9B9B;      /* PROPOSED — tracks --fga-text-muted so the disconnected pill
                                     clears 4.5:1 on every background, active row included */
  --fga-radius: 8px;              /* inputs, cards, buttons */
  --fga-radius-sm: 6px;           /* chips */
  --fga-divider-gap: 12px;        /* breathing room each side of a dotted rule */
}
```

Two structural facts the sampling corrected, and the plan follows them:
- **The content pane is DARKER than the nav tier** (`#171717` body vs `#262626` raised) — the
  opposite of the usual "card floats brighter on a dark ground". Raised = rows/footer/buttons.
- **Inputs are not filled**: the input interior samples the same `#171717` as the pane; only a
  1px `#474747` outline + 8px radius separates them. Feed rows and detail cells follow that
  pattern — outline, not fill — which also keeps the panel readable at 240px.

Rules for the implementer:
- **Contrast is not linted — check it by hand.** None of the four linters measures contrast
  (`a11y-lint.ts:38-45` = img-alt, html-lang, document-title, positive-tabindex, viewport-zoom,
  viewport-meta, icon-control-unnamed, heading-hierarchy). Every text token on its surface must
  reach **4.5:1**, every dot/indicator **3:1**:
  ```bash
  node -e 'const L=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]};const R=(a,b)=>{const[x,y]=[L(a),L(b)].sort((p,q)=>q-p);return((x+.05)/(y+.05)).toFixed(2)};for(const bg of ["#171717","#262626","#333333"]){for(const t of ["#FFFFFF","#D6D6D6","#9A9A9A","#909090","#52AC6D","#E3B341","#79C0FF","#F2777A","#9BA4AF"])console.log(bg,t,R(t,bg));}'
  ```
  Run it against all three backgrounds (`--fga-body`, `--fga-surface`, `--fga-row-active`) — a token
  that passes on the body can fail on the active row.

  **Already run on the observed values (2026-07-29); results, so the implementer does not re-derive
  them:** on `#171717` / `#262626` every text token clears 4.5:1 by a wide margin
  (`#FFFFFF` 17.9/15.1, `#D6D6D6` 12.3/10.4, `#9A9A9A` 6.4/5.4, `#909090` 5.6/4.7) and every status
  hue clears it too (`#52AC6D` 6.4/5.4, `#E3B341` 9.2/7.8, `#79C0FF` 9.2/7.8, `#F2777A` 6.6/5.6).
  **Two departures from the sample were required**, both recorded in the block above:
  1. `--fga-text-muted` observed `#9A9A9A` scores **4.49** on `--fga-row-active` — 0.01 short. Raised
     one step to `#9B9B9B` (4.55). Visually indistinguishable; it is the muted line inside the sync
     prompt and the newest feed row, so it genuinely lands on that background.
  2. `--fga-border-control` observed `#474747` scores **1.93** on the body. Kept as-is for
     *decorative* delineation (detail cells, dividers — exempt), and `--fga-border-strong` `#646464`
     (3.03) is used wherever the outline is an interactive control's only boundary.
  `--fga-text-dim` (`#909090`) stays at the sampled value but is **restricted to the body/surface
  backgrounds** — 3.96 on the active row would fail, and no active-row text uses it.
  Any pair below its floor gets adjusted **before** the screenshot pass, and the adjustment is
  reported as a DNA deviation (the reference has no status hues to defer to).
- **Four radius values max** across the whole file (`--fga-radius`, `--fga-radius-sm`, `0`, `50%`) —
  taste-lint's `radius-sprawl` warns past four.
- **No `rgba()` surface tints.** taste-lint's `mode-invisible-surface` is an *error* on low-alpha
  same-mode tints; every surface is a solid token.
- **No new `font-size: Npx` literal** in the chrome: `tiny-body-text` errors at ≤13px and
  `font-scale-sprawl` errors past 10 hand-picked sizes. Reuse `--font-size-xs/2xs/3xs/sm`
  (`panel.html:96-102`, `:231-232`) exactly as today.
- Keep the panel's mono family for data/log lines (`--font-mono`, `:230`) — the reference is
  humanist-sans for prose, and the feed's tabular data still needs mono.

## §3 — section-by-section redesign

Body/panel shell (`panel.html:249-267`) — this is also the **scroll container and the fluidity
root** (direction §6):

```css
html, body { height: 100%; }
body {
  margin: 0; padding: 0;
  background: var(--fga-body);
  color: var(--fga-text);
  overflow: hidden;                 /* the .panel scrolls, not the document */
}
.panel {
  display: flex; flex-direction: column;
  height: 100%;
  overflow-y: auto;                 /* long content scrolls vertically… */
  overflow-x: hidden;               /* …and NEVER horizontally (§4b) */
  background: var(--fga-body);
}
```
No `width`, no `min-width`, no `max-width` anywhere on the shell: the iframe's width is whatever
Figma gives it (240 → 640+), and every child sizes from it.

**Write every value as `var(--token)`.** `border: 1px solid --fga-border` and a bare
`inset 2px 0 0 var(…)` without its `box-shadow:` property are invalid declarations that the browser
drops silently — and all four linters are regex/string based, so the gate stays green while the
border or the accent bar simply does not exist. Each accent bar below is spelled
`box-shadow: inset 2px 0 0 var(--fga-accent);` in full.

| # | Section | Anchor (current) | New treatment |
|---|---|---|---|
| 1 | Masthead | `.app-header` `:270-295`, markup `:625-628` | Title in `--fga-text`, sentence case, `--font-size-xs`, weight `--font-weight-semibold`, `min-width: 0` + ellipsis; **version moves to the footer identity row** (§3.6); bottom rule becomes dotted (§4) |
| 2 | Status header (**sticky**) | `.status-hero` `:299-307`, `.status-dot` `:310-324`, `.status-pill` `:329-344`, markup `:630-637` | `position: sticky; top: 0; z-index: 10; background: var(--fga-body);` so it stays put while the rest scrolls (direction §6). Row is `display: flex; flex-wrap: wrap; gap: var(--space-1); min-width: 0`. Dot → 8px **circle** (`border-radius: 50%`) in the tone token; pill loses the filled block → tone-coloured text at `--font-size-sm`, semibold, no uppercase/tracking, `min-width: 0` + ellipsis; `.status-sentence` `--fga-text-muted`, `overflow-wrap: anywhere`; `.status-meta` mono `--fga-text-muted`, keeps `tabular-nums` and `:empty{display:none}` |
| 3 | File/page block | today only inside `.detail-grid` `:545-558`, markup `:669-676` | Becomes the reference's **label-over-value** pattern. The current markup alternates bare `<dt>`/`<dd>` siblings, so a 2-column grid would put label and value in *separate cells* — **wrap each pair**: `<div class="detail-cell"><dt>…</dt><dd id="…">…</dd></div>` (a `<div>` between `<dl>` and its `<dt>/<dd>` is valid HTML5 and keeps the a11y semantics). **Fluid grid, no fixed columns:** `.detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: var(--space-1) var(--space-2); }` — two columns from ~264px up, one column at 240px, three-plus at 480/640, with no media query. `.detail-cell { min-width: 0; border: 1px solid var(--fga-border-control); border-radius: var(--fga-radius); padding: 6px 8px }` (outline, not fill — §2); `dt` = `--fga-label`, `--font-size-3xs`, letter-spacing `0.04em`; `dd` = `--fga-text`, `--font-size-xs`, `min-width: 0` + ellipsis + `title`. **The `File` pair is removed from the grid** — its element moves to the footer identity row (§3.6) |
| 4 | Heartbeat / connection data | same grid, `#fga-d-heartbeat`, `#fga-d-port`, `#fga-d-proto`, `#fga-d-attempts` | Same label-over-value cells; values keep mono + tabular-nums so ages don't jitter |
| 5 | Activity feed | `.activity` `:440-452`, `.activity-row` `:459-467`, `.log-*` `:470-528`, markup `:658-663` | Band on `--fga-surface`; rows get `padding: 6px 8px`, `border-radius: var(--fga-radius-sm)`; **newest row = the reference's active row**: `.activity-row:not(.is-stale) { background: var(--fga-row-active); box-shadow: inset 2px 0 0 var(--fga-accent); }` (accent bar via inset shadow so nothing reflows); `.is-stale` keeps `opacity: .6`; `.log-dot` keeps its three shapes (filled / hollow+breathe / ✗) recoloured to `--fga-tone-success` / `--fga-tone-warning` / `--fga-tone-danger`; `.log-label` `--fga-text`, `.log-meta` `--fga-text-muted`, and `.log-meta[data-ok="false"]` (`:523`) → `var(--fga-tone-danger)` |
| 6 | Footer identity row | `.footer-row` `:562-600`, markup `:680-698` | Two stacked rows: (a) **identity** — status-dot mirror + the file name + `#fga-version` (`v0.1.0 · <sha7>`, written by `panel-ui.ts:311`); (b) **actions** — `Details` / `Docs` / `Copy` (§5). The file element moves here as **`<span id="fga-d-file" class="identity-file">—</span>`**: a `<dd>` outside a `<dl>` is invalid markup, and `panel-ui.ts:88` only sets `.textContent`, so the tag change is free. Identity row: `--fga-text` for the file name, `--fga-text-muted` for the build id, `--font-size-3xs`, one dotted rule above. **Overflow:** `.identity-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-hair) } .identity-file { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }` and `#fga-version { flex: 0 0 auto }` — file names are unbounded (`panel-ui.ts:204`, `:88` write them verbatim); without the shrink+ellipsis the row would push past the panel edge, and `flex-wrap` lets the build id drop to its own line at 240px instead of squeezing the name to nothing |
| 7 | Sync prompt | `.sync-prompt` `:348-382`, markup `:641-647` | Active-row card: `background: var(--fga-row-active); border-radius: var(--fga-radius); box-shadow: inset 2px 0 0 var(--fga-accent);` + dotted rule above (replacing the two 2px rules at `:354-355`). **Wraps**: `flex-wrap: wrap` on `.sync-prompt` and `.sync-actions`, `min-width: 0` on `.sync-msg` — at 240px the two buttons drop onto their own line instead of squeezing the message to nothing. `Sync now` = button on `--fga-surface` with `--fga-text` + `--fga-border-control` outline; `Later` = underlined inline link (§5) |
| 8 | Onboarding | `.onboarding` `:402-416`, markup `:650-656` | Card: `background: var(--fga-surface); border: 1px solid var(--fga-border); border-radius: var(--fga-radius);` and the 6px burnt-orange left border (`:406`) → `box-shadow: inset 2px 0 0 var(--fga-accent);`; `code` chip (`:418-424`) → `background: var(--fga-surface); color: var(--fga-text); border: 1px solid var(--fga-border); border-radius: var(--fga-radius-sm);` — no more inverted ink block |
| 9 | Hint | `.hint` `:531-538` | `--fga-text-muted`, dotted rule above, keeps `:empty{display:none}` |
| 10 | Section labels | `.section-label` `:427-435` | `--fga-label`, `--font-size-3xs`, sentence case, letter-spacing `0.04em` (drops `0.08em` uppercase mono) |

### §3.6 detail — the footer status-dot mirror (no JS change)

The brief's footer identity row wants a status dot. `panel-ui.ts` writes the tone onto
`#fga-dot` only (`:153`), and adding a second write target would be a behaviour change this phase
forbids. Mirror it in CSS instead:

```css
.identity-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--fga-tone-muted); }
.panel:has(#fga-dot[data-tone="success"]) .identity-dot { background: var(--fga-tone-success); }
.panel:has(#fga-dot[data-tone="warning"]) .identity-dot { background: var(--fga-tone-warning); }
.panel:has(#fga-dot[data-tone="info"])    .identity-dot { background: var(--fga-tone-info); }
```
`:has()` degrades to the muted default if the host Chromium is too old — a wrong-but-quiet dot, never
a broken panel. Flagged in §9 as a deviation candidate if the duel wants the dot to be authoritative.

## §4 — dotted dividers (the reference's strongest signature)

Each 2px ink rule becomes a dotted hairline **on the same edge it is on today** — converting them all
to `border-top` would move the masthead's rule above the first section and delete the
masthead↔status separation:

| Element | Current | Becomes |
|---|---|---|
| `.app-header` `:275` | `border-bottom: 2px solid var(--color-foreground)` | `border-bottom: 1px dotted var(--fga-divider)` |
| `.sync-prompt` `:354-355` | `border-top` **and** `border-bottom` | `border-top: 1px dotted var(--fga-divider)` only (the card's own radius closes the bottom) |
| `.onboarding` `:405` · `.activity` `:441` · `.hint` `:534` · `.conn-details` `:542` · `.footer-row` `:564` | `border-top: 2px solid var(--color-foreground)` | `border-top: 1px dotted var(--fga-divider)` |
| `.footer-cell` `:587`, `:598` | `border-right: 2px solid …` | **deleted** (the action row is inline links with gaps, not a divided strip) |
with `padding-block: var(--fga-divider-gap)` on the sections either side so the rule breathes (the
reference's section spacing is wide). The footer-cell vertical separators (`:587`) are **deleted** —
the action row becomes inline links with gaps, not a divided cell strip.

Compact budget check at the OPENING size (300×170): masthead (~28px) + status card (~56px) +
identity row (~22px) + action row (~24px) + 3 dotted rules ≈ 134px < 170px. Below that height the
panel scrolls (the sticky header stays); above it the footer's `margin-top: auto` keeps the stack
closed. Expanded adds the cards inside `#fga-expanded`.

## §4b — the responsiveness rules (direction §6, locked)

Applied everywhere, not just where it looks tight:

```css
/* Nothing may exceed the panel, ever. */
*, *::before, *::after { box-sizing: border-box; }
img, svg { max-width: 100%; }

/* The shrink chain must be UNBROKEN from the shell down: one flex/grid item anywhere on the path
   that keeps its intrinsic width pushes the row past the panel edge. overflow-x:hidden would then
   merely HIDE the overflow — A5a still measures scrollWidth > clientWidth and fails. */
.panel > *, #fga-expanded, #fga-expanded > * { min-width: 0; max-width: 100%; }
.status-row > *, .identity-row > *, .footer-actions > *, .sync-prompt > *,
.log-body, .log-body > *, .detail-cell, .detail-cell > *, .activity-row > * { min-width: 0; }

/* Truncation: the trio is a set — ellipsis without the other two does nothing. */
.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Long unbroken strings (a pasted node id, a URL in a result line) wrap instead of overflowing. */
.status-sentence, .hint, .onboarding-list { overflow-wrap: anywhere; }
```

Hard rules for the implementer:
- **No `width:`/`min-width:` in px on any row, cell, input, or button.** The only px sizes allowed
  are decorative squares ≤ 16px (`.status-dot`, `.log-dot`, `.footer-icon`) — these are whitelisted
  by name in the linter (§7).
- **`min-width: 0` on every flex/grid text child**, and `.truncate` (or the trio inline) on every
  value that can be arbitrarily long: `#fga-d-file`, `#fga-d-page`, `.log-label`, `.log-meta`,
  `.brand-title`, `.status-pill`.
- **`title` next to every truncation**, and the title must contain the *truncated text*:
  - `.log-label` already does (`panel-ui.ts:124`).
  - `.log-meta`'s title is the **timestamp**, not its own text (`:131`) — so a truncated outcome
    line ("node not found · …") is unrecoverable. Change it to
    `m.title = `${activityMeta(r, now)} · ${formatTimestamp(r.at)}`` — the visible text first, the
    timestamp it used to carry kept after it.
  - `renderDetails` (`:84-89`) adds `dFile.title = sceneFile || ''` and
    `dPage.title = scenePage || ''`.
  These three lines are the whole permitted `panel-ui.ts` edit (spec constraint): no state, no
  branch, no event — a truncated value with no tooltip hides the information the panel exists to show.
- **Every button/link row wraps** (`flex-wrap: wrap`): `.sync-actions`, `.footer-actions`,
  `.identity-row`.
- **No media query, no breakpoint.** Fluid sizing only (`auto-fit` + `minmax`, `flex-wrap`, `%`,
  `fr`), so there is no width at which the layout "switches" and can therefore break between the
  five sampled widths.
- **One scroller, not two.** Delete `.activity-list`'s `max-height: 168px; overflow-y: auto`
  (`panel.html:451-452`): with `.panel` scrolling, the cap creates a nested scroll area that traps
  the wheel and contradicts "the panel scrolls". The feed is already capped in *rows*
  (`ACTIVITY_ROWS = 20`, `panel-ui.ts:93`), which is the honest limit.

## §5 — underlined inline links

`Docs` (`#fga-docs`, `:689`), `Later` (`#fga-sync-later`, `:645`), and the `Details` toggle
(`#fga-toggle`, `:681`) render as the reference's "Change photo" affordance:

```css
.inline-link {
  background: none; border: none; padding: 0;
  font: inherit; font-size: var(--font-size-3xs);
  color: var(--fga-text-muted);
  text-decoration: underline; text-underline-offset: 2px;
  cursor: pointer;
}
.inline-link:hover { color: var(--fga-text); }
.inline-link:focus-visible { outline: 1px solid var(--fga-accent); outline-offset: 2px; }
```
`Copy` (`#fga-copy`) stays a small button on `--fga-surface` (it has a state — "Copied" —
so it is not a link). Keep the Phosphor caret SVG inside `#fga-toggle` (`:685-687`) — it is the one
icon family in the file (taste-lint's `mixed-icon-families` errors on two) — and **rewrite its
rotation selector**, which is currently keyed to the class being deleted:

```css
/* was: .footer-cell[aria-expanded="true"] .footer-icon  (panel.html:597) */
#fga-toggle[aria-expanded="true"] .footer-icon { transform: rotate(180deg); }
```
Keeping the old selector silently kills the caret rotation — the only visual signal that the
expanded zone is open.

**No `Retry` control exists in the panel today** (`panel-ui.ts` has no retry handler; reconnect is
automatic in `ui-relay.ts`). The brief lists Retry among the inline-link examples — treated as a
*style* example, not a request for a new control. Adding one would be a behaviour change; flagged in
§9.

## §6 — what gets deleted vs kept

**Deleted** (Swiss-Monolith artifacts): all `2px solid var(--color-foreground)` band rules; hover
inversion (`:380-382`, `:599`); `text-transform: uppercase` + tracking on masthead/pill/meta/section
labels/footer/`dt` (`:282-283`, `:292-293`, `:335-336`, `:363`, `:391-392`, `:432-433`, `:554-555`,
`:580-581`); the filled tone-block pill (`:341-344`); the 6px left accent (`:406`); the inverted
`code` chip (`:422-423`); footer cell borders (`:587`, `:598`).

**Kept verbatim** (deleting any of these breaks the gate or the behaviour): the compiled `:root`
(`:21-214`) **and** its provenance comment (`:7-20` — the gate asserts `brand/design`,
`ui tokens compile`, `kinetic-swiss-punk`); the font-override `:root` (`:216-234`); `* { box-sizing }`
(`:243`); `html, body { height: 100% }` (`:247`); every `:empty{display:none}` and `[hidden]` rule;
`font-variant-numeric: tabular-nums`; the ellipsis trio on `.log-label`/`.log-meta`
(`:507-509`, `:517-519`) and `min-width: 0` on `.log-body` (`:499`); both `@keyframes`
(`:604-614`); the `prefers-reduced-motion` block (`:616-620`) — **extend it** with any new
transition; `aria-live`, `aria-label`, `aria-expanded`, `aria-controls`, `aria-hidden` attributes;
the `<h1>`→`<h2>` heading order (a11y-lint `heading-hierarchy`); `target="_blank" rel="noopener"`
on the docs link.

## §7 — gate extension (emitter + linter pairing, same commit)

Add to `tests/figma-plugin-panel.test.ts` (repo root), next to the existing token block at `:54-79`:

Both blocks share one helper — **comments must be stripped before any selector/declaration scan**,
or a sentence like `/* …the ~300px panel… */` or a comment above `.status-dot` poisons the match:

```ts
/** The chrome, with :root blocks and CSS comments removed — the only safe scan surface. */
const chrome = html
  .replace(/:root\s*\{[\s\S]*?\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "");
/** [selectorList, declarations] for every rule in the chrome. */
const rules: [string, string][] = [...chrome.matchAll(/([^{}]+)\{([^}]*)\}/g)]
  .map((m) => [m[1].trim(), m[2]]);
/** The declarations of the first rule whose selector list contains `sel`. */
const declsFor = (sel: string): string =>
  rules.filter(([s]) => s.split(",").some((one) => one.trim() === sel)).map(([, d]) => d).join(";");
```

```ts
describe("figma-agent panel — the dark skin layer", () => {
  // The skin is only real if it is (a) declared in a :root block, (b) the LAST such block, and
  // (c) actually what the chrome paints with. String-presence alone passes for a dead token.
  const rootBlocks = [...html.matchAll(/:root\s*\{([\s\S]*?)\}/g)].map((m) => m[1]);

  it("declares the skin tokens inside the LAST :root block", () => {
    const last = rootBlocks.at(-1) ?? "";
    for (const t of ["--fga-body", "--fga-surface", "--fga-divider", "--fga-text", "--fga-radius"]) {
      expect(last, `${t} must be declared in the final :root block`).toContain(t);
    }
    // …and that block must come after the compiled DS block, so it wins the cascade.
    expect(html.lastIndexOf("--fga-body")).toBeGreaterThan(html.indexOf("--color-primary"));
  });

  it("has no dead skin tokens, and no reference to a token that was never declared", () => {
    const declared = [...(rootBlocks.at(-1) ?? "").matchAll(/(--fga-[a-z0-9-]+)\s*:/g)].map((m) => m[1]);
    expect(declared.length, "skin tokens declared").toBeGreaterThan(8);
    const unused = declared.filter((t) => !chrome.includes(`var(${t})`));
    expect(unused, `unused skin tokens: ${unused.join(", ")}`).toEqual([]);
    // The mirror check: a var(--fga-…) the block never declares is an invalid declaration the
    // browser drops silently (this is how --fga-surface-raised nearly shipped).
    const referenced = [...chrome.matchAll(/var\((--fga-[a-z0-9-]+)/g)].map((m) => m[1]);
    const undeclared = [...new Set(referenced)].filter((t) => !declared.includes(t));
    expect(undeclared, `undeclared tokens referenced: ${undeclared.join(", ")}`).toEqual([]);
  });

  it("uses the reference's dotted section rule and drops the 2px ink rules", () => {
    expect(chrome).toMatch(/border-(top|bottom):\s*1px\s+dotted\s+var\(--fga-divider\)/);
    expect(html).not.toContain("2px solid var(--color-foreground)");
  });

  it("paints the chrome only through vars (no hex, no bare custom-property values)", () => {
    expect(chrome).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);            // mirrors the existing rule
    expect(chrome).toContain("var(--fga-surface)");
    // A declaration like `border: 1px solid --fga-border` is silently dropped by the browser;
    // every --fga-* reference outside :root must be wrapped in var().
    expect(chrome.match(/(?<!var\()--fga-[a-z0-9-]+(?!\s*:)/g) ?? []).toEqual([]);
  });
});
```
(Note the hex assertion now runs on the comment-stripped `chrome`, so the sampling coordinates in the
`:root` provenance comment cannot trip it.)
And the responsive check the direction requires in the same phase (emitter + linter pairing):

```ts
describe("figma-agent panel — responsive contract (240px → 640px+)", () => {
  // Decorative squares are the ONLY fixed sizes allowed. Matched per INDIVIDUAL selector, after
  // comment stripping — a comment above a rule used to end up inside the "selector".
  const SIZE_WHITELIST = ["\.status-dot", "\.log-dot", "\.footer-icon", "\.identity-dot"];
  const whitelisted = (selList: string): boolean =>
    selList.split(",").every((s) => SIZE_WHITELIST.some((w) => new RegExp(w).test(s)));
  // width | min-width | inline-size | min-inline-size | flex-basis, in px — however it is spelled.
  const FIXED = /(?:^|;|\s)(?:min-)?(?:width|inline-size)\s*:\s*(?:calc\()?\s*\d+px|flex-basis\s*:\s*\d+px/;

  it("declares no fixed width on any layout element", () => {
    const offenders = rules
      .filter(([sel, decls]) => FIXED.test(decls) && !whitelisted(sel))
      .map(([sel]) => sel);
    expect(offenders, `fixed widths outside the whitelist: ${offenders.join(" | ")}`).toEqual([]);
  });

  it("scrolls vertically on the panel and never horizontally", () => {
    // Selector-scoped: "somewhere in the file" would pass with the rule on an unrelated element.
    expect(declsFor(".panel")).toMatch(/overflow-y:\s*auto/);
    expect(declsFor(".panel")).toMatch(/overflow-x:\s*hidden/);
    expect(declsFor(".panel")).not.toMatch(FIXED);
  });

  it("keeps the STATUS HEADER sticky", () => {
    expect(declsFor(".status-hero")).toMatch(/position:\s*sticky/);
    expect(declsFor(".status-hero")).toMatch(/top:\s*0/);
  });

  it("sizes the DETAIL GRID fluidly — no fixed column track", () => {
    const g = declsFor(".detail-grid");
    expect(g).toMatch(/grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(\s*\d+px\s*,\s*1fr\s*\)/);
  });

  it("wraps every button/link row", () => {
    for (const sel of [".sync-actions", ".footer-actions", ".identity-row"]) {
      expect(declsFor(sel), `${sel} must wrap`).toMatch(/flex-wrap:\s*wrap/);
    }
  });

  it("pairs every ellipsis with its overflow + white-space guards", () => {
    const bad = rules
      .filter(([, d]) => /text-overflow:\s*ellipsis/.test(d)
        && !(/overflow:\s*hidden/.test(d) && /white-space:\s*nowrap/.test(d)))
      .map(([sel]) => sel);
    expect(bad, `ellipsis without overflow:hidden + white-space:nowrap: ${bad.join(" | ")}`).toEqual([]);
  });

  it("uses no width breakpoint — the layout is fluid across the whole range", () => {
    expect(chrome).not.toMatch(/@media[^{]*\(\s*(?:min|max)-width/);
  });
});
```
The `300px` string ban is **dropped**: it false-fails on any comment or a legitimate
`max-height: 300px`. The `FIXED` regex above already rejects a hard-coded panel width wherever it is
spelled, and `.panel` is additionally asserted to carry no width at all.

The existing four-linter block and every current assertion stay untouched — this only adds.

## §8 — state → class map, and how to force each state

Every state the panel can be in, its source of truth, the class/attribute the skin must style, and
how to reproduce it for the screenshot pass (A5).

| # | State | Source | Skin hook | How to force |
|---|---|---|---|---|
| 1 | connected | `panel-model.ts:26`, `panel-ui.ts:153-156` | `#fga-dot[data-tone=success]`, `#fga-pill[data-tone=success]` | broker up + panel open: `node cli/dist/figma-agent.js status` |
| 2 | probing (pulsing) | `:27` (`pulse:true`) | `.is-pulsing` + `@keyframes fga-ping` | kill the daemon: `pkill -f "figma-agent.js __broker"` |
| 3 | handshake | `:28` | `[data-tone=info]` | **not forceable** (sub-second window between socket open and `PLUGIN_HELLO`) — verify by toggling the attribute in devtools, note it in the report |
| 4 | disconnected | `:29` | `[data-tone=muted]` | kill the broker and leave it down |
| 5 | meta: connected uptime | `panel-ui.ts:72-74` | `.status-meta` | state 1, wait ~10s |
| 6 | meta: probing attempt | `:75-77` | `.status-meta` | state 2 |
| 7 | meta: compact disconnected override | `panel-model.ts:132-134` | `.status-meta` in `[data-mode=compact]` | state 4 in compact |
| 8 | onboarding shown | `:75-77`, `panel-ui.ts:159` | `#fga-onboarding` (not `[hidden]`) | close the plugin, kill the broker, reopen the plugin (first run: `hadConnection=false`) — must be in expanded mode to see it |
| 9 | hint: broker missing ≥10s | `panel-model.ts:61-63` | `.hint` | state 2, wait 10s |
| 10 | hint: connection lost | `:64-66` | `.hint` | connect once, then kill the broker |
| 11 | activity: empty | markup `:661` | `.activity-empty` | fresh panel, no commands |
| 12 | activity: running | `panel-ui.ts:114-119` | `.log-dot[data-pending=true]` + `fga-breathe` | long script: `exec-js` with the await-yield loop (`while (Date.now()-t0 < 20000) await figma.getNodeByIdAsync('0:0')`) |
| 13 | activity: ok | `:116` | `.log-dot[data-ok=true][data-pending=false]` | `echo 'return 1' \| node cli/dist/figma-agent.js exec-js -` |
| 14 | activity: failed | `:118-119`, `:523` | `.log-dot[data-ok=false]`, `.log-meta[data-ok=false]` | `echo 'throw new Error("x")' \| node cli/dist/figma-agent.js exec-js -` |
| 15 | activity: newest vs stale | `:110`, `:144` | `.activity-row:not(.is-stale)` (active row + accent) vs `.is-stale` | run two commands |
| 16 | sync prompt: N changes ready | `panel-ui.ts:197-201` | `#fga-sync` visible | start the broker with `FIGMA_AGENT_IDLE_MS=2000` (`shared/protocol.ts` idle-window override), edit a component on canvas, wait ~2s |
| 17 | sync: syncing | `:220` | `#fga-sync-msg` | click **Sync now** |
| 18 | sync: ok / failed / nothing-synced | `panel-model.ts:119-123` | `#fga-sync-msg` | let the reconcile finish (all three copies come from `syncResultLabel`) |
| 19 | compact vs expanded | `panel-ui.ts:297-309` | `.panel[data-mode]`, `#fga-toggle[aria-expanded]` | click **Details** |
| 20 | copy idle / copied | `:285-290` | `#fga-copy` | click **Copy** |
| 21 | details values empty (`—`) | `panel-ui.ts:84-89` | `.detail-grid dd` | expand before any connection |
| 22 | long file name / page | `panel-ui.ts:88-89`, `:204-205` | `.identity-file.truncate` + `title` | open the plugin in a file renamed to ~80 chars |
| 23 | long activity label | `activity-feed.ts` label | `.log-label.truncate` + `title` | `exec-js` a script from a long path (the label carries the file arg) |

### Width matrix (direction §6 — 5 widths × the main states)

`figma.ui.resize` runs on the plugin MAIN thread, which is where `exec-js` executes, so widths are
driven from the CLI with no UI interaction:

```bash
cd /Users/jang/orca/workspaces/ease-design/opah/figma-agent
for w in 240 280 320 480 640; do
  node cli/dist/figma-agent.js exec-js - <<< "figma.ui.resize($w, 460); return $w"
  read -p "screenshot ${w}px, then press enter"
done
# height extremes
node cli/dist/figma-agent.js exec-js - <<< 'figma.ui.resize(240, 240); return "short"'   # must scroll, header sticks
node cli/dist/figma-agent.js exec-js - <<< 'figma.ui.resize(240, 900); return "tall"'    # footer must stay at the bottom
```

| Width | Expected layout |
|---|---|
| 240 | detail grid collapses to ONE column; sync buttons wrap to their own line; file name ellipsised; still no h-scroll |
| 280 | one column, tighter; identity row still on one line |
| 320 | two detail columns appear (`minmax(120px,1fr)` + gap) |
| 480 | two–three columns, feed rows breathe, no stretched-out labels |
| 640 | three+ columns; content stays left-aligned and legible (no 600px line lengths) |

**Width-preserving resize is IN SCOPE** (Fable ruling) — full design in §10. Once it lands, the
width no longer resets on a Details click, so the matrix above can be shot in any order.

## §9 — deviations from the brief's signature list (flagged, not decided)

1. **Footer identity dot** is a CSS `:has()` mirror of `#fga-dot`, not an independently-written dot —
   a second write target would be a `panel-ui.ts` behaviour change (§3.6).
2. **Retry** has no control in this panel (reconnect is automatic); the underlined-link treatment is
   applied to `Docs` / `Later` / `Details` instead (§5).
3. **Status tone hues** are not present in the reference (a settings modal has no connection state).
   `success` adopts the reference's own identity-dot green `#52AC6D` (sampled); warning/info/danger
   are proposed, AA-verified on all three backgrounds, and re-checked first in the duel.
4. **Masthead version moves to the footer identity row**, per the brief's identity-row signature —
   `spec.md` unresolved #3 asks the owner to confirm rather than assume.
5. **Middle-truncation** of the footer identity (brief §6: "footer identity truncate giữa") is not
   expressible in CSS — `text-overflow: ellipsis` truncates at the end, `direction: rtl` at the
   start, and a true middle-ellipsis needs a JS string transform, i.e. a behaviour change. Shipped as
   end-ellipsis + `title`; flagged for the owner.
6. **`title` tooltips on file/page** require two `.title =` lines in `renderDetails`
   (`panel-ui.ts:84-89`). Direction §6 mandates the tooltip, so the edit is specified — it is the one
   `panel-ui.ts` change in this phase and adds no state, branch, or event.
7. **Two-tier surfaces are inverted vs the first draft**: the reference's content pane is *darker*
   than its nav tier (`#171717` vs `#262626`, sampled). The panel follows the reference, not the
   draft's assumption.

## §10 — width-preserving resize (the one sanctioned behaviour change)

Ruled in by the lead: the snap-to-300 on every Details click violates the locked "perfectly
responsive" prerequisite. Two anchors change, nothing else.

**Anchor A — `plugin/src/ui/panel-ui.ts:307`** (inside the existing toggle handler; no new listener):
```ts
  // Carry the iframe's live width so a user-dragged size survives the toggle. Field name stays
  // `h` — main.ts reads `chrome.h`, and renaming it would silently fall back to the compact height.
  parent.postMessage({ pluginMessage: {
    type: 'PANEL_RESIZE', h: PANEL_HEIGHT[mode], w: window.innerWidth,
  } }, '*');
```

**Anchor B — `plugin/src/main/main.ts:193-197`** (the current handler; note the line numbers moved
from the pre-exec-harness file — re-verify before editing):
```ts
  if (chrome && chrome.type === 'PANEL_RESIZE') {
    const { width, height } = resolvePanelSize(chrome.w, chrome.h);
    figma.ui.resize(width, height);
    return;
  }
```

**The clamp becomes a pure, unit-testable helper** — new in `panel-model.ts`, beside the other pure
view-model functions (that file's whole convention: "every branch here is unit-tested",
`panel-model.ts:1-5`). No existing test covers the `PANEL_RESIZE` message shape
(`tests/panel-model.test.ts:80-87` only asserts the constants), so the behaviour change would
otherwise ship unverified:

```ts
/**
 * Resolve the iframe size for a PANEL_RESIZE. Width follows whatever the panel currently is, so a
 * user-dragged width survives a Details toggle; PANEL_WIDTH is the fallback and the opening size.
 * Height stays clamped to the mode range — a malformed message must never blow up the panel.
 */
export function resolvePanelSize(w: unknown, h: unknown): { width: number; height: number } {
  const width = typeof w === 'number' && Number.isFinite(w) && w > 0 ? Math.round(w) : PANEL_WIDTH;
  const raw = typeof h === 'number' && Number.isFinite(h) ? h : PANEL_HEIGHT.compact;
  const height = Math.round(Math.min(PANEL_HEIGHT.expanded, Math.max(PANEL_HEIGHT.compact, raw)));
  return { width, height };
}
```

**Tests** — add to `figma-agent/tests/panel-model.test.ts` (workspace suite, not the root gate):
- `resolvePanelSize(520, 460)` → `{width: 520, height: 460}` (dragged width preserved);
- `resolvePanelSize(undefined, 460)` → `{width: 300, …}` and `resolvePanelSize(0, …)` /
  `resolvePanelSize(NaN, …)` / `resolvePanelSize("520", …)` → `PANEL_WIDTH` (fallback intact);
- height clamp unchanged: `resolvePanelSize(300, 9999)` → `460`, `resolvePanelSize(300, 10)` → `170`,
  `resolvePanelSize(300, undefined)` → `170`.

Out of bounds for this change: no persistence of the width, no new message type, no resize on any
event other than the existing toggle click.

## Validation

```bash
cd /Users/jang/orca/workspaces/ease-design/opah
npx vitest run tests/figma-plugin-panel.test.ts        # 4 linters + structure + the new skin block
cd figma-agent && npm run typecheck && npm run build && npm test
node -e "const h=require('fs').readFileSync('plugin/ui.html','utf8');console.log(h.includes('--fga-surface')?'skin inlined':'MARKER MISS')"
```
Then, in Figma: reload the plugin (close + reopen once after the build — a stale `code.js`/`ui.html`
has been served on a first reload before), and walk §8 rows 1–21, screenshotting each forceable state
in both compact and expanded where the state exists in both. File the screenshots plus a one-line
observation each in `plans/reports/`. Any state you could not force gets recorded as `not-forceable`
with the reason — an unseen state is not a passed state.

Then the **critique-rubric pass** the direction requires (brief §6: four linters = the correctness
gate, critique-rubric = the excellence gate, in that order). Correctness is a pass/fail entry ticket
and earns no points; the rubric verdict is scored by a **fresh judge given only the screenshots +
the brief's signature list** — never the build transcript (`DECISIONS.md` judge-separation rule).
The reference duel (spec A6) is **in scope**: `references/Reference.png` exists, so the judge duels
the screenshots against the image on the signature list. A clear loss on ≥2 signatures fails the
pass (`DECISIONS.md` duel rule); losses become corrections here, not excuses.

Finally: `git add figma-agent/plugin/src/ui/panel.html figma-agent/plugin/ui.html
tests/figma-plugin-panel.test.ts` — the built artifact is tracked and is what Figma loads.

## Risk & rollback

| Risk | L×I | Mitigation | Detect |
|---|---|---|---|
| A deleted element breaks an `el()` lookup → the panel throws and renders nothing | M×H | §1 id inventory (23 JS-read + `fga-docs`); grep every id after the edit | the panel is blank on reload |
| `plugin/ui.html` not rebuilt/committed → a clean checkout ships the OLD panel | M×H | the built artifact is tracked and is in the commit list (header + validation) | `git status` clean but Figma shows the old skin |
| An invalid declaration (`solid --fga-border`, bare `inset …`) is dropped by the browser while the regex gate stays green | M×H | every value wrapped in `var()`; gate assertion #4 fails on a bare `--fga-*` outside `:root` | screenshot pass: missing border/accent |
| Tone-on-surface pair fails WCAG (no linter measures contrast) | M×H | the contrast one-liner in §2 is run before screenshots; `--fga-tone-muted` already raised to #8B8B93 | manual check |
| An unbounded file name wraps the identity row and blows the 170px compact budget | M×M | `min-width: 0` + ellipsis on `.identity-file` (§3 row 6) | screenshot with a long-named file |
| The caret stops rotating because its selector referenced the deleted `.footer-cell` | M×M | selector rewritten to `#fga-toggle[aria-expanded="true"]` (§5) | screenshot compact→expanded |
| Dark surfaces trip taste-lint `mode-invisible-surface` (error) | M×H | solid token hexes only, no `rgba()` tints | gate run |
| A new literal `font-size` trips `tiny-body-text` / `font-scale-sprawl` (errors) | M×H | reuse existing size vars only | gate run |
| New transitions escape the reduced-motion block | M×M | extend `@media (prefers-reduced-motion: reduce)` in the same edit; taste-lint's `animation-no-reduced-motion` is an error | gate run |
| Compact overflows 170px after the dotted-rule padding | M×M | §4 budget check; the panel scrolls rather than clipping | screenshot pass |
| Horizontal scroll at a narrow width (the classic: a flex child that will not shrink) | M×H | `overflow-x: hidden` on the scroller + `min-width: 0` on every text child + the linter's fixed-width ban | A5a `scrollWidth <= clientWidth` at all five widths |
| The sticky header's `z-index` trips taste-lint (`z-index-inflation` / `z-index-off-ladder`) | L×M | `z-index: 10` — on the base-10 ladder, not all-nines | gate run |
| A future edit adds a fixed width and nobody notices | M×M | the responsive linter block fails the build | gate run |
| `:has()` unsupported in the host Chromium | L×L | dot falls back to muted — quiet, not broken | screenshot pass |
| The four `--fga-tone-*` connection hues are proposed, not sampled (the reference has no such state) | M×M | `success` uses the reference's own identity green; the other three are AA-verified on all three backgrounds and are the first thing the duel re-checks | duel (A6) |

Rollback: `git revert <sha> && npm run build`, reload the plugin. Nothing outside `panel.html` and the
gate test changes; no protocol, no state, no persisted data.
