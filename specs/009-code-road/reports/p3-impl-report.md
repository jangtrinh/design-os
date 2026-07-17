# Phase 03 — The vocabulary — implementation report

Branch: `spec009/p3-vocabulary` (off `spec009/integration`, which carries P1 + P2 merged).

**Update (round 2, post-audit):** the Art V/Opus audit verified gates independently and confirmed
the two hvs bugs (below) were exactly what the live-run mandate exists for. It then found a real
bug in *my* D6 rule, not in dana's data: stripping a "redundant category prefix" silently merged
two genuinely different declared custom properties (`--gray-900` and `--color-gray-900`) into one
path, collapsing the two-tier structure `token-taxonomy.md:110` mandates. The coordinator deleted
the strip rule on the integration branch (correcting `phase-03-the-vocabulary.md` D6 and
`usecases.md` UC-03) and asked me to apply the same fix here, keep the collision guard (now firing
only on genuine sanitization collisions), and re-run the full LIVE block on all three projects —
dana's two files combined is the one that must now succeed. See "Round 2 — D6 correction" below
for what changed and the re-run numbers; the original round-1 sections are kept for the record but
superseded where they conflict.

## What changed (round 1, superseded on D6 — see round 2 below)

**New (all ≤ 200 lines, Art IX):**
- `src/core/css-selector-blocks.ts` (86 ln) — a brace-nesting selector-block scanner, NOT a CSS
  parser: "which selector immediately encloses byte offset N?" Split out of
  `designmd-token-extractor.ts` to keep that file near budget. Handles comments (blanked, same
  length), and top-level `@import "tailwindcss";`-style semicolon-terminated at-rules (a real bug
  found live on hvs — see below). For HTML sources, scans only inside `<style>…</style>` regions
  so markup/script braces before the first rule can't corrupt the first selector (found live on
  the extractor's own fixture, `sample.html`).
- `src/core/css-selector-mode.ts` (44 ln) — D2's selector→mode table. `:root`/`@theme`/`html`/
  `body` → base; `[data-theme="X"]` → `mode.X`; `.dark` → `mode.dark`;
  `@media (prefers-color-scheme: dark)` → `mode.dark`; anything else → unmapped. Handles a
  comma-separated compound selector list as ONE declaration applying to several modes at once —
  measured live on dana: `[data-theme="dark"],\n[data-theme="classic"],\n.dark { … }` is a single
  block covering 2 distinct modes (`.dark` and `[data-theme="dark"]` both mean `dark`). This case
  is not in the phase file's D2 table; found reading real data, not guessed.
- `src/core/css-token-ingest.ts` (200 ln) — D4/D6, pure. `ingestCssTokens(customProperties)` →
  `{tree, stats, unverified}`. Groups by name, computes each name's own `{category, leaf, $type}`
  (type from the value when a literal exists among its declarations, else a name-hint fallback for
  alias-only names — the alias's OWN path, not inherited from its target, mirroring
  `figma-ds-tokens.ts`'s `resolveType`/`pathOf` split), checks all names for a leaf collision
  before emitting anything, then per name: unmapped-selector declarations are always recorded
  (never silently dropped); no base entry → recorded unverified, not promoted (D2); base resolves
  (literal or alias-string); each mode resolves the same way into `$extensions`. Reuses
  `inferToken` (token-import.ts) and `sanitizeSeg` (figma-ds-tokens.ts) — Insight 5's "reuse it,"
  Art IV. **Round 1 shipped a prefix-strip step here that round 2 deleted — see below.**
- `src/commands/ingest-css-ds.ts` (137 ln) — the command shell, I/O boundary only, mirrors
  `ingest-figma-ds.ts`'s split. Writes `<out>/tokens.json` only (DTCG, unsealed) — no
  `component-registry.json`/`DESIGN.md` (see "Scope decisions" below).
- `tests/css-token-ingest.test.ts`, `tests/mode-convention.test.ts`, `tests/cmd-ingest-css-ds.test.ts`
  — test names match the phase file verbatim where it named one.

**Modified:**
- `src/core/designmd-token-extractor.ts` (206 → 216 ln) — D1: `CustomPropertyObservation` gains
  `selectors: string[]`, a parallel array index-aligned with `sources` (kept `sources`'s existing
  `"file:Lnn"` shape — it's asserted in 3 existing tests and typed, if unused, in
  `designmd-audit-source-fidelity.ts`'s `TokensJson`). Slightly over the ~200 budget; it was
  already 206 before this phase touched it.
- `src/core/cli-args.ts` (F4) — added `repeatedFlags: Set<string>` to `ParsedArgs`, populated by
  a `setFlag` helper used at all 4 flag-assignment sites. Purely additive; no existing field's
  shape or the scalar `flags` map changed — the narrowest form per the phase file's own guidance.
- `src/commands/designmd-extract-tokens-impl.ts` / `src/commands/designmd.ts` (F4) — `--css`
  passed twice now returns `REPEATED_FLAG` instead of silently keeping only the last value; the
  working comma form (`--css a,b`, pre-existing) is documented in both the flag summary and
  `DESIGNMD_HELP`.
- `src/core/token-model.ts` (D3, 157 → 183 ln) — `sanitizeModeName` + `modeExtensionKey`, the
  shared home for the `$extensions["mode.<name>"]` encoding. `figma-ds-tokens.ts` is untouched
  (forbidden) — it keeps its own local copy; `mode-convention.test.ts` is the Art II check that
  the two independently-implemented emitters still agree byte-for-byte.
- `src/core/token-import.ts` (D5, 64 → 136 ln):
  - **F2** — `inferToken` accepts an alias string (`isAlias`, reused from token-model.ts) and
    infers `$type` from a category/name hint (color dominates when nothing else matches —
    Insight 1). Front door no longer refuses the semantic tier.
  - **F6** — `putCategory` sanitizes `cat`/`name` through `sanitizeSeg` (reused from
    `figma-ds-tokens.ts`) before writing into `dtcg`, so a camelCase source name (`fontSize`)
    can no longer produce a `TOKEN_PATTERN`-illegal token.
  - **Unplanned, required for the phase's own LIVE block to work**: `putCategory` now passes an
    already-DTCG leaf (`isTokenLeaf`, reused from token-model.ts) through as-is, `$extensions`
    included, instead of recursing into its `$value`/`$type` as if they were child token names.
    `onboard.md` §4 already documents "`ui ingest-figma-ds`'s tokens.json still has to go through
    `ui ds import` … to land a manifest," and the phase file says `ingest-css-ds` "emits the same
    portable, unsealed bundle. `ds import` seals it afterwards" — but `ds import`'s importer is
    documented and typed as strictly *flat* (`{category:{name:value}}`), and pushing a DTCG leaf
    through the old code silently created bogus `<cat>.$value`/`<cat>.$type` tokens and dropped
    every `$extensions` mode. This is the shared-layer fix (Art IV) that makes
    `extract-tokens → ingest-css-ds → ds import → ds status` actually work end to end, proven by
    `tests/cmd-ingest-css-ds.test.ts`'s UC-03 seam test. Flagging this clearly since it wasn't
    named in D5's "Related Code Files" — but it's the same file, same commit, and without it the
    phase's own prescribed LIVE block cannot complete.
- `templates/workflows/learn.md` — the "Code" route in step 3 now branches: if the scanned
  `cssFiles` declare `--*` custom properties, run the deterministic C0 compiler
  (`extract-tokens → ingest-css-ds → ds import`) instead of the token-guessing steps of
  `extract.md` (4–7) that the real dogfood needed 102 `change-token` calls to complete; component
  registration still routes to `extract.md` step 8 onward either way. No CSS custom properties →
  unchanged (`extract.md`, full).
- `tests/token-import.test.ts` — one pre-existing test asserted camelCase pass-through
  (`opacityScale` verbatim); updated to the now-sanitized key (F6 changed this on purpose) and a
  new test added for the camelCase→sanitized case explicitly.
- `tests/cmd-ds-import.test.ts`, `tests/cmd-designmd-extract-tokens.test.ts`,
  `tests/designmd-token-extractor.test.ts` — extended per the phase file's test list (see below).

## Round 2 — D6 correction (the strip rule is deleted)

**What was wrong:** round 1's D6 inferred a category from the value, then stripped that category
as a name prefix if present — `--color-gray-900` → strip `color-` → `gray-900`, landing on the
same path as the *actually separate* primitive `--gray-900`. Traced live: dana's own comment says
what `index.css`'s `@theme { --color-gray-900: var(--gray-900); }` is —
`/* --- Base palette registered as Tailwind colors --- */`, a **re-export** so Tailwind can
generate `bg-gray-900`, not a duplicate declaration. dana's real semantic tier lives in names like
`--text-primary: var(--gray-900)` and `--badge-danger-bg: var(--error-700)`, which round 1 never
touched (no prefix to strip). The strip rule was therefore merging two *different* tokens on every
one of the ≥120 `--X`/`--color-X` pairs dana declares — not catching a real ambiguity 120 times,
but manufacturing 120 false ones.

**Fix:** `src/core/css-token-ingest.ts` — `stripRedundantPrefix` deleted. The leaf is now
`sanitizeSeg(name.slice(2))`, verbatim, always. `--gray-900` → `color.gray-900`;
`--color-gray-900` → `color.color-gray-900` (an alias, `$value: "{color.gray-900}"`) — the
source's own name, uglier and correct, not rewritten to look nicer (`learn.md` §3c, SOURCE-grade).
The collision guard (`LEAF_COLLISION`) stays, unchanged in shape, now only reachable via a genuine
sanitization collision — verified with a case-only pair (`--Gray-900` vs `--gray-900`, both
sanitize to `gray-900`) in both `tests/css-token-ingest.test.ts` and
`tests/cmd-ingest-css-ds.test.ts`; still fails loudly with both source lines. File is 200 lines
exactly after the deletion + comment rewrite (down from 197 → briefly 204 → trimmed back to 200).

**Tests updated:** `tests/css-token-ingest.test.ts` (`test_a_redundant_category_prefix_is_stripped_once`
removed — the behavior it tested no longer exists; replaced with a test proving `--gray-900` and
`--color-gray-900` now coexist, and the collision test rewritten to the case-only pair);
`tests/mode-convention.test.ts` (renamed its fixture property from `--color-bg` to `--bg` so the
byte-identical-shape assertion targets `color.bg` on both emitters, unaffected by the strip
removal either way); `tests/cmd-ingest-css-ds.test.ts` (added the coexistence case at the command
level, rewrote the collision-error test to the case-only pair, renamed the UC-03 seam fixture's
properties from `--color-text-primary`/`--color-bg` to `--text-primary`/`--bg` — both forms are
valid CSS, this one just isn't the collision case, so it stays a clean, focused seam test).

**Four gates re-run after this change** — all still green: `npm run typecheck` (clean),
`npm run lint` (clean), `npm run build` (`dist/cli.js` 815.63 KB), `npm test` (134 files, 2019
passed, 4 skipped, 0 failed — 2 more than round 1's 2017, from the new coexistence tests),
`ui knowledge check --json` (`errorCount: 0`).

### Re-run LIVE block — dana-desktop, both files combined (the one that had to succeed)

```
$ node dist/cli.js designmd extract-tokens empty.html --css "dana-tokens.css,index.css" --out t.json
wrote tokens.json (colors: 168, fonts: 0, customProperties: 567)

$ node dist/cli.js ingest-css-ds t.json --out out --name dana-web --json
{"ok":true,"data":{"stats":{"primitives":186,"semantics":228,"skipped":15}}}

$ node dist/cli.js ds import out/tokens.json --dir out --name dana-web --json
{"ok":true,"data":{"imported":414,"skipped":0,
  "byType":{"color":362,"dimension":39,"fontFamily":2,"number":11},"categories":4}}

$ node dist/cli.js ds status --dir out --json
{"ok":true, ...}                                                        # exits 0

$ node dist/cli.js tokens compile out/design/design.tokens.json --target css | grep -i gray-900
  --color-color-gray-900: #181818;
  --color-gray-900: #181818;
```

**No collision. Both files ingest together, `ds status` exits 0** — the outcome the phase file's
"Expected" section originally described and round 1 could not reach. The grep shows both compiled
names: `--color-gray-900` (from dana-tokens.css's primitive `--gray-900`) and
`--color-color-gray-900` (from index.css's `--color-gray-900`, an alias resolved through
`{color.gray-900}` to the same literal) — exactly the "two different declared properties, same
resolved value" shape the coordinator traced. Both compile to `#181818` because dana's `@theme`
re-export is a faithful mirror, not a divergent value — that's dana's data, correctly preserved.

**Token count vs the dogfood's 286**: 414 imported (186 primitive + 228 semantic) + 15 unverified
= 429 unique custom-property **names** out of 567 total `(name, value)` pairs across both files.
429 vs 286 — **explaining the gap, not tuning to it**: round 1's single-file number (263) undercounted
because it excluded index.css entirely (blocked by the false collision); this run is the first time
both files' real vocabulary is visible together, and 429 is close to 1.5× the dogfood's hand-built
286. The dogfood was almost certainly working at a *coarser grain* — 102 manual `change-token`
calls plausibly targeted semantic roles once each rather than also re-declaring the Tailwind
`--color-*` re-export layer as separate tokens (which this mechanism now correctly keeps distinct,
per the corrected D6). The 15 unverified are the same composite/shadow/duration values as round 1
(unchanged by the D6 fix — it only touches naming, not value resolvability).

### Re-run — traicaybentre and hvs (unaffected, confirmed)

Neither project has colliding `--X`/`--<category>-X` pairs (traicaybentre's traicaybentre
`@theme inline` block declares literals directly with no re-export layer; hvs's primitives are
already uniquely prefixed, `--hvs-brand` etc.), so round 2's fix changes nothing about either:

```
# traicaybentre
$ node dist/cli.js ingest-css-ds t.json --out out --name traicaybentre --json
{"stats":{"primitives":17,"semantics":0,"skipped":2}}
$ node dist/cli.js ds import out/tokens.json --dir out --name traicaybentre --json
{"imported":17}
$ node dist/cli.js ds status --dir out --json
{"ok":true}                                                              # exits 0

# hvs
$ node dist/cli.js ingest-css-ds t2.json --out out2 --name hvs --json
{"stats":{"primitives":14,"semantics":7,"skipped":11}}
$ node dist/cli.js ds import out2/tokens.json --dir out2 --name hvs --json
{"imported":21}
$ node dist/cli.js ds status --dir out2 --json
{"ok":true}                                                              # exits 0
```

Identical to round 1's numbers — confirms the fix is scoped to the naming collision, doesn't touch
value resolution, mode assembly, or the two projects that never triggered the bug.

## Scope decisions (stated, not discovered)

- **`ingest-css-ds` writes only `tokens.json`.** D4 describes it as mirroring
  `ingest-figma-ds`'s 3-file bundle, but this phase's Success Criteria never mention
  `component-registry.json`/`DESIGN.md`, and `ds import` already creates an empty registry when
  it seals — nothing downstream needs a registry file from this command. Not built.
- **No DESIGN.md from `ingest-css-ds`.** The Risk Assessment table asks me to "confirm the
  code road's bundle reaches" `figma-ds-designdoc.ts:22`'s mode rendering. It does not, by
  choice: `buildDesignDoc`'s prose is hardcoded Figma-specific ("Ingested from an existing Figma
  design system via `ui ingest-figma-ds`") — reusing it verbatim for a CSS-sourced DS would be a
  false claim (Art VIII), and `figma-ds-designdoc.ts` isn't in this phase's "Modify" list. Left
  as an **open gap**, not fixed: nothing renders `$extensions["mode.*"]` for the code road today.
  Per the coordinator: record this, don't do it — it's a real question but touches the Figma
  road's shipped semantics and needs its own decision, not a Phase 3 side-effect.
- **D7 (parallel hardcoded gray ramps) is a narrative finding, not a computed field.** The spec
  says "record the finding," "no detector" — I did not add a `findings[]` array to the ingest
  result; the finding is written up below instead, per D7's own framing.

## Four gates (final, post round-2)

- `npm run typecheck` — **PASS** (no output, exit 0).
- `npm run lint` — **PASS** (no output, exit 0).
- `npm run build` — **PASS** (`dist/cli.js` 815.63 KB, tsup build success).
- `npm test` — **PASS**: 134 test files, 2019 passed, 4 skipped (fixture-gated, absent on this
  machine — pre-existing, unrelated to this phase), 0 failed.
- `ui knowledge check --json` — **PASS** (`errorCount: 0, warningCount: 0`).

## LIVE runs (Art III) — final numbers, all three projects

### dana-desktop — both files combined (the required run — see "Round 2" above for the full
transcript and count reconciliation)

`ds status` exits 0. 414 tokens imported (186 primitive + 228 semantic), 15 composite values
correctly left unverified. `--color-gray-900` and `--color-color-gray-900` both compile, distinct
paths, both correct.

The phase file's literal LIVE block also writes `--css` **twice** (a repeated flag). Run
literally, that still hits F4's guard on purpose (unchanged by round 2):

```
$ node dist/cli.js designmd extract-tokens empty.html --css dana-tokens.css --css index.css --out t.json
{"ok":false,"error":{"code":"REPEATED_FLAG",
  "message":"'--css' was passed more than once — … Combine multiple files into one flag instead:
  --css a.css,b.css"}}
```

The comma-joined form (documented, pre-existing) is what every run above used.

### dana-desktop — `dana-tokens.css` alone (443 ln, for isolation/comparison only)

```
$ node dist/cli.js designmd extract-tokens empty.html --css dana-tokens.css --out t.json
wrote tokens.json (colors: 119, fonts: 0, customProperties: 324)
$ node dist/cli.js ingest-css-ds t.json --out out --name dana-web --json
{"stats":{"primitives":176,"semantics":72,"skipped":15}}
$ node dist/cli.js ds import out/tokens.json --dir out --name dana-web --json
{"imported":248}
$ node dist/cli.js ds status --dir out --json
{"ok":true}                                                              # exits 0
$ node dist/cli.js tokens compile out/design/design.tokens.json --target css | grep -i gray-900
  --color-gray-900: #181818;
```

56 tokens carry `$extensions` modes here (e.g. `color.surface-content`). Unaffected by round 2
(no colliding names in this file alone) — kept as the isolation baseline against the combined run.

### traicaybentre (single-theme site — 445 ln `src/app/globals.css`, Tailwind v4 `@theme inline`)

Note: the phase's context box cites "61 css-vars, 50 :root, 125 data-theme" for traicaybentre;
the product's real CSS as it stands today has 0 `:root`/`data-theme` occurrences (a single
`@theme inline` block, no dark mode) — the repo has evidently changed since that number was
measured. Reporting what is actually on disk now, not tuning to the older number.

```
$ node dist/cli.js designmd extract-tokens empty.html --css src/app/globals.css --out t.json
wrote tokens.json (colors: 17, fonts: 1, customProperties: 19)
$ node dist/cli.js ingest-css-ds t.json --out out --name traicaybentre --json
{"stats":{"primitives":17,"semantics":0,"skipped":2}}
$ node dist/cli.js ds import out/tokens.json --dir out --name traicaybentre --json
{"imported":17,"skipped":0,"byType":{"color":17}}
$ node dist/cli.js ds status --dir out --json
{"ok":true}                                                              # exits 0
```

No collision, no modes (single theme) — confirms the mapper is not dana-shaped: it degrades
cleanly to "all primitives, no modes" on a project with neither.

### hvs (112 CSS files found by a raw `find`; `ui scan --cwd` reports 5 in-scope — used those,
since a raw `find` pulled in a **vendored Claude Code skill's own CSS**
(`.claude/skills/markdown-novel-viewer/assets/styles/novel-theme-variables.css`) that
`ui scan`'s `SKIP_DIRS` already correctly excludes; using it would have been testing a bug in my
own test setup, not the mapper)

```
$ node dist/cli.js designmd extract-tokens empty.html --css "<5 scan-reported files>" --out t.json
wrote tokens.json (colors: 3, fonts: 6, customProperties: 35)
$ node dist/cli.js ingest-css-ds t.json --out out --name hvs --json
{"stats":{"primitives":14,"semantics":7,"skipped":11}}
$ node dist/cli.js ds import out/tokens.json --dir out --name hvs --json
{"imported":21,"skipped":0,"byType":{"color":17,"dimension":3,"duration":1}}
$ node dist/cli.js ds status --dir out --json
{"ok":true}                                                              # exits 0
```

Also note: the spec's context box cites "1162 css-vars" for hvs; the real product CSS (excluding
`node_modules`/`.next`/vendored skill assets) has far fewer declarations — same "report what's
actually there" note as traicaybentre.

**Two real bugs found only by running on hvs, both fixed, both covered by new tests (unaffected
by the round-2 D6 correction — these are selector/value bugs, not naming):**
1. `hvs/app/globals.css` opens with `@import "tailwindcss";` before its first `:root {` block. My
   selector scanner had no concept of a semicolon-terminated top-level statement, so it captured
   the whole `@import …;` line as part of `:root`'s "selector" text
   (`"@import 'tailwindcss';\n\n:root"` ≠ `":root"`), which then failed every `classifySelector`
   match and dumped dozens of otherwise-good base declarations into `unverified` as "unrecognized
   selector." Fixed in `css-selector-blocks.ts`: a top-level `;` (depth 0) now also resets the
   pending-selector segment.
2. `--hvs-duration: 400ms` was reported unverified ("could not resolve value '400ms'") because
   `resolveValue` called `inferToken("", "", value)` — dropping the property's own name, so
   `DURATION_CAT_RE` (which needs "duration"/"motion"/etc. in the name) never got a chance to
   match a duration STRING (only a bare *number* in a duration-hinted category gets the `ms`
   suffix added automatically). Fixed by threading the leaf name through `resolveValue`.

The HTML-preamble variant of finding 1 (markup before the first `<style>` block, e.g. this
repo's own `sample.html` fixture) was caught by my own unit test before the live run, and fixed
the same way (scan only inside `<style>…</style>` for HTML sources).

## Whether D6's collision rule fired

**Round 1: yes, immediately, on dana's two files combined — but round 2's audit found this was
the guard catching MY bad rule, not dana's bad data (the ≥120 `--X`/`--color-X` pairs are genuinely
different declared properties, not duplicates).** After deleting the prefix-strip, the guard does
**not** fire on any of the three projects' real data (dana combined, dana alone, traicaybentre,
hvs). It is exercised only by a synthetic case-only-difference pair in the test suite
(`--Gray-900` vs `--gray-900`) — proving it still works, without dana ever needing to hit it.

## D7 — the parallel-hardcoded-set finding (recorded, not detected)

dana-tokens.css's semantic-dark block (`[data-theme="dark"], [data-theme="classic"], .dark { … }`)
and index.css's three per-theme blocks both redeclare full 11-step gray/blue/error/etc. ramps as
literal hex per theme, rather than one semantic layer aliasing shared primitives —
`token-taxonomy.md:121`'s named DON'T. This phase ingests it faithfully (each theme's literal
value lands correctly in its own `$extensions["mode.<name>"]`) and records the observation here,
per D7 — no detector was built.

## Deviations from the phase file (stated, not discovered by a future reader)

1. **D1's `sources` shape choice**: added a parallel `selectors: string[]` field rather than
   changing `sources` to `Array<{path,line,selector}>` — `sources`'s flat string form is asserted
   in 3 existing tests. This was the phase file's own "or" alternative.
2. **F4's form choice**: hard-error on repeat + the comma form, not array-valued flags — the
   phase file's own "acceptable and lazier" option.
3. **The `isTokenLeaf` pass-through fix in `token-import.ts`** (unplanned, detailed above) — the
   phase's own LIVE block cannot complete without it.
4. **D6 itself was corrected mid-phase** (round 2, this report) — the prefix-strip rule as
   originally specified silently merged distinct declared properties; deleted per the
   coordinator's audit, spec corrected on the integration branch. See "Round 2" above.
5. **`ingest-css-ds` writes only `tokens.json`**, not the 3-file bundle `ingest-figma-ds` writes —
   stated in "Scope decisions" above.

## Unresolved questions

- Should `figma-ds-designdoc.ts`'s DESIGN.md prose be parameterized (source-agnostic wording) so
  a future phase can safely reuse `buildDesignDoc` for the code road, or does the code road get
  its own doc builder? Left open per the coordinator — out of Phase 3 scope, touches the Figma
  road's shipped semantics, needs its own decision. No DESIGN.md ships from `ingest-css-ds` this
  phase.

**Status:** DONE
**Summary:** CSS custom properties now compile to a DTCG vocabulary with base+mode tiers via
`ui ingest-css-ds` + a `ds import` fix. D6's prefix-strip rule (round 1) was found by the Art V
audit to silently merge distinct declared properties; deleted (round 2) — leaf names are now the
source's own name, verbatim. Re-verified on all three real projects post-fix: dana's two files
combined now succeed end-to-end (414 tokens, `ds status` exits 0 — the run round 1 could not
complete), traicaybentre and hvs unchanged (they never had the false-collision shape). Two real
selector/value bugs (semicolon-terminated at-rules, duration-string resolution) were found and
fixed via the hvs live run and are covered by tests. Four gates green throughout both rounds.
**Concerns/Blockers:** None. One follow-up worth a human decision (DESIGN.md generation for the
code road) is recorded above per the coordinator's instruction, not actioned this phase.
