# Canvas UI reference ledger

**Canonical location.** This directory — `knowledge/canvas-ui/` — is the single canonical
Canvas UI roster: tracked in this repository and packaged in the npm tarball (`knowledge` is
one of `package.json.files`'s four entries). It replaces the pre-reopen draft that was written
under the gitignored `references` symlink's `canvas-ui/` subdirectory, which points into the
private `design-os-hq` corpus (`.gitignore:66-69`) — that location was never in the repository
at all, so a clean clone or CI checkout never had it. See
`docs/research/canvas-ui/FABLE-VERDICT-reopen-260725.md` for the full correction record. The
private mirror — `../design-os-hq/corpus/references/`'s `canvas-ui/` subdirectory — is **not
deleted** (owner decision) but is a **non-canonical legacy mirror**: outside this repo, outside
every public gate, read by nothing tracked, and not maintained. If it ever disagrees with this
ledger, this ledger is right by definition.

**No upstream source is stored here.** This directory holds names, slugs, family membership,
the derived `overlayFallback` mode flag, and provenance — never API tables, parameter lists,
code, or upstream prose beyond the display name (B2).

## Provenance

- **Upstream:** https://github.com/DavidHDev/canvas-ui
- **Pinned revision:** `728550d4523e1b8bef834b64b3e936c215cad630`
- **Captured:** 2026-07 (`202607`)
- **License:** MIT + Commons Clause — permits use of the copied source *inside* a destination
  application; prohibits selling, sublicensing, or redistributing the components themselves as
  a product. This ledger ships 25 upstream **display names** (nominative use, no upstream
  expression, no code) — that is a stated consideration for the owner's license call
  (spec 028 §12.1), not a rule this ledger enforces.
- **Roster count:** 25 effects — 22 `live-html` + 3 `object`. Confirmed at the pinned revision;
  matches `docs/research/canvas-ui/integration-brief.md`.

## `family` derivation (mechanical, reproducible)

`family` ∈ `"live-html" | "object"` — a two-value enum. An earlier draft reserved a third value,
`"overlay"`, for a membership class; at the pinned revision **zero effects qualified for it**,
which was the tell that the model was wrong, not a footnote to keep. It has been removed, not
deprecated (spec 028, reopen correction 3).

- **`object`** = the effect renders its own independent 3D scene rather than redrawing the live
  DOM. **Confirmed at the pinned revision from the upstream project's own component
  documentation**, which states these three effects run their 3D/shader work independently of the
  live-DOM draw path — a **class-level confirmation** (the documentation states it once, for the
  class of three), not a per-file trace of each implementation's source. Exactly three effects
  qualify at the pinned revision: **Dithered Object**, **Glass Object**, **Particle Object**.
- **`live-html`** = every other effect (22) — it redraws the live DOM into a canvas surface via
  the browser's origin-trial live-DOM-into-canvas rendering path, rather than owning an
  independent 3D scene.

**To reproduce this at a refresh:** for each effect, check whether the upstream project's own
documentation describes it as an independent 3D scene, or trace its own upstream source directory
(read directly in the upstream repository, never copied here) for an independent 3D-scene
construction. If yes → `object`. If no → `live-html`. A value that cannot be established this way
is **not** guessed from the effect's name — report it as blocked and leave the refresh incomplete
rather than mis-scope the roster.

## `overlayFallback` derivation (mechanical, reproducible)

`overlayFallback: boolean` is **required on every effect**. It answers one question about the
pinned implementation: **does this effect ship a WebGL overlay path that does NOT read the live
DOM** — i.e., a fallback surface it falls back to when the html-in-canvas origin trial is
unsupported?

- **`object` rows are `false` by construction.** A 3D-scene effect renders its own content
  independent of the live-DOM path; it is not "falling back" to anything, so the field does not
  apply to it in the sense the benchmark needs (spec 028 §4).
- **`live-html` rows are `true`, applied as ONE architectural fact at the pin to all 22 rows as a
  class** — not derived per effect. The source is the upstream project's own documentation (its
  README and its docs site, both read at the pinned revision, in our own words here): when the
  live-DOM-into-canvas capability is unsupported, every non-3D effect degrades to a WebGL
  rendering path that does not read the live DOM, and the parts of the effect that can still run
  without that capability still do; separately, the three `object` effects are documented as pure
  3D/shader work that does not participate in that switch at all — the documentation-level basis
  for the `object` family above. Neither source documents a `live-html` effect that is exempt from
  the fallback behavior; the switch is stated as the library's general architecture, not a
  per-component opt-in. **Falsification condition, kept live:** if a later refresh finds upstream
  documenting a `live-html` effect that opts out, that effect's row flips to `false` and the
  change is recorded as a discrepancy here — never silently absorbed into the class claim.
- **Not performed at this pin:** a per-effect read of each of the 22 implementation files,
  confirming the flag file-by-file rather than from the class-level architecture documentation
  above. A future refresh that wants per-effect certainty re-derives this by reading each effect's
  own upstream source directory in the upstream repository directly, never by copying that source
  here.
- **To reproduce this at a refresh:** re-read the upstream README's fallback-behavior section and
  the upstream docs site at the new pinned revision. If the general "everywhere else, WebGL
  overlay" statement still holds for all non-`object` effects, `overlayFallback: true` carries
  forward for the `live-html` set. If upstream ever documents a `live-html` effect that opts out
  of the fallback, that effect's row flips to `false` and the change is recorded as a discrepancy
  in this README, not silently absorbed. **Underivable for any individual effect → report
  BLOCKED, do not infer from the name** (benchmark capability (b), spec 028 §10, selects its
  subject by this field).

## Browser-note discrepancy record (B11)

Milestone/trial facts for `live-html`'s origin-trial dependency come from **current official
Chrome origin-trial documentation**, never from this ledger or the upstream README alone (a pin
governs upstream facts only; it cannot govern a third party's trial status).

- **Official source:** https://developer.chrome.com/blog/html-in-canvas-origin-trial
- **Checked:** 2026-07-25
- **What the official page states (checked 2026-07-25):** the desktop origin trial runs
  **Chrome 148 through 150**; testing requires an early-channel Chrome build with the
  capability's developer flag enabled; the page was last updated 2026-05-19.
- **What the upstream README states, in our own words:** at the pinned revision, the full
  live-DOM-into-canvas experience requires Chrome or Edge 140+ with the capability's developer
  flag enabled, with an origin-trial token available for production sites instead — consistent
  with the official page in substance (a flagged/tokened, version-gated capability) but not the
  same milestone number (140+ vs. the official page's 148–150). This ledger's own research note
  at `docs/research/canvas-ui/README.md:31`, not the upstream README, is the source that first
  recorded "Chrome 148–150" — a correction to the prior text here, which misattributed that
  number to "upstream's own integration-brief research note" (no such number appears in
  `docs/research/canvas-ui/integration-brief.md`).
- **Discrepancy, recorded honestly:** `docs/research/canvas-ui/FABLE-VERDICT-reopen-260725.md`
  §5 flagged, as a **lead, not evidence**, that official Chrome material "already reports an
  extension beyond" 148–150 (to 154). **Re-checking the primary source directly on 2026-07-25
  does not confirm that extension** — the official page currently states 148–150 with no mention
  of 154, and its own "last updated" stamp (2026-05-19) predates this check. Primary-source
  evidence controls over the planning lead: this ledger and
  `knowledge/canvas-effect-direction.md` therefore state **148–150, checked 2026-07-25**, not
  154. If a later refresh finds the official page updated to a different range, record the new
  checked date and the delta here — never silently reconcile it with either prior claim.

## Refresh procedure

1. Re-read the upstream repository at the new revision; re-derive `family` (does the effect
   render an independent 3D scene?) and `overlayFallback` (does the general WebGL-fallback
   architecture still hold for `live-html` effects?) per the derivation rules above.
2. Re-fetch the official Chrome origin-trial documentation and update the browser-note
   discrepancy record with a fresh `checked:` date, regardless of whether the milestone range
   changed.
3. Update `revision` and `captured` in `catalog.json`.
4. Run `ui knowledge effect-matrix` and diff its output against
   `knowledge/canvas-effect-direction.md`'s matrix. New slugs arrive as rows with empty prose
   cells that `ui knowledge check` (`effect-catalog-field-empty`) refuses to let ship until a
   human writes them; removed slugs surface as `effect-catalog-slug-unknown`/`slug-missing`.
5. Never write to the `references` symlink's `canvas-ui/` subdirectory — that path is a
   machine-local symlink into a private corpus, out of every tracked gate (B10). This ledger is
   the only roster a refresh may update.

**Refresh ownership and cadence are an open owner decision** (spec 028 §12.2); the
`effect-catalog-stale` warning (6 months) is a placeholder cadence until the owner sets one.
