---
title: "figma-agent panel — dark settings-modal skin"
description: "Reskin the plugin panel to the owner's dark reference (dotted dividers, label-over-value, active row accent, underlined inline links, footer identity) with zero behaviour change."
status: pending
priority: P2
effort: 5h
branch: jangtrinh/opah
tags: [figma-agent, panel, design-system, tokens, skin]
created: 2026-07-29
---

# Spec — plugin panel redesign (dark settings-modal language)

Venue: `/Users/jang/orca/workspaces/ease-design/opah/figma-agent`, branch `jangtrinh/opah`,
HEAD `42fd3a9` (phases 02/03 of the exec-harness wave landed at `075c8ad` / `5422d56`).
Direction (locked, do not relitigate): `direction-brief.md` in this folder.
Surface: `plugin/src/ui/panel.html` (704L) + `panel-model.ts` (134L) + `panel-ui.ts` (317L),
inlined at build time by `scripts/build.mjs:88-97`, gated by
`/Users/jang/orca/workspaces/ease-design/opah/tests/figma-plugin-panel.test.ts` (**repo root**, not
`figma-agent/tests` — the brief's path is off by one directory).

## Outcome

The panel reads as the owner's dark settings modal — dark body / raised rows, dotted section
dividers, label over value, active row with a left accent, underlined inline links, and a footer
identity row — **and it is fluid from 240px to 640px+ at any height**, while every state, event, and
DOM id keeps behaving exactly as today.

Two phases:

| Phase | File | Scope |
|---|---|---|
| 01 | `phase-01-panel-skin.md` | the skin: observed tokens, dotted dividers, label-over-value, active row, fluid 240→640px+, width-preserving resize |
| 02 | `phase-02-panel-ia.md` | IA v2 (owner review): 3 blocks + sync prompt, one font family, exactly three sizes, zero text glyphs, selection + peer awareness, activity sentences, debug controls cut |
| 03 | `phase-03-panel-polish.md` | craft floor to benchmark grade: 4px rhythm + one icon grid, alpha-hairline depth, per-size type micro-craft, 140ms motion, desaturated hues, focus/scrollbar/selection/hover/empty-state finish |

Phase 02 builds **on top of phase 01's working tree** (uncommitted at authoring time) and is a
separate commit.

Token values are no longer estimates: the reference at
`figma-agent/references/Reference.png` (1168×992) was **pixel-sampled**, so the `:root` block ships
observed values (provenance line in the phase §2 block).

## Constraints

- **Skin only, with two sanctioned exceptions.** No new/removed states, no new events, no new
  branches; every `el('fga-…')` lookup (`panel-ui.ts:32-54`) must still resolve or the panel throws
  on load. The exceptions, both required by direction §6 and both ruled in by the lead:
  1. `.title` set beside existing `.textContent` writes so a truncated value keeps its tooltip
     (`renderDetails`, `panel-ui.ts:84-89`; `.log-meta`, `:131`).
  2. **Width-preserving resize** — `PANEL_RESIZE` carries the iframe's live width and `main.ts`
     resizes to `(receivedWidth || PANEL_WIDTH, newHeight)`, so a user-dragged width survives the
     Details toggle. `PANEL_WIDTH` remains the fallback and the opening size. Phase 01 §10.
     **Superseded by phase 02**, which deletes the Details toggle — the only `PANEL_RESIZE`
     emitter — so nothing overrides a dragged width any more and the whole path is removed.
  Nothing else in panel behaviour changes **in phase 01**.
- **Phase 02 changes the IA, and that is sanctioned** (owner review, locked). It removes controls
  (Docs, Copy, Details toggle, the four debug cells), restructures to three blocks, and adds two
  *additive* behaviours: `selectionchange` fields on `FILE_INFO`, and a new `PEERS` event
  (`EventMsg` union + broker fan-out + relay forward). `PROTOCOL_VERSION` stays 1 — both are additive
  and ignorable by an older peer.
- **Owner-locked typography** (phase 02): ONE font family (`--font-family-body`), EXACTLY three
  tokenized sizes (`--fga-font-title|body|caption`), zero raw px `font-size`, and **no text-character
  glyphs** in markup or CSS `content:` — every mark is an inline Phosphor SVG, `aria-hidden`,
  `currentColor`.
- **Panel language is English** (lead ruling: toolchain consistency). A future Vietnamese pass is a
  string map over the pure sentence modules, not a rewrite.
- **Fluid, always** (direction §6, locked): 240px → 640px+ wide, any height; no horizontal scroll
  ever; no fixed pixel widths on rows/inputs; long `fileName`/`page`/activity strings ellipsise and
  carry a `title`; button rows wrap; the status header is sticky and overflow scrolls vertically.
  `PANEL_WIDTH = 300` (`panel-model.ts:87`) is the *opening* size, never a layout assumption.
- **The 4-linter gate stays green** (`tests/figma-plugin-panel.test.ts`): validate-layout, a11y-lint,
  taste-lint, content-lint, 0 errors — plus its structural assertions (doctype/lang/title, the
  compiled `:root` token block, provenance strings, no raw hex outside `:root`, ≥2 `aria-live`
  regions, `@keyframes` + `prefers-reduced-motion`, the `figma-agent status` onboarding line, a
  `target="_blank"` docs link).
- **Emitter + linter pairing** (repo hard-won rule): the new token convention **and** the new
  responsive rules each ship with the gate assertion that fails without them — same commit.
- The model still owns the *opening* geometry (`PANEL_HEIGHT = {compact:170, expanded:460}`,
  `panel-model.ts:88`); compact must still fit 170px tall at 300px wide, but nothing in the CSS may
  depend on either number.
- Self-contained: no webfont, no network, no external icon package (Phosphor paths stay inline).
- Reference DNA is **OBSERVED**: every surface/text/border/accent token is pixel-sampled from
  `figma-agent/references/Reference.png` (2026-07-29), with the sampling coordinate recorded beside
  each token in phase §2. Only the four `--fga-tone-*` connection hues remain **proposed** — a
  settings modal has no connection state to sample (the one exception: `success` adopts the
  reference's identity-dot green `#52AC6D`).
- **Contrast outranks fidelity** where they collide (`DECISIONS.md`: correctness is a gate, not a
  score). Two sampled values were adjusted, each with its delta recorded in phase §2: `text-muted`
  `#9A9A9A → #9B9B9B` (4.49 → 4.55 on the active row) and a second, lighter
  `--fga-border-strong: #646464` (3.03:1) for outlines that are an interactive control's only
  boundary, the sampled `#474747` (1.93:1) staying for decorative delineation.

## Non-goals

- No behaviour, state-machine, protocol, or relay change (`ui-relay.ts` untouched).
- No new panel features beyond the IA v2 rows the owner approved (no settings, no persistence, no
  auto-resize-to-content, no localization pass).
- No Swiss-Monolith brand rewrite elsewhere — this surface only, per the owner's reference decision.
- No `design-os reference` cache run — the tool cannot intake a raw PNG (owner's noted gap); the
  duel reads the file directly and **is** in scope (A6).
- No re-layout of the compact/expanded split, and no change to `PANEL_WIDTH`/`PANEL_HEIGHT`.

## Acceptance criteria

### A1 — gate green, unchanged commands
```bash
cd /Users/jang/orca/workspaces/ease-design/opah && npx vitest run tests/figma-plugin-panel.test.ts
cd figma-agent && npm run typecheck && npm run build && npm test
```
PASS = the 4-linter panel gate reports 0 errors on all four linters, the workspace suite stays green
(baseline 453+ tests / 46 suites), and `plugin/ui.html` is regenerated with the marker replaced.
**`plugin/ui.html` is a tracked artifact** (`git ls-files plugin/ui.html` → 1) and is what
`plugin/manifest.json:6` loads, so the commit contains three files: the panel source, the rebuilt
`ui.html`, and the gate test. A source-only commit ships the old panel from a clean checkout.

### A2 — every panel state is visually mapped
The phase file carries a state→class table; PASS = each row of it exists in the shipped CSS **and**
was seen on screen (A5) or is explicitly marked `not-forceable` with the reason. States enumerated
from source, not from memory: 4 connection states × their tone/pulse (`panel-model.ts:25-30`,
`panel-ui.ts:153-157`), meta-line variants (`panel-ui.ts:65-79`), onboarding shown/hidden
(`:159`), hint present/empty (`:160`), sync prompt idle/syncing/ok/failed/nothing-synced
(`:197-256`), activity row pending/ok/failed/stale/empty (`:108-146`), compact vs expanded
(`:297-309`), copy button idle/copied (`:285-290`).

### A3 — tokens are CSS custom properties, no loose hex
```bash
node -e "const h=require('fs').readFileSync('figma-agent/plugin/src/ui/panel.html','utf8');const s=h.replace(/:root\s*\{[\s\S]*?\}/g,'');const m=s.match(/#[0-9a-fA-F]{3,8}\b/g);console.log(m??'clean')"
```
PASS = `clean`. Every reference-DNA colour lives in a `:root` block and reaches the chrome through
`var(--fga-…)`; the gate's own `uses no raw hex outside the pasted :root blocks` assertion
(`tests/figma-plugin-panel.test.ts:74-78`) covers this in CI.

### A4 — skin + responsiveness are asserted, not just present (emitter + linter pairing)
PASS = `tests/figma-plugin-panel.test.ts` gains two blocks that fail if (a) the panel-skin `:root`
layer disappears or stops winning the cascade (mirroring the font-override assertion at `:68-72`),
or (b) a fixed pixel width, a bare ellipsis without its `overflow`/`white-space` guards, a missing
`overflow-x: hidden`, a missing sticky header, or a non-fluid grid appears. Exact assertions:
phase §7.

### A5 — screenshot matrix on the live plugin: 5 widths × the main states
Widths are driven programmatically — `figma.ui.resize` runs on the plugin MAIN thread, which is
exactly where `exec-js` executes:
```bash
for w in 240 280 320 480 640; do
  node cli/dist/figma-agent.js exec-js - <<< "figma.ui.resize($w, 460); return $w"
done
```
PASS = for each of **240 / 280 / 320 / 480 / 640** px × the main states (connected, disconnected +
onboarding, probing + hint, activity with a long label, sync prompt, expanded details, footer
identity with a long file name): a screenshot filed in `plans/reports/`, and in every one of them —
no horizontal scrollbar, no clipped glyph, no overlapping text, no row wider than the panel.
Height is tested by shrinking to 240×240 (content must scroll vertically with the status header
stuck) and growing to 240×900 (no stranded footer).

### A5b — a dragged width survives the Details toggle
1. Drag the plugin window wider than 300px (or `exec-js` → `figma.ui.resize(520, 460)`).
2. Click **Details** to expand, click again to collapse.
PASS = the panel is still ~520px wide after both clicks (before this change it snapped back to 300),
the height still moves between `PANEL_HEIGHT.compact` and `.expanded`, and the layout at that width
matches the A5 screenshot. Regression check: with a *fresh* plugin open (never dragged), the toggle
still produces exactly 300px — `PANEL_WIDTH` is the fallback.

### A5a — no-overflow gate (mechanical, per width)
At each width, with the panel focused, run:
```bash
node cli/dist/figma-agent.js exec-js - <<< 'return { note: "read the panel iframe, not the canvas" }'
```
…then read the value in the panel's own devtools console (Figma → Plugins → Development → Open
console): `document.documentElement.scrollWidth <= document.documentElement.clientWidth` must be
`true`, and `[...document.querySelectorAll("*")].filter(e => e.scrollWidth > e.clientWidth + 1)`
must contain only elements that are *meant* to ellipsise (they carry `text-overflow: ellipsis`).
PASS = both, at all five widths. Record the two numbers per width in the report.

### A5b — critique-rubric verdict (the excellence gate, after correctness)
Direction §6 orders the gates: four linters first (a pass/fail entry ticket worth zero points), then
the critique-rubric. PASS = a fresh judge, given only the A5 screenshots + the brief's signature
list (never the build transcript — `DECISIONS.md` judge separation), returns a verdict; duel
dimensions are marked N/A until A6 unblocks rather than scored blind.

### A6 — reference duel — NOW UNBLOCKED
`figma-agent/references/Reference.png` exists (274KB, 1168×992). The token values in phase §2 are
**pixel-sampled from it**, so the duel compares the A5 screenshots to the image on the signature
list: two-tier surfaces (body `#171717` / raised `#262626`), dotted dividers, label-over-value,
active row `#333333` + left accent bar, underlined inline links, footer identity row with a status
dot. PASS = no clear loss on ≥2 signatures (`DECISIONS.md` duel rule), judged by a fresh judge given
the image + screenshots only.
Note (owner's, not blocking): `design-os reference add` cannot intake a raw PNG (pixelshot takes
URL/HTML/PDF), so the file is not indexed — sampling was done directly.

### A7 — typography contract (phase 02)
PASS = in devtools, every element's computed `font-family` is identical, and computed `font-size`
takes **exactly three** distinct values; the gate's new block fails on any `font-size` that is not
one of the three tokens, on a second family, or on a glyph character in markup / CSS `content:`.

### A8 — IA v2 structure and honesty (phase 02)
PASS = the panel shows exactly three blocks + the sync prompt; the removed ids
(`fga-docs`, `fga-copy`, `fga-toggle`, `fga-expanded`, `fga-d-port|proto|heartbeat|attempts`) appear
nowhere; **Block 1 never shows an error code** — it names the problem and the next action; and with
two files open, exactly one panel says `command target`, matching `figma-agent status`'s
`activePlugin`.

### A9 — selection + activity sentences (phase 02)
PASS = clicking nodes updates the Selection row within a frame or two (no stutter while marquee-
dragging); the activity feed reads as English sentences with node names where the reply carried them
(`Created frame "Hero card"`), never a command name, and a failure names a reason
(`Colour bind failed — variable "brand/primary" does not exist`), never a code. Unit tests cover
every branch of `activity-sentence.ts` and `statusSentence`.

### A10 — preview + audit sequencing (phase 02)
PASS = `preview.html` regenerated in the same gallery format (6 states × 3 widths: 240/320/480)
reflecting IA v2, **and** the audit ran in the right order before the owner saw it: correctness gate
(4 linters + typecheck/build/test, 0 errors) → fresh-judge critique-rubric + duel against
`references/Reference.png` → owner. A preview handed over before the judge pass fails this criterion.

## Risk register

| Risk | L×I | Mitigation |
|---|---|---|
| Dark skin trips `taste-lint` (`mode-invisible-surface` = error on low-alpha same-mode tints) | M×H | surfaces are solid token hexes, never `rgba(255,255,255,.04)` |
| A new font size trips `tiny-body-text` (≤13px = error) or `font-scale-sprawl` (>10 = error) | M×H | reuse the existing `--font-size-*` vars; no new literal `font-size: Npx` in the chrome |
| A `--fga-*` value that the gate does not assert silently regresses | M×M | A4 pairs the convention with an assertion |
| Removing markup breaks a `panel-ui.ts` `el()` lookup → panel throws at load | M×H | id inventory in phase §3 is copied from `panel-ui.ts:30-54` and re-checked before commit |
| Dotted dividers read as noise at 300px | M×M | one divider weight, section spacing from the brief; judged in A5, corrected in the duel |
| Layout breaks at an untested width between the five sampled ones | M×H | fluid rules only (no breakpoint, no fixed width, `auto-fit`/`minmax` grid); the linter bans fixed widths so a regression cannot land quietly |
| The Details toggle resets width to `PANEL_WIDTH` (`main.ts:193-197` → `figma.ui.resize(PANEL_WIDTH,…)`), discarding a user-dragged width | H×M | **IN SCOPE (Fable ruling 2026-07-29 — the owner's "perfectly responsive" prerequisite covers it):** `PANEL_RESIZE` carries the iframe's live `window.innerWidth`; `main.ts:193-197` resizes to `(receivedWidth \|\| PANEL_WIDTH, newHeight)`. `PANEL_WIDTH` stays as fallback + initial size; nothing else in panel behaviour changes. Acceptance: drag wider → toggle Details → width unchanged |
| Middle-truncation of the footer identity is not achievable in CSS | M×L | end-ellipsis + `title` tooltip; middle-truncate would need a JS string transform (behaviour change) — deviation flagged in phase §9 |
| No linter measures contrast — a dark palette can ship failing pairs green | M×H | phase §2 contrast one-liner run before screenshots; text ≥4.5:1, indicators ≥3:1 |
| Invalid CSS (missing `var()`, bare `inset …`) is dropped by the browser while the regex gate passes | M×H | phase §3 spells every declaration in full; the new gate rejects a bare `--fga-*` outside `:root` |
| **P02** Owner's 13px/11px sizes vs taste-lint's `tiny-body-text` error at ≤13px | M×H | the rule fires on literal `font-size: Npx`, not on custom-property declarations consumed via `var()` (why today's 12/11px feed tokens pass); phase 02 adds the tokens FIRST and runs the gate before any other edit — a real collision is a doctrine call, not a workaround |
| **P02** Cutting the debug controls strands `panel-model.ts` exports (`togglePanelMode`, `compactMeta`, `PANEL_HEIGHT`'s two-mode shape) | M×M | phase 02 §2 lists every consumer and its edit, including phase-01's `resolvePanelSize` clamp; typecheck catches the remainder |
| **P02** `PEERS` marks the wrong panel as `command target` | L×H | the broker derives it from `selectTarget(currentFilter())` — the same call routing uses — and re-broadcasts on every registry change; verified against `figma-agent status`'s `activePlugin` |
| **P02** `selectionchange` fires on every click and floods the iframe | L×M | the handler posts five scalars with no scene traversal and no await; measured by marquee-dragging in validation |
| **P03** A low-alpha value lands on a `background` → taste-lint `mode-invisible-surface` (error) | M×H | depth is alpha **borders and inset hairlines only**; the gate bans alpha backgrounds outright, and the gate is run immediately after the depth edit |
| **P03** Desaturated status hues drop under the contrast floor | M×H | all 15 pairs recomputed before shipping; lighten stepwise and record the delta in the token comment (contrast outranks the aesthetic) |
| **P03** The vetoed left bar returns in a new spelling | L×H | the gate rejects `inset Npx 0 0`, `border-left`, and any surviving `--fga-accent` reference |
| **P03** The judge duels benchmarks from memory (no captures in-repo) | M×M | flagged: capture 2–3 Linear/Raycast/Vercel screenshots before the pass, or the duel measures recall rather than the artifact |
| **P02** An activity sentence states something the reply never carried | M×H | the mapper renders only fields present on the record; unknown tool → humanized stem; no invented node names |

### A11a — the inset-shadow veto survives phase 03 untouched
The left-bar veto assertion (`tests/figma-plugin-panel.test.ts:267-273`, blanket
`box-shadow: inset` ban) is **not narrowed**. Phase 03 achieves its top-edge highlight with
`border-top-color` instead, and adds an assertion that the highlight exists so it cannot silently
disappear. PASS = that assertion block is byte-identical to today, and `border-top-color:
var(--fga-topedge)` is present. Baselines to re-measure after the phase: repo-root gate **31/31**,
workspace **522/522** (a drop means an assertion was removed, not satisfied).

### A11 — craft floor, each rule paired with its own gate (phase 03)
PASS = the panel gate's new `craft floor` block is green, which mechanically proves: every
padding/gap/margin resolves to the 4px scale (the shared taste linter cannot see CSS declarations —
`taste-checks.ts:160-178` matches Tailwind utilities only, so this assertion is the enforcement);
one 14px icon grid; **no left accent bar in any spelling** (`inset Npx 0 0`, `border-left`, or a
surviving `--fga-accent` — owner veto); low-alpha white on borders/inset hairlines but **never on a
`background`** (taste-lint `mode-invisible-surface` is an error); a 2px offset `:focus-visible` ring
on both interactive controls; named transitions only (no `all`, no `linear`) with every animated
selector inside the `prefers-reduced-motion` guard; and tokenized tracking/line-height per size with
no raw `letter-spacing`.

### A12 — colour tuning holds the contrast floors (phase 03)
PASS = after the hues are desaturated, all 15 token×background pairs are recomputed and every text
token clears 4.5:1, every indicator 3:1, on `--fga-body` / `--fga-surface` / `--fga-row-active`. Any
value lightened to clear a floor carries its delta in the token comment, as in phase 01.

### A13 — benchmark-grade judge pass (phase 03)
A fresh judge — given the panel screenshots, `knowledge/taste-rubric.md`, and the three capture sets
below, and **never the build transcript** — scores the five excellence dimensions and duels.
**Every duel claim must cite a capture; nothing in the pass/fail may be scored from memory.**

| Target | Grade | Role |
|---|---|---|
| `figma-agent/references/Reference.png` | SOURCE | **primary** — layout signature: two-tier surfaces, dotted dividers, label-over-value, underlined inline links, footer identity |
| `figma-agent/references/linear.app.png.tiles/` (7 tiles) | SOURCE | craft language only — type rhythm, hairline borders, dark-surface treatment |
| `figma-agent/references/vercel.com.png.tiles/` (4 tiles) | SOURCE | craft language only — same three axes |

**Grade the medium mismatch explicitly.** Linear and Vercel are captured **marketing pages**, not
tool panels: their type scale, whitespace, and hero contrast are authored for a 1440px landing page,
not a 240–640px agent panel. The judge names, for each craft claim, whether it transfers (border
weight, neutral temperature, type rhythm, spacing discipline — these do) or does not (display sizes,
page-scale whitespace, hero treatments — these do not), and may not fail the panel for lacking a
property that only makes sense at page scale.

PASS = **≥90** on the five dimensions, a blind "reads as senior+ work" verdict, and no clear loss on
≥2 dimensions against the primary reference or the transferable craft axes. Losses become
corrections in this phase, not notes.

## Phase-02 rulings (lead, 2026-07-29 — all five closed)

1. **Three sizes vs the 14px linter floor** — proceed as specified; if taste-lint fires, the owner's
   3-size rule wins **for this surface** and the gate records a scoped exemption naming both rules.
   Reported either way; neither rule silently relaxed.
2. **Onboarding card: KEEP, restyled** — priority-1 content (problem + next action when disconnected).
3. **`PANEL_HEIGHT` → a single number**: accepted.
4. **Node names: IN SCOPE** — `CREATE_FRAME`/`CREATE_INSTANCE`/`SET_TEXT` results gain an additive
   `name` (`executor-ops.ts:108`, `:129`, `:194`, plus two return-type widenings), so activity
   sentences carry real names.
5. **Phase-01 §10 superseded by construction**: deleting the Details toggle removes the only
   `PANEL_RESIZE` emitter, so a dragged width persists with no code at all.

## Rollback

One commit touching `panel.html` (+ the gate test). `git revert <sha> && npm run build`, reload the
plugin. No data, no protocol, no persisted state involved.

## Unresolved questions

1. **Locked-direction ↔ repo-gate conflict (flagged, not resolved by me):** the gate asserts the
   panel embeds the compiled Swiss-Monolith DS block and its provenance —
   `"brand/design"`, `"ui tokens compile"`, `"kinetic-swiss-punk"`
   (`tests/figma-plugin-panel.test.ts:54-66`) — while direction §1 says the owner's reference wins
   over Swiss Monolith for this surface. The phase file implements the **layered** reading (keep the
   compiled block + provenance as the DS of record; add a panel-skin `:root` layer after it that
   wins the cascade, exactly as the existing font override already does at `panel.html:216-234` and
   is asserted at gate `:68-72`). If the owner wants the Swiss block *deleted*, that is a doctrine
   change to "the panel dogfoods our own DS" and needs Fable/owner sign-off plus a gate rewrite.
2. ~~Reference image path~~ — **RESOLVED**: `figma-agent/references/Reference.png`, pixel-sampled;
   DNA is observed, not estimated. Remaining judgement call: the reference has **no connection-status
   hues** (a settings modal has no such state) except the identity dot's green `#52AC6D`, which is
   adopted for `success`; warning/info/danger/muted stay **proposed** (AA-verified on all three
   backgrounds, re-checked first in the duel).
4. ~~Details toggle vs a user-dragged width~~ — **RESOLVED (Fable ruling 2026-07-29): IN SCOPE.**
   The owner's locked "perfectly responsive" prerequisite covers it. Minimal design, nothing else
   changes: `panel-ui.ts:307` includes the iframe's live `window.innerWidth` in the `PANEL_RESIZE`
   message; `main.ts:193-197` calls `figma.ui.resize(receivedWidth || PANEL_WIDTH, newHeight)`.
   `PANEL_WIDTH` remains the fallback and the initial mount size. Acceptance check: drag-resize
   wider → toggle Details → width unchanged.
3. Does the footer identity row replace the masthead version line, or coexist? The brief lists both a
   footer identity row (dot + fileName + `v0.1.0 · <sha7>`) and the panel already shows the build id
   in the masthead (`panel.html:627`, written by `panel-ui.ts:311`). Phase file proposes moving it to
   the footer and dropping the masthead version; confirm.
